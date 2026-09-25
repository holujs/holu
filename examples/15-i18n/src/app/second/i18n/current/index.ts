import type { DictGroup } from '@holu/i18n';
import { getDictGroup } from '@holu/i18n';

import { SecondDict } from '#app/second/i18n/current/_base-en/second.dict.js';
import { SecondDictUk } from './uk/second.dict-uk.js';
import { ErrorsDict } from '#app/second/i18n/current/_base-en/errors.dict.js';
import { ErrorsDictUk } from './uk/errors.dict-uk.js';

export { SecondDict, ErrorsDict };

export const current: DictGroup[] = [getDictGroup(SecondDict, SecondDictUk), getDictGroup(ErrorsDict, ErrorsDictUk)];
