---
slug: /
sidebar_position: 0
---

# What is Holu

## Introduction to Holu {#introduction-to-holu}

Holu is a Node.js-based web framework designed for building highly extensible and fast applications. *Holu* is a Hawaiian word for "to run" — and that's what this framework helps you do: **run scalable server-side applications** on Node.js, powered by DI, TypeScript, and true modularity.

### Key Features of Holu {#key-features-of-holu}

- **Modular architecture** with decorators, enabling declarative application structure definition.
- Support for creating custom extensions (sometimes referred to as plugins) that can initialize asynchronously and depend on one another.
- Built-in **OpenAPI** support with request validation based on OpenAPI metadata.
- As of today, [Holu is one of the fastest Node.js web frameworks][14]:

![JS frameworks benchmarks][22]

Some architectural concepts in Holu are inspired by [Angular][9], with its DI system built on Angular's native DI module.

## Prerequisites {#prerequisites}

Please make sure that Node.js >= v24.0.0 is installed on your operating system.

## Installation {#installation}

You can install the `@holu/cli` package globally:

```bash
npm i -g @holu/cli
```

To see the list of all available commands and options of `@holu/cli`, run:

```bash
holu --help
```

Or to see the help for a specific command (e.g., `new` or `start`):

```bash
holu new --help
holu start --help
```

This is how you can create a starter REST application project:

```bash
holu new my-app
```

You can also use `@holu/cli` without a global installation:

```bash
npx @holu/cli new my-app
```

### Add `AGENTS.md` and `SKILL.md` for AI agents {#add-agent-skills}

The file [AGENTS.md][3] is intended for AI agents and should be placed in the root directory of the repository. This file will be taken into account by the AI agent every time you interact with the agent. To copy the latest version of `AGENTS.md`, run the following command:

```bash
cd my-app # Go to starter repository
npm run setup:agents
```

Additionally, you can install [AI agent skills][5] to help them better understand the specifics of Holu applications:

```bash
npx skills add https://github.com/holujs/agent-skills --skill '*' -y
```

AI agent skills are only loaded when needed, when you ask something relevant to them.

## Start in Development Mode {#start-in-development-mode}

You can start the application in development mode with the following command:

```bash
npm run start:dev
```

Or directly via Holu CLI (if you have installed `@holu/cli` globally):

```bash
holu start
```

The `@holu/cli` utility automatically handles incremental TypeScript compilation and restarts the Holu application whenever source files are changed, eliminating the need to run separate compiler and server terminals.

You can customize the startup behavior using options:

- `-d, --debug [hostport]` — runs Node.js in debug mode with the `--inspect` flag.
- `--verbose` — shows verbose progress of TypeScript Project References compilation.
- `--restart-delay <ms>` — delay in milliseconds before restarting the server after successful compilation (default is `300`).
- `--watch-assets <globs...>` — non-TypeScript asset globs to watch and copy to `dist/` on changes.

You can check the server operation using `curl`:

```bash
curl -i localhost:3000/api/hello
```

