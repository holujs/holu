import type { ProvidersByLevel } from '#types/providers-metadata.js';
import type { AnyObj } from '#types/mix.js';
import type { ExtensionConfig } from '#extension/extension-providers-and-configs.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import type { DynamicAspectOptionsMap } from '#decorators/module-aspects.js';
import type { ProviderBuilder } from '#utils/providers.js';
import type { Class, Provider } from '#di/top/types-and-models.js';
import type { ForwardRefFn } from '#di/forward-ref.js';
import type { rootModule } from '#decorators/root-module.js';
import type { featureModule } from '#decorators/feature-module.js';

/**
 * Raw metadata that is passed to the {@link rootModule} and {@link featureModule} decorators.
 */
export class FeatureModuleOptions<T extends AnyObj = AnyObj> {
  /**
   * Providers per the application.
   */
  declare providersPerApp?: ProviderBuilder | (Provider | ForwardRefFn<Provider>)[];
  /**
   * Providers per a module.
   */
  declare providersPerMod?: ProviderBuilder | (Provider | ForwardRefFn<Provider>)[];
  /**
   * Providers per a route.
   */
  declare providersPerRou?: ProviderBuilder | (Provider | ForwardRefFn<Provider>)[];
  /**
   * Providers per a request.
   */
  declare providersPerReq?: ProviderBuilder | (Provider | ForwardRefFn<Provider>)[];
  /**
   * List of modules or `DynamicModule` imported by this module.
   * Also you can imports modules and set some prefix per each the module.
   */
  declare imports?: (ModRefId | ForwardRefFn<ModRefId>)[];
  /**
   * List of {@link StaticModule}, {@link DynamicModule} or tokens of providers exported by this
   * module.
   */
  declare exports?: any[];
  /**
   * The application extensions.
   */
  declare extensions?: (ExtensionConfig | ExtensionClass)[];
  /**
   * This property allows you to pass any information to extensions.
   *
   * You must follow this rule: data for one extension - one key in `extensionsMeta` object.
   */
  declare extensionsMeta?: T;
  /**
   * An array of pairs, each of which is in the first place the provider's token,
   * and in the second - the module from which to import the provider with the specified token.
   */
  declare resolvedCollisionsPerMod?: [any, ModRefId | ForwardRefFn<ModRefId>][];
  /**
   * An array of pairs, each of which is in the first place the provider's token,
   * and in the second - the module from which to import the provider with the specified token.
   */
  declare resolvedCollisionsPerRou?: [any, ModRefId | ForwardRefFn<ModRefId>][];
  /**
   * An array of pairs, each of which is in the first place the provider's token,
   * and in the second - the module from which to import the provider with the specified token.
   */
  declare resolvedCollisionsPerReq?: [any, ModRefId | ForwardRefFn<ModRefId>][];
  /**
   * Whether this module inherits module aspects / context (like REST or tRPC) from parent modules.
   * By default, it is true for local modules and false for external modules.
   */
  declare inheritsAspects?: boolean;
}

/**
 * Base interface for a dynamic module, containing the target module reference and optional module ID.
 */
export interface BaseDynamicModule<M extends AnyObj = AnyObj> {
  /**
   * The module ID.
   */
  id?: string;
  module: StaticModule<M> | ForwardRefFn<StaticModule<M>>;
}

/**
 * Options that can be passed to configure a dynamic module.
 */
export interface DynamicModuleOptions<E extends AnyObj = AnyObj> extends Partial<ProvidersByLevel> {
  /**
   * List of modules, {@link DynamicModule} or tokens of providers exported by this
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
/**
 * Represents a dynamically configured module that pairs a target module reference (a {@link StaticModule})
 * with runtime options (such as provider overrides, exports, or extension metadata).
 *
 * An object of this type is typically returned by static module factory methods (e.g. `MyModule.withOptions(...)`)
 * and passed into the `imports` or `exports` array of a root or feature module.
 */
export interface DynamicModule<M extends AnyObj = AnyObj> extends BaseDynamicModule<M>, DynamicModuleOptions {
  /**
   * If the current module has this property populated, this means it was used in the context of aspect decorators.
   */
  dynamicAspectOptionsMap?: DynamicAspectOptionsMap;
}
/**
 * This interface differs from {@link DynamicModule} only in that it requires the presence of the `dynamicAspectOptionsMap` property.
 * It is convenient to use in static module methods that return a dynamic module configured with aspect options.
 */
export interface DynamicModuleWithAspectOptions<M extends AnyObj = AnyObj> extends DynamicModule<M> {
  dynamicAspectOptionsMap: DynamicAspectOptionsMap;
}

/**
 * Represents a static module class (constructor) decorated with a module decorator.
 */
export type StaticModule<T extends AnyObj = AnyObj> = Class<T>;
/**
 * A module reference identifier for a {@link StaticModule} or {@link DynamicModule}.
 *
 * Used across the framework (e.g. in `imports`, `exports`, collision resolutions, and module manager)
 * to reference a module.
 */
export type ModRefId<T extends AnyObj = AnyObj> = StaticModule<T> | DynamicModule<T>;
