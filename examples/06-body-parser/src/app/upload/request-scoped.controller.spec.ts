import { Injector } from '@holu/core';
import type { RequestContext } from '@holu/rest';
import { jest } from '@jest/globals';

import { RequestScopedController } from './request-scoped.controller.js';

describe('RequestScopedController', () => {
  const send = jest.fn();
  const sendJson = jest.fn();
  const res = { send, sendJson } as unknown as RequestContext;
  let controller: RequestScopedController;

  beforeEach(() => {
    jest.restoreAllMocks();
    const injector = Injector.resolveAndCreate([RequestScopedController]);
    controller = injector.get(RequestScopedController);
  });

  it('should say "Hello, you need send POST request"', () => {
    expect(() => controller.tellHello(res)).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('should work with POST', () => {
    expect(() => controller.post(res, { one: 1 })).not.toThrow();
    expect(sendJson).toHaveBeenCalledTimes(1);
  });
});
