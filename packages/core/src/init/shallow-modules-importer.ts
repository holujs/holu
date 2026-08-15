import { Reflector } from '#di/reflector.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModuleManager } from '#init/module-manager.js';
import type { AppProviders } from '#types/metadata-per-mod.js';
import { ImportedProvider } from '#types/metadata-per-mod.js';
import type { Level, AnyObj } from '#types/mix.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import { ShallowModuleImports } from '#init/types.js';
import { getCollisions } from '#utils/get-collisions.js';
import { getImportedProviders, getImportedTokens } from '#utils/get-imports.js';
import { getLastProviders } from '#utils/get-last-providers.js';
import { getToken, getTokens } from '#utils/get-tokens.js';
import { hasDeclaredInDir } from '#decorators/type-guards.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import type { ExtensionConfig, OverrideExtensionConfig } from '#extension/extension-providers-and-configs.js';
import { isOverrideExtensionConfig } from '#extension/extension-providers-and-configs.js';
import { findCycle } from '#extension/tarjan-graph.js';
import { getProviderName } from '#utils/get-provider-name.js';
import { topologicalSort } from '#extension/topological-sort.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import {
  ExtensionCyclicDependency,
  LevelCollisionNotFound,
  LevelCollisionNotImported,
  AppCollisionNotFound,
  LevelMultiProviderCollision,
  ProvidersCollision,
  InvalidCollisionResolution,
} from '#errors';
import { defaultProvidersPerMod } from './default-providers-per-mod.js';
import type { ExtensionGroupToken } from '#di/key-registry.js';

/**
 * Recursively collects providers taking into account module imports/exports,
 * but does not take provider dependencies into account.
 *
 * Also:
 * - exports app providers;
 * - merges app and local providers;
 * - checks on providers collisions.
 */
export class ShallowModulesImporter {
  protected moduleName: string;
  /**
   * Module metadata.
   */
  protected normalizedModuleMeta: NormalizedModuleMeta;
  protected resolvedCollision = new Map<any, Set<Level>>();

  protected importedProvidersPerMod = new Map<any, ImportedProvider>();
  protected importedProvidersPerRou = new Map<any, ImportedProvider>();
  protected importedProvidersPerReq = new Map<any, ImportedProvider>();
  protected importedMultiProvidersPerMod = new Map<ModRefId, Provider[]>();
  protected importedMultiProvidersPerRou = new Map<ModRefId, Provider[]>();
  protected importedMultiProvidersPerReq = new Map<ModRefId, Provider[]>();
  protected importedExtensionProviders = new Map<ModRefId, Provider[]>();
  protected importedExtensionGroupTokens = new Map<ModRefId, Map<ExtensionClass, ExtensionGroupToken>>();
  protected importedExtensionConfigs: ExtensionConfig[] = [];

  /**
   * AppProviders.
   */
  protected appProviders: AppProviders;
  protected shallowModuleImportsMap = new Map<ModRefId, ShallowModuleImports>();
  protected scanningModules = new Set<ModRefId>();
  protected unfinishedExportModules = new Set<ModRefId>();
  protected moduleManager: ModuleManager;

  exportAppProviders(moduleManager: ModuleManager): AppProviders {
    this.moduleManager = moduleManager;
    const normalizedModuleMeta = moduleManager.getNormalizedModuleMeta('root', true);
    this.moduleName = normalizedModuleMeta.name;
    this.normalizedModuleMeta = normalizedModuleMeta;
    this.importProvidersAndExtensions(normalizedModuleMeta);
    // this.checkAllCollisionsWithLevelsMix();
    const aspectValueMap = new Map<AnyFn, AnyObj>();
    const appProviders: AppProviders = {
      importedProvidersPerMod: this.importedProvidersPerMod,
      importedProvidersPerRou: this.importedProvidersPerRou,
      importedProvidersPerReq: this.importedProvidersPerReq,
      importedMultiProvidersPerMod: this.importedMultiProvidersPerMod,
      importedMultiProvidersPerRou: this.importedMultiProvidersPerRou,
      importedMultiProvidersPerReq: this.importedMultiProvidersPerReq,
      importedExtensionProviders: this.importedExtensionProviders,
      importedExtensionGroupTokens: this.importedExtensionGroupTokens,
      importedExtensionConfigs: this.importedExtensionConfigs,
      aspectValueMap,
    };

    normalizedModuleMeta.allModuleAspectsMap.forEach((moduleAspect, decorator) => {
      const val = moduleAspect.exportAppProviders({ moduleManager, appProviders, normalizedModuleMeta });
      aspectValueMap.set(decorator, val);
    });

    return appProviders;
  }

