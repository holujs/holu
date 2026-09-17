import { Logger } from '@holu/core';
import { controller, route, RequestContext } from '@holu/rest';

@controller()
export class DefaultLoggerController {
  @route('GET')
  async ok(ctx: RequestContext, logger: Logger) {
    ctx.send('ok');
    logger.log('info', "it's works!");
  }
}

