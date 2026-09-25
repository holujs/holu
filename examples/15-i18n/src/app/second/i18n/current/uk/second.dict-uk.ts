import { ISO639 } from '@holu/i18n';
import { injectable } from '@holu/core';

import { SecondDict } from '#app/second/i18n/current/_base-en/second.dict.js';

@injectable()
export class SecondDictUk extends SecondDict {
  override getLng(): ISO639 {
    return 'uk';
  }

  override hello(name: string) {
    return `Привіт, ${name}!`;
  }
}
