import { DeepModulesImporter } from '#init/deep-modules-importer.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { BaseAppOptions } from '#init/base-app-options.js';
import { ShallowModulesImporter } from '#init/shallow-modules-importer.js';
import { ExtensionStatistics } from '#extension/counter.js';
import { defaultProvidersPerApp } from './default-providers-per-app.js';
import { ExtensionContext } from '#extension/extensions-context.js';
import { ExtensionManager, InternalExtensionManager } from '#extension/extension-manager.js';
import { ModuleManager } from '#init/module-manager.js';
import { MutableModuleManager } from '#init/mutable-module-manager.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { Provider } from '#di/top/types-and-models.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import { ExtensionCounters } from '#extension/extension-types.js';
import { getCollisions } from '#utils/get-collisions.js';
import { getDuplicates } from '#utils/get-duplicates.js';
import { getLastProviders } from '#utils/get-last-providers.js';
import { getProvidersTargets, getToken, getTokens } from '#utils/get-tokens.js';
import { normalizeProviders } from '#utils/ng-utils.js';
import { ResolvedModuleMeta } from '#types/metadata-per-mod.js';
import { getProviderName } from '#utils/get-provider-name.js';
import { getModule } from '#utils/get-module.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import type { ShallowModuleImports } from './types.js';
import type { ProvidersByLevel } from '#types/providers-metadata.js';
import {
  MetadataCollectionFailure,
  ModuleInjectorCreationFailure,
  Stage2InitFailure,
  Stage3InitFailure,
  ModuleNotImported,
  AppMultiProviderCollision,
  AppProviderMissingToken,
  ProvidersCollision,
  MetaOverrideFailure,
} from '#errors';
import type { OnModuleInit } from './hooks.js';
import { isMultiProvider } from '#di/utils.js';
import { Injector } from '#di/injector.js';
import { PROVIDERS_PER_APP } from './constants.js';

import { AppReinitializer } from './app-reinitializer.js';
import { BaseAppInitializer } from './base-app-initializer.js';

export class AppInitializer implements BaseAppInitializer {
  protected normalizedModuleMeta: NormalizedModuleMeta;
  protected injectorPerApp: Injector;

  constructor(
    protected baseAppOptions: BaseAppOptions,
    protected moduleManager: ModuleManager,
    public log: SystemLogMediator,
  ) {}

  /**
   * _Note:_ after call this method, you need call `this.systemLogMediator.flush()`.
   */
  bootstrapProvidersPerApp() {
    this.normalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta('root', true);
    this.prepareProvidersPerApp();
    this.addDefaultProvidersPerApp();
    this.createInjectorAndSetLogMediator();
  }

  /**
   * 1. checks collisions for non-root exported providers per app;
   * 2. merges these providers with providers that declared on the root module;
   * 3. merges resolved providers per app.
   */
  protected prepareProvidersPerApp() {
    // Here we work only with providers declared at the application level.

    const exportedProviders = this.moduleManager.providersPerApp;
    const exportedNormProviders = normalizeProviders(exportedProviders);
    const exportedTokens = exportedNormProviders.map((np) => np.token);
    const exportedMultiTokens = exportedNormProviders.filter((np) => np.multi).map((np) => np.token);
    const resolvedTokens = this.normalizedModuleMeta.resolvedCollisionsPerApp.map(([token]) => token);
    const defaultTokens = getTokens(defaultProvidersPerApp);
    const rootTokens = getTokens(this.normalizedModuleMeta.providersPerApp);
    const mergedTokens = [...exportedTokens, ...defaultTokens];
    const exportedTokensDuplicates = getDuplicates(mergedTokens).filter(
      (d) => ![...resolvedTokens, ...rootTokens, ...exportedMultiTokens].includes(d),
    );
    const mergedProviders = [...defaultProvidersPerApp, ...exportedProviders];
    const collisions = getCollisions(exportedTokensDuplicates, mergedProviders);
    if (collisions.length) {
      const modulesNames = this.findModulesCausedCollisions(collisions);
      throw new ProvidersCollision(this.normalizedModuleMeta.name, collisions, modulesNames, 'App');
    }
    exportedProviders.push(...this.getResolvedCollisionsPerApp());
    this.normalizedModuleMeta.providersPerApp.unshift(...getLastProviders(exportedProviders));
  }

