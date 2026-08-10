import { jest } from '@jest/globals';

import { Reflector } from '#di/reflector.js';
import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { Extension } from '#extension/extension-types.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { ModuleManager } from './module-manager.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { AllModuleMixinsMap, StaticMixinOptions, MixinDecorator, ModuleMixin } from '#decorators/module-mixins.js';
import { BaseNormalizedModuleMeta, NormalizedModuleMeta, getProxyForMixinMeta } from '#init/normalized-meta.js';
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
      class LocalService1 {}
      class LocalService2 {}

      @featureModule({ providersPerApp: [LocalService1] })
      class Module1 {}

      @featureModule({
        providersPerApp: [LocalService2],
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
    class LocalService1 {}
    class LocalService2 {}
    class LocalService3 {}
    class LocalService4 {}
    class LocalService5 {}
    class LocalService6 {}
    class LocalService7 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module0 {}

    @featureModule({ providersPerApp: [LocalService1] })
    class Module1 {}

    @featureModule({
      providersPerApp: [LocalService2, LocalService3, LocalService4],
      imports: [Module1],
    })
    class Module2 {}

    @featureModule({
      providersPerApp: [LocalService5, LocalService6],
      imports: [Module2],
    })
    class Module3 {}

    @rootModule({
      imports: [Module3, Module0],
      providersPerApp: [{ token: LocalService1, useClass: LocalService7 }],
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
      expect(mock.providersPerApp).toEqual([
        LocalService1,
        LocalService2,
        LocalService3,
        LocalService4,
        LocalService5,
        LocalService6,
        Service0,
      ]);
    });

    it('should work with dynamicModule', () => {
      @featureModule({})
      class Module6 {}

      mock.scanModule({ module: Module6, providersPerApp: [LocalService7] });
      const providersPerApp = mock.providersPerApp;
      expect(providersPerApp).toEqual([LocalService7]);
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
      expectedMeta3.moduleMixinMap = expect.any(Map);
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
      expectedMeta1.moduleMixinMap = expect.any(Map);

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
      expectedMeta3.moduleMixinMap = expect.any(Map);
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
      expectedMeta1.moduleMixinMap = expect.any(Map);
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
      expectedMeta3.moduleMixinMap = expect.any(Map);

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
      expectedMeta1.moduleMixinMap = expect.any(Map);

      mock.scanRootModule(Module3);
      expect(mock.getNormalizedModuleMeta('root')).toEqual(expectedMeta3);
      expect(mock.getNormalizedModuleMeta(Module1)).toEqual(expectedMeta1);
    });
  });

  describe('module mixins propagation', () => {
    @featureModule()
    class HostModule1 {}
    @featureModule()
    class HostModule2 {}
    @featureModule()
    class HostModule3 {}
    @featureModule()
    class HostModule4 {}

    class ModuleMixin1 extends ModuleMixin<any> {
      override hostModule = HostModule1;
      override hostMixinOptions = { one: 1 };
    }

    class ModuleMixin2 extends ModuleMixin<any> {
      override hostModule = HostModule2;
      override hostMixinOptions = { two: 2 };
    }

    class ModuleMixin3 extends ModuleMixin<any> {
      override hostModule = HostModule3;
      override hostMixinOptions = { three: 3 };
    }

    class ModuleMixin4 extends ModuleMixin<any> {
      override hostModule = HostModule4;
      override hostMixinOptions = { four: 4 };
    }

    it('should propagate allModuleMixinsMap so that they only contain module mixins imported into the current module', () => {
      const mixinSome1: MixinDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new ModuleMixin1(data));
      const mixinSome2: MixinDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new ModuleMixin2(data));
      const mixinSome3: MixinDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new ModuleMixin3(data));
      const mixinSome4: MixinDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new ModuleMixin4(data));

      @mixinSome1({ name: '1' })
      @featureModule()
      class Module1 {}

      @mixinSome2({ name: '2' })
      @featureModule({ imports: [Module1], providersPerApp: [Service1] })
      class Module2 {}

      @mixinSome3({ name: '3' })
      @featureModule({ imports: [Module2], providersPerApp: [Service1] })
      class Module3 {}

      @mixinSome4({ name: '4' })
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

      expect(mod1.allModuleMixinsMap.size).toBe(1);
      expect(mod1.allModuleMixinsMap.get(mixinSome1)?.hostModule).toBe(HostModule1);

      expect(mod2.allModuleMixinsMap.size).toBe(2);
      expect(mod2.allModuleMixinsMap.get(mixinSome1)?.hostModule).toBe(HostModule1);
      expect(mod2.allModuleMixinsMap.get(mixinSome2)?.hostModule).toBe(HostModule2);

      expect(mod3.allModuleMixinsMap.size).toBe(3);
      expect(mod3.allModuleMixinsMap.get(mixinSome1)?.hostModule).toBe(HostModule1);
      expect(mod3.allModuleMixinsMap.get(mixinSome2)?.hostModule).toBe(HostModule2);
      expect(mod3.allModuleMixinsMap.get(mixinSome3)?.hostModule).toBe(HostModule3);

      expect(mod4.allModuleMixinsMap.size).toBe(4);
      expect(mod4.allModuleMixinsMap.get(mixinSome1)?.hostModule).toBe(HostModule1);
      expect(mod4.allModuleMixinsMap.get(mixinSome2)?.hostModule).toBe(HostModule2);
      expect(mod4.allModuleMixinsMap.get(mixinSome3)?.hostModule).toBe(HostModule3);
      expect(mod4.allModuleMixinsMap.get(mixinSome4)?.hostModule).toBe(HostModule4);
    });

    it('should handle Module1 not having an annotation with mixinSome, but imported in AppModule with this decorator', () => {
      interface MyDynamicOptions extends DynamicModuleOptions {
        path?: string;
      }
      interface RootModuleOptions extends StaticMixinOptions<MyDynamicOptions> {
        one?: string;
        two?: string;
      }
      interface MixinMeta extends BaseNormalizedModuleMeta {
        path?: string;
      }
      class ModuleMixin1Local extends ModuleMixin<RootModuleOptions> {
        override normalize({ modRefId }: NormalizedModuleMeta): MixinMeta {
          if (isDynamicModule(modRefId)) {
            const params = modRefId.mixinOptions?.get(mixinSome);
            return { path: params?.path } as MixinMeta;
          }
          return {} as MixinMeta;
        }
      }

      const mixinSome: MixinDecorator<RootModuleOptions, MyDynamicOptions, MixinMeta> = Reflector.makeClassDecorator(
        (d) => new ModuleMixin1Local(d),
      );

      @featureModule({ providersPerApp: [{ token: 'token1', useValue: 'value1' }] })
      class Module1 {}

      const dynamicModule: DynamicModule = { module: Module1 };

      @mixinSome({ one: 'some-here', imports: [{ dynamicModule: dynamicModule, path: 'some-prefix' }] })
      @rootModule()
      class AppModuleLocal {}

      mock.scanRootModule(AppModuleLocal);
      const mod1 = mock.getNormalizedModuleMeta(dynamicModule)!;
      expect(mod1.normalizedMixinMetaMap.get(mixinSome)).toEqual({ path: 'some-prefix' });
    });

    it('should handle static Module1 not having an annotation with mixinSome, but imported in AppModule with this decorator', () => {
      interface MyDynamicOptions extends DynamicModuleOptions {
        path?: string;
      }
      interface RootModuleOptions extends StaticMixinOptions<MyDynamicOptions> {
        one?: string;
        two?: string;
      }
      interface MixinMeta extends BaseNormalizedModuleMeta {
        path?: string;
      }

      @featureModule()
      class HostModule1Local {}

      class ModuleMixin1Local extends ModuleMixin<RootModuleOptions> {
        override hostModule = HostModule1Local;
        override normalize({ modRefId }: NormalizedModuleMeta): MixinMeta {
          return { path: 'static-default' } as MixinMeta;
        }
      }

      @featureModule({ providersPerApp: [{ token: 'token1', useValue: 'value1' }] })
      class Module1 {}

      const mixinSomeLocal: MixinDecorator<RootModuleOptions, { path?: string }, MixinMeta> = Reflector.makeClassDecorator(
        (d) => new ModuleMixin1Local(d),
      );

      @mixinSomeLocal({ one: 'some-here', imports: [Module1] })
      @rootModule()
      class AppModuleLocal {}

      mock.scanRootModule(AppModuleLocal);
      const mod1 = mock.getNormalizedModuleMeta(Module1)!;
      expect(mod1.normalizedMixinMetaMap.get(mixinSomeLocal)).toEqual({ path: 'static-default' });
      expect(mod1.importedStaticModules.includes(HostModule1Local)).toBe(true);
    });

    it('should not propagate context hooks when inheritsMixins is false for static Module1', () => {
      interface MyDynamicOptions extends DynamicModuleOptions {
        path?: string;
      }
      interface RootModuleOptions extends StaticMixinOptions<MyDynamicOptions> {
        one?: string;
      }
      interface MixinMeta extends BaseNormalizedModuleMeta {
        path?: string;
      }

      @featureModule()
      class HostModule1Local {}

      class ModuleMixin1Local extends ModuleMixin<RootModuleOptions> {
        override hostModule = HostModule1Local;
        override normalize({ modRefId }: NormalizedModuleMeta): MixinMeta {
          return { path: 'static-default' } as MixinMeta;
        }
      }

      const mixinSomeLocal: MixinDecorator<RootModuleOptions, { path?: string }, MixinMeta> = Reflector.makeClassDecorator(
        (d) => new ModuleMixin1Local(d),
      );

      @featureModule({
        inheritsMixins: false,
        providersPerApp: [{ token: 'token1', useValue: 'value1' }],
      })
      class Module1 {}

      @mixinSomeLocal({ one: 'some-here', imports: [Module1] })
      @rootModule()
      class AppModuleLocal {}

      mock.scanRootModule(AppModuleLocal);
      const mod1 = mock.getNormalizedModuleMeta(Module1)!;
      expect(mod1.normalizedMixinMetaMap.has(mixinSomeLocal)).toBe(false);
      expect(mod1.importedStaticModules.includes(HostModule1Local)).toBe(false);
    });

    it('should retrieve mixinOptions for three different modules with params', () => {
      interface MyDynamicOptions1 extends DynamicModuleOptions {
        one?: string;
      }
      interface MyDynamicOptions2 extends DynamicModuleOptions {
        three?: string;
      }
      interface DecoratorOptions1 extends StaticMixinOptions<MyDynamicOptions1> {
        one?: string;
      }
      interface MixinMeta1 {
        paramsForMixinMeta1?: any;
      }
      interface DecoratorOptions2 extends StaticMixinOptions<MyDynamicOptions2> {
        three?: string;
      }
      interface MixinMeta2 {
        paramsForMixinMeta2?: any;
      }
      class ModuleMixin1Local extends ModuleMixin<DecoratorOptions1> {}
      class ModuleMixin2Local extends ModuleMixin<DecoratorOptions2> {}

      const mixinSome1: MixinDecorator<DecoratorOptions1, {}, MixinMeta1> = Reflector.makeClassDecorator(
        (d) => new ModuleMixin1Local(d),
      );
      const mixinSome2: MixinDecorator<DecoratorOptions2, {}, MixinMeta2> = Reflector.makeClassDecorator(
        (d) => new ModuleMixin2Local(d),
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

      @mixinSome1({
        imports: [
          { dynamicModule: dynamicModule1, one: 'mixinSome1-1' },
          { dynamicModule: dynamicModule3, one: 'mixinSome1-3' },
        ],
      })
      @mixinSome2({
        imports: [
          { dynamicModule: dynamicModule2, three: 'mixinSome2-2' },
          { dynamicModule: dynamicModule3, three: 'mixinSome2-3' },
        ],
      })
      @rootModule()
      class AppModule {}

      mock.scanRootModule(AppModule);

      function getParams(dynamicModule: DynamicModule) {
        return [...(dynamicModule.mixinOptions?.values() || [])];
      }
      expect(getParams(dynamicModule1)).toEqual([{ one: 'mixinSome1-1' }]);
      expect(getParams(dynamicModule2)).toEqual([{ three: 'mixinSome2-2' }]);
      expect(getParams(dynamicModule3)).toEqual([{ three: 'mixinSome2-3' }, { one: 'mixinSome1-3' }]);
    });

    it('should successfully apply hostMixinOptions to a host module even if it is imported before the mixin module', () => {
      @featureModule()
      class HostModuleLocal {}

      class LocalMixinMeta extends BaseNormalizedModuleMeta {
        customProp?: string;
      }

      class ModuleMixinLocal extends ModuleMixin<any> {
        override hostModule = HostModuleLocal;
        override hostMixinOptions = { customProp: 'works' };

        override normalize(normalizedModuleMeta: NormalizedModuleMeta): any {
          return getProxyForMixinMeta(normalizedModuleMeta, LocalMixinMeta);
        }
      }

      const mixinSomeLocal: MixinDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new ModuleMixinLocal(d));

      @mixinSomeLocal()
      @featureModule()
      class MixinModuleLocal {}

      // Notice the order: HostModuleLocal is imported FIRST.
      // In the old single-pass system, HostModuleLocal would be scanned when allModuleMixinsMap is empty,
      // so it wouldn't receive its hostMixinOptions.
      @rootModule({
        imports: [HostModuleLocal, MixinModuleLocal],
      })
      class AppModuleLocal {}

      mock.scanRootModule(AppModuleLocal);

      const hostMeta = mock.getNormalizedModuleMeta(HostModuleLocal);
      expect(hostMeta?.moduleMixinMap.has(mixinSomeLocal)).toBe(true);
      const hostMixinInst = hostMeta?.moduleMixinMap.get(mixinSomeLocal);
      expect(hostMixinInst?.moduleOptions).toEqual({ customProp: 'works' });
    });
    it('should accumulate the exact same allModuleMixinsMap in the parent regardless of import order', () => {
      class ModuleMixin1 extends ModuleMixin<any> {
        override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
          return normalizedModuleMeta;
        }
      }
      class ModuleMixin2 extends ModuleMixin<any> {
        override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
          return normalizedModuleMeta;
        }
      }

      const mixinDec1: MixinDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new ModuleMixin1(d));
      const mixinDec2: MixinDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new ModuleMixin2(d));

      @mixinDec1()
      @featureModule()
      class ModuleA {}

      @mixinDec2()
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

      expect(meta1!.allModuleMixinsMap.size).toBe(2);
      expect(meta1!.allModuleMixinsMap.has(mixinDec1)).toBe(true);
      expect(meta1!.allModuleMixinsMap.has(mixinDec2)).toBe(true);

      expect(meta2!.allModuleMixinsMap.size).toBe(2);
      expect(meta2!.allModuleMixinsMap.has(mixinDec1)).toBe(true);
      expect(meta2!.allModuleMixinsMap.has(mixinDec2)).toBe(true);
    });
  });
});
