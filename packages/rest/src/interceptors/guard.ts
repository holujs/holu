import type { Class, NormalizedModuleMeta } from '@holu/core';
import { Reflector } from '@holu/core';
import type { RequestContext } from '#services/request-context.js';
import type { RestAspectMeta } from '#init/rest-mixin-meta.js';

export const guard = Reflector.makeClassDecorator((data?: never) => data);

export interface CanActivate {
  canActivate(ctx: RequestContext, params?: any[]): boolean | Response | Promise<boolean | Response>;
}

export type GuardItem = Class<CanActivate> | [Class<CanActivate>, any, ...any[]];

export interface NormalizedGuard {
  guard: Class<CanActivate>;
  params?: any[];
}

export interface ModuleScopedGuard extends NormalizedGuard {
  meta: RestAspectMeta;
  normalizedModuleMeta: NormalizedModuleMeta;
}
