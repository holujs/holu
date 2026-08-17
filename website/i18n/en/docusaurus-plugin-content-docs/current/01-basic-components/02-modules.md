---
sidebar_position: 2
---

# Modules

One of the key elements of the Holu architecture is its modules. But what exactly makes a modular architecture so advantageous? — Modularity allows you to compose various autonomous elements and assemble a scalable application from them. Thanks to the autonomy of modules, large projects are easier to develop, test, deploy, and maintain. Modularity also simplifies the transition to a microservices architecture if, in the future, you decide that your Holu application requires horizontal scaling.

A modular architecture makes it possible to isolate **several code files** within a single module that may have different roles but a **shared specialization**. A module can be compared to an orchestra, where there are different instruments, but all of them create a shared piece of music. On the other hand, the need to isolate different modules arises because they may have different specializations and, as a result, may interfere with one another. Continuing the analogy with people, if you place police officers and musicians, or brokers and translators, in the same office, they will most likely interfere with each other. That is why **narrow specialization** is important for a module.

Modules are the largest building blocks of an application, and their metadata can declare components such as:

- controllers that accept HTTP requests and send HTTP responses;
- services where the business logic of the application is described;
- interceptors and guards that allow you to automate the processing of HTTP requests according to typical patterns;
- decorators and extensions that allow you to add new rules and behaviors to the application;
- other classes, interfaces, helpers, data types intended for the operation of the current module.

There are two types of modules:

1. Root module.
2. Feature module. Most often, this type of module is used for publishing on npmjs.com.

## Root module {#root-module}

Other modules are attached to the root module; it is the only one for the entire application, and its class is recommended to be named `AppModule`. A TypeScript class becomes a Holu root module by using one of the decorators such as `rootModule`, `restRootModule`, `trpcRootModule`, etc., depending on the architectural style you are using. For example, if you are using REST, the root module is declared as follows:

```ts
import { restRootModule } from '@holu/rest';

@restRootModule()
export class AppModule {}
```

In general, an object with the following properties can be passed to the `restRootModule` decorator:

```ts
import { restRootModule } from '@holu/rest';

@restRootModule({
  imports: [], // Imported modules
  appends: [], // Appending modules that have controllers
  providersPerApp: [], // Providers at the application level
  providersPerMod: [], //         ...at the module level
  providersPerRou: [], //         ...at the route level
  providersPerReq: [], //         ...at the HTTP request level
  exports: [], // Exported modules and providers from the current module
  extensions: [], // Extensions
  extensionsMeta: {}, // Data for extensions
  resolvedCollisionsPerApp: [], // Resolution of imported class collisions at the application level
  resolvedCollisionsPerMod: [], //                                   ...at the module level
  resolvedCollisionsPerRou: [], //                                   ...at the route level
  resolvedCollisionsPerReq: [], //                                   ...at the HTTP request level
  controllers: [], // List of controllers in the current module
})
export class AppModule {}
```

## Feature module {#feature-module}

A TypeScript class becomes a Holu feature module thanks to one of the following decorators: `featureModule`, `restModule`, `trpcModule`, etc., depending on the architectural style you are using. For example, if you are using REST, the feature module is declared as follows:

```ts
import { restModule } from '@holu/rest';

@restModule()
export class SomeModule {}
```

It is recommended that module files end with `*.module.ts` and that their class names end with `*Module`.

It can contain exactly the same metadata as root modules, except for the `resolvedCollisionsPerApp` property. In addition to being declared directly in the application, feature module can also be published on npmjs.com.

## Export, import, append {#export-import-append}

The module where you declare certain [providers][1] is called the **host module** for those providers. And when you use those providers in an external module, that external module is called the **consumer module** of those providers.

In order for a consumer module to use providers from a host module, the corresponding provider [tokens][1] must first be exported from the host module. This is done in the metadata that is passed to the decorator of the feature module or root module. For example, if you are using REST, this is done as follows:

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

In this example, taking into account the exported tokens, Holu will look for exported providers in the `providersPerReq` array. It makes no sense to export the providers that are passed to `providersPerApp`, since this array will be used to form the [injector][1] at the application level. That is, the providers from the `providersPerApp` array will be available for any module, at any level, and without exporting.

