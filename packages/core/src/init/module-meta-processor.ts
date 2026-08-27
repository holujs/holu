import type { PickProps, AnyObj, Level } from '#types/mix.js';
import type { ProvidersByLevel } from '#types/providers-metadata.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import type { DynamicModule, FeatureModuleOptions, DynamicModuleOptions, ModRefId } from '#decorators/module-decorator-options.js';
import type { StaticAspectOptions, ModuleAspectHandler, ModuleAspectDecorator } from '#decorators/module-aspects.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { RootModuleOptions } from '#decorators/root-module.js';
import type { BaseExtensionConfig } from '#extension/extension-providers-and-configs.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import type { MultiProvider } from '#di/utils.js';
import type { ForwardRefFn } from '#di/forward-ref.js';
import { objectKeys } from '#utils/object-keys.js';
import { Reflector } from '#di/reflector.js';
import { resolveAllForwardRefs } from '#init/forward-refs-resolver.js';
import { resolveForwardRef } from '#di/forward-ref.js';
import { isDynamicModule, isDynamicModuleWrapper, isFeatureModule, isModuleDecorator, isRootModule } from '#decorators/type-guards.js';
import { isNormalizedProvider, isClassProvider, isTokenProvider, isValueProvider } from '#di/utils.js';
import { normalizeExtensionConfig } from '#extension/extension-providers-and-configs.js';
import { isExtensionConfig } from '#extension/type-guards.js';
import { getToken, getTokens } from '#utils/get-tokens.js';
import { normalizeProviders, stringify } from '#utils/ng-utils.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import {
  InvalidExtension,
  ResolvedCollisionTokensOnly,
  UndefinedSymbol,
  ForbiddenNormalizedExport,
  UnknownExport,
  ForbiddenAppExport,
  ReexportFailure,
} from '#errors';

export const PROVIDER_LEVELS = ['App', 'Mod', 'Rou', 'Req'] as const;
export type ProviderLevel = (typeof PROVIDER_LEVELS)[number];

/**
 * A stateless utility service containing shared metadata-processing methods used by both
 * {@link ModuleNormalizer} (creation of new metadata) and {@link ModuleAspectPropagator}
 * (mutation of existing metadata during aspect propagation).
 */
