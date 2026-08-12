import type { AnyObj, Class, DecoratorMeta, ModRefId } from '@holu/core';

import { route } from '#decorators/route.js';
import type { HttpInterceptor } from '#interceptors/tokens-and-types.js';
import type { RestAppendOptions, RestDynamicOptions } from '#init/rest-aspect-raw-meta.js';
import type { ControllerOptions } from './controller.js';
import { controller } from './controller.js';
import type { Http2SecureServerOptions, ServerOptions } from './server-options.js';

export function isControllerDecorator(decoratorMeta?: AnyObj): decoratorMeta is DecoratorMeta<ControllerOptions> {
  return decoratorMeta?.decorator === controller;
}

export function isRoute<T>(decoratorMeta?: DecoratorMeta<T>): decoratorMeta is DecoratorMeta<T> {
  return (decoratorMeta as DecoratorMeta<T>)?.decorator === route;
}

export function isInterceptor(cls?: Class): cls is Class<HttpInterceptor> {
  return typeof (cls?.prototype as HttpInterceptor | undefined)?.intercept == 'function';
}

export function isAppendsWithOptions(modRefId?: ModRefId | RestDynamicOptions | RestAppendOptions): modRefId is RestAppendOptions {
  return (
    (modRefId as RestAppendOptions)?.module !== undefined &&
    ((modRefId as RestAppendOptions)?.path !== undefined || (modRefId as RestAppendOptions)?.absolutePath !== undefined)
  );
}

export function isHttp2SecureServerOptions(serverOptions: ServerOptions): serverOptions is Http2SecureServerOptions {
  return (serverOptions as Http2SecureServerOptions).isHttp2SecureServer;
}
