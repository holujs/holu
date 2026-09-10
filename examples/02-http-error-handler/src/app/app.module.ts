import { restRootModule } from '@holu/rest';
import { HttpErrorHandler } from '@holu/rest';

import { MyHttpErrorHandler } from './my-http-error-handler.js';
import { ErrorsController } from './errors.controller.js';

@restRootModule({
  controllers: [ErrorsController],
  providersPerRou: [{ token: HttpErrorHandler, useClass: MyHttpErrorHandler }],
  exports: [HttpErrorHandler],
})
export class AppModule {}
