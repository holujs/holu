import type { Class, NormalizedModuleMeta } from '@holu/core';
import { isFeatureModule, Reflector, getDuplicates, createAspectMetaProxy } from '@holu/core';
import { MeaninglessModuleMetadata } from '@holu/core/errors';

import type { TrpcStaticOptions } from '#decorators/trpc-module-aspects.js';
import { TrpcAspectMeta } from '#decorators/trpc-module-aspects.js';
import { ControllerDoesNotHaveDecorator, DuplicateOfControllers, InvalidGuard } from '../error/trpc-errors.js';
import type { NormalizedGuard } from '#interceptors/trpc-guard.js';
import { isControllerDecorator } from '#types/type.guards.js';

/**
 * Normalizes and validates module metadata.
 */
export class TrpcModuleNormalizer {
  protected normalizedModuleMeta: NormalizedModuleMeta;
  protected meta: TrpcAspectMeta;

  normalize(normalizedModuleMeta: NormalizedModuleMeta, moduleOptions: TrpcStaticOptions) {
    this.normalizedModuleMeta = normalizedModuleMeta;
    const meta = createAspectMetaProxy(normalizedModuleMeta, TrpcAspectMeta);
    this.meta = meta;
    if (moduleOptions.controllers) {
      this.meta.controllers.push(...moduleOptions.controllers);
    }
    this.checkMetadata();
    return meta;
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
      isFeatureModule(this.normalizedModuleMeta) &&
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
      !meta.controllers.length
    ) {
      throw new MeaninglessModuleMetadata(this.normalizedModuleMeta.name);
    }
  }

  protected checkController(Controller: Class) {
    if (!Reflector.getClassLevelMeta(Controller, isControllerDecorator)) {
      throw new ControllerDoesNotHaveDecorator(Controller.name);
    }
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
