# Holu

*Holu* is a Hawaiian word for "to move, to stir into motion" — and that's the idea behind this framework: **set your server-side applications in motion** on Node.js, powered by DI, TypeScript, and true modularity.

[![npm latest](https://img.shields.io/npm/v/@holu/core/latest.svg?label=npm)](https://www.npmjs.com/package/@holu/core/v/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English docs](https://holujs.github.io/en/) · [Українська документація](https://holujs.github.io/)

---

## What makes Holu different

Most Node.js frameworks give you routing and middleware. Holu gives you a full application architecture:

| Feature | Holu |
|---|---|
| TypeScript-first, native ESM | ✅ |
| Hierarchical DI (4 levels) | ✅ |
| True modularity with collision detection | ✅ |
| Extension system (pre-request hooks) | ✅ |
| REST and tRPC support | ✅ |
| OpenAPI generation | ✅ |

### Hierarchical Dependency Injection

Providers are registered at four nested levels: **App → Module → Route → Request**. Child injectors inherit from parents; each level stays isolated. No global state, no leakage between modules.

```ts
@restModule({
  providersPerMod: [DatabaseService],   // shared across all routes in this module
  providersPerReq: [RequestLogger],     // fresh instance per request
})
export class UsersModule {}
```

### True Modularity

Modules declare exactly what they export. If two imported modules export the same token, the framework detects the collision at startup — no silent overrides.

```ts
@restModule({
  imports: [{ path: 'admin', module: AdminModule, guards: [AuthGuard] }],
  providersPerMod: [SharedService],
  exports: [SharedService],
})
export class ApiModule {}
```

### Extension System

Extensions run once at startup — before any request handler is created. They build routes, push interceptors dynamically, generate OpenAPI docs, or open DB connections. All async, ordered, and composable.

```ts
@injectable()
export class DbExtension implements Extension<void> {
  constructor(@inject(PROVIDERS_PER_APP) private providersPerApp: Provider[]) {}

  async stage1(): Promise<void> {
    const db = await createDbConnection();
    this.providersPerApp.push({ token: DbClient, useValue: db });
  }
}
```

### Quick start

```bash
npx @holu/cli new my-app
cd my-app
npm start:dev
```

Or a minimal single file:

```ts
import { RestApplication, controller, route, restRootModule } from '@holu/rest';

@controller()
class HelloController {
  @route('GET', 'hello')
  hello() {
    return 'Hello, World!';
  }
}

@restRootModule({ controllers: [HelloController] })
class AppModule {}

const app = await RestApplication.create(AppModule);
app.server.listen(3000);
```

---

## Ecosystem

| Package | Description |
|---|---|
| `@holu/core` | DI, modules, extensions |
| `@holu/cli` | CLI for scaffolding and development |
| `@holu/rest` | REST HTTP layer |
| `@holu/trpc` | tRPC support |
| `@holu/openapi` | OpenAPI 3.x generation |
| `@holu/authjs` | [Auth.js](https://authjs.dev/) support |
| `@holu/typeorm` | [TypeORM](https://typeorm.io/) support |
| `@holu/body-parser` | Request body parsing |
| `@holu/cors` | CORS support |
| `@holu/jwt` | JWT authentication |
| `@holu/schedule` | Cron/interval/timeout tasks |
| `@holu/i18n` | Internationalization |
| `@holu/session-cookie` | Session management |
| `@holu/sentry` | Sentry error reporting |
| `@holu/rest-testing` | Testing utilities |

---

## Benchmarks

[Benchmarks vs other Node.js frameworks][4]

![Benchmarks for backend frameworks on the JavaScript stack][10]

---

## Contributing

This monorepo uses Yarn workspaces.

```bash
corepack enable && corepack install
yarn install && yarn prepare && yarn build
```

Run any example in dev mode:

```bash
cd examples/01-hello-world
yarn start
```

Preview English docs:

```bash
yarn docs-en
```

Docs live in `website/i18n/en/docusaurus-plugin-content-docs/current/`.

[4]: https://github.com/holujs/vs-webframework
[10]: https://github.com/holujs/vs-webframework/blob/main/req-per-sec-frameworks4.png
