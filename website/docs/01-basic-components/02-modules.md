---
sidebar_position: 2
---

# Модулі

Одним з головних елементів архітектури Holu - є його модулі. Але чим хороша саме модульна архітектура? - Модульність дозволяє компонувати різні автономні елементи і складати з них масштабований застосунок. Саме завдяки автономності модулів, великі проекти простіше розробляти, тестувати, деплоїти та обслуговувати. Також модульність спрощує перехід на мікросервісну архітектуру, якщо в майбутньому ви приймете рішення, що ваш Holu-застосунок потребує горизонтального масштабування.

Модульна архітектура дозволяє ізолювати в одному модулі **декілька файлів коду**, що можуть мати різні ролі, але **спільну спеціалізацію**. Модуль можна порівняти з оркестром, в якому є різні інструменти, але усі вони створюють спільну музику. З іншого боку, потреба в ізоляції різних модулів виникає через те, що вони можуть мати різну спеціалізацію і через це - можуть заважати один-одному. Продовжуючи аналогію з людьми, якщо в одому кабінеті розмістити поліцію та музикантів, або брокерів і перекладачів, швидше за все, вони заважатимуть один-одному. Саме тому для модуля важлива **вузька спеціалізація**.

Модулі є найбільшими будівельними блоками застосунку, і в їхніх метаданих можуть декларуватись такі складові як:

- контролери, що приймають HTTP-запити та відправляють HTTP-відповіді;
- сервіси, де описується бізнес логіка застосунку;
- інтерсептори та ґарди, що дозволяють автоматизувати обробку HTTP-запитів по типовим патернам;
- декоратори та розширення, що дозволяють доповнювати застосунок новими правилами та новою поведінкою;
- інші класи, інтерфейси, хелпери, типи даних, що призначаються для роботи поточного модуля.

Модулі є двох типів:

1. Root module (кореневий модуль).
2. Feature module (модуль фіч). Найчастіше саме цей тип модуля використовується для публікації на npmjs.com.

## Кореневий модуль {#root-module}

До кореневого модуля підв'язуються інші модулі, він є єдиним на увесь застосунок, а його клас рекомендовано називати `AppModule`. TypeScript клас стає кореневим модулем Holu завдяки одному з таких декораторів як `rootModule`, `restRootModule`, `trpcRootModule` і т.д., в залежності від архітектурного стилю, який ви використовуєте. Наприклад, якщо ви використовуєте REST, кореневий модуль оголошується наступним чином:

```ts
import { restRootModule } from '@holu/rest';

@restRootModule()
export class AppModule {}
```

Загалом, в декоратор `restRootModule` можна передавати об'єкт з такими властивостями:

```ts
import { restRootModule } from '@holu/rest';

@restRootModule({
  imports: [], // Імпорт модулів
  appends: [], // Долучення модулів, що мають контролери
  providersPerApp: [], // Провайдери на рівні застосунку
  providersPerMod: [], //         ...на рівні модуля
  providersPerRou: [], //         ...на рівні роуту
  providersPerReq: [], //         ...на рівні HTTP запиту
  exports: [], // Експорт модулів та провайдерів з поточного модуля
  extensions: [], // Розширення
  extensionsMeta: {}, // Дані для роботи розширень
  resolvedCollisionsPerApp: [], // Вирішення колізій імпортованих класів на рівні застосунку
  resolvedCollisionsPerMod: [], //                                    ...на рівні модуля
  resolvedCollisionsPerRou: [], //                                    ...на рівні роуту
  resolvedCollisionsPerReq: [], //                                    ...на рівні HTTP запиту
  controllers: [], // Список контролерів в поточному модулі
})
export class AppModule {}
```

## Модуль фіч {#feature-module}

TypeScript клас стає feature модулем Holu завдяки одному з таких декораторів як `featureModule`, `restModule`, `trpcModule` і т.д., в залежності від архітектурного стилю, який ви використовуєте. Наприклад, якщо ви використовуєте REST, модуль фіч оголошується наступним чином:

```ts
import { restModule } from '@holu/rest';

@restModule()
export class SomeModule {}
```

Файли модулів рекомендується називати із закінченням `*.module.ts`, а назви їхніх класів - із закінченням `*Module`.

