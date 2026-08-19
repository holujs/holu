---
sidebar_position: 2
---

# Aspect-декоратори

:::warning
Якщо для передачі метаданих до модуля ви легко можете обійтись [динамічним модулем][1], використовуйте саме їх. Створювати aspect-декоратори варто лише тоді, коли можливостей динамічних модулів недостатньо.
:::

:::info Примітка щодо термінології
Термін «aspect» у Holu **запозичений**, але **не ідентичний** аспектам у класичному [аспектно-орієнтованому програмуванні (AOP)][4]. У традиційному AOP аспекти перехоплюють виконання методів через join points, pointcuts та advice (before/after/around), вплітаючи наскрізну поведінку безпосередньо в потік виконання.

Аспекти Holu працюють на іншому рівні: вони поширюють **наскрізні метадані та конфігурацію** по графу залежностей модулів під час ініціалізації. Це означає, що вони розділяють ключові ідеї AOP — відокремлення наскрізних задач, прозоре застосування поведінки до багатьох модулів — але не надають перехоплення методів під час виконання, join points чи advice.

Коротко кажучи, якщо класичний AOP — це 10/10, аспекти Holu відповідають приблизно на **6/10**: вони вирішують ту саму категорію проблем (наскрізні задачі), але через поширення метаданих на рівні модулів, а не через runtime-вплітання коду. Майте на увазі цю відмінність, щоб не очікувати тут повного інструментарію AOP.
:::

Головне обмеження динамічних модулів полягає в тому, що вони жорстко обмежені типами конфігурації базових декораторів, і їхня дія є локальною. Вони не здатні рекурсивно застосовувати додаткові динамічні опції до модулів, які вони самі імпортують.

Натомість aspect-декоратори надають хуки, які беруть активну участь у **рекурсивному імпорті та експорті** модулів, провайдерів та динамічних опцій для них по всьому дереву залежностей. Ось що саме дозволяють робити aspect-декоратори, чого **неможливо** досягти за допомогою динамічних модулів:

- **Рекурсивне поширення динамічних опцій**: Коли ви передаєте кастомні опції (наприклад, префікс маршруту `path`) через aspect-декоратори, ці опції автоматично поширюються вниз по дереву на всі імпортовані дочірні модулі.
  
  Наприклад, динамічні модулі жорстко обмежені базовими декораторами (`@rootModule`, `@featureModule`). Навіть якщо обдурити TypeScript і передати кастомний параметр `path`, базові декоратори його просто проігнорують, і динамічний модуль не зможе рекурсивно застосувати його до будь-яких імпортованих ним дочірніх модулів:
  ```ts
  @rootModule({
    // Базовий декоратор проігнорує параметр 'path', і він не потрапить до імпортованих дочірніх модулів
    imports: [{ module: SomeModule, path: 'api' } as any]
  })
  export class AppModule {}
  ```
  З аспектом хуки фреймворку самостійно обходять ієрархію модулів. Опція `path: 'api'` буде застосована не лише до `SomeModule`, а і всіх модулів, що імпортуються у `SomeModule` — і все це без необхідності змінювати їхній код:
  ```ts
  @restAspect({
    imports: [{ module: SomeModule, path: 'api' }]
  })
  @rootModule()
  export class AppModule {}
  ```

- **Формування архітектурного контексту**: Аспекти можуть застосувати єдиний архітектурний контекст (наприклад, REST або tRPC) до цілого дерева звичайних модулів (з простим `@featureModule()`). Завдяки цьому ваші модулі фіч залишаються максимально універсальними.

**Aspect-декоратори** — це кастомні декоратори, які застосовуються до класів модулів, щоб передавати метадані з розширеними типами даних. Вони можуть виступати або як повноцінні декоратори модуля (для кореневого модуля чи модуля фіч), або як модифікатори, що розширюють вже оголошений модуль.

Оскільки ці декоратори приймають метадані модуля з розширеним типом, їм потрібен механізм для нормалізації та валідації переданих метаданих. Саме для цього існує базовий клас **`ModuleAspectHandler`**.

Коли ви створюєте аспект за допомогою `Reflector.makeClassDecorator()`, ви передаєте йому функцію-трансформер. Цей трансформер повинен повертати інстанс класу, який розширює `ModuleAspectHandler`:

