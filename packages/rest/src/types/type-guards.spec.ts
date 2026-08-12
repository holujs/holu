import { featureModule, injectable, Reflector } from '@holu/core';

import { route } from '#decorators/route.js';
import { isAppendsWithOptions, isControllerDecorator, isInterceptor, isRoute } from './type.guards.js';
import { HttpHandler, HttpInterceptor } from '#interceptors/tokens-and-types.js';
import { CanActivate } from '#interceptors/guard.js';
import { controller } from './controller.js';
import { RequestContext } from '#services/request-context.js';
import { RestAppendOptions } from '#init/rest-aspect-raw-meta.js';

describe('type guards', () => {
  describe('isController()', () => {
    it('class with decorator', () => {
      @controller()
      class Module1 {}
      const metadata = Reflector.getClassLevelMeta(Module1)![0];
      expect(isControllerDecorator(metadata)).toBe(true);
    });

    it('class without decorator', () => {
      class Module1 {}
      const metadata = Reflector.collectMeta(Module1);
      expect(isControllerDecorator(metadata)).toBe(false);
    });
  });

  describe('isAppendsWithOptions', () => {
    it('appends with options', () => {
      @featureModule({})
      class Module1 {}

      const modRefId1: RestAppendOptions = { module: Module1, path: '' };
      expect(isAppendsWithOptions(modRefId1)).toBe(true);
      const modRefId2: RestAppendOptions = { module: Module1, absolutePath: '' };
      expect(isAppendsWithOptions(modRefId2)).toBe(true);
    });
  });

  describe('isRoute()', () => {
    @injectable()
    class Guard1 implements CanActivate {
      canActivate(ctx: RequestContext) {
        return true;
      }

      other() {}
    }

    @controller()
    class ClassWithDecorators {
      @route('GET', '', [Guard1])
      some() {}
    }

    it('should recognize the route', () => {
      const firstDecor = Reflector.collectMeta(ClassWithDecorators)!.some.decorators[0];
      expect(isRoute({ decorator: firstDecor.decorator, value: firstDecor.value })).toBe(true);
    });
  });

  describe('isInterceptor()', () => {
    it('true Interceptor', () => {
      class Interceptor1 implements HttpInterceptor {
        async intercept(next: HttpHandler, ctx: RequestContext) {}
      }

      expect(isInterceptor(Interceptor1)).toBe(true);
    });

    it('false Interceptor', () => {
      class Interceptor1 {
        async inter(next: HttpHandler, ctx: RequestContext) {}
      }

      expect(isInterceptor(Interceptor1)).toBe(false);
    });
  });
});
