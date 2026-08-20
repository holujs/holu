import { resolveForwardRef, type ForwardRefFn } from '#di/forward-ref.js';
import { isClassProvider, isNormalizedProvider, isTokenProvider } from '#di/utils.js';
import { isDynamicModule, isDynamicModuleWrapper } from '#decorators/type-guards.js';
import type { DynamicModule } from '#decorators/module-decorator-options.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { Provider } from '#di/top/types-and-models.js';
import type { ProviderBuilder } from '#utils/providers.js';

export function resolveAllForwardRefs<T extends ModRefId | Provider | ForwardRefFn | { dynamicModule: DynamicModule }>(
  arr: T[] | ProviderBuilder = [],
): Exclude<T, ForwardRefFn>[] {
  return [...arr].map((item) => {
    const resolved = resolveForwardRef(item);
    if (isDynamicModuleWrapper(resolved)) {
      resolved.dynamicModule.module = resolveForwardRef(resolved.dynamicModule.module);
    } else if (isNormalizedProvider(resolved)) {
      resolved.token = resolveForwardRef(resolved.token);
      if (isClassProvider(resolved)) {
        resolved.useClass = resolveForwardRef(resolved.useClass);
      } else if (isTokenProvider(resolved)) {
        resolved.useToken = resolveForwardRef(resolved.useToken);
      }
    } else if (isDynamicModule(resolved)) {
      resolved.module = resolveForwardRef(resolved.module);
    }
    return resolved;
  }) as Exclude<T, ForwardRefFn>[];
}
