import { featureModule } from '@holu/core';

import { SomeLogMediator } from './some-log-mediator.js';
import { SomeService } from './some.service.js';

@featureModule({
  providersPerMod: [SomeLogMediator, SomeService],
  exports: [SomeService],
})
export class SomeModule {}
