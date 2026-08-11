---
sidebar_position: 0
title: "@holu/rest"
---

# @holu/rest

Як видно з назви, модуль `@holu/rest` забезпечує підтримку [REST][0]. Він містить зокрема:

- [aspect-декоратори][4] для кореневого модуля та модуля фіч - `restRootModule`, `restModule`;
- розширення, які забезпечують створення REST-роутів - `RestRouteExtension`, `DispatcherExtension`;
- роутер, що має наступний тип:

```ts
interface Router {
  on(method: HttpMethod, path: string, handle: RouteHandler): this;
  all(path: string, handle: RouteHandler): this;
  find(method: HttpMethod, path: string): RouteMatch;
}

type RouteHandler = (
  rawReq: RawRequest,
  rawRes: RawResponse,
  params: PathParam[],
  queryString: any
) => Promise<void>;

class RouteMatch {
  handle: RouteHandler | null;
  params: PathParam[] | null;
}

interface PathParam {
  key: string;
  value: string;
}
```

Готовий приклад використання даного модуля можна знайти в прикладах [репозиторія Holu][1].

## Встановлення та підключення {#installation-and-importing}

Встановлення:

```bash
npm i @holu/rest
```

Підключення:

```ts
import { restModule } from '@holu/rest';

@restModule({
  // ..
})
export class AppModule {}
```

## Інтеграція кастомного роутера {#custom-router-integration}

Якщо ви хочете інтегрувати кастомний роутер для застосунку Holu, достатньо щоб ваш роутер імплементував вищезазначений інтерфейс `Router`, після чого його можна додавати в провайдери на рівні застосунку:

```ts
import { restModule, Router } from '@holu/rest';
import { MyRouter } from './my-router.js';

@restModule({
  providersPerApp: [{ token: Router, useClass: MyRouter }],
})
export class MyCustomRouterModule {}
```

## `RestRouteExtension` {#route-extension}

З даного модуля експортується `RestRouteExtension`. Дане розширення повертає метадані з інтерфейсом [`Array<RouteExtensionMeta>`][2] - це масив динамічних метаданих, які призначені для створення обробників запитів. Кожен елемент цього масиву - це окремий роут.

## `DispatcherExtension` {#request-dispatcher-extension}

З даного модуля також експортується `DispatcherExtension`. Дане розширення використовує метадані, які повертає `RestRouteExtension`, щоб створювати обробники HTTP-запитів.

[0]: https://uk.wikipedia.org/wiki/REST
[1]: https://github.com/holujs/holu/tree/main/examples/01-hello-world
[2]: https://github.com/holujs/holu/blob/v0.1.2/packages/rest/src/types/types.ts#L21-L27
[3]: https://github.com/holujs/holu/blob/v0.1.2/packages/body-parser/src/body-parser.extension.ts#L46
[4]: /deep-dive/module-aspects/
