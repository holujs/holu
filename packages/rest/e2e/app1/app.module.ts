import { rootModule } from '@holu/core';

import { Controller1 } from './controllers.js';
import { ServicePerApp, ServicePerMod, ServicePerReq, ServicePerRou } from './services.js';
import { RestModule } from '#init/rest.module.js';
import { aspectRest } from '#decorators/rest-module-aspects.js';

@aspectRest({
  imports: [RestModule],
  providersPerApp: [ServicePerApp],
  providersPerMod: [ServicePerMod],
  providersPerRou: [ServicePerRou],
  providersPerReq: [ServicePerReq],
  controllers: [Controller1],
})
@rootModule()
export class AppModule {}
