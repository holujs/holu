import type { AnyFn } from '#di/top/types-and-models.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { ModuleAspectHandler, AllModuleAspectsMap } from '#decorators/module-aspects.js';
import type { NormalizedModuleMeta, BaseNormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModulesMap } from '#init/module-registry.js';
import type { ModuleMetaProcessor } from '#init/module-meta-processor.js';
import { NormalizationFailure, MissingChildrenMap, MissingModuleMetadata } from '#errors';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { isDynamicModule } from '#decorators/type-guards.js';

/**
 * Orchestrates the propagation and aggregation of module aspects across the dependency graph.
 *
 * Handles the application of host aspect options, top-down aspect propagation to child modules,
 * and bottom-up accumulation of aspects into parent modules.
 */
export class ModuleAspectPropagator {
  constructor(
    protected metaProcessor: ModuleMetaProcessor,
    protected normalizedMetaMap: ModulesMap,
    protected childrenMap: Map<ModRefId, Set<ModRefId>>,
    protected scannedModules: Set<ModRefId>,
    protected propsWithModules: (keyof BaseNormalizedModuleMeta)[],
  ) {}

  /**
   * Operates when both a host module and host options are present within the same aspect decorator.
   * This decorator is always applied to a different module class than the host itself.
   *
   * The primary task of this method is to find these specific aspect decorators,
   * and to apply their options to the corresponding host module.
   *
   * @param scanNewlyAddedModules - Callback invoked with any newly discovered modules that need scanning.
   */
  applyHostStaticAspectOptions(scanNewlyAddedModules: (modulesToScan: Set<ModRefId>) => void) {
    let hasNewModules = true;
    while (hasNewModules) {
      hasNewModules = false;
      const modulesToScan = new Set<ModRefId>();

      this.normalizedMetaMap.forEach((meta) => {
        meta.moduleAspectsMap.forEach((moduleAspect, decoratorId) => {
          if (moduleAspect.hostModule && moduleAspect.hostStaticAspectOptions) {
            const hostMeta = this.normalizedMetaMap.get(moduleAspect.hostModule);
            if (hostMeta && !hostMeta.moduleAspectsMap.has(decoratorId)) {
              const isAdded = this.applyHostAspectAndGatherDependencies(hostMeta, decoratorId, moduleAspect, modulesToScan);
              if (isAdded) {
                hasNewModules = true;
              }
            }
          }
        });
      });

      scanNewlyAddedModules(modulesToScan);
    }
  }

  /**
   * Applies the host aspect options to the corresponding host module and identifies any newly
   * introduced module dependencies.
   *
   * After integrating the aspect's configuration into the host module, this method determines
   * what additional modules need to be scanned. It does this by invoking the aspect handler's
   * `getModulesToScan()` method and inspecting the host module for any newly added imports or exports.
   *
   * @returns `true` if new, previously unscanned module dependencies were found, indicating that
   * the module registry requires an additional scanning iteration.
   */
  protected applyHostAspectAndGatherDependencies(
    hostMeta: NormalizedModuleMeta,
    decoratorId: AnyFn,
    aspectHandler: ModuleAspectHandler,
    modulesToScan: Set<ModRefId>,
  ): boolean {
    const newAspectHandler = aspectHandler.clone(aspectHandler.hostStaticAspectOptions);
    hostMeta.moduleAspectsMap.set(decoratorId, newAspectHandler);
    try {
      this.metaProcessor.applyHostStaticAspectOptions(hostMeta, decoratorId, newAspectHandler);
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new NormalizationFailure(hostMeta.name, cause);
    }

    let hasNewSubChildren = false;
    const children = this.childrenMap.get(hostMeta.modRefId);
    if (!children) {
      throw new MissingChildrenMap(getDebugClassName(hostMeta.modRefId));
    }
    const processInput = (input: ModRefId) => {
      if (!children.has(input)) {
        children.add(input);
        if (!this.scannedModules.has(input)) {
          modulesToScan.add(input);
          hasNewSubChildren = true;
        }
      }
    };

    const aspectMeta = hostMeta.normalizedAspectsMetaMap.get(decoratorId);
    if (aspectMeta) {
      newAspectHandler.getModulesToScan(aspectMeta).forEach(processInput);
    }
    this.propsWithModules.forEach((p) => (hostMeta[p] as ModRefId[]).forEach(processInput));

    return hasNewSubChildren;
  }

