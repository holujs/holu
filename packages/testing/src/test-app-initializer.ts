import type {
  NormalizedModuleMeta,
  ExtensionCounters,
  ExtensionContext,
  ForwardRefFn,
  ResolvedModuleMeta,
  ModRefId,
  Provider,
  ProviderBuilder,
} from '@holu/core';
import { InternalExtensionManager, resolveForwardRef } from '@holu/core';
import { RestAppInitializer } from '@holu/rest';

import { TestOverrider } from './test-overrider.js';
import type { OverriderConfig } from './types.js';
import { TestExtensionManager } from './test-extension-manager.js';
import { OVERRIDERS_CONFIG } from './constants.js';

export class TestAppInitializer extends RestAppInitializer {
  protected additionalProvidersMap = new Map<ModRefId, Provider[]>();
  protected providersForOverride: Provider[] = [];
  protected overriderConfigs: OverriderConfig[] = [];

  setOverriderConfig(config: OverriderConfig) {
    this.overriderConfigs.push(config);
  }

  addProvidersToModule(modRefId: ModRefId, rawProviders: ProviderBuilder | (Provider | ForwardRefFn<Provider>)[]) {
    const providers = this.additionalProvidersMap.get(modRefId) || [];
    if (!this.additionalProvidersMap.has(modRefId)) {
      this.additionalProvidersMap.set(modRefId, providers);
    }
    const normalizedProviders = [...rawProviders].map(resolveForwardRef);
    providers.push(...normalizedProviders);
  }

  overrideModuleMeta(rawProviders: ProviderBuilder | (Provider | ForwardRefFn<Provider>)[]) {
    const providers = [...rawProviders].map(resolveForwardRef);
    this.providersForOverride.push(...providers);
  }

  protected override overrideMetaAfterStage1(modRefId: ModRefId, normalizedModuleMeta: NormalizedModuleMeta) {
    const additionalProviders = this.additionalProvidersMap.get(modRefId);
    this.addAndOverrideProviders([normalizedModuleMeta.providersPerApp, normalizedModuleMeta.providersPerMod], additionalProviders);
    normalizedModuleMeta.moduleAspectsMap.forEach((moduleAspect, decorator) => {
      const meta = normalizedModuleMeta.normalizedAspectsMetaMap.get(decorator);
      if (meta) {
        this.addAndOverrideProviders(moduleAspect.getProvidersToOverride(meta), additionalProviders);
      }
    });
    return normalizedModuleMeta;
  }

  protected addAndOverrideProviders(providerArrays: Provider[][], additionalProviders?: Provider[]) {
    if (additionalProviders) {
      providerArrays.forEach((arr) => arr.push(...additionalProviders));
    }
    TestOverrider.overrideAllProviders(this.normalizedModuleMeta.providersPerApp, providerArrays, this.providersForOverride);
  }

  protected override getProvidersForExtensions(
    resolvedModuleMeta: ResolvedModuleMeta,
    extensionCounters: ExtensionCounters,
    extensionContext: ExtensionContext,
  ): Provider[] {
    const providers = super.getProvidersForExtensions(resolvedModuleMeta, extensionCounters, extensionContext);
    providers.push(
      { token: InternalExtensionManager, useClass: TestExtensionManager },
      { token: OVERRIDERS_CONFIG, useValue: this.overriderConfigs },
    );
    return providers;
  }
}
