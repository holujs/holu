import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { injectable } from '#di/decorators.js';
import { ExtensionGroupToken } from '#di/key-registry.js';
import type { Extension } from '#extension/extension-types.js';
import { ModuleAspectHandler } from '#decorators/module-aspects.js';

describe('NormalizedModuleMeta', () => {
  @injectable()
  class Provider1 {}

  @injectable()
  class Provider2 {}

  class DummyExtension implements Extension<void> {
    async stage1() {}
  }

  it('should deep clone arrays, extensionsMeta, and maps without mutating original on modification', () => {
    const original = new NormalizedModuleMeta();
    original.name = 'TestModule';
    original.providersPerMod = [Provider1];
    original.extensionsMeta = {
      group1: [Provider1],
      config1: { key: 'value1' },
    };
    const groupToken = new ExtensionGroupToken('group1');
    original.extensionGroupTokensMap.set(DummyExtension, groupToken);

    const copy = original.clone();
    expect(copy).not.toBe(original);
    expect(copy.name).toBe('TestModule');
    expect(copy.providersPerMod).toEqual([Provider1]);
    expect(copy.providersPerMod).not.toBe(original.providersPerMod);
    expect(copy.extensionGroupTokensMap.get(DummyExtension)).toBe(groupToken);

    // Modify array in copy
    copy.providersPerMod.push(Provider2);
    expect(original.providersPerMod).toEqual([Provider1]);
    expect(copy.providersPerMod).toEqual([Provider1, Provider2]);

    // Modify extensionsMeta in copy
    if (copy.extensionsMeta) {
      (copy.extensionsMeta.group1 as unknown[]).push(Provider2);
      (copy.extensionsMeta.config1 as any).key = 'modified';
    }

    expect(original.extensionsMeta).toEqual({
      group1: [Provider1],
      config1: { key: 'value1' },
    });
    expect(copy.extensionsMeta).toEqual({
      group1: [Provider1, Provider2],
      config1: { key: 'modified' },
    });
  });

  it('should not mutate original moduleMixin instance when clone() calls normalize()', () => {
    class MutatingMixin extends ModuleAspectHandler<any> {
      normalizedCount = 0;
      constructor() {
        super({});
      }
      override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
        this.normalizedCount++;
        return super.normalize(normalizedModuleMeta);
      }
    }

    const original = new NormalizedModuleMeta();
    const mixin = new MutatingMixin();
    original.moduleAspectMap.set(MutatingMixin as any, mixin);

    expect(mixin.normalizedCount).toBe(0);

    const copy = original.clone();

    // The original mixin should remain untouched
    expect(mixin.normalizedCount).toBe(0);

    // The copied mixin in copy.moduleAspectMap should be a clone and should have been normalized
    const copiedMixin = copy.moduleAspectMap.get(MutatingMixin as any) as unknown as MutatingMixin;
    expect(copiedMixin).toBeDefined();
    expect(copiedMixin).not.toBe(mixin);
    expect(copiedMixin.normalizedCount).toBe(1);
  });
});
