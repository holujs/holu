## Testing

This example demonstrates how to **test a Holu REST application** at multiple levels: isolated unit tests with `Injector`, and end-to-end HTTP tests with `@holu/rest-testing`.

### What you'll learn

- How to write **unit tests** using `Injector.resolveAndCreate()` to test services in isolation
- How to write **E2E tests** using `TestRestApplication.createTestApp()` and SuperTest
- How to override providers and error handlers in tests via `addProvidersToModule()` and `overrideModuleMeta()`
- How to verify error stack traces and custom error handling in tests

### Key files

| File | Purpose |
|------|---------|
| `src/app/my.service.ts` | Service with `helloWorld()` and `helloAdmin()` methods |
| `src/app/other.service.ts` | Service that provides admin greeting |
| `src/app/hello-world.controller.ts` | Controller that delegates to `MyService` |
| `src/app/bad.controller.ts` | Controller that intentionally throws (requests a non-existing DI token) |
| `src/app/my.service.spec.ts` | Unit test — tests `MyService` in isolation via `Injector` |
| `e2e/main.spec.ts` | E2E test — HTTP tests + custom error handler verification |
| `e2e/custom-controller-error-handler.ts` | Custom `HttpErrorHandler` used in E2E tests to capture errors |

### Routes

| Route | Method | Status | Description |
|-------|--------|--------|-------------|
| `/` | GET | 200 | Returns `Hello, World!` |
| `/admin` | GET | 200 | Returns `Hello, admin!` |
| `/fail1` | GET | 500 | Triggers `InstantiationError` (used in error stack trace tests) |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running

Start the server:

```bash
cd examples/12*
yarn start
```

From another terminal:

```bash
curl -i localhost:3000
curl -i localhost:3000/admin
```

## Project structure

```
src/
  main.ts                                    # Application entry point
  app/
    app.module.ts                            # Root module wiring controllers and services
    hello-world.controller.ts                # Controller with GET / and GET /admin
    bad.controller.ts                        # Controller that triggers DI errors
    my.service.ts                            # Service with greeting methods
    other.service.ts                         # Service providing admin greeting
    my.service.spec.ts                       # Unit test for MyService
e2e/
  main.spec.ts                               # End-to-end HTTP tests
  custom-controller-error-handler.ts         # Custom error handler for test assertions
  error-container.ts                         # Helper to capture errors in tests
```

## Testing

Run all tests (unit + E2E):

```bash
cd examples/12*
yarn test
```
