import { CustomError } from '@holu/core/errors';
import { HttpStatus } from '@holu/core';
import { RequestContext, controller, route } from '@holu/rest';

@controller()
export class ErrorsController {
  @route('GET')
  ok(ctx: RequestContext) {
    ctx.sendJson({ message: 'OK' });
  }

  @route('GET', 'not-found')
  async notFound() {
    throw new CustomError({ msg1: 'Resource not found', status: HttpStatus.NOT_FOUND, level: 'warn', code: 'RESOURCE_NOT_FOUND' });
  }

  @route('GET', 'validation-error')
  async validationError() {
    throw new CustomError({
      msg1: 'Invalid email format',
      status: HttpStatus.UNPROCESSABLE_ENTRY,
      level: 'debug',
      code: 'VALIDATION_ERROR',
    });
  }

  @route('GET', 'unexpected-error')
  async unexpectedError() {
    throw new Error('Database connection lost');
  }
}
