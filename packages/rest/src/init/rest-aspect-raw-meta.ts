import type { AnyObj, StaticModule, Class, AnyFn, StaticAspectOptions, DynamicModuleOptions, ForwardRefFn } from '@holu/core';
import type { GuardItem } from '#interceptors/guard.js';

/**
 * Metadata for the `aspectRest` decorator, which adds REST metadata to a `featureModule` or `rootModule`.
 */
export interface RestStaticOptions extends StaticAspectOptions<RestDynamicOptions> {
  /**
   * List of modules that contain controllers. Providers from these modules
   * are not imported into the current module. If the current module has a prefix path,
   * that path will be added to each controller route from the appended modules.
   */
  appends?: Array<StaticModule | RestAppendOptions | ForwardRefFn<StaticModule>>;
  /**
   * The application controllers.
   */
  controllers?: Class[];
}

export type RestDynamicOptions = RestDynamicPathOptions | RestDynamicAbsolutePathOptions;

export interface BaseRestDynamicOptions extends DynamicModuleOptions {
  /**
   * List of modules, `RestDynamicOptions` or tokens of providers exported by this
   * module.
   */
  exports?: any[];
  guards?: GuardItem[];
}

export interface RestDynamicPathOptions extends BaseRestDynamicOptions {
  path?: string;
  absolutePath?: never;
}

export interface RestDynamicAbsolutePathOptions extends BaseRestDynamicOptions {
  absolutePath?: string;
  path?: never;
}
/**
 * Used for module metadata, for `appends` array.
 */
export type RestAppendOptions<T extends AnyObj = AnyObj> = RestAppendPathOptions<T> | RestAppendAbsolutePathOptions<T>;

export interface BaseRestAppendOptions<T extends AnyObj = AnyObj> {
  /**
   * The module ID.
   */
  id?: string;
  module: StaticModule<T> | ForwardRefFn<StaticModule<T>>;
  guards?: GuardItem[];
  aspectOptions?: Map<AnyFn, any>;
}

export interface RestAppendPathOptions<T extends AnyObj = AnyObj> extends BaseRestAppendOptions<T> {
  path?: string;
  absolutePath?: never;
}

export interface RestAppendAbsolutePathOptions<T extends AnyObj = AnyObj> extends BaseRestAppendOptions<T> {
  absolutePath?: string;
  path?: never;
}