```ts {24-26,46,50}
import {
  ModuleAspectHandler,
  ModuleAspectDecorator,
  Reflector,
  StaticAspectOptions,
  DynamicModuleOptions,
  BaseNormalizedModuleMeta,
  NormalizedModuleMeta,
  RootModuleOptions,
} from '@holu/core';
// ...

/**
 * Об'єкт цього типу буде передано безпосередньо декоратору aspect - @someAspect({ one: 1, two: 2 })
 */
interface MyStaticAspectOptions extends StaticAspectOptions<DynamicAspectOptions> {
  one?: number;
  two?: number;
}

/**
 * Методи цього класу нормалізуватимуть та перевірятимуть метадані модуля.
 */
class AspectHandler extends ModuleAspectHandler<MyStaticAspectOptions> {
  // ...
}

/**
 * Об'єкт цього типу буде передано в метаданих модуля як динамічний модуль.
 */
interface DynamicAspectOptions extends DynamicModuleOptions {
  path?: string;
  num?: number;
}

/**
 * Модульні аспекти перетворюють об'єкт MyStaticAspectOptions на об'єкт цього типу.
 */
interface MyNormalizedModuleMeta extends BaseNormalizedModuleMeta {
  normalizedModuleMeta: NormalizedModuleMeta;
  aspectDecoratorOptions: RootModuleOptions;
}

function transformAspectOptions(data?: MyStaticAspectOptions): ModuleAspectHandler<MyStaticAspectOptions> {
  const metadata = Object.assign({}, data);
  const aspectHandler = new AspectHandler(metadata);
  aspectHandler.moduleRole = undefined;
  // OR aspectHandler.moduleRole = 'root';
  // OR aspectHandler.moduleRole = 'feature';
  return aspectHandler;
}

// Створення декоратора аспектів
const someAspect: ModuleAspectDecorator<MyStaticAspectOptions, DynamicAspectOptions, MyNormalizedModuleMeta> =
  Reflector.makeClassDecorator(transformAspectOptions);

// Використання декоратора аспектів
@someAspect({ one: 1, two: 2 })
export class SomeModule {}
```

[Готовий приклад створення aspect-декоратора][2] можна знайти в тестах репозиторія Holu. Окрім цього, можна проглянути на більш складний, але і більш повний приклади [створення aspect-декораторів (restRootModule, restModule та restAspect)][3], які знаходяться у модулі `@holu/rest`.

## Взаємодія з кореневим модулем та модулем фіч {#interaction-with-root-and-feature-modules}

Залежно від ролі, визначеної через властивість `moduleRole` класу `ModuleAspectHandler` (що повертається функцією-трансформером), aspect-декоратори взаємодіють з базовими декораторами - `rootModule` та `featureModule` - по-різному:

- **Декоратори-замінники**: коли `moduleRole` дорівнює `'root'` або `'feature'`, відповідні декоратори виступають у ролі повноцінних декораторів модуля (наприклад, `@restRootModule` або `@restModule`). Клас, анотований ними, не потребує додаткового використання `@featureModule` чи `@rootModule`. Фреймворк автоматично розпізнає їхню роль і опрацьовує їх.
- **Декоратори-модифікатори**: коли `moduleRole` дорівнює `undefined`, відповідні декоратори лише модифікують/розширюють метадані. Таким декораторам рекомендується давати закінчення `Aspect` (наприклад, `@restAspect`, `@trpcAspect`). Клас, анотований ними, **обов'язково** повинен мати базовий декоратор модуля або декоратор-замінник. Якщо базовий декоратор модуля відсутній, фреймворк кине помилку `MissingModuleDecorator`.

Кілька декораторів-модифікаторів можна застосовувати одночасно до одного класу модуля (наприклад, для додавання метаданих REST або tRPC до одного й того самого модуля).

## Групування aspect-декораторів через `decoratorId` {#grouping-aspect-decorators}

При створенні декоратора-замінника (з роллю `'root'` або `'feature'`) за допомогою `Reflector.makeClassDecorator()`, ви **обов'язково** повинні передати базовий декоратор-модифікатор (наприклад, `restAspect`) як третій аргумент. Цей третій аргумент працює як `decoratorId`. Він вказує Holu, що ці декоратори належать до однієї групи, дозволяючи фреймворку правильно збирати, нормалізувати та пов'язувати метадані з відповідним контекстом групи під час ініціалізації.

