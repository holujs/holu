import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';

import type { TypeormLogMediator } from './typeorm.log-mediator.js';
import { initializeWithRetry } from './retry.js';

describe('retry', () => {
  let logMediatorMock: jest.Mocked<TypeormLogMediator>;
  const sender = {};

  beforeEach(() => {
    logMediatorMock = {
      unableToConnectToDatabase: jest.fn(),
    } as any;
  });

  it('should initialize DataSource immediately on first try', async () => {
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>(),
    } as any;
    dsMock.initialize.mockResolvedValue(dsMock);

    const result = await initializeWithRetry(dsMock, { retryAttempts: 3, retryDelay: 10 }, logMediatorMock, sender, 'default');

    expect(result).toBe(dsMock);
    expect(dsMock.initialize).toHaveBeenCalledTimes(1);
    expect(logMediatorMock.unableToConnectToDatabase).not.toHaveBeenCalled();
  });

  it('should retry initialization on failure and succeed', async () => {
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>(),
    } as any;

    dsMock.initialize
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValue(dsMock);

    const result = await initializeWithRetry(dsMock, { retryAttempts: 3, retryDelay: 1 }, logMediatorMock, sender, 'analytics');

    expect(result).toBe(dsMock);
    expect(dsMock.initialize).toHaveBeenCalledTimes(3);
    expect(logMediatorMock.unableToConnectToDatabase).toHaveBeenCalledTimes(2);
    expect(logMediatorMock.unableToConnectToDatabase).toHaveBeenNthCalledWith(1, sender, 'analytics', 1, '');
    expect(logMediatorMock.unableToConnectToDatabase).toHaveBeenNthCalledWith(2, sender, 'analytics', 2, '');
  });

  it('should throw error if retryAttempts limit is reached', async () => {
    const error = new Error('Database down');
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>().mockRejectedValue(error),
    } as any;

    await expect(initializeWithRetry(dsMock, { retryAttempts: 2, retryDelay: 1 }, logMediatorMock, sender, 'default')).rejects.toThrow(
      'Database down',
    );

    expect(dsMock.initialize).toHaveBeenCalledTimes(3);
    expect(logMediatorMock.unableToConnectToDatabase).toHaveBeenCalledTimes(2);
  });

  it('should rethrow the last error (not a wrapper) when retries are exhausted', async () => {
    const originalError = new Error('Specific DB error');
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>().mockRejectedValue(originalError),
    } as any;

    const thrown = await initializeWithRetry(dsMock, { retryAttempts: 1, retryDelay: 1 }, logMediatorMock, sender, 'default').catch(
      (e) => e,
    );

    expect(thrown).toBe(originalError);
  });

  it('should stop retrying immediately if toRetry returns false', async () => {
    const error = new Error('Fatal auth error');
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>().mockRejectedValue(error),
    } as any;

    const toRetry = jest.fn<(err: any) => boolean>().mockReturnValue(false);

    await expect(
      initializeWithRetry(dsMock, { retryAttempts: 5, retryDelay: 1, toRetry }, logMediatorMock, sender, 'default'),
    ).rejects.toThrow('Fatal auth error');

    expect(dsMock.initialize).toHaveBeenCalledTimes(1);
    expect(toRetry).toHaveBeenCalledWith(error);
    expect(logMediatorMock.unableToConnectToDatabase).not.toHaveBeenCalled();
  });

  it('should retry when toRetry returns true', async () => {
    const error = new Error('Transient error');
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>(),
    } as any;
    dsMock.initialize.mockRejectedValueOnce(error).mockResolvedValue(dsMock);

    const toRetry = jest.fn<(err: any) => boolean>().mockReturnValue(true);

    const result = await initializeWithRetry(dsMock, { retryAttempts: 2, retryDelay: 1, toRetry }, logMediatorMock, sender, 'default');

    expect(result).toBe(dsMock);
    expect(toRetry).toHaveBeenCalledWith(error);
    expect(dsMock.initialize).toHaveBeenCalledTimes(2);
    expect(logMediatorMock.unableToConnectToDatabase).toHaveBeenCalledTimes(1);
  });

  it('should make exactly 1 attempt when retryAttempts is 0', async () => {
    const error = new Error('Immediate failure');
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>().mockRejectedValue(error),
    } as any;

    await expect(initializeWithRetry(dsMock, { retryAttempts: 0, retryDelay: 1 }, logMediatorMock, sender, 'default')).rejects.toThrow(
      'Immediate failure',
    );

    expect(dsMock.initialize).toHaveBeenCalledTimes(1);
    expect(logMediatorMock.unableToConnectToDatabase).not.toHaveBeenCalled();
  });

  it('should include error message when verboseRetryLog is true', async () => {
    const error = new Error('Socket timeout');
    const dsMock = {
      initialize: jest.fn<DataSource['initialize']>(),
    } as any;
    dsMock.initialize.mockRejectedValueOnce(error).mockResolvedValue(dsMock);

    await initializeWithRetry(dsMock, { retryAttempts: 1, retryDelay: 1, verboseRetryLog: true }, logMediatorMock, sender, 'default');

    expect(logMediatorMock.unableToConnectToDatabase).toHaveBeenCalledWith(sender, 'default', 1, ' Message: Socket timeout.');
  });
});
