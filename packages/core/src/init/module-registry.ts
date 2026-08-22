import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { StaticModule, ModRefId } from '#decorators/module-decorator-options.js';
import type { BaseNormalizedModuleMeta, NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { Provider } from '#di/top/types-and-models.js';
import { resolveForwardRef, type ForwardRefFn } from '#di/forward-ref.js';
import { isRootModule } from '#decorators/type-guards.js';
import { clearDebugClassNames, getDebugClassName } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from '#init/module-normalizer.js';
import { ModuleAspectPropagator } from '#init/module-aspect-propagator.js';
import { ModuleIdNotFound, NormalizationFailure, MissingRootDecorator, MeaninglessModuleMetadata } from '#errors';
import { ModuleInjectorStore, type ModuleId } from '#init/module-injector-store.js';
import { ModuleGraph } from '#init/module-graph.js';

export type ModulesMap = Map<ModRefId, NormalizedModuleMeta>;
export type ModulesMapId = Map<string, ModRefId>;
export { type ModuleId };

/**
 * Recursively scans metadata attached to module classes via decorators, normalizes and validates it.
 * As a result of this process, a mapping is created between the module reference (`ModRefId`) and its normalized metadata.
 * Essentially, `ModRefId` is the form in which a module is passed in the `imports` array — that is,
 * either the static module class itself (`StaticModule`) or a dynamic module configuration object (`DynamicModule`).
 *
 * `ModuleRegistry` also provides access to the `injectorStore` for module-level DI injectors,
 * delegates application-scoped providers and graph state to `ModuleGraph`,
 * and coordinates aspect propagation via `ModuleAspectPropagator`.
 */
export class ModuleRegistry {
  protected rootDeclaredInDir?: string;
  protected propsWithModules = [
    'importedStaticModules',
    'importedDynamicModules',
    'exportedStaticModules',
    'exportedDynamicModules',
  ] satisfies (keyof BaseNormalizedModuleMeta)[];
  get providersPerApp(): readonly Provider[] {
    return this.moduleGraph.providersPerApp;
  }
  /**
   * Returns the active mapping between module reference IDs (`ModRefId`) and their {@link NormalizedModuleMeta}.
   */
  get modulesMap(): ReadonlyMap<ModRefId, NormalizedModuleMeta> {
    return this.moduleGraph.normalizedMetaMap;
  }

  readonly injectorStore: ModuleInjectorStore;

  constructor(
    protected systemLogMediator: SystemLogMediator,
    protected moduleNormalizer: ModuleNormalizer = new ModuleNormalizer(systemLogMediator),
    protected moduleGraph: ModuleGraph = new ModuleGraph(),
    injectorStore?: ModuleInjectorStore,
  ) {
    this.injectorStore = injectorStore || new ModuleInjectorStore(() => this.moduleGraph.moduleIdMap);
  }

  /**
   * Resets internal scan state and initiates recursive metadata resolution for all imported feature modules in the dependency graph.
   */
  scanRootModule(appModule: StaticModule): NormalizedModuleMeta {
    if (!isRootModule(appModule)) {
      throw new MissingRootDecorator(appModule.name);
    }
    this.moduleGraph.clear();
    this.rootDeclaredInDir = undefined;

    const normalizedModuleMeta = this.normalizeMeta(appModule);
    if (normalizedModuleMeta.declaredInDir !== '.') {
      this.rootDeclaredInDir = normalizedModuleMeta.declaredInDir;
    }

    this.scanModule(appModule, normalizedModuleMeta);
    this.moduleGraph.setRootModuleId(appModule);
    this.propagateAspectsAndValidate(appModule);
    this.injectorStore.clear();
    clearDebugClassNames();
    return normalizedModuleMeta;
  }

  /**
   * Recursively normalizes and registers metadata for a specified static or dynamic module reference.
   *
   * Traverses module dependencies (`imports`, `exports`, and modules discovered via specialized module aspects),
   * populates the module dependency graph (`this.moduleGraph`), and stores normalized metadata.
   *
   * Only processes each module's own decorators. Cross-module aspect propagation is handled
   * separately by {@link ModuleAspectPropagator} (invoked in {@link propagateAspectsAndValidate}) after the entire module tree has been scanned.
   */
  protected scanModule(modRefId: ModRefId | ForwardRefFn<ModRefId>, normalizedModuleMeta?: NormalizedModuleMeta) {
    modRefId = resolveForwardRef(modRefId);
    normalizedModuleMeta ??= this.normalizeMeta(modRefId);

    const children = new Set<ModRefId>(this.getModulesToScan(normalizedModuleMeta));
    this.moduleGraph.setChildren(normalizedModuleMeta.modRefId, children);

    for (const child of children) {
      if (this.moduleGraph.isScanning(child) || this.moduleGraph.isScanned(child)) {
        continue;
      }
      this.moduleGraph.beginScanning(child);
      this.scanModule(child);
      this.moduleGraph.finishScanning(child);
    }

    if (normalizedModuleMeta.id) {
      this.systemLogMediator.moduleHasId(this, normalizedModuleMeta.id);
    }
    this.moduleGraph.setMeta(modRefId, normalizedModuleMeta);

    return normalizedModuleMeta;
  }

  /**
   * Delegates module decorator reflection and metadata normalization to {@link ModuleNormalizer}.
   * On failure, enriches the error message with the full dependency scan trajectory (e.g., `ModuleA -> ModuleB`).
   */
  protected normalizeMeta(modRefId: ModRefId): NormalizedModuleMeta {
    try {
      return this.moduleNormalizer.normalize(modRefId, this.rootDeclaredInDir);
    } catch (err: unknown) {
      const moduleName = getDebugClassName(modRefId);
      let path = [...this.moduleGraph.scanningModules].map((id) => getDebugClassName(id)).join(' -> ');
      path = this.moduleGraph.scanningModules.size > 1 ? `${moduleName} (${path})` : `${moduleName}`;
      throw new NormalizationFailure(path, err as Error);
    }
  }

  protected getModulesToScan(normalizedModuleMeta: NormalizedModuleMeta): ModRefId[] {
    const importsOrExports: ModRefId[] = [];
    normalizedModuleMeta.moduleAspectsMap.forEach((moduleAspect, decoratorId) => {
      const meta = normalizedModuleMeta.normalizedAspectsMetaMap.get(decoratorId);
      if (meta) {
        importsOrExports.push(...moduleAspect.getModulesToScan(meta));
      }
    });

    this.propsWithModules.forEach((p) => importsOrExports.push(...normalizedModuleMeta[p]));
    return importsOrExports;
  }

  protected propagateAspectsAndValidate(modRefId: ModRefId) {
    const propagator = new ModuleAspectPropagator(this.moduleNormalizer.metaProcessor, this.moduleGraph, this.propsWithModules);
    propagator.applyHostStaticAspectOptions((modulesToScan) => this.scanNewlyAddedModules(modulesToScan));

    const rootModule = this.moduleGraph.moduleIdMap.get('root') || resolveForwardRef(modRefId);
    propagator.propagateAspectsTopDown(rootModule);
    propagator.accumulateAspectsBottomUp(rootModule);
    this.checkModulesHaveMeaningfulMetadata();
  }

  protected scanNewlyAddedModules(modulesToScan: Set<ModRefId>) {
    for (const input of modulesToScan) {
      if (!this.moduleGraph.isScanned(input)) {
        this.moduleGraph.beginScanning(input);
        this.scanModule(input);
        this.moduleGraph.finishScanning(input);
      }
    }
  }

  /**
   * Validates all modules in the active module graph, verifying that no module possesses completely empty metadata
   * (which typically indicates missing module decorators or invalid import structures).
   */
  protected checkModulesHaveMeaningfulMetadata() {
    this.moduleGraph.normalizedMetaMap.forEach((meta) => this.checkFeatureModuleHasMeaningfulMetadata(meta));
  }

  protected checkFeatureModuleHasMeaningfulMetadata(normalizedModuleMeta: NormalizedModuleMeta) {
    if (
      !isRootModule(normalizedModuleMeta) &&
      !normalizedModuleMeta.moduleAspectsMap.size &&
      !normalizedModuleMeta.exportedProvidersPerMod.length &&
      !normalizedModuleMeta.exportedMultiProvidersPerMod.length &&
      !normalizedModuleMeta.exportedStaticModules.length &&
      !normalizedModuleMeta.providersPerApp.length &&
      !normalizedModuleMeta.exportedDynamicModules.length &&
      !normalizedModuleMeta.exportedExtensionProviders.length &&
      !normalizedModuleMeta.extensionProviders.length
    ) {
      throw new MeaninglessModuleMetadata(normalizedModuleMeta.name);
    }
  }

  /**
   * Returns a mutable {@link NormalizedModuleMeta} from the active workspace mapping (`this.moduleGraph.normalizedMetaMap`).
   * Therefore, if you retrieve a {@link NormalizedModuleMeta} using this method and subsequently modify it,
   * the next call will return the already modified {@link NormalizedModuleMeta}.
   *
   * @param moduleId Can be the string alias `'root'`, an explicit module ID, or a `ModRefId` reference.
   * @param throwErrIfNotFound If set to `true`, throws a {@link ModuleIdNotFound} error when the module cannot be resolved.
   */
  getNormalizedModuleMeta(moduleId: ModuleId, throwErrIfNotFound: true): NormalizedModuleMeta;
  getNormalizedModuleMeta(moduleId: ModuleId, throwErrIfNotFound?: false): NormalizedModuleMeta | undefined;
  getNormalizedModuleMeta(moduleId: ModuleId, throwErrIfNotFound?: boolean) {
    let normalizedModuleMeta: NormalizedModuleMeta | undefined;
    if (typeof moduleId == 'string') {
      const moduleIdMap = this.moduleGraph.moduleIdMap.get(moduleId);
      if (moduleIdMap) {
        normalizedModuleMeta = this.moduleGraph.normalizedMetaMap.get(moduleIdMap);
      }
    } else {
      normalizedModuleMeta = this.moduleGraph.normalizedMetaMap.get(moduleId);
    }

    if (throwErrIfNotFound && !normalizedModuleMeta) {
      let moduleName: string;
      if (typeof moduleId == 'string') {
        moduleName = moduleId;
      } else {
        moduleName = getDebugClassName(moduleId) || 'unknown';
      }
      throw new ModuleIdNotFound(moduleName);
    }

    return normalizedModuleMeta;
  }
}
