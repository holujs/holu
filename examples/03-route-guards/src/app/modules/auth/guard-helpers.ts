import { createGuardHelper } from '@holu/rest';

import { PermissionsGuard } from './permissions.guard.js';
import type { Permission } from './types.js';
import { BasicGuard } from './basic.guard.js';

/**
 * Helper to pass required permissions as guard parameters:
 *
 * ```ts
 * @route('POST', 'articles', [BearerGuard, requirePermissions(Permission.write)])
 * ```
 */
export const requirePermissions = createGuardHelper<Permission>(PermissionsGuard);

/**
 * Helper to use BasicGuard with a custom realm string:
 *
 * ```ts
 * @route('GET', 'admin/status', [basicAuth('Admin Area')])
 * ```
 */
export const basicAuth = createGuardHelper<string>(BasicGuard);
