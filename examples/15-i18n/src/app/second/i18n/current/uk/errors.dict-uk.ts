import { ISO639 } from '@holu/i18n';
import { injectable } from '@holu/core';

import { ErrorsDict } from '#app/second/i18n/current/_base-en/errors.dict.js';

@injectable()
export class ErrorsDictUk extends ErrorsDict {
  override getLng(): ISO639 {
    return 'uk';
  }
  /**
   * Не можна з'єднатись із базою даних ${database}.
   */
  override mysqlConnect(database: string) {
    return `Не можна з'єднатись із базою даних ${database}` as const;
  }
}
