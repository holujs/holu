import { LoggerConfig, ProviderBuilder } from '@holu/core';
import { restRootModule } from '@holu/rest';

import { ArticlesModule } from './modules/articles/articles.module.js';

@restRootModule({
  appends: [ArticlesModule],
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'info' }),
})
export class AppModule {}
