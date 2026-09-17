import type { Logger } from '@holu/core';
import { Injector } from '@holu/core';
import type { RequestContext } from '@holu/rest';
import { jest } from '@jest/globals';

import { DefaultLoggerController } from './default-logger.controller.js';

describe('DefaultLoggerController', () => {
  const send = jest.fn();
  const log = jest.fn();
  const res = { send } as unknown as RequestContext;
  const logger = { log } as unknown as Logger;
  let defaultLoggerController: DefaultLoggerController;

  beforeEach(() => {
    const injector = Injector.resolveAndCreate([DefaultLoggerController]);
    defaultLoggerController = injector.get(DefaultLoggerController);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('controller should send response', async () => {
    await expect(defaultLoggerController.ok(res, logger)).resolves.not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

