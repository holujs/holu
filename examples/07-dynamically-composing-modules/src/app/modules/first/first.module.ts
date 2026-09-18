import { restModule } from '@holu/rest';
import { FirstController } from './first.controller.js';

@restModule({ controllers: [FirstController] })
export class FirstModule {}
