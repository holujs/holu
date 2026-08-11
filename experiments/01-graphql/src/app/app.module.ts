import { rootModule, ProviderBuilder, LoggerConfig } from '@holu/core';
import { controller, route, aspectRest } from '@holu/rest';

@controller()
export class RequestScopedController {
  @route('GET', 'request-scoped')
  tellHello() {
    return 'ok1';
  }
}

@controller({ scope: 'route' })
export class RouteScopedController {
  @route('GET', 'route-scoped')
  tellHello() {
    return 'ok2';
  }
}

@aspectRest({
  controllers: [RequestScopedController, RouteScopedController],
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info' }),
})
@rootModule()
export class AppModule {}
