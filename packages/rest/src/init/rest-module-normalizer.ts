import type { Class, NormalizedModuleMeta, ProviderBuilder, Provider, ForwardRefFn, StaticModule } from '@holu/core';
import {
  isNormalizedProvider,
  Reflector,
  resolveForwardRef,
  getDuplicates,
  isDynamicModule,
  isClassProvider,
  isTokenProvider,
  createAspectMetaProxy,
  isRootModule,
} from '@holu/core';
import { ForbiddenNormalizedExport, MeaninglessModuleMetadata } from '@holu/core/errors';

import type { RestAppendOptions, RestStaticOptions } from '#init/rest-aspect-raw-meta.js';
import type { RestModRefId } from '#init/rest-aspect-meta.js';
import { RestAspectMeta } from '#init/rest-aspect-meta.js';
import { isAppendsWithOptions, isControllerDecorator } from '#types/type.guards.js';
import type { GuardItem, NormalizedGuard } from '#interceptors/guard.js';
import { restAspect } from '#decorators/rest-module-aspects.js';
import { ControllerDoesNotHaveDecorator, DuplicateOfControllers, InvalidGuard } from '#errors';

/**
 * Normalizes and validates module metadata.
 */
export class RestModuleNormalizer {
  protected normalizedModuleMeta: NormalizedModuleMeta;
  protected meta: RestAspectMeta;

  normalize(normalizedModuleMeta: NormalizedModuleMeta, restStaticOptions: RestStaticOptions) {
    this.normalizedModuleMeta = normalizedModuleMeta;
    const meta = createAspectMetaProxy(normalizedModuleMeta, RestAspectMeta);
    this.meta = meta;
    if (restStaticOptions.controllers) {
      this.meta.controllers.push(...restStaticOptions.controllers);
    }
    this.mergeDynamicModule(normalizedModuleMeta.modRefId);
    this.appendModules(restStaticOptions);
    this.checkMetadata();
    return meta;
  }

  protected mergeDynamicModule(modRefId: RestModRefId): void {
    if (isAppendsWithOptions(modRefId)) {
      if (modRefId.absolutePath !== undefined) {
        this.meta.params.absolutePath = modRefId.absolutePath;
      }
      if (modRefId.path !== undefined) {
        this.meta.params.path = modRefId.path;
      }
      this.meta.params.guards.push(...this.normalizeGuards(modRefId.guards));
      return;
    } else if (!isDynamicModule(modRefId)) {
      return;
    }
    const params = modRefId.aspectOptions?.get(restAspect);

    if (params) {
      if (params.absolutePath !== undefined) {
        this.meta.params.absolutePath = params.absolutePath;
      }
      if (params.path !== undefined) {
        this.meta.params.path = params.path;
      }
      this.meta.params.guards.push(...this.normalizeGuards(params.guards));
    }
  }

  protected appendModules(restStaticOptions: RestStaticOptions) {
    restStaticOptions.appends?.forEach((ap, i) => {
      ap = this.resolveForwardRef([ap])[0];
      if (isNormalizedProvider(ap)) {
        throw new ForbiddenNormalizedExport(this.normalizedModuleMeta.name, ap.token.name || ap.token);
      }
      if (isAppendsWithOptions(ap)) {
        const params = { ...ap } as Partial<RestAppendOptions>;
        delete params.module;
        if (ap.aspectOptions) {
          ap.aspectOptions.set(restAspect, params);
        } else {
          ap.aspectOptions = new Map([[restAspect, params]]);
        }
        this.meta.appendsWithOpts.push(ap);
      } else {
        this.meta.appendsModules.push(ap);
      }
    });
  }

  protected resolveForwardRef<T extends RestModRefId | Provider | ForwardRefFn<StaticModule | Provider>>(arr: T[] | ProviderBuilder) {
    return [...arr].map((item) => {
      item = resolveForwardRef(item);
      if (isNormalizedProvider(item)) {
        item.token = resolveForwardRef(item.token);
        if (isClassProvider(item)) {
          item.useClass = resolveForwardRef(item.useClass);
        } else if (isTokenProvider(item)) {
          item.useToken = resolveForwardRef(item.useToken);
        }
      } else if (isDynamicModule(item)) {
        item.module = resolveForwardRef(item.module);
      }
      return item;
    }) as Exclude<T, ForwardRefFn>[];
  }

  protected checkController(Controller: Class) {
    if (!Reflector.getClassLevelMeta(Controller, isControllerDecorator)) {
      throw new ControllerDoesNotHaveDecorator(Controller.name);
    }
  }

  protected checkMetadata() {
    const meta = this.meta;
    this.checkGuards(meta.params.guards);
    meta.controllers.forEach((Controller) => this.checkController(Controller));
    const controllerDuplicates = getDuplicates(meta.controllers).map((c) => c.name);
    if (controllerDuplicates.length) {
      throw new DuplicateOfControllers(controllerDuplicates.join(', '));
    }

    if (
      !isRootModule(this.normalizedModuleMeta) &&
      !meta.exportedProvidersPerMod.length &&
      !meta.exportedMultiProvidersPerMod.length &&
      !meta.exportedStaticModules.length &&
      !meta.providersPerApp.length &&
      !meta.exportedDynamicModules.length &&
      !meta.exportedExtensionProviders.length &&
      !meta.extensionProviders.length &&
      !meta.exportedProvidersPerReq.length &&
      !meta.exportedProvidersPerRou.length &&
      !meta.exportedMultiProvidersPerRou.length &&
      !meta.exportedMultiProvidersPerReq.length &&
      !meta.controllers.length &&
      !meta.appendsWithOpts.length
    ) {
      throw new MeaninglessModuleMetadata(this.normalizedModuleMeta.name);
    }
  }

  protected normalizeGuards(guards?: GuardItem[]) {
    return (guards || []).map((item) => {
      if (Array.isArray(item)) {
        return { guard: item[0], params: item.slice(1) } as NormalizedGuard;
      } else {
        return { guard: item } as NormalizedGuard;
      }
    });
  }

  protected checkGuards(guards: NormalizedGuard[]) {
    for (const Guard of guards.map((n) => n.guard)) {
      const type = typeof Guard?.prototype.canActivate;
      if (type != 'function') {
        throw new InvalidGuard(type);
      }
    }
  }
}
