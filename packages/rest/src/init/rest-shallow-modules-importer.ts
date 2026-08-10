import type { Provider, ModRefId, ModuleManager, NormalizedModuleMeta, AppProviders } from '@holu/core';
import {
  isDynamicModule,
  getTokens,
  getToken,
  getDebugClassName,
  getCollisions,
  isRootModule,
  getModule,
  getLastProviders,
  getProxyForMixinMeta,
} from '@holu/core';
import { ProvidersCollision, LevelCollisionNotFound, AppCollisionNotFound } from '@holu/core/errors';

import type { ModuleScopedGuard } from '#interceptors/guard.js';
import type { RestModRefId } from '#init/rest-mixin-meta.js';
import { RestMixinMeta } from '#init/rest-mixin-meta.js';
import type { Level, RestAppProviders } from '#types/types.js';
import { mixinRest, RestModuleMixinHandler } from '#decorators/rest-module-mixins.js';
import type { ImportModulesShallowConfig, RestImportedProvider, RestShallowModuleImports } from './types.js';
import { ModuleIncludesInImportsAndAppends } from '#errors';
import { ModuleMustHaveControllers } from '#services/rest-errors.js';

/**
 * Recursively collects providers taking into account module imports/exports,
 * but does not take provider dependencies into account.
 *
 * Also:
 * - exports app providers;
 * - merges app and local providers;
 * - checks on providers collisions.
 */
export class RestShallowModulesImporter {
  protected moduleName: string;
  protected prefixPerMod: string;
  protected guardsPerMod: ModuleScopedGuard[];
  protected normalizedModuleMeta: NormalizedModuleMeta;
  protected meta: RestMixinMeta;

  /**
   * AppProviders.
   */
  protected appProviders: AppProviders;
  protected restGlProviders: RestAppProviders;
  protected shallowModuleImportsMap = new Map<ModRefId, RestShallowModuleImports>();
  protected unfinishedScanModules = new Set<ModRefId>();
  protected unfinishedExportModules = new Set<ModRefId>();
  protected moduleManager: ModuleManager;

  exportAppProviders({
    moduleManager,
    appProviders,
    normalizedModuleMeta,
  }: {
    moduleManager: ModuleManager;
    appProviders: AppProviders;
    normalizedModuleMeta: NormalizedModuleMeta;
  }): RestAppProviders {
    this.moduleManager = moduleManager;
    this.appProviders = appProviders;
    this.moduleName = normalizedModuleMeta.name;
    this.normalizedModuleMeta = normalizedModuleMeta;
    this.meta = this.getMixinMeta(normalizedModuleMeta);

    return {
      moduleMixin: new RestModuleMixinHandler({}),
    };
  }

  /**
   * @param modRefId Module that will bootstrapped.
   */
  importModulesShallow({
    moduleManager,
    appProviders,
    modRefId,
    unfinishedScanModules,
    prefixPerMod,
    guardsPerMod,
    isAppends,
  }: ImportModulesShallowConfig): Map<ModRefId, RestShallowModuleImports> {
    this.moduleManager = moduleManager;
    const normalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta(modRefId, true);
    this.normalizedModuleMeta = normalizedModuleMeta;
    this.meta = this.getMixinMeta(normalizedModuleMeta);
    this.appProviders = appProviders;
    this.restGlProviders = appProviders.mixinValueMap.get(mixinRest) as RestAppProviders;
    this.prefixPerMod = prefixPerMod || '';
    this.moduleName = normalizedModuleMeta.name;
    this.guardsPerMod = guardsPerMod || [];
    this.unfinishedScanModules = unfinishedScanModules;
    this.checkImportsAndAppends(normalizedModuleMeta, this.meta);
    this.importAndAppendModules();

    let applyControllers = false;
    if (isRootModule(normalizedModuleMeta) || isAppends || this.hasPath()) {
      applyControllers = true;
    }

    return this.shallowModuleImportsMap.set(modRefId, {
      normalizedModuleMeta,
      prefixPerMod,
      guardsPerMod: this.guardsPerMod,
      meta: this.meta,
      applyControllers,
    });
  }

  protected getMixinMeta(normalizedModuleMeta: NormalizedModuleMeta): RestMixinMeta {
    let meta = normalizedModuleMeta.normalizedMixinMetaMap.get(mixinRest);
    if (!meta) {
      meta = getProxyForMixinMeta(normalizedModuleMeta, RestMixinMeta);
      normalizedModuleMeta.normalizedMixinMetaMap.set(mixinRest, meta);
    }
    return meta;
  }

  protected hasPath() {
    return this.meta.params.path !== undefined || this.meta.params.absolutePath !== undefined;
  }

  protected importAndAppendModules() {
    this.importOrAppendModules(
      [...this.normalizedModuleMeta.importedStaticModules, ...this.normalizedModuleMeta.importedDynamicModules],
      true,
    );
    this.importOrAppendModules([...this.meta.appendsModules, ...this.meta.appendsWithOpts]);
  }