  importModulesShallow({
    appProviders,
    modRefId,
    moduleManager,
    scanningModules,
  }: {
    appProviders: AppProviders;
    modRefId: ModRefId;
    moduleManager: ModuleManager;
    scanningModules: Set<ModRefId>;
  }): Map<ModRefId, ShallowModuleImports> {
    const normalizedModuleMeta = moduleManager.getNormalizedModuleMeta(modRefId, true);
    this.moduleManager = moduleManager;
    this.appProviders = appProviders;
    this.moduleName = normalizedModuleMeta.name;
    this.scanningModules = scanningModules;
    this.normalizedModuleMeta = normalizedModuleMeta;
    this.importAndScanModules();

    let perMod: Map<any, ImportedProvider>;
    let perRou: Map<any, ImportedProvider>;
    let perReq: Map<any, ImportedProvider>;
    let multiPerMod: Map<ModRefId, Provider[]>;
    let multiPerRou: Map<ModRefId, Provider[]>;
    let multiPerReq: Map<ModRefId, Provider[]>;
    let extensionProviders: Map<ModRefId, Provider[]>;
    let extensionGroupTokens: Map<ModRefId, Map<ExtensionClass, ExtensionGroupToken>>;
    let extensionConfigs: ExtensionConfig[];
    if (normalizedModuleMeta.isExternal) {
      // External modules do not require app providers and extensions from the application.
      perMod = new Map([...this.importedProvidersPerMod]);
      perRou = new Map([...this.importedProvidersPerRou]);
      perReq = new Map([...this.importedProvidersPerReq]);
      multiPerMod = new Map([...this.importedMultiProvidersPerMod]);
      multiPerRou = new Map([...this.importedMultiProvidersPerRou]);
      multiPerReq = new Map([...this.importedMultiProvidersPerReq]);
      extensionProviders = new Map([...this.importedExtensionProviders]);
      extensionGroupTokens = new Map([...this.importedExtensionGroupTokens]);
      extensionConfigs = [...this.importedExtensionConfigs];
    } else {
      this.appProviders.aspectValueMap.forEach(({ moduleAspect }, decorator) => {
        if (moduleAspect && !normalizedModuleMeta.allModuleAspectsMap.has(decorator)) {
          normalizedModuleMeta.allModuleAspectsMap.set(decorator, moduleAspect);
        }
      });
      perMod = new Map([...this.appProviders.importedProvidersPerMod, ...this.importedProvidersPerMod]);
      perRou = new Map([...this.appProviders.importedProvidersPerRou, ...this.importedProvidersPerRou]);
      perReq = new Map([...this.appProviders.importedProvidersPerReq, ...this.importedProvidersPerReq]);
      multiPerMod = new Map([...this.appProviders.importedMultiProvidersPerMod, ...this.importedMultiProvidersPerMod]);
      multiPerRou = new Map([...this.appProviders.importedMultiProvidersPerRou, ...this.importedMultiProvidersPerRou]);
      multiPerReq = new Map([...this.appProviders.importedMultiProvidersPerReq, ...this.importedMultiProvidersPerReq]);
      extensionProviders = new Map([...this.appProviders.importedExtensionProviders, ...this.importedExtensionProviders]);
      extensionGroupTokens = new Map([...this.appProviders.importedExtensionGroupTokens, ...this.importedExtensionGroupTokens]);
      extensionConfigs = [...this.appProviders.importedExtensionConfigs, ...this.importedExtensionConfigs];
    }

    const allExtensionConfigs = normalizedModuleMeta.extensionConfigs.concat(extensionConfigs);
    this.checkExtensionsGraph(allExtensionConfigs);
    const orderedExtensions = topologicalSort<ExtensionClass>(allExtensionConfigs, true);

    return this.shallowModuleImportsMap.set(
      modRefId,
      new ShallowModuleImports(this.normalizedModuleMeta, orderedExtensions, {
        perMod,
        perRou,
        perReq,
        multiPerMod,
        multiPerRou,
        multiPerReq,
        extensionProviders,
        extensionGroupTokens,
      }),
    );
  }

