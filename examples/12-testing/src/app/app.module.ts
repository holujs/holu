import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restRootModule } from '@holu/rest';

import { HelloWorldController } from './hello-world.controller.js';
import { MyService } from './my.service.js';
import { OtherService } from './other.service.js';
import { Controller1 } from './bad.controller.js';

@restRootModule({
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info' }),
  controllers: [HelloWorldController, Controller1],
  providersPerReq: [MyService, OtherService],
})
export class AppModule {}
