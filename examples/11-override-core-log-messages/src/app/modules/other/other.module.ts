import { ProviderBuilder } from '@holu/core';
import { restModule } from '@holu/rest';

import { SomeModule } from '../some/some.module.js';
import { SomeLogMediator } from '../some/some-log-mediator.js';
import { OtherController } from './other.controller.js';
import { OtherLogMediator } from './other-log-mediator.js';

@restModule({
  imports: [SomeModule],
  providersPerMod: new ProviderBuilder().useClass(SomeLogMediator, OtherLogMediator),
  controllers: [OtherController],
})
export class OtherModule {}
