import type { ModuleManager } from '#init/module-manager.js';
import type { ShallowModuleImports } from '#init/types.js';
import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { AnyObj } from '#types/mix.js';
import type { DynamicModuleOptions, ModRefId, StaticModule } from './module-decorator-options.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import type { DynamicModule, FeatureModuleOptions } from '#decorators/module-decorator-options.js';
import { AppModuleMixins, type AppProviders } from '#types/metadata-per-mod.js';
import { type NormalizedModuleMeta, getProxyForMixinMeta, BaseNormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ForwardRefFn } from '#di/forward-ref.js';
import type { rootModule } from '#decorators/root-module.js';
import type { featureModule } from '#decorators/feature-module.js';
import type { ShallowModulesImporter } from '#init/shallow-modules-importer.js';

export type AllModuleMixinsMap = Map<MixinDecorator<any, any, any>, Omit<ModuleMixinHandler, 'moduleOptions'>>;

/**
 * A base class for creating module mixins. They carry metadata attached by corresponding decorators
 * to supplement base decorators like {@link featureModule} or {@link rootModule}.
 */
export class ModuleMixinHandler<T1 extends StaticMixinOptions = StaticMixinOptions> {
  /**
   * If you want your mixin decorator to also play the role of a base module, substitute the appropriate role.
   */
  declare moduleRole?: 'root' | 'feature';
  /**
   * The host module that provides the core functionality for this mixin.
   * If specified, it will be automatically imported wherever this mixin decorator is applied.
   */
  declare hostModule?: StaticModule;

  /**
   * Options intended for the host module.
   *
   * If you decorate the host module with its own mixin decorator and set {@link hostModule},
   * it creates a circular dependency. To avoid this, do not decorate the host module directly.
   * Instead, pass its mixin options here:
   *
   * ```ts
   * override hostMixinOptions: YourMetadataType = { one: 1, two: 2 };
   * ```
   */
  declare hostMixinOptions?: T1;

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
   * Normalizes the metadata from the current decorator. It is then inserted into {@link NormalizedModuleMeta.normalizedMixinMetaMap | normalizedModuleMeta.normalizedMixinMetaMap}.
   *
   * @param normalizedModuleMeta Normalized metadata that is passed
   * to the {@link featureModule} or {@link rootModule} decorator.
   */
  normalize(normalizedModuleMeta: NormalizedModuleMeta): BaseNormalizedModuleMeta {
    return getProxyForMixinMeta(normalizedModuleMeta, BaseNormalizedModuleMeta);
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
    return new AppModuleMixins();
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

export interface NormalizedMixinMetaMap {
  set<T extends BaseNormalizedModuleMeta>(decorator: MixinDecorator<any, any, T>, meta: T): this;
  get<T extends BaseNormalizedModuleMeta>(decorator: MixinDecorator<any, any, T>): T | undefined;
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

export interface DynamicMixinOptionsMap {
  set<T extends AnyObj>(decorator: MixinDecorator<any, T, any>, params: T): this;
  get<T extends AnyObj>(decorator: MixinDecorator<any, T, any>): T | undefined;
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
  has(key: MixinDecorator<any, any, any>): boolean;
}

/**
 * Use this interface to type module mixin decorators.
 *
 * Mixin decorators allow you to add custom metadata to Holu modules. This metadata is then
 * processed by extensions during the application initialization phase.
 *
 * Type parameters:
 * - `T`: Options passed when using the decorator statically (e.g., `@myMixin({ ... })`).
 * - `DynamicMixinOptions`: Options passed when applying the mixin dynamically.
 * - `NormalizedMixinMeta`: The normalized metadata type resulting from `ModuleMixinHandler.normalize()`.
 *
 * For a complete guide, see the [Mixin Decorators documentation](http://holujs.github.io/en/deep-dive/module-mixins/).
 *
 * ### Example
 *
 * ```ts
 * import { makeClassDecorator, MixinDecorator } from '@holu/core';
 *
 * export const myMixin: MixinDecorator<StaticOpts, DynamicOpts, NormalizedMeta> = makeClassDecorator(getModuleMixin);
 * ```
 */
export interface MixinDecorator<T extends StaticMixinOptions, DynamicMixinOptions, NormalizedMixinMeta> {
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
export interface StaticMixinOptions<T extends DynamicModuleOptions = DynamicModuleOptions> extends Omit<FeatureModuleOptions, 'imports'> {
  imports?: (((DynamicModuleWrapper | DynamicModule) & T) | StaticModule | ForwardRefFn<ModRefId>)[];
}
