import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restRootModule } from '@holu/rest';

import { UsersModule } from './modules/routed/users/users.module.js';
import { openapiDynamicModule } from './modules/service/openapi/openapi.module.js';

@restRootModule({
  imports: [UsersModule.withPath(''), openapiDynamicModule],
  exports: [openapiDynamicModule],
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info', showExternalLogs: false }),
})
export class AppModule {}
