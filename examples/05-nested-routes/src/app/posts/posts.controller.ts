import { AnyObj, ctx } from '@holu/core';
import { controller, route, PATH_PARAMS, RequestContext } from '@holu/rest';

@controller()
export class PostsController {
  /**
   * As you can see, you can apply multiple `@route` decorators to a single method.
   */
  @route('GET')
  @route('GET', ':postId')
  sendPosts(reqCtx: RequestContext, @ctx(PATH_PARAMS) pathParams: AnyObj = {}) {
    reqCtx.sendJson({ pathParams });
  }
}
