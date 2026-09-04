import { rootModule } from '@holu/core';
import { GreetingService } from './greeting.service.js';
import { AppExtension } from './simple-extension.js';

@rootModule({
  providersPerMod: [GreetingService],
  extensions: [AppExtension],
})
export class AppModule {}
