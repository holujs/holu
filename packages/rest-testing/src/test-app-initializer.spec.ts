import type { ModRefId, Provider } from '@holu/core';
import { NormalizedModuleMeta, ProviderBuilder } from '@holu/core';
import { RestAspectMeta, restAspect } from '@holu/rest';

import { TestAppInitializer } from '#app/test-app-initializer.js';

describe('TestAppInitializer', () => {
  class MockTestAppInitializer extends TestAppInitializer {
    override additionalProvidersMap = new Map<ModRefId, Provider[]>();

    override overrideMetaAfterStage1(modRefId: ModRefId, providersByLevel: NormalizedModuleMeta) {
      return super.overrideMetaAfterStage1(modRefId, providersByLevel);
    }
  }
  const mock = new MockTestAppInitializer(null as any, null as any, null as any);
  (mock as any).normalizedModuleMeta = new NormalizedModuleMeta();

  describe('addProvidersToModule()', () => {
    it('adding array of providers', () => {
      const modRefId = {} as ModRefId;
      class Provider1 {}

      mock.addProvidersToModule(modRefId, [Provider1]);
      expect(mock.additionalProvidersMap.get(modRefId)).toEqual([Provider1]);
    });

    it('adding mix (Provider[] and instanse of ProviderBuilder)', () => {
      const modRefId = {} as ModRefId;
      class Provider1 {}
      class Provider2 {}

      mock.addProvidersToModule(modRefId, [Provider1]);
      mock.addProvidersToModule(modRefId, new ProviderBuilder().passThrough(Provider2));
      expect(mock.additionalProvidersMap.get(modRefId)).toEqual([Provider1, Provider2]);
    });
  });

  describe('overrideMetaAfterStage1()', () => {
    it('adding providers to meta', () => {
      const modRefId = {} as ModRefId;
      const fakeModRefId = {} as ModRefId;
      class Provider0 {}
      class Provider1 {}

      mock.addProvidersToModule(modRefId, [Provider1]);
      const normalizedModuleMeta = new NormalizedModuleMeta();
      normalizedModuleMeta.normalizedAspectMetaMap.set(restAspect, new RestAspectMeta());
      normalizedModuleMeta.providersPerApp.push(Provider0);
      normalizedModuleMeta.providersPerMod.push(Provider0);

      normalizedModuleMeta.modRefId = fakeModRefId;
      mock.overrideMetaAfterStage1(normalizedModuleMeta.modRefId, normalizedModuleMeta);
      expect(normalizedModuleMeta.providersPerApp).toEqual([Provider0]);
      expect(normalizedModuleMeta.providersPerMod).toEqual([Provider0]);

      normalizedModuleMeta.modRefId = modRefId;
      mock.overrideMetaAfterStage1(normalizedModuleMeta.modRefId, normalizedModuleMeta);
      expect(normalizedModuleMeta.providersPerApp).toEqual([Provider0, Provider1]);
      expect(normalizedModuleMeta.providersPerMod).toEqual([Provider0, Provider1]);
    });
  });
});
