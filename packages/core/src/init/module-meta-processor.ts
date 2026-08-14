import type { BaseExtensionConfig } from '#extension/extension-providers-and-configs.js';
import type { AnyObj, Level, PickProps } from '#types/mix.js';
import type { ProvidersByLevel } from '#types/providers-metadata.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import type { DynamicModule, FeatureModuleOptions } from '#decorators/module-decorator-options.js';
import type { ForwardRefFn } from '#di/forward-ref.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import type { StaticAspectOptions, ModuleAspectHandler } from '#decorators/module-aspects.js';
import type { ProviderBuilder } from '#utils/providers.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { MultiProvider } from '#di/utils.js';
import type { RootModuleOptions } from '#decorators/root-module.js';
import type { ModuleNormalizer } from '#init/module-normalizer.js';
import type { ModuleAspectApplier } from '#init/module-aspect-applier.js';
import { normalizeExtensionConfig } from '#extension/extension-providers-and-configs.js';
import { resolveForwardRef } from '#di/forward-ref.js';
import { getToken, getTokens } from '#utils/get-tokens.js';
import { normalizeProviders, stringify } from '#utils/ng-utils.js';
import { isExtensionConfig } from '#extension/type-guards.js';
import { objectKeys } from '#utils/object-keys.js';
import { Reflector } from '#di/reflector.js';
import { isClassProvider, isMultiProvider, isNormalizedProvider, isTokenProvider, isValueProvider } from '#di/utils.js';
import { isDynamicModule, isModuleDecorator, isFeatureModule, isDynamicModuleWrapper } from '#decorators/type-guards.js';
import { UndefinedSymbol, InvalidExtension, UnknownExport, ForbiddenNormalizedExport, ForbiddenAppExport } from '#errors';

/**
 * Base class containing shared metadata-processing methods used by both
 * {@link ModuleNormalizer} (creation of new metadata) and {@link ModuleAspectApplier}
 * (mutation of existing metadata).
 *
 * All methods operate on the {@link normalizedModuleMeta} instance field, which is
 * set by subclasses before calling any protected method.
 */
export class ModuleMetaProcessor {
  protected normalizedModuleMeta: NormalizedModuleMeta;

  protected normalizeProvidersAndResolvedCollisions(
    staticModuleOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
  ) {
    this.normalizeProviders(staticModuleOptions);
    this.normalizeResolvedCollisions(staticModuleOptions);
  }

  protected normalizeProviders(moduleOptions: Partial<ProvidersByLevel>) {
    (['App', 'Mod', 'Rou', 'Req'] as const).forEach((level) => {
      const providersKey = `providersPer${level}` as const;
      if (moduleOptions[providersKey]) {
        const providersPerLevel = this.resolveAllForwardRefs(moduleOptions[providersKey]);
        this.normalizedModuleMeta[providersKey].push(...providersPerLevel);
      }
    });
  }

  protected normalizeResolvedCollisions(
    staticModuleOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
  ) {
    (['App', 'Mod', 'Rou', 'Req'] as const).forEach((level) => {
      const resolvedCollisionKey = `resolvedCollisionsPer${level}` as const;
      if (staticModuleOptions[resolvedCollisionKey]) {
        staticModuleOptions[resolvedCollisionKey].forEach(([token, module]) => {
          token = resolveForwardRef(token);
          module = resolveForwardRef(module);
          if (isDynamicModule(module)) {
            module.module = resolveForwardRef(module.module);
          }
          this.normalizedModuleMeta[resolvedCollisionKey].push([token, module]);
        });
      }
    });
  }

  protected normalizeExports(moduleOptions: { exports?: any[] }, action: 'Static exports' | 'Dynamic exports') {
    if (!moduleOptions.exports) {
      return;
    }
    const tokensAtAllLevels = getTokens(
      this.normalizedModuleMeta.providersPerApp.concat(
        this.normalizedModuleMeta.providersPerMod,
        this.normalizedModuleMeta.providersPerRou,
        this.normalizedModuleMeta.providersPerReq,
      ),
    );

    this.resolveAllForwardRefs(moduleOptions.exports).forEach((exp, i) => {
      if (exp === undefined) {
        throw new UndefinedSymbol(action, this.normalizedModuleMeta.name, i);
      }
      if (isNormalizedProvider(exp)) {
        throw new ForbiddenNormalizedExport(this.normalizedModuleMeta.name, exp.token.name || exp.token);
      }
      if (isDynamicModule(exp)) {
        if (!this.normalizedModuleMeta.exportedDynamicModules.includes(exp)) {
          this.normalizedModuleMeta.exportedDynamicModules.push(exp);
        }
      } else if (tokensAtAllLevels.includes(exp)) {
        this.exportProviders(exp);
      } else if (Reflector.getClassLevelMeta(exp)?.some(isModuleDecorator)) {
        if (!this.normalizedModuleMeta.exportedStaticModules.includes(exp)) {
          this.normalizedModuleMeta.exportedStaticModules.push(exp);
        }
      } else {
        throw new UnknownExport(this.normalizedModuleMeta.name, stringify(exp));
      }
    });
  }