Він може містити точно такі самі метадані як і кореневі модулі, за виключенням властивості `resolvedCollisionsPerApp`. Окрім того, що feature module можна декларувати прямо у застосунку, його також можна публікувати на npmjs.com.

## Експорт, імпорт, долучення {#export-import-append}

Модуль, де ви декларуєте певні [провайдери][1], називається **модулем-хостом** для цих провайдерів. А коли ви використовуєте дані провайдери у зовнішньому модулі, то цей зовнішній модуль називається **модулем-споживачем** даних провайдерів.

Для того, щоб модуль-споживач міг використовувати провайдери з модуля-хоста, спочатку необхідно експортувати відповідні [токени][1] провайдерів з модуля-хоста. Робиться це у метаданих, які передаються у декоратор модуля фіч чи кореневого модуля. Наприклад, якщо ви використовуєте REST, це робиться наступним чином:

```ts {14}
import { restModule } from '@holu/rest';

import { Service1 } from './service1.js';
import { Service2 } from './service2.js';
import { Service3 } from './service3.js';

function useFactory(s2: Service2) {
  return; // ...
}

@restModule({
  providersPerApp: [Service1],
  providersPerReq: [Service2, { token: 'some-token', deps: [Service2], useFactory }],
  exports: ['some-token'],
})
export class Module1 {}
```

В даному прикладі, беручи до уваги експортовані токени, Holu буде шукати експортовані провайдери в масиві `providersPerReq`. Експортувати провайдери, що передаються у `providersPerApp`, не має сенсу, оскільки з цього масиву буде сформовано [інжектор][1] на рівні застосунку. Тобто провайдери з масиву `providersPerApp` будуть доступними для будь-якого модуля, на будь-якому рівні, і без експорту.

Оскільки з модуля-хоста вам потрібно експортувати лише токени провайдерів, а не самі провайдери, у властивість `exports` не можна безпосередньо передавати провайдери у формі об'єкта.

Майте на увазі, що з модуля-хоста потрібно експортувати лише ті провайдери, які безпосередньо будуть використовуватись у модулях-споживачах. У прикладі вище, провайдер із `some-token` залежить від `Service2`, але `Service2` не потрібно експортувати, якщо він безпосередньо не використовується у модулі-споживачу. Таким чином забезпечується інкапсуляція модулів.

Експортувати контролери не має сенсу, оскільки експорт стосується тільки провайдерів.

### Експорт провайдерів з модуля фіч {#exporting-providers-from-a-featuremodule}

Експортуючи токени з модуля-хоста, ви тим самим декларуєте, що відповідні провайдери можуть використовуватись у модулях-споживачах, якщо вони імпортуватимуть даний модуль-хост.

### Експорт провайдерів з кореневого модуля {#exporting-providers-from-rootmodule}

Експорт провайдерів з кореневого модуля означає, що ці провайдери будуть автоматично додаватись до кожного модуля, який оголошено у вашому застосунку. Разом з тим, ці провайдери не будуть додаватись до зовнішніх модулів, тобто до тих модулів, що ви ставите за допомогою пакетних менеджерів, типу npm, yarn і т.д. Наприклад, якщо ви використовуєте REST, це робиться наступним чином:

```ts {10}
import { restRootModule } from '@holu/rest';
import { BodyParserModule } from '@holu/body-parser';

import { Service1 } from './service1.js';
import { Module1 } from './module1.js';

@restRootModule({
  imports: [Module1, BodyParserModule],
  providersPerReq: [Service1],
  exports: [Service1, Module1],
})
export class AppModule {}
```

В даному випадку, `Service1` не буде додаватись до `BodyParserModule` (бо це зовнішній модуль), натомість буде додаватись до усіх інших модулів застосунку на рівні HTTP-запиту. Як бачите, експортувати можна також і цілі модулі. В даному разі, усі провайдери, що експортуються з `Module1`, також будуть додаватись до кожного модуля застосунку на відповідному рівні.

Інколи є потреба додавати цілий масив провайдерів, і щоб експортувати їхні токени, є хелпер `getTokens()`:

```ts {9}
import { restRootModule } from '@holu/rest';
import { getTokens } from '@holu/core';
import { defaultProviders } from './default-providers.js';

@restRootModule({
  providersPerReq: [...defaultProviders],
  exports: [...getTokens(defaultProviders)],
})
export class AppModule {}
```

