import type { ModuleRegistry } from '#init/module-registry.js';
import type { ShallowModuleImports } from '#init/types.js';
import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { AnyObj } from '#types/mix.js';
import type { DynamicModuleOptions, ModRefId, StaticModule } from './module-decorator-options.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import type { DynamicModule, FeatureModuleOptions } from '#decorators/module-decorator-options.js';
import { AppModuleAspects, type AppProviders } from '#types/metadata-per-mod.js';
import { type NormalizedModuleMeta, createAspectMetaProxy, BaseNormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ForwardRefFn } from '#di/forward-ref.js';
import type { rootModule } from '#decorators/root-module.js';
import type { featureModule } from '#decorators/feature-module.js';
import type { ShallowModulesImporter } from '#init/shallow-modules-importer.js';

export type AllModuleAspectsMap = Map<ModuleAspectDecorator<any, any, any>, Omit<ModuleAspectHandler, 'staticAspectOptions'>>;

/**
 * A base class for creating module aspects. They carry metadata attached by corresponding decorators
 * to supplement base decorators like {@link featureModule} or {@link rootModule}.
 */
export class ModuleAspectHandler<T1 extends StaticAspectOptions = StaticAspectOptions> {
  /**
   * If you want your aspect decorator to also play the role of a base module, substitute the appropriate role.
   */
  declare moduleRole?: 'root' | 'feature';
  /**
   * The host module that provides the core functionality for this aspect.
   * If specified, it will be automatically imported wherever this aspect decorator is applied.
   */
  declare hostModule?: StaticModule;

  /**
   * Options intended for the host module.
   *
   * If you decorate the host module with its own aspect decorator and set {@link hostModule},
   * it creates a circular dependency. To avoid this, do not decorate the host module directly.
   * Instead, pass its aspect options here:
   *
   * ```ts
   * override hostStaticAspectOptions: YourMetadataType = { one: 1, two: 2 };
   * ```
   */
  declare hostStaticAspectOptions?: T1;

  constructor(public staticAspectOptions: T1) {
    this.staticAspectOptions ??= {} as T1;
  }

  /**
   * Returns a new instance of the current class. Most likely, you don't need to override this method.
   *
   * It is used to propagate aspects to modules that do not have their own explicitly
   * defined aspects of this type. By cloning the handler, the framework ensures that aspect handlers are
   * passed down the module tree, but their internal state is isolated and not shared between different modules.
   * Each module receives a fresh instance of the aspect handler.
   */
  clone<R extends this>(staticAspectOptions?: T1) {
    return new (this.constructor as { new (arg: object): R })(staticAspectOptions || {});
  }

  /**
   * Normalizes the metadata from the current decorator. It is then inserted into {@link NormalizedModuleMeta.normalizedAspectsMetaMap | normalizedModuleMeta.normalizedAspectsMetaMap}.
   *
   * @param normalizedModuleMeta Normalized metadata that is passed
   * to the {@link featureModule} or {@link rootModule} decorator.
   */
  normalize(normalizedModuleMeta: NormalizedModuleMeta): BaseNormalizedModuleMeta {
    return createAspectMetaProxy(normalizedModuleMeta, BaseNormalizedModuleMeta);
  }

  /**
   * The returned array of {@link ModRefId} will be scanned by {@link ModuleRegistry}.
   *
   * @param meta Metadata returned by the {@link normalize | this.normalize()} method.
   */
  getModulesToScan(meta?: BaseNormalizedModuleMeta): ModRefId[] {
    return [];
  }

  /**
   * This method gets metadata from {@link rootModule} decorator to collect
   * providers from the {@link FeatureModuleOptions.exports | exports } property.
   */
  exportAppProviders(config: {
    moduleRegistry: ModuleRegistry;
    appProviders: AppProviders;
    normalizedModuleMeta: NormalizedModuleMeta;
  }) {
    return new AppModuleAspects();
  }

  /**
   * Recursively collects providers taking into account module imports/exports,
   * but does not take provider dependencies into account.
   */
  importModulesShallow(config: {
    moduleRegistry: ModuleRegistry;
    appProviders: AppProviders;
    modRefId: ModRefId;
    scanningModules: Set<ModRefId>;
  }): Map<ModRefId, { normalizedModuleMeta: NormalizedModuleMeta } & AnyObj> {
    return new Map();
  }

  /**
   * By analyzing the dependencies of the providers returned by {@link ShallowModulesImporter },
   * recursively collects providers for them from the corresponding modules.
   */
  importModulesDeep(config: {
    parent: AnyObj;
    shallowModuleImports: { normalizedModuleMeta: NormalizedModuleMeta } & AnyObj;
    moduleRegistry: ModuleRegistry;
    shallowModuleImportsMap: Map<ModRefId, ShallowModuleImports>;
    providersPerApp: Provider[];
    log: SystemLogMediator;
  }): any {
    return;
  }
  /**
   * This method must return a mutable array of {@link Provider} arrays, which can be overridden during testing.
   */
  getProvidersToOverride(meta: BaseNormalizedModuleMeta): Provider[][] {
    return [];
  }
}

