import { property, REQUIRED } from '@holu/openapi';

/**
 * Address model — demonstrates nested object validation.
 */
export class Address {
  @property({ [REQUIRED]: true, minLength: 1, maxLength: 100 })
  city: string;

  @property({ [REQUIRED]: true, pattern: '^\\d{5}$', description: 'Five-digit postal code, e.g. "04112"' })
  postalCode: string;
}

/**
 * Body for `POST /users` — demonstrates various validation constraints.
 */
export class CreateUserBody {
  @property({ [REQUIRED]: true, minLength: 3, maxLength: 20, pattern: '^[a-zA-Z0-9_]+$' })
  username: string;

  @property({
    [REQUIRED]: true,
    pattern: '^[\\w.+-]+@[\\w-]+\\.[a-zA-Z]{2,}$',
    description: 'Valid email address',
  })
  email: string;

  @property({ [REQUIRED]: true, minimum: 18, maximum: 120 })
  age: number;

  @property({ enum: ['admin', 'user', 'moderator'] })
  role: string;

  @property({ minItems: 1, uniqueItems: true }, { array: String })
  tags: string[];

  @property()
  address: Address;
}

/**
 * Path/query parameter model — used to document parameters via `getParams()`.
 */
export class UserParams {
  @property({ minLength: 3, maxLength: 20 })
  username: string;
}
