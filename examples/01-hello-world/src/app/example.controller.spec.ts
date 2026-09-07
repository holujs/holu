import { Injector } from '@holu/core';
import { RequestScopedController } from './request-scoped.controller.js';
import { RouteScopedController } from './route-scoped.controller.js';

describe('RequestScopedController', () => {
  let controller: RequestScopedController;

  beforeEach(() => {
    const injector = Injector.resolveAndCreate([RequestScopedController]);
    controller = injector.get(RequestScopedController);
  });

  it('should return "Hello, World!"', () => {
    expect(controller.hello()).toBe('Hello, World!');
  });
});

describe('RouteScopedController', () => {
  let controller: RouteScopedController;

  beforeEach(() => {
    const injector = Injector.resolveAndCreate([RouteScopedController]);
    controller = injector.get(RouteScopedController);
  });

  it('should return "Hello, Route!"', () => {
    expect(controller.hello()).toBe('Hello, Route!');
  });
});