Since you only need to export provider tokens from the host module, not the providers themselves, you cannot directly pass providers in the form of an object to the `exports` property.

Keep in mind that you only need to export providers from the host module that will be directly used in the consumer modules. In the example above, the provider with `some-token` depends on `Service2`, but `Service2` does not need to be exported if it is not directly used in the consuming module. This ensures module encapsulation.

Exporting controllers does not make sense, since exporting only applies to providers.

### Exporting providers from a feature module {#exporting-providers-from-a-featuremodule}

By exporting tokens from a host module, you are declaring that the corresponding providers can be used in consumer modules if they import this host module.

### Exporting providers from root module {#exporting-providers-from-rootmodule}

Exporting providers from the root module means that these providers will be automatically added to every module declared in your application. At the same time, these providers will not be added to external modules, i.e., modules that you install using package managers like npm, yarn, etc. For example, if you are using REST, this is done as follows:

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

In this case, `Service1` will not be added to `BodyParserModule` (because it is an external module); instead, it will be added to all other application modules at the HTTP request level. As you can see, you can also export entire modules. In this case, all providers exported from `Module1` will also be added to every application module at the corresponding level.

Sometimes there is a need to add an entire array of providers, and to export their tokens, there is a helper `getTokens()`:

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

Here, `defaultProviders` is an array of providers, and if you tried to export this array, you could get an error if it contained providers defined as objects. Only provider tokens should be exported, which is why `getTokens()` is used.

### Import module {#import-module}

You cannot import a single provider into a module, but you can import an entire module with all the providers and [extensions][2] exported from it. For example, if you are using REST, this is done as follows:

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

For example, if `Service1` is exported from the `Module1`, then this service can now be used in the `Module2`. However, if `Module1` has controllers, they will be ignored in this import form. For Holu to take into account controllers from an imported module, the module must be imported with a prefix passed in `path`:

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

Although `path` is an empty string here, for Holu, the presence of `path` means:

1. to consider controllers from the imported module as well;
2. to use `path` as a prefix for all controllers imported from `Module1`.

As you can see, in the previous example, this time neither the provider nor the module is imported, but the object. This object has the following interface:

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

In addition to `DynamicModule`, you can also pass an object of type `DynamicModuleWrapper` to the module metadata:

```ts
interface DynamicModuleWrapper {
  dynamicModule: DynamicModule;
  module?: never;
}
```

This wrapper is crucial when you import the **same** dynamic module across multiple aspects and need different configurations for each. Declarative usage example:

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

Programmatic alternative:

```ts
const dynamicModule = SomeModule.forRoot();
dynamicModule.dynamicAspectOptionsMap ??= new Map();
dynamicModule.dynamicAspectOptionsMap.set(aspect1, { option1: 'one' });
dynamicModule.dynamicAspectOptionsMap.set(aspect2, { option2: 'two' });

@aspect1({ imports: [dynamicModule] })
@aspect2({ imports: [dynamicModule] })
class SomeModule {}
```

To reduce the length of the code when importing an object of this type, it is sometimes advisable to write a static method in the importing module. To see this clearly, let's take the previous example again:

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

If you declare `Module1` and knew that this module would make sense to be imported many times into different modules with different prefixes, then in this case you could write a static method in this class that returns an object specially designed for import:

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

Now the object returned by this method can be imported as follows:

```ts {4}
// ...
@restModule({
  imports: [
    Module1.withPrefix('some-prefix')
  ]
})
export class Module2 {}
```

Static methods make it easier to pass module parameters.

In order for TypeScript to control exactly what the static import method returns, it is recommended to use the `DynamicModule` interface:

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

#### Import classes or class instances? {#import-classes-or-class-instances}

Let's consider a specific situation. In the following example, each provider is a class. Note what arrays these providers are passed to and what exactly is exported.

```ts
// ...
@restModule({
  providersPerReq: [Provider1],
  exports: [Provider1],
})
export class Module1 {}
```

