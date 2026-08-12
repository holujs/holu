import type { ModuleManager } from '#init/module-manager.js';
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

export type AllModuleAspectsMap = Map<ModuleAspectDecorator<any, any, any>, Omit<ModuleAspectHandler, 'moduleOptions'>>;

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
   * override hostAspectOptions: YourMetadataType = { one: 1, two: 2 };
   * ```
   */
  declare hostAspectOptions?: T1;

  constructor(public moduleOptions: T1) {
    this.moduleOptions ??= {} as T1;
  }

  /**
   * Returns a new instance of the current class. Most likely, you don't need to override this method.
   */
  clone<R extends this>(moduleOptions?: T1) {
    return new (this.constructor as { new (arg: object): R })(moduleOptions || {});
  }

  /**
   * Normalizes the metadata from the current decorator. It is then inserted into {@link NormalizedModuleMeta.normalizedAspectMetaMap | normalizedModuleMeta.normalizedAspectMetaMap}.
   *
   * @param normalizedModuleMeta Normalized metadata that is passed
   * to the {@link featureModule} or {@link rootModule} decorator.
   */
  normalize(normalizedModuleMeta: NormalizedModuleMeta): BaseNormalizedModuleMeta {
    return createAspectMetaProxy(normalizedModuleMeta, BaseNormalizedModuleMeta);
  }

  /**
   * The returned array of {@link ModRefId} will be scanned by {@link ModuleManager}.
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
    moduleManager: ModuleManager;
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
    moduleManager: ModuleManager;
    appProviders: AppProviders;
    modRefId: ModRefId;
    unfinishedScanModules: Set<ModRefId>;
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
    moduleManager: ModuleManager;
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

export interface NormalizedAspectMetaMap {
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
  set<T extends AnyObj>(decorator: ModuleAspectDecorator<any, T, any>, params: T): this;
  get<T extends AnyObj>(decorator: ModuleAspectDecorator<any, T, any>): T | undefined;
  forEach<T extends AnyObj>(callbackfn: (params: T, decorator: AnyFn, map: Map<AnyFn, T>) => void, thisArg?: any): void;
  /**
   * Returns an iterable of keys in the map
   */
  keys(): MapIterator<AnyFn>;
  values<T extends AnyObj>(): MapIterator<T>;
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
 * Dynamic module wrapper with additional custom options.
 */
export interface DynamicModuleWrapper {
  /**
   * Dynamic module.
   */
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