Тут `defaultProviders` - це масив провайдерів, і якщо б ви цей масив спробували експортувати, ви б могли отримати помилку, якщо б там були провайдери у вигляді об'єкту. Треба експортувати лише токени провайдерів, тому і використовується `getTokens()`.

### Імпорт модуля {#import-module}

Імпортувати окремий провайдер в модуль не можна, але можна імпортувати цілий модуль з усіма провайдерами та [розширеннями][2], що експортуються з нього. Наприклад, якщо ви використовуєте REST, це робиться наступним чином:

```ts {6}
import { restModule } from '@holu/rest';
import { Module1 } from './module1.js';

@restModule({
  imports: [
    Module1
  ]
})
export class Module2 {}
```

Якщо з `Module1` експортується, наприклад, `Service1`, то тепер цей сервіс можна використовувати у `Module2`. Разом з тим, якщо `Module1` має контролери, у такій формі імпорту вони будуть ігноруватись. Щоб Holu брав до уваги контролери з імпортованого модуля, цей модуль потрібно імпортувати з префіксом, що передається у `path`:

```ts {6}
import { restModule } from '@holu/rest';
import { Module1 } from './module1.js';

@restModule({
  imports: [
    { module: Module1, path: '' }
  ]
})
export class Module2 {}
```

Хоча тут `path` має порожній рядок, але для Holu наявність `path` означає:

1. що потрібно брати до уваги також і контролери з імпортованого модуля;
2. використовувати `path` у якості префіксу для усіх контролерів, що імпортуються з `Module1`.

Як бачите, у попередньому прикладі імпортується на цей раз і не провайдер, і не модуль, а об'єкт. Цей об'єкт має наступний інтерфейс:

#### DynamicModule {#DynamicModule}

```ts
interface DynamicModule {
  id?: string;
  module: ModuleType<M>;
  /**
   * Providers per the application.
   */
  providersPerApp?: ProviderBuilder | Provider[] = [];
  /**
   * Providers per a module.
   */
  providersPerMod?: ProviderBuilder | Provider[] = [];
  /**
   * Providers per a route.
   */
  providersPerRou?: ProviderBuilder | Provider[] = [];
  /**
   * Providers per a request.
   */
  providersPerReq?: ProviderBuilder | Provider[] = [];
  /**
   * List of modules, `DynamicModule` or tokens of providers exported by this
   * module.
   */
  exports?: any[];
  /**
   * This property allows you to pass any information to extensions.
   *
   * You must follow this rule: data for one extension - one key in `extensionsMeta` object.
   */
  extensionsMeta?: E;
}
```

#### DynamicModuleWrapper {#DynamicModuleWrapper}

Окрім `DynamicModule`, в метадані модуля також можна передавати об'єкт з типом `DynamicModuleWrapper`:

```ts
interface DynamicModuleWrapper {
  dynamicModule: DynamicModule;
  module?: never;
}
```

Ця обгортка є критично важливою, коли ви імпортуєте **один і той самий** динамічний модуль у кількох аспектах і потребуєте різних налаштувань для кожного. Приклад декларативного використання:

```ts
const dynamicModule = SomeModule.forRoot();

@aspect1({
  imports: [
    { dynamicModule, option1: 'one' }
  ]
})
@aspect2({
  imports: [
    { dynamicModule, option2: 'two' }
  ]
})
class SomeModule {}
```

Програмна альтернатива:

```ts
const dynamicModule = SomeModule.forRoot();
dynamicModule.dynamicAspectOptionsMap ??= new Map();
dynamicModule.dynamicAspectOptionsMap.set(aspect1, { option1: 'one' });
dynamicModule.dynamicAspectOptionsMap.set(aspect2, { option2: 'two' });

@aspect1({ imports: [dynamicModule] })
@aspect2({ imports: [dynamicModule] })
class SomeModule {}
```

Щоб скоротити довжину запису при імпорті об'єкту з цим типом, інколи доцільно написати статичний метод у модулі, який імпортується. Щоб наочно побачити це, давайте візьмемо знову попередній приклад:

```ts {6}
import { restModule } from '@holu/rest';
import { Module1 } from './module1.js';

@restModule({
  imports: [
    { module: Module1, path: '' }
  ]
})
export class Module2 {}
```

