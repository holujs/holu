import { AnyObj, ctx, HttpStatus } from '@holu/core';
import { HTTP_BODY } from '@holu/body-parser';
import { getParams, getContent, oasRoute } from '@holu/openapi';
import { controller, PATH_PARAMS, RequestContext } from '@holu/rest';

import { CreateUserBody, UserParams } from './models.js';

@controller()
export class UsersController {
  @oasRoute('GET', 'users/:username', {
    description: 'Get a user by username (validates the path parameter)',
    parameters: getParams('path', true, UserParams, 'username'),
    responses: {
      [HttpStatus.OK]: {
        description: 'User found',
        content: getContent({ mediaType: 'application/json', model: UserParams }),
      },
    },
  })
  getUser(@ctx(PATH_PARAMS) pathParams: AnyObj, ctx: RequestContext) {
    ctx.sendJson({ username: pathParams['username'] });
  }

  @oasRoute('POST', 'users', {
    description: 'Create a new user (validates the request body)',
    requestBody: {
      description: 'User data with various validation constraints.',
      content: getContent({ mediaType: 'application/json', model: CreateUserBody }),
    },
    responses: {
      [HttpStatus.CREATED]: {
        description: 'User created',
      },
    },
  })
  createUser(@ctx(HTTP_BODY) body: CreateUserBody, ctx: RequestContext) {
    ctx.rawRes.statusCode = HttpStatus.CREATED;
    ctx.sendJson({ message: 'User created', user: body });
  }
}