  protected importOrAppendModules(modRefIdss: RestModRefId[], isImport?: boolean) {
    for (const modRefId of modRefIdss) {
      const normalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta(modRefId, true);
      if (this.unfinishedScanModules.has(modRefId)) {
        continue;
      }
      const meta = this.getMixinMeta(normalizedModuleMeta);
      const { prefixPerMod, guardsPerMod } = this.getPrefixAndGuards(modRefId, meta, isImport);
      const shallowModulesImporter = new RestShallowModulesImporter();
      this.unfinishedScanModules.add(modRefId);
      const shallowModuleImportsBase = shallowModulesImporter.importModulesShallow({
        moduleManager: this.moduleManager,
        appProviders: this.appProviders,
        modRefId,
        unfinishedScanModules: this.unfinishedScanModules,
        prefixPerMod,
        guardsPerMod,
        isAppends: !isImport,
      });
      this.unfinishedScanModules.delete(modRefId);

      shallowModuleImportsBase.forEach((val, key) => this.shallowModuleImportsMap.set(key, val));
    }
  }

  protected getPrefixAndGuards(modRefId: RestModRefId, meta: RestMixinMeta, isImport?: boolean) {
    let prefixPerMod: string;
    let guardsPerMod: ModuleScopedGuard[] = [];
    const { absolutePath } = meta.params;
    const hasModuleParams = isDynamicModule(modRefId);
    if (hasModuleParams || !isImport) {
      if (hasModuleParams && typeof absolutePath == 'string') {
        // Allow slash for absolutePath.
        prefixPerMod = absolutePath.startsWith('/') ? absolutePath.slice(1) : absolutePath;
      } else {
        const path = hasModuleParams ? meta.params.path : '';
        prefixPerMod = [this.prefixPerMod, path].filter((s) => s).join('/');
      }
      const impGuradsPerMod1 = meta.params.guards.map<ModuleScopedGuard>((g) => {
        return {
          ...g,
          meta: this.meta,
          normalizedModuleMeta: this.normalizedModuleMeta,
        };
      });
      guardsPerMod = [...this.guardsPerMod, ...impGuradsPerMod1];
    } else {
      prefixPerMod = this.prefixPerMod;
    }
    return { prefixPerMod, guardsPerMod };
  }

  protected checkCollisionsPerLevel(
    modRefId: RestModRefId,
    level: Level,
    token: NonNullable<unknown>,
    provider: Provider,
    importedProvider: RestImportedProvider,
  ) {
    const declaredTokens = getTokens(this.meta[`providersPer${level}`]);
    const resolvedTokens = this.meta[`resolvedCollisionsPer${level}`].map(([token]) => token);
    const duplImpTokens = [...declaredTokens, ...resolvedTokens].includes(token) ? [] : [token];
    const collisions = getCollisions(duplImpTokens, [...importedProvider.providers, provider]);
    if (collisions.length) {
      const moduleName1 = getDebugClassName(importedProvider.modRefId) || 'unknown-1';
      const moduleName2 = getDebugClassName(modRefId) || 'unknown-2';
      throw new ProvidersCollision(this.moduleName, [token], [moduleName1, moduleName2], level, this.normalizedModuleMeta.isExternal);
    }
  }

  protected getResolvedCollisionsPerLevel(level: Level, token1: any) {
    const [token2, modRefId2] = this.meta[`resolvedCollisionsPer${level}`].find(([token2]) => token1 === token2)!;
    const moduleName = getDebugClassName(modRefId2) || '""';
    const tokenName = token2.name || token2;
    const normalizedModuleMeta2 = this.moduleManager.getNormalizedModuleMeta(modRefId2);
    const meta2 = normalizedModuleMeta2?.normalizedMixinMetaMap.get(mixinRest);
    if (!normalizedModuleMeta2) {
      throw new AppCollisionNotFound(this.moduleName, moduleName, level, tokenName);
    }
    const providers = getLastProviders(meta2?.[`providersPer${level}`] || []).filter((p) => getToken(p) === token2);
    if (!providers.length) {
      throw new LevelCollisionNotFound(this.moduleName, moduleName, level, tokenName);
    }

    return { module2: modRefId2, providers };
  }

  protected checkImportsAndAppends(normalizedModuleMeta: NormalizedModuleMeta, meta1: RestMixinMeta) {
    meta1.appendsModules.concat(meta1.appendsWithOpts as any[]).forEach((modRefId) => {
      const appendedNormalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta(modRefId, true);
      const meta2 = this.getMixinMeta(appendedNormalizedModuleMeta);
      if (!meta2.controllers.length) {
        throw new ModuleMustHaveControllers(normalizedModuleMeta.name, appendedNormalizedModuleMeta.name);
      }
      const mod = getModule(modRefId);
      if (
        normalizedModuleMeta.importedStaticModules.includes(mod) ||
        normalizedModuleMeta.importedDynamicModules.some((imp) => imp.module === mod)
      ) {
        throw new ModuleIncludesInImportsAndAppends(normalizedModuleMeta.name, appendedNormalizedModuleMeta.name);
      }
    });
  }
}
