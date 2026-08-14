import type { PickProps } from '#types/mix.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { DynamicModule } from '#decorators/module-decorator-options.js';
import type { ForwardRefFn } from '#di/forward-ref.js';
import type { StaticAspectOptions } from '#decorators/module-aspects.js';
import type { RootModuleOptions } from '#decorators/root-module.js';
import type { DecoratorMeta } from '#di/top/decorator-and-value.js';
import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { resolveForwardRef } from '#di/forward-ref.js';
import { isNormalizedProvider } from '#di/utils.js';
import { Reflector } from '#di/reflector.js';
import { isDynamicModule, isRootModule, isModuleDecorator, isModuleWithModuleAspect } from '#decorators/type-guards.js';
import { UndefinedSymbol, ResolvedCollisionTokensOnly, MissingModuleDecorator, InvalidModRefId, ReexportFailure } from '#errors';
import { ModuleMetaProcessor } from '#init/module-meta-processor.js';
import type { ModuleManager } from '#init/module-manager.js';
import type { ModuleAspectApplier } from '#init/module-aspect-applier.js';

/**
 * Normalizes and validates module metadata.
 *
 * Responsible for **creating** new {@link NormalizedModuleMeta} instances from
 * module decorator options. Mutation of existing metadata (aspect registration,
 * host-aspect application) is handled by {@link ModuleAspectApplier}.
 */
export class ModuleNormalizer extends ModuleMetaProcessor {
  /**
   * The directory in which the class was declared.
   */
  protected rootDeclaredInDir: string;
  protected systemLogMediator: SystemLogMediator;

  /**
   * Returns normalized module metadata.
   *
   * Only processes the module's own decorators. Cross-module aspect propagation
   * (for dynamic modules with `aspectOptions` or static modules without own decorators)
   * is handled separately by {@link ModuleManager} after the scan phase completes.
   */
  normalize(modRefId: ModRefId, systemLogMediator: SystemLogMediator) {
    this.systemLogMediator = systemLogMediator;
    const meta = this.initNormalizedModuleMeta(modRefId);
    const { staticModuleOptions } = meta;
    this.checkAndMarkExternalModule(staticModuleOptions, meta);

    // Phase 1: Normalize base decorator metadata.
    this.normalizeProvidersAndResolvedCollisions(staticModuleOptions, meta);
    this.normalizeImports(staticModuleOptions, meta);
    this.normalizeExtensions(staticModuleOptions, meta);

    if (isDynamicModule(modRefId)) {
      this.normalizeDynamicModule(modRefId, meta);
    }

    this.normalizeExports(staticModuleOptions, 'Static exports', meta);
    if (isDynamicModule(modRefId)) {
      this.normalizeExports(modRefId, 'Dynamic exports', meta);
    }

    this.assertReexportedModulesAreImported(meta);

    // Phase 2: Process aspect decorators applied directly to the current module.
    this.processOwnModuleAspects(meta);

    this.quickCheckMeta(staticModuleOptions, meta);
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

    /**
     * Setting initial properties of metadata.
     */
    const meta = new NormalizedModuleMeta();
    meta.name = moduleName;
    meta.staticModuleOptions = staticModuleOptions;
    meta.declaredInDir = decoratorMeta?.declaredInDir || '.';
    meta.modRefId = modRefId;
    decoratorsMeta.filter(isModuleWithModuleAspect).forEach(({ decoratorId, value }) => {
      meta.moduleAspectMap.set(decoratorId, value);
    });
    return meta;
  }

  protected getDecoratorMeta(modRefId: ModRefId): DecoratorMeta[] | undefined {
    modRefId = resolveForwardRef(modRefId);
    const staticModule = isDynamicModule(modRefId) ? resolveForwardRef(modRefId.module) : modRefId;
    return Reflector.getClassLevelMeta(staticModule);
  }