  protected importAndScanModules() {
    this.importModules();

    this.normalizedModuleMeta.allModuleAspectsMap.forEach((moduleAspect, decorator) => {
      const meta = this.normalizedModuleMeta.normalizedAspectMetaMap.get(decorator);
      for (const modRefId of moduleAspect.getModulesToScan(meta)) {
        if (this.scanningModules.has(modRefId)) {
          continue;
        }
        this.scanModule(modRefId);
      }
    });
  }

  protected importModules() {
    const modRefIdss = this.normalizedModuleMeta.importedStaticModules.concat(
      this.normalizedModuleMeta.importedDynamicModules as any[],
    ) as ModRefId[];
    for (const modRefId of modRefIdss) {
      const normalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta(modRefId, true);
      this.importProvidersAndExtensions(normalizedModuleMeta);
      if (this.scanningModules.has(modRefId)) {
        continue;
      }
      this.scanModule(modRefId);
    }
    // this.checkAllCollisionsWithLevelsMix();
  }

  protected scanModule(modRefId: ModRefId) {
    const shallowModulesImporter = new ShallowModulesImporter();
    this.scanningModules.add(modRefId);
    const shallowModuleImportsMap = shallowModulesImporter.importModulesShallow({
      appProviders: this.appProviders,
      modRefId,
      moduleManager: this.moduleManager,
      scanningModules: this.scanningModules,
    });
    this.scanningModules.delete(modRefId);
    shallowModuleImportsMap.forEach((val, key) => this.shallowModuleImportsMap.set(key, val));
  }

  /**
   * Recursively imports providers and extensions.
   *
   * @param normalizedModuleMeta1 Module metadata from where imports providers.
   */
  protected importProvidersAndExtensions(normalizedModuleMeta1: NormalizedModuleMeta, reexporter?: ModRefId) {
    const { modRefId, exportedStaticModules, exportedDynamicModules } = normalizedModuleMeta1;

    for (const modRefId2 of [...exportedStaticModules, ...exportedDynamicModules]) {
      if (this.unfinishedExportModules.has(modRefId2)) {
        continue;
      }
      const normalizedModuleMeta2 = this.moduleManager.getNormalizedModuleMeta(modRefId2, true);
      this.unfinishedExportModules.add(normalizedModuleMeta2.modRefId);
      this.importProvidersAndExtensions(normalizedModuleMeta2, normalizedModuleMeta1.modRefId); // Reexports module
      this.unfinishedExportModules.delete(normalizedModuleMeta2.modRefId);
    }

    this.addProviders('Mod', normalizedModuleMeta1, reexporter);
    this.addProviders('Rou', normalizedModuleMeta1, reexporter);
    this.addProviders('Req', normalizedModuleMeta1, reexporter);
    if (normalizedModuleMeta1.exportedMultiProvidersPerMod.length) {
      this.importedMultiProvidersPerMod.set(modRefId, normalizedModuleMeta1.exportedMultiProvidersPerMod);
    }
    if (normalizedModuleMeta1.exportedMultiProvidersPerRou.length) {
      this.importedMultiProvidersPerRou.set(modRefId, normalizedModuleMeta1.exportedMultiProvidersPerRou);
    }
    if (normalizedModuleMeta1.exportedMultiProvidersPerReq.length) {
      this.importedMultiProvidersPerReq.set(modRefId, normalizedModuleMeta1.exportedMultiProvidersPerReq);
    }
    if (normalizedModuleMeta1.exportedExtensionProviders.length) {
      this.importedExtensionProviders.set(normalizedModuleMeta1.modRefId, normalizedModuleMeta1.exportedExtensionProviders);
      this.importedExtensionGroupTokens.set(normalizedModuleMeta1.modRefId, normalizedModuleMeta1.exportedExtensionGroupTokensMap);
      this.importedExtensionConfigs.push(...normalizedModuleMeta1.exportedExtensionConfigs);
    }
    this.throwIfTryResolvingMultiprovidersCollisions(normalizedModuleMeta1.name);
  }