  protected findModulesCausedCollisions(collisions: any[]) {
    const modulesNames: string[] = [];

    this.moduleManager.modulesMap.forEach((meta) => {
      const tokens = getTokens(meta.providersPerApp);
      const moduleCausesCollisions = tokens.some((t) => collisions.includes(t));
      if (moduleCausesCollisions) {
        modulesNames.push(meta.name);
      }
    });

    return modulesNames;
  }

  protected getResolvedCollisionsPerApp() {
    const rootModuleName = this.moduleManager.getNormalizedModuleMeta('root', true).name;
    const resolvedProviders: Provider[] = [];
    this.normalizedModuleMeta.resolvedCollisionsPerApp.forEach(([token, modRefId]) => {
      const moduleName = getDebugClassName(modRefId) || 'unknown';
      const tokenName = token.name || token;
      const normalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta(modRefId);
      if (!normalizedModuleMeta) {
        throw new ModuleNotImported(rootModuleName, moduleName, tokenName);
      }
      const provider = getLastProviders(normalizedModuleMeta.providersPerApp).find((p) => getToken(p) === token);
      if (!provider) {
        throw new AppProviderMissingToken(rootModuleName, moduleName, tokenName);
      }
      if (isMultiProvider(provider)) {
        throw new AppMultiProviderCollision(rootModuleName, moduleName, tokenName);
      }
      resolvedProviders.push(provider);
    });

    return resolvedProviders;
  }

  async bootstrapModulesAndExtensions() {
    const deepModulesImporter = new DeepModulesImporter({
      moduleManager: this.moduleManager,
      shallowModuleImportsMap: this.collectProvidersShallow(this.moduleManager),
      providersPerApp: this.normalizedModuleMeta.providersPerApp,
      log: this.log,
    });
    const { extensionCounters, resolvedModuleMetaMap } = deepModulesImporter.importModulesDeep();
    await this.handleExtensions(resolvedModuleMetaMap, extensionCounters);
    return this.injectorPerApp;
  }

  protected addDefaultProvidersPerApp() {
    const providers: Provider[] = [
      ...defaultProvidersPerApp,
      { token: BaseAppOptions, useValue: this.baseAppOptions },
      { token: ModuleManager, useValue: this.moduleManager },
      { token: BaseAppInitializer, useValue: this },
    ];
    if (this.moduleManager instanceof MutableModuleManager) {
      providers.push(AppReinitializer, { token: MutableModuleManager, useValue: this.moduleManager });
    }
    this.normalizedModuleMeta.providersPerApp.unshift(...providers);
  }

  /**
   * Creates injector per the application and sets log.
   */
  protected createInjectorAndSetLogMediator() {
    this.injectorPerApp = Injector.resolveAndCreate(this.normalizedModuleMeta.providersPerApp, 'App');
    this.log = this.injectorPerApp.get(SystemLogMediator) as SystemLogMediator;
    return this.injectorPerApp;
  }

  protected collectProvidersShallow(moduleManager: ModuleManager) {
    const shallowModulesImporter1 = new ShallowModulesImporter();
    const appProviders = shallowModulesImporter1.exportAppProviders(moduleManager);
    this.log.printAppProviders(this, appProviders);
    const shallowModulesImporter2 = new ShallowModulesImporter();
    const { modRefId, allModuleAspectsMap } = moduleManager.getNormalizedModuleMeta('root', true);
    const shallowModuleImportsMap = shallowModulesImporter2.importModulesShallow({
      appProviders,
      modRefId,
      moduleManager,
      unfinishedScanModules: new Set(),
    });
    if (allModuleAspectsMap.size == 0) {
      return shallowModuleImportsMap;
    }
    const mergedShallowModuleImportsMap: Map<ModRefId, ShallowModuleImports> = new Map();
    // @todo Refactor this.
    allModuleAspectsMap.forEach((moduleAspect, decorator) => {
      const val = moduleAspect.importModulesShallow({
        moduleManager,
        appProviders,
        modRefId,
        unfinishedScanModules: new Set(),
      });
      shallowModuleImportsMap.forEach((shallowModuleImports, modRefId) => {
        const shallowImportedModule = val.get(modRefId)!;
        const mergedShallowModuleImports = mergedShallowModuleImportsMap.get(modRefId);
        if (mergedShallowModuleImports) {
          mergedShallowModuleImports.initImportRegistryMap.set(decorator, shallowImportedModule);
        } else {
          mergedShallowModuleImportsMap.set(modRefId, {
            ...shallowModuleImports,
            initImportRegistryMap: new Map([[decorator, shallowImportedModule]]),
          });
        }
      });
    });
    return mergedShallowModuleImportsMap;
  }

