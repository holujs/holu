import { BodyParserModule } from '@holu/body-parser';
import { restModule } from '@holu/rest';

import { FirstController } from './first.controller.js';
import { FirstPerRouService } from './first-per-rou.service.js';
import { FirstService } from './first.service.js';
import { FirstMultiProviderService } from './first-multi-provider.service.js';

@restModule({
  imports: [BodyParserModule],
  controllers: [FirstController],
  providersPerRou: [FirstPerRouService],
  providersPerReq: [FirstService, { token: 'multi-provider', useClass: FirstMultiProviderService, multi: true }],
  exports: [FirstService, FirstPerRouService, BodyParserModule, 'multi-provider'],
})
export class FirstModule {}
