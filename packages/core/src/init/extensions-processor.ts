import type { BaseExtensionConfig } from '#extension/extension-providers-and-configs.js';
import type { PickProps } from '#types/mix.js';
import type { FeatureModuleOptions } from '#decorators/module-decorator-options.js';
import type { Provider } from '#di/top/types-and-models.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import { normalizeExtensionConfig } from '#extension/extension-providers-and-configs.js';
import { resolveForwardRef } from '#di/forward-ref.js';
import { getToken } from '#utils/get-tokens.js';
import { normalizeProviders } from '#utils/ng-utils.js';
import { isExtensionConfig } from '#extension/type-guards.js';
import { isClassProvider, isTokenProvider, isValueProvider } from '#di/utils.js';
import { InvalidExtension } from '#errors';

export class ExtensionsProcessor {
  normalizeExtensions(
    staticModuleOptions: PickProps<FeatureModuleOptions, 'extensions' | 'extensionsMeta'>,
    meta: NormalizedModuleMeta,
  ) {
    if (staticModuleOptions.extensionsMeta) {
      meta.extensionsMeta = {
        ...meta.extensionsMeta,
        ...staticModuleOptions.extensionsMeta,
      };
    }

    staticModuleOptions.extensions?.forEach((extensionClassOrConfig) => {
      if (!isExtensionConfig(extensionClassOrConfig)) {
        extensionClassOrConfig = { extension: extensionClassOrConfig } as BaseExtensionConfig;
      }
      const normalizedExtensionConfig = normalizeExtensionConfig(extensionClassOrConfig);
      normalizedExtensionConfig.providers.forEach((p) => this.assertValidExtensionProvider(p, meta));
      if (normalizedExtensionConfig.config) {
        meta.extensionConfigs.push(normalizedExtensionConfig.config);
      }
      if (normalizedExtensionConfig.exportedConfig) {
        meta.exportedExtensionConfigs.push(normalizedExtensionConfig.exportedConfig);
      }
      meta.extensionProviders.push(...normalizedExtensionConfig.providers);
      meta.exportedExtensionProviders.push(...normalizedExtensionConfig.exportedProviders);
      normalizedExtensionConfig.groupTokensMap?.forEach((groupToken, LeadExtensionCls) => {
        if (!meta.extensionGroupTokensMap.has(LeadExtensionCls)) {
          meta.extensionGroupTokensMap.set(LeadExtensionCls, groupToken);
          meta.extensionProviders.unshift({ token: groupToken, useToken: LeadExtensionCls, multi: true });
        }
      });
      normalizedExtensionConfig.exportedGroupTokensMap?.forEach((groupToken, ExtensionCls) => {
        if (!meta.exportedExtensionGroupTokensMap.has(ExtensionCls)) {
          meta.exportedExtensionGroupTokensMap.set(ExtensionCls, groupToken);
        }
      });
    });
  }

  protected assertValidExtensionProvider(extensionsProvider: Provider, meta: NormalizedModuleMeta) {
    const np = normalizeProviders([extensionsProvider])[0];
    let ExtensionCls: ExtensionClass | undefined;
    if (isClassProvider(np)) {
      ExtensionCls = resolveForwardRef(np.useClass);
    } else if (isTokenProvider(np) && np.useToken instanceof Function) {
      ExtensionCls = resolveForwardRef(np.useToken);
    } else if (isValueProvider(np) && np.useValue.constructor instanceof Function) {
      ExtensionCls = np.useValue.constructor;
    }

    if (
      !ExtensionCls ||
      (typeof ExtensionCls.prototype?.stage1 != 'function' &&
        typeof ExtensionCls.prototype?.stage2 != 'function' &&
        typeof ExtensionCls.prototype?.stage3 != 'function')
    ) {
      const token = getToken(extensionsProvider);
      throw new InvalidExtension(meta.name, token.name || token);
    }
  }
}
