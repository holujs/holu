import type {
  ModRefId,
  Provider,
  ModuleManager,
  SystemLogMediator,
  DeepModulesImporter,
  ShallowModuleImports,
  NormalizedModuleMeta,
} from '@holu/core';
import { ModuleInfo } from '@holu/core';

import type { DeepModulesImporterConfig, TrpcAspectMeta } from '#decorators/trpc-module-aspects.js';
import type { TrpcShallowModuleImports } from '#decorators/trpc-module-aspects.js';
import type { ModuleScopedGuard } from '#interceptors/trpc-guard.js';

/**
 * This metadata returns from `DeepModulesImporter`. The target for this metadata is `RestRouteExtension`.
 */

export class TrpcResolvedModuleMeta {
  normalizedModuleMeta: NormalizedModuleMeta;
  meta: TrpcAspectMeta;
  guardsPerMod: ModuleScopedGuard[];
}

export class TrpcModuleInfo extends ModuleInfo {}

/**
 * By analyzing the dependencies of the providers returned by `ShallowModulesImporter`,
 * recursively collects providers for them from the corresponding modules.
 */
export class TrpcDeepModulesImporter {
  protected tokensPerApp: any[];

  protected shallowModuleImports: TrpcShallowModuleImports;
  protected moduleManager: ModuleManager;
  protected shallowModuleImportsMap: Map<ModRefId, ShallowModuleImports>;
  protected providersPerApp: Provider[];
  protected log: SystemLogMediator;
  protected parent: DeepModulesImporter;

  constructor({
    parent,
    shallowModuleImports,
    moduleManager,
    shallowModuleImportsMap,
    providersPerApp,
    log,
  }: DeepModulesImporterConfig) {
    this.parent = parent;
    this.shallowModuleImports = shallowModuleImports;
    this.moduleManager = moduleManager;
    this.shallowModuleImportsMap = shallowModuleImportsMap;
    this.providersPerApp = providersPerApp;
    this.log = log;
  }
}
