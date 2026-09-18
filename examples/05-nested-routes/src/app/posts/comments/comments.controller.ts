import { AnyObj, ctx } from '@holu/core';
import { controller, route, PATH_PARAMS, RequestContext } from '@holu/rest';

@controller()
export class CommentsController {
  /**
   * As you can see, you can apply multiple `@route` decorators to a single method.
   */
  @route('GET')
  @route('GET', ':commentId')
  sendComments(ctx: RequestContext, @ctx(PATH_PARAMS) pathParams: AnyObj = {}) {
    ctx.sendJson({ pathParams });
  }
}
