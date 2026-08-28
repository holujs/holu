---
sidebar_position: 4
---

# Application

Holu allows you to write applications using different architectural styles:

- [REST][1]
- [REST testing][2]
- [tRPC][3]
- **GraphQL**
- **WebSockets**
- **Microservices**
- ...

[Holu provides an API][4] that allows adding support for the required architecture. Such packages represent entire **platforms**, since they go beyond ordinary feature modules — they also include an **application class** and an **application initializer class**, where the application configuration, the application build sequence, etc. are defined. As a rule, each of these platform packages has its own specifics regarding the metadata of their modules. In addition, if the application's web server has its own specifics of operation for different **Runtimes** (Node, Bun, Deno, etc.), Holu allows taking this into account precisely at the stage of initializing the application class.

An instance of the **application class** is typically created in the `main.ts` file, and the application starts working from there. For example, an instance of a REST application class is created as follows:

```ts {4} title="src/main.ts"
import { RestApplication } from '@holu/rest';
import { AppModule } from './app/app.module.js';

const app = await RestApplication.create(AppModule);
app.server.listen(3000, '0.0.0.0');
```

## Graceful Shutdown {#graceful-shutdown}

Holu supports graceful shutdown, allowing the application to close HTTP connections, stop accepting new requests, wait for active requests to finish, and run cleanup tasks in singleton services before exiting.

### Enabling Shutdown Hooks {#enabling-shutdown-hooks}

To enable graceful shutdown, call `enableShutdownHooks()` on the application instance. You can optionally pass an array of system signals (e.g., `SIGTERM`, `SIGINT`).

```ts {5} title="src/main.ts"
import { RestApplication } from '@holu/rest';
import { AppModule } from './app/app.module.js';

const app = await RestApplication.create(AppModule);
app.enableShutdownHooks();
app.server.listen(3000, '0.0.0.0');
```

By default, the following signals are listened to: `['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGUSR2', 'SIGQUIT']`.

### Lifecycle Hooks {#lifecycle-hooks}

Services registered as singletons (e.g., `providersPerApp` or `providersPerMod`) can implement lifecycle hooks to perform cleanups:

1. **`BeforeShutdown`**: Executed before the HTTP server begins to close. Ideal for notifying background tasks to stop.
2. **`OnShutdown`**: Executed after the HTTP server is closed. Ideal for closing database pools, redis clients, etc.

Both hooks receive the triggered system signal as a parameter and can return `void` or `Promise<void>`.

```ts title="src/app/my.service.ts"
import { BeforeShutdown, OnShutdown, injectable } from '@holu/core';

@injectable()
export class MyService implements BeforeShutdown, OnShutdown {
  beforeShutdown(signal?: string) {
    console.log(`Received ${signal}. Stopping background jobs...`);
  }

  async onShutdown(signal?: string) {
    console.log(`Closing database connections...`);
    await this.db.close();
  }
}
```

### Connection Draining (REST) {#connection-draining}

In `@holu/rest`, when a shutdown signal is received:
1. The server stops accepting new connections immediately (`server.close()`).
2. All idle keep-alive connections are immediately closed.
3. Active connections are allowed to finish their current requests.
4. If active connections do not close within `shutdownTimeout` (default 15 seconds), they are forcefully closed.

You can configure `shutdownTimeout` (in milliseconds) via `AppOptions` in your root module:

```ts
import { AppOptions } from '@holu/core';
import { RestModule } from '@holu/rest';

@rootModule({
  imports: [RestModule],
  providersPerApp: [
    { token: AppOptions, useValue: { shutdownTimeout: 20000 } }
  ]
})
export class AppModule {}
```

[1]: /rest-application/rest-module/
[2]: /rest-application/official-modules/testing/
[3]: /trpc-application/trpc-module/
[4]: /deep-dive/application-workflow/