## Кастомізація ModuleAspectHandler {#customizing-inithooks}

Базовий клас `ModuleAspectHandler` надає кілька властивостей життєвого циклу та методів, які ви можете перевизначити для керування обробкою метаданих.

### Відокремлення модуля фіч від aspect-декоратора {#separation-of-feature-module-and-aspect-decorator-using-hostmodule}

Відокремлення оголошення хендлера aspect-декоратора від хост-модуля фіч є необхідністю для уникнення циклічних залежностей (оскільки декоратор імпортує модуль, а декорування хост-модуля ним самим створило б цикл імпорту). Продовжуючи наш попередній приклад:

1. Створіть стандартний модуль фіч (наприклад, `MyLibModule`), що містить усі необхідні розширення, дефолтні провайдери та сервіси.
2. Оновіть ваш підклас `ModuleAspectHandler` (`AspectHandler`), встановивши `override hostModule = MyLibModule`.
3. Створіть нову функцію-трансформер, яка встановлює `handler.moduleRole = 'feature'` (або `'root'`).
4. Створіть декоратор-замінник (наприклад, `myFeatureModule`) за допомогою `Reflector.makeClassDecorator()`, передавши трансформер, ім'я та базовий декоратор-модифікатор (`someAspect`) як третій аргумент (`decoratorId`).
5. Коли розробники застосовуватимуть цей декоратор (наприклад, `@myFeatureModule`), фреймворк розпізнаватиме його як декоратор модуля (потребуючи лише одного декоратора на класі замість двох) та автоматично імпортуватиме `MyLibModule`.

Ось як це виглядає:

```ts {12}
import { featureModule, Reflector } from '@holu/core';

// 1. Стандартний модуль, що містить реальну логіку/провайдери
@featureModule({
  providersPerReq: [MyService],
  exports: [MyService],
})
export class MyLibModule {}

// 2. Кастомний хендлер, що встановлює hostModule (оновлюємо наш AspectHandler з попереднього прикладу)
class AspectHandler extends ModuleAspectHandler<MyStaticAspectOptions> {
  override hostModule = MyLibModule;
}

// 3. Створення трансформера, який встановлює moduleRole = 'feature'
function transformFeatureMeta(data?: any) {
  const handler = new AspectHandler(data);
  handler.moduleRole = 'feature'; // Робить його декоратором-замінником модуля
  return handler;
}

// 4. Створення декоратора-замінника, передаючи someAspect (з попереднього прикладу) як 3-й аргумент
export const myFeatureModule = Reflector.makeClassDecorator(transformFeatureMeta, 'myFeatureModule', someAspect);

// 5. Використання лише одного декоратора на класі (автоматично імпортує MyLibModule)
@myFeatureModule()
export class MyFeatureModule {}
```

## Опції імпортованих динамічних модулів {#imported-dynamic-module-options}

Під час імпорту динамічного модуля в контексті aspect-декоратора:

1. Кастомні параметри (такі як `path` або `guards`) автоматично додаються в Map, використовуючи у якості ключа декоратор-aspect:
    ```ts
    dynamicModule.dynamicAspectOptionsMap.set(aspectDecorator, { path: 'some-path' });
    ```
2. Якщо імпортований модуль має лише `@featureModule` (без aspect-декораторів), фреймворк отримує дефолтний клас aspect для цього декоратора з контексту застосунку, клонує його, реєструє у `moduleAspectsMap` модуля та викликає метод `normalize()`.
3. Це забезпечує коректну обробку кастомних опцій (таких як REST префікси маршрутів та гарди), навіть при імпорті стандартних модулів фіч, які не мають кастомних анотацій aspect-декораторів.

[1]: /basic-components/modules/#DynamicModule
[2]: https://github.com/holujs/holu/blob/main/packages/core/src/init/module-normalizer.spec.ts
[3]: https://github.com/holujs/holu/blob/main/packages/rest/src/decorators/rest-module-aspects.ts
[4]: https://uk.wikipedia.org/wiki/%D0%90%D1%81%D0%BF%D0%B5%D0%BA%D1%82%D0%BD%D0%BE-%D0%BE%D1%80%D1%96%D1%94%D0%BD%D1%82%D0%BE%D0%B2%D0%B0%D0%BD%D0%B5_%D0%BF%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D1%83%D0%B2%D0%B0%D0%BD%D0%BD%D1%8F
