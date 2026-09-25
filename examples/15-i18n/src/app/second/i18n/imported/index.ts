import type { DictGroup } from '@holu/i18n';
import { getDictGroup } from '@holu/i18n';

import { FirstDict } from '#dict/first/first.dict.js';
import { FirstDictEn } from './first/en/first.dict-en.js';
import { FirstDictUk } from './first/uk/first.dict-uk.js';

export const imported: DictGroup[] = [getDictGroup(FirstDict, FirstDictEn, FirstDictUk)];
