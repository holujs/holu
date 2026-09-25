import { inject } from '@holu/core';
import { controller, route, RequestContext } from '@holu/rest';

import { FirstPerRouService } from './first/first-per-rou.service.js';
import { ThirdService } from './third/third.service.js';

@controller()
export class AppController {
  constructor(
    private thirdService: ThirdService,
    private onePerRouService: FirstPerRouService,
    @inject('multi-provider') private multiProvider: any,
  ) {}

  @route('GET')
  showCounters(ctx: RequestContext) {
    const msg = `per req counter: ${this.thirdService.getCounter()}, per rou counter: ${this.onePerRouService.getCounter()}`;
    ctx.send(msg);
  }

  @route('POST')
  showRequestBody(ctx: RequestContext) {
    ctx.sendJson({ body: this.thirdService.getBody(ctx.body) });
  }

  @route('GET', 'zero')
  getMultiProvideValue(ctx: RequestContext) {
    ctx.sendJson(this.multiProvider);
  }
}
