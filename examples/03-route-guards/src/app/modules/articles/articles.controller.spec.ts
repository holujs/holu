import { Injector } from '@holu/core';

import { ArticlesController } from './articles.controller.js';

describe('ArticlesController', () => {
  const injector = Injector.resolveAndCreate([ArticlesController]);
  const ctrl = injector.get(ArticlesController);

  it('listArticles() returns all articles', () => {
    const result = ctrl.listArticles();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('title');
  });
});
