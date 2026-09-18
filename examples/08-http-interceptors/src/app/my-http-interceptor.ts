import { injectable, Logger } from '@holu/core';
import { BaseRequestContext, HttpHandler, HttpInterceptor } from '@holu/rest';

@injectable()
export class MyHttpInterceptor implements HttpInterceptor {
  constructor(private logger: Logger) {}

  async intercept(next: HttpHandler, ctx: BaseRequestContext) {
    const originalMsg = await next.handle(); // Handling request to the controller

    // You can do something after, for example, log status:
    if (ctx.rawRes.headersSent) {
      const msg = `MyHttpInterceptor works! HttpStatus code: ${ctx.rawRes.statusCode}`;
      this.logger.log('info', msg);
    } else {
      ctx.sendJson({ originalMsg, msg: 'message that attached by interceptor' });
    }

    return originalMsg;
  }
}
