import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import { jest } from '@jest/globals';
import {
  SystemLogMediator,
  StaticModule,
  AppInitializer,
  LogMediator,
  rootModule,
  ModuleRegistry,
  LoggerConfig,
  BaseAppOptions,
} from '@holu/core';

import { RestApplication } from './rest-application.js';
import { AppOptions } from '../types/app-options.js';

describe('RestApplication', () => {
  class ApplicationMock extends RestApplication {
    override appOptions = new AppOptions();
    override baseAppOptions = new BaseAppOptions();
    declare log: SystemLogMediator;

    override init(appOptions?: AppOptions) {
      return super.init(appOptions);
    }

    override checkSecureServerOption() {
      return super.checkSecureServerOption();
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
    it('should merge AppOptions with default', () => {
      mock.init({ bufferLogs: false });
      expect(mock.appOptions.bufferLogs).toBe(false);
      expect(LogMediator.bufferLogs).toBe(false);
      // expect(mock.appOptions.path).toBeDefined();
      // expect(mock.appOptions.serverOptions).toBeDefined();
    });
  });

  describe('checkSecureServerOption()', () => {
    const msg = 'createSecureServer() not found';

    it('should not to throw with http2 and isHttp2SecureServer == true', () => {
      mock.appOptions.serverOptions = { isHttp2SecureServer: true };
      mock.appOptions.httpModule = http2;
      expect(() => mock.checkSecureServerOption()).not.toThrow();
    });

    it('should to throw with http and isHttp2SecureServer == true', () => {
      mock.appOptions.serverOptions = { isHttp2SecureServer: true };
      mock.appOptions.httpModule = http;
      expect(() => mock.checkSecureServerOption()).toThrow(msg);
    });

    it('should not to throw with http and isHttp2SecureServer == false', () => {
      mock.appOptions.httpModule = http;
      expect(() => mock.checkSecureServerOption()).not.toThrow(msg);
    });

    it('should to throw with https and isHttp2SecureServer == true', () => {
      mock.appOptions.serverOptions = { isHttp2SecureServer: true };
      mock.appOptions.httpModule = https;
      expect(() => mock.checkSecureServerOption()).toThrow(msg);
    });
  });

  describe('scanRootModule()', () => {
    @rootModule({})
    class AppModule {}

    it('should return instance of ModuleRegistry', () => {
      expect(mock.scanRootModule(AppModule)).toBeInstanceOf(ModuleRegistry);
    });
  });

  describe('bootstrapApplication()', () => {
    @rootModule({
      providersPerApp: [
        // { token: Router, useValue: {} },
        { token: LoggerConfig, useValue: { level: 'off' } },
      ],
    })
    class AppModule {}

    it('should replace systemLogMediator during call bootstrapApplication()', async () => {
      const moduleRegistry = mock.scanRootModule(AppModule);
      const appInitializer = new AppInitializer(new AppOptions(), moduleRegistry, new SystemLogMediator({ moduleName: '' }));
      const { log } = mock;
      await mock.bootstrapApplication(appInitializer);
      expect(mock.log !== log).toBe(true);
    });
  });

  describe('customShutdown()', () => {
    it('should close server and handle idle/active connection draining', async () => {
      const mockServer = {
        close: jest.fn((cb: any) => cb()),
        closeIdleConnections: jest.fn(),
        closeAllConnections: jest.fn(),
      };
      mock.server = mockServer as any;

      await (mock as any).customShutdown();

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockServer.closeIdleConnections).toHaveBeenCalled();
      expect(mockServer.closeAllConnections).not.toHaveBeenCalled();
    });

    it('should force close active connections after timeout if close hangs', async () => {
      jest.useFakeTimers();

      let closeCallback: any;
      const mockServer = {
        close: jest.fn((cb: any) => {
          closeCallback = cb;
        }),
        closeIdleConnections: jest.fn(),
        closeAllConnections: jest.fn(),
      };

      mock.server = mockServer as any;
      mock.appOptions.shutdownTimeout = 5000;

      const shutdownPromise = (mock as any).customShutdown();

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockServer.closeIdleConnections).toHaveBeenCalled();
      expect(mockServer.closeAllConnections).not.toHaveBeenCalled();

      // Fast-forward time to hit the timeout
      jest.advanceTimersByTime(5000);

      expect(mockServer.closeAllConnections).toHaveBeenCalled();

      // Complete the close
      closeCallback();
      await shutdownPromise;

      jest.useRealTimers();
    });
  });
});
