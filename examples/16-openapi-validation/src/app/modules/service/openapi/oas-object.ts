import type { XOasObject } from '@ts-stack/openapi-spec';
import { openapi } from '@ts-stack/openapi-spec';

export const oasObject: XOasObject = {
  openapi,
  servers: [{ url: 'http://0.0.0.0:3000' }],
  info: { title: 'OpenAPI Validation Example', version: '1.0.0' },
};
