import type { ModRefId, DynamicModule } from '#decorators/module-decorator-options.js';
import type { DecoratorMeta } from '#di/top/decorator-and-value.js';
import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { ModuleAspectPropagator } from '#init/module-aspect-propagator.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { resolveForwardRef } from '#di/forward-ref.js';
import { Reflector } from '#di/reflector.js';
import { isDynamicModule, isRootModule, isModuleDecorator, isModuleWithModuleAspect } from '#decorators/type-guards.js';
import { MissingModuleDecorator, InvalidModRefId } from '#errors';
import { ModuleMetaProcessor } from '#init/module-meta-processor.js';

/**
 * Orchestrates the creation of normalized module metadata.
 *
 * Responsible for **creating** new {@link NormalizedModuleMeta} instances from
 * module decorator options, determining module externality, and coordinating
 * the normalization phases. Stateless metadata processing and validation
 * is delegated to {@link ModuleMetaProcessor}. Mutation of existing metadata
 * (aspect registration, host-aspect application) is handled by
 * {@link ModuleAspectPropagator} during aspect propagation.
 */
export class ModuleNormalizer {
  constructor(
    protected systemLogMediator: SystemLogMediator,
    public readonly metaProcessor = new ModuleMetaProcessor(),
  ) {}

  /**
   * Returns normalized module metadata.
   *
   * Only processes the module's own decorators. Cross-module aspect propagation
   * (for dynamic modules with `dynamicAspectOptionsMap` or static modules without own decorators)
   * is handled separately by {@link ModuleAspectPropagator} after the scan phase completes.
   */
  normalize(modRefId: ModRefId, rootDeclaredInDir?: string) {
    const meta = this.initNormalizedModuleMeta(modRefId);
    this.checkAndMarkExternalModule(meta, rootDeclaredInDir);

    // Phase 1: Normalize base decorator metadata.
    this.metaProcessor.normalizeImports(meta);
    this.metaProcessor.normalizeProvidersAndResolvedCollisions(meta.staticModuleOptions, meta);
    this.metaProcessor.normalizeExtensions(meta.staticModuleOptions, meta);

    if (isDynamicModule(modRefId)) {
      this.normalizeDynamicModule(modRefId, meta);
    }

    this.metaProcessor.normalizeExports(meta.staticModuleOptions, 'Static exports', meta);
    if (isDynamicModule(modRefId)) {
      this.metaProcessor.normalizeExports(modRefId, 'Dynamic exports', meta);
    }

    this.metaProcessor.assertReexportedModulesAreImported(meta);

    // Phase 2: Process aspect decorators applied directly to the current module.
    this.processOwnModuleAspects(meta);

    this.metaProcessor.assertResolvedCollisionTokensOnly(meta);
    return meta;
  }

  protected initNormalizedModuleMeta(modRefId: ModRefId) {
    const decoratorsMeta = this.getDecoratorMeta(modRefId) || [];
    const decoratorMeta = decoratorsMeta.find((d) => isModuleDecorator(d));
    const staticModuleOptions = decoratorMeta?.value;
    const moduleName = getDebugClassName(modRefId);
    if (!moduleName) {
      throw new InvalidModRefId();
    }
    if (!staticModuleOptions) {
      throw new MissingModuleDecorator(moduleName);
    }
    const meta = new NormalizedModuleMeta();
    meta.name = moduleName;
    meta.staticModuleOptions = staticModuleOptions;
    meta.declaredInDir = decoratorMeta?.declaredInDir || '.';
    meta.modRefId = modRefId;
    decoratorsMeta.filter(isModuleWithModuleAspect).forEach(({ decoratorId, value }) => {
      meta.moduleAspectsMap.set(decoratorId, value);
    });
    return meta;
  }

  protected getDecoratorMeta(modRefId: ModRefId): DecoratorMeta[] | undefined {
    modRefId = resolveForwardRef(modRefId);
    const staticModule = isDynamicModule(modRefId) ? resolveForwardRef(modRefId.module) : modRefId;
    return Reflector.getClassLevelMeta(staticModule);
  }

  /**
   * Identifies whether a module is an external library or belongs to the local workspace.
   */
  protected checkAndMarkExternalModule(meta: NormalizedModuleMeta, rootDeclaredInDir?: string) {
    if (rootDeclaredInDir) {
      const { declaredInDir } = meta;
      if (declaredInDir !== '.') {
        // Case when CallsiteUtils.getCallerDir() works correctly.
        meta.isExternal =
          !declaredInDir.startsWith(rootDeclaredInDir) ||
          (!rootDeclaredInDir.includes('holu/packages') && declaredInDir.includes('holu/packages'));
      }
    } else if (isRootModule(meta.staticModuleOptions) && meta.declaredInDir !== '.') {
      meta.isExternal = false;
    }

    if (meta.isExternal === undefined) {
      this.systemLogMediator.externalModuleDetectionFailed(this);
    }

    if (meta.staticModuleOptions.inheritsAspects !== undefined) {
      meta.inheritsAspects = meta.staticModuleOptions.inheritsAspects;
    }
  }

  protected normalizeDynamicModule(dynamicModule: DynamicModule, meta: NormalizedModuleMeta) {
    if (dynamicModule.id) {
      meta.id = dynamicModule.id;
    }
    this.metaProcessor.normalizeProviders(dynamicModule, meta);
    if (dynamicModule.extensionsMeta) {
      meta.extensionsMeta = {
        ...meta.extensionsMeta,
        ...dynamicModule.extensionsMeta,
      };
    }
  }

  protected processOwnModuleAspects(meta: NormalizedModuleMeta) {
    meta.moduleAspectsMap.forEach((moduleAspect, decoratorId) => {
      meta.allModuleAspectsMap.set(decoratorId, moduleAspect);
      this.metaProcessor.ensureHostModuleImported(moduleAspect, meta);
      this.metaProcessor.applyAspectModuleOptions(decoratorId, moduleAspect.staticAspectOptions, meta);
      this.metaProcessor.normalizeAspectMeta(decoratorId, moduleAspect, meta);
    });
  }
}
