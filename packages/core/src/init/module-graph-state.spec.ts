import { featureModule } from '#decorators/feature-module.js';
import { rootModule, RootModuleOptions } from '#decorators/root-module.js';
import { FeatureModuleOptions } from '#decorators/module-decorator-options.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { ModuleGraphState } from '#init/module-graph-state.js';
import { injectable } from '#di/decorators.js';

describe('ModuleGraphState', () => {
  @injectable()
  class Provider1 {}

  @injectable()
  class Provider2 {}

  @injectable()
  class Provider3 {}

  @featureModule({ providersPerApp: [Provider1] })
  class FeatureModule1 {}

  @featureModule({ providersPerApp: [Provider2] })
  class FeatureModule2 {}

  @rootModule({ providersPerApp: [Provider3] })
  class AppModule {}

  it('should rebuild providersPerApp only from non-root modules', () => {
    const featureMeta = new NormalizedModuleMeta();
    featureMeta.modRefId = FeatureModule1;
    featureMeta.providersPerApp = [Provider1];
    featureMeta.staticModuleOptions = new FeatureModuleOptions();

    const rootMeta = new NormalizedModuleMeta();
    rootMeta.modRefId = AppModule;
    rootMeta.providersPerApp = [Provider2];
    rootMeta.staticModuleOptions = new RootModuleOptions();

    const state = new ModuleGraphState();
    state.snapshotMap.set(FeatureModule1, featureMeta);
    state.snapshotMap.set(AppModule, rootMeta);

    state.rebuildProvidersPerApp();
    expect(state.providersPerApp).toEqual([Provider1]);
  });

  it('should deeply clone snapshotMap, childrenMap, snapshotMapId, and providersPerApp', () => {
    const state = new ModuleGraphState();
    const meta = new NormalizedModuleMeta();
    meta.modRefId = FeatureModule1;
    meta.providersPerMod = [Provider1];
    meta.id = 'feat1';
    state.snapshotMap.set(FeatureModule1, meta);
    state.snapshotMapId.set('feat1', FeatureModule1);
    state.childrenMap.set(FeatureModule1, new Set([FeatureModule2]));
    state.providersPerApp = [Provider1];

    const copy = state.clone();
    expect(copy).not.toBe(state);
    expect(copy.snapshotMap.get(FeatureModule1)).toEqual(meta);
    expect(copy.snapshotMap.get(FeatureModule1)).not.toBe(meta);
    expect(copy.snapshotMapId.get('feat1')).toBe(FeatureModule1);
    expect(copy.childrenMap.get(FeatureModule1)).toEqual(new Set([FeatureModule2]));
    expect(copy.childrenMap.get(FeatureModule1)).not.toBe(state.childrenMap.get(FeatureModule1));

    // Modifying copy does not mutate state
    copy.providersPerApp.push(Provider2);
    expect(state.providersPerApp).toEqual([Provider1]);
    expect(copy.providersPerApp).toEqual([Provider1, Provider2]);
  });

  it('should remove orphan module and automatically clean snapshotMapId and childrenMap', () => {
    const state = new ModuleGraphState();
    const meta2 = new NormalizedModuleMeta();
    meta2.modRefId = FeatureModule2;
    meta2.id = 'feature2';
    meta2.providersPerApp = [Provider2];

    state.snapshotMap.set(FeatureModule2, meta2);
    state.snapshotMapId.set('feature2', FeatureModule2);
    state.childrenMap.set(FeatureModule2, new Set());
    state.providersPerApp = [Provider2];

    // Remove without passing string ID explicitly, testing fallback to meta.id
    state.removeOrphanModule(FeatureModule2);
    expect(state.snapshotMap.has(FeatureModule2)).toBe(false);
    expect(state.snapshotMapId.has('feature2')).toBe(false);
    expect(state.childrenMap.has(FeatureModule2)).toBe(false);
    expect(state.providersPerApp).toEqual([]);
  });
});
