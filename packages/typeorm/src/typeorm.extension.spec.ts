import { jest } from '@jest/globals';
import type { Provider } from '@holu/core';
import { injectable, Injector } from '@holu/core';
import type { DataSource } from 'typeorm';

import { TYPEORM_OPTIONS, TYPEORM_ASYNC_OPTIONS } from './constants.js';
import { DataSourceManager } from './data-source-manager.js';
import { EntitiesMetadataStorage } from './entities-metadata-storage.js';
import { TypeormExtension } from './typeorm.extension.js';
import type { TypeormLogMediator } from './typeorm.log-mediator.js';
import type { TypeormOptionsFactory, TypeormModuleOptions } from './types.js';
import { getDataSourceToken, getEntityManagerToken } from './typeorm.utils.js';

class UserEntity {}
class PostEntity {}

describe('TypeormExtension', () => {
  let providersPerApp: Provider[];
  let logMediatorMock: jest.Mocked<TypeormLogMediator>;

  beforeEach(() => {
    EntitiesMetadataStorage.clear();
    providersPerApp = [];
    logMediatorMock = {
      duplicateDataSourceName: jest.fn(),
      dataSourceManagerNotFound: jest.fn(),
      dataSourceNotFoundInAppInjector: jest.fn(),
      unableToConnectToDatabase: jest.fn(),
    } as any;
  });

  describe('stage1()', () => {
    it('should do nothing if isLastModule is false', async () => {
      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { type: 'postgres' },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(false);

      expect(providersPerApp.length).toBe(0);
    });

    it('should do nothing if TYPEORM_OPTIONS is missing', async () => {
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, Injector.resolveAndCreate([]));
      await extension.stage1(true);

      expect(providersPerApp.length).toBe(0);
    });

    it('should initialize DataSource and register providers into providersPerApp', async () => {
      EntitiesMetadataStorage.addEntities('default', [UserEntity]);

      const mockManager = {};
      const mockDs = {
        isInitialized: true,
        manager: mockManager,
      };

      const dataSourceFactory = jest.fn<() => Promise<typeof mockDs>>().mockResolvedValue(mockDs);

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: {
            manualInitialization: true,
            dataSourceFactory,
            entities: [],
          },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      expect(dataSourceFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          entities: [UserEntity],
        }),
      );

      const dsToken = getDataSourceToken('default');
      const emToken = getEntityManagerToken('default');

      expect(providersPerApp).toEqual(
        expect.arrayContaining([
          { token: dsToken, useValue: mockDs },
          { token: emToken, useValue: mockManager },
        ]),
      );
    });

    it('should initialize multiple DataSources for multi-datasource options', async () => {
      const mockDefaultDs = { isInitialized: true, manager: {} };
      const mockAnalyticsDs = { isInitialized: true, manager: {} };

      const defaultFactory = jest.fn<() => Promise<typeof mockDefaultDs>>().mockResolvedValue(mockDefaultDs);
      const analyticsFactory = jest.fn<() => Promise<typeof mockAnalyticsDs>>().mockResolvedValue(mockAnalyticsDs);

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { manualInitialization: true, dataSourceFactory: defaultFactory },
          multi: true,
        },
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'analytics', manualInitialization: true, dataSourceFactory: analyticsFactory },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      expect(defaultFactory).toHaveBeenCalledTimes(1);
      expect(analyticsFactory).toHaveBeenCalledTimes(1);

      const defaultDsToken = getDataSourceToken('default');
      const analyticsDsToken = getDataSourceToken('analytics');

      const defaultProvider = providersPerApp.find((p: any) => p.token === defaultDsToken);
      const analyticsProvider = providersPerApp.find((p: any) => p.token === analyticsDsToken);

      expect(defaultProvider).toBeDefined();
      expect(analyticsProvider).toBeDefined();
    });

    it('should warn via logMediator when duplicate DataSource names are configured', async () => {
      const mockDs1 = { isInitialized: true, manager: {} };
      const mockDs2 = { isInitialized: true, manager: {} };

      const factory1 = jest.fn<() => Promise<typeof mockDs1>>().mockResolvedValue(mockDs1);
      const factory2 = jest.fn<() => Promise<typeof mockDs2>>().mockResolvedValue(mockDs2);

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'default', manualInitialization: true, dataSourceFactory: factory1 },
          multi: true,
        },
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'default', manualInitialization: true, dataSourceFactory: factory2 },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      expect(logMediatorMock.duplicateDataSourceName).toHaveBeenCalledWith(extension, 'default');
    });

    it('should skip auto-loaded entities when autoLoadEntities is false', async () => {
      EntitiesMetadataStorage.addEntities('default', [UserEntity]);

      const mockDs = { isInitialized: true, manager: {} };
      const dataSourceFactory = jest.fn<() => Promise<typeof mockDs>>().mockResolvedValue(mockDs);

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { manualInitialization: true, autoLoadEntities: false, dataSourceFactory, entities: [] },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      expect(dataSourceFactory).toHaveBeenCalledWith(expect.objectContaining({ entities: [] }));
    });

    it('should merge explicit entities with auto-loaded entities', async () => {
      EntitiesMetadataStorage.addEntities('default', [PostEntity]);

      const mockDs = { isInitialized: true, manager: {} };
      const dataSourceFactory = jest.fn<() => Promise<typeof mockDs>>().mockResolvedValue(mockDs);

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { manualInitialization: true, dataSourceFactory, entities: [UserEntity] },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      expect(dataSourceFactory).toHaveBeenCalledWith(expect.objectContaining({ entities: [UserEntity, PostEntity] }));
    });

    it('should update existing placeholder providers rather than pushing duplicates', async () => {
      const mockDs = { isInitialized: true, manager: {} };
      const dataSourceFactory = jest.fn<() => Promise<typeof mockDs>>().mockResolvedValue(mockDs);
      const dsToken = getDataSourceToken('default');
      const emToken = getEntityManagerToken('default');

      providersPerApp.push({ token: dsToken, useValue: null });
      providersPerApp.push({ token: emToken, useValue: null });

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { manualInitialization: true, dataSourceFactory },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      const dsProviders = providersPerApp.filter((p: any) => p.token === dsToken);
      const emProviders = providersPerApp.filter((p: any) => p.token === emToken);

      expect(dsProviders).toHaveLength(1);
      expect(emProviders).toHaveLength(1);
      expect((dsProviders[0] as any).useValue).toBe(mockDs);
    });
  });

  describe('stage2()', () => {
    it('should register created DataSource into DataSourceManager', async () => {
      const mockManager = {
        register: jest.fn(),
        has: jest.fn().mockReturnValue(false),
      };
      const mockDs = {} as DataSource;

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'analytics' },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      const parentInjector = {
        get: jest.fn((token) => {
          if (token === DataSourceManager) {
            return mockManager;
          }
          if (token === getDataSourceToken('analytics')) {
            return mockDs;
          }
          return null;
        }),
      } as unknown as Injector;

      const injectorPerMod = {
        parent: parentInjector,
      } as Injector;

      await extension.stage2(injectorPerMod);

      expect(mockManager.register).toHaveBeenCalledWith('analytics', mockDs);
    });

    it('should not register DataSource if already registered in DataSourceManager', async () => {
      const mockManager = {
        register: jest.fn(),
        has: jest.fn().mockReturnValue(true),
      };
      const mockDs = {} as DataSource;

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'analytics' },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      const parentInjector = {
        get: jest.fn((token) => {
          if (token === DataSourceManager) {
            return mockManager;
          }
          if (token === getDataSourceToken('analytics')) {
            return mockDs;
          }
          return null;
        }),
      } as unknown as Injector;

      const injectorPerMod = {
        parent: parentInjector,
      } as Injector;

      await extension.stage2(injectorPerMod);

      expect(mockManager.has).toHaveBeenCalledWith('analytics');
      expect(mockManager.register).not.toHaveBeenCalled();
    });

    it('should do nothing when TYPEORM_OPTIONS is empty', async () => {
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, Injector.resolveAndCreate([]));
      const parentInjector = { get: jest.fn() } as unknown as Injector;
      const injectorPerMod = { parent: parentInjector } as Injector;

      await extension.stage2(injectorPerMod);

      expect(parentInjector.get).not.toHaveBeenCalled();
    });

    it('should warn via logMediator when DataSourceManager is not found in app injector', async () => {
      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'default' },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      const parentInjector = {
        get: jest.fn().mockReturnValue(null),
      } as unknown as Injector;
      const injectorPerMod = { parent: parentInjector } as Injector;

      await extension.stage2(injectorPerMod);

      expect(logMediatorMock.dataSourceManagerNotFound).toHaveBeenCalledWith(extension);
    });

    it('should warn via logMediator when a DataSource is not found in app injector', async () => {
      const mockManager = { register: jest.fn(), has: jest.fn().mockReturnValue(false) };

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'missing' },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      const parentInjector = {
        get: jest.fn((token) => {
          if (token === DataSourceManager) return mockManager;
          return null;
        }),
      } as unknown as Injector;
      const injectorPerMod = { parent: parentInjector } as Injector;

      await extension.stage2(injectorPerMod);

      expect(mockManager.register).not.toHaveBeenCalled();
      expect(logMediatorMock.dataSourceNotFoundInAppInjector).toHaveBeenCalledWith(extension, 'missing');
    });
  });

  describe('stage1() with forRootAsync() async options', () => {
    it('should resolve options from configurationClass and init DataSource', async () => {
      const mockDs = { isInitialized: true, manager: {} };

      @injectable()
      class TestConfigFactory implements TypeormOptionsFactory {
        createTypeormOptions(): TypeormModuleOptions {
          return {
            manualInitialization: true,
            dataSourceFactory: async () => mockDs as any,
          };
        }
      }

      const tempInjectorPerMod = Injector.resolveAndCreate([
        TestConfigFactory,
        {
          token: TYPEORM_ASYNC_OPTIONS,
          useValue: { name: 'default', configurationClass: TestConfigFactory },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      const dsToken = getDataSourceToken('default');
      const dsProvider = providersPerApp.find((p: any) => p.token === dsToken);
      expect(dsProvider).toBeDefined();
      expect((dsProvider as any).useValue).toBe(mockDs);
    });

    it('should resolve options from useFactory with deps and init DataSource', async () => {
      const mockDs = { isInitialized: true, manager: {} };

      class ConfigService {
        get(key: string) {
          return key === 'DB_TYPE' ? 'postgres' : 'test';
        }
      }

      const tempInjectorPerMod = Injector.resolveAndCreate([
        ConfigService,
        {
          token: TYPEORM_ASYNC_OPTIONS,
          useValue: {
            name: 'default',
            useFactory: (config: ConfigService) => ({
              manualInitialization: true,
              dataSourceFactory: async () => mockDs as any,
            }),
            deps: [ConfigService],
          },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      const dsToken = getDataSourceToken('default');
      const dsProvider = providersPerApp.find((p: any) => p.token === dsToken);
      expect(dsProvider).toBeDefined();
      expect((dsProvider as any).useValue).toBe(mockDs);
    });

    it('should warn on duplicate names across sync and async options', async () => {
      const mockDs = { isInitialized: true, manager: {} };
      const factory = jest.fn<() => Promise<typeof mockDs>>().mockResolvedValue(mockDs);

      const tempInjectorPerMod = Injector.resolveAndCreate([
        {
          token: TYPEORM_OPTIONS,
          useValue: { name: 'default', manualInitialization: true, dataSourceFactory: factory },
          multi: true,
        },
        {
          token: TYPEORM_ASYNC_OPTIONS,
          useValue: {
            name: 'default',
            useFactory: () => ({ manualInitialization: true, dataSourceFactory: factory }),
            deps: [],
          },
          multi: true,
        },
      ]);
      const extension = new TypeormExtension(providersPerApp, logMediatorMock, tempInjectorPerMod);

      await extension.stage1(true);

      expect(logMediatorMock.duplicateDataSourceName).toHaveBeenCalledWith(extension, 'default');
    });
  });
});
