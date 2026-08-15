import type { ModRefId, Provider, ModuleRegistry, SystemLogMediator, DeepModulesImporter, ShallowModuleImports } from '@holu/core';

import type { DeepModulesImporterConfig, RestResolvedModuleMeta, RestShallowModuleImports } from './types.js';

/**
 * By analyzing the dependencies of the providers returned by `ShallowModulesImporter`,
 * recursively collects providers for them from the corresponding modules.
 */
export class RestDeepModulesImporter {
  protected shallowModuleImports: RestShallowModuleImports;
  protected moduleRegistry: ModuleRegistry;
  protected shallowModuleImportsMap: Map<ModRefId, ShallowModuleImports>;
  protected providersPerApp: Provider[];
  protected log: SystemLogMediator;
  protected parent: DeepModulesImporter;

  constructor({
    parent,
    shallowModuleImports,
    moduleRegistry,
    shallowModuleImportsMap,
    providersPerApp,
    log,
  }: DeepModulesImporterConfig) {
    this.parent = parent;
    this.shallowModuleImports = shallowModuleImports;
    this.moduleRegistry = moduleRegistry;
    this.shallowModuleImportsMap = shallowModuleImportsMap;
    this.providersPerApp = providersPerApp;
    this.log = log;
  }

  importModulesDeep(): RestResolvedModuleMeta | undefined {
    const { guardsPerMod, prefixPerMod, meta, applyControllers } = this.shallowModuleImports;
    return {
      normalizedModuleMeta: this.shallowModuleImports.normalizedModuleMeta,
      meta,
      guardsPerMod,
      prefixPerMod,
      applyControllers,
    };
  }
}