  /**
   * Performs a top-down traversal of the module dependency graph to propagate active module aspects
   * from parent modules to their children.
   *
   * During propagation:
   * - Aspects are applied to dynamic modules that specify the `dynamicAspectOptionsMap` property on their `DynamicModule` object.
   * - Static modules inherit parent aspects, provided they don't define their own decorators
   *   and `inheritsAspects` is not set to `false`.
   *
   * @param startModule - The module to begin propagation from (typically the root module).
   * @param parentAspectsMap - A map of aspects inherited from the parent module context.
   * @param visited - A set of already visited modules to prevent infinite loops in cyclic dependencies.
   */
  propagateAspectsTopDown(startModule: ModRefId, parentAspectsMap: AllModuleAspectsMap = new Map(), visited = new Set<ModRefId>()) {
    if (visited.has(startModule)) {
      return;
    }
    visited.add(startModule);

    const meta = this.normalizedMetaMap.get(startModule);
    if (!meta) {
      throw new MissingModuleMetadata(getDebugClassName(startModule));
    }
    const effectiveAspectsMap: AllModuleAspectsMap = new Map([...parentAspectsMap, ...meta.moduleAspectsMap]);

    // Apply aspects for dynamic modules imported with dynamicAspectOptionsMap.
    this.applyAspectsForDynamicModule(meta, effectiveAspectsMap);

    // Inherit parent aspects for static modules without own decorators.
    this.inheritParentAspects(meta, effectiveAspectsMap);

    // After applying/inheriting, rebuild activeAspects to include newly added entries.
    meta.moduleAspectsMap.forEach((moduleAspect, decoratorId) => effectiveAspectsMap.set(decoratorId, moduleAspect));

    // Recurse into children.
    const children = this.childrenMap.get(startModule);
    if (children) {
      for (const child of children) {
        this.propagateAspectsTopDown(child, effectiveAspectsMap, visited);
      }
    }
  }

  /**
   * Performs a bottom-up (post-order) traversal of the module dependency graph to accumulate
   * aspects from child modules into their respective parent modules.
   *
   * This process ensures that a parent module's `allModuleAspectsMap` contains all aspects
   * that are present anywhere within its sub-tree. Additionally, it creates read-only, normalized
   * entries in the parent's `normalizedAspectsMetaMap` for these accumulated (non-own) aspects.
   *
   * @param startModule - The module to begin accumulation from (typically the root module).
   * @param visited - A set of already visited modules to prevent infinite loops in cyclic dependencies.
   */
  accumulateAspectsBottomUp(startModule: ModRefId, visited = new Set<ModRefId>()) {
    if (visited.has(startModule)) {
      return;
    }
    visited.add(startModule);

    const meta = this.normalizedMetaMap.get(startModule);
    if (!meta) {
      throw new MissingModuleMetadata(getDebugClassName(startModule));
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
        if (!childMeta) {
          throw new MissingModuleMetadata(getDebugClassName(child));
        }
        childMeta.allModuleAspectsMap.forEach((aspect, decoratorId) => {
          if (!meta.allModuleAspectsMap.has(decoratorId)) {
            meta.allModuleAspectsMap.set(decoratorId, aspect);
          }
        });
      }
    }

    // Create read-only normalizedAspectsMetaMap entries for accumulated (non-own) aspects.
    meta.allModuleAspectsMap.forEach((aspect, decoratorId) => {
      if (!meta.moduleAspectsMap.has(decoratorId) && !meta.normalizedAspectsMetaMap.has(decoratorId)) {
        try {
          const readOnlyMeta = aspect.clone().normalize(meta);
          if (readOnlyMeta) {
            meta.normalizedAspectsMetaMap.set(decoratorId, readOnlyMeta);
          }
        } catch (err: unknown) {
          const cause = err instanceof Error ? err : new Error(String(err));
          throw new NormalizationFailure(meta.name, cause);
        }
      }
    });
  }

  protected applyAspectsForDynamicModule(meta: NormalizedModuleMeta, effectiveAspectsMap: AllModuleAspectsMap) {
    if (!isDynamicModule(meta.modRefId)) {
      return;
    }
    meta.modRefId.dynamicAspectOptionsMap?.forEach((dynamicModuleOptions, decoratorId) => {
      if (!meta.moduleAspectsMap.has(decoratorId)) {
        const effectiveAspect = effectiveAspectsMap.get(decoratorId);
        if (effectiveAspect) {
          try {
            this.metaProcessor.registerAspectOnModule(meta, decoratorId, effectiveAspect.clone());
            if (effectiveAspect.hostModule) {
              this.childrenMap.get(meta.modRefId)?.add(effectiveAspect.hostModule);
            }
          } catch (err: unknown) {
            const cause = err instanceof Error ? err : new Error(String(err));
            throw new NormalizationFailure(meta.name, cause);
          }
        }
      }
    });
  }

  protected inheritParentAspects(meta: NormalizedModuleMeta, effectiveAspectsMap: AllModuleAspectsMap) {
    const inheritsAspects = meta.inheritsAspects ?? !meta.isExternal;
    if (!inheritsAspects || meta.moduleAspectsMap.size > 0) {
      return;
    }
    effectiveAspectsMap.forEach((aspect, decoratorId) => {
      try {
        this.metaProcessor.registerAspectOnModule(meta, decoratorId, aspect.clone());
        if (aspect.hostModule) {
          this.childrenMap.get(meta.modRefId)?.add(aspect.hostModule);
        }
      } catch (err: unknown) {
        const cause = err instanceof Error ? err : new Error(String(err));
        throw new NormalizationFailure(meta.name, cause);
      }
    });
  }
}
