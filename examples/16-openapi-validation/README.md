# OpenAPI Validation

This example demonstrates how to **validate HTTP requests against OpenAPI schemas** using `@holu/openapi-validation` in a Holu REST application. The `ValidationModule` automatically validates both **request bodies** and **path/query parameters** using [AJV](https://ajv.js.org/) under the hood.

## What you'll learn

- How to define DTO models with `@property()` and `REQUIRED` from `@holu/openapi`
- How to apply various validation constraints:
  - **Required fields** — `{ [REQUIRED]: true }`
  - **String length** — `minLength`, `maxLength`
  - **String pattern** — `pattern` (regex)
  - **Numeric range** — `minimum`, `maximum`
  - **Enum values** — `enum: ['admin', 'user', 'moderator']`
  - **Array constraints** — `minItems`, `uniqueItems`
  - **Nested objects** — validation propagates into nested models
- How to validate path parameters via `getParams()` + `@oasRoute()`
- How `ValidationModule` returns `400 Bad Request` with a descriptive error message

## Key files

| File | Purpose |
|------|---------|
| `src/app/modules/routed/users/models.ts` | DTO models: `CreateUserBody`, `Address`, `UserParams` |
| `src/app/modules/routed/users/users.controller.ts` | `UsersController` — `GET /users/:username` and `POST /users` |
| `src/app/modules/routed/users/users.module.ts` | `UsersModule` — imports `BodyParserModule` + `ValidationModule` |
| `src/app/modules/service/openapi/openapi.module.ts` | OpenAPI module with Swagger UI |
| `src/app/app.module.ts` | Root module |

## Routes

| Route | Method | Status | Description |
|-------|--------|--------|-------------|
| `/users/:username` | GET | 200 / 400 | Returns the username; validates path param (minLength: 3) |
| `/users` | POST | 201 / 400 | Creates a user; validates body (required fields, patterns, ranges, enum, arrays, nested objects) |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running the example

Start the server:

```bash
cd examples/16*
yarn start
```

Open http://localhost:3000/openapi in your browser to see the Swagger UI.

From another terminal, try valid requests:

```bash
# Get user by username
curl -i localhost:3000/users/Kostia

# Create a user with all required fields
curl -isS localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"username": "Kostia", "email": "kostia@example.com", "age": 30}'

# Create a user with optional fields (role, tags, address)
curl -isS localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"username": "Kostia", "email": "kostia@example.com", "age": 30, "role": "admin", "tags": ["dev"], "address": {"city": "Kyiv", "postalCode": "04112"}}'
```

And invalid requests (will return 400 with validation errors):

```bash
# Username too short (minLength: 3)
curl -isS localhost:3000/users/ab

# Missing required fields
curl -isS localhost:3000/users \
  -H 'content-type: application/json' -d '{}'

# Username with invalid characters (pattern: ^[a-zA-Z0-9_]+$)
curl -isS localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"username": "no spaces!", "email": "a@b.com", "age": 25}'

# Age below minimum (minimum: 18)
curl -isS localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"username": "Kostia", "email": "a@b.com", "age": 10}'

# Invalid enum value for role
curl -isS localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"username": "Kostia", "email": "a@b.com", "age": 30, "role": "superadmin"}'

# Invalid postal code pattern (pattern: ^\d{5}$)
curl -isS localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"username": "Kostia", "email": "a@b.com", "age": 30, "address": {"city": "Kyiv", "postalCode": "abc"}}'
```

## Project structure

```
src/
  main.ts                                          # Application entry point
  app/
    app.module.ts                                  # Root module
    modules/
      routed/
        users/
          users.module.ts                          # UsersModule (BodyParser + Validation)
          users.controller.ts                      # UsersController with @oasRoute()
          models.ts                                # CreateUserBody, Address, UserParams
      service/
        openapi/
          openapi.module.ts                        # OpenapiModule.withOpts() setup
          oas-object.ts                            # XOasObject (API info, servers)
          oas-options.ts                           # OasOptions
e2e/
  main.spec.ts                                     # End-to-end tests
```

## Testing

Run all tests (E2E):

```bash
cd examples/16*
yarn test
```
