import { jest } from '@jest/globals';

import { Reflector } from '#di/reflector.js';
import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { Extension } from '#extension/extension-types.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { ModuleManager } from './module-manager.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { AllModuleAspectsMap, StaticAspectOptions, ModuleAspectDecorator, ModuleAspectHandler } from '#decorators/module-aspects.js';
import { BaseNormalizedModuleMeta, NormalizedModuleMeta, createAspectMetaProxy } from '#init/normalized-meta.js';
import { DynamicModuleOptions, ModRefId } from '#decorators/module-decorator-options.js';
import { DynamicModule } from '#decorators/module-decorator-options.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { isDynamicModule } from '#decorators/type-guards.js';
import { ModuleIdNotFound, NormalizationFailure, MissingRootDecorator } from '#errors';
import { injectable } from '#di/decorators.js';
import { forwardRef, type ForwardRefFn } from '#di/forward-ref.js';
import type { Provider } from '#di/top/types-and-models.js';
import { isMultiProvider } from '#di/utils.js';

describe('ModuleManager', () => {
  @injectable()
  class Service1 {}
  @injectable()
  class Service2 {}
  @injectable()
  class Service3 {}

  class MockModuleManager extends ModuleManager {
    declare systemLogMediator: SystemLogMediator;
    declare normalizedMetaMap: Map<ModRefId, NormalizedModuleMeta>;
    declare moduleIdMap: Map<string, ModRefId>;
    override get childrenMap() {
      return super.childrenMap;
    }

    override normalizeMeta(modRefId: ModRefId): NormalizedModuleMeta {
      return super.normalizeMeta(modRefId);
    }

    override scanModule(modRefId: ModRefId | ForwardRefFn<ModRefId>) {
      return super.scanModule(modRefId);
    }
  }

  let mock: MockModuleManager;

  beforeEach(() => {
    clearDebugClassNames();
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    jest.spyOn(systemLogMediator, 'externalModuleDetectionFailed').mockImplementation(() => {});
    mock = new MockModuleManager(systemLogMediator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor()', () => {
    it('should use ModuleNormalizer passed through constructor', () => {
      @rootModule()
      class AppModule {}

      const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
      jest.spyOn(systemLogMediator, 'externalModuleDetectionFailed').mockImplementation(() => {});
      const moduleNormalizer = new ModuleNormalizer();
      const normalizeSpy = jest.spyOn(moduleNormalizer, 'normalize');
      const manager = new MockModuleManager(systemLogMediator, moduleNormalizer);

      manager.scanRootModule(AppModule);

      expect(normalizeSpy).toHaveBeenCalledWith(AppModule, systemLogMediator);
    });
  });

  describe('scanRootModule()', () => {
    it('should scan the root module first among all modules (due to moduleNormalizer.checkAndMarkExternalModule())', () => {
      class Service1 {}
      class Service2 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module1 {}

      @featureModule({
        providersPerApp: [Service2],
        imports: [Module1],
      })
      class Module2 {}

      @rootModule({ imports: [Module2] })
      class AppModule {}

      jest.spyOn(mock, 'normalizeMeta');
      mock.scanRootModule(AppModule);
      expect(mock.normalizeMeta).toHaveBeenNthCalledWith(1, AppModule);
      expect(mock.normalizeMeta).toHaveBeenNthCalledWith(2, Module2);
      expect(mock.normalizeMeta).toHaveBeenNthCalledWith(3, Module1);
    });

    it('should throw MissingRootDecorator error if the module lacks a root module decorator', () => {
      class AppModule {}
      expect(() => mock.scanRootModule(AppModule)).toThrow(new MissingRootDecorator('AppModule'));
    });

    it('should throw NormalizationFailure if metadata normalization fails', () => {
      class NotAModule {}

      @rootModule({ imports: [NotAModule] })
      class AppModule {}

      expect(() => mock.scanRootModule(AppModule)).toThrow(NormalizationFailure);
    });
  });

  describe('providersPerApp', () => {
    class Service0 {}
    class Service1 {}
    class Service2 {}
    class Service3 {}
    class Service4 {}
    class Service5 {}
    class Service6 {}
    class Service7 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module0 {}

    @featureModule({ providersPerApp: [Service1] })
    class Module1 {}

    @featureModule({
      providersPerApp: [Service2, Service3, Service4],
      imports: [Module1],
    })
    class Module2 {}

    @featureModule({
      providersPerApp: [Service5, Service6],
      imports: [Module2],
    })
    class Module3 {}

    @rootModule({
      imports: [Module3, Module0],
      providersPerApp: [{ token: Service1, useClass: Service7 }],
      exports: [Module0],
    })
    class AppModule {}

    it('should collect providers from exports array without importing them', () => {
      mock.scanRootModule(AppModule);
      const providersPerApp = mock.providersPerApp;
      expect(providersPerApp.includes(Service0)).toBe(true);
    });

    it('should collect providers in a particular order', () => {
      mock.scanRootModule(AppModule);
      expect(mock.providersPerApp).toEqual([Service1, Service2, Service3, Service4, Service5, Service6, Service0]);
    });

    it('should work with dynamicModule', () => {
      @featureModule({})
      class Module6 {}

      mock.scanModule({ module: Module6, providersPerApp: [Service7] });
      const providersPerApp = mock.providersPerApp;
      expect(providersPerApp).toEqual([Service7]);
    });
  });

  describe('circular imports', () => {
    it('should support circular imports of modules "Module1 -> Module3 -> Module2 -> Module1" using forwardRef()', () => {
      @featureModule({ providersPerApp: [Service1], imports: [forwardRef(() => Module3)] })
      class Module1 {}

      @featureModule({ imports: [Module1], providersPerApp: [Service2] })
      class Module2 {}

      @featureModule({ imports: [Module2], providersPerApp: [Service3] })
      class Module3 {}

      @featureModule({ imports: [Module3], providersPerApp: [Service1] })
      class Module4 {}

      @rootModule({
        providersPerApp: [Service1],
        imports: [Module4],
      })
      class AppModule {}

      expect(() => mock.scanRootModule(AppModule)).not.toThrow();
      expect(mock.getNormalizedModuleMeta(Module1)?.importedStaticModules).toEqual([Module3]);
      expect(mock.getNormalizedModuleMeta(Module3)?.importedStaticModules).toEqual([Module2]);
    });
  });

  describe('getNormalizedModuleMeta()', () => {
    @rootModule({ providersPerApp: [Service1] })
    class AppModule {}

    it('should return undefined if module is not found and throwErrIfNotFound is false', () => {
      mock.scanRootModule(AppModule);
      expect(mock.getNormalizedModuleMeta('non-existent')).toBeUndefined();
    });

    it('should throw ModuleIdNotFound if module is not found and throwErrIfNotFound is true', () => {
      mock.scanRootModule(AppModule);
      expect(() => mock.getNormalizedModuleMeta('non-existent', true)).toThrow(new ModuleIdNotFound('non-existent'));
    });

    it('should return the metadata by ref ID or string ID', () => {
      const moduleId = 'my-custom-id';
      @featureModule({ providersPerApp: [Service1] })
      class Module1 {}

      const dynamicModule: DynamicModule = { id: moduleId, module: Module1 };

      @rootModule({ imports: [dynamicModule] })
      class MyRootModule {}

      mock.scanRootModule(MyRootModule);
      expect(mock.getNormalizedModuleMeta(dynamicModule)).toBeDefined();
      expect(mock.getNormalizedModuleMeta(moduleId)).toBeDefined();
      expect(mock.getNormalizedModuleMeta(dynamicModule)).toBe(mock.getNormalizedModuleMeta(moduleId));
    });
  });

  describe('getInjectorPerMod() / setInjectorPerMod()', () => {
    const moduleId = 'custom-id';
    @featureModule({ providersPerApp: [Service1] })
    class Module1 {}

    const dynamicModule: DynamicModule = { id: moduleId, module: Module1 };

    @rootModule({ imports: [dynamicModule] })
    class AppModule {}

    it('should set and get injectors per module correctly', () => {
      mock.scanRootModule(AppModule);
      const fakeInjector = {} as any;

      mock.setInjectorPerMod(dynamicModule, fakeInjector);
      expect(mock.getInjectorPerMod(dynamicModule)).toBe(fakeInjector);
      expect(mock.getInjectorPerMod(moduleId)).toBe(fakeInjector);
      expect(mock.getInjectorPerMod('root')).toBeUndefined();
    });

    it('should throw ModuleIdNotFound on setInjectorPerMod if target module string ID is not found in moduleIdMap', () => {
      mock.scanRootModule(AppModule);
      const fakeInjector = {} as any;
      expect(() => mock.setInjectorPerMod('non-existent', fakeInjector)).toThrow(new ModuleIdNotFound('non-existent'));
    });

    it('should throw ModuleIdNotFound if throwErrIfNotFound is true and injector is not found', () => {
      mock.scanRootModule(AppModule);
      expect(() => mock.getInjectorPerMod('non-existent', true)).toThrow(new ModuleIdNotFound('non-existent'));
    });
  });

  describe('getInstanceOf()', () => {
    const moduleId = 'custom-id';

    @injectable()
    class SomeModuleClass {}

    @featureModule({ providersPerApp: [SomeModuleClass] })
    class Module1 {}

    const dynamicModule: DynamicModule = { id: moduleId, module: Module1, providersPerApp: [SomeModuleClass] };

    @rootModule({ imports: [dynamicModule] })
    class AppModule {}

    it('should return instance of module using ref ID or string ID', () => {
      mock.scanRootModule(AppModule);

      const mockInstance = new SomeModuleClass();
      const fakeInjector = {
        get: jest.fn().mockReturnValue(mockInstance),
      } as any;

      mock.setInjectorPerMod(dynamicModule, fakeInjector);

      expect(mock.getInstanceOf(dynamicModule)).toBe(mockInstance);
      expect(mock.getInstanceOf(moduleId)).toBe(mockInstance);
      expect(fakeInjector.get).toHaveBeenCalledWith(Module1);
    });

    it('should throw ModuleIdNotFound if throwErrIfNotFound is true and module injector is not found', () => {
      mock.scanRootModule(AppModule);
      expect(() => mock.getInstanceOf('non-existent', true)).toThrow(new ModuleIdNotFound('non-existent'));
    });

    it('should return undefined if throwErrIfNotFound is false and module injector is not found', () => {
      mock.scanRootModule(AppModule);
      expect(mock.getInstanceOf('non-existent', false)).toBeUndefined();
    });
  });

  describe('extensions', () => {
    it('should handle root module with imported some extension', () => {
      @injectable()
      class Extension1 implements Extension<void> {
        async stage1() {}
      }

      const extensionProviders: Provider[] = [Extension1];

      @featureModule({
        extensions: [{ extension: Extension1 as any, export: true }],
      })
      class Module1 {}

      @rootModule({
        imports: [Module1],
      })
      class Module3 {}

      const expectedMeta3 = new NormalizedModuleMeta();
      expectedMeta3.id = '';
      expectedMeta3.name = 'Module3';
      expectedMeta3.modRefId = Module3;
      expectedMeta3.importedStaticModules = [Module1];
      expectedMeta3.declaredInDir = expect.any(String);
      expectedMeta3.isExternal = false;
      expectedMeta3.moduleAspectMap = expect.any(Map);
      expectedMeta3.staticModuleOptions = expect.any(Object);
      delete (expectedMeta3 as any).extensionConfigs;
      delete (expectedMeta3 as any).exportedExtensionConfigs;

      const expectedMeta1 = new NormalizedModuleMeta();
      expectedMeta1.id = '';
      expectedMeta1.name = 'Module1';
      expectedMeta1.modRefId = Module1;
      expectedMeta1.extensionProviders = extensionProviders;
      expectedMeta1.exportedExtensionProviders = extensionProviders;
      expectedMeta1.declaredInDir = expect.any(String);
      expectedMeta1.isExternal = false;
      expectedMeta1.staticModuleOptions = expect.any(Object);
      delete (expectedMeta1 as any).extensionConfigs;
      delete (expectedMeta1 as any).exportedExtensionConfigs;
      expectedMeta1.moduleAspectMap = expect.any(Map);

      mock.scanRootModule(Module3);
      expect(mock.getNormalizedModuleMeta('root')).toMatchObject(expectedMeta3);
      expect(mock.getNormalizedModuleMeta(Module1)).toMatchObject(expectedMeta1);
    });

    it('should handle root module with exported and applied some extension', () => {
      @injectable()
      class Extension1 implements Extension<void> {
        async stage1() {}
      }

      const extensionProviders: Provider[] = [Extension1];

      @featureModule({
        extensions: [{ extension: Extension1 as any, export: true }],
      })
      class Module1 {}

      @rootModule({
        imports: [Module1],
        exports: [Module1],
      })
      class Module3 {}

      const expectedMeta3 = new NormalizedModuleMeta();
      expectedMeta3.id = '';
      expectedMeta3.name = 'Module3';
      expectedMeta3.modRefId = Module3;
      expectedMeta3.importedStaticModules = [Module1];
      expectedMeta3.exportedStaticModules = [Module1];
      expectedMeta3.declaredInDir = expect.any(String);
      expectedMeta3.isExternal = false;
      expectedMeta3.staticModuleOptions = expect.any(Object);
      expectedMeta3.moduleAspectMap = expect.any(Map);
      delete (expectedMeta3 as any).extensionConfigs;
      delete (expectedMeta3 as any).exportedExtensionConfigs;

      const expectedMeta1 = new NormalizedModuleMeta();
      expectedMeta1.id = '';
      expectedMeta1.name = 'Module1';
      expectedMeta1.modRefId = Module1;
      expectedMeta1.extensionProviders = extensionProviders;
      expectedMeta1.exportedExtensionProviders = extensionProviders;
      expectedMeta1.declaredInDir = expect.any(String);
      expectedMeta1.isExternal = false;
      expectedMeta1.staticModuleOptions = expect.any(Object);
      expectedMeta1.moduleAspectMap = expect.any(Map);
      delete (expectedMeta1 as any).extensionConfigs;
      delete (expectedMeta1 as any).exportedExtensionConfigs;

      mock.scanRootModule(Module3);
      expect(mock.getNormalizedModuleMeta('root')).toMatchObject(expectedMeta3);
      expect(mock.getNormalizedModuleMeta(Module1)).toMatchObject(expectedMeta1);
    });
  });

  describe('split multi providers', () => {
    it('should split multi providers and common providers correctly', () => {
      const providersPerMod: Provider[] = [
        { token: Service2, useValue: 'val4', multi: true },
        { token: Service1, useValue: 'val1', multi: true },
        { token: Service1, useValue: 'val2', multi: true },
        { token: Service1, useValue: 'val3', multi: true },
        Service3,
      ];

      @featureModule({
        providersPerMod,
        exports: [Service2, Service1, Service3],
      })
      class Module1 {}

      @rootModule({
        imports: [Module1],
      })
      class Module3 {}

      const expectedMeta3 = new NormalizedModuleMeta();
      expectedMeta3.id = '';
      expectedMeta3.name = 'Module3';
      expectedMeta3.modRefId = Module3;
      expectedMeta3.importedStaticModules = [Module1];
      expectedMeta3.declaredInDir = expect.any(String);
      expectedMeta3.isExternal = false;
      expectedMeta3.staticModuleOptions = expect.any(Object);
      expectedMeta3.moduleAspectMap = expect.any(Map);

      const expectedMeta1 = new NormalizedModuleMeta();
      expectedMeta1.id = '';
      expectedMeta1.name = 'Module1';
      expectedMeta1.modRefId = Module1;
      expectedMeta1.staticModuleOptions = expect.any(Object);
      expectedMeta1.providersPerMod = providersPerMod;
      expectedMeta1.exportedProvidersPerMod = [Service3];
      expectedMeta1.exportedMultiProvidersPerMod = providersPerMod.filter(isMultiProvider);
      expectedMeta1.declaredInDir = expect.any(String);
      expectedMeta1.isExternal = false;
      expectedMeta1.moduleAspectMap = expect.any(Map);

      mock.scanRootModule(Module3);
      expect(mock.getNormalizedModuleMeta('root')).toEqual(expectedMeta3);
      expect(mock.getNormalizedModuleMeta(Module1)).toEqual(expectedMeta1);
    });
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
      override hostAspectOptions = { one: 1 };
    }

    class AspectHandler2 extends ModuleAspectHandler<any> {
      override hostModule = HostModule2;
      override hostAspectOptions = { two: 2 };
    }

    class AspectHandler3 extends ModuleAspectHandler<any> {
      override hostModule = HostModule3;
      override hostAspectOptions = { three: 3 };
    }

    class AspectHandler4 extends ModuleAspectHandler<any> {
      override hostModule = HostModule4;
      override hostAspectOptions = { four: 4 };
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
            const params = modRefId.aspectOptions?.get(someAspect);
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
      expect(mod1.normalizedAspectMetaMap.get(someAspect)).toEqual({ path: 'some-prefix' });
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
      expect(mod1.normalizedAspectMetaMap.get(someAspect)).toEqual({ path: 'static-default' });
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
      expect(mod1.normalizedAspectMetaMap.has(someAspect)).toBe(false);
      expect(mod1.importedStaticModules.includes(HostModule1)).toBe(false);
    });

    it('should retrieve aspectOptions for three different modules with params', () => {
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
        return [...(dynamicModule.aspectOptions?.values() || [])];
      }
      expect(getParams(dynamicModule1)).toEqual([{ one: 'someAspect1-1' }]);
      expect(getParams(dynamicModule2)).toEqual([{ three: 'someAspect2-2' }]);
      expect(getParams(dynamicModule3)).toEqual([{ three: 'someAspect2-3' }, { one: 'someAspect1-3' }]);
    });

    it('should successfully apply hostAspectOptions to a host module even if it is imported before the aspect module', () => {
      @featureModule()
      class HostModule {}

      class AspectMeta extends BaseNormalizedModuleMeta {
        customProp?: string;
      }

      class AspectHandler1 extends ModuleAspectHandler<any> {
        override hostModule = HostModule;
        override hostAspectOptions = { customProp: 'works' };

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
      expect(hostMeta?.moduleAspectMap.has(someAspect)).toBe(true);
      const moduleAspectHandler = hostMeta?.moduleAspectMap.get(someAspect);
      expect(moduleAspectHandler?.moduleOptions).toEqual({ customProp: 'works' });
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
        override hostAspectOptions = {};

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

      const mock1 = new MockModuleManager(new SystemLogMediator({ moduleName: '1' }));
      mock1.scanRootModule(AppModuleOrder1);
      const meta1 = mock1.getNormalizedModuleMeta(AppModuleOrder1);

      const mock2 = new MockModuleManager(new SystemLogMediator({ moduleName: '2' }));
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
