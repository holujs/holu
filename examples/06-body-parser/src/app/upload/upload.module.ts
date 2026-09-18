import { restModule } from '@holu/rest';
import { MulterExtendedOptions } from '@holu/body-parser';

import { RequestScopedController } from './request-scoped.controller.js';
import { RouteScopedController } from './route-scoped.controller.js';

const multerOptions: MulterExtendedOptions = { limits: { files: 20 }, errorLogLevel: 'debug' };

@restModule({
  providersPerMod: [{ token: MulterExtendedOptions, useValue: multerOptions }],
  controllers: [RequestScopedController, RouteScopedController],
})
export class UploadModule {}