Якщо б ви оголошували `Module1` і знали, що цей модуль є сенс імпортувати багато разів в різні модулі з різними префіксами, в такому разі в даному класі можна написати статичний метод, що повертає об'єкт, спеціально призначений для імпорту:

```ts
// ...
export class Module1 {
  static withPrefix(path: string) {
    return {
      module: this,
      path,
    };
  }
}
```

Тепер об'єкт, що повертає цей метод, можна імпортувати наступним чином:

```ts {4}
// ...
@restModule({
  imports: [
    Module1.withPrefix('some-prefix')
  ]
})
export class Module2 {}
```

Статичні методи дозволяють спрощувати передачу параметрів модулів.

Щоб TypeScript контролював, що саме повертає статичний метод для імпорту, рекомендується використовувати інтерфейс `DynamicModule`:

```ts
import { DynamicModule } from '@holu/core';
// ...
export class Module1 {
  static withOpts(someParams: SomeParams): DynamicModule<Module1> {
    return {
      module: this,
      // ...
    };
  }
}
```

#### Імпортуються класи чи інстанси класів? {#import-classes-or-class-instances}

Давайде розглянемо конкретну ситуацію. В наступному прикладі кожен із провайдерів є класом. Зверніть увагу, в які масиви передаються ці провайдери, і що саме експортується.

```ts
// ...
@restModule({
  providersPerReq: [Provider1],
  exports: [Provider1],
})
export class Module1 {}
```

Припустимо ми цей модуль будемо імпортувати у `Module2`, в якого своїх провайдерів немає:

```ts
// ...
@restModule({
  imports: [Module1],
  // ...
})
export class Module2 {}
```

В результаті такого імпорту, модуль-споживач (`Module2`) тепер матиме `Provider1` на рівні HTTP-запиту, тому що у модулі-хості (`Module1`) його оголошено на цьому рівні. Під час роботи з `Provider1`, його інстанси будуть створюватись окремо в обох модулях. Між модулями може бути спільним [одинак][3], тільки якщо його провайдер оголошено на рівні застосунку. В нашому прикладі провайдер оголошено на рівні HTTP-запиту, тому у `Module1` та `Module2` інстанси `Provider1` не будуть спільними на жодному із рівнів.

Отже можна стверджувати, що імпортуються класи, а не їхні інстанси.

### Долучення модуля {#appending-of-the-module}

Якщо ви використовуєте `@holu/rest` і вам не потрібно імпортувати провайдери та [розширення][2] в поточний модуль, а потрібно всього лиш долучати зовнішній модуль до path-префікса поточного модуля, можна скористатись масивом `appends`:

```ts {5}
import { restModule } from '@holu/rest';
import { Module1 } from './module1.js';

@restModule({
  appends: [Module1],
})
export class Module2 {}
```

В даному випадку, якщо `Module2` має path-префікс, він буде використовуватись у якості префіксу для усіх маршрутів, що є у `Module1`. Долучатись можуть лише ті модулі, що мають контролери.

Також можна закріпити додатковий path-префікс за `Module1`:

```ts {3}
// ...
@restModule({
  appends: [{ path: 'some-path', module: Module1 }],
})
export class Module2 {}
```

У даному прикладі був використаний об'єкт, в якому передається модуль для долучення, він має наступний інтерфейс:

```ts
interface AppendsWithOpts<T extends AnyObj = AnyObj> {
  id?: string;
  path: string;
  module: ModuleType<T>;
  guards?: GuardItem[];
}
```

### Реекспорт модуля {#re-export-of-the-module}

Окрім імпорту певного модуля, цей же модуль можна одночасно й експортувати:

```ts
import { restModule } from '@holu/rest';
import { Module1 } from './module1.js';

@restModule({
  imports: [Module1],
  exports: [Module1],
})
export class Module2 {}
```

Який у цьому сенс? - Тепер, якщо ви зробите імпорт `Module2` у якийсь інший модуль, ви фактично матимете імпортованим ще й `Module1`.

Зверніть увагу! Якщо під час реекспорту ви імпортуєте об'єкт з інтерфейсом `DynamicModule`, цей же об'єкт потрібно й експортувати:

