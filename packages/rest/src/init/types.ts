import type {
  Provider,
  NormalizedModuleMeta,
  AppProviders,
  ModRefId,
  ModuleManager,
  SystemLogMediator,
  DeepModulesImporter,
  ShallowModuleImports,
} from '@holu/core';

import type { ModuleScopedGuard } from '#interceptors/guard.js';
import type { RestModRefId, RestAspectMeta } from '#init/rest-aspect-meta.js';

export class RestImportedProvider<T extends Provider = Provider> {
  modRefId: RestModRefId;
  /**
   * This property can have more than one element for multi-providers only.
   */
  providers: T[] = [];
}
/**
 * Metadata collected using `ShallowModulesImporter`. The target for this metadata is `DeepModulesImporter`.
 */
export class RestShallowModuleImports {
  normalizedModuleMeta: NormalizedModuleMeta;
  prefixPerMod: string;
  guardsPerMod: ModuleScopedGuard[];
  /**
   * Snapshot of `RestAspectMeta`. If you modify any array in this object,
   * the original array will remain unchanged.
   */
  meta: RestAspectMeta;
  applyControllers?: boolean;
}

export interface RestBaseImportRegistry {
  perMod: Map<any, RestImportedProvider>;
  perRou: Map<any, RestImportedProvider>;
  perReq: Map<any, RestImportedProvider>;
  multiPerMod: Map<RestModRefId, Provider[]>;
  multiPerRou: Map<RestModRefId, Provider[]>;
  multiPerReq: Map<RestModRefId, Provider[]>;
}

export class RestProvidersByLevel {
  providersPerMod: Provider[] = [];
  providersPerRou: Provider[] = [];
  providersPerReq: Provider[] = [];
}
/**
 * This metadata returns from `DeepModulesImporter`. The target for this metadata is `RestRouteExtension`.
 */

export class RestResolvedModuleMeta {
  normalizedModuleMeta: NormalizedModuleMeta;
  meta: RestAspectMeta;
  guardsPerMod: ModuleScopedGuard[];
  prefixPerMod: string;
  applyControllers?: boolean;
}

export interface ExportAppProvidersConfig {
  moduleManager: ModuleManager;
  appProviders: AppProviders;
  normalizedModuleMeta: NormalizedModuleMeta;
}

export interface ImportModulesShallowConfig {
  moduleManager: ModuleManager;
  appProviders: AppProviders;
  modRefId: ModRefId;
  unfinishedScanModules: Set<ModRefId>;
  prefixPerMod: string;
  guardsPerMod?: ModuleScopedGuard[];
  isAppends?: boolean;
}

export interface DeepModulesImporterConfig {
  parent: DeepModulesImporter;
  shallowModuleImports: RestShallowModuleImports;
  moduleManager: ModuleManager;
  shallowModuleImportsMap: Map<ModRefId, ShallowModuleImports>;
  providersPerApp: Provider[];
  log: SystemLogMediator;
}
