## Module Encapsulation

This example demonstrates **module encapsulation** in Holu — how providers are scoped to their modules by default, and how `exports` controls which providers become available to importing modules. It also shows how multi-providers accumulate across the module tree.

### What you'll learn

- How `providersPerReq` and `providersPerRou` are **encapsulated** within their module unless explicitly exported
- How `exports` makes providers available to modules that import the exporting module
- How **multi-providers** (e.g. `{ token: 'multi-provider', multi: true }`) accumulate as modules are imported — each module adds its own value to the array
- How per-request vs per-route provider scopes affect instance counters across HTTP requests

### Key files

| File | Purpose |
|------|---------|
| `src/app/first/first.module.ts` | `FirstModule` — exports `FirstService`, `FirstPerRouService`, `BodyParserModule`, and a multi-provider |
| `src/app/second/second.module.ts` | `SecondModule` — imports `FirstModule`, adds its own multi-provider |
| `src/app/third/third.module.ts` | `ThirdModule` — imports `SecondModule` (but not `FirstModule` directly) |
| `src/app/app.controller.ts` | Root controller — shows per-request vs per-route counters and multi-provider values |
| `src/app/first/first.controller.ts` | Returns multi-provider array visible in `FirstModule` |
| `src/app/second/second.controller.ts` | Returns multi-provider array visible in `SecondModule` |
| `src/app/third/third.controller.ts` | Returns multi-provider array visible in `ThirdModule` |

### Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Shows per-request counter (always 1) and per-route counter (increments) |
| `/` | POST | Echoes the request body |
| `/zero` | GET | Returns the multi-provider array from the root module |
| `/first` | GET | Returns `[{ prop: 'from FirstModule' }]` |
| `/second` | GET | Returns `[{ prop: 'from FirstModule' }, { prop: 'from SecondModule' }]` |
| `/third` | GET | Returns `[{ prop: 'from SecondModule' }]` — `FirstModule`'s provider is not visible here |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running

Start the server:

```bash
cd examples/13*
yarn start
```

From another terminal:

```bash
# Per-request counter resets, per-route counter increments
curl -i localhost:3000
curl -i localhost:3000
curl -i localhost:3000

# Multi-provider arrays — note how encapsulation affects visibility
curl -s localhost:3000/first | jq
curl -s localhost:3000/second | jq
curl -s localhost:3000/third | jq
```

## Project structure

```
src/
  main.ts                                    # Application entry point
  app/
    app.module.ts                            # Root module — imports First, Second, Third modules
    app.controller.ts                        # Root controller showing counters and multi-providers
    first/
      first.module.ts                        # FirstModule — exports services and multi-provider
      first.controller.ts                    # Controller returning multi-provider array
      first.service.ts                       # Per-request service with counter and body pass-through
      first-per-rou.service.ts               # Per-route service with counter
      first-multi-provider.service.ts        # Multi-provider value: 'from FirstModule'
    second/
      second.module.ts                       # SecondModule — imports FirstModule
      second.controller.ts                   # Controller returning multi-provider array
      second.service.ts                      # Delegates to FirstService
      second-multi-provider.service.ts       # Multi-provider value: 'from SecondModule'
    third/
      third.module.ts                        # ThirdModule — imports SecondModule only
      third.controller.ts                    # Controller returning multi-provider array
      third.service.ts                       # Delegates to SecondService
e2e/
  main.spec.ts                               # End-to-end tests
```

## Testing

Run all tests:

```bash
cd examples/13*
yarn test
```
