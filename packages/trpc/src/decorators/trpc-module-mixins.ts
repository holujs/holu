import type {
  ModRefId,
  NormalizedModuleMeta,
  MixinDecorator,
  Provider,
  StaticMixinOptions,
  DynamicModuleOptions,
  StaticModule,
  Class,
  ModuleManager,
  AppProviders,
  DeepModulesImporter,
  ShallowModuleImports,
  SystemLogMediator,
  ForwardRefFn,
} from '@holu/core';
import { Reflector, ModuleMixinHandler, BaseNormalizedModuleMeta, AppModuleMixins } from '@holu/core';

import { TrpcModule } from '../trpc.module.js';
import { TrpcModuleNormalizer } from '#init/trpc-module-normalizer.js';
import { TrpcShallowModulesImporter } from '#init/trpc-shallow-modules-importer.js';
import type { GuardItem, ModuleScopedGuard, NormalizedGuard } from '#interceptors/trpc-guard.js';

export type TrpcModRefId = ModRefId;

class NormalizedParams {
  guards: NormalizedGuard[] = [];
}

export class TrpcMixinMeta extends BaseNormalizedModuleMeta {
  appendsModules: StaticModule[] = [];
  controllers: Class[] = [];
  params = new NormalizedParams();
}

export interface TrpcDynamicOptions extends DynamicModuleOptions {
  guards?: GuardItem[];
}

/**
 * Metadata for the `mixinTrpcModule` decorator, which adds TRPC metadata to a `featureModule` or `rootModule`.
 */
export interface TrpcStaticOptions extends StaticMixinOptions<TrpcDynamicOptions> {
  /**
   * The application controllers.
   */
  controllers?: Class[];
}

export const mixinTrpcModule: MixinDecorator<TrpcStaticOptions, TrpcDynamicOptions, TrpcMixinMeta> = Reflector.makeClassDecorator(
  transformMixinMeta,
  'mixinTrpcModule',
);
export const trpcRootModule: MixinDecorator<
  TrpcStaticOptions & { resolvedCollisionsPerApp?: [any, ModRefId | ForwardRefFn<StaticModule>][] },
  TrpcDynamicOptions,
  TrpcMixinMeta
> = Reflector.makeClassDecorator(transformRootMetadata, 'trpcRootModule', mixinTrpcModule);
export const trpcModule: MixinDecorator<TrpcStaticOptions, TrpcDynamicOptions, TrpcMixinMeta> = Reflector.makeClassDecorator(
  transformFeatureMetadata,
  'trpcModule',
  mixinTrpcModule,
);

export function transformMixinMeta(data?: TrpcStaticOptions): ModuleMixinHandler<TrpcStaticOptions> {
  const metadata = Object.assign({}, data);
  return new TrpcModuleMixinHandler(metadata);
}
export function transformRootMetadata(data?: TrpcStaticOptions): ModuleMixinHandler<TrpcStaticOptions> {
  const metadata = Object.assign({}, data);
  const moduleMixin = new TrpcModuleMixinHandler(metadata);
  moduleMixin.moduleRole = 'root';
  return moduleMixin;
}
export function transformFeatureMetadata(data?: TrpcStaticOptions): ModuleMixinHandler<TrpcStaticOptions> {
  const metadata = transformRootMetadata(data);
  metadata.moduleRole = 'feature';
  return metadata;
}

export class TrpcModuleMixinHandler extends ModuleMixinHandler<TrpcStaticOptions> {
  override hostModule = TrpcModule;

  override normalize(normalizedModuleMeta: NormalizedModuleMeta): TrpcMixinMeta {
    return new TrpcModuleNormalizer().normalize(normalizedModuleMeta, this.moduleOptions);
  }

  override getModulesToScan(meta?: TrpcMixinMeta): TrpcModRefId[] {
    return [];
  }

  override exportAppProviders(config: ExportAppProvidersConfig): TrpcAppProviders {
    return new TrpcShallowModulesImporter().exportAppProviders(config);
  }

  override importModulesShallow(config: ImportModulesShallowConfig): Map<ModRefId, TrpcShallowModuleImports> {
    return new TrpcShallowModulesImporter().importModulesShallow(config);
  }

  override getProvidersToOverride(meta: TrpcMixinMeta): Provider[][] {
    return [meta.providersPerRou, meta.providersPerReq];
  }
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
  guardsPerMod?: ModuleScopedGuard[];
}

export interface DeepModulesImporterConfig {
  parent: DeepModulesImporter;
  shallowModuleImports: TrpcShallowModuleImports;
  moduleManager: ModuleManager;
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
   * Snapshot of `TrpcMixinMeta`. If you modify any array in this object,
   * the original array will remain unchanged.
   */
  meta: TrpcMixinMeta;
}

export class TrpcAppProviders extends AppModuleMixins {}