  protected async handleExtensions(resolvedModuleMetaMap: Map<ModRefId, ResolvedModuleMeta>, extensionCounters: ExtensionCounters) {
    const extensionContext = new ExtensionContext();

    for (const [, resolvedModuleMeta] of resolvedModuleMetaMap) {
      const { normalizedModuleMeta, orderedExtensions } = this.overrideMetaBeforeExtensionHanling(
        resolvedModuleMeta.normalizedModuleMeta,
        resolvedModuleMeta.orderedExtensions,
      );
      const injectorPerMod = this.injectorPerApp.resolveAndCreateChild(normalizedModuleMeta.providersPerMod, 'Mod');
      const systemLogMediator = injectorPerMod.pull(SystemLogMediator) as SystemLogMediator;
      const { extensionProviders } = normalizedModuleMeta;
      if (!extensionProviders.length) {
        systemLogMediator.skippingStartExtensions(this);
        continue;
      }
      const providers = this.getProvidersForExtensions(resolvedModuleMeta, extensionCounters, extensionContext);
      const injectorForExtensions = injectorPerMod.resolveAndCreateChild(providers, 'injectorOfExtensions');
      const extensionManager = injectorForExtensions.get(InternalExtensionManager) as InternalExtensionManager;

      systemLogMediator.startExtensions(this);
      this.decreaseExtensionsCounters(extensionCounters, extensionProviders);
      await this.handleExtensionsPerMod(normalizedModuleMeta, orderedExtensions, extensionManager, systemLogMediator);
      this.logExtensionsStatistic(this.injectorPerApp, systemLogMediator);
    }
    await this.perAppHandling(resolvedModuleMetaMap, extensionContext);
  }

  protected async perAppHandling(resolvedModuleMetaMap: Map<ModRefId, ResolvedModuleMeta>, extensionContext: ExtensionContext) {
    for (const [ExtCls, extensionsMap] of extensionContext.extensionPendingMap) {
      for (const extension of extensionsMap.values()) {
        try {
          await extension.stage1?.(true);
        } catch (err: any) {
          const groupName = getProviderName(ExtCls);
          throw new MetadataCollectionFailure(groupName, err);
        }
      }
    }

    for (const [modRefId, { normalizedModuleMeta }] of resolvedModuleMetaMap) {
      try {
        this.overrideMetaAfterStage1(normalizedModuleMeta.modRefId, normalizedModuleMeta);
        normalizedModuleMeta.normalizedAspectMetaMap.forEach((meta) =>
          this.overrideMetaAfterStage1(normalizedModuleMeta.modRefId, meta),
        );
      } catch (err: any) {
        const debugModuleName = getDebugClassName(modRefId) || 'unknown';
        throw new MetaOverrideFailure(debugModuleName, err);
      }
    }

    // After the extensions have added new providers, injectorPerApp needs to be recreated one last time.
    this.createInjectorAndSetLogMediator();

    for (const [modRefId, { normalizedModuleMeta }] of resolvedModuleMetaMap) {
      try {
        const injectorPerMod = await this.initModuleAndGetInjectorPerMod(normalizedModuleMeta);
        this.moduleManager.setInjectorPerMod(modRefId, injectorPerMod);
      } catch (err: any) {
        const debugModuleName = getDebugClassName(modRefId) || 'unknown';
        throw new ModuleInjectorCreationFailure(debugModuleName, err);
      }
    }

    for (const [modRefId, extensionSet] of extensionContext.stageMap) {
      for (const ext of extensionSet) {
        try {
          if (!ext.stage2) {
            continue;
          }
          const injectorPerMod = this.moduleManager.getInjectorPerMod(modRefId, true);
          await ext.stage2(injectorPerMod);
        } catch (err: any) {
          const debugModuleName = getDebugClassName(modRefId) || 'unknown';
          throw new Stage2InitFailure(debugModuleName, ext.constructor.name, err);
        }
      }
    }

    for (const [modRefId, extensionSet] of extensionContext.stageMap) {
      for (const ext of extensionSet) {
        try {
          if (!ext.stage3) {
            continue;
          }
          await ext.stage3();
        } catch (err: any) {
          const debugModuleName = getDebugClassName(modRefId) || 'unknown';
          throw new Stage3InitFailure(debugModuleName, ext.constructor.name, err);
        }
      }
    }
  }

