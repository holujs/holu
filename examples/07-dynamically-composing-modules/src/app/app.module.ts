import { restRootModule } from '@holu/rest';
import { FirstModule } from './modules/first/first.module.js';

@restRootModule({ appends: [FirstModule] })
export class AppModule {}
