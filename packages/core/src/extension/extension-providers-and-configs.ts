import type { ExtensionClass, Extension } from '#extension/extension-types.js';
import type { AnyObj } from '#types/mix.js';
import type { Provider } from '#di/top/types-and-models.js';
import type { ExtensionManager } from '#extension/extension-manager.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModuleNormalizer } from '#init/module-normalizer.js';
import { KeyRegistry, type ExtensionGroupToken } from '#di/key-registry.js';

/**
 * A normalized representation of an extension configuration.
 * It is generated from {@link ExtensionConfig} and contains the resolved providers and
 * configurations ready to be consumed by the DI container and {@link ExtensionManager}.
 */
export class NormalizedExtensionConfig {
  /**
   * The array of DI providers derived from the extension configuration.
   * This includes the extension class itself, as well as multi-providers
   * mapping group tokens to this extension (if {@link BaseExtensionConfig.groups | groups} were specified).
   * These providers are added to the module's internal {@link NormalizedModuleMeta.extensionProviders | extensionProviders}.
   */
  providers: Provider[];
  /**
   * The original configuration object (omitted for {@link ExportOnlyExtensionConfig.exportOnly | exportOnly}
   * or override configs). It retains metadata like {@link BaseExtensionConfig.beforeExtensions | beforeExtensions}
   * and {@link BaseExtensionConfig.afterExtensions | afterExtensions} used during topological sorting to determine
   * the initialization order of extensions.
   */
  config?: ExtensionConfig;
  /**
   * A map associating each lead extension (the one acting as a group identifier) specified in the
   * {@link BaseExtensionConfig.groups | groups} array with its corresponding {@link ExtensionGroupToken}.
   * The {@link ModuleNormalizer} uses this to register the current extension within those groups in the local module scope.
   */
  groupTokensMap?: Map<ExtensionClass, ExtensionGroupToken>;
  /**
   * The array of DI providers intended to be exported to importing modules.
   * Populated only if {@link ExportableExtensionConfig.export | export} or
   * {@link ExportOnlyExtensionConfig.exportOnly | exportOnly} is set to `true` in the configuration.
   */
  exportedProviders: Provider[];
  /**
   * The extension configuration to be exported. It carries the execution order dependencies
   * ({@link BaseExtensionConfig.beforeExtensions | beforeExtensions},
   * {@link BaseExtensionConfig.afterExtensions | afterExtensions}) to the modules that import this extension.
   */
  exportedConfig?: ExtensionConfig;
  /**
   * The exported equivalent of {@link groupTokensMap}. It allows the exported extension to participate
   * in extension groups within the modules that import it.
   */
  exportedGroupTokensMap?: Map<ExtensionClass, ExtensionGroupToken>;
}

export interface BaseExtensionConfig {
  extension: ExtensionClass;
  /**
   * The array of extension classes before which this extension will be called.
   */
  beforeExtensions?: ExtensionClass[];
  /**
   * The array of extension classes after which this extension will be called.
   */
  afterExtensions?: ExtensionClass[];
  /**
   * Each element in this array will form a separate group of extensions together with the current extension.
   * When one of the extensions from this array is passed to {@link ExtensionManager.stage1 | ExtensionManager.stage1()},
   * it will return the result of the {@link Extension.stage1 | stage1()} method from each extension in the formed group.
   */
  groups?: ExtensionClass[];
  overrideExtension?: never;
}

export interface ExportableExtensionConfig extends BaseExtensionConfig {
  /**
   * Indicates whether this extension needs to be export.
   */
  export?: boolean;
  exportOnly?: never;
}

export interface ExportOnlyExtensionConfig extends BaseExtensionConfig {
  export?: never;
  /**
   * Indicates whether this extension needs to be export without working in host module.
   */
  exportOnly?: boolean;
}

export interface OverrideExtensionConfig {
  extension: ExtensionClass;
  overrideExtension: ExtensionClass;
  export?: never;
  exportOnly?: never;
  groups?: never;
  beforeExtensions?: never;
  afterExtensions?: never;
}

export type ExtensionConfig = ExportableExtensionConfig | ExportOnlyExtensionConfig | OverrideExtensionConfig;

/**
 * Type guard to check whether the provided extension configuration is an `OverrideExtensionConfig`.
 */
export function isOverrideExtensionConfig(extensionConfig: AnyObj): extensionConfig is OverrideExtensionConfig {
  return (extensionConfig as OverrideExtensionConfig).overrideExtension !== undefined;
}

/**
 * Type guard to check whether the provided extension configuration is a `BaseExtensionConfig`.
 */
export function isStandardExtensionConfig(extensionConfig: AnyObj): extensionConfig is BaseExtensionConfig {
  return (extensionConfig as BaseExtensionConfig).extension !== undefined;
}

/**
 * Normalizes the extension configuration by converting it into a structured format
 * that includes providers and group token maps for dependency injection.
 */
export function normalizeExtensionConfig(extensionConfig: ExtensionConfig): NormalizedExtensionConfig {
  if (isOverrideExtensionConfig(extensionConfig)) {
    const { extension, overrideExtension } = extensionConfig;
    return {
      providers: [{ token: overrideExtension, useClass: extension }],
      exportedProviders: [],
    };
  }

  const groupTokensMap = new Map<ExtensionClass, ExtensionGroupToken>();
  const providers: Provider[] = [extensionConfig.extension];

  // Creating a group of extensions using multi-providers
  extensionConfig.groups?.forEach((LeadExtensionCls) => {
    const groupToken = KeyRegistry.getExtensionGroupToken(LeadExtensionCls);
    groupTokensMap.set(LeadExtensionCls, groupToken);
    providers.push({ token: groupToken, useToken: extensionConfig.extension, multi: true });
  });

  if (extensionConfig.exportOnly) {
    return {
      providers: [],
      exportedProviders: providers,
      exportedConfig: extensionConfig,
      exportedGroupTokensMap: groupTokensMap,
    };
  } else if (extensionConfig.export) {
    return {
      providers,
      exportedProviders: providers,
      config: extensionConfig,
      exportedConfig: extensionConfig,
      groupTokensMap,
      exportedGroupTokensMap: groupTokensMap,
    };
  } else {
    return {
      providers,
      exportedProviders: [],
      config: extensionConfig,
      groupTokensMap,
    };
  }
}

/**
 * Retrieves a flat list of extension providers from the given array of extension configurations.
 */
export function getExtensionProviders(extensionConfig: ExtensionConfig[]) {
  const providers: Provider[] = [];
  extensionConfig.map((obj) => providers.push(...normalizeExtensionConfig(obj).providers));
  return providers;
}
