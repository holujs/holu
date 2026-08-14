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
    const normalizedModuleMeta = this.initNormalizedModuleMeta(modRefId);
    const { staticModuleOptions } = normalizedModuleMeta;
    this.checkAndMarkExternalModule(staticModuleOptions);

    // Phase 1: Normalize base decorator metadata.
    this.normalizeProvidersAndResolvedCollisions(staticModuleOptions);
    this.normalizeImports(staticModuleOptions);
    this.normalizeExtensions(staticModuleOptions);

    if (isDynamicModule(modRefId)) {
      this.normalizeDynamicModule(modRefId);
    }

    this.normalizeExports(staticModuleOptions, 'Static exports');
    if (isDynamicModule(modRefId)) {
      this.normalizeExports(modRefId, 'Dynamic exports');
    }

    this.assertReexportedModulesAreImported();

    // Phase 2: Process aspect decorators applied directly to the current module.
    this.processOwnModuleAspects();

    this.quickCheckMeta(staticModuleOptions);
    return normalizedModuleMeta;
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
    const normalizedModuleMeta = new NormalizedModuleMeta();
    this.normalizedModuleMeta = normalizedModuleMeta;
    normalizedModuleMeta.name = moduleName;
    normalizedModuleMeta.staticModuleOptions = staticModuleOptions;
    normalizedModuleMeta.declaredInDir = decoratorMeta?.declaredInDir || '.';
    normalizedModuleMeta.modRefId = modRefId;
    decoratorsMeta.filter(isModuleWithModuleAspect).forEach(({ decoratorId, value }) => {
      normalizedModuleMeta.moduleAspectMap.set(decoratorId, value);
    });
    return normalizedModuleMeta;
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
  protected checkAndMarkExternalModule(staticModuleOptions: RootModuleOptions) {
    if (this.rootDeclaredInDir) {
      const { declaredInDir } = this.normalizedModuleMeta;
      if (declaredInDir !== '.') {
        // Case when CallsiteUtils.getCallerDir() works correctly.
        this.normalizedModuleMeta.isExternal =
          !declaredInDir.startsWith(this.rootDeclaredInDir) ||
          (!this.rootDeclaredInDir.includes('holu/packages') && declaredInDir.includes('holu/packages'));
      }
    } else if (isRootModule(staticModuleOptions) && this.normalizedModuleMeta.declaredInDir !== '.') {
      this.rootDeclaredInDir = this.normalizedModuleMeta.declaredInDir;
      this.normalizedModuleMeta.isExternal = false;
    }

    if (this.normalizedModuleMeta.isExternal === undefined) {
      this.systemLogMediator.externalModuleDetectionFailed(this);
    }

    if (staticModuleOptions.inheritsAspects !== undefined) {
      this.normalizedModuleMeta.inheritsAspects = staticModuleOptions.inheritsAspects;
    }
  }

  protected normalizeDynamicModule(dynamicModule: DynamicModule) {
    if (dynamicModule.id) {
      this.normalizedModuleMeta.id = dynamicModule.id;
    }
    this.normalizeProviders(dynamicModule);
    if (dynamicModule.extensionsMeta) {
      this.normalizedModuleMeta.extensionsMeta = {
        ...this.normalizedModuleMeta.extensionsMeta,
        ...dynamicModule.extensionsMeta,
      };
    }
  }

  protected normalizeImports(staticModuleOptions: RootModuleOptions) {
    this.resolveAllForwardRefs(staticModuleOptions.imports).forEach((imp, i) => {
      if (imp === undefined) {
        throw new UndefinedSymbol('Imports', this.normalizedModuleMeta.name, i);
      }
      if (isDynamicModule(imp)) {
        this.normalizedModuleMeta.importedDynamicModules.push(imp);
      } else {
        this.normalizedModuleMeta.importedStaticModules.push(imp);
      }
    });
  }

  protected assertResolvedCollisionTokensOnly(
    staticModuleOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
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
        throw new ResolvedCollisionTokensOnly(this.normalizedModuleMeta.name, providerName);
      }
    });
  }

  protected assertReexportedModulesAreImported() {
    if (isRootModule(this.normalizedModuleMeta)) {
      // Allow exporting from the root module without importing.
      return;
    }
    const imports = [...this.normalizedModuleMeta.importedStaticModules, ...this.normalizedModuleMeta.importedDynamicModules];
    const exports = [...this.normalizedModuleMeta.exportedStaticModules, ...this.normalizedModuleMeta.exportedDynamicModules];

    exports.forEach((modRefId) => {
      if (!imports.includes(modRefId)) {
        throw new ReexportFailure(this.normalizedModuleMeta.name, getDebugClassName(modRefId) || '""');
      }
    });
  }

  protected processOwnModuleAspects() {
    this.normalizedModuleMeta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
      this.normalizedModuleMeta.allModuleAspectsMap.set(decoratorId, moduleAspect);
      this.ensureHostModuleImported(moduleAspect);
      this.applyAspectModuleOptions(decoratorId, moduleAspect.moduleOptions);
      this.normalizeAspectMeta(decoratorId, moduleAspect);
    });
  }

  protected quickCheckMeta(staticModuleOptions: RootModuleOptions) {
    this.assertResolvedCollisionTokensOnly(staticModuleOptions);
  }
}
