---
sidebar_position: 2
---

# Mixin-декоратори

:::warning
Якщо для передачі метаданих до модуля ви легко можете обійтись [динамічним модулем][1], використовуйте саме їх. Створювати міксини варто лише тоді, коли можливостей динамічних модулів недостатньо.
:::

Головне обмеження динамічних модулів полягає в тому, що вони жорстко обмежені типами конфігурації базових декораторів, і їхня дія є локальною. Вони не здатні рекурсивно застосовувати додаткові динамічні опції до модулів, які вони самі імпортують.

Натомість mixin-декоратори надають хуки, які беруть активну участь у **рекурсивному імпорті та експорті** модулів, провайдерів та динамічних опцій для них по всьому дереву залежностей. Ось що саме дозволяють робити міксини, чого **неможливо** досягти за допомогою динамічних модулів:

- **Рекурсивне поширення динамічних опцій**: Коли ви передаєте кастомні опції (наприклад, префікс маршруту `path`) через міксини, ці опції автоматично поширюються вниз по дереву на всі імпортовані дочірні модулі.
  
  Наприклад, динамічні модулі жорстко обмежені базовими декораторами (`@rootModule`, `@featureModule`). Навіть якщо обдурити TypeScript і передати кастомний параметр `path`, базові декоратори його просто проігнорують, і динамічний модуль не зможе рекурсивно застосувати його до будь-яких імпортованих ним дочірніх модулів:
  ```ts
  @featureModule({
    // Базовий декоратор проігнорує параметр 'path', і він не потрапить до імпортованих дочірніх модулів
    imports: [{ module: SomeModule, path: 'api' } as any]
  })
  export class AppModule {}
  ```
  З міксином хуки фреймворку самостійно обходять ієрархію модулів. Опція `path: 'api'` буде прозоро застосована не лише до `SomeModule`, а й до `ChildModule` та всіх модулів, що імпортуються глибше по ланцюжку — і все це без необхідності змінювати їхній код:
  ```ts
  @mixinRest({
    imports: [{ module: SomeModule, path: 'api' }]
  })
  @rootModule()
  export class AppModule {}
  ```

- **Формування архітектурного контексту**: Завдяки рекурсивному поширенню хуків, міксини здатні огортати ціле дерево незалежних модулів фіч (з простим `@featureModule()`) у єдиний архітектурний контекст (наприклад, REST або tRPC). Це дозволяє залишати ваші модулі фіч максимально універсальними.

**Mixin-декоратори** — це кастомні декоратори, які застосовуються до класів модулів, щоб передавати метадані з розширеними типами даних. Залежно від налаштувань, міксин може виступати в трьох ролях:

1. Як декоратор для оголошення **кореневого модуля** (наприклад, `restRootModule`).
2. Як декоратор для оголошення **модуля фіч** (наприклад, `restModule`).
3. Як **декоратор-модифікатор** для розширення вже оголошеного модуля. Таким декораторам рекомендується давати префікс `mixin*` (наприклад, `mixinRest`, `mixinTrpc`). Одразу декілька модифікаторів можна застосовувати до одного класу модуля.

Оскільки ці декоратори приймають метадані модуля з розширеним типом, їм потрібен механізм для нормалізації та валідації переданих метаданих. Саме для цього існує базовий клас **`ModuleMixinHandler`**.

Коли ви створюєте міксин за допомогою `Reflector.makeClassDecorator()`, ви передаєте йому функцію-трансформер. Цей трансформер повинен повертати інстанс класу, який розширює `ModuleMixinHandler` — він і буде виступати в ролі обробника метаданих для вашого декоратора:

