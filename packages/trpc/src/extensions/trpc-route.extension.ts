import { injectable, Extension, ResolvedModuleMeta, type Class, Reflector, Provider } from '@holu/core';
import { inspect } from 'node:util';

import { TrpcResolvedModuleMeta } from '#init/trpc-deep-modules-importer.js';
import { mixinTrpcModule } from '#decorators/trpc-module-aspects.js';
import { TrpcRouteMetadata } from '#decorators/trpc-route.js';
import { ControllerOptions } from '#decorators/trpc-controller.js';
import { RouteExtensionMeta } from '#types/types.js';
import { ControllerMeta } from '#types/controller-metadata.js';
import { TrpcRouteMeta } from '#types/trpc-route-data.js';
import { InvalidInterceptor } from '../error/trpc-errors.js';
import { isControllerDecorator, isInterceptor, isTrpcRoute } from '#types/type.guards.js';
import { TRPC_HTTP_INTERCEPTORS } from '#types/types.js';
import { TrpcRouteService } from '#services/route.service.js';
import { normalizeGuards } from '#utils/prepare-guards.js';

@injectable()
export class TrpcRouteExtension implements Extension<RouteExtensionMeta> {
  protected routeExtensionMeta: RouteExtensionMeta;

  constructor(protected resolvedModuleMeta: ResolvedModuleMeta<TrpcResolvedModuleMeta>) {}

  async stage1() {
    const trpcResolvedModuleMeta = this.resolvedModuleMeta.deepImportedModules.get(mixinTrpcModule)!;
    this.routeExtensionMeta = new RouteExtensionMeta();
    this.routeExtensionMeta.meta = trpcResolvedModuleMeta.meta;
    this.routeExtensionMeta.normalizedModuleMeta = this.resolvedModuleMeta.normalizedModuleMeta;
    this.routeExtensionMeta.controllersMeta = this.getControllersMetadata(trpcResolvedModuleMeta);
    this.routeExtensionMeta.guardsPerMod = trpcResolvedModuleMeta.guardsPerMod;
    // this.routeExtensionMeta.guardsPerMod = [];

    return this.routeExtensionMeta;
  }

  protected getControllersMetadata(trpcResolvedModuleMeta: TrpcResolvedModuleMeta) {
    const controllersMeta: ControllerMeta[] = [];

    for (const Controller of trpcResolvedModuleMeta.meta.controllers as Class<Record<string | symbol, any>>[]) {
      const classMeta = Reflector.collectMeta(Controller)!;
      for (const methodName of classMeta) {
        for (const decoratorMeta of classMeta[methodName].decorators) {
          if (!isTrpcRoute(decoratorMeta)) {
            continue;
          }
          const methodAsToken = Controller.prototype[methodName];
          const providersPerRou: Provider[] = [TrpcRouteService, { useFactory: [Controller, methodAsToken] }];
          const providersPerReq: Provider[] = [];
          const route = decoratorMeta.value as TrpcRouteMetadata;
          const ctrlDecorator = classMeta.constructor.decorators.find(isControllerDecorator);
          const guards = normalizeGuards(route.guards);
          providersPerRou.push(...(ctrlDecorator?.value.providersPerRou || []));
          providersPerReq.push(...((ctrlDecorator?.value as ControllerOptions).providersPerReq || []));

          for (const Interceptor of route.interceptors) {
            if (isInterceptor(Interceptor)) {
              providersPerReq.push({ token: TRPC_HTTP_INTERCEPTORS, useClass: Interceptor, multi: true });
            } else {
              const whatIsThis = inspect(Interceptor, false, 3);
              throw new InvalidInterceptor(whatIsThis);
            }
          }

          const routeMeta: TrpcRouteMeta = {
            Controller,
            methodName,
          };
          providersPerRou.push({ token: TrpcRouteMeta, useValue: routeMeta });
          controllersMeta.push({
            providersPerRou,
            providersPerReq,
            routeMeta,
            guards,
            interceptors: route.interceptors,
          });
        }
      }
    }

    return controllersMeta;
  }
}
