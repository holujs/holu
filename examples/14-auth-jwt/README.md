## JWT Authentication

This example demonstrates how to **protect routes with JSON Web Tokens (JWT)** using the `@holu/jwt` package in a Holu REST application.

### What you'll learn

- How to configure `JwtModule` with a shared secret and expiration
- How to create a `BearerGuard` that verifies JWT tokens via `JwtService`
- How to pass decoded JWT payload to route handlers via DI context (`JWT_PAYLOAD`)
- How to apply guards to individual routes via the `@route()` decorator

### Key files

| File | Purpose |
|------|---------|
| `src/app/modules/services/auth.module.ts` | AuthModule — configures `JwtModule` and exports `BearerGuard` |
| `src/app/modules/services/auth/bearer.guard.ts` | Bearer token guard — verifies JWT and sets `JWT_PAYLOAD` in DI context |
| `src/app/modules/services/auth/auth.controller.ts` | Controller with a route that issues JWT tokens |
| `src/app/modules/services/auth/types.ts` | `MyJwtPayload` interface |
| `src/app/hello-world.controller.ts` | Controller with a public route and a guarded profile route |

### Routes

| Route | Guards | Status | Description |
|-------|--------|--------|-------------|
| `GET /` | — | 200 | Public, returns `Hello, World!` |
| `GET /get-token-for/:userName` | — | 200 | Issues a JWT token for the given user name |
| `GET /profile` | `BearerGuard` | 200 / 401 | Requires a valid Bearer token, returns a greeting |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running the example

Start the server:

```bash
cd examples/14*
yarn start
```

From another terminal:

```bash
# Public route
curl -i localhost:3000

# Get a token with your name encoded in the payload
curl -i localhost:3000/get-token-for/Kostia

# Try accessing the profile without a token — returns 401
curl -i localhost:3000/profile

# Access the profile with a valid token
curl -i localhost:3000/profile -H 'Authorization: Bearer <your-token>'
```

## Project structure

```
src/
  main.ts                                    # Application entry point
  app/
    app.module.ts                            # Root module
    hello-world.controller.ts                # Public + guarded routes
    modules/
      services/
        auth.module.ts                       # AuthModule — JwtModule config + guard export
        auth/
          auth.controller.ts                 # Token-issuing controller
          bearer.guard.ts                    # JWT Bearer guard
          types.ts                           # MyJwtPayload interface
e2e/
  main.spec.ts                               # End-to-end tests
```

## Testing

Run all tests (E2E):

```bash
cd examples/14*
yarn test
```