```ts {24-26,46,50}
import {
  ModuleMixinHandler,
  MixinDecorator,
  Reflector,
  StaticMixinOptions,
  DynamicModuleOptions,
  BaseNormalizedModuleMeta,
  NormalizedModuleMeta,
  RootModuleOptions,
} from '@holu/core';
// ...

/**
 * Об'єкт цього типу буде передано безпосередньо декоратору mixin - @mixinSome({ one: 1, two: 2 })
 */
interface MyStaticMixinOptions extends StaticMixinOptions<DynamicMixinOptions> {
  one?: number;
  two?: number;
}

/**
 * Методи цього класу нормалізуватимуть та перевірятимуть метадані модуля.
 */
class SomeModuleMixin extends ModuleMixinHandler<MyStaticMixinOptions> {
  // ...
}

/**
 * Об'єкт цього типу буде передано в метаданих модуля як динамічний модуль.
 */
interface DynamicMixinOptions extends DynamicModuleOptions {
  path?: string;
  num?: number;
}

/**
 * Модульні міксини перетворюють об'єкт MyStaticMixinOptions на об'єкт цього типу.
 */
interface MyNormalizedModuleMeta extends BaseNormalizedModuleMeta {
  normalizedModuleMeta: NormalizedModuleMeta;
  mixinDecoratorOptions: RootModuleOptions;
}

function transformMixinOptions(data?: MyStaticMixinOptions): ModuleMixinHandler<MyStaticMixinOptions> {
  const metadata = Object.assign({}, data);
  const moduleMixin = new SomeModuleMixin(metadata);
  moduleMixin.moduleRole = undefined;
  // OR moduleMixin.moduleRole = 'root';
  // OR moduleMixin.moduleRole = 'feature';
  return moduleMixin;
}

// Створення декоратора міксинів
const mixinSome: MixinDecorator<MyStaticMixinOptions, DynamicMixinOptions, MyNormalizedModuleMeta> =
  Reflector.makeClassDecorator(transformMixinOptions);

// Використання декоратора міксинів
@mixinSome({ one: 1, two: 2 })
export class SomeModule {}
```

[Готовий приклад створення mixin-декоратора][2] можна знайти в тестах репозиторія Holu. Окрім цього, можна проглянути на більш складний, але і більш повний приклади [створення mixin-декораторів (restRootModule, restModule та mixinRest)][3], які знаходяться у модулі `@holu/rest`.

## Взаємодія з кореневим модулем та модулем фіч {#interaction-with-root-and-feature-modules}

Залежно від ролі, визначеної через властивість `moduleRole` класу `ModuleMixinHandler` (що повертається функцією-трансформером), mixin-декоратори взаємодіють з базовими декораторами - `rootModule` та `featureModule` - по-різному:

- **Декоратори-замінники**: коли `moduleRole` дорівнює `'root'` або `'feature'`, відповідні декоратори виступають у ролі повноцінних декораторів модуля. Клас, анотований ними (наприклад, `@restRootModule` або `@restModule`), не потребує додаткового використання `@featureModule` чи `@rootModule`. Фреймворк автоматично розпізнає їхню роль і опрацьовує їх.
- **Декоратори-модифікатори**: коли `moduleRole` дорівнює `undefined`, відповідні декоратори лише модифікують/розширюють метадані. Клас, анотований ними (наприклад, `@mixinRest`), **обов'язково** повинен мати базовий декоратор модуля або декоратор-замінник. Якщо базовий декоратор модуля відсутній, фреймворк кине помилку `MissingModuleDecorator`.

Кілька декораторів-модифікаторів можна застосовувати одночасно до одного класу модуля (наприклад, для додавання метаданих REST або tRPC до одного й того самого модуля).

## Групування mixin-декораторів через `decoratorId` {#grouping-mixin-decorators}

При створенні декоратора-замінника (з роллю `'root'` або `'feature'`) за допомогою `Reflector.makeClassDecorator()`, ви **обов'язково** повинні передати базовий декоратор-модифікатор (наприклад, `mixinRest` або `mixinSome`) як третій аргумент. Цей третій аргумент працює як `decoratorId`. Він вказує Holu, що ці декоратори належать до однієї групи, дозволяючи фреймворку правильно збирати, нормалізувати та пов'язувати метадані з відповідним контекстом групи під час ініціалізації.

## Кастомізація ModuleMixinHandler {#customizing-inithooks}

