import { guard, CanActivate, RequestContext } from '@holu/rest';

import { AuthService } from './auth.service.js';

/**
 * Extracts a Bearer token from the `Authorization` header and verifies it
 * via {@link AuthService}. On success, populates `ctx.auth` with the user object.
 *
 * Returns a 401 `Response` when the token is missing or invalid.
 */
@guard()
export class BearerGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(ctx: RequestContext) {
    const header = ctx.rawReq.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return this.unauthorized();
    }

    const token = header.slice(7);
    const user = await this.authService.verifyToken(token);
    if (!user) {
      return this.unauthorized();
    }

    ctx.auth = user;
    return true;
  }

  private unauthorized() {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer' },
    });
  }
}
