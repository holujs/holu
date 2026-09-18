## Prerequisites

If you haven't prepared the examples repository yet, you can do so:

```bash
git clone https://github.com/holujs/holu.git
cd holu
yarn install
```

## HTTP interceptors

Start from first terminal:

```bash
cd examples/08*
yarn start
```

From second terminal:

```bash
curl -i localhost:3000
```

The interceptor modifies the response body by wrapping the original message:

```json
{"originalMsg":"Original message!","msg":"message that attached by interceptor"}
```

If the response has already been sent (e.g. due to an error), the interceptor logs the status code instead.

