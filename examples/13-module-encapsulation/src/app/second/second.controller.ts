import { inject } from '@holu/core';
import { controller, route, RequestContext } from '@holu/rest';

@controller()
export class SecondController {
  constructor(@inject('multi-provider') private multiProvider: any) {}

  @route('GET', 'second')
  getHello(ctx: RequestContext) {
    ctx.sendJson(this.multiProvider);
  }
}
