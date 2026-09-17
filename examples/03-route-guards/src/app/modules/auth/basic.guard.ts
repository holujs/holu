import { guard, CanActivate, RequestContext } from '@holu/rest';

/**
 * Implements HTTP Basic Authentication.
 *
 * Reads expected credentials from the `BASIC_AUTH_USERNAME` and
 * `BASIC_AUTH_PASSWORD` environment variables.
 */
@guard()
export class BasicGuard implements CanActivate {
  canActivate(ctx: RequestContext) {
    const header = ctx.rawReq.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
      const [username, password] = decoded.split(':');

      if (username === process.env.BASIC_AUTH_USERNAME && password === process.env.BASIC_AUTH_PASSWORD) {
        ctx.auth = { id: 0, username, permissions: [] };
        return true;
      }
    }

    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="Admin Area"' },
    });
  }
}