```ts
import { DynamicModule } from '@holu/core';
import { restModule, RestDynamicOptions } from '@holu/rest';

import { Module1 } from './module1.js';

const firstDynamicModule: DynamicModule & RestDynamicOptions = { path: 'some-path', module: Module1 };

@restModule({
  imports: [firstDynamicModule],
  exports: [firstDynamicModule],
})
export class Module2 {}
```

## Колізії провайдерів {#provider-collisions}

Колізії провайдерів виникають тоді, коли у поточний модуль імпортуються різні провайдери, що мають один і той самий токен.

Давайте розбиремо конкретний приклад. Уявіть, що у вас є `Module3`, куди ви імпортували `Module2` та `Module1`. Ви зробили такий імпорт, бо вам потрібні відповідно `Service2` та `Service1` із цих модулів. Ви проглядаєте результат роботи даних сервісів, але по якійсь причині `Service1` працює не так як очікується. Ви починаєте дебажити і виявляється, що `Service1` експортується з обох модулів: `Module2` та `Module1`. Ви очікували, що `Service1` експортуватиметься лише з `Module1`, але насправді спрацювала та версія, що експортується з `Module2`:

```ts {8,14,19}
import { restModule, restRootModule } from '@holu/rest';

class Service1 {}
class Service2 {}

@restModule({
  providersPerMod: [Service1],
  exports: [Service1],
})
class Module1 {}

@restModule({
  providersPerMod: [{ token: Service1, useValue: 'some value' }, Service2],
  exports: [Service1, Service2],
})
class Module2 {}

@restRootModule({
  imports: [Module1, Module2],
})
class Module3 {}
```

Щоб цього не сталось, якщо ви імпортуєте два або більше модулі, в яких експортуються неідентичні провайдери з однаковим токеном, Holu кидатиме приблизно таку помилку:

> Error: Importing providers to Module3 failed: exports from Module1, Module2 causes collision with Service1. You should add Service1 to resolvedCollisionsPerMod in this module. For example: resolvedCollisionsPerMod: [ [Service1, Module1] ].

Конкретно у цій ситуації:

1. і `Module1` експортує провайдер з токеном `Service1`;
2. і `Module2` підмінює, а потім експортує провайдер з токеном `Service1`;
3. провайдери з токеном `Service1` є неідентичними у `Module1` та `Module2`.

І оскільки обидва ці модулі імпортуються у `Module3`, якраз тому і виникає "колізія провайдерів", розробник може не знати який провайдер буде працювати в `Module3`.

### Вирішення колізії {#collision-resolution}

Якщо `Module3` оголошено у вашому застосунку (тобто не імпортовано з `node_modules`), колізія вирішується шляхом додавання до `resolvedCollisionsPer*` масиву з двох елементів, де на першому місці йде токен провайдера, а на другому - модуль, з якого потрібно брати відповідний провайдер:

```ts {20}
import { restModule, restRootModule } from '@holu/rest';

class Service1 {}
class Service2 {}

@restModule({
  providersPerMod: [Service1],
  exports: [Service1],
})
class Module1 {}

@restModule({
  providersPerMod: [{ token: Service1, useValue: 'some value' }, Service2],
  exports: [Service1, Service2],
})
class Module2 {}

@restRootModule({
  imports: [Module1, Module2],
  resolvedCollisionsPerMod: [[Service1, Module1]],
})
class Module3 {}
```

Якщо `Module3` ви встановили за допомогою менеджера пакетів (npm, yarn, і т.д.), немає сенсу локально змінювати цей модуль щоб вирішити колізію. Така ситуація може виникнути лише якщо `Module1` та `Module2` експортуються з кореневого модуля, тому вам потрібно видалити один із цих модулів звідти. Ну і, звичайно ж, після цього вам прийдеться явно імпортувати видалений модуль у ті модулі, де він необхідний.

[1]: /basic-components/dependency-injection/#injector-and-providers
[2]: /basic-components/extensions
[3]: https://uk.wikipedia.org/wiki/%D0%9E%D0%B4%D0%B8%D0%BD%D0%B0%D0%BA_(%D1%88%D0%B0%D0%B1%D0%BB%D0%BE%D0%BD_%D0%BF%D1%80%D0%BE%D1%94%D0%BA%D1%82%D1%83%D0%B2%D0%B0%D0%BD%D0%BD%D1%8F) 'Singleton'
