import { rootModule } from '@holu/core';

import { Controller1 } from './controllers.js';
import { ServicePerApp, ServicePerMod, ServicePerReq, ServicePerRou } from './services.js';
import { RestModule } from '#init/rest.module.js';
import { restAspect } from '#decorators/rest-module-aspects.js';

@restAspect({
  imports: [RestModule],
  providersPerApp: [ServicePerApp],
  providersPerMod: [ServicePerMod],
  providersPerRou: [ServicePerRou],
  providersPerReq: [ServicePerReq],
  controllers: [Controller1],
})
@rootModule()
export class AppModule {}
