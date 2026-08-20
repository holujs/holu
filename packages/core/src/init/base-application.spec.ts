import { jest } from '@jest/globals';

import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { ModuleRegistry } from '#init/module-registry.js';
import { MutableModuleRegistry } from '#init/mutable-module-registry.js';
import { ModuleNormalizer } from '#init/module-normalizer.js';
// import { Router } from '#types/router.js';
import { BaseAppOptions } from '#init/base-app-options.js';
import { StaticModule } from '#decorators/module-decorator-options.js';
import { AppInitializer } from '#init/app-initializer.js';
import { BaseApplication } from '#init/base-application.js';
import { rootModule } from '#decorators/root-module.js';
import { LogMediator } from '#logger/log-mediator.js';
import { LoggerConfig } from '#logger/logger.js';

describe('BaseApplication', () => {
  class ApplicationMock extends BaseApplication {
    override baseAppOptions = new BaseAppOptions();
    declare log: SystemLogMediator;

    override init(baseAppOptions?: BaseAppOptions) {
      return super.init(baseAppOptions);
    }

    override scanRootModule(appModule: StaticModule) {
      return super.scanRootModule(appModule);
    }

    override bootstrapApplication(appInitializer: AppInitializer) {
      return super.bootstrapApplication(appInitializer);
    }
  }

  let mock: ApplicationMock;

  beforeEach(() => {
    mock = new ApplicationMock();
  });

  describe('init()', () => {
    it('should merge BaseAppOptions with default', () => {
      mock.init({ bufferLogs: false });
      expect(mock.baseAppOptions.bufferLogs).toBe(false);
      expect(LogMediator.bufferLogs).toBe(false);
      mock.init({ bufferLogs: true });
      expect(mock.baseAppOptions.bufferLogs).toBe(true);
      expect(LogMediator.bufferLogs).toBe(true);
    });
  });

  describe('scanRootModule()', () => {
    @rootModule({})
    class AppModule {}

    it('should return instance of ModuleRegistry', () => {
      expect(mock.scanRootModule(AppModule)).toBeInstanceOf(ModuleRegistry);
    });

    it('should use a ModuleNormalizer created by moduleNormalizerFactory', () => {
      let moduleNormalizer: ModuleNormalizer;
      let normalizeSpy: any;
      const moduleNormalizerFactory = jest.fn((log: SystemLogMediator) => {
        moduleNormalizer = new ModuleNormalizer(log);
        normalizeSpy = jest.spyOn(moduleNormalizer, 'normalize');
        return moduleNormalizer;
      });

      mock.init({ moduleNormalizerFactory });
      mock.scanRootModule(AppModule);

      expect(moduleNormalizerFactory).toHaveBeenCalledTimes(1);
      expect(moduleNormalizerFactory).toHaveBeenCalledWith(mock.log);
      expect(normalizeSpy).toHaveBeenCalledWith(AppModule, undefined);
    });

    it('should pass a ModuleNormalizer created by moduleNormalizerFactory to MutableModuleRegistry', () => {
      let moduleNormalizer: ModuleNormalizer;
      let normalizeSpy: any;
      const moduleNormalizerFactory = jest.fn((log: SystemLogMediator) => {
        moduleNormalizer = new ModuleNormalizer(log);
        normalizeSpy = jest.spyOn(moduleNormalizer, 'normalize');
        return moduleNormalizer;
      });

      mock.init({ allowRuntimeReinit: true, moduleNormalizerFactory });
      const moduleRegistry = mock.scanRootModule(AppModule);

      expect(moduleRegistry).toBeInstanceOf(MutableModuleRegistry);
      expect(moduleNormalizerFactory).toHaveBeenCalledTimes(1);
      expect(moduleNormalizerFactory).toHaveBeenCalledWith(mock.log);
      expect(normalizeSpy).toHaveBeenCalledWith(AppModule, undefined);
    });
  });

  describe('bootstrapApplication()', () => {
    @rootModule({
      providersPerApp: [{ token: LoggerConfig, useValue: { level: 'off' } }],
    })
    class AppModule {}

    it('should replace systemLogMediator during call bootstrapApplication()', async () => {
      const moduleRegistry = mock.scanRootModule(AppModule);
      const appInitializer = new AppInitializer(new BaseAppOptions(), moduleRegistry, new SystemLogMediator({ moduleName: '' }));
      const { log: systemLogMediator } = mock;
      await mock.bootstrapApplication(appInitializer);
      expect(mock.log !== systemLogMediator).toBe(true);
    });
  });

  describe('graceful shutdown', () => {
    let exitSpy: any;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('should call BeforeShutdown and OnShutdown hooks on instantiated providers in correct order', async () => {
      const order: string[] = [];

      class TestServiceBefore {
        beforeShutdown(signal?: string) {
          order.push(`before-${signal}`);
        }
      }

      class TestServiceOn {
        onShutdown(signal?: string) {
          order.push(`on-${signal}`);
        }
      }

      @rootModule({
        providersPerApp: [TestServiceBefore, TestServiceOn, { token: LoggerConfig, useValue: { level: 'off' } }],
      })
      class AppModule {}

      const app = mock;
      const moduleRegistry = app.scanRootModule(AppModule);
      const appInitializer = new AppInitializer(new BaseAppOptions(), moduleRegistry, new SystemLogMediator({ moduleName: '' }));
      await app.bootstrapApplication(appInitializer);

      // Instantiate them so they exist in registry
      (app as any).injectorPerApp!.get(TestServiceBefore);
      (app as any).injectorPerApp!.get(TestServiceOn);

      // Define customShutdown spy
      const customShutdownSpy = jest.spyOn(app as any, 'customShutdown').mockImplementation(async () => {
        order.push('custom');
      });

      await app.close('SIGTERM');

      expect(order).toEqual(['before-SIGTERM', 'custom', 'on-SIGTERM']);
      expect(exitSpy).toHaveBeenCalledWith(0);

      customShutdownSpy.mockRestore();
    });

    it('should not call hooks on uninstantiated providers', async () => {
      const order: string[] = [];

      class UnusedService {
        beforeShutdown() {
          order.push('unused');
        }
      }

      @rootModule({
        providersPerApp: [UnusedService, { token: LoggerConfig, useValue: { level: 'off' } }],
      })
      class AppModule {}

      const app = mock;
      const moduleRegistry = app.scanRootModule(AppModule);
      const appInitializer = new AppInitializer(new BaseAppOptions(), moduleRegistry, new SystemLogMediator({ moduleName: '' }));
      await app.bootstrapApplication(appInitializer);

      await app.close('SIGTERM');

      expect(order).toEqual([]);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should continue running subsequent hooks and stages even if a hook fails', async () => {
      const order: string[] = [];

      class TestServiceBeforeFail {
        beforeShutdown() {
          order.push('before-fail');
          throw new Error('before hook failed');
        }
      }

      class TestServiceBeforeSuccess {
        beforeShutdown() {
          order.push('before-success');
        }
      }

      class TestServiceOn {
        onShutdown() {
          order.push('on-success');
        }
      }

      @rootModule({
        providersPerApp: [
          TestServiceBeforeFail,
          TestServiceBeforeSuccess,
          TestServiceOn,
          { token: LoggerConfig, useValue: { level: 'off' } },
        ],
      })
      class AppModule {}

      const app = mock;
      const moduleRegistry = app.scanRootModule(AppModule);
      const appInitializer = new AppInitializer(new BaseAppOptions(), moduleRegistry, new SystemLogMediator({ moduleName: '' }));
      await app.bootstrapApplication(appInitializer);

      (app as any).injectorPerApp!.get(TestServiceBeforeFail);
      (app as any).injectorPerApp!.get(TestServiceBeforeSuccess);
      (app as any).injectorPerApp!.get(TestServiceOn);

      const customShutdownSpy = jest.spyOn(app as any, 'customShutdown').mockImplementation(async () => {
        order.push('custom');
      });

      await app.close('SIGTERM');

      expect(order).toContain('before-fail');
      expect(order).toContain('before-success');
      expect(order.indexOf('custom')).toBeGreaterThan(order.indexOf('before-fail'));
      expect(order.indexOf('custom')).toBeGreaterThan(order.indexOf('before-success'));
      expect(order.indexOf('on-success')).toBeGreaterThan(order.indexOf('custom'));

      expect(exitSpy).toHaveBeenCalledWith(0);

      customShutdownSpy.mockRestore();
    });

    it('should prevent double shutdown execution', async () => {
      const order: string[] = [];
      const app = mock;
      app.init();

      jest.spyOn(app.log, 'shutdownStart').mockImplementation(() => {});
      jest.spyOn(app.log, 'shutdownComplete').mockImplementation(() => {});

      const customShutdownSpy = jest.spyOn(app as any, 'customShutdown').mockImplementation(async () => {
        order.push('custom');
      });

      // Call close twice
      const p1 = app.close('SIGTERM');
      const p2 = app.close('SIGTERM');
      await Promise.all([p1, p2]);

      expect(order).toEqual(['custom']);
      expect(exitSpy).toHaveBeenCalledTimes(1);

      customShutdownSpy.mockRestore();
    });
  });
});
