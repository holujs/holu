---
sidebar_position: 1
---

# @holu/trpc {#holutrpc}

Модуль `@holu/trpc` забезпечує інтеграцію з [@trpc/server][1]. Готовий приклад застосунку з `@holu/trpc` можна [проглянути у репозиторії Holu][2]. Там ви можете знайти приклади застосування ґардів та інтерсепторів.

## Швидкий старт {#quick-start}

Ви також можете скористатись моно-репозиторієм, в якому є мінімальний код для швидкого старту:

```bash
git clone --depth 1 https://github.com/holujs/trpc-monorepo-starter.git
```

## Як формуються типи для клієнта на рівні модуля {#how-client-types-are-formed-at-the-module-level}

Holu намагається бути прозорим для `@trpc/client` надаючи можливість TypeScript виводити типи зі статичного коду, без необхідності додаткової компіляції для клієнта. Кожен модуль, що надає конфігурацію для tRPC-роутера, повинен це робити у методі `getRouterConfig()`:

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

Тут `ModuleWithTrpcRoutes` - це інтерфейс, який гарантує наявність методу `getRouterConfig()` у даному модулі.

В даному прикладі, показано конфіг, на основі якого буде створено:

1. роут `post.createPost`, за який відповідатиме метод контролера - `PostController.prototype.createPost`;
2. група роутів `post.comments`, за який відповідатиме імпортований модуль - `CommentModule.prototype.getRouterConfig`. Можна здогадатись, що `CommentModule` має свій метод `getRouterConfig()`, в якому вже уточнюється які саме контролери створюють певні роути.

Зверніть увагу, що тут створюється тип `PostRouter` для tRPC-клієнта. Це рекомендується робити для кожного невкладеного(!) модуля, щоб пом'якшити [проблеми з TypeScript-перформенсом][3], коли він виводить типи зі складних моделей. Але пам'ятайте, що такі типи не будуть коректно працювати для вкладених модулів. У даному прикладі `CommentModule` є вкладеним, тому для нього не доцільно робити `export type CommentsRouter = RouterOf<typeof CommentsModule>`.

Також ви можете централізовано виводити єдиний тип для змердженого tRPC-роутера на рівні застосунку, але це рекомендується робити лише у випадку, якщо у вас немає планів створювати складні моделі, аналізуючи які TypeScript буде "помирати". Щоб централізовано вивести єдиний роутер на увесь застосунок, треба скористатись `AppRouterHelper`:

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

Зверніть увагу, що у `AppRouterHelper` передається не просто масив імпортованих модулів, а цей масив ще й позначено за допомогою `as const` - це важлива умова, без якої `AppRouterHelper` працюватиме некоректно.

Також зверніть увагу на інтерфейс `TrpcRootModule`, який вимагає обов'язкового впровадження методу `setAppRouterOptions()`, також опціонально можна імплементувати `setTrpcCreateOptions()`. Коли ваш метод `setAppRouterOptions()` повертає конфіг для роутера, ви не зможете передати опцію `createContext`, оскільки Holu автоматично створює контекст у вигляді об'єкту `{ req, res }` щоб гарантувати доступність цих змінних в контексті. Звичайно ж, в процедурах ви можете додавати будь-які інші властивості контекста.

## Як формуються типи для клієнта на рівні метода контролера {#how-client-types-are-formed-at-the-controller-method-level}

Кожен метод контролера, що створює роут, повинен мати декоратор `trpcRoute` та повинен поверти tRPC-процедуру:

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

Тобто, якщо вам достатньо користуватись перевагами DI на рівні роуту (а не на рівні HTTP-запиту), то ваш код буде мало відрізнятись від стандартного tRPC-коду. Практично єдина відмінність лише у тому, що вам початкову процедуру потрібно брати із `TrpcRouteService`, як показано у даному прикладі. До речі, `TrpcRouteService` можна вказувати тип контексту та інпуту - `TrpcRouteService<SomeContext, SomeInput>`. Майте на увазі, що якщо ви збираєтесь у коді писати `routeService.procedure.input(...)`, то вам не потрібно передавати другий дженерік, бо типи інпутів будуть конфліктувати. Другий дженерік є сенс використовувати у парі з `routeService.procedureAfterInput`, який варто використовувати у випадку, якщо валідацію ви робите автоматично в інтерсепторах, а не безпосередньо у коді роуту.

