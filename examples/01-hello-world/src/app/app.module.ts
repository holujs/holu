import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restRootModule } from '@holu/rest';
import { RequestScopedController } from './request-scoped.controller.js';
import { RouteScopedController } from './route-scoped.controller.js';

@restRootModule({
  controllers: [RequestScopedController, RouteScopedController],
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info' }),
})
export class AppModule {}
