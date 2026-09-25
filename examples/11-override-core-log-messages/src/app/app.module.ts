import { LoggerConfig, ProviderBuilder, SystemLogMediator } from '@holu/core';
import { restRootModule } from '@holu/rest';

import { MyLogMediator } from './my-log-mediator.js';
import { SomeModule } from './modules/some/some.module.js';
import { OtherModule } from './modules/other/other.module.js';

@restRootModule({
  imports: [SomeModule],
  providersPerApp: new ProviderBuilder()
    .passThrough(MyLogMediator)
    .useToken(SystemLogMediator, MyLogMediator) // This allows to use MyLogMediator internally in Holu core
    .useValue(LoggerConfig, { level: 'info' }),
  appends: [OtherModule],
})
export class AppModule {}
