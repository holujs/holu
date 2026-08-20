import type { PickProps, AnyObj } from '#types/mix.js';
import type { ProvidersByLevel } from '#types/providers-metadata.js';
import type { AnyFn } from '#di/top/types-and-models.js';
import type { DynamicModule, FeatureModuleOptions, DynamicModuleOptions } from '#decorators/module-decorator-options.js';
import type { StaticAspectOptions, ModuleAspectHandler, ModuleAspectDecorator } from '#decorators/module-aspects.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { RootModuleOptions } from '#decorators/root-module.js';
import { objectKeys } from '#utils/object-keys.js';
import { Reflector } from '#di/reflector.js';
import { resolveAllForwardRefs } from '#init/forward-refs-resolver.js';
import { isDynamicModule, isDynamicModuleWrapper, isFeatureModule } from '#decorators/type-guards.js';
import { ProvidersProcessor } from '#init/providers-processor.js';
import { ExtensionsProcessor } from '#init/extensions-processor.js';
import { ImportsExportsProcessor } from '#init/imports-exports-processor.js';

export const PROVIDER_LEVELS = ['App', 'Mod', 'Rou', 'Req'] as const;
export type ProviderLevel = (typeof PROVIDER_LEVELS)[number];

/**
 * A stateless utility service containing shared metadata-processing methods used by both
 * {@link ModuleNormalizer} (creation of new metadata) and {@link ModuleRegistry}
 * (mutation of existing metadata during aspect propagation).
 */
export class ModuleMetaProcessor {
  protected providersProcessor = new ProvidersProcessor();
  protected extensionsProcessor = new ExtensionsProcessor();
  protected importsExportsProcessor = new ImportsExportsProcessor();

  normalizeImports(staticModuleOptions: RootModuleOptions, meta: NormalizedModuleMeta) {
    this.importsExportsProcessor.normalizeImports(staticModuleOptions, meta);
  }

  /**
   * Applies the aspect's static options to the host module and normalizes its metadata.
   *
   * This method performs two distinct operations:
   * 1. Merges the aspect's static options (such as providers, imports, extensions, etc.) directly into the
   *    host module's metadata (`hostMeta`), effectively injecting the aspect's dependencies into the module.
   * 2. Calls the aspect handler's `normalize()` method to generate and save the aspect's specific
   *    normalized metadata state into `hostMeta.normalizedAspectsMetaMap`.
   */
  applyHostStaticAspectOptions(hostMeta: NormalizedModuleMeta, decoratorId: AnyFn, aspectHandler: ModuleAspectHandler) {
    this.applyAspectModuleOptions(decoratorId, aspectHandler.staticAspectOptions, hostMeta);
    this.normalizeAspectMeta(decoratorId, aspectHandler, hostMeta);
  }

  /**
   * Merges all configuration options provided by a static aspect into the target module's metadata.
   *
   * It sequentially processes imports, exports, extensions, providers, and resolved collisions
   * defined in the aspect's `staticAspectOptions`, incorporating them directly into the
   * corresponding structures of the target `NormalizedModuleMeta`. This ensures that the module
   * inherits all dependencies and configurations required by the aspect.
   */
  applyAspectModuleOptions(decoratorId: AnyFn, staticAspectOptions: StaticAspectOptions, meta: NormalizedModuleMeta) {
    this.applyAspectImports(decoratorId, staticAspectOptions, meta);
    this.applyAspectExports(staticAspectOptions, meta);
    this.normalizeExtensions(staticAspectOptions, meta);
    this.normalizeProvidersAndResolvedCollisions(staticAspectOptions, meta);
    this.normalizeExports(staticAspectOptions, 'Static exports', meta);
    this.assertReexportedModulesAreImported(meta);
  }

  protected applyAspectImports(decoratorId: AnyFn, staticAspectOptions: StaticAspectOptions, meta: NormalizedModuleMeta) {
    if (staticAspectOptions.imports) {
      resolveAllForwardRefs(staticAspectOptions.imports as any).forEach((imp: any) => {
        if (isDynamicModule(imp)) {
          const { module, dynamicAspectOptionsMap, ...dynamicOptions } = imp;
          this.mergeAspectOptionsIntoDynamicModule(decoratorId, dynamicOptions, imp, meta);
        } else if (isDynamicModuleWrapper(imp)) {
          const { dynamicModule, ...dynamicOptions } = imp;
          this.applyBaseOptions(dynamicOptions, dynamicModule);
          this.mergeAspectOptionsIntoDynamicModule(decoratorId, dynamicOptions, dynamicModule, meta);
        } else {
          if (!meta.importedStaticModules.includes(imp)) {
            meta.importedStaticModules.push(imp);
          }
        }
      });
    }
  }

  protected applyAspectExports(staticAspectOptions: StaticAspectOptions, meta: NormalizedModuleMeta) {
    // This part is specific to aspects, so we keep it here or delegate.
    if (staticAspectOptions.exports) {
      resolveAllForwardRefs(staticAspectOptions.exports as any).forEach((exp: any) => {
        if (isDynamicModule(exp)) {
          if (!meta.exportedDynamicModules.includes(exp)) {
            meta.exportedDynamicModules.push(exp);
          }
        } else if (isDynamicModuleWrapper(exp)) {
          if (!meta.exportedDynamicModules.includes(exp.dynamicModule)) {
            meta.exportedDynamicModules.push(exp.dynamicModule);
          }
        } else if (Reflector.getClassLevelMeta(exp, isFeatureModule)) {
          if (!meta.exportedStaticModules.includes(exp)) {
            meta.exportedStaticModules.push(exp);
          }
        }
      });
    }
  }

