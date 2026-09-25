import { ISO639 } from '@holu/i18n';
import { injectable } from '@holu/core';

import { FirstDict } from '#dict/first/first.dict.js';

@injectable()
export class FirstDictEn extends FirstDict {
  override getLng(): ISO639 {
    return 'en';
  }
  /**
   * overridden: one, two, three
   */
  override countToThree = 'overridden: one, two, three';
}
