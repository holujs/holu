import { injectable } from '@holu/core';

import { SomeLogMediator } from './some-log-mediator.js';

@injectable()
export class SomeService {
  constructor(private someLogMediator: SomeLogMediator) {}

  setSomeLog() {
    this.someLogMediator.someNewMethod(this, 'written by setSomeLog()');
  }
}
