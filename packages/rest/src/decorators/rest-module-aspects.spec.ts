import { Reflector } from '@holu/core';
import { aspectRest, restRootModule } from './rest-module-aspects.js';

describe('restRootModule decorator', () => {
  it('empty decorator', () => {
    @restRootModule({})
    class Module1 {}

    const metadata = Reflector.getClassLevelMeta(Module1)!;
    expect(metadata.length).toBe(1);
    expect(metadata[0].decoratorId).toBe(aspectRest);
    expect(metadata[0].declaredInDir).toContain('holu/packages/rest/dist/decorators');
  });
});
