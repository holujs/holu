import { inject } from '@holu/core';
import { controller, route, RequestContext } from '@holu/rest';

@controller()
export class FirstController {
  constructor(@inject('multi-provider') private multiProvider: any) {}

  @route('GET', 'first')
  getHello(ctx: RequestContext) {
    ctx.sendJson(this.multiProvider);
  }
}
