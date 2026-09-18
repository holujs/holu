import { Injector } from '@holu/core';
import type { RequestContext } from '@holu/rest';
import { RouteScopedMulterParser } from '@holu/body-parser';
import { jest } from '@jest/globals';

import { RouteScopedController } from './route-scoped.controller.js';

describe('RouteScopedController', () => {
  const send = jest.fn();
  const sendJson = jest.fn();
  let controller: RouteScopedController;

  beforeEach(() => {
    jest.restoreAllMocks();
    const injector = Injector.resolveAndCreate([RouteScopedController, { token: RouteScopedMulterParser, useValue: {} }]);
    controller = injector.get(RouteScopedController);
  });

  it('should say "Hello, you need send POST request"', () => {
    const ctx = { send } as unknown as RequestContext;
    expect(() => controller.tellHello(ctx)).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('should work with POST', () => {
    const body = { one: 1 };
    const ctx = { sendJson, body } as unknown as RequestContext;
    expect(() => controller.post(ctx)).not.toThrow();
    expect(sendJson).toHaveBeenCalledWith(body);
  });
});
