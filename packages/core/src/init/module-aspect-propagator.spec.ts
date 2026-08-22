import { jest } from '@jest/globals';

import { Reflector } from '#di/reflector.js';
import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { ModuleRegistry } from './module-registry.js';
import { StaticAspectOptions, ModuleAspectDecorator, ModuleAspectHandler } from '#decorators/module-aspects.js';
import { BaseNormalizedModuleMeta, NormalizedModuleMeta, createAspectMetaProxy } from '#init/normalized-meta.js';
import { DynamicModuleOptions, ModRefId } from '#decorators/module-decorator-options.js';
import { DynamicModule } from '#decorators/module-decorator-options.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { isDynamicModule } from '#decorators/type-guards.js';
import { injectable } from '#di/decorators.js';

describe('ModuleAspectPropagator', () => {
  @injectable()
  class Service1 {}
  @injectable()
  class Service2 {}
  @injectable()
  class Service3 {}

  class MockModuleRegistry extends ModuleRegistry {
    declare systemLogMediator: SystemLogMediator;
    get childrenMap() {
      return this.moduleGraph.childrenMap;
    }
    override normalizeMeta(modRefId: ModRefId): NormalizedModuleMeta {
      return super.normalizeMeta(modRefId);
    }
  }

  let mock: MockModuleRegistry;

  beforeEach(() => {
    clearDebugClassNames();
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    jest.spyOn(systemLogMediator, 'externalModuleDetectionFailed').mockImplementation(() => {});
    mock = new MockModuleRegistry(systemLogMediator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('module aspects propagation', () => {
    @featureModule()
    class HostModule1 {}
    @featureModule()
    class HostModule2 {}
    @featureModule()
    class HostModule3 {}
    @featureModule()
    class HostModule4 {}

    class AspectHandler1 extends ModuleAspectHandler<any> {
      override hostModule = HostModule1;
      override hostStaticAspectOptions = { one: 1 };
    }

    class AspectHandler2 extends ModuleAspectHandler<any> {
      override hostModule = HostModule2;
      override hostStaticAspectOptions = { two: 2 };
    }

    class AspectHandler3 extends ModuleAspectHandler<any> {
      override hostModule = HostModule3;
      override hostStaticAspectOptions = { three: 3 };
    }

    class AspectHandler4 extends ModuleAspectHandler<any> {
      override hostModule = HostModule4;
      override hostStaticAspectOptions = { four: 4 };
    }

    it('should propagate allModuleAspectsMap so that they only contain module aspects imported into the current module', () => {
      const someAspect1: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new AspectHandler1(data));
      const someAspect2: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new AspectHandler2(data));
      const someAspect3: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new AspectHandler3(data));
      const someAspect4: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new AspectHandler4(data));

      @someAspect1({ name: '1' })
      @featureModule()
      class Module1 {}

      @someAspect2({ name: '2' })
      @featureModule({ imports: [Module1], providersPerApp: [Service1] })
      class Module2 {}

      @someAspect3({ name: '3' })
      @featureModule({ imports: [Module2], providersPerApp: [Service1] })
      class Module3 {}

      @someAspect4({ name: '4' })
      @rootModule({ imports: [Module3], providersPerApp: [Service1] })
      class Module4 {}

      mock.scanRootModule(Module4);

      const mod1 = mock.getNormalizedModuleMeta(Module1, true);
      const mod2 = mock.getNormalizedModuleMeta(Module2, true);
      const mod3 = mock.getNormalizedModuleMeta(Module3, true);
      const mod4 = mock.getNormalizedModuleMeta(Module4, true);

      expect(mock.getNormalizedModuleMeta(HostModule1, true).modRefId).toBe(HostModule1);
      expect(mock.getNormalizedModuleMeta(HostModule2, true).modRefId).toBe(HostModule2);
      expect(mock.getNormalizedModuleMeta(HostModule3, true).modRefId).toBe(HostModule3);
      expect(mock.getNormalizedModuleMeta(HostModule4, true).modRefId).toBe(HostModule4);

      expect(mod1.allModuleAspectsMap.size).toBe(1);
      expect(mod1.allModuleAspectsMap.get(someAspect1)?.hostModule).toBe(HostModule1);

      expect(mod2.allModuleAspectsMap.size).toBe(2);
      expect(mod2.allModuleAspectsMap.get(someAspect1)?.hostModule).toBe(HostModule1);
      expect(mod2.allModuleAspectsMap.get(someAspect2)?.hostModule).toBe(HostModule2);

      expect(mod3.allModuleAspectsMap.size).toBe(3);
      expect(mod3.allModuleAspectsMap.get(someAspect1)?.hostModule).toBe(HostModule1);
      expect(mod3.allModuleAspectsMap.get(someAspect2)?.hostModule).toBe(HostModule2);
      expect(mod3.allModuleAspectsMap.get(someAspect3)?.hostModule).toBe(HostModule3);

      expect(mod4.allModuleAspectsMap.size).toBe(4);
      expect(mod4.allModuleAspectsMap.get(someAspect1)?.hostModule).toBe(HostModule1);
      expect(mod4.allModuleAspectsMap.get(someAspect2)?.hostModule).toBe(HostModule2);
      expect(mod4.allModuleAspectsMap.get(someAspect3)?.hostModule).toBe(HostModule3);
      expect(mod4.allModuleAspectsMap.get(someAspect4)?.hostModule).toBe(HostModule4);
    });

    it('should handle Module1 not having an annotation with someAspect, but imported in AppModule with this decorator', () => {
      interface MyDynamicOptions extends DynamicModuleOptions {
        path?: string;
      }
      interface RootModuleOptions extends StaticAspectOptions<MyDynamicOptions> {
        one?: string;
        two?: string;
      }
      interface AspectMeta extends BaseNormalizedModuleMeta {
        path?: string;
      }
      class AspectHandler1 extends ModuleAspectHandler<RootModuleOptions> {
        override normalize({ modRefId }: NormalizedModuleMeta): AspectMeta {
          if (isDynamicModule(modRefId)) {
            const params = modRefId.dynamicAspectOptionsMap?.get(someAspect);
            return { path: params?.path } as AspectMeta;
          }
          return {} as AspectMeta;
        }
      }

      const someAspect: ModuleAspectDecorator<RootModuleOptions, MyDynamicOptions, AspectMeta> = Reflector.makeClassDecorator(
        (d) => new AspectHandler1(d),
      );

      @featureModule({ providersPerApp: [{ token: 'token1', useValue: 'value1' }] })
      class Module1 {}

      const dynamicModule: DynamicModule = { module: Module1 };

      @someAspect({ one: 'some-here', imports: [{ dynamicModule, path: 'some-prefix' }] })
      @rootModule()
      class AppModule {}

      mock.scanRootModule(AppModule);
      const mod1 = mock.getNormalizedModuleMeta(dynamicModule)!;
      expect(mod1.normalizedAspectsMetaMap.get(someAspect)).toEqual({ path: 'some-prefix' });
    });

    it('should handle static Module1 not having an annotation with someAspect, but imported in AppModule with this decorator', () => {
      interface MyDynamicOptions extends DynamicModuleOptions {
        path?: string;
      }
      interface RootModuleOptions extends StaticAspectOptions<MyDynamicOptions> {
        one?: string;
        two?: string;
      }
      interface AspectMeta extends BaseNormalizedModuleMeta {
        path?: string;
      }

      @featureModule()
      class HostModule1 {}

      class AspectHandler1 extends ModuleAspectHandler<RootModuleOptions> {
        override hostModule = HostModule1;
        override normalize(): AspectMeta {
          return { path: 'static-default' } as AspectMeta;
        }
      }

      @featureModule({ providersPerApp: [{ token: 'token1', useValue: 'value1' }] })
      class Module1 {}

      const someAspect: ModuleAspectDecorator<RootModuleOptions, { path?: string }, AspectMeta> = Reflector.makeClassDecorator(
        (d) => new AspectHandler1(d),
      );

      @someAspect({ one: 'some-here', imports: [Module1] })
      @rootModule()
      class AppModule {}

      mock.scanRootModule(AppModule);
      const mod1 = mock.getNormalizedModuleMeta(Module1)!;
      expect(mod1.normalizedAspectsMetaMap.get(someAspect)).toEqual({ path: 'static-default' });
      expect(mod1.importedStaticModules.includes(HostModule1)).toBe(true);
    });

    it('should not propagate context hooks when inheritsAspects is false for static Module1', () => {
      interface MyDynamicOptions extends DynamicModuleOptions {
        path?: string;
      }
      interface RootModuleOptions extends StaticAspectOptions<MyDynamicOptions> {
        one?: string;
      }
      interface AspectMeta extends BaseNormalizedModuleMeta {
        path?: string;
      }

      @featureModule()
      class HostModule1 {}

      class AspectHandler1 extends ModuleAspectHandler<RootModuleOptions> {
        override hostModule = HostModule1;
        override normalize({ modRefId }: NormalizedModuleMeta): AspectMeta {
          return { path: 'static-default' } as AspectMeta;
        }
      }

      const someAspect: ModuleAspectDecorator<RootModuleOptions, { path?: string }, AspectMeta> = Reflector.makeClassDecorator(
        (d) => new AspectHandler1(d),
      );

      @featureModule({
        inheritsAspects: false,
        providersPerApp: [{ token: 'token1', useValue: 'value1' }],
      })
      class Module1 {}

      @someAspect({ one: 'some-here', imports: [Module1] })
      @rootModule()
      class AppModule {}

      mock.scanRootModule(AppModule);
      const mod1 = mock.getNormalizedModuleMeta(Module1)!;
      expect(mod1.normalizedAspectsMetaMap.has(someAspect)).toBe(false);
      expect(mod1.importedStaticModules.includes(HostModule1)).toBe(false);
    });

    it('should retrieve dynamicAspectOptionsMap for three different modules with params', () => {
      interface MyDynamicOptions1 extends DynamicModuleOptions {
        one?: string;
      }
      interface MyDynamicOptions2 extends DynamicModuleOptions {
        three?: string;
      }
      interface DecoratorOptions1 extends StaticAspectOptions<MyDynamicOptions1> {
        one?: string;
      }
      interface AspectMeta1 {
        paramsForAspectMeta1?: any;
      }
      interface DecoratorOptions2 extends StaticAspectOptions<MyDynamicOptions2> {
        three?: string;
      }
      interface AspectMeta2 {
        paramsForAspectMeta2?: any;
      }
      class AspectHandler1 extends ModuleAspectHandler<DecoratorOptions1> {}
      class AspectHandler2 extends ModuleAspectHandler<DecoratorOptions2> {}

      const someAspect1: ModuleAspectDecorator<DecoratorOptions1, {}, AspectMeta1> = Reflector.makeClassDecorator(
        (d) => new AspectHandler1(d),
      );
      const someAspect2: ModuleAspectDecorator<DecoratorOptions2, {}, AspectMeta2> = Reflector.makeClassDecorator(
        (d) => new AspectHandler2(d),
      );

      @featureModule({ providersPerApp: [{ token: 'token1', useValue: 'value1' }] })
      class Module1 {}

      @featureModule({ providersPerApp: [{ token: 'token2', useValue: 'value2' }] })
      class Module2 {}

      @featureModule({ providersPerApp: [{ token: 'token3', useValue: 'value3' }] })
      class Module3 {}

      const dynamicModule1: DynamicModule = { module: Module1 };
      const dynamicModule2: DynamicModule = { module: Module2 };
      const dynamicModule3: DynamicModule = { module: Module3 };

      @someAspect1({
        imports: [
          { dynamicModule: dynamicModule1, one: 'someAspect1-1' },
          { dynamicModule: dynamicModule3, one: 'someAspect1-3' },
        ],
      })
      @someAspect2({
        imports: [
          { dynamicModule: dynamicModule2, three: 'someAspect2-2' },
          { dynamicModule: dynamicModule3, three: 'someAspect2-3' },
        ],
      })
      @rootModule()
      class AppModule {}

      mock.scanRootModule(AppModule);

      function getParams(dynamicModule: DynamicModule) {
        return [...(dynamicModule.dynamicAspectOptionsMap?.values() || [])];
      }
      expect(getParams(dynamicModule1)).toEqual([{ one: 'someAspect1-1' }]);
      expect(getParams(dynamicModule2)).toEqual([{ three: 'someAspect2-2' }]);
      expect(getParams(dynamicModule3)).toEqual([{ three: 'someAspect2-3' }, { one: 'someAspect1-3' }]);
    });

    it('should successfully apply hostStaticAspectOptions to a host module even if it is imported before the aspect module', () => {
      @featureModule()
      class HostModule {}

      class AspectMeta extends BaseNormalizedModuleMeta {
        customProp?: string;
      }

      class AspectHandler1 extends ModuleAspectHandler<any> {
        override hostModule = HostModule;
        override hostStaticAspectOptions = { customProp: 'works' };

        override normalize(normalizedModuleMeta: NormalizedModuleMeta): any {
          return createAspectMetaProxy(normalizedModuleMeta, AspectMeta);
        }
      }

      const someAspect: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new AspectHandler1(d));

      @someAspect()
      @featureModule()
      class AspectModule {}

      // Notice the order: HostModule is imported FIRST.
      @rootModule({ imports: [HostModule, AspectModule] })
      class AppModule {}

      mock.scanRootModule(AppModule);

      const hostMeta = mock.getNormalizedModuleMeta(HostModule);
      expect(hostMeta?.moduleAspectsMap.has(someAspect)).toBe(true);
      const moduleAspectHandler = hostMeta?.moduleAspectsMap.get(someAspect);
      expect(moduleAspectHandler?.staticAspectOptions).toEqual({ customProp: 'works' });
    });

    it('should scan modules returned by getModulesToScan() of a host aspect', () => {
      class Provider1 {}

      @featureModule({ providersPerApp: [Provider1] })
      class ModuleC {}

      @featureModule({ providersPerApp: [Provider1] })
      class HostModule {}

      class AspectMeta extends BaseNormalizedModuleMeta {}

      class AspectHandler1 extends ModuleAspectHandler<any> {
        override hostModule = HostModule;
        override hostStaticAspectOptions = {};

        override normalize(normalizedModuleMeta: NormalizedModuleMeta): any {
          return createAspectMetaProxy(normalizedModuleMeta, AspectMeta);
        }

        override getModulesToScan(meta: BaseNormalizedModuleMeta) {
          return [ModuleC];
        }
      }

      const someAspect: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new AspectHandler1(d));

      @someAspect()
      @featureModule({ providersPerApp: [Provider1] })
      class AspectModule {}

      @rootModule({ imports: [HostModule, AspectModule] })
      class AppModule {}

      mock.scanRootModule(AppModule);

      const hostChildren = mock.childrenMap.get(HostModule);
      expect(hostChildren?.has(ModuleC)).toBe(true);

      const aspectChildren = mock.childrenMap.get(AspectModule);
      expect(aspectChildren?.has(ModuleC)).toBe(true);

      const moduleCMeta = mock.getNormalizedModuleMeta(ModuleC, true);
      expect(moduleCMeta.modRefId).toBe(ModuleC);
    });

    it('should accumulate the exact same allModuleAspectsMap in the parent regardless of import order', () => {
      class AspectHandler1 extends ModuleAspectHandler<any> {
        override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
          return normalizedModuleMeta;
        }
      }
      class AspectHandler2 extends ModuleAspectHandler<any> {
        override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
          return normalizedModuleMeta;
        }
      }

      const aspectDec1: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new AspectHandler1(d));
      const aspectDec2: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new AspectHandler2(d));

      @aspectDec1()
      @featureModule()
      class ModuleA {}

      @aspectDec2()
      @featureModule()
      class ModuleB {}

      @rootModule({ imports: [ModuleA, ModuleB] })
      class AppModuleOrder1 {}

      @rootModule({ imports: [ModuleB, ModuleA] })
      class AppModuleOrder2 {}

      const mock1 = new MockModuleRegistry(new SystemLogMediator({ moduleName: '1' }));
      mock1.scanRootModule(AppModuleOrder1);
      const meta1 = mock1.getNormalizedModuleMeta(AppModuleOrder1);

      const mock2 = new MockModuleRegistry(new SystemLogMediator({ moduleName: '2' }));
      mock2.scanRootModule(AppModuleOrder2);
      const meta2 = mock2.getNormalizedModuleMeta(AppModuleOrder2);

      expect(meta1!.allModuleAspectsMap.size).toBe(2);
      expect(meta1!.allModuleAspectsMap.has(aspectDec1)).toBe(true);
      expect(meta1!.allModuleAspectsMap.has(aspectDec2)).toBe(true);

      expect(meta2!.allModuleAspectsMap.size).toBe(2);
      expect(meta2!.allModuleAspectsMap.has(aspectDec1)).toBe(true);
      expect(meta2!.allModuleAspectsMap.has(aspectDec2)).toBe(true);
    });
    it('should add the host module to childrenMap when aspects are inherited via top-down propagation', () => {
      @featureModule()
      class HostModule {}

      class TestAspectHandler extends ModuleAspectHandler<any> {
        override hostModule = HostModule;

        override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
          return createAspectMetaProxy(normalizedModuleMeta, BaseNormalizedModuleMeta);
        }
      }

      const testAspect: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new TestAspectHandler(d));

      @featureModule({ providersPerApp: [{ token: 'token1', useValue: 'value1' }] })
      class ChildModule {}

      @testAspect()
      @rootModule({ imports: [ChildModule] })
      class AppModule {}

      mock.scanRootModule(AppModule);

      // ChildModule inherits testAspect from AppModule, so HostModule should be in its childrenMap.
      const childChildren = mock.childrenMap.get(ChildModule);
      expect(childChildren).toBeDefined();
      expect(childChildren!.has(HostModule)).toBe(true);
    });
  });
});
