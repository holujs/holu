import { featureModule, DynamicModule } from '@holu/core';
import { restAspect } from '@holu/rest';

import { JwtService } from './jwt.service.js';
import { JwtServiceOptions } from './models/jwt-service-options.js';

@restAspect({
  providersPerApp: [JwtServiceOptions],
  providersPerReq: [JwtService],
  exports: [JwtService],
})
@featureModule()
export class JwtModule {
  static withOpts(jwtServiceOptions: JwtServiceOptions): DynamicModule<JwtModule> {
    return {
      module: this,
      providersPerMod: [{ token: JwtServiceOptions, useValue: jwtServiceOptions }],
    };
  }
}
