import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { AnyObj } from './mix.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import type { ExtensionConfig } from '#extension/extension-providers-and-configs.js';
import type { StaticAspectOptions, ModuleAspectHandler } from '#decorators/module-aspects.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import type { ExtensionGroupToken } from '#di/key-registry.js';

/**
 * Used to create a mapping between a provider and the module from which it was imported.
 */
export class ImportedProvider<T extends Provider = Provider> {
  modRefId: ModRefId;
  /**
   * This property can have more than one element for multi-providers only.
   */
  providers: T[] = [];
  declare reexporter?: ModRefId;
}

export class AppModuleAspects<T extends StaticAspectOptions = StaticAspectOptions> {
  /**
   * The presence of this property indicates whether at least one app provider is exported.
   */
  moduleAspect?: ModuleAspectHandler<T>;
}

export class AppProviders {
  importedProvidersPerMod = new Map<any, ImportedProvider>();
  importedProvidersPerRou = new Map<any, ImportedProvider>();
  importedProvidersPerReq = new Map<any, ImportedProvider>();
  importedMultiProvidersPerMod = new Map<ModRefId, Provider[]>();
  importedMultiProvidersPerRou = new Map<ModRefId, Provider[]>();
  importedMultiProvidersPerReq = new Map<ModRefId, Provider[]>();
  importedExtensionProviders = new Map<ModRefId, Provider[]>();
  importedExtensionGroupTokens = new Map<ModRefId, Map<ExtensionClass, ExtensionGroupToken>>();
  importedExtensionConfigs: ExtensionConfig[] = [];
  aspectValueMap = new Map<AnyFn, AppModuleAspects>();
}

export class ResolvedModuleMeta<T extends AnyObj = AnyObj> {
  normalizedModuleMeta: NormalizedModuleMeta;
  orderedExtensions: ExtensionClass[];
  deepImportedModules: Map<AnyFn, T>;
}
