---
sidebar_position: 2
---

# Mixin Decorators

:::warning
If you can easily pass metadata to a module using a [dynamic module][1], it is highly recommended to do so. Creating a mixin is only justified when the capabilities of dynamic modules are insufficient.
:::

The primary limitation of dynamic modules is that they are strictly bound by the configuration types accepted by base decorators, and their configuration is entirely local. They cannot recursively apply custom dynamic options to the modules they import.

In contrast, mixin decorators provide hooks that actively participate in the **recursive import and export** of modules, providers, and their dynamic options across the entire dependency graph. Here is exactly what mixins can do that dynamic modules **cannot**:

- **Recursive propagation of dynamic options**: When you pass custom options (like a route `path`) via a mixin, these options automatically propagate down the dependency tree to all imported child modules.
  
  For example, dynamic modules are restricted by the base decorators (`@rootModule`, `@featureModule`). Even if you bypass TypeScript to pass a custom parameter like `path`, the base decorators will ignore it, and the dynamic module cannot recursively apply it to any `ChildModule` it imports:
  ```ts
  @featureModule({
    // The base decorator will ignore the 'path' parameter, and it won't be passed to imported child modules
    imports: [{ module: SomeModule, path: 'api' } as any]
  })
  export class AppModule {}
  ```
  With a mixin, the framework's hooks autonomously traverse the module hierarchy. The `path: 'api'` option will be transparently applied to `SomeModule`, to `ChildModule`, and to any other modules imported deeper in the chain—all without modifying their code:
  ```ts
  @mixinRest({
    imports: [{ module: SomeModule, path: 'api' }]
  })
  @rootModule()
  export class AppModule {}
  ```

- **Establishing architectural context**: Because mixins recursively propagate their hooks, they can wrap an entire tree of standard, agnostic feature modules (using plain `@featureModule()`) in a unified architectural context (such as REST or tRPC). This keeps your feature modules highly reusable.

**Mixin decorators** are custom decorators applied to module classes to pass metadata with extended data types. Depending on how a mixin is configured, it can serve three roles:

1. As a decorator for declaring a **root module** (e.g., `restRootModule`).
2. As a decorator for declaring a **feature module** (e.g., `restModule`).
3. As a **modifier decorator** to extend an already declared module. Such decorators usually have a `mixin*` prefix (e.g., `mixinRest`, `mixinTrpc`). Multiple modifiers can be applied to a single module class.

Since these decorators accept module metadata with extended types, they need a way to normalize and validate this metadata. This is where the **`ModuleMixinHandler`** base class comes in. 

When you create a mixin using `Reflector.makeClassDecorator()`, you provide a transformer function. This transformer must return an instance of a class that extends `ModuleMixinHandler`, which will act as the metadata processor for your decorator:

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
 * An object with this type will be passed directly to the mixin decorator - @mixinSome({ one: 1, two: 2 })
 */
interface MyStaticMixinOptions extends StaticMixinOptions<DynamicMixinOptions> {
  one?: number;
  two?: number;
}

/**
 * The methods of this class will normalize and validate the module metadata.
 */
class SomeModuleMixin extends ModuleMixinHandler<MyStaticMixinOptions> {
  // ...
}

/**
 * An object with this type will be passed in the module metadata as dynamic module.
 */
interface DynamicMixinOptions extends DynamicModuleOptions {
  path?: string;
  num?: number;
}

