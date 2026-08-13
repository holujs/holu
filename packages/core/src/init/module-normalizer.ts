import type { BaseExtensionConfig } from '#extension/extension-providers-and-configs.js';
import type { AnyObj, Level, PickProps } from '#types/mix.js';
import type { ProvidersByLevel } from '#types/providers-metadata.js';
import type { ModRefId, StaticModule } from '#decorators/module-decorator-options.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import type { DynamicModule, FeatureModuleOptions } from '#decorators/module-decorator-options.js';
import type { ForwardRefFn } from '#di/forward-ref.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import type { StaticAspectOptions, ModuleAspectHandler } from '#decorators/module-aspects.js';
import type { ProviderBuilder } from '#utils/providers.js';
import type { ModuleManager } from '#init/module-manager.js';
import { normalizeExtensionConfig } from '#extension/extension-providers-and-configs.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { resolveForwardRef } from '#di/forward-ref.js';
import { getToken, getTokens } from '#utils/get-tokens.js';
import { normalizeProviders, stringify } from '#utils/ng-utils.js';
import { isExtensionConfig } from '#extension/type-guards.js';
import { objectKeys } from '#utils/object-keys.js';
import { Reflector } from '#di/reflector.js';
import {
  isClassProvider,
  isMultiProvider,
  isNormalizedProvider,
  isTokenProvider,
  isValueProvider,
  type MultiProvider,
} from '#di/utils.js';
import {
  isDynamicModule,
  isRootModule,
  isModuleDecorator,
  isFeatureModule,
  isModuleWithModuleAspect,
  isDynamicModuleWrapper,
} from '#decorators/type-guards.js';
import {
  UndefinedSymbol,
  ResolvedCollisionTokensOnly,
  MissingModuleDecorator,
  InvalidModRefId,
  ReexportFailure,
  InvalidExtension,
  UnknownExport,
  ForbiddenNormalizedExport,
  ForbiddenAppExport,
  EmptyModuleMeta,
} from '#errors';
import type { RootModuleOptions } from '#decorators/root-module.js';
import type { DecoratorMeta } from '#di/top/decorator-and-value.js';
import type { SystemLogMediator } from '#logger/system-log-mediator.js';

/**
 * Normalizes and validates module metadata.
 */
export class ModuleNormalizer {
  protected normalizedModuleMeta: NormalizedModuleMeta;
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
      } else if (this.getDecoratorMeta(exp)?.some(isModuleDecorator)) {
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
    const resolvedCollisionsPerLevel: [any, ModRefId | ForwardRefFn<StaticModule | DynamicModule>][] = [];
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

  applyHostAspectOptions(normalizedModuleMeta: NormalizedModuleMeta, decoratorId: AnyFn, moduleAspect: ModuleAspectHandler) {
    this.normalizedModuleMeta = normalizedModuleMeta;
    this.applyAspectModuleOptions(decoratorId, moduleAspect.moduleOptions);
    this.normalizeAspectMeta(decoratorId, moduleAspect);
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

  /**
   * Registers a cloned module aspect on the given module: adds it to `allModuleAspectsMap`
   * and `moduleAspectMap`, ensures the host module is imported, normalizes the aspect
   * metadata, and applies it to the module's `normalizedAspectMetaMap`.
   *
   * This is the single entry point used by {@link ModuleManager} to register an aspect
   * on a module during the post-scan propagation phase.
   */
  registerAspectOnModule(normalizedModuleMeta: NormalizedModuleMeta, decoratorId: AnyFn, moduleAspect: ModuleAspectHandler): void {
    this.normalizedModuleMeta = normalizedModuleMeta;
    normalizedModuleMeta.allModuleAspectsMap.set(decoratorId, moduleAspect);
    this.ensureHostModuleImported(moduleAspect);
    this.normalizeAspectMeta(decoratorId, moduleAspect);
    normalizedModuleMeta.moduleAspectMap.set(decoratorId, moduleAspect);
  }

  protected processOwnModuleAspects() {
    this.normalizedModuleMeta.moduleAspectMap.forEach((moduleAspect, decoratorId) => {
      this.normalizedModuleMeta.allModuleAspectsMap.set(decoratorId, moduleAspect);
      this.ensureHostModuleImported(moduleAspect);
      this.applyAspectModuleOptions(decoratorId, moduleAspect.moduleOptions);
      this.normalizeAspectMeta(decoratorId, moduleAspect);
    });
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

  protected normalizeAspectMeta(decoratorId: AnyFn, moduleAspect: ModuleAspectHandler) {
    const meta = moduleAspect.normalize(this.normalizedModuleMeta);
    if (meta) {
      this.normalizedModuleMeta.normalizedAspectMetaMap.set(decoratorId, meta);
    }
  }

  protected quickCheckMeta(staticModuleOptions: RootModuleOptions) {
    this.assertResolvedCollisionTokensOnly(staticModuleOptions);
  }

  checkEmptyMeta(normalizedModuleMeta: NormalizedModuleMeta) {
    if (
      !isRootModule(normalizedModuleMeta) &&
      !normalizedModuleMeta.moduleAspectMap.size &&
      !normalizedModuleMeta.exportedProvidersPerMod.length &&
      !normalizedModuleMeta.exportedMultiProvidersPerMod.length &&
      !normalizedModuleMeta.exportedStaticModules.length &&
      !normalizedModuleMeta.providersPerApp.length &&
      !normalizedModuleMeta.exportedDynamicModules.length &&
      !normalizedModuleMeta.exportedExtensionProviders.length &&
      !normalizedModuleMeta.extensionProviders.length
    ) {
      throw new EmptyModuleMeta();
    }
  }
}
