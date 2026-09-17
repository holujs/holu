## Prerequisites

If you haven't prepared the examples repository yet, you can do so:

```bash
git clone https://github.com/holujs/holu.git
cd holu
yarn install
```

## Logger

Start from first terminal:

```bash
cd examples/04*
yarn start
```

From second terminal:

```bash
curl -i localhost:3000
curl -i localhost:3000/winston
curl -i localhost:3000/bunyan
curl -i localhost:3000/pino
```

As you can see, there are examples for [bunyan][1], [pino][2] and [winston][3] loggers.
They work in one application, but in different modules.

[1]: https://github.com/trentm/node-bunyan
[2]: https://github.com/pinojs/pino
[3]: https://github.com/winstonjs/winston
