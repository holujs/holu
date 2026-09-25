import { Dictionary, ISO639 } from '@holu/i18n';
import { injectable } from '@holu/core';

@injectable()
export class FirstDict implements Dictionary {
  getLng(): ISO639 {
    return 'en';
  }
  /**
   * one, two, three
   */
  countToThree = 'one, two, three';
}