/**
 * Module mixins transform an object of MyStaticMixinOptions into an object of that type.
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

// Creating the mixin decorator
const mixinSome: MixinDecorator<MyStaticMixinOptions, DynamicMixinOptions, MyNormalizedModuleMeta> =
  Reflector.makeClassDecorator(transformMixinOptions);

// Using mixin decorator
@mixinSome({ one: 1, two: 2 })
export class SomeModule {}
```

[A ready-made example of creating an mixin decorator][2] can be found in the Holu repository tests. In addition, you can check out a more complex but also more complete example of [creating mixin decorators (restRootModule, restModule, and mixinRest)][3], which are located in the `@holu/rest` module.

## Interaction with Root and Feature Modules {#interaction-with-root-and-feature-modules}

Depending on the role defined by the `moduleRole` property of the `ModuleMixinHandler` class (which is returned by the transformer function), mixin decorators interact differently with standard decorators - `rootModule` and `featureModule`:

- **Substitute Decorators**: when `moduleRole` is `'root'` or `'feature'`, the corresponding decorators act as full module decorators. A class annotated with them (e.g. `@restRootModule` or `@restModule`) does not require `@featureModule` or `@rootModule`. The framework automatically recognizes their role and processes them.
- **Modifier Decorators**: when `moduleRole` is `undefined`, the corresponding decorators only modify/extend the metadata. A class annotated with them (e.g. `@mixinRest`) **must** also have a standard module decorator or a substitute decorator. If no module decorator is present, the framework throws a `MissingModuleDecorator` exception.

Multiple modifier decorators can be stacked on a single class (for example, to add REST or tRPC metadata to the same module).

## Grouping Mixin Decorators with `decoratorId` {#grouping-mixin-decorators}

When creating a substitute decorator (with `'root'` or `'feature'` role) using `Reflector.makeClassDecorator()`, you **must** pass the base modifier decorator (e.g. `mixinRest` or `mixinSome`) as the third argument. This third argument serves as the `decoratorId`. It tells Holu that these decorators belong to the same group, enabling the framework to correctly collect, normalize, and associate metadata with the proper group context during initialization.

## Customizing ModuleMixinHandler {#customizing-inithooks}

The `ModuleMixinHandler` base class provides several lifecycle properties and methods you can override to control metadata processing.

### Separation of Feature Module and Mixin Decorator {#separation-of-feature-module-and-mixin-decorator-using-hostmodule}

Separating the mixin decorator's hook definitions from the host feature module is necessary to avoid circular dependencies (since the decorator imports the module, decorating the module with its own decorator would create an import loop):

1. First, create a standard feature module (e.g., `MyLibModule`) containing all necessary extensions, default providers, and services.
2. Next, define your custom `ModuleMixinHandler` subclass setting `override hostModule = MyLibModule`.
3. Create the base modifier decorator `mixin*` (e.g. `mixinSome`) which serves as the ID for the decorator group.
4. Create the transformer function that returns the hooks instance and sets `hooks.moduleRole = 'feature'` (or `'root'`).
5. Create the substitute custom decorator (e.g. `myFeatureModule`) using `Reflector.makeClassDecorator()`, passing the transformer as the first argument, its name as the second, and the base modifier decorator (`mixinSome`) as the third argument (group ID).
6. When developers apply this decorator (e.g., `@myFeatureModule`), the framework recognizes it as a module decorator (requiring only one decorator on the class instead of two) and automatically imports `MyLibModule`.

Here is an example:

```ts {12}
import { featureModule, ModuleMixinHandler, Reflector } from '@holu/core';

// 1. Standard module containing actual logic/providers
@featureModule({
  providersPerReq: [MyService],
  exports: [MyService],
})
export class MyLibModule {}

// 2. Custom hooks setting hostModule
class MyModuleMixin extends ModuleMixinHandler {
  override hostModule = MyLibModule;
}

// 3. Creating the base modifier decorator (serves as the group parent)
export const mixinSome = Reflector.makeClassDecorator((data) => new MyModuleMixin(data), 'mixinSome');

// 4. Creating the transformer that sets moduleRole = 'feature'
function transformFeatureMeta(data?: any) {
  const hooks = new MyModuleMixin(data);
  hooks.moduleRole = 'feature'; // Makes it a substitute module decorator
  return hooks;
}

// 5. Creating the substitute decorator, passing mixinSome as the 3rd argument
export const myFeatureModule = Reflector.makeClassDecorator(transformFeatureMeta, 'myFeatureModule', mixinSome);

// 6. Using only one decorator on the class (automatically imports MyLibModule)
@myFeatureModule()
export class MyFeatureModule {}
```

## Imported dynamic module options {#imported-dynamic-module-options}

When importing a dynamic module in the context of an mixin decorator:

1. Custom parameters (such as `path` or `guards`) are automatically added to the Map using the decorator mixin as a key:
    ```ts
    dynamicModule.mixinOptions.set(mixinDecorator, { path: 'some-path' });
    ```
2. If the imported module is a plain `@featureModule` (not decorated with the mixin decorator), the framework retrieves the default mixin for that decorator from the application context, clones it, registers it in the module's `moduleMixinMap` list, and calls `normalize()`.
3. This ensures that options like route prefixes and guards are correctly processed even when importing standard feature modules that have no custom mixin decorator annotations.

[1]: /basic-components/modules/#DynamicModule
[2]: https://github.com/holujs/holu/blob/main/packages/core/src/init/module-normalizer.spec.ts
[3]: https://github.com/holujs/holu/blob/main/packages/rest/src/decorators/rest-module-mixins.ts
