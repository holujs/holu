import { inject } from '@holu/core';
import { controller, route, RequestContext } from '@holu/rest';

@controller()
export class ThirdController {
  constructor(@inject('multi-provider') private multiProvider: any) {}

  @route('GET', 'third')
  getHello(ctx: RequestContext) {
    ctx.sendJson(this.multiProvider);
  }
}
