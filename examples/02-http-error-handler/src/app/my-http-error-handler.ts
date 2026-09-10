import { injectable, Logger, HttpStatus } from '@holu/core';
import { isCustomError } from '@holu/core/errors';
import { HttpErrorHandler, RequestContext } from '@holu/rest';

@injectable()
export class MyHttpErrorHandler implements HttpErrorHandler {
  constructor(protected logger: Logger) {}

  async handleError(err: Error, ctx: RequestContext) {
    const requestId = ctx.requestId;
    const timestamp = new Date().toISOString();

    if (isCustomError(err)) {
      const { level, status, code } = err.info;
      this.logger.log(level || 'debug', { requestId, err });
      ctx.rawRes.statusCode = status || HttpStatus.INTERNAL_SERVER_ERROR;
      this.sendError({ error: err.message, code: code || err.code, requestId, timestamp }, ctx);
    } else {
      this.logger.log('error', { requestId, err });
      ctx.rawRes.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      this.sendError({ error: 'Internal server error', requestId, timestamp }, ctx);
    }
  }

  protected sendError(body: object, ctx: RequestContext) {
    if (!ctx.rawRes.headersSent) {
      ctx.rawRes.setHeader('x-requestId', ctx.requestId);
      ctx.sendJson(body);
    }
  }
}