  protected exportProviders(token: any): void {
    let found = false;
    (['Mod', 'Rou', 'Req'] satisfies Level[]).forEach((level) => {
      const providers = this.normalizedModuleMeta[`providersPer${level}`].filter((p) => getToken(p) === token);
      if (providers.length) {
        found = true;
        if (providers.some(isMultiProvider)) {
          this.normalizedModuleMeta[`exportedMultiProvidersPer${level}`].push(...(providers as MultiProvider[]));
        } else {
          this.normalizedModuleMeta[`exportedProvidersPer${level}`].push(...providers);
        }
      }
    });

    if (!found) {
      const providerName = token.name || token;
      if (this.normalizedModuleMeta.providersPerApp.some((p) => getToken(p) === token)) {
        throw new ForbiddenAppExport(this.normalizedModuleMeta.name, providerName);
      } else {
        throw new UnknownExport(this.normalizedModuleMeta.name, providerName);
      }
    }
  }

  protected normalizeExtensions(staticModuleOptions: PickProps<FeatureModuleOptions, 'extensions' | 'extensionsMeta'>) {
    if (staticModuleOptions.extensionsMeta) {
      this.normalizedModuleMeta.extensionsMeta = {
        ...this.normalizedModuleMeta.extensionsMeta,
        ...staticModuleOptions.extensionsMeta,
      };
    }

    staticModuleOptions.extensions?.forEach((extensionClassOrConfig) => {
      if (!isExtensionConfig(extensionClassOrConfig)) {
        extensionClassOrConfig = { extension: extensionClassOrConfig } as BaseExtensionConfig;
      }
      const normalizedExtensionConfig = normalizeExtensionConfig(extensionClassOrConfig);
      normalizedExtensionConfig.providers.forEach((p) => this.assertValidExtensionProvider(p));
      if (normalizedExtensionConfig.config) {
        this.normalizedModuleMeta.extensionConfigs.push(normalizedExtensionConfig.config);
      }
      if (normalizedExtensionConfig.exportedConfig) {
        this.normalizedModuleMeta.exportedExtensionConfigs.push(normalizedExtensionConfig.exportedConfig);
      }
      this.normalizedModuleMeta.extensionProviders.push(...normalizedExtensionConfig.providers);
      this.normalizedModuleMeta.exportedExtensionProviders.push(...normalizedExtensionConfig.exportedProviders);
      normalizedExtensionConfig.groupTokensMap?.forEach((groupToken, ExtensionCls) => {
        if (!this.normalizedModuleMeta.extensionGroupTokensMap.has(ExtensionCls)) {
          this.normalizedModuleMeta.extensionGroupTokensMap.set(ExtensionCls, groupToken);
          this.normalizedModuleMeta.extensionProviders.unshift({ token: groupToken, useToken: ExtensionCls, multi: true });
        }
      });
      normalizedExtensionConfig.exportedGroupTokensMap?.forEach((groupToken, ExtensionCls) => {
        if (!this.normalizedModuleMeta.exportedExtensionGroupTokensMap.has(ExtensionCls)) {
          this.normalizedModuleMeta.exportedExtensionGroupTokensMap.set(ExtensionCls, groupToken);
        }
      });
    });
  }