export class ModuleMetaProcessor {
  normalizeImports(meta: NormalizedModuleMeta) {
    const staticModuleOptions = meta.staticModuleOptions as RootModuleOptions;
    resolveAllForwardRefs(staticModuleOptions.imports).forEach((imp, i: number) => {
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
      resolveAllForwardRefs(staticAspectOptions.imports).forEach((imp) => {
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
      resolveAllForwardRefs(staticAspectOptions.exports).forEach((exp) => {
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
    if (staticModuleOptions.extensionsMeta) {
      meta.extensionsMeta = {
        ...meta.extensionsMeta,
        ...staticModuleOptions.extensionsMeta,
      };
    }

    staticModuleOptions.extensions?.forEach((extensionClassOrConfig) => {
      if (!isExtensionConfig(extensionClassOrConfig)) {
        extensionClassOrConfig = { extension: extensionClassOrConfig } as BaseExtensionConfig;
      }
      const normalizedExtensionConfig = normalizeExtensionConfig(extensionClassOrConfig);
      normalizedExtensionConfig.providers.forEach((p) => this.assertValidExtensionProvider(p, meta));
      if (normalizedExtensionConfig.config) {
        meta.extensionConfigs.push(normalizedExtensionConfig.config);
      }
      if (normalizedExtensionConfig.exportedConfig) {
        meta.exportedExtensionConfigs.push(normalizedExtensionConfig.exportedConfig);
      }
      meta.extensionProviders.push(...normalizedExtensionConfig.providers);
      meta.exportedExtensionProviders.push(...normalizedExtensionConfig.exportedProviders);
      normalizedExtensionConfig.groupTokensMap?.forEach((groupToken, LeadExtensionCls) => {
        if (!meta.extensionGroupTokensMap.has(LeadExtensionCls)) {
          meta.extensionGroupTokensMap.set(LeadExtensionCls, groupToken);
          meta.extensionProviders.unshift({ token: groupToken, useToken: LeadExtensionCls, multi: true });
        }
      });
      normalizedExtensionConfig.exportedGroupTokensMap?.forEach((groupToken, ExtensionCls) => {
        if (!meta.exportedExtensionGroupTokensMap.has(ExtensionCls)) {
          meta.exportedExtensionGroupTokensMap.set(ExtensionCls, groupToken);
        }
      });
    });
  }

  protected assertValidExtensionProvider(extensionsProvider: Provider, meta: NormalizedModuleMeta) {
    const np = normalizeProviders([extensionsProvider])[0];
    let ExtensionCls: ExtensionClass | undefined;
    if (isClassProvider(np)) {
      ExtensionCls = resolveForwardRef(np.useClass);
    } else if (isTokenProvider(np) && np.useToken instanceof Function) {
      ExtensionCls = resolveForwardRef(np.useToken);
    } else if (isValueProvider(np) && np.useValue.constructor instanceof Function) {
      ExtensionCls = np.useValue.constructor;
    }

    if (
      !ExtensionCls ||
      (typeof ExtensionCls.prototype?.stage1 != 'function' &&
        typeof ExtensionCls.prototype?.stage2 != 'function' &&
        typeof ExtensionCls.prototype?.stage3 != 'function')
    ) {
      const token = getToken(extensionsProvider);
      throw new InvalidExtension(meta.name, token.name || token);
    }
  }

  normalizeProvidersAndResolvedCollisions(
    moduleOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    this.normalizeProviders(moduleOptions, meta);
    this.normalizeResolvedCollisions(moduleOptions, meta);
  }

  normalizeProviders(moduleOptions: Partial<ProvidersByLevel>, meta: NormalizedModuleMeta) {
    PROVIDER_LEVELS.forEach((level) => {
      const providersKey = `providersPer${level}` as const;
      if (moduleOptions[providersKey]) {
        meta[providersKey].push(...resolveAllForwardRefs(moduleOptions[providersKey]));
      }
    });
  }

  protected normalizeResolvedCollisions(
    staticAspectOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    PROVIDER_LEVELS.forEach((level) => {
      const resolvedCollisionKey = `resolvedCollisionsPer${level}` as const;
      if (staticAspectOptions[resolvedCollisionKey]) {
        staticAspectOptions[resolvedCollisionKey]!.forEach(([token, module]) => {
          token = resolveForwardRef(token);
          module = resolveForwardRef(module);
          if (isDynamicModule(module)) {
            module.module = resolveForwardRef(module.module);
          }
          meta[resolvedCollisionKey].push([token, module]);
        });
      }
    });
  }

  normalizeExports(moduleOptions: { exports?: any[] }, action: 'Static exports' | 'Dynamic exports', meta: NormalizedModuleMeta) {
    if (!moduleOptions.exports) {
      return;
    }
    const tokensAtAllLevels = getTokens(meta.providersPerApp.concat(meta.providersPerMod, meta.providersPerRou, meta.providersPerReq));

    resolveAllForwardRefs(moduleOptions.exports).forEach((exp, i: number) => {
      if (exp === undefined) {
        throw new UndefinedSymbol(action, meta.name, i);
      }
      if (isNormalizedProvider(exp)) {
        throw new ForbiddenNormalizedExport(meta.name, exp.token.name || exp.token);
      }
      if (isDynamicModule(exp)) {
        if (!meta.exportedDynamicModules.includes(exp)) {
          meta.exportedDynamicModules.push(exp);
        }
      } else if (tokensAtAllLevels.includes(exp)) {
        this.exportProviders(exp, meta);
      } else if (Reflector.getClassLevelMeta(exp)?.some(isModuleDecorator)) {
        if (!meta.exportedStaticModules.includes(exp)) {
          meta.exportedStaticModules.push(exp);
        }
      } else {
        throw new UnknownExport(meta.name, stringify(exp));
      }
    });
  }

  protected exportProviders(token: any, meta: NormalizedModuleMeta): void {
    let found = false;
    (['Mod', 'Rou', 'Req'] satisfies Level[]).forEach((level) => {
      const providers = meta[`providersPer${level}`].filter((p) => getToken(p) === token);
      if (providers.length) {
        found = true;
        if (providers.some((p) => (p as MultiProvider).multi)) {
          meta[`exportedMultiProvidersPer${level}`].push(...(providers as MultiProvider[]));
        } else {
          meta[`exportedProvidersPer${level}`].push(...providers);
        }
      }
    });

    if (!found) {
      const providerName = token.name || token;
      if (meta.providersPerApp.some((p) => getToken(p) === token)) {
        throw new ForbiddenAppExport(meta.name, providerName);
      } else {
        throw new UnknownExport(meta.name, providerName);
      }
    }
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
          overrides[prop] = base[prop].concat(overrides[prop] || []);
        }
      } else if (base[prop] !== null && typeof base[prop] == 'object') {
        overrides[prop] = Object.assign({}, base[prop], overrides[prop]);
      } else {
        overrides[prop] ??= base[prop];
      }
    });

    return overrides;
  }

  assertResolvedCollisionTokensOnly(meta: NormalizedModuleMeta<RootModuleOptions>) {
    const resolvedCollisionsPerLevel: [any, ModRefId | ForwardRefFn][] = [];
    PROVIDER_LEVELS.forEach((level) => {
      const collisions = meta.staticModuleOptions?.[`resolvedCollisionsPer${level}` as const];
      if (Array.isArray(collisions)) {
        resolvedCollisionsPerLevel.push(...collisions);
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

  assertReexportedModulesAreImported(meta: NormalizedModuleMeta) {
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
}
