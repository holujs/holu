import { rootModule, ProviderBuilder, ctx, LoggerConfig } from '@holu/core';
import { QUERY_PARAMS, PATH_PARAMS, controller, route, RestModule, RequestContext, restAspect } from '@holu/rest';

import { Interceptor1 } from './interceptor1.js';

@controller()
export class RequestScopedController {
  @route('GET', 'get0/:pathParam1/:pathParam2')
  tellHello(@ctx(QUERY_PARAMS) queryParams: any, @ctx(PATH_PARAMS) pathParams: any) {
    return { pathParams, queryParams };
  }

  @route(['GET', 'POST'], 'get-array0')
  [Symbol()](ctx: RequestContext) {
    return ctx.sendJson(ctx.rawReq.headers);
  }

  @route('GET', 'interceptor0', [], [Interceptor1])
  withInterceptors(@ctx('msg') msg: string) {
    return msg;
  }
}

@controller({ scope: 'route' })
export class RouteScopedController {
  @route('GET', 'get1/:pathParam1/:pathParam2')
  tellHello(ctx: RequestContext) {
    return { pathParams: ctx.pathParams, queryParams: ctx.queryParams };
  }

  @route(['GET', 'POST'], 'get-array1')
  [Symbol()](ctx: RequestContext) {
    return ctx.sendJson(ctx.rawReq.headers);
  }

  @route('GET', 'interceptor1', [], [Interceptor1])
  withInterceptors(ctx: RequestContext) {
    return ctx.get('msg');
  }
}

@restAspect({ controllers: [RequestScopedController, RouteScopedController] })
@rootModule({
  imports: [RestModule],
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info' }),
})
export class AppModule {}
