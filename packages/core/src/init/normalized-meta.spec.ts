import { NormalizedModuleMeta, BaseNormalizedModuleMeta, createAspectMetaProxy } from '#init/normalized-meta.js';
import { injectable } from '#di/decorators.js';
import { ExtensionGroupToken } from '#di/key-registry.js';
import type { Extension } from '#extension/extension-types.js';
import { ModuleAspectHandler, StaticAspectOptions, ModuleAspectDecorator } from '#decorators/module-aspects.js';
import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { Reflector } from '#di/reflector.js';
import { DynamicModuleOptions, DynamicModule } from '#decorators/module-decorator-options.js';
import { isDynamicModule } from '#decorators/type-guards.js';
import { ModuleRegistry } from '#init/module-registry.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';

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

  it('should not mutate original moduleAspect instance when clone() calls normalize()', () => {
    class MutatingAspect extends ModuleAspectHandler<any> {
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
    const aspect = new MutatingAspect();
    original.moduleAspectMap.set(MutatingAspect as any, aspect);

    expect(aspect.normalizedCount).toBe(0);

    const copy = original.clone();

    // The original aspect should remain untouched
    expect(aspect.normalizedCount).toBe(0);

    // The copied aspect in copy.moduleAspectMap should be a clone and should have been normalized
    const copiedAspect = copy.moduleAspectMap.get(MutatingAspect as any) as unknown as MutatingAspect;
    expect(copiedAspect).toBeDefined();
    expect(copiedAspect).not.toBe(aspect);
    expect(copiedAspect.normalizedCount).toBe(1);
  });
  describe('clone() on NormalizedModuleMeta', () => {
    class MockModuleRegistry extends ModuleRegistry {
      declare systemLogMediator: SystemLogMediator;
    }

    it('should copy NormalizedModuleMeta correctly, preserving prototype and recreating aspectMeta proxies wrapping the copy', () => {
      const mock = new MockModuleRegistry(new SystemLogMediator({ moduleName: 'fakeName' }));
      interface MyDynamicOptions extends DynamicModuleOptions {
        path?: string;
      }
      interface RootAspectOptions extends StaticAspectOptions<MyDynamicOptions> {
        one?: string;
      }
      class AspectMeta extends BaseNormalizedModuleMeta {
        path?: string;
      }
      class ModuleAspect1 extends ModuleAspectHandler<RootAspectOptions> {
        override normalize(normalizedModuleMeta: NormalizedModuleMeta): AspectMeta {
          const meta = createAspectMetaProxy(normalizedModuleMeta, AspectMeta);
          if (isDynamicModule(normalizedModuleMeta.modRefId)) {
            const params = normalizedModuleMeta.modRefId.dynamicAspectOptionsMap?.get(someAspect);
            meta.path = params?.path;
          }
          return meta;
        }
      }
      const someAspect: ModuleAspectDecorator<RootAspectOptions, { path?: string }, AspectMeta> = Reflector.makeClassDecorator(
        (d) => new ModuleAspect1(d),
      );

      @featureModule({ providersPerApp: [{ token: 'token1', useValue: 'value1' }] })
      class Module1 {}

      const dynamicModule: DynamicModule = { module: Module1 };

      @someAspect({ one: 'some-here', imports: [{ dynamicModule: dynamicModule, path: 'some-prefix' }] })
      @rootModule()
      class AppModule {}

      mock.scanRootModule(AppModule);
      const originalMod1 = mock.getNormalizedModuleMeta(dynamicModule)!;
      expect(originalMod1).toBeInstanceOf(NormalizedModuleMeta);

      // Call clone
      const copiedMod1 = originalMod1.clone();
      expect(copiedMod1).toBeInstanceOf(NormalizedModuleMeta);
      expect(copiedMod1).not.toBe(originalMod1);

      // Maps should be new instances
      expect(copiedMod1.moduleAspectMap).not.toBe(originalMod1.moduleAspectMap);
      expect(copiedMod1.allModuleAspectsMap).not.toBe(originalMod1.allModuleAspectsMap);
      expect(copiedMod1.normalizedAspectMetaMap).not.toBe(originalMod1.normalizedAspectMetaMap);

      // The proxy inside copiedMod1.normalizedAspectMetaMap should wrap copiedMod1.
      const originalProxy = originalMod1.normalizedAspectMetaMap.get(someAspect) as AspectMeta;
      const copiedProxy = copiedMod1.normalizedAspectMetaMap.get(someAspect) as AspectMeta;

      expect(copiedProxy).toBeDefined();
      expect(copiedProxy).not.toBe(originalProxy);

      // When we mutate providersPerApp of copiedMod1, it should NOT affect originalProxy, but it should affect copiedProxy.
      copiedMod1.providersPerApp.push({ token: 'new-token', useValue: 'new-val' });
      expect(originalProxy.providersPerApp.some((p) => (p as any).token === 'new-token')).toBe(false);
      expect(copiedProxy.providersPerApp.some((p) => (p as any).token === 'new-token')).toBe(true);
    });
  });
});
