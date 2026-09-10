## Prerequisites

If you haven't prepared the examples repository yet, you can do so:

```bash
git clone https://github.com/holujs/holu.git
cd holu
npm i
```

## Custom HTTP Error Handler

This example demonstrates how to **replace the default `HttpErrorHandler`** with a custom implementation that returns structured JSON error responses.

### What you'll learn

- How to create a custom `HttpErrorHandler` that controls HTTP error responses
- How to use `CustomError` with specific HTTP status codes, log levels, and error codes
- How the custom handler differs from the default: it includes `requestId` and `timestamp` in every error response, and hides internal error details for unexpected errors (security best practice)
- How to register and export the custom handler via `providersPerRou` + `exports`

### Key files

| File | Purpose |
|------|---------|
| `src/app/my-http-error-handler.ts` | Custom `HttpErrorHandler` implementation |
| `src/app/errors.controller.ts` | Controller with routes that trigger different error types |
| `src/app/app.module.ts` | Root module that registers the custom handler |

### Routes

| Route | Status | Description |
|-------|--------|-------------|
| `GET /` | 200 | Success response |
| `GET /not-found` | 404 | Throws `CustomError` with code `RESOURCE_NOT_FOUND` |
| `GET /validation-error` | 422 | Throws `CustomError` with code `VALIDATION_ERROR` |
| `GET /unexpected-error` | 500 | Throws plain `Error` — handler hides the internal message |

## Running the example

Start the server:

```bash
cd examples/02*
npm start
```

From another terminal:

```bash
# Success response
curl -s localhost:3000 | jq
# { "message": "OK" }

# CustomError → 404 with error code
curl -s localhost:3000/not-found | jq
# { "error": "Resource not found", "code": "RESOURCE_NOT_FOUND", "requestId": "...", "timestamp": "..." }

# CustomError → 422 with error code
curl -s localhost:3000/validation-error | jq
# { "error": "Invalid email format", "code": "VALIDATION_ERROR", "requestId": "...", "timestamp": "..." }

# Plain Error → 500 with generic message (internal details hidden)
curl -s localhost:3000/unexpected-error | jq
# { "error": "Internal server error", "requestId": "...", "timestamp": "..." }
```
