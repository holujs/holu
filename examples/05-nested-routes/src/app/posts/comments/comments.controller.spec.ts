import { Injector } from '@holu/core';
import type { RequestContext } from '@holu/rest';
import { jest } from '@jest/globals';

import { CommentsController } from './comments.controller.js';

describe('CommentsController', () => {
  const sendJson = jest.fn();
  const res = { sendJson } as unknown as RequestContext;
  let commentsController: CommentsController;

  beforeEach(() => {
    jest.restoreAllMocks();
    const injector = Injector.resolveAndCreate([CommentsController]);
    commentsController = injector.get(CommentsController);
  });

  it('should send comments with path params', () => {
    expect(() => commentsController.sendComments(res)).not.toThrow();
    expect(sendJson).toHaveBeenCalledTimes(1);
  });
});
