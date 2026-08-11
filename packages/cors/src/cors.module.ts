import { featureModule, DynamicModule, ProviderBuilder } from '@holu/core';
import { aspectRest, DispatcherExtension, RestRouteExtension } from '@holu/rest';
import { CorsOptions } from '@ts-stack/cors';

import { CorsExtension } from './cors.extension.js';
import { CorsService } from './cors.service.js';

@aspectRest({
  providersPerReq: [CorsService],
  exports: [CorsService],
  extensions: [
    {
      extension: CorsExtension,
      afterExtensions: [RestRouteExtension],
      beforeExtensions: [DispatcherExtension],
      export: true,
    },
  ],
})
@featureModule()
export class CorsModule {
  static withOpts(options: CorsOptions): DynamicModule<CorsModule> {
    return {
      module: this,
      providersPerMod: new ProviderBuilder().useValue<CorsOptions>(CorsOptions, options),
      exports: [CorsOptions],
    };
  }
}
