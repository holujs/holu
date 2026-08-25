import type { ForwardRefFn } from '#di/forward-ref.js';
import type { ModRefId } from './module-decorator-options.js';
import type { AnyObj } from '#types/mix.js';
import { Reflector } from '#di/reflector.js';
import { objectKeys } from '#utils/object-keys.js';
import { ProviderBuilder } from '#utils/providers.js';
import { FeatureModuleOptions } from './module-decorator-options.js';

/**
 * Raw module metadata returned by reflector.
 */
export class RootModuleOptions<T extends AnyObj = AnyObj> extends FeatureModuleOptions<T> {
  /**
   * An array of pairs, each of which is in the first place the provider's token,
   * and in the second - the module from which to import the provider with the specified token.
   */
  declare resolvedCollisionsPerApp?: [any, ModRefId | ForwardRefFn<ModRefId>][];
}

export const rootModule: RootModuleDecorator = Reflector.makeClassDecorator(transformModule, 'rootModule');

export interface RootModuleDecorator {
  (data?: RootModuleOptions): any;
}

function transformModule(data?: RootModuleOptions): RootModuleOptions {
  const moduleOptions = Object.assign(new RootModuleOptions(), data) as RootModuleOptions;
  objectKeys(moduleOptions).forEach((p) => {
    if (moduleOptions[p] instanceof ProviderBuilder) {
      (moduleOptions as any)[p] = [...moduleOptions[p]];
    } else if (Array.isArray(moduleOptions[p])) {
      (moduleOptions as any)[p] = moduleOptions[p].slice();
    }
  });

  return moduleOptions;
}
