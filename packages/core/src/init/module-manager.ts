import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { AnyObj } from '#types/mix.js';
import type { StaticModule, ModRefId } from '#decorators/module-decorator-options.js';
import type { BaseNormalizedModuleMeta, NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { Provider } from '#di/top/types-and-models.js';
import type { Injector } from '#di/injector.js';
import { resolveForwardRef, type ForwardRefFn } from '#di/forward-ref.js';
import { isRootModule } from '#decorators/type-guards.js';
import { clearDebugClassNames, getDebugClassName } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from '#init/module-normalizer.js';
import { ModuleMetaProcessor } from '#init/module-meta-processor.js';
import { ModuleAspectPropagator } from '#init/module-aspect-propagator.js';
import { ModuleIdNotFound, NormalizationFailure, MissingRootDecorator, MeaninglessModuleMetadata } from '#errors';
import { getModule } from '#utils/get-module.js';

export type ModulesMap = Map<ModRefId, NormalizedModuleMeta>;
export type ModulesMapId = Map<string, ModRefId>;
export type ModuleId = string | ModRefId;

/**
 * Recursively scans metadata attached to module classes via decorators, normalizes it, and validates it.
 * As a result of this process, a mapping is created between the module reference (`ModRefId`) and its normalized metadata.
 * Essentially, `ModRefId` is the form in which a module is passed in the `imports` array — that is,
 * either the static module class itself (`StaticModule`) or a dynamic module configuration object (`DynamicModule`).
 *
 * `ModuleManager` also stores module-level DI injectors, manages application-scoped providers,
 * and coordinates aspect propagation via `ModuleAspectPropagator`.
 */
export class ModuleManager {
  protected injectorPerModMap = new Map<ModRefId, Injector>();
  protected normalizedMetaMap: ModulesMap = new Map();
  protected moduleIdMap = new Map<'root' | (string & {}), ModRefId>();
  protected scanningModules = new Set<ModRefId>();
  protected scannedModules = new Set<ModRefId>();
  protected propsWithModules = [
    'importedStaticModules',
    'importedDynamicModules',
    'exportedStaticModules',
    'exportedDynamicModules',
  ] satisfies (keyof BaseNormalizedModuleMeta)[];
  #childrenMap = new Map<ModRefId, Set<ModRefId>>();
  #providersPerApp: Provider[] = [];
  /**
   * Represents the module dependency graph.
   *
   * It maps `ModRefId` to a `Set` of `ModRefId` of its child modules
   * (modules that it imports, exports, or includes via specialized module aspects).
   * This graph is built during the module scanning phase and is subsequently used
   * for recursive traversal, such as propagating parent module aspects to child modules.
   */
  protected get childrenMap() {
    return this.#childrenMap;
  }
  protected set childrenMap(val: Map<ModRefId, Set<ModRefId>>) {
    this.#childrenMap = val;
  }

  get providersPerApp(): Provider[] {
    return this.#providersPerApp;
  }
  protected set providersPerApp(val: Provider[]) {
    this.#providersPerApp = val;
  }

  /**
   * Returns the active mapping between module reference IDs (`ModRefId`) and their {@link NormalizedModuleMeta}.
   */
  get modulesMap(): ReadonlyMap<ModRefId, NormalizedModuleMeta> {
    return this.normalizedMetaMap;
  }

  /**
   * Returns the internal registry mapping module reference IDs (`ModRefId`) to their instantiated module-level injectors.
   */
  get injectorsPerMod(): ReadonlyMap<ModRefId, Injector> {
    return this.injectorPerModMap;
  }

  constructor(
    protected systemLogMediator: SystemLogMediator,
    protected moduleNormalizer: ModuleNormalizer = new ModuleNormalizer(),
    protected metaProcessor: ModuleMetaProcessor = new ModuleMetaProcessor(),
  ) {}

  /**
   * Resets internal scan state and initiates recursive metadata resolution for all imported feature modules in the dependency graph.
   */
  scanRootModule(appModule: StaticModule): NormalizedModuleMeta {
    if (!isRootModule(appModule)) {
      throw new MissingRootDecorator(appModule.name);
    }
    this.providersPerApp = [];
    this.childrenMap.clear();
    const normalizedModuleMeta = this.scanModule(appModule);
    this.moduleIdMap.set('root', appModule);
    this.propagateAspectsAndValidate(appModule);
    this.injectorPerModMap.clear();
    this.scanningModules.clear();
    this.scannedModules.clear();
    clearDebugClassNames();
    return normalizedModuleMeta;
  }

  /**
   * Recursively normalizes and registers metadata for a specified static or dynamic module reference.
   *
   * Traverses module dependencies (`imports`, `exports`, and modules discovered via specialized module aspects such as `appends`
   * or `controllers`), builds the module dependency graph (`this.childrenMap`), accumulates global providers into `providersPerApp`,
   * and stores normalized metadata.
   *
   * Only processes each module's own decorators. Cross-module aspect propagation is handled
   * separately by {@link ModuleAspectPropagator} (invoked in {@link propagateAspectsAndValidate}) after the entire module tree has been scanned.
   */
  protected scanModule(modRefId: ModRefId | ForwardRefFn<ModRefId>) {
    modRefId = resolveForwardRef(modRefId);
    const normalizedModuleMeta = this.normalizeMeta(modRefId);

    const children = new Set<ModRefId>();
    this.childrenMap.set(normalizedModuleMeta.modRefId, children);

    for (const child of this.getModulesToScan(normalizedModuleMeta)) {
      children.add(child);
      if (this.scanningModules.has(child) || this.scannedModules.has(child)) {
        continue;
      }
      this.scanningModules.add(child);
      this.scanModule(child);
      this.scanningModules.delete(child);
      this.scannedModules.add(child);
    }

    this.registerModuleId(normalizedModuleMeta, modRefId);
    this.accumulateProvidersPerApp(normalizedModuleMeta);
    this.setNormalizedModuleMeta(modRefId, normalizedModuleMeta);

    return normalizedModuleMeta;
  }

  protected getModulesToScan(normalizedModuleMeta: NormalizedModuleMeta): ModRefId[] {
    const importsOrExports: ModRefId[] = [];
    normalizedModuleMeta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
      const meta = normalizedModuleMeta.normalizedAspectMetaMap.get(decoratorId);
      if (meta) {
        importsOrExports.push(...moduleAspect.getModulesToScan(meta));
      }
    });

    this.propsWithModules.forEach((p) => importsOrExports.push(...normalizedModuleMeta[p]));
    return importsOrExports;
  }

  protected registerModuleId(normalizedModuleMeta: NormalizedModuleMeta, modRefId: ModRefId) {
    if (normalizedModuleMeta.id) {
      this.moduleIdMap.set(normalizedModuleMeta.id, modRefId);
      this.systemLogMediator.moduleHasId(this, normalizedModuleMeta.id);
    }
  }

  protected accumulateProvidersPerApp(normalizedModuleMeta: NormalizedModuleMeta) {
    const providersPerApp = isRootModule(normalizedModuleMeta) ? [] : normalizedModuleMeta.providersPerApp;
    this.providersPerApp.push(...providersPerApp);
  }

  protected getMeta(modRefId: ModRefId): NormalizedModuleMeta | undefined {
    return this.normalizedMetaMap.get(modRefId);
  }

  protected setNormalizedModuleMeta(modRefId: ModRefId, normalizedModuleMeta: NormalizedModuleMeta) {
    this.normalizedMetaMap.set(modRefId, normalizedModuleMeta);
  }

  protected get activeMetaMap() {
    return this.normalizedMetaMap;
  }

  protected propagateAspectsAndValidate(modRefId: ModRefId) {
    const propagator = new ModuleAspectPropagator(
      this.metaProcessor,
      this.activeMetaMap,
      this.childrenMap,
      this.scannedModules,
      this.propsWithModules,
    );
    propagator.applyHostAspectOptions((modulesToScan) => this.scanNewlyAddedModules(modulesToScan));

    const rootModule = this.moduleIdMap.get('root') || resolveForwardRef(modRefId);
    propagator.propagateAspectsTopDown(rootModule);
    propagator.accumulateAspectsBottomUp(rootModule);
    this.checkModulesHaveMeaningfulMetadata();
  }

  protected scanNewlyAddedModules(modulesToScan: Set<ModRefId>) {
    for (const input of modulesToScan) {
      if (!this.scannedModules.has(input)) {
        this.scanningModules.add(input);
        this.scanModule(input);
        this.scanningModules.delete(input);
        this.scannedModules.add(input);
      }
    }
  }

  /**
   * Validates all modules in active registries, verifying that no module possesses completely empty metadata
   * (which typically indicates missing module decorators or invalid import structures).
   */
  protected checkModulesHaveMeaningfulMetadata() {
    this.normalizedMetaMap.forEach(this.checkFeatureModuleHasMeaningfulMetadata);
  }

  protected checkFeatureModuleHasMeaningfulMetadata(normalizedModuleMeta: NormalizedModuleMeta) {
    if (
      !isRootModule(normalizedModuleMeta) &&
      !normalizedModuleMeta.moduleAspectMap.size &&
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
   * Returns a mutable {@link NormalizedModuleMeta} from the active workspace mapping (`this.normalizedMetaMap`).
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
      const moduleIdMap = this.moduleIdMap.get(moduleId);
      if (moduleIdMap) {
        normalizedModuleMeta = this.normalizedMetaMap.get(moduleIdMap);
      }
    } else {
      normalizedModuleMeta = this.normalizedMetaMap.get(moduleId);
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

  /**
   * Registers an instantiated module-level DI {@link Injector} for the specified module reference or ID.
   */
  setInjectorPerMod(moduleId: ModuleId, injectorPerMod: Injector) {
    if (typeof moduleId == 'string') {
      const modRefId = this.moduleIdMap.get(moduleId);
      if (modRefId) {
        this.injectorPerModMap.set(modRefId, injectorPerMod);
      } else {
        throw new ModuleIdNotFound(moduleId);
      }
    } else {
      this.injectorPerModMap.set(moduleId, injectorPerMod);
    }
  }

  /**
   * Retrieves the module-level DI {@link Injector} associated with the given module ID or reference.
   */
  getInjectorPerMod(moduleId: ModuleId, throwErrIfNotFound: true): Injector;
  getInjectorPerMod(moduleId: ModuleId, throwErrIfNotFound?: false): Injector | undefined;
  getInjectorPerMod(moduleId: ModuleId, throwErrIfNotFound?: boolean): Injector | undefined {
    let inj: Injector | undefined;
    if (typeof moduleId == 'string') {
      const modRefId = this.moduleIdMap.get(moduleId);
      if (modRefId) {
        inj = this.injectorPerModMap.get(modRefId);
      }
    } else {
      inj = this.injectorPerModMap.get(moduleId);
    }

    if (!inj && throwErrIfNotFound) {
      const moduleName = getDebugClassName(moduleId) || 'unknown';
      throw new ModuleIdNotFound(moduleName);
    }
    return inj;
  }

  /**
   * Retrieves the instantiated singleton class instance of a module from its corresponding module-level injector.
   */
  getInstanceOf<T extends AnyObj>(modRefId: ModRefId<T>, throwErrIfNotFound: true): T;
  getInstanceOf<T extends AnyObj>(modRefId: ModRefId<T>, throwErrIfNotFound?: false): T | undefined;
  getInstanceOf(moduleId: ModuleId, throwErrIfNotFound: true): AnyObj;
  getInstanceOf(moduleId: ModuleId, throwErrIfNotFound?: false): AnyObj | undefined;
  getInstanceOf(moduleId: ModuleId, throwErrIfNotFound?: boolean) {
    const modRefId = typeof moduleId == 'string' ? this.moduleIdMap.get(moduleId)! : moduleId;
    const Mod = getModule(modRefId);
    if (throwErrIfNotFound === true) {
      return this.getInjectorPerMod(moduleId, true).get(Mod);
    }
    return this.getInjectorPerMod(moduleId, throwErrIfNotFound)?.get(Mod);
  }

  /**
   * Delegates module decorator reflection and metadata normalization to {@link ModuleNormalizer}.
   * On failure, enriches the error message with the full dependency scan trajectory (e.g., `ModuleA -> ModuleB`).
   */
  protected normalizeMeta(modRefId: ModRefId): NormalizedModuleMeta {
    try {
      return this.moduleNormalizer.normalize(modRefId, this.systemLogMediator);
    } catch (err: any) {
      const moduleName = getDebugClassName(modRefId);
      let path = [...this.scanningModules].map((id) => getDebugClassName(id)).join(' -> ');
      path = this.scanningModules.size > 1 ? `${moduleName} (${path})` : `${moduleName}`;
      throw new NormalizationFailure(path, err);
    }
  }
}
