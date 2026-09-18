## Nested Routes

This example demonstrates how to build **nested (hierarchical) routes** in Holu using the `appends` option to compose modules into a URL tree.

### What you'll learn

- How to nest modules with `appends` and path parameters (`:postId`, `:commentId`)
- How nested path segments combine into full URLs like `/api/posts/:postId/comments/:commentId`
- How to apply multiple `@route` decorators to a single controller method
- How to access path parameters via `@ctx(PATH_PARAMS)`

### Routes

| Route                                        | Response                                |
| -------------------------------------------- | --------------------------------------- |
| `GET /api/posts`                             | `{ pathParams: {} }`                    |
| `GET /api/posts/:postId`                     | `{ pathParams: { postId } }`            |
| `GET /api/posts/:postId/comments`            | `{ pathParams: { postId } }`            |
| `GET /api/posts/:postId/comments/:commentId` | `{ pathParams: { postId, commentId } }` |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running

Start the server:

```bash
cd examples/05*
yarn start
```

From another terminal:

```bash
curl -i localhost:3000/api/posts
curl -i localhost:3000/api/posts/123
curl -i localhost:3000/api/posts/123/comments
curl -i localhost:3000/api/posts/123/comments/456
```

## Project structure

```
src/
  main.ts                                    # Application entry point
  app/
    app.module.ts                            # Root module — appends PostsModule at posts/:postId
    posts/
      posts.module.ts                        # PostsModule — appends CommentsModule at comments/:commentId
      posts.controller.ts                    # Controller handling GET /posts and GET /posts/:postId
      posts.controller.spec.ts               # Unit test
      comments/
        comments.module.ts                   # CommentsModule — leaf module
        comments.controller.ts               # Controller handling GET /comments and GET /comments/:commentId
        comments.controller.spec.ts          # Unit test
e2e/
  main.spec.ts                               # End-to-end tests
```

## Testing

Run all tests (E2E + unit):

```bash
cd examples/05*
yarn test
```
