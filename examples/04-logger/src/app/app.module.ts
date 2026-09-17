import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restRootModule } from '@holu/rest';

import { BunyanModule } from './modules/bunyan.module.js';
import { DefaultLoggerModule } from './modules/default-logger.module.js';
import { PinoModule } from './modules/pino.module.js';
import { WinstonModule } from './modules/winston.module.js';

@restRootModule({
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info' }),
  appends: [DefaultLoggerModule, WinstonModule, PinoModule, BunyanModule],
})
export class AppModule {}
