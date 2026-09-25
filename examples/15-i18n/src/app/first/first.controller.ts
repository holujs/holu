import { RequestContext, controller, route } from '@holu/rest';
import { FirstService } from './first.service.js';

@controller()
export class FirstController {
  constructor(private firstService: FirstService) {}

  @route('GET', 'first')
  tellHello(ctx: RequestContext) {
    ctx.send(this.firstService.countToThree());
  }
}
