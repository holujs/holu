---
sidebar_position: 1
---

# @holu/trpc {#holutrpc}

The `@holu/trpc` module provides integration with [@trpc/server][1]. A ready-made example of an application with `@holu/trpc` can be [found in the Holu repository][2]. There you can find examples of using guards and interceptors.

## Quick start {#quick-start}

You can also use the monorepository, which contains minimal code for a quick start:

```bash
git clone --depth 1 https://github.com/holujs/trpc-monorepo-starter.git
```

## How client types are formed at the module level {#how-client-types-are-formed-at-the-module-level}

Holu strives to be transparent for `@trpc/client`, allowing TypeScript to infer types from static code without the need for additional compilation for the client. Each module that provides configuration for the tRPC router must do so in the `getRouterConfig()` method:

```ts {8,16-21}
import { ModuleWithTrpcRoutes, trpcRootModule } from '@holu/trpc';
import { RouterOf } from '@holu/trpc/client';

import { CommentModule } from './comments/comment.module.js';
import { PostController } from './post.controller.js';

// For TRPCClient
export type PostRouter = RouterOf<typeof PostModule>;

@trpcRootModule({
  imports: [CommentModule],
  controllers: [PostController],
})
export class PostModule implements ModuleWithTrpcRoutes {
  getRouterConfig() {
    return {
      post: {
        createPost: PostController.prototype.createPost, // Pointed to a controller
        comments: CommentModule.prototype.getRouterConfig, // Pointed to a module
      },
    };
  }
}
```

Here, `ModuleWithTrpcRoutes` is an interface that guarantees the presence of the `getRouterConfig()` method in the module.

In this example, the config is shown, based on which the following will be created:

1. the route `post.createPost`, which will be handled by the controller method - `PostController.prototype.createPost`;
2. the route group `post.comments`, which will be handled by the imported module - `CommentModule.prototype.getRouterConfig`. One can assume that `CommentModule` has its own `getRouterConfig()` method, where it specifies which controllers create certain routes.

Note that here the `PostRouter` type is created for the tRPC client. It is recommended to do this for each non-nested (!) module to mitigate [TypeScript performance issues][3] when it infers types from complex models. But remember that such types will not work correctly for nested modules. In this example, `CommentModule` is nested, so it is not advisable to create `export type CommentsRouter = RouterOf<typeof CommentsModule>` for it.

You can also centrally infer a single type for the merged tRPC router at the application level, but this is recommended only if you do not plan to create complex models that would cause TypeScript to “struggle” when analyzing them. To centrally infer a single router for the entire application, you should use `AppRouterHelper`:

```ts {8-9,12}
import { trpcRootModule, type SetAppRouterOptions, type TrpcCreateOptions, type TrpcRootModule } from '@holu/trpc';
import type { AppRouterHelper } from '@holu/trpc/client';

import { PostModule } from '#post/post.module.js';
import { AuthModule } from '#auth/auth.module.js';
import { MessageModule } from '#message/message.module.js';

const modulesWithTrpcRoutes = [AuthModule, PostModule, MessageModule] as const;
export type AppRouter = AppRouterHelper<typeof modulesWithTrpcRoutes>;

@trpcRootModule({
  imports: [...modulesWithTrpcRoutes],
})
export class AppModule implements TrpcRootModule {
  setTrpcCreateOptions(): TrpcCreateOptions {
    return {
      // Passing options for initTRPC.create()
    };
  }

  setAppRouterOptions(): SetAppRouterOptions {
    return {
      basePath: '/trpc/',
    };
  }
}
```

Note that in `AppRouterHelper`, not just an array of imported modules is passed, but the array is also marked with `as const` — this is an important condition without which `AppRouterHelper` will not work correctly.

Also note the `TrpcRootModule` interface, which requires mandatory implementation of the `setAppRouterOptions()` method, and optionally you can implement `setTrpcCreateOptions()`. When your `setAppRouterOptions()` method returns a router config, you cannot pass the `createContext` option, because Holu automatically creates the context as an object `{ req, res }` to guarantee availability of these variables in the context. Of course, in procedures you can add any other context properties.

## How client types are formed at the controller method level {#how-client-types-are-formed-at-the-controller-method-level}

Each controller method that creates a route must have the `trpcRoute` decorator and must return a tRPC procedure:

```ts {8-10}
import { trpcController, TrpcRouteService, trpcRoute } from '@holu/trpc';
import { z } from 'zod';

@trpcController()
export class PostController {
  @trpcRoute()
  createPost(routeService: TrpcRouteService) {
    return routeService.procedure.input(z.object({ title: z.string() })).mutation(({ input }) => {
      return { ...input, id: 1, body: 'post text' };
    });
  }
}
```

That is, if you only need to use the benefits of DI at the route level (and not at the HTTP request level), your code will differ little from standard tRPC code. The only practical difference is that you must take the initial procedure from `TrpcRouteService`, as shown in this example. By the way, `TrpcRouteService` can specify the context and input type — `TrpcRouteService<SomeContext, SomeInput>`. Keep in mind that if you plan to write `routeService.procedure.input(...)`, you do not need to pass the second generic, because input types will conflict. The second generic makes sense to use in combination with `routeService.procedureAfterInput`, which should be used in case you perform validation automatically in interceptors rather than directly in the route code.

In addition to `TrpcRouteService`, you can request any other service at the route level in the controller method parameters, and the order of parameters does not matter:

```ts {4}
@trpcController()
export class PostController {
  @trpcRoute()
  createPost(service1: Service1, service2: Service2, routeService: TrpcRouteService) {
    // ...
  }
}
```

If you need to use guards or interceptors, you just need to add them to the first and second arrays in the `trpcRoute` decorator, respectively:

```ts {9}
import { trpcController, TrpcRouteService, trpcRoute } from '@holu/trpc';
import { z } from 'zod';

import { BearerGuard } from '../auth/bearer.guard.js';
import { MyInterceptor } from './my.interceptor.js';

@trpcController()
export class PostController {
  @trpcRoute([BearerGuard], [MyInterceptor])
  createPost(routeService: TrpcRouteService) {
    return routeService.procedure.input(z.object({ title: z.string() })).mutation(({ input }) => {
      return { ...input, id: 1, body: 'post text' };
    });
  }
}
```

## How to use router types on the client {#how-to-use-router-types-on-the-client}

As mentioned above, to mitigate [TypeScript performance issues][3], it is recommended to infer the type for each non-nested (!) module. A "non-nested module" means a module that is directly imported into the root module. Therefore, when creating a client, it is recommended to use a generic type for the router — `createTRPCClient<AnyTRPCRouter>()`, and then refine the type for each specific module:

```ts
import type { AnyTRPCRouter } from '@trpc/server';
import { createTRPCClient, TRPCClient } from '@trpc/client';
import type { PostRouter } from 'server'; // You can give this name in your monorepo

const trpc = createTRPCClient<AnyTRPCRouter>({
  // ...
});

const postClient = trpc as TRPCClient<PostRouter>;
const post = await postClient.post.createPost.mutate({ title: 'hello client' });
```

## Using DI for Providers at the HTTP Request Level {#using-di-for-providers-at-the-http-request-level}

When you write the following code, DI will provide route-level providers for you:

```ts
@trpcController()
export class PostController {
  constructor(service1: Service1) {}

  @trpcRoute()
  listPosts(service2: Service2, routeService: TrpcRouteService) {
    return routeService.procedure.query(() => this.service1.messages);
  }
}
```

In this example, DI will resolve the dependencies for `Service1`, `Service2`, and `TrpcRouteService` at the route level. However, if you want DI to also work at the HTTP request level, you need to take three steps:

1. Create a [ClassFactoryProvider][4] that works at the request level.
2. Pass the newly created provider to DI at the request level.
3. Use the newly created provider with one of the `TrpcRouteService` methods whose name has the `di` prefix (for example, `diQuery`, `diMutation`, etc.).

Let’s go through these steps together.

### Step One {#step-one}

```ts
import { injectable, factoryMethod } from '@holu/core';
import { opts, TrpcOpts } from '@holu/trpc';

import { DbService } from '#db/db.service.js';
import { InputPost } from '#models/post.js';


@injectable()
export class PostService {
  @factoryMethod()
  method1(@opts opts: TrpcOpts<any, InputPost>, db: DbService) {
    // ...
    return posts;
  }
}
```

Note that at the method level, this provider has a decorator, and it doesn’t matter which one specifically — the important part is that it is created using the appropriate Holu helpers.

### Step Two {#step-two}

The easiest way to pass a `ClassFactoryProvider` to DI is by using the `ProviderBuilder` helper:

```ts {6}
import { trpcController } from '@holu/trpc';
import { ProviderBuilder } from '@holu/core';
import { PostService } from '#post/post.service.js';
// ...
@trpcController({
  providersPerReq: new ProviderBuilder().useFactories(PostService),
})
export class PostController {
  // ...
}
```

By the way, in this example, the providers are passed into the controller metadata, but they can also be passed into the module metadata at the request level.

The `providers.useFactories()` method automatically scans for methods with decorators in the given class and creates a provider for each such method. For example, if you pass `providers.useFactories(PostService)` and `PostService` has three methods with method-level decorators, then `providers.useFactories(PostService)` will pass to DI approximately the following providers:

```ts
[
  { useFactory: [PostService, PostService.prototype.method1] },
  { useFactory: [PostService, PostService.prototype.method2] },
  { useFactory: [PostService, PostService.prototype.method3] },
]
```

### Step Three {#step-three}

Once the providers are passed to DI, they can be used in the following form:

```ts {7}
import { TrpcRouteService, trpcRoute } from '@holu/trpc';
import { PostService } from '#post/post.service.js';
//...
export class PostController {
  @trpcRoute()
  listPosts(routeService: TrpcRouteService) {
    return routeService.diQuery(PostService.prototype.method1);
  }
}
```

That is, the `routeService.diQuery()` method accepts a service method that will operate at the HTTP request level, while DI looks up a provider with such a token in the registry and returns its value. In this case, for each request an instance of `PostService` will be created and its `method1` method will be invoked.

DI methods return typed tRPC procedures, preserving the input type, the service method's return type, and the tRPC error type. The input type comes from the second `TrpcRouteService` generic parameter or from the supplied parser for `diInputAndQuery()` and `diInputAndMutation()`.

[1]: https://trpc.io/docs/quickstart
[2]: https://github.com/holujs/holu/tree/main/examples/18-trpc-server
[3]: https://github.com/trpc/trpc/discussions/2448
[4]: /basic-components/dependency-injection/#injector-and-providers
