import type { AnyFn } from '#di/top/types-and-models.js';
import type { ModRefId, DynamicModule } from '#decorators/module-decorator-options.js';
import type { ModuleAspectHandler, AllModuleAspectsMap } from '#decorators/module-aspects.js';
import type { NormalizedModuleMeta, BaseNormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModulesMap } from '#init/module-manager.js';
import type { ModuleAspectApplier } from '#init/module-aspect-applier.js';
import { NormalizationFailure } from '#errors';

export class ModuleAspectPropagator {
  constructor(
    protected aspectApplier: ModuleAspectApplier,
    protected normalizedMetaMap: ModulesMap,
    protected childrenMap: Map<ModRefId, Set<ModRefId>>,
    protected scannedModules: Set<ModRefId>,
    protected propsWithModules: (keyof BaseNormalizedModuleMeta)[],
  ) {}

  applyHostAspectOptions(scanNewlyAddedModules: (modulesToScan: Set<ModRefId>) => void) {
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

      scanNewlyAddedModules(modulesToScan);
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
      this.aspectApplier.applyHostAspectOptions(hostMeta, decoratorId, newModuleAspect);
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
    (meta.modRefId as DynamicModule).aspectOptions?.forEach((params, decoratorId) => {
      if (!meta.moduleAspectMap.has(decoratorId)) {
        const parentAspect = parentAspects.get(decoratorId);
        if (parentAspect) {
          try {
            this.aspectApplier.registerAspectOnModule(meta, decoratorId, parentAspect.clone());
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
        this.aspectApplier.registerAspectOnModule(meta, decoratorId, aspect.clone());
        if (aspect.hostModule) {
          this.childrenMap.get(meta.modRefId)?.add(aspect.hostModule);
        }
      } catch (err: any) {
        throw new NormalizationFailure(meta.name, err);
      }
    });
  }
}
