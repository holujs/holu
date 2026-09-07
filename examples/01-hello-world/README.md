## Hello World

A minimal REST application demonstrating two controller scopes in Holu:

- **Request scope** (default): a new controller instance is created per HTTP request
- **Route scope**: a single controller instance is shared across all requests to the same route

This example shows:
- **Controllers**: `RequestScopedController` and `RouteScopedController`
- **REST module**: `@restRootModule` with controllers and logger configuration
- **Unit & E2E testing**: isolated DI tests and HTTP-level tests with `@holu/rest-testing`

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running

Start from terminal:

```bash
cd examples/01*
yarn start
```

From another terminal:

```bash
curl -i localhost:3000/request-scoped
curl -i localhost:3000/route-scoped
```

## Project Structure

```
src/
  main.ts                          # Application entry point
  app/
    app.module.ts                  # Root module wiring controllers together
    request-scoped.controller.ts   # Controller with request scope (default)
    route-scoped.controller.ts     # Controller with route scope
    example.controller.spec.ts     # Unit tests
e2e/
  01.spec.ts                       # End-to-end tests
```

## TypeScript configs

This example has four tsconfig files:

- `tsconfig.json` - the basic configuration used by your IDE (in most cases it is probably VS Code).
- `tsconfig.build.json` - this configuration is used to compile the code from the `src` directory to the `dist` directory, it is intended for application code.
- `tsconfig.e2e.json` - this configuration is used to compile end-to-end tests.
- `tsconfig.unit.json` - this configuration is used to compile unit tests.

## Testing

The application code is split across several files to support testing:

- `src/main.ts` starts the web server and must be separated from the code under test.
- `src/app/app.module.ts` wires the module; controllers live in their own files.

The test files are located at `src/app/example.controller.spec.ts` (unit) and `e2e/01.spec.ts` (E2E).