  protected assertValidExtensionProvider(extensionsProvider: Provider) {
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
      throw new InvalidExtension(this.normalizedModuleMeta.name, token.name || token);
    }
  }

  protected normalizeAspectMeta(decoratorId: AnyFn, moduleAspect: ModuleAspectHandler) {
    const meta = moduleAspect.normalize(this.normalizedModuleMeta);
    if (meta) {
      this.normalizedModuleMeta.normalizedAspectMetaMap.set(decoratorId, meta);
    }
  }

  /**
   * Ensures the host module (if any) is added to `importedStaticModules` for the current module,
   * unless the current module itself is the host module.
   */
  protected ensureHostModuleImported(moduleAspect: ModuleAspectHandler): void {
    const { hostModule } = moduleAspect;
    if (
      hostModule &&
      hostModule !== this.normalizedModuleMeta.modRefId &&
      !this.normalizedModuleMeta.importedStaticModules.includes(hostModule)
    ) {
      this.normalizedModuleMeta.importedStaticModules.push(hostModule);
    }
  }

  protected applyAspectModuleOptions(decoratorId: AnyFn, aspectOptions: StaticAspectOptions) {
    this.applyAspectImports(decoratorId, aspectOptions);
    this.applyAspectExports(aspectOptions);
    this.normalizeExtensions(aspectOptions);
    this.normalizeProvidersAndResolvedCollisions(aspectOptions);
    this.normalizeExports(aspectOptions, 'Static exports');
  }

  protected applyAspectImports(decoratorId: AnyFn, aspectOptions: StaticAspectOptions) {
    if (aspectOptions.imports) {
      this.resolveAllForwardRefs(aspectOptions.imports).forEach((imp) => {
        if (isDynamicModule(imp)) {
          const params = { ...imp };
          this.mergeAspectOptionsIntoDynamicModule(decoratorId, params, imp);
        } else if (isDynamicModuleWrapper(imp)) {
          const params = { ...imp } as { dynamicModule?: DynamicModule };
          this.mergeAspectOptionObjects(params, imp.dynamicModule);
          delete params.dynamicModule;
          this.mergeAspectOptionsIntoDynamicModule(decoratorId, params, imp.dynamicModule);
        } else {
          if (!this.normalizedModuleMeta.importedStaticModules.includes(imp)) {
            this.normalizedModuleMeta.importedStaticModules.push(imp);
          }
        }
      });
    }
  }

  protected mergeAspectOptionsIntoDynamicModule(decoratorId: AnyFn, params: AnyObj, dynamicModule: DynamicModule) {
    delete params.module;
    delete params.aspectOptions;
    dynamicModule.aspectOptions ??= new Map();
    if (dynamicModule.aspectOptions.has(decoratorId)) {
      const existingParams = dynamicModule.aspectOptions.get(decoratorId)!;
      dynamicModule.aspectOptions.set(decoratorId, this.mergeAspectOptionObjects(params, existingParams));
    } else {
      dynamicModule.aspectOptions.set(decoratorId, params);
    }
    if (!this.normalizedModuleMeta.importedDynamicModules.includes(dynamicModule)) {
      this.normalizedModuleMeta.importedDynamicModules.push(dynamicModule);
    }
  }

  protected mergeAspectOptionObjects(dstn: AnyObj, src: AnyObj) {
    objectKeys(src).forEach((prop) => {
      if (prop == 'aspectOptions' || prop == 'module') {
        // ignore
      } else if (Array.isArray(src[prop])) {
        if (src[prop].length) {
          dstn[prop] = [...src[prop], ...(dstn[prop] || [])];
        }
      } else if (src[prop] !== null && typeof src[prop] == 'object') {
        dstn[prop] ??= {};
        dstn[prop] = Object.assign(src[prop], dstn[prop]);
      } else {
        dstn[prop] ??= src[prop];
      }
    });

    return dstn;
  }

  protected applyAspectExports(aspectOptions: StaticAspectOptions) {
    if (aspectOptions.exports) {
      this.resolveAllForwardRefs(aspectOptions.exports).forEach((exp) => {
        if (isDynamicModule(exp)) {
          if (!this.normalizedModuleMeta.exportedDynamicModules.includes(exp)) {
            this.normalizedModuleMeta.exportedDynamicModules.push(exp);
          }
        } else if (isDynamicModuleWrapper(exp)) {
          if (!this.normalizedModuleMeta.exportedDynamicModules.includes(exp.dynamicModule)) {
            this.normalizedModuleMeta.exportedDynamicModules.push(exp.dynamicModule);
          }
        } else if (Reflector.getClassLevelMeta(exp, isFeatureModule)) {
          if (!this.normalizedModuleMeta.exportedStaticModules.includes(exp)) {
            this.normalizedModuleMeta.exportedStaticModules.push(exp);
          }
        }
      });
    }
  }

  protected resolveAllForwardRefs<T extends ModRefId | Provider | ForwardRefFn | { dynamicModule: DynamicModule }>(
    arr: T[] | ProviderBuilder = [],
  ): Exclude<T, ForwardRefFn>[] {
    return [...arr].map((item) => {
      const resolved = resolveForwardRef(item);
      if (isDynamicModuleWrapper(resolved)) {
        resolved.dynamicModule.module = resolveForwardRef(resolved.dynamicModule.module);
      } else if (isNormalizedProvider(resolved)) {
        resolved.token = resolveForwardRef(resolved.token);
        if (isClassProvider(resolved)) {
          resolved.useClass = resolveForwardRef(resolved.useClass);
        } else if (isTokenProvider(resolved)) {
          resolved.useToken = resolveForwardRef(resolved.useToken);
        }
      } else if (isDynamicModule(resolved)) {
        resolved.module = resolveForwardRef(resolved.module);
      }
      return resolved;
    }) as Exclude<T, ForwardRefFn>[];
  }
}
