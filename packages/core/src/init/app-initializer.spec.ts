import { jest } from '@jest/globals';

import { InputLogLevel, LoggerConfig } from '#logger/logger.js';
import { LogMediator } from '#logger/log-mediator.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { AppInitializer } from '#init/app-initializer.js';
import { ModuleRegistry } from '#init/module-registry.js';
import { Provider } from '#di/top/types-and-models.js';
import { Extension, ExtensionCounters } from '#extension/extension-types.js';
import { ProviderBuilder } from '#utils/providers.js';
import { BaseAppOptions } from '#init/base-app-options.js';
import { AppMultiProviderCollision, ModuleNotImported, ProvidersCollision, AppProviderMissingToken } from '#error/core-errors.js';
import { injectable } from '#di/decorators.js';

describe('AppInitializer', () => {
  class AppInitializerMock extends AppInitializer {
    override normalizedModuleMeta = new NormalizedModuleMeta();

    constructor(
      public override baseAppOptions: BaseAppOptions,
      public override moduleRegistry: ModuleRegistry,
      public override log: SystemLogMediator,
    ) {
      super(baseAppOptions, moduleRegistry, log);
    }

    async init() {
      this.bootstrapProvidersPerApp();
      await this.bootstrapModulesAndExtensions();
    }

    override prepareProvidersPerApp() {
      return super.prepareProvidersPerApp();
    }

    override collectProvidersShallow(moduleRegistry: ModuleRegistry) {
      return super.collectProvidersShallow(moduleRegistry);
    }

    override getResolvedCollisionsPerApp() {
      return super.getResolvedCollisionsPerApp();
    }

    override decreaseExtensionsCounters(extensionCounters: ExtensionCounters, providers: Provider[]) {
      return super.decreaseExtensionsCounters(extensionCounters, providers);
    }
  }

  let mock: AppInitializerMock;
  let moduleRegistry: ModuleRegistry;

  describe('decreaseExtensionsCounters()', () => {
    beforeEach(() => {
      const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
      moduleRegistry = new ModuleRegistry(systemLogMediator);
      const baseAppOptions = new BaseAppOptions();
      mock = new AppInitializerMock(baseAppOptions, moduleRegistry, systemLogMediator);
    });

    class Extension1 {}
    class Extension2 {}
    class Extension3 {}

    const extensionCounters = new ExtensionCounters();

    extensionCounters.extensionsMap.set(Extension1, 9);
    extensionCounters.extensionsMap.set(Extension2, 8);
    extensionCounters.extensionsMap.set(Extension3, 6);

    it('counters should remain the same', () => {
      mock.decreaseExtensionsCounters(extensionCounters, []);
      expect(extensionCounters.extensionsMap.get(Extension1)).toBe(9);
      expect(extensionCounters.extensionsMap.get(Extension2)).toBe(8);
      expect(extensionCounters.extensionsMap.get(Extension3)).toBe(6);
    });

    it('counter should be changed', () => {
      const providers: Provider[] = [Extension2, Extension2, Extension1];
      mock.decreaseExtensionsCounters(extensionCounters, providers);
      expect(extensionCounters.extensionsMap.get(Extension1)).toBe(8);
      expect(extensionCounters.extensionsMap.get(Extension2)).toBe(7);
      expect(extensionCounters.extensionsMap.get(Extension3)).toBe(6);
    });
  });

  describe('prepareProvidersPerApp()', () => {
    beforeAll(() => {
      console.log = jest.fn() as any;
    });

    beforeEach(() => {
      const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
      moduleRegistry = new ModuleRegistry(systemLogMediator);
      const baseAppOptions = new BaseAppOptions();
      mock = new AppInitializerMock(baseAppOptions, moduleRegistry, systemLogMediator);
    });

    it('should throw an error about collision', () => {
      class Provider1 {}

      @featureModule({ providersPerApp: [{ token: Provider1, useClass: Provider1 }] })
      class Module1 {}

      @featureModule({ providersPerApp: [Provider1] })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
      })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      const err = new ProvidersCollision('AppModule', [Provider1], ['Module1', 'Module2'], 'App');
      expect(() => mock.prepareProvidersPerApp()).toThrow(err);
    });

    it('should works with collision and resolvedCollisionsPerApp', () => {
      class Provider1 {}
      class Provider2 {}

      @featureModule({ providersPerApp: [{ token: Provider1, useClass: Provider2 }] })
      class Module1 {}

      @featureModule({ providersPerApp: [Provider1] })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
        resolvedCollisionsPerApp: [[Provider1, Module1]],
      })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      expect(() => mock.prepareProvidersPerApp()).not.toThrow();
      expect(mock.getResolvedCollisionsPerApp()).toEqual([{ token: Provider1, useClass: Provider2 }]);
      expect(mock.normalizedModuleMeta.providersPerApp).toEqual([{ token: Provider1, useClass: Provider2 }]);
      expect(mock.normalizedModuleMeta.resolvedCollisionsPerApp.length).toBe(1);
    });

    it('should throw an error because resolvedCollisionsPerApp not properly setted', () => {
      class Provider1 {}

      @featureModule({})
      class Module0 {}

      @featureModule({ providersPerApp: [{ token: Provider1, useClass: Provider1 }] })
      class Module1 {}

      @featureModule({ providersPerApp: [Provider1] })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
        resolvedCollisionsPerApp: [[Provider1, Module0]],
      })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      const err = new ModuleNotImported('AppModule', 'Module0', 'Provider1');
      expect(() => mock.prepareProvidersPerApp()).toThrow(err);
    });

    it('multi providers should not causes collisions', () => {
      class Provider1 {}
      class Provider2 {}

      @featureModule({
        providersPerMod: [Provider2],
        exports: [Provider2],
      })
      class Module0 {}

      @featureModule({
        providersPerApp: [{ token: Provider1, useValue: 'value1 of module1', multi: true }],
      })
      class Module1 {}

      @featureModule({
        providersPerApp: [{ token: Provider1, useValue: 'value1 of module2', multi: true }],
      })
      class Module2 {}

      @rootModule({
        imports: [Module0, Module1, Module2],
      })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      expect(() => mock.prepareProvidersPerApp()).not.toThrow();
      expect(mock.normalizedModuleMeta.providersPerApp).toEqual([
        { token: Provider1, useValue: 'value1 of module1', multi: true },
        { token: Provider1, useValue: 'value1 of module2', multi: true },
      ]);
    });

    it('multi providers should not resolves collisions', () => {
      class Provider1 {}
      class Provider2 {}

      @featureModule({
        providersPerMod: [Provider2],
        exports: [Provider2],
      })
      class Module0 {}

      @featureModule({
        providersPerApp: [{ token: Provider1, useValue: 'value1 of module1', multi: true }],
      })
      class Module1 {}

      @featureModule({
        providersPerApp: [{ token: Provider1, useValue: 'value1 of module2', multi: true }],
      })
      class Module2 {}

      @rootModule({
        imports: [Module0, Module1, Module2],
        resolvedCollisionsPerApp: [[Provider1, Module1]],
      })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      const err = new AppMultiProviderCollision('AppModule', 'Module1', 'Provider1');
      expect(() => mock.prepareProvidersPerApp()).toThrow(err);
    });

    it('should throw an error because resolvedCollisionsPerApp not properly setted provider', () => {
      class Provider1 {}
      class Provider2 {}

      @featureModule({
        providersPerMod: [Provider2],
        exports: [Provider2],
      })
      class Module0 {}

      @featureModule({ providersPerApp: [{ token: Provider1, useClass: Provider1 }] })
      class Module1 {}

      @featureModule({ providersPerApp: [Provider1] })
      class Module2 {}

      @rootModule({
        imports: [Module0, Module1, Module2],
        resolvedCollisionsPerApp: [[Provider1, Module0]],
      })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      const err = new AppProviderMissingToken('AppModule', 'Module0', 'Provider1');
      expect(() => mock.prepareProvidersPerApp()).toThrow(err);
    });

    it('should works with identical duplicates', () => {
      class Provider1 {}

      @featureModule({ providersPerApp: [Provider1] })
      class Module1 {}

      @featureModule({ providersPerApp: [Provider1] })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
      })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      expect(() => mock.prepareProvidersPerApp()).not.toThrow();
    });

    it('should works with duplicates in providersPerApp of root module', () => {
      class Provider1 {}

      @rootModule({ providersPerApp: [Provider1, Provider1, { token: Provider1, useClass: Provider1 }] })
      class AppModule {}

      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      expect(() => mock.prepareProvidersPerApp()).not.toThrow();
      expect(mock.normalizedModuleMeta.providersPerApp.length).toBe(3);
    });

    it('should works with empty "imports" array in root module', () => {
      @rootModule({ imports: [] })
      class AppModule {}
      mock.normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
      expect(() => mock.prepareProvidersPerApp()).not.toThrow();
    });
  });

  describe('bootstrapProvidersPerApp()', () => {
    it('logMediator should has different instances in contexts of RestApplication and RestAppInitializer', () => {
      const loggerSpy = jest.fn();

      class LogMediatorMock extends SystemLogMediator {
        override flush() {
          const level = (this.logger as any).level;
          loggerSpy(level);
          super.flush();
        }
      }

      // Simulation of a call from the RestApplication
      const logMediator = new LogMediatorMock({ moduleName: 'fakeName' });
      moduleRegistry = new ModuleRegistry(logMediator);
      const baseAppOptions = new BaseAppOptions();
      mock = new AppInitializerMock(baseAppOptions, moduleRegistry, logMediator);

      // Simulation of a call from the AppModule
      @rootModule({
        providersPerApp: new ProviderBuilder()
          // .passThrough(Router)
          .useValue(LoggerConfig, { level: 'trace' })
          .passThrough(LogMediatorMock)
          .useToken(SystemLogMediator, LogMediatorMock),
      })
      class AppModule {}

      moduleRegistry.scanRootModule(AppModule);
      mock.bootstrapProvidersPerApp();
      // Here logMediator used from RestApplication
      logMediator.flush();
      // mock.flushLogs();
      expect(loggerSpy).toHaveBeenNthCalledWith(1, 'info');
    });
  });

  describe('init()', () => {
    const testMethodSpy = jest.fn();
    class LogMediatorMock1 extends SystemLogMediator {
      testMethod(level: InputLogLevel, ...args: any[]) {
        testMethodSpy();
        this.setLog(level, `${args}`);
      }
    }
    class LogMediatorMock2 extends LogMediator {}

    @featureModule({ providersPerApp: [{ token: LogMediator, useClass: LogMediatorMock2 }] })
    class Module1 {}

    @rootModule({
      imports: [Module1],
      providersPerApp: [
        // { token: Router, useValue: 'fake' },
        { token: SystemLogMediator, useClass: LogMediatorMock1 },
      ],
    })
    class AppModule {}

    beforeEach(() => {
      testMethodSpy.mockRestore();
      LogMediator.bufferLogs = true;
      LogMediator.buffer = [];
      const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
      moduleRegistry = new ModuleRegistry(systemLogMediator);
      const baseAppOptions = new BaseAppOptions();
      mock = new AppInitializerMock(baseAppOptions, moduleRegistry, systemLogMediator);
    });

    it('logs should collects between two init()', async () => {
      expect(LogMediator.buffer).toHaveLength(0);
      expect(mock.log).toBeInstanceOf(SystemLogMediator);
      expect(mock.log).not.toBeInstanceOf(LogMediatorMock1);
      moduleRegistry.scanRootModule(AppModule);

      // First init
      await mock.init();
      const { buffer } = LogMediator;
      expect(mock.log).toBeInstanceOf(LogMediatorMock1);
      (mock.log as LogMediatorMock1).testMethod('debug', 'one', 'two');
      const msgIndex1 = buffer.length - 1;
      expect(buffer[msgIndex1].inputLogLevel).toBe('debug');
      expect(buffer[msgIndex1].msg).toBe('one,two');
      expect(testMethodSpy.mock.calls.length).toBe(1);

      // Second init
      await mock.init();
      expect(mock.log).toBeInstanceOf(LogMediatorMock1);
      (mock.log as LogMediatorMock1).testMethod('info', 'three', 'four');
      // Logs from first init() still here
      expect(buffer[msgIndex1].inputLogLevel).toBe('debug');
      expect(buffer[msgIndex1].msg).toBe('one,two');
      const msgIndex2 = buffer.length - 1;
      expect(buffer[msgIndex2].inputLogLevel).toBe('info');
      expect(buffer[msgIndex2].msg).toBe('three,four');
      expect(testMethodSpy.mock.calls.length).toBe(2);
      mock.log.flush();
      expect(buffer.length).toBe(0);
    });
  });

  describe('extensions stage1', () => {
    const jestFn = jest.fn((extensionName: string) => extensionName);

    beforeEach(() => {
      jest.restoreAllMocks();
      const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
      moduleRegistry = new ModuleRegistry(systemLogMediator);
      const baseAppOptions = new BaseAppOptions();
      mock = new AppInitializerMock(baseAppOptions, moduleRegistry, systemLogMediator);
    });

    @injectable()
    class Extension1 implements Extension {
      async stage1() {
        jestFn('Extension1');
      }
    }

    it.skip('properly declared extensions in a root module', async () => {
      @rootModule({
        // providersPerApp: [{ token: Router, useValue: 'fake value for router' }],
        extensions: [{ extension: Extension1 }],
      })
      class AppModule {}

      expect(() => moduleRegistry.scanRootModule(AppModule)).not.toThrow();
      await expect(mock.init()).rejects.toThrow('some');
      expect(jestFn).toHaveBeenCalledWith('Extension1');
    });
  });
});
