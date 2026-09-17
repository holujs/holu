import { guard, CanActivate, RequestContext } from '@holu/rest';

import type { Permission, AuthUser } from './types.js';

/**
 * Checks whether the authenticated user has **all** of the required permissions.
 *
 * This guard must run **after** {@link BearerGuard} so that `ctx.auth` is already set.
 * Required permissions are passed as guard parameters via `createGuardHelper`.
 */
@guard()
export class PermissionsGuard implements CanActivate {
  canActivate(ctx: RequestContext, params?: Permission[]) {
    const user = ctx.auth as AuthUser | undefined;
    if (!user || !params?.every((p) => user.permissions.includes(p))) {
      return new Response('Forbidden', { status: 403 });
    }
    return true;
  }
}
