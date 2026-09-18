## Body Parser

This example demonstrates how to parse HTTP request bodies using the `@holu/body-parser` module, including JSON, URL-encoded, and multipart file uploads with Multer.

### What you'll learn

- How to configure `BodyParserModule` with custom options
- How to access the parsed body using `@ctx(HTTP_BODY)` decorator
- How to handle multipart file uploads with `MulterParser` (request-scoped)
- How to handle file uploads with `RouteScopedMulterParser` (route-scoped)
- The difference between request-scoped and route-scoped approaches

### Routes

| Route | Method | Description |
|---|---|---|
| `/` | GET | Returns a greeting message |
| `/` | POST | Echoes back the JSON body |
| `/file-upload` | GET | Renders an HTML file upload form |
| `/file-upload` | POST | Handles multipart file upload |
| `/route-scoped` | GET | Same greeting (route-scoped controller) |
| `/route-scoped` | POST | Echoes back JSON body (route-scoped) |
| `/route-scoped-file-upload` | GET | File upload form (route-scoped) |
| `/route-scoped-file-upload` | POST | File upload handler (route-scoped) |

## Prerequisites

If you haven't installed dependencies yet:

```bash
yarn install
```

## Running

```bash
cd examples/06*
yarn start
```

From a second terminal, send JSON as POST:

```bash
curl -i localhost:3000 -d '{"one":1}' -H 'content-type: application/json'
```

To try uploading files via the HTML form, go to [http://localhost:3000/file-upload](http://localhost:3000/file-upload) in your browser. Uploaded files will appear in the `uploaded-files/` folder.

## Project structure

```
src/
├── main.ts                                    # Application entry point
└── app/
    ├── app.module.ts                          # Root module, imports BodyParserModule
    └── upload/
        ├── upload.module.ts                   # Upload feature module with Multer config
        ├── request-scoped.controller.ts       # Request-scoped controller
        ├── request-scoped.controller.spec.ts  # Unit tests
        ├── route-scoped.controller.ts         # Route-scoped controller
        ├── route-scoped.controller.spec.ts    # Unit tests
        └── utils.ts                           # File saving and HTML form helpers
```

## Testing

```bash
yarn test
```

For more info, see [@holu/body-parser](https://holujs.github.io/en/rest-application/official-modules/body-parser/).
