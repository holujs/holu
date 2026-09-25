import { ctx } from '@holu/core';
import { controller, route, RequestContext } from '@holu/rest';
import { JWT_PAYLOAD } from '@holu/jwt';

import { BearerGuard } from './modules/services/auth/bearer.guard.js';
import { MyJwtPayload } from './modules/services/auth/types.js';

@controller()
export class HelloWorldController {
  @route('GET')
  async helloWorld(ctx: RequestContext) {
    ctx.send('Hello, World!\n');
  }

  @route('GET', 'profile', [BearerGuard])
  async getProfile(@ctx(JWT_PAYLOAD) jwtPayload: MyJwtPayload, ctx: RequestContext) {
    ctx.send(`Hello, ${jwtPayload.userName}! You have successfully authorized.`);
  }
}
