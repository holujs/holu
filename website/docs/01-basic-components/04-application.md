---
sidebar_position: 4
---

# Застосунок

Holu дозволяє писати застосунки з різними архітектурними стилями:

- [REST][1]
- [REST testing][2]
- [tRPC][3]
- **GraphQL**
- **WebSockets**
- **Microservices**
- ...

[Holu надає API][4], що дозволяє додати підтримку необхідної архітектури. Такі пакети являють собою цілі **платформи**, оскільки вони не є звичайними модулями фіч — вони мають ще й **клас застосунку** та **клас ініціалізатора застосунку**, в яких прописано конфіг застосунку, послідовність збірки застосунку і т.д. Як правило, кожен із таких пакетів платформи має свої особливості щодо метаданих їхніх модулів. Окрім цього, якщо вебсервер застосунку має свої особливості роботи для різних **Runtimes** (Node, Bun, Deno і т.п.), Holu дозволяє це враховувати саме на етапі ініціалізації класу застосунку.

Інстанс **класу застосунку**, як правило, створюється у файлі `main.ts`, і з нього починається робота застосунку. Наприклад, наступним чином створюється інстанс класу REST-застосунку:

```ts {4} title="src/main.ts"
import { RestApplication } from '@holu/rest';
import { AppModule } from './app/app.module.js';

const app = await RestApplication.create(AppModule);
app.server.listen(3000, '0.0.0.0');
```

## Граційне завершення роботи {#graceful-shutdown}

Holu підтримує граційне завершення роботи (Graceful Shutdown), що дозволяє застосунку припинити прийом нових HTTP-запитів, дочекатися завершення обробки активних запитів, виконати завдання з очищення ресурсів у синглтон-сервісах і вийти без втрати даних.

### Увімкнення перехоплення сигналів {#enabling-shutdown-hooks}

Щоб активувати граційне завершення роботи, викличте метод `enableShutdownHooks()` на інстансі застосунку. Ви можете передати туди необов'язковий масив системних сигналів (наприклад, `SIGTERM`, `SIGINT`).

```ts {5} title="src/main.ts"
import { RestApplication } from '@holu/rest';
import { AppModule } from './app/app.module.js';

const app = await RestApplication.create(AppModule);
app.enableShutdownHooks();
app.server.listen(3000, '0.0.0.0');
```

За замовчуванням прослуховуються такі сигнали: `['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGUSR2', 'SIGQUIT']`.

### Хуки життєвого циклу {#lifecycle-hooks}

Сервіси, що зареєстровані як синглтони (наприклад, `providersPerApp` або `providersPerMod`), можуть реалізовувати хуки життєвого циклу для очищення ресурсів:

1. **`BeforeShutdown`**: Викликається перед тим, як HTTP-сервер почне закриватися. Чудово підходить для сповіщення фонових завдань про зупинку.
2. **`OnShutdown`**: Викликається після того, як HTTP-сервер повністю закрився. Чудово підходить для закриття пулів з'єднань баз даних, клієнтів Redis тощо.

Обидва хуки отримують як параметр системний сигнал, що спричинив завершення роботи, і можуть повертати `void` або `Promise<void>`.

```ts title="src/app/my.service.ts"
import { BeforeShutdown, OnShutdown, injectable } from '@holu/core';

@injectable()
export class MyService implements BeforeShutdown, OnShutdown {
  beforeShutdown(signal?: string) {
    console.log(`Отримано ${signal}. Зупиняємо фонові процеси...`);
  }

  async onShutdown(signal?: string) {
    console.log(`Закриваємо з'єднання з базою даних...`);
    await this.db.close();
  }
}
```

### Очищення з'єднань (REST) {#connection-draining}

У пакеті `@holu/rest` при отриманні сигналу завершення:
1. Вебсервер негайно перестає приймати нові TCP-з'єднання (`server.close()`).
2. Усі неактивні keep-alive з'єднання відразу закриваються.
3. Активним з'єднанням дається час на завершення обробки поточних запитів.
4. Якщо активні з'єднання не закриваються самостійно протягом часу `shutdownTimeout` (за замовчуванням 15 секунд), вони закриваються примусово.

Ви можете налаштувати тайм-аут завершення з'єднань `shutdownTimeout` (у мілісекундах) через `AppOptions` у вашому кореневому модулі:

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
