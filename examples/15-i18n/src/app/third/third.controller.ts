import { RequestContext, controller, route } from '@holu/rest';

import { FirstService } from '../first/first.service.js';

@controller()
export class ThirdController {
  constructor(private firstService: FirstService) {}

  @route('GET', 'third')
  tellHello(ctx: RequestContext) {
    ctx.send(this.firstService.countToThree());
  }
}
