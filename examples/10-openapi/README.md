# OpenAPI Example

Demonstrates how to generate OpenAPI (Swagger) documentation for a Holu REST application using `@holu/openapi`.

## Features Demonstrated

- **OpenAPI Module Setup**: `OpenapiModule.withOpts()` configured with a custom `XOasObject`, Swagger UI path, and OAuth options.
- **Documenting Routes**: `@oasRoute()` decorator with inline OpenAPI metadata (tags, parameters, responses).
- **DTO Models**: `@property()` decorator on model classes to generate JSON Schema for request/response bodies.
- **Custom Content Helper**: Extended `Content` class to wrap models in a `{ data, meta, error }` template.
- **Security Schemes**: `@oasGuard()` decorator for Basic and Bearer (JWT) authentication guards.
- **Route-Scoped Controllers**: A controller with `scope: 'route'` alongside standard request-scoped controllers.

## Running the Example

```bash
yarn --cwd examples/10-openapi start
```

Open http://0.0.0.0:3000/openapi in your browser to see the Swagger UI.

From another terminal:

```bash
curl -i 0.0.0.0:3000
curl -i 0.0.0.0:3000/resource/123
```

## Running Tests

```bash
yarn --cwd examples/10-openapi test
```

## TypeScript Configs

This example has four tsconfig files:

- `tsconfig.json` - the basic configuration used by your IDE (in most cases it is probably VS Code).
- `tsconfig.build.json` - this configuration is used to compile the code from the `src` directory to the `dist` directory, it is intended for application code.
- `tsconfig.e2e.json` - this configuration is used to compile end-to-end tests.
- `tsconfig.unit.json` - this configuration is used to compile unit tests.

For more info see the [docs](https://holujs.github.io/en/rest-application/official-modules/openapi/).