  normalizeExtensions(
    staticModuleOptions: PickProps<FeatureModuleOptions, 'extensions' | 'extensionsMeta'>,
    meta: NormalizedModuleMeta,
  ) {
    this.extensionsProcessor.normalizeExtensions(staticModuleOptions, meta);
  }

  normalizeProvidersAndResolvedCollisions(
    staticAspectOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    this.providersProcessor.normalizeProvidersAndResolvedCollisions(staticAspectOptions, meta);
  }

  normalizeProviders(moduleOptions: Partial<ProvidersByLevel>, meta: NormalizedModuleMeta) {
    this.providersProcessor.normalizeProviders(moduleOptions, meta);
  }

  normalizeExports(moduleOptions: { exports?: any[] }, action: 'Static exports' | 'Dynamic exports', meta: NormalizedModuleMeta) {
    this.importsExportsProcessor.normalizeExports(moduleOptions, action, meta);
  }

  normalizeAspectMeta(decoratorId: AnyFn, aspectHandler: ModuleAspectHandler, meta: NormalizedModuleMeta) {
    const aspectMeta = aspectHandler.normalize(meta);
    if (aspectMeta) {
      meta.normalizedAspectsMetaMap.set(decoratorId, aspectMeta);
    }
  }

  /**
   * Registers a cloned module aspect on the given module: adds it to `allModuleAspectsMap`
   * and `moduleAspectsMap`, ensures the host module is imported, normalizes the aspect
   * metadata, and applies it to the module's `normalizedAspectsMetaMap`.
   *
   * This is the single entry point used by {@link ModuleAspectPropagator} to register an aspect
   * on a module during the post-scan propagation phase.
   */
  registerAspectOnModule(normalizedModuleMeta: NormalizedModuleMeta, decoratorId: AnyFn, aspectHandler: ModuleAspectHandler): void {
    normalizedModuleMeta.allModuleAspectsMap.set(decoratorId, aspectHandler);
    this.ensureHostModuleImported(aspectHandler, normalizedModuleMeta);
    this.normalizeAspectMeta(decoratorId, aspectHandler, normalizedModuleMeta);
    normalizedModuleMeta.moduleAspectsMap.set(decoratorId, aspectHandler);
  }

  /**
   * Ensures the host module (if any) is added to `importedStaticModules` for the current module,
   * unless the current module itself is the host module.
   */
  ensureHostModuleImported(aspectHandler: ModuleAspectHandler, meta: NormalizedModuleMeta): void {
    const { hostModule } = aspectHandler;
    if (hostModule && hostModule !== meta.modRefId && !meta.importedStaticModules.includes(hostModule)) {
      meta.importedStaticModules.push(hostModule);
    }
  }

  protected mergeAspectOptionsIntoDynamicModule<T extends DynamicModuleOptions>(
    decoratorId: ModuleAspectDecorator<any, T, any>,
    dynamicOptions: T,
    dynamicModule: DynamicModule,
    meta: NormalizedModuleMeta,
  ) {
    dynamicModule.dynamicAspectOptionsMap ??= new Map();
    if (dynamicModule.dynamicAspectOptionsMap.has(decoratorId)) {
      const existingDynamicOptions = dynamicModule.dynamicAspectOptionsMap.get(decoratorId)!;
      dynamicModule.dynamicAspectOptionsMap.set(decoratorId, this.applyBaseOptions(dynamicOptions, existingDynamicOptions));
    } else {
      dynamicModule.dynamicAspectOptionsMap.set(decoratorId, dynamicOptions);
    }
    if (!meta.importedDynamicModules.includes(dynamicModule)) {
      meta.importedDynamicModules.push(dynamicModule);
    }
  }

  protected applyBaseOptions<T1 extends DynamicModuleOptions, T2 extends DynamicModuleOptions>(overrides: T2, base: T1): T1;
  protected applyBaseOptions<T1 extends DynamicModuleOptions>(overrides: AnyObj, base: T1) {
    objectKeys(base).forEach((prop) => {
      if (prop == 'dynamicAspectOptionsMap' || prop == 'module') {
        // ignore
      } else if (Array.isArray(base[prop])) {
        if (base[prop].length) {
          overrides[prop] = (base[prop] as any[]).concat(overrides[prop] || []);
        }
      } else if (base[prop] !== null && typeof base[prop] == 'object') {
        overrides[prop] = Object.assign({}, base[prop], overrides[prop]);
      } else {
        overrides[prop] ??= base[prop];
      }
    });

    return overrides;
  }

  assertResolvedCollisionTokensOnly(
    staticModuleOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    this.providersProcessor.assertResolvedCollisionTokensOnly(staticModuleOptions, meta);
  }

  assertReexportedModulesAreImported(meta: NormalizedModuleMeta) {
    this.importsExportsProcessor.assertReexportedModulesAreImported(meta);
  }
}
