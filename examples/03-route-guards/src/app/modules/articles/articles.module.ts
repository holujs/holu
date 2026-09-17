import { restModule } from '@holu/rest';

import { AuthModule } from '../auth.module.js';
import { ArticlesController } from './articles.controller.js';

@restModule({
  imports: [AuthModule],
  controllers: [ArticlesController],
})
export class ArticlesModule {}
