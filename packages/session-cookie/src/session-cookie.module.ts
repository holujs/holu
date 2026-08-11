import { featureModule, DynamicModule, optional } from '@holu/core';
import { aspectRest, DispatcherExtension, RestRouteExtension } from '@holu/rest';

import { SessionCookie } from './session-cookie.js';
import { SessionLogMediator } from './session-log-mediator.js';
import { SessionCookieOptions } from './types.js';
import { SessionCookieExtension } from './session-cookie.extension.js';

@aspectRest({
  providersPerMod: [SessionLogMediator],
  providersPerReq: [SessionCookie],
  extensions: [
    {
      extension: SessionCookieExtension,
      afterExtensions: [RestRouteExtension],
      beforeExtensions: [DispatcherExtension],
      exportOnly: true,
    },
  ],
  exports: [SessionCookie],
})
@featureModule()
export class SessionCookieModule {
  static withOpts(opts: SessionCookieOptions): DynamicModule<SessionCookieModule> {
    return {
      module: this,
      providersPerMod: [{ token: SessionCookieOptions, useValue: opts }],
      exports: [SessionCookieOptions],
    };
  }

  constructor(log: SessionLogMediator, @optional() opts?: SessionCookieOptions) {
    if (opts?.expires && opts.maxAge) {
      log.cannotSetExpireAndMaxAge(this);
    }
  }
}
