import { ISO639 } from '@holu/i18n';
import { injectable } from '@holu/core';

import { FirstDict } from '#dict/first/first.dict.js';

@injectable()
export class FirstDictUk extends FirstDict {
  override getLng(): ISO639 {
    return 'uk';
  }
  /**
   * overridden: один, два, три
   */
  override countToThree = 'overridden: один, два, три';
}
