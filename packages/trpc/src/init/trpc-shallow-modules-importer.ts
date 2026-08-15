import type { ModRefId, ModuleRegistry, NormalizedModuleMeta, AppProviders } from '@holu/core';
import { isDynamicModule, createAspectMetaProxy } from '@holu/core';

import type {
  ImportModulesShallowConfig,
  TrpcAppProviders,
  TrpcModRefId,
  TrpcShallowModuleImports,
} from '#decorators/trpc-module-aspects.js';
import { aspectTrpcModule, TrpcModuleAspectHandler, TrpcAspectMeta } from '#decorators/trpc-module-aspects.js';
import type { ModuleScopedGuard } from '#interceptors/trpc-guard.js';

/**
 * Recursively collects providers taking into account module imports/exports,
 * but does not take provider dependencies into account.
 *
 * Also:
 * - exports app providers;
 * - merges app and local providers;
 * - checks on providers collisions.
 */
export class TrpcShallowModulesImporter {
  protected moduleName: string;
  protected guardsPerMod: ModuleScopedGuard[];
  protected normalizedModuleMeta: NormalizedModuleMeta;
  protected meta: TrpcAspectMeta;

  /**
   * AppProviders.
   */
  protected glProviders: AppProviders;
  protected trpcGlProviders: TrpcAppProviders;
  protected shallowModuleImportsMap = new Map<ModRefId, TrpcShallowModuleImports>();
  protected scanningModules = new Set<ModRefId>();
  protected unfinishedExportModules = new Set<ModRefId>();
  protected moduleRegistry: ModuleRegistry;

  exportAppProviders({
    moduleRegistry,
    appProviders,
    normalizedModuleMeta,
  }: {
    moduleRegistry: ModuleRegistry;
    appProviders: AppProviders;
    normalizedModuleMeta: NormalizedModuleMeta;
  }): TrpcAppProviders {
    this.moduleRegistry = moduleRegistry;
    this.glProviders = appProviders;
    this.moduleName = normalizedModuleMeta.name;
    this.normalizedModuleMeta = normalizedModuleMeta;
    this.meta = this.getAspectMeta(normalizedModuleMeta);

    return {
      moduleAspect: new TrpcModuleAspectHandler({}),
    };
  }

  /**
   * @param modRefId Module that will bootstrapped.
   */
  importModulesShallow({
    moduleRegistry,
    appProviders,
    modRefId,
    scanningModules,
    guardsPerMod,
  }: ImportModulesShallowConfig): Map<ModRefId, TrpcShallowModuleImports> {
    this.moduleRegistry = moduleRegistry;
    const normalizedModuleMeta = this.moduleRegistry.getNormalizedModuleMeta(modRefId, true);
    this.normalizedModuleMeta = normalizedModuleMeta;
    this.meta = this.getAspectMeta(normalizedModuleMeta);
    this.glProviders = appProviders;
    this.trpcGlProviders = appProviders.aspectValueMap.get(aspectTrpcModule) as TrpcAppProviders;
    this.moduleName = normalizedModuleMeta.name;
    this.guardsPerMod = guardsPerMod || [];
    this.scanningModules = scanningModules;
    this.importModules(
      [...this.normalizedModuleMeta.importedStaticModules, ...this.normalizedModuleMeta.importedDynamicModules],
      true,
    );

    return this.shallowModuleImportsMap.set(modRefId, {
      normalizedModuleMeta,
      guardsPerMod: this.guardsPerMod,
      meta: this.meta,
    });
  }

  protected getAspectMeta(normalizedModuleMeta: NormalizedModuleMeta): TrpcAspectMeta {
    let meta = normalizedModuleMeta.normalizedAspectMetaMap.get(aspectTrpcModule);
    if (!meta) {
      meta = createAspectMetaProxy(normalizedModuleMeta, TrpcAspectMeta);
      normalizedModuleMeta.normalizedAspectMetaMap.set(aspectTrpcModule, meta);
    }
    return meta;
  }

  protected importModules(modRefIdss: TrpcModRefId[], isImport?: boolean) {
    for (const modRefId of modRefIdss) {
      const normalizedModuleMeta = this.moduleRegistry.getNormalizedModuleMeta(modRefId, true);
      if (this.scanningModules.has(modRefId)) {
        continue;
      }
      const meta = this.getAspectMeta(normalizedModuleMeta);
      const { guardsPerMod } = this.getPrefixAndGuards(modRefId, meta, isImport);
      const shallowModulesImporter = new TrpcShallowModulesImporter();
      this.scanningModules.add(modRefId);
      const shallowModuleImportsBase = shallowModulesImporter.importModulesShallow({
        moduleRegistry: this.moduleRegistry,
        appProviders: this.glProviders,
        modRefId,
        scanningModules: this.scanningModules,
        guardsPerMod,
      });
      this.scanningModules.delete(modRefId);

      shallowModuleImportsBase.forEach((val, key) => this.shallowModuleImportsMap.set(key, val));
    }
  }

  protected getPrefixAndGuards(modRefId: TrpcModRefId, meta: TrpcAspectMeta, isImport?: boolean) {
    let guardsPerMod: ModuleScopedGuard[] = [];
    const hasModuleParams = isDynamicModule(modRefId);
    if (hasModuleParams || !isImport) {
      const impGuradsPerMod1 = meta.params.guards.map<ModuleScopedGuard>((g) => {
        return {
          ...g,
          meta: this.meta,
          normalizedModuleMeta: this.normalizedModuleMeta,
        };
      });
      guardsPerMod = [...this.guardsPerMod, ...impGuradsPerMod1];
    }
    return { guardsPerMod };
  }
}
