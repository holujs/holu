import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restRootModule, HTTP_INTERCEPTORS } from '@holu/rest';

import { HelloWorldController } from './hello-world.controller.js';
import { RouteScopedController } from './hello-world.controller.js';
import { MyHttpInterceptor } from './my-http-interceptor.js';

@restRootModule({
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info' }),
  controllers: [HelloWorldController, RouteScopedController],
  // Interceptor for route-scoped controllers (scope: 'route'):
  providersPerRou: [{ token: HTTP_INTERCEPTORS, useClass: MyHttpInterceptor, multi: true }],
  // Interceptor for request-scoped controllers (default):
  providersPerReq: [{ token: HTTP_INTERCEPTORS, useClass: MyHttpInterceptor, multi: true }],
})
export class AppModule {}