  /**
   * Since this method relies on the established variable {@link rootDeclaredInDir},
   * during scanning the {@link ModuleManager} must first scan the root module.
   */
  protected checkAndMarkExternalModule(staticModuleOptions: RootModuleOptions, meta: NormalizedModuleMeta) {
    if (this.rootDeclaredInDir) {
      const { declaredInDir } = meta;
      if (declaredInDir !== '.') {
        // Case when CallsiteUtils.getCallerDir() works correctly.
        meta.isExternal =
          !declaredInDir.startsWith(this.rootDeclaredInDir) ||
          (!this.rootDeclaredInDir.includes('holu/packages') && declaredInDir.includes('holu/packages'));
      }
    } else if (isRootModule(staticModuleOptions) && meta.declaredInDir !== '.') {
      this.rootDeclaredInDir = meta.declaredInDir;
      meta.isExternal = false;
    }

    if (meta.isExternal === undefined) {
      this.systemLogMediator.externalModuleDetectionFailed(this);
    }

    if (staticModuleOptions.inheritsAspects !== undefined) {
      meta.inheritsAspects = staticModuleOptions.inheritsAspects;
    }
  }

  protected normalizeDynamicModule(dynamicModule: DynamicModule, meta: NormalizedModuleMeta) {
    if (dynamicModule.id) {
      meta.id = dynamicModule.id;
    }
    this.normalizeProviders(dynamicModule, meta);
    if (dynamicModule.extensionsMeta) {
      meta.extensionsMeta = {
        ...meta.extensionsMeta,
        ...dynamicModule.extensionsMeta,
      };
    }
  }

  protected normalizeImports(staticModuleOptions: RootModuleOptions, meta: NormalizedModuleMeta) {
    this.resolveAllForwardRefs(staticModuleOptions.imports).forEach((imp, i) => {
      if (imp === undefined) {
        throw new UndefinedSymbol('Imports', meta.name, i);
      }
      if (isDynamicModule(imp)) {
        meta.importedDynamicModules.push(imp);
      } else {
        meta.importedStaticModules.push(imp);
      }
    });
  }

  protected assertResolvedCollisionTokensOnly(
    staticModuleOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    const resolvedCollisionsPerLevel: [any, ModRefId | ForwardRefFn][] = [];
    (['App', 'Mod', 'Rou', 'Req'] as const).forEach((level) => {
      if (Array.isArray(staticModuleOptions[`resolvedCollisionsPer${level}`])) {
        resolvedCollisionsPerLevel.push(...staticModuleOptions[`resolvedCollisionsPer${level}`]!);
      }
    });

    resolvedCollisionsPerLevel.forEach(([provider]) => {
      provider = resolveForwardRef(provider);
      if (isNormalizedProvider(provider)) {
        const providerName = provider.token.name || provider.token;
        throw new ResolvedCollisionTokensOnly(meta.name, providerName);
      }
    });
  }

  protected assertReexportedModulesAreImported(meta: NormalizedModuleMeta) {
    if (isRootModule(meta)) {
      // Allow exporting from the root module without importing.
      return;
    }
    const imports = [...meta.importedStaticModules, ...meta.importedDynamicModules];
    const exports = [...meta.exportedStaticModules, ...meta.exportedDynamicModules];

    exports.forEach((modRefId) => {
      if (!imports.includes(modRefId)) {
        throw new ReexportFailure(meta.name, getDebugClassName(modRefId) || '""');
      }
    });
  }

  protected processOwnModuleAspects(meta: NormalizedModuleMeta) {
    meta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
      meta.allModuleAspectsMap.set(decoratorId, moduleAspect);
      this.ensureHostModuleImported(moduleAspect, meta);
      this.applyAspectModuleOptions(decoratorId, moduleAspect.moduleOptions, meta);
      this.normalizeAspectMeta(decoratorId, moduleAspect, meta);
    });
  }

  protected quickCheckMeta(staticModuleOptions: RootModuleOptions, meta: NormalizedModuleMeta) {
    this.assertResolvedCollisionTokensOnly(staticModuleOptions, meta);
  }
}
