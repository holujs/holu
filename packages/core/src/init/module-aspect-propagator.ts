import type { AnyFn } from '#di/top/types-and-models.js';
import type { ModRefId, DynamicModule } from '#decorators/module-decorator-options.js';
import type { ModuleAspectHandler, AllModuleAspectsMap } from '#decorators/module-aspects.js';
import type { NormalizedModuleMeta, BaseNormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModulesMap } from '#init/module-registry.js';
import type { ModuleMetaProcessor } from '#init/module-meta-processor.js';
import { NormalizationFailure } from '#errors';

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
        meta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
          if (moduleAspect.hostModule && moduleAspect.hostStaticAspectOptions) {
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

      scanNewlyAddedModules(modulesToScan);
    }
  }

  protected applyHostAspectAndGatherDependencies(
    hostMeta: NormalizedModuleMeta,
    decoratorId: AnyFn,
    moduleAspect: ModuleAspectHandler,
    modulesToScan: Set<ModRefId>,
  ): boolean {
    const newModuleAspect = moduleAspect.clone(moduleAspect.hostStaticAspectOptions);
    hostMeta.moduleAspectMap.set(decoratorId, newModuleAspect);
    try {
      this.metaProcessor.applyHostStaticAspectOptions(hostMeta, decoratorId, newModuleAspect);
    } catch (err: any) {
      throw new NormalizationFailure(hostMeta.name, err);
    }

    const inputs: ModRefId[] = [];
    const aspectMeta = hostMeta.normalizedAspectMetaMap.get(decoratorId);
    if (aspectMeta) {
      inputs.push(...newModuleAspect.getModulesToScan(aspectMeta));
    }

    let hasNewSubChildren = false;
    this.propsWithModules.forEach((p) => inputs.push(...(hostMeta[p] as ModRefId[])));
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
   * @param parentAspects - A map of aspects inherited from the parent module context.
   * @param visited - A set of already visited modules to prevent infinite loops in cyclic dependencies.
   */
  propagateAspectsTopDown(startModule: ModRefId, parentAspects: AllModuleAspectsMap = new Map(), visited = new Set<ModRefId>()) {
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

    // Apply aspects for dynamic modules imported with dynamicAspectOptionsMap.
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
   * Performs a bottom-up (post-order) traversal of the module dependency graph to accumulate
   * aspects from child modules into their respective parent modules.
   *
   * This process ensures that a parent module's `allModuleAspectsMap` contains all aspects
   * that are present anywhere within its sub-tree. Additionally, it creates read-only, normalized
   * entries in the parent's `normalizedAspectMetaMap` for these accumulated (non-own) aspects.
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

  protected applyAspectsForDynamicModule(meta: NormalizedModuleMeta, parentAspects: AllModuleAspectsMap) {
    (meta.modRefId as DynamicModule).dynamicAspectOptionsMap?.forEach((params, decoratorId) => {
      if (!meta.moduleAspectMap.has(decoratorId)) {
        const parentAspect = parentAspects.get(decoratorId);
        if (parentAspect) {
          try {
            this.metaProcessor.registerAspectOnModule(meta, decoratorId, parentAspect.clone());
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

  protected inheritParentAspects(meta: NormalizedModuleMeta, parentAspects: AllModuleAspectsMap) {
    const inheritsAspects = meta.inheritsAspects ?? !meta.isExternal;
    if (!inheritsAspects || meta.moduleAspectMap.size > 0) {
      return;
    }
    parentAspects.forEach((aspect, decoratorId) => {
      try {
        this.metaProcessor.registerAspectOnModule(meta, decoratorId, aspect.clone());
        if (aspect.hostModule) {
          this.childrenMap.get(meta.modRefId)?.add(aspect.hostModule);
        }
      } catch (err: any) {
        throw new NormalizationFailure(meta.name, err);
      }
    });
  }
}