Or simply by going to [http://localhost:3000/api/hello](http://localhost:3000/api/hello) in your browser.

By default, the application works with `info` log level. You can change it in the file `src/app/app.module.ts` (or `apps/backend/src/app/app.module.ts` in the monorepository).

Thanks to [holu/rest-starter][2]'s use of the so-called [Project References][16] and `tsc -b` build mode, even very large projects compile very quickly.

Note that there are four config files for TypeScript in the `holu/rest-starter` repository:

- `tsconfig.json` - the basic configuration used by your IDE (in most cases it is probably VS Code).
- `tsconfig.build.json` - this configuration is used to compile the code from the `src` directory to the `dist` directory, it is intended for application code.
- `tsconfig.unit.json` - this configuration is used to compile unit tests.
- `tsconfig.e2e.json` - this configuration is used to compile end-to-end tests.

Also, note that since `holu/rest-starter` is declared as an EcmaScript Module (ESM), you can use [native Node.js aliases][18] to shorten file paths. This is analogous to `compilerOptions.paths` in `tsconfig`. Such aliases are declared in `package.json` in the `imports` field:

```json {2}
"imports": {
  "#app/*": "./dist/app/*"
},
```

Now you can use it, for example in the `e2e` folder, like this:

```ts
import { AppModule } from '#app/app.module.js';
```

At the moment (2025-10-07) TypeScript does not yet fully support these aliases, so it is advisable to duplicate them in the `tsconfig.json` file:

```json {6}
// ...
{
  "compilerOptions": {
    // ...
    "paths": {
      "#app/*": ["./src/app/*"]
    }
  }
}
```

Note that in `package.json` the aliases point to `dist`, while in `tsconfig.json` they point to `src`.

## Start in product mode {#start-in-product-mode}

The application is compiled and the server is started in product mode using the command:

```bash
npm run build
npm run start-prod
```

## Entry file for Node.js {#entry-file-for-nodejs}

After [installing Holu starter][1], the first thing you need to know: all the application code is in the `src` folder, it is compiled using the TypeScript utility `tsc`, after compilation it goes to the `dist` folder, and then as JavaScript code it can be executed in Node.js.

Let's look at the `src/main.ts` file:

```ts
import { ServerOptions } from 'node:http';
import { RestApplication } from '@holu/rest';

import { AppModule } from './app/app.module.js';
import { checkCliAndSetPort } from './app/utils/check-cli-and-set-port.js';

const serverOptions: ServerOptions = { keepAlive: true, keepAliveTimeout: 5000 };
const app = await RestApplication.create(AppModule, { serverOptions, path: 'api' });
const port = checkCliAndSetPort(3000);
app.server.listen(port, '0.0.0.0');
```

After compilation, it becomes `dist/main.js` and becomes the entry point for running the application in production mode, and so why you will specify it as an argument to Node.js:

```bash
node dist/main.js
```

Looking at the file `src/main.ts`, you can see that an instance of the class `RestApplication` is created, and as an argument for the method `create()` is passed `AppModule`. Here `AppModule` is the root module to which other application modules then imports.

## ExpressJS vs. Holu {#expressjs-vs-holu}

For comparison, the following examples demonstrate the minimal code needed to start applications with ExpressJS and Holu.

```js
import express from 'express';
const app = express();

app.get('/hello', function (req, res) {
  ctx.send('Hello, World!');
});

app.listen(3000, '0.0.0.0');
```

```ts
import { controller, route, restRootModule, RestApplication } from '@holu/rest';

@controller()
class ExampleController {
  @route('GET', 'hello')
  tellHello() {
    return 'Hello, World!';
  }
}

@restRootModule({ controllers: [ExampleController] })
class AppModule {}

const app = await RestApplication.create(AppModule);
app.server.listen(3000, '0.0.0.0');
```

But why isn’t Holu as minimalistic as ExpressJS? As you can see in the example, ExpressJS creates an application object, to which routes are then added. The `app` object represents the API of various separate components, including router configuration, error handling setup, rendering system configuration, HTTP server setup, etc. Such code looks very compact in simple examples, but in essence, it violates the [Single Responsibility Principle][21]. In contrast, Holu clearly distinguishes between:

- the role of the controller in which the route is created;
- the role of the module where the controllers are declared;
- the role of the application that contains the HTTP server.

Looking at the amount of code, you might think that Holu is slower than ExpressJS because of its verbosity. But in fact, only Holu's cold start is slightly slower (it starts in 34 ms on my laptop, while ExpressJS starts in 4 ms). As for request processing speed, [Holu is ~30% faster than ExpressJS][14].

More application examples are available in the [Holu][4] repository, as well as in the [RealWorld][13] repository.

P.S. Although a link to a repository with all the necessary settings for Holu applications is provided above, still, if you want to use only the code from the previous example, do not forget to specify the following in the tsconfig files:

```json {4-5}
{
  "compilerOptions": {
    // ...
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

[1]: #installation
[2]: https://github.com/holujs/rest-starter
[3]: https://github.com/holujs/agent-skills/blob/main/AGENTS.md
[4]: https://github.com/holujs/holu/tree/main/examples
[5]: https://agentskills.io/home
[9]: https://github.com/angular/angular
[10]: https://jestjs.io/en/
[12]: https://en.wikipedia.org/wiki/Singleton_pattern
[13]: https://github.com/holujs/realworld
[14]: https://github.com/holujs/vs-webframework
[16]: https://www.typescriptlang.org/docs/handbook/project-references.html
[17]: https://github.com/TypeStrong/ts-node
[18]: https://nodejs.org/api/packages.html#imports
[21]: https://en.wikipedia.org/wiki/Single-responsibility_principle
[22]: https://raw.githubusercontent.com/holujs/vs-webframework/refs/heads/main/req-per-sec-frameworks4.png