Окрім `TrpcRouteService`, у параметрах методу контролера ви можете запитувати будь-який інший сервіс на рівні роуту, причому порядок параметрів не має значення:

```ts {4}
@trpcController()
export class PostController {
  @trpcRoute()
  createPost(service1: Service1, service2: Service2, routeService: TrpcRouteService) {
    // ...
  }
}
```

У випадку, якщо вам потрібно буде використовувати ґарди чи інтерсептори, вам достатньо їх додати відповідно у перший та другий масив у декораторі `trpcRoute`:

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

## Як користуватись типами роутера на клієнті {#how-to-use-router-types-on-the-client}

Як було сказано вище, щоб пом'якшити [проблеми з TypeScript-перформенсом][3], рекомендується виводити тип для кожного невкладеного(!) модуля. Під "невкладеним модулем" мається на увазі той модуль, який безпосередньо імпортується у кореневий модуль. Отже, під час створення клієнта, рекомендується використовувати узагальнений тип для роутера - `createTRPCClient<AnyTRPCRouter>()`, а потім уточнювати тип для кожного окремого модуля:

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

## Використання DI для провайдерів на рівні HTTP-запиту {#using-di-for-providers-at-the-http-request-level}

Коли ви пишете наступний код, DI вам забезпечить роботу провайдерів на рівні роуту:

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

В даному прикладі, DI вирішить залежність для `Service1`, `Service2` та `TrpcRouteService` на рівні роуту. Якщо ж ви хочете щоб DI працював також на рівні HTTP-запиту, вам треба зробити три кроки:

1. Створити [ClassFactoryProvider][4], який буде працювати на рівні запиту.
2. Передати новостворений провайдер до DI на рівні запиту.
3. Використати новостворений провайдер з одним із методів `TrpcRouteService`, ім'я якого має префікс `di` (наприклад, `diQuery`, `diMutation` і т.д.).

Давайте пройдемо ці кроки разом.

### Крок перший {#step-one}

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

Зверніть увагу, що на рівні методу даний провайдер має декоратор, причому не важливо який саме, головне, щоб він створювався за допомогою відповідних Holu-хелперів.

### Крок другий {#step-two}

Найпростіше передати `ClassFactoryProvider` до DI - за допомогою хелпера `ProviderBuilder`:

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

До речі, в даному прикладі провайдери передаються у метадані контролера, але їх також можна передавати і у метадані модуля на рівні запиту.

Метод `providers.useFactories()` автоматично сканує наявність методів з декораторами у переданому класі, і для кожного методу створює відповідний провайдер. Наприклад, якщо ви передаєте `providers.useFactories(PostService)`, і у `PostService` є три методи з декораторами на рівні методу, то `providers.useFactories(PostService)` передасть до DI приблизно такі провайдери:

```ts
[
  { useFactory: [PostService, PostService.prototype.method1] },
  { useFactory: [PostService, PostService.prototype.method2] },
  { useFactory: [PostService, PostService.prototype.method3] },
]
```

### Крок третій {#step-three}

Після того, як провайдери передані до DI, їх можна використовувати у наступній формі:

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

Тобто, метод `routeService.diQuery()` приймає метод сервіса, що працюватиме на рівні HTTP-запиту, а DI у реєстрі шукає провайдера з таким токеном, і повертає його значення. В такому разі, під час кожного запиту буде створюватись інстанс `PostService` та викликатись його метод `method1`.

DI-методи повертають типізовані tRPC-процедури, зберігаючи тип інпуту, тип результату методу сервісу та тип помилки tRPC. Тип інпуту береться з другого дженеріка `TrpcRouteService` або з переданого парсера для методів `diInputAndQuery()` і `diInputAndMutation()`.

[1]: https://trpc.io/docs/quickstart
[2]: https://github.com/holujs/holu/tree/main/examples/18-trpc-server
[3]: https://github.com/trpc/trpc/discussions/2448
[4]: /basic-components/dependency-injection/#injector-and-providers