  protected async initModuleAndGetInjectorPerMod(normalizedModuleMeta: NormalizedModuleMeta): Promise<Injector> {
    const Mod = getModule(normalizedModuleMeta.modRefId);
    const extendedProvidersPerMod = [Mod, ...normalizedModuleMeta.providersPerMod];
    const injectorPerApp = this.injectorPerApp;
    const injectorPerMod = injectorPerApp.resolveAndCreateChild(extendedProvidersPerMod, 'Mod');
    await (injectorPerMod.get(Mod) as Partial<OnModuleInit>).onModuleInit?.(); // Instantiate the class of the module and call the hook.
    return injectorPerMod;
  }

  /**
   * Note that this method is used for `@holu/testing`.
   */
  protected getProvidersForExtensions(
    resolvedModuleMeta: ResolvedModuleMeta,
    extensionCounters: ExtensionCounters,
    extensionContext: ExtensionContext,
  ): Provider[] {
    return [
      InternalExtensionManager,
      { token: ExtensionManager, useToken: InternalExtensionManager },
      { token: ExtensionContext, useValue: extensionContext },
      { token: ResolvedModuleMeta, useValue: resolvedModuleMeta },
      { token: ExtensionCounters, useValue: extensionCounters },
      { token: PROVIDERS_PER_APP, useValue: this.normalizedModuleMeta.providersPerApp },
      ...resolvedModuleMeta.normalizedModuleMeta.extensionProviders,
    ];
  }

  protected async handleExtensionsPerMod(
    normalizedModuleMeta: NormalizedModuleMeta,
    orderedExtensions: ExtensionClass[],
    extensionManager: InternalExtensionManager,
    systemLogMediator: SystemLogMediator,
  ) {
    systemLogMediator.sequenceOfExtensions(this, orderedExtensions);
    await extensionManager.internalStage1(normalizedModuleMeta, orderedExtensions);
  }

  /**
   * This method is needed to be able to override the metadata during testing.
   *
   * See `TestAppInitializer` in `@holu/testing` for more info.
   */
  protected overrideMetaBeforeExtensionHanling(normalizedModuleMeta: NormalizedModuleMeta, orderedExtensions: ExtensionClass[]) {
    return { normalizedModuleMeta, orderedExtensions };
  }

  /**
   * This method is needed to be able to override the metadata during testing.
   *
   * See `TestAppInitializer` in `@holu/testing` for more info.
   */
  protected overrideMetaAfterStage1(modRefId: ModRefId, providersByLevel: ProvidersByLevel): void {}

  protected decreaseExtensionsCounters(extensionCounters: ExtensionCounters, providers: Provider[]) {
    const { extensionsMap } = extensionCounters;
    const uniqTargets = new Set<Provider>(getProvidersTargets(providers));

    uniqTargets.forEach((target) => {
      const counter = extensionsMap.get(target)!;
      extensionsMap.set(target, counter - 1);
    });
  }

  protected logExtensionsStatistic(injectorPerApp: Injector, systemLogMediator: SystemLogMediator) {
    const counter = injectorPerApp.get(ExtensionStatistics);
    const extensions = counter.getInitedExtensions();
    const names = Array.from(extensions)
      .map((e) => e.constructor.name)
      .join(', ');
    systemLogMediator.totalInitedExtensions(this, extensions.size, names);
    counter.resetInitedExtensionsSet();
  }
}
