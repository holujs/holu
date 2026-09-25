import { restModule } from '@holu/rest';

import { SecondModule } from '../second/second.module.js';
import { ThirdController } from './third.controller.js';
import { ThirdService } from './third.service.js';

@restModule({
  imports: [SecondModule],
  controllers: [ThirdController],
  providersPerReq: [ThirdService],
  exports: [ThirdService],
})
export class ThirdModule {}
