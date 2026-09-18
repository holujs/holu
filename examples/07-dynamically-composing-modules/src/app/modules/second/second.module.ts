import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restModule } from '@holu/rest';

import { SecondController } from './second.controller.js';

@restModule({
  controllers: [SecondController],
  providersPerMod: new ProviderBuilder().useValue(LoggerConfig, { level: 'debug' }),
})
export class SecondModule {}