  protected addProviders(level: Level, normalizedModuleMeta: NormalizedModuleMeta, reexporter?: ModRefId) {
    normalizedModuleMeta[`exportedProvidersPer${level}`].forEach((provider) => {
      const token1 = getToken(provider);
      const importedProvider = this[`importedProvidersPer${level}`].get(token1);

      if (importedProvider && importedProvider.reexporter !== normalizedModuleMeta.modRefId) {
        this.checkCollisionsPerLevel(normalizedModuleMeta.modRefId, level, token1, provider, importedProvider);
        const hasResolvedCollision = this.normalizedModuleMeta[`resolvedCollisionsPer${level}`].some(([token2]) => token2 === token1);
        if (hasResolvedCollision) {
          const { providers, module2 } = this.getResolvedCollisionsPerLevel(level, token1);
          const newImportedProvider = new ImportedProvider();
          newImportedProvider.modRefId = module2;
          newImportedProvider.providers.push(...providers);
          this[`importedProvidersPer${level}`].set(token1, newImportedProvider);
        }
      } else {
        const newImportedProvider = new ImportedProvider();
        newImportedProvider.modRefId = normalizedModuleMeta.modRefId;
        newImportedProvider.providers.push(provider);
        if (reexporter) {
          newImportedProvider.reexporter = reexporter;
        }
        this[`importedProvidersPer${level}`].set(token1, newImportedProvider);
      }
    });
  }

  protected checkCollisionsPerLevel(
    modRefId: ModRefId,
    level: Level,
    token: NonNullable<unknown>,
    provider: Provider,
    importedProvider: ImportedProvider,
  ) {
    const declaredTokens = getTokens(this.normalizedModuleMeta[`providersPer${level}`]);
    const resolvedTokens = this.normalizedModuleMeta[`resolvedCollisionsPer${level}`].map(([token]) => token);
    const duplImpTokens = [...declaredTokens, ...resolvedTokens].includes(token) ? [] : [token];
    const collisions = getCollisions(duplImpTokens, [...importedProvider.providers, provider]);
    if (collisions.length) {
      const moduleName1 = getDebugClassName(importedProvider.modRefId) || 'unknown-1';
      const moduleName2 = getDebugClassName(modRefId) || 'unknown-2';
      throw new ProvidersCollision(this.moduleName, [token], [moduleName1, moduleName2], level, this.normalizedModuleMeta.isExternal);
    }
  }

  protected getResolvedCollisionsPerLevel(level: Level, token1: any) {
    const [token2, modRefId2] = this.normalizedModuleMeta[`resolvedCollisionsPer${level}`].find(([token2]) => token1 === token2)!;
    const moduleName = getDebugClassName(modRefId2) || '""';
    const tokenName = token2.name || token2;
    const normalizedModuleMeta2 = this.moduleManager.getNormalizedModuleMeta(modRefId2);
    if (!normalizedModuleMeta2) {
      throw new AppCollisionNotFound(this.moduleName, moduleName, level, tokenName);
    }
    const providers = getLastProviders(normalizedModuleMeta2[`providersPer${level}`]).filter((p) => getToken(p) === token2);
    if (!providers.length) {
      throw new LevelCollisionNotFound(this.moduleName, moduleName, level, tokenName);
    }

    this.setResolvedCollision(token2, level);
    return { module2: modRefId2, providers };
  }

  protected checkExtensionsGraph(extensionConfigs: (ExtensionConfig | OverrideExtensionConfig)[]) {
    const extensionWithBeforeExtension = extensionConfigs?.filter((config) => {
      return !isOverrideExtensionConfig(config) && config.beforeExtensions;
    }) as ExtensionConfig[] | undefined;

    if (extensionWithBeforeExtension) {
      const path = findCycle(extensionWithBeforeExtension);
      if (path) {
        const strPath = path.map(getProviderName).join(' -> ');
        throw new ExtensionCyclicDependency(this.moduleName, strPath);
      }
    }
  }

