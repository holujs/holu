## Override Core Log Messages

This example demonstrates how to **override the internal log messages** produced by the Holu framework core. By extending `SystemLogMediator`, you can customize or replace any log message that Holu emits during startup, routing, and other lifecycle events.

### What you'll learn

- How to extend `SystemLogMediator` and override its methods (e.g. `serverListen`)
- How to substitute your custom mediator at the application level via `ProviderBuilder.useToken(SystemLogMediator, MyLogMediator)`
- How to create module-level `LogMediator` subclasses (`SomeLogMediator`) with new logging methods
- How to override a log mediator in a specific module using `ProviderBuilder.useClass()`

### Key files

| File | Purpose |
|------|---------|
| `src/app/my-log-mediator.ts` | Custom `SystemLogMediator` — overrides the core `serverListen` message |
| `src/app/modules/some/some-log-mediator.ts` | Module-level `LogMediator` with a custom `someNewMethod` |
| `src/app/modules/other/other-log-mediator.ts` | Extends `SomeLogMediator`, overrides `someNewMethod` for `OtherModule` |
| `src/app/modules/some/some.service.ts` | Service that uses `SomeLogMediator` to write logs |
| `src/app/modules/other/other.controller.ts` | Controller that triggers logging via `SomeService` |

### Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Returns a greeting from `OtherController` and triggers a log via `SomeService` |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running

Start the server:

```bash
cd examples/11*
yarn start
```

From another terminal:

```bash
curl -i localhost:3000
```

You should see the custom log message in the server output instead of the default one.

## Project structure

```
src/
  main.ts                                    # Application entry point
  app/
    app.module.ts                            # Root module — substitutes SystemLogMediator
    my-log-mediator.ts                       # Custom SystemLogMediator override
    modules/
      some/
        some.module.ts                       # SomeModule — provides SomeLogMediator and SomeService
        some-log-mediator.ts                 # Custom LogMediator with someNewMethod
        some.service.ts                      # Service that uses SomeLogMediator
      other/
        other.module.ts                      # OtherModule — overrides SomeLogMediator with OtherLogMediator
        other-log-mediator.ts                # Overrides someNewMethod from SomeLogMediator
        other.controller.ts                  # Controller that delegates to SomeService
e2e/
  main.spec.ts                               # End-to-end tests
```

## Testing

Run all tests:

```bash
cd examples/11*
yarn test
```
