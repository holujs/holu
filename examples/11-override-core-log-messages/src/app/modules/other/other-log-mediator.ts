import { SomeLogMediator } from '../some/some-log-mediator.js';

export class OtherLogMediator extends SomeLogMediator {
  /**
   * OtherLogMediator with overridden someNewMethod says: "${additionalArgument}".
   */
  override someNewMethod(self: object, additionalArgument: string) {
    this.setLog('info', `OtherLogMediator with overridden someNewMethod says: "${additionalArgument}"`);
  }
}
