import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { AnyObj } from '#types/mix.js';
import type { StaticModule, ModRefId, DynamicModule } from '#decorators/module-decorator-options.js';
import type { BaseNormalizedModuleMeta, NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { AllModuleAspectsMap, ModuleAspectHandler } from '#decorators/module-aspects.js';
import type { Provider, AnyFn } from '#di/top/types-and-models.js';
import type { Injector } from '#di/injector.js';
import { resolveForwardRef, type ForwardRefFn } from '#di/forward-ref.js';
import { isRootModule } from '#decorators/type-guards.js';
import { clearDebugClassNames, getDebugClassName } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from '#init/module-normalizer.js';
import { ModuleIdNotFound, NormalizationFailure, MissingRootDecorator } from '#errors';
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
 * `ModuleManager` also stores module-level DI injectors, manages application-scoped providers, and propagates module aspects.
 */
export class ModuleManager {
  protected injectorPerModMap = new Map<ModRefId, Injector>();
  protected normalizedMetaMap: ModulesMap = new Map();
  protected moduleIdMap = new Map<'root' | (string & {}), ModRefId>();
  protected unfinishedScanModules = new Set<ModRefId>();
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
    this.finalizeRootScan(appModule);
    this.injectorPerModMap.clear();
    this.unfinishedScanModules.clear();
    this.scannedModules.clear();
    clearDebugClassNames();
    this.moduleIdMap.set('root', appModule);
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
   * separately in {@link finalizeRootScan} after the entire module tree has been scanned.
   */
  protected scanModule(modRefId: ModRefId | ForwardRefFn<ModRefId>) {
    modRefId = resolveForwardRef(modRefId);
    const normalizedModuleMeta = this.normalizeMeta(modRefId);

    const children = new Set<ModRefId>();
    this.childrenMap.set(normalizedModuleMeta.modRefId, children);

    for (const child of this.getModulesToScan(normalizedModuleMeta)) {
      children.add(child);
      if (this.unfinishedScanModules.has(child) || this.scannedModules.has(child)) {
        continue;
      }
      this.unfinishedScanModules.add(child);
      this.scanModule(child);
      this.unfinishedScanModules.delete(child);
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

  protected setNormalizedModuleMeta(modRefId: ModRefId, normalizedModuleMeta: NormalizedModuleMeta) {
    this.normalizedMetaMap.set(modRefId, normalizedModuleMeta);
  }

  protected finalizeRootScan(modRefId: ModRefId) {
    this.applyHostAspectOptions();
    const rootModule = this.moduleIdMap.get('root') || resolveForwardRef(modRefId);
    this.propagateAspectsTopDown(rootModule);
    this.accumulateAspectsBottomUp(rootModule);
    this.checkEmptyMetaForAllModules();
  }

  /**
   * Identifies module aspects containing `hostAspectOptions` and applies them to their respective host modules.
   * Runs recursively to scan any newly added dependencies triggered by these options.
   */
  protected applyHostAspectOptions() {
    let hasNewModules = true;
    while (hasNewModules) {
      hasNewModules = false;
      const modulesToScan = new Set<ModRefId>();

      this.normalizedMetaMap.forEach((meta) => {
        meta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
          if (moduleAspect.hostModule && moduleAspect.hostAspectOptions) {
            const hostMeta = this.normalizedMetaMap.get(moduleAspect.hostModule);
            if (hostMeta && !hostMeta.moduleAspectMap.has(decoratorId)) {
              const isAdded = this.applyHostAspectAndGatherDependencies(hostMeta, decoratorId, moduleAspect, modulesToScan);
              if (isAdded) {
                hasNewModules = true;
              }
            }
          }
        });
      });

      this.scanNewlyAddedModules(modulesToScan);
    }
  }

  protected applyHostAspectAndGatherDependencies(
    hostMeta: NormalizedModuleMeta,
    decoratorId: AnyFn,
    moduleAspect: ModuleAspectHandler,
    modulesToScan: Set<ModRefId>,
  ): boolean {
    const newModuleAspect = moduleAspect.clone(moduleAspect.hostAspectOptions);
    hostMeta.moduleAspectMap.set(decoratorId, newModuleAspect);
    try {
      this.moduleNormalizer.applyHostAspectOptions(hostMeta, decoratorId, newModuleAspect);
    } catch (err: any) {
      throw new NormalizationFailure(hostMeta.name, err);
    }

    const inputs: ModRefId[] = [];
    const aspectMeta = hostMeta.normalizedAspectMetaMap.get(decoratorId);
    if (aspectMeta) {
      inputs.push(...newModuleAspect.getModulesToScan(aspectMeta));
    }

    let hasNewSubChildren = false;
    this.propsWithModules.forEach((p) => inputs.push(...hostMeta[p]));
    const children = this.childrenMap.get(hostMeta.modRefId);
    if (children) {
      inputs.forEach((input) => {
        children.add(input);
        if (!this.scannedModules.has(input)) {
          modulesToScan.add(input);
          hasNewSubChildren = true;
        }
      });
    }

    return hasNewSubChildren;
  }

  protected scanNewlyAddedModules(modulesToScan: Set<ModRefId>) {
    for (const input of modulesToScan) {
      if (!this.scannedModules.has(input)) {
        this.unfinishedScanModules.add(input);
        this.scanModule(input);
        this.unfinishedScanModules.delete(input);
        this.scannedModules.add(input);
      }
    }
  }

  /**
   * Top-down traversal of the module dependency graph.
   *
   * Propagates parent module aspects to child modules that:
   * - Are dynamic modules with `aspectOptions` but no own aspect decorator for that decorator.
   * - Are static modules without any own aspect decorators (inheriting full parent context).
   *
   * Modules with their own aspect decorators keep them and do not inherit from the parent.
   */
  protected propagateAspectsTopDown(
    startModule: ModRefId,
    parentAspects: AllModuleAspectsMap = new Map(),
    visited = new Set<ModRefId>(),
  ) {
    if (visited.has(startModule)) {
      return;
    }
    visited.add(startModule);

    const meta = this.normalizedMetaMap.get(startModule);
    if (!meta) {
      return;
    }

    // Build the active aspect context: parent's aspects + current module's own aspects.
    const activeAspects: AllModuleAspectsMap = new Map(parentAspects);
    meta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
      activeAspects.set(decoratorId, moduleAspect);
    });

    // Apply aspects for dynamic modules imported with aspectOptions.
    this.applyAspectsForDynamicModule(meta, activeAspects);

    // Inherit parent aspects for static modules without own decorators.
    this.inheritParentAspects(meta, activeAspects);

    // After applying/inheriting, rebuild activeAspects to include newly added entries.
    meta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
      activeAspects.set(decoratorId, moduleAspect);
    });

    // Recurse into children.
    const children = this.childrenMap.get(startModule);
    if (children) {
      for (const child of children) {
        this.propagateAspectsTopDown(child, activeAspects, visited);
      }
    }
  }

  /**
   * Post-order (bottom-up) traversal that accumulates `allModuleAspectsMap` for each module.
   *
   * After this pass, each module's `allModuleAspectsMap` contains the union of the module's
   * own aspects and all aspects found in descendant modules.
   * Also creates read-only `normalizedAspectMetaMap` entries for aspects that are in
   * `allModuleAspectsMap` but not in `moduleAspectMap`.
   */
  protected accumulateAspectsBottomUp(startModule: ModRefId, visited = new Set<ModRefId>()) {
    if (visited.has(startModule)) {
      return;
    }
    visited.add(startModule);

    const meta = this.normalizedMetaMap.get(startModule);
    if (!meta) {
      return;
    }

    // Recurse into children first (post-order).
    const children = this.childrenMap.get(startModule);
    if (children) {
      for (const child of children) {
        this.accumulateAspectsBottomUp(child, visited);
      }

      // Now add children's aspects to the current module's allModuleAspectsMap.
      for (const child of children) {
        const childMeta = this.normalizedMetaMap.get(child);
        childMeta?.allModuleAspectsMap.forEach((aspect, decoratorId) => {
          if (!meta.allModuleAspectsMap.has(decoratorId)) {
            meta.allModuleAspectsMap.set(decoratorId, aspect);
          }
        });
      }
    }

    // Create read-only normalizedAspectMetaMap entries for accumulated (non-own) aspects.
    meta.allModuleAspectsMap.forEach((aspect, decoratorId) => {
      if (!meta.moduleAspectMap.has(decoratorId) && !meta.normalizedAspectMetaMap.has(decoratorId)) {
        const readOnlyMeta = aspect.clone().normalize(meta);
        if (readOnlyMeta) {
          meta.normalizedAspectMetaMap.set(decoratorId, readOnlyMeta);
        }
      }
    });
  }

  /**
   * Validates all modules in active registries, verifying that no module possesses completely empty metadata
   * (which typically indicates missing module decorators or invalid import structures).
   */
  protected checkEmptyMetaForAllModules() {
    this.normalizedMetaMap.forEach((meta) => {
      try {
        this.moduleNormalizer.checkEmptyMeta(meta);
      } catch (err: any) {
        throw new NormalizationFailure(meta.name, err);
      }
    });
  }

  /**
   * Returns a mutable {@link NormalizedModuleMeta} from the active workspace mapping (`this.normalizedMetaMap`).
   * Therefore, if you retrieve a {@link NormalizedModuleMeta} using this method and subsequently modify it,
   * the next call will return the already modified {@link NormalizedModuleMeta}.
   *
   * @param moduleId Can be the string alias `'root'`, an explicit module ID, or a `ModRefId` reference.
   * @param throwErrIfNotFound If set to `true`, throws a {@link ModuleIdNotFound} error when the module cannot be resolved.
   */
  getNormalizedModuleMeta(moduleId: ModuleId, throwErrIfNotFound?: boolean): NormalizedModuleMeta | undefined;
  getNormalizedModuleMeta(moduleId: ModuleId, throwErrIfNotFound: true): NormalizedModuleMeta;
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
      let path = [...this.unfinishedScanModules].map((id) => getDebugClassName(id)).join(' -> ');
      path = this.unfinishedScanModules.size > 1 ? `${moduleName} (${path})` : `${moduleName}`;
      throw new NormalizationFailure(path, err);
    }
  }

  /**
   * For dynamic modules imported with `aspectOptions`, clones the corresponding
   * aspect from the parent's context and registers it on the module.
   * This ensures the aspect's `normalize()` can read dynamic options (path, guards, etc.).
   */
  protected applyAspectsForDynamicModule(meta: NormalizedModuleMeta, parentAspects: AllModuleAspectsMap) {
    (meta.modRefId as DynamicModule).aspectOptions?.forEach((params, decoratorId) => {
      if (!meta.moduleAspectMap.has(decoratorId)) {
        const parentAspect = parentAspects.get(decoratorId);
        if (parentAspect) {
          try {
            this.moduleNormalizer.registerAspectOnModule(meta, decoratorId, parentAspect.clone());
            if (parentAspect.hostModule) {
              this.childrenMap.get(meta.modRefId)?.add(parentAspect.hostModule);
            }
          } catch (err: any) {
            throw new NormalizationFailure(meta.name, err);
          }
        }
      }
    });
  }

  /**
   * For modules without any own aspect decorators, inherits all aspects from the parent.
   * Respects `inheritsAspects` and `isExternal` flags.
   */
  protected inheritParentAspects(meta: NormalizedModuleMeta, parentAspects: AllModuleAspectsMap) {
    const inheritsAspects = meta.inheritsAspects ?? !meta.isExternal;
    if (!inheritsAspects || meta.moduleAspectMap.size > 0) {
      return;
    }
    parentAspects.forEach((aspect, decoratorId) => {
      try {
        this.moduleNormalizer.registerAspectOnModule(meta, decoratorId, aspect.clone());
        if (aspect.hostModule) {
          this.childrenMap.get(meta.modRefId)?.add(aspect.hostModule);
        }
      } catch (err: any) {
        throw new NormalizationFailure(meta.name, err);
      }
    });
  }
}
