import type { ModRefId, NormalizedModuleMeta, ModuleAspectDecorator, Provider, ForwardRefFn, StaticModule } from '@holu/core';
import { Reflector, ModuleAspectHandler } from '@holu/core';

import type { RestStaticOptions, RestDynamicOptions } from '#init/rest-aspect-raw-meta.js';
import { RestModuleNormalizer } from '#init/rest-module-normalizer.js';
import { RestShallowModulesImporter } from '#init/rest-shallow-modules-importer.js';
import type {
  DeepModulesImporterConfig,
  ExportAppProvidersConfig,
  ImportModulesShallowConfig,
  RestShallowModuleImports,
} from '#init/types.js';
import type { RestModRefId, RestAspectMeta } from '#init/rest-aspect-meta.js';
import type { RestAppProviders } from '#types/types.js';
import { RestModule } from '#init/rest.module.js';
import { RestDeepModulesImporter } from '#init/rest-deep-modules-importer.js';

export const aspectRest: ModuleAspectDecorator<RestStaticOptions, RestDynamicOptions, RestAspectMeta> = Reflector.makeClassDecorator(
  transformAspectMeta,
  'aspectRest',
);
export const restRootModule: ModuleAspectDecorator<
  RestStaticOptions & { resolvedCollisionsPerApp?: [any, ModRefId | ForwardRefFn<StaticModule>][] },
  RestDynamicOptions,
  RestAspectMeta
> = Reflector.makeClassDecorator(transformRootMeta, 'restRootModule', aspectRest);
export const restModule: ModuleAspectDecorator<RestStaticOptions, RestDynamicOptions, RestAspectMeta> = Reflector.makeClassDecorator(
  transformFeatureMeta,
  'restModule',
  aspectRest,
);

export function transformAspectMeta(data?: RestStaticOptions): ModuleAspectHandler<RestStaticOptions> {
  const metadata = Object.assign({}, data);
  return new RestModuleAspectHandler(metadata);
}
export function transformRootMeta(data?: RestStaticOptions): ModuleAspectHandler<RestStaticOptions> {
  const metadata = Object.assign({}, data);
  const moduleAspect = new RestModuleAspectHandler(metadata);
  moduleAspect.moduleRole = 'root';
  return moduleAspect;
}
export function transformFeatureMeta(data?: RestStaticOptions): ModuleAspectHandler<RestStaticOptions> {
  const metadata = transformRootMeta(data);
  metadata.moduleRole = 'feature';
  return metadata;
}

export class RestModuleAspectHandler extends ModuleAspectHandler<RestStaticOptions> {
  override hostModule = RestModule;

  override normalize(normalizedModuleMeta: NormalizedModuleMeta): RestAspectMeta {
    return new RestModuleNormalizer().normalize(normalizedModuleMeta, this.moduleOptions);
  }

  override getModulesToScan(meta?: RestAspectMeta): RestModRefId[] {
    return meta?.appendsModules.concat(meta?.appendsWithOpts as any[]) || [];
  }

  override exportAppProviders(config: ExportAppProvidersConfig): RestAppProviders {
    return new RestShallowModulesImporter().exportAppProviders(config);
  }

  override importModulesShallow(config: ImportModulesShallowConfig): Map<ModRefId, RestShallowModuleImports> {
    return new RestShallowModulesImporter().importModulesShallow(config);
  }

  override importModulesDeep(config: DeepModulesImporterConfig) {
    return new RestDeepModulesImporter(config).importModulesDeep();
  }

  override getProvidersToOverride(meta: RestAspectMeta): Provider[][] {
    return [meta.providersPerRou, meta.providersPerReq];
  }
}