  protected throwIfTryResolvingMultiprovidersCollisions(moduleName: string) {
    const levels: Level[] = ['Mod', 'Rou', 'Req'];
    levels.forEach((level) => {
      const tokens: any[] = [];
      this[`importedMultiProvidersPer${level}`].forEach((providers) => tokens.push(...getTokens(providers)));
      this.normalizedModuleMeta[`resolvedCollisionsPer${level}`].some(([token]) => {
        if (tokens.includes(token)) {
          const tokenName = token.name || token;
          throw new LevelMultiProviderCollision(this.moduleName, moduleName, level, tokenName);
        }
      });
    });
  }

  protected checkAllCollisionsWithLevelsMix() {
    this.checkCollisionsWithLevelsMix(this.moduleManager.providersPerApp, ['Mod', 'Rou', 'Req']);
    const providersPerMod = [
      ...defaultProvidersPerMod,
      ...this.normalizedModuleMeta.providersPerMod,
      ...getImportedProviders(this.importedProvidersPerMod),
    ];
    this.checkCollisionsWithLevelsMix(providersPerMod, ['Rou', 'Req']);
    const mergedProvidersAndTokens = [
      ...this.normalizedModuleMeta.providersPerRou,
      ...getImportedProviders(this.importedProvidersPerRou),
      // ...defaultProvidersPerReq,
    ];
    this.checkCollisionsWithLevelsMix(mergedProvidersAndTokens, ['Req']);
  }

  protected checkCollisionsWithLevelsMix(providers: any[], levels: Level[]) {
    getTokens(providers).forEach((token) => {
      for (const level of levels) {
        const declaredTokens = getTokens(this.normalizedModuleMeta[`providersPer${level}`]);
        const importedTokens = getImportedTokens(this[`importedProvidersPer${level}`]);
        const resolvedTokens = this.normalizedModuleMeta[`resolvedCollisionsPer${level}`].map(([t]) => t);
        const collision = importedTokens.includes(token) && ![...declaredTokens, ...resolvedTokens].includes(token);
        if (collision) {
          const importedProvider = this[`importedProvidersPer${level}`].get(token)!;
          const hostModulePath = this.moduleManager.getNormalizedModuleMeta(importedProvider.modRefId)?.declaredInDir || '.';
          const decorMeta = Reflector.getClassLevelMeta(token, hasDeclaredInDir)?.at(0);
          const collisionWithPath = decorMeta?.declaredInDir || '.';
          if (hostModulePath !== '.' && collisionWithPath !== '.' && collisionWithPath.startsWith(hostModulePath)) {
            // Allow collisions in host modules.
          } else {
            const hostModuleName = getDebugClassName(importedProvider.modRefId) || 'unknown';
            throw new ProvidersCollision(this.moduleName, [token], [hostModuleName], level, this.normalizedModuleMeta.isExternal);
          }
        }
        this.resolveCollisionsWithLevelsMix(token, level, resolvedTokens);
      }
    });
  }

  protected resolveCollisionsWithLevelsMix(token1: any, level: Level, resolvedTokens: any[]) {
    if (resolvedTokens.includes(token1)) {
      const [, module2] = this.normalizedModuleMeta[`resolvedCollisionsPer${level}`].find(([token2]) => token1 === token2)!;
      if (this.normalizedModuleMeta.modRefId === module2) {
        if (!this[`importedProvidersPer${level}`].delete(token1)) {
          const tokenName = token1.name || token1;
          throw new LevelCollisionNotImported(this.moduleName, level, tokenName);
        }
      } else {
        // Only check that the correct data is specified.
        this.getResolvedCollisionsPerLevel(level, token1);
      }
    }
  }

  protected setResolvedCollision(token: any, level: Level) {
    const levels = this.resolvedCollision.get(token);
    if (!levels) {
      this.resolvedCollision.set(token, new Set([level]));
    } else {
      levels.add(level);
    }
  }

  protected checkFalseResolvingCollision() {
    (['Mod', 'Rou', 'Req'] as const).forEach((level) => {
      this.normalizedModuleMeta[`resolvedCollisionsPer${level}`].forEach(([token, module]) => {
        const levels = this.resolvedCollision.get(token);
        if (!levels || !levels.has(level)) {
          const moduleName = getDebugClassName(module) || 'unknown';
          const tokenName = token.name || token;
          throw new InvalidCollisionResolution(this.moduleName, moduleName, level, tokenName);
        }
      });
    });
  }
}
