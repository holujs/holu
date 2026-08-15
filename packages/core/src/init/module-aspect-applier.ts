import type { AnyFn } from '#di/top/types-and-models.js';
import type { ModuleAspectHandler } from '#decorators/module-aspects.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModuleManager } from '#init/module-manager.js';
import type { ModuleNormalizer } from '#init/module-normalizer.js';
import { ModuleMetaProcessor } from '#init/module-meta-processor.js';

/**
 * Handles mutation and validation of existing {@link NormalizedModuleMeta} instances.
 *
 * Used by {@link ModuleManager} during the post-scan phase to register aspects
 * on modules, apply host-aspect options, and validate metadata completeness.
 *
 * This class is separated from {@link ModuleNormalizer} to clearly distinguish
 * between **creating** new metadata (normalizer) and **mutating** existing metadata (this class).
 */
export class ModuleAspectApplier {
  constructor(protected metaProcessor = new ModuleMetaProcessor()) {}

  applyHostAspectOptions(normalizedModuleMeta: NormalizedModuleMeta, decoratorId: AnyFn, moduleAspect: ModuleAspectHandler) {
    this.metaProcessor.applyAspectModuleOptions(decoratorId, moduleAspect.moduleOptions, normalizedModuleMeta);
    this.metaProcessor.normalizeAspectMeta(decoratorId, moduleAspect, normalizedModuleMeta);
  }

  /**
   * Registers a cloned module aspect on the given module: adds it to `allModuleAspectsMap`
   * and `moduleAspectMap`, ensures the host module is imported, normalizes the aspect
   * metadata, and applies it to the module's `normalizedAspectMetaMap`.
   *
   * This is the single entry point used by {@link ModuleManager} to register an aspect
   * on a module during the post-scan propagation phase.
   */
  registerAspectOnModule(normalizedModuleMeta: NormalizedModuleMeta, decoratorId: AnyFn, moduleAspect: ModuleAspectHandler): void {
    normalizedModuleMeta.allModuleAspectsMap.set(decoratorId, moduleAspect);
    this.metaProcessor.ensureHostModuleImported(moduleAspect, normalizedModuleMeta);
    this.metaProcessor.normalizeAspectMeta(decoratorId, moduleAspect, normalizedModuleMeta);
    normalizedModuleMeta.moduleAspectMap.set(decoratorId, moduleAspect);
  }
}
