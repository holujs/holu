import { restModule } from '@holu/rest';

import { FirstModule } from '../first/first.module.js';
import { SecondMultiProviderService } from './second-multi-provider.service.js';
import { SecondController } from './second.controller.js';
import { SecondService } from './second.service.js';

@restModule({
  imports: [FirstModule],
  controllers: [SecondController],
  providersPerReq: [SecondService, { token: 'multi-provider', useClass: SecondMultiProviderService, multi: true }],
  exports: [SecondService, 'multi-provider'],
})
export class SecondModule {}