export interface NormalizedAspectsMetaMap {
  set<T extends BaseNormalizedModuleMeta>(decorator: ModuleAspectDecorator<any, any, T>, meta: T): this;
  get<T extends BaseNormalizedModuleMeta>(decorator: ModuleAspectDecorator<any, any, T>): T | undefined;
  forEach<T extends BaseNormalizedModuleMeta>(
    callbackfn: (meta: T, decorator: AnyFn, map: Map<AnyFn, T>) => void,
    thisArg?: any,
  ): void;
  /**
   * Returns an iterable of keys in the map
   */
  keys(): MapIterator<AnyFn>;
  values<T extends BaseNormalizedModuleMeta>(): MapIterator<T>;
  readonly size: number;
  /**
   * @returns boolean indicating whether an element with the specified key exists or not.
   */
  has(key: AnyFn): boolean;
  [Symbol.iterator](): any;
}

export interface DynamicAspectOptionsMap {
  set<T extends DynamicModuleOptions>(decorator: ModuleAspectDecorator<any, T, any>, params: T): this;
  get<T extends DynamicModuleOptions>(decorator: ModuleAspectDecorator<any, T, any>): T | undefined;
  forEach<T extends DynamicModuleOptions>(callbackfn: (params: T, decorator: AnyFn, map: Map<AnyFn, T>) => void, thisArg?: any): void;
  /**
   * Returns an iterable of keys in the map
   */
  keys(): MapIterator<AnyFn>;
  values<T extends DynamicModuleOptions>(): MapIterator<T>;
  readonly size: number;
  /**
   * @returns boolean indicating whether an element with the specified key exists or not.
   */
  has(key: ModuleAspectDecorator<any, any, any>): boolean;
}

/**
 * Use this interface to type module aspect decorators.
 *
 * Aspect decorators allow you to add custom metadata to Holu modules. This metadata is then
 * processed by extensions during the application initialization phase.
 *
 * Type parameters:
 * - `T`: Options passed when using the decorator statically (e.g., `@myAspect({ ... })`).
 * - `DynamicAspectOptions`: Options passed when applying the aspect dynamically.
 * - `NormalizedAspectMeta`: The normalized metadata type resulting from `ModuleAspectHandler.normalize()`.
 *
 * For a complete guide, see the [Aspect Decorators documentation](http://holujs.github.io/en/deep-dive/module-aspects/).
 *
 * ### Example
 *
 * ```ts
 * import { makeClassDecorator, ModuleAspectDecorator } from '@holu/core';
 *
 * export const myAspect: ModuleAspectDecorator<StaticOpts, DynamicOpts, NormalizedMeta> = makeClassDecorator(getModuleAspect);
 * ```
 */
export interface ModuleAspectDecorator<T extends StaticAspectOptions, DynamicAspectOptions, NormalizedAspectMeta> {
  (data?: T): any;
}

/**
 * A wrapper for a {@link DynamicModule} used exclusively within aspect decorators.
 *
 * It allows you to attach aspect-specific options to a dynamic module directly in the `imports` array,
 * while preserving the object reference identity of the underlying `DynamicModule`.
 *
 * If you were to spread the dynamic module (`{ ...SomeModule.forRoot(), myAspectOption: 123 }`),
 * it would create a new object, causing the framework to treat it as a distinct module instance
 * and potentially leading to duplicated providers or extensions. Using this wrapper
 * avoids this issue by keeping the original dynamic module reference intact.
 *
 * This is particularly crucial when you need to import the **same** dynamic module across multiple aspects
 * and configure it differently for each. Spreading would create duplicate module instances, whereas
 * this wrapper safely attaches multiple aspect configurations to the single module instance.
 *
 * ### Declarative Usage (Wrapper)
 *
 * ```ts
 * const dynamicModule = SomeModule.forRoot();
 *
 * @aspect1({
 *   imports: [
 *     { dynamicModule, option1: 'one' }
 *   ]
 * })
 * @aspect2({
 *   imports: [
 *     { dynamicModule, option2: 'two' }
 *   ]
 * })
 * class SomeModule {}
 * ```
 *
 * ### Programmatic Alternative
 *
 * The wrapper above is simply a declarative alternative to programmatically setting options via `dynamicAspectOptionsMap`:
 *
 * ```ts
 * const dynamicModule = SomeModule.forRoot();
 * dynamicModule.dynamicAspectOptionsMap ??= new Map();
 * dynamicModule.dynamicAspectOptionsMap.set(aspect1, { option1: 'one' });
 * dynamicModule.dynamicAspectOptionsMap.set(aspect2, { option2: 'two' });
 *
 * @aspect1({ imports: [dynamicModule] })
 * @aspect2({ imports: [dynamicModule] })
 * class SomeModule {}
 * ```
 */
export interface DynamicModuleWrapper {
  dynamicModule: DynamicModule;
  module?: never;
}

/**
 * In essence, it differs from the base {@link FeatureModuleOptions} only by its imports,
 * where an extended type of dynamic modules can be passed.
 */
// prettier-ignore
export interface StaticAspectOptions<T extends DynamicModuleOptions = DynamicModuleOptions> extends Omit<FeatureModuleOptions, 'imports'> {
  imports?: (((DynamicModuleWrapper | DynamicModule) & T) | StaticModule | ForwardRefFn<ModRefId>)[];
}
