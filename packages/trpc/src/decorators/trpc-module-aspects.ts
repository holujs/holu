import type {
  ModRefId,
  NormalizedModuleMeta,
  ModuleAspectDecorator,
  Provider,
  StaticAspectOptions,
  DynamicModuleOptions,
  StaticModule,
  Class,
  ModuleRegistry,
  AppProviders,
  DeepModulesImporter,
  ShallowModuleImports,
  SystemLogMediator,
  ForwardRefFn,
} from '@holu/core';
import { Reflector, ModuleAspectHandler, BaseNormalizedModuleMeta, AppModuleAspects } from '@holu/core';

import { TrpcModule } from '../trpc.module.js';
import { TrpcModuleNormalizer } from '#init/trpc-module-normalizer.js';
import { TrpcShallowModulesImporter } from '#init/trpc-shallow-modules-importer.js';
import type { GuardItem, ModuleScopedGuard, NormalizedGuard } from '#interceptors/trpc-guard.js';

export type TrpcModRefId = ModRefId;

class NormalizedParams {
  guards: NormalizedGuard[] = [];
}

export class TrpcAspectMeta extends BaseNormalizedModuleMeta {
  appendsModules: StaticModule[] = [];
  controllers: Class[] = [];
  params = new NormalizedParams();
}

export interface TrpcDynamicOptions extends DynamicModuleOptions {
  guards?: GuardItem[];
}

/**
 * Metadata for the `aspectTrpcModule` decorator, which adds TRPC metadata to a `featureModule` or `rootModule`.
 */
export interface TrpcStaticOptions extends StaticAspectOptions<TrpcDynamicOptions> {
  /**
   * The application controllers.
   */
  controllers?: Class[];
}

export const aspectTrpcModule: ModuleAspectDecorator<TrpcStaticOptions, TrpcDynamicOptions, TrpcAspectMeta> =
  Reflector.makeClassDecorator(transformAspectMeta, 'aspectTrpcModule');
export const trpcRootModule: ModuleAspectDecorator<
  TrpcStaticOptions & { resolvedCollisionsPerApp?: [any, ModRefId | ForwardRefFn<StaticModule>][] },
  TrpcDynamicOptions,
  TrpcAspectMeta
> = Reflector.makeClassDecorator(transformRootMetadata, 'trpcRootModule', aspectTrpcModule);
export const trpcModule: ModuleAspectDecorator<TrpcStaticOptions, TrpcDynamicOptions, TrpcAspectMeta> = Reflector.makeClassDecorator(
  transformFeatureMetadata,
  'trpcModule',
  aspectTrpcModule,
);

export function transformAspectMeta(data?: TrpcStaticOptions): ModuleAspectHandler<TrpcStaticOptions> {
  const metadata = Object.assign({}, data);
  return new TrpcModuleAspectHandler(metadata);
}
export function transformRootMetadata(data?: TrpcStaticOptions): ModuleAspectHandler<TrpcStaticOptions> {
  const metadata = Object.assign({}, data);
  const moduleAspect = new TrpcModuleAspectHandler(metadata);
  moduleAspect.moduleRole = 'root';
  return moduleAspect;
}
export function transformFeatureMetadata(data?: TrpcStaticOptions): ModuleAspectHandler<TrpcStaticOptions> {
  const metadata = transformRootMetadata(data);
  metadata.moduleRole = 'feature';
  return metadata;
}

export class TrpcModuleAspectHandler extends ModuleAspectHandler<TrpcStaticOptions> {
  override hostModule = TrpcModule;

  override normalize(normalizedModuleMeta: NormalizedModuleMeta): TrpcAspectMeta {
    return new TrpcModuleNormalizer().normalize(normalizedModuleMeta, this.staticAspectOptions);
  }

  override getModulesToScan(meta?: TrpcAspectMeta): TrpcModRefId[] {
    return [];
  }

  override exportAppProviders(config: ExportAppProvidersConfig): TrpcAppProviders {
    return new TrpcShallowModulesImporter().exportAppProviders(config);
  }

  override importModulesShallow(config: ImportModulesShallowConfig): Map<ModRefId, TrpcShallowModuleImports> {
    return new TrpcShallowModulesImporter().importModulesShallow(config);
  }

  override getProvidersToOverride(meta: TrpcAspectMeta): Provider[][] {
    return [meta.providersPerRou, meta.providersPerReq];
  }
}

export interface ExportAppProvidersConfig {
  moduleRegistry: ModuleRegistry;
  appProviders: AppProviders;
  normalizedModuleMeta: NormalizedModuleMeta;
}

export interface ImportModulesShallowConfig {
  moduleRegistry: ModuleRegistry;
  appProviders: AppProviders;
  modRefId: ModRefId;
  scanningModules: Set<ModRefId>;
  guardsPerMod?: ModuleScopedGuard[];
}

export interface DeepModulesImporterConfig {
  parent: DeepModulesImporter;
  shallowModuleImports: TrpcShallowModuleImports;
  moduleRegistry: ModuleRegistry;
  shallowModuleImportsMap: Map<ModRefId, ShallowModuleImports>;
  providersPerApp: Provider[];
  log: SystemLogMediator;
} /**
 * Metadata collected using `ShallowModulesImporter`. The target for this metadata is `DeepModulesImporter`.
 */

export class TrpcShallowModuleImports {
  normalizedModuleMeta: NormalizedModuleMeta;
  guardsPerMod: ModuleScopedGuard[];
  /**
   * Snapshot of `TrpcAspectMeta`. If you modify any array in this object,
   * the original array will remain unchanged.
   */
  meta: TrpcAspectMeta;
}

export class TrpcAppProviders extends AppModuleAspects {}
