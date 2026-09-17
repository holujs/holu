import { type AnyObj, ctx } from '@holu/core';
import { controller, route, RequestContext, PATH_PARAMS } from '@holu/rest';

import { BearerGuard } from '../auth/bearer.guard.js';
import { BasicGuard } from '../auth/basic.guard.js';
import { requirePermissions } from '../auth/guard-helpers.js';
import { Permission } from '../auth/types.js';

/**
 * Demonstrates different guard configurations on routes:
 *
 * - No guards → public access
 * - Single guard → authentication only
 * - Chained guards → authentication + authorization
 * - Guard with parameters → permission-based access
 * - HTTP Basic Auth → browser-native login prompt
 */
@controller()
export class ArticlesController {
  /**
   * Public route — no guard required.
   */
  @route('GET', 'articles')
  listArticles() {
    return [
      { id: 1, title: 'Getting Started with Holu' },
      { id: 2, title: 'Route Guards Explained' },
    ];
  }

  /**
   * Protected route — requires a valid Bearer token.
   * The `BearerGuard` populates `ctx.auth` with the authenticated user.
   */
  @route('GET', 'articles/:id', [BearerGuard])
  getArticle(@ctx(PATH_PARAMS) pathParams: AnyObj, ctx: RequestContext) {
    return { id: pathParams.id, title: 'Route Guards Explained', author: ctx.auth };
  }

  /**
   * Protected + authorized — requires authentication AND the `write` permission.
   * Guards are executed left-to-right: `BearerGuard` runs first, then `PermissionsGuard`.
   */
  @route('POST', 'articles', [BearerGuard, requirePermissions(Permission.write)])
  createArticle(ctx: RequestContext) {
    return { created: true, author: ctx.auth };
  }

  /**
   * Admin-only route — requires the `admin` permission.
   */
  @route('DELETE', 'articles/:id', [BearerGuard, requirePermissions(Permission.admin)])
  deleteArticle(@ctx(PATH_PARAMS) pathParams: AnyObj) {
    return { deleted: true, id: pathParams.id };
  }

  /**
   * HTTP Basic Auth route — triggers the browser's native login dialog.
   */
  @route('GET', 'admin/status', [BasicGuard])
  adminStatus(ctx: RequestContext) {
    return { status: 'ok', user: ctx.auth };
  }
}