Базовий клас `ModuleMixinHandler` надає кілька властивостей життєвого циклу та методів, які ви можете перевизначити для керування обробкою метаданих.

### Відокремлення модуля фіч від mixin-декоратора {#separation-of-feature-module-and-mixin-decorator-using-hostmodule}

Відокремлення оголошення mixin-декораторів від хост-модуля фіч є необхідністю для уникнення циклічних залежностей (оскільки декоратор імпортує модуль, а декорування хост-модуля ним самим створило б цикл імпорту):

1. Спочатку створіть стандартний модуль фіч (наприклад, `MyLibModule`), що містить усі необхідні розширення, дефолтні провайдери та сервіси.
2. Потім оголосіть свій кастомний підклас `ModuleMixinHandler`, встановивши `override hostModule = MyLibModule`.
3. Створіть базовий декоратор-модифікатор `mixin*` (наприклад, `mixinSome`), який слугуватиме у якості ID для групи декораторів.
4. Створіть функцію-трансформер, яка повертає інстанс хуків і встановлює `hooks.moduleRole = 'feature'` (або `'root'`).
5. Створіть декоратор-замінник (наприклад, `myFeatureModule`) за допомогою `Reflector.makeClassDecorator()`, передавши трансформер першим аргументом, ім'я другим, а базовий декоратор-модифікатор (`mixinSome`) третім аргументом (як ID групи).
6. Коли розробники застосовуватимуть цей декоратор (наприклад, `@myFeatureModule`), фреймворк розпізнаватиме його як декоратор модуля (потребуючи лише одного декоратора на класі замість двох) та автоматично імпортуватиме `MyLibModule`.

Ось приклад:

```ts {12}
import { featureModule, ModuleMixinHandler, Reflector } from '@holu/core';

// 1. Стандартний модуль, що містить реальну логіку/провайдери
@featureModule({
  providersPerReq: [MyService],
  exports: [MyService],
})
export class MyLibModule {}

// 2. Кастомні хуки, що встановлюють hostModule
class MyModuleMixin extends ModuleMixinHandler {
  override hostModule = MyLibModule;
}

// 3. Створення базового декоратора-модифікатора (служить батьківським декоратором групи)
export const mixinSome = Reflector.makeClassDecorator((data) => new MyModuleMixin(data), 'mixinSome');

// 4. Створення трансформера, який встановлює moduleRole = 'feature'
function transformFeatureMeta(data?: any) {
  const hooks = new MyModuleMixin(data);
  hooks.moduleRole = 'feature'; // Робить його декоратором-замінником модуля
  return hooks;
}

// 5. Створення декоратора-замінника, передаючи mixinSome як 3-й аргумент
export const myFeatureModule = Reflector.makeClassDecorator(transformFeatureMeta, 'myFeatureModule', mixinSome);

// 6. Використання лише одного декоратора на класі (автоматично імпортує MyLibModule)
@myFeatureModule()
export class MyFeatureModule {}
```

## Опції імпортованих динамічних модулів {#imported-dynamic-module-options}

Під час імпорту динамічного модуля в контексті mixin-декоратора:

1. Кастомні параметри (такі як `path` або `guards`) автоматично додаються в Map, використовуючи у якості ключа декоратор-mixin:
    ```ts
    dynamicModule.mixinOptions.set(mixinDecorator, { path: 'some-path' });
    ```
2. Якщо імпортований модуль має лише `@featureModule` (без mixin-декораторів), фреймворк отримує дефолтний клас mixin для цього декоратора з контексту застосунку, клонує його, реєструє у `moduleMixinMap` модуля та викликає метод `normalize()`.
3. Це забезпечує коректну обробку кастомних опцій (таких як REST префікси маршрутів та гарди), навіть при імпорті стандартних модулів фіч, які не мають кастомних анотацій mixin-декораторів.

[1]: /basic-components/modules/#DynamicModule
[2]: https://github.com/holujs/holu/blob/main/packages/core/src/init/module-normalizer.spec.ts
[3]: https://github.com/holujs/holu/blob/main/packages/rest/src/decorators/rest-module-mixins.ts
