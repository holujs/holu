## Route Guards

This example demonstrates how to **protect routes** using guards in Holu. Guards run before a route handler and decide whether the request should proceed (`true`) or be rejected (a `Response` object with an error status).

### What you'll learn

- How to create a guard that implements `CanActivate`
- How to apply guards to individual routes via the `@route()` decorator
- How to chain multiple guards (authentication → authorization)
- How to pass parameters to guards using `createGuardHelper`
- How to implement HTTP Basic Authentication with the browser's native login dialog

### Key files

| File | Purpose |
|------|---------|
| `src/app/modules/auth/bearer.guard.ts` | Bearer token authentication guard |
| `src/app/modules/auth/permissions.guard.ts` | Permission-based authorization guard |
| `src/app/modules/auth/basic.guard.ts` | HTTP Basic Authentication guard |
| `src/app/modules/auth/guard-helpers.ts` | `createGuardHelper` wrappers for parameterized guards |
| `src/app/modules/auth/auth.service.ts` | Simulated token verification service |
| `src/app/modules/articles/articles.controller.ts` | Controller with public, protected, and admin routes |

### Routes

| Route | Guards | Status | Description |
|-------|--------|--------|-------------|
| `GET /articles` | — | 200 | Public, no authentication needed |
| `GET /articles/:id` | `BearerGuard` | 200 / 401 | Requires a valid Bearer token |
| `POST /articles` | `BearerGuard` → `PermissionsGuard(write)` | 200 / 401 / 403 | Requires authentication + `write` permission |
| `DELETE /articles/:id` | `BearerGuard` → `PermissionsGuard(admin)` | 200 / 401 / 403 | Requires authentication + `admin` permission |
| `GET /admin/status` | `BasicGuard` | 200 / 401 | HTTP Basic Auth (browser login dialog) |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running the example

Start the server:

```bash
cd examples/03*
yarn start
```

From another terminal:

```bash
# Public route — no token needed
curl -s localhost:3000/articles | jq
# [{ "id": 1, "title": "Getting Started with Holu" }, ...]

# Protected route — returns 401 without token
curl -i localhost:3000/articles/1
# HTTP/1.1 401 Unauthorized

# Protected route — returns 200 with valid token
curl -s localhost:3000/articles/1 -H 'Authorization: Bearer token-viewer' | jq
# { "id": "1", "title": "Route Guards Explained", "author": { "username": "viewer", ... } }

# Authorized route — viewer can't create (403)
curl -i -X POST localhost:3000/articles -H 'Authorization: Bearer token-viewer'
# HTTP/1.1 403 Forbidden

# Authorized route — editor can create (200)
curl -s -X POST localhost:3000/articles -H 'Authorization: Bearer token-editor' | jq
# { "created": true, "author": { "username": "editor", ... } }

# Admin route — editor can't delete (403)
curl -i -X DELETE localhost:3000/articles/1 -H 'Authorization: Bearer token-editor'
# HTTP/1.1 403 Forbidden

# Admin route — admin can delete (200)
curl -s -X DELETE localhost:3000/articles/1 -H 'Authorization: Bearer token-admin' | jq
# { "deleted": true, "id": "1" }

# HTTP Basic Auth — open in browser for login dialog
curl -i localhost:3000/admin/status -u demo:p@55w0rd
# { "status": "ok", "user": { "username": "demo", ... } }
```

To test Basic Auth in the browser, open [http://localhost:3000/admin/status](http://localhost:3000/admin/status) — the browser will show a native login dialog. Enter username `demo` and password `p@55w0rd`. You can change these credentials in the `.env` file (restart required).

## Project structure

```
src/
  main.ts                                    # Application entry point
  app/
    app.module.ts                            # Root module
    modules/
      auth/
        auth.module.ts                       # AuthModule — provides and exports guards
        auth.service.ts                      # Simulated token verification
        bearer.guard.ts                      # Bearer token guard
        permissions.guard.ts                 # Permission check guard
        basic.guard.ts                       # HTTP Basic Auth guard
        guard-helpers.ts                     # createGuardHelper wrappers
        types.ts                             # AuthUser interface, Permission enum
      articles/
        articles.module.ts                   # ArticlesModule — imports AuthModule
        articles.controller.ts               # Controller with guarded routes
        articles.controller.spec.ts          # Unit test
e2e/
  main.spec.ts                               # End-to-end tests
```

## Testing

Run all tests (E2E + unit):

```bash
cd examples/03*
yarn test
```
