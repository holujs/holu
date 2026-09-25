import type { DictGroup } from '@holu/i18n';
import { getDictGroup } from '@holu/i18n';

import { FirstDict } from '#dict/first/first.dict.js';
import { FirstDictPl } from './pl/first.dict-pl.js';
export { FirstDict };

export const current: DictGroup[] = [getDictGroup(FirstDict, FirstDictPl)];