Suppose we import this module into `Module2`, which has no providers of its own:

```ts
// ...
@restModule({
  imports: [Module1],
  // ...
})
export class Module2 {}
```

As a result of this import, the consumer module (`Module2`) will now have `Provider1` at the HTTP request level, because it is declared at that level in the host module (`Module1`). When working with `Provider1`, its instances will be created separately in both modules. [Singleton][3] can be shared between modules only if its provider is declared at the application level. In our example, the provider is declared at the HTTP request level, so `Module1` and `Module2` will not have instances of `Provider1` shared at either level.

So it can be argued that classes are imported, not their instances.

### Appending of the module {#appending-of-the-module}

If you are using `@holu/rest` and you don't need to import providers and [extensions][2] into the current module, but just append the external module to the path prefix of the current module, you can use the `appends` array:

```ts {5}
import { restModule } from '@holu/rest';
import { Module1 } from './module1.js';

@restModule({
  appends: [Module1],
})
export class Module2 {}
```

In this case, if `Module2` has a path prefix, it will be used as a prefix for all routes contained in `Module1`. Only those modules with controllers can be appended.

You can also attach an additional path prefix to `Module1`:

```ts {3}
// ...
@restModule({
  appends: [{ path: 'some-path', module: Module1 }],
})
export class Module2 {}
```

In this example, an object was used, in which the module is passed for appending, it has the following interface:

```ts
interface AppendsWithOpts<T extends AnyObj = AnyObj> {
  id?: string;
  path: string;
  module: ModuleType<T>;
  guards?: GuardItem[];
}
```

### Re-export of the module {#re-export-of-the-module}

In addition to importing a specific module, the same module can be simultaneously exported:

```ts
import { restModule } from '@holu/rest';
import { Module1 } from './module1.js';

@restModule({
  imports: [Module1],
  exports: [Module1],
})
export class Module2 {}
```

What is the meaning of this? - Now if you import `Module2` into some other module, you will actually have `Module1` imported as well.

Pay attention! If during re-export you import an object with `DynamicModule` interface, the same object must also be exported:

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

## Provider Collisions {#provider-collisions}

Provider collisions occur when different providers with the same token are imported into the current module.

Let's take a closer look at a specific example. Imagine you have `Module3`, where you import `Module2` and `Module1`. You made these imports because you need `Service2` and `Service1` from these modules, respectively. You review the results of these services operations, but for some reason, `Service1` does not behave as expected. You start debugging and discover that `Service1` is exported from both `Module2` and `Module1`. You expected `Service1` to be exported only from `Module1`, but in reality, the version exported by `Module2` is being used:

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

To prevent this, if you import two or more modules that export non-identical providers with the same token, Holu will throw an error similar to this:

> Error: Importing providers to Module3 failed: exports from Module1, Module2 causes collision with Service1. You should add Service1 to resolvedCollisionsPerMod in this module. For example: resolvedCollisionsPerMod: [ [Service1, Module1] ].

In this specific scenario:

1. `Module1` exports a provider with the token `Service1`.
2. `Module2` overrides and then exports a provider with the token `Service1`.
3. The providers with the token `Service1` in `Module1` and `Module2` are not identical.

And because both of these modules are imported into `Module3`, a "provider collision" occurs, leaving the developer uncertain about which provider will be used in `Module3`.

### Collision resolution {#collision-resolution}

If `Module3` is declared in your application (it is not imported from `node_modules`), the collision is resolved by adding to `resolvedCollisionsPer*` an array of two elements, with the provider's token in the first place and the module from which the provider needs to be taken in the second place:

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

If you have installed `Module3` using packages manager (npm, yarn, etc.), there is no point in modifying this module locally to resolve the collision. This situation can only occur if `Module2` and `Module1` are exported from the root module, so you need to remove one of these modules from there. And, of course, after that you will have to explicitly import the deleted module into those modules where it is needed.

[1]: /basic-components/dependency-injection/#injector-and-providers
[2]: /basic-components/extensions
[3]: https://en.wikipedia.org/wiki/Singleton_pattern
