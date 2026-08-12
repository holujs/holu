import { Logger, featureModule, ProviderBuilder, LoggerConfig } from '@holu/core';
import { restAspect } from '@holu/rest';

import { PatchLogger } from './patch-logger.js';
import { WinstonController } from './winston.controller.js';

@restAspect({ controllers: [WinstonController] })
@featureModule({
  providersPerMod: new ProviderBuilder()
    .useValue(LoggerConfig, { level: 'debug' })
    .useFactory(Logger, [PatchLogger, PatchLogger.prototype.patchLogger]),
})
export class WinstonModule {}
