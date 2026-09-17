import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restModule } from '@holu/rest';

import { DefaultLoggerController } from './default-logger/default-logger.controller.js';

@restModule({
  providersPerMod: new ProviderBuilder().useValue(LoggerConfig, { level: 'trace' }),
  controllers: [DefaultLoggerController],
})
export class DefaultLoggerModule {}

