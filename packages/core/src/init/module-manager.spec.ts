import { jest } from '@jest/globals';

import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { Extension } from '#extension/extension-types.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { ModuleManager } from './module-manager.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { ModRefId } from '#decorators/module-decorator-options.js';
import { DynamicModule } from '#decorators/module-decorator-options.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
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
});
