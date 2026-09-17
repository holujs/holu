import { Logger, LoggerConfig, ProviderBuilder } from '@holu/core';
import { restModule } from '@holu/rest';

import { PatchLogger } from './winston/patch-logger.js';
import { WinstonController } from './winston/winston.controller.js';

@restModule({
  providersPerMod: new ProviderBuilder()
    .useValue(LoggerConfig, { level: 'debug' })
    .useFactory(Logger, [PatchLogger, PatchLogger.prototype.patchLogger]),
  controllers: [WinstonController],
})
export class WinstonModule {}

