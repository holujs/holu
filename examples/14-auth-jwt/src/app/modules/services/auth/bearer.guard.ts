import { Context } from '@holu/core';
import { CanActivate, guard, RequestContext } from '@holu/rest';
import { JwtService, JWT_PAYLOAD, VerifyErrors } from '@holu/jwt';

@guard()
export class BearerGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private ctx: Context,
  ) {}

  async canActivate(ctx: RequestContext) {
    const authValue = ctx.rawReq.headers.authorization?.split(' ');
    if (authValue?.[0] != 'Bearer') {
      return this.unauthorized();
    }

    const token = authValue[1];
    const payload = await this.jwtService.verifyWithSecret(token).catch((err: VerifyErrors) => false as const); // Here `as const` to narrow down returned type.

    if (payload) {
      this.ctx.set(JWT_PAYLOAD, payload);
      return true;
    } else {
      return this.unauthorized();
    }
  }

  private unauthorized() {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer' },
    });
  }
}
