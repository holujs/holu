import type { ProvidersByLevel } from '#types/providers-metadata.js';
import type { StaticAspectOptions } from '#decorators/module-aspects.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { RootModuleOptions } from '#decorators/root-module.js';
import type { PickProps } from '#types/mix.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import { resolveForwardRef, type ForwardRefFn } from '#di/forward-ref.js';
import { isDynamicModule } from '#decorators/type-guards.js';
import { isNormalizedProvider } from '#di/utils.js';
import { ResolvedCollisionTokensOnly } from '#errors';
import { resolveAllForwardRefs } from '#init/forward-refs-resolver.js';

export const PROVIDER_LEVELS = ['App', 'Mod', 'Rou', 'Req'] as const;

export class ProvidersProcessor {
  normalizeProvidersAndResolvedCollisions(
    staticAspectOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    this.normalizeProviders(staticAspectOptions, meta);
    this.normalizeResolvedCollisions(staticAspectOptions, meta);
  }

  normalizeProviders(moduleOptions: Partial<ProvidersByLevel>, meta: NormalizedModuleMeta) {
    PROVIDER_LEVELS.forEach((level) => {
      const providersKey = `providersPer${level}` as const;
      if (moduleOptions[providersKey]) {
        const providersPerLevel = resolveAllForwardRefs(moduleOptions[providersKey] as any) as any[];
        meta[providersKey].push(...providersPerLevel);
      }
    });
  }

  protected normalizeResolvedCollisions(
    staticAspectOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    PROVIDER_LEVELS.forEach((level) => {
      const resolvedCollisionKey = `resolvedCollisionsPer${level}` as const;
      if (staticAspectOptions[resolvedCollisionKey]) {
        staticAspectOptions[resolvedCollisionKey].forEach(([token, module]) => {
          token = resolveForwardRef(token);
          module = resolveForwardRef(module);
          if (isDynamicModule(module)) {
            module.module = resolveForwardRef(module.module);
          }
          meta[resolvedCollisionKey].push([token, module]);
        });
      }
    });
  }

  assertResolvedCollisionTokensOnly(
    staticModuleOptions: StaticAspectOptions & PickProps<RootModuleOptions, 'resolvedCollisionsPerApp'>,
    meta: NormalizedModuleMeta,
  ) {
    const resolvedCollisionsPerLevel: [any, ModRefId | ForwardRefFn][] = [];
    PROVIDER_LEVELS.forEach((level) => {
      if (Array.isArray(staticModuleOptions[`resolvedCollisionsPer${level}`])) {
        resolvedCollisionsPerLevel.push(...staticModuleOptions[`resolvedCollisionsPer${level}`]!);
      }
    });

    resolvedCollisionsPerLevel.forEach(([provider]) => {
      provider = resolveForwardRef(provider);
      if (isNormalizedProvider(provider)) {
        const providerName = provider.token.name || provider.token;
        throw new ResolvedCollisionTokensOnly(meta.name, providerName);
      }
    });
  }
}
