import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';

import { DataSourceManager } from './data-source-manager.js';
import type { TypeormLogMediator } from './typeorm.log-mediator.js';

describe('DataSourceManager', () => {
  let manager: DataSourceManager;
  let logMediatorMock: jest.Mocked<TypeormLogMediator>;

  beforeEach(() => {
    logMediatorMock = {
      duplicateDataSourceRegistration: jest.fn(),
      failedToCloseDataSource: jest.fn(),
    } as any;
    manager = new DataSourceManager(logMediatorMock);
  });

  it('should register and retrieve a DataSource', () => {
    const mockDs = {} as DataSource;
    manager.register('default', mockDs);

    expect(manager.get('default')).toBe(mockDs);
  });

  it('should return undefined for unregistered DataSource', () => {
    expect(manager.get('unknown')).toBeUndefined();
  });

  it('should warn via logMediator when registering a DataSource with duplicate name', () => {
    const mockDs1 = {} as DataSource;
    const mockDs2 = {} as DataSource;

    manager.register('default', mockDs1);
    manager.register('default', mockDs2);

    expect(logMediatorMock.duplicateDataSourceRegistration).toHaveBeenCalledWith(manager, 'default');
    expect(manager.get('default')).toBe(mockDs2);
  });

  it('should return a copy of all registered DataSources via getAll()', () => {
    const ds1 = {} as DataSource;
    const ds2 = {} as DataSource;

    manager.register('default', ds1);
    manager.register('analytics', ds2);

    const all = manager.getAll();
    expect(all.size).toBe(2);
    expect(all.get('default')).toBe(ds1);
    expect(all.get('analytics')).toBe(ds2);
  });

  it('should destroy all initialized DataSources on shutdown', async () => {
    const destroy1 = jest.fn<DataSource['destroy']>().mockResolvedValue(undefined);
    const destroy2 = jest.fn<DataSource['destroy']>().mockResolvedValue(undefined);

    const ds1 = { isInitialized: true, destroy: destroy1 } as unknown as DataSource;
    const ds2 = { isInitialized: true, destroy: destroy2 } as unknown as DataSource;
    const dsUninit = { isInitialized: false, destroy: jest.fn() } as unknown as DataSource;

    manager.register('ds1', ds1);
    manager.register('ds2', ds2);
    manager.register('dsUninit', dsUninit);

    await manager.onShutdown();

    expect(destroy1).toHaveBeenCalledTimes(1);
    expect(destroy2).toHaveBeenCalledTimes(1);
    expect(dsUninit.destroy).not.toHaveBeenCalled();
    expect(manager.getAll().size).toBe(0);
  });

  it('should catch and log errors via logMediator during DataSource destroy on shutdown', async () => {
    const destroyError = new Error('Connection error during close');
    const destroyFail = jest.fn<DataSource['destroy']>().mockRejectedValue(destroyError);
    const destroySuccess = jest.fn<DataSource['destroy']>().mockResolvedValue(undefined);

    const dsFail = { isInitialized: true, destroy: destroyFail } as unknown as DataSource;
    const dsSuccess = { isInitialized: true, destroy: destroySuccess } as unknown as DataSource;

    manager.register('fail', dsFail);
    manager.register('success', dsSuccess);

    await expect(manager.onShutdown()).resolves.not.toThrow();

    expect(logMediatorMock.failedToCloseDataSource).toHaveBeenCalledWith(manager, 'fail', destroyError);
    expect(destroySuccess).toHaveBeenCalledTimes(1);
    expect(manager.getAll().size).toBe(0);
  });
});
