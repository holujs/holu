import {
  injectable,
  Extension,
  ExtensionManager,
  ExtensionGroupMeta,
  getDebugClassName,
  Injector,
  Provider,
  DepsChecker,
  SystemLogMediator,
  fromSelf,
  ResolvedProvider,
  ModuleScopedResolvedGuard,
  ModuleRegistry,
  ClassFactoryProvider,
  getToken,
  Context,
} from '@holu/core';
import { inspect } from 'node:util';
import type { AnyMiddlewareFunction } from '@trpc/server';

import { RouteExtensionMeta } from '#types/types.js';
import { TrpcRouteExtension } from './trpc-route.extension.js';
import { TrpcHttpBackend, TrpcHttpFrontend } from '#interceptors/tokens-and-types.js';
import { TRPC_HTTP_INTERCEPTORS, RAW_REQ, RAW_RES } from '#types/types.js';
import { ControllerMeta } from '#types/controller-metadata.js';
import { RequestScopedGuardedInterceptor } from '#interceptors/interceptor-with-guards.js';
import { TrpcRouteMeta } from '#types/trpc-route-data.js';
import { TrpcChainMaker } from '#interceptors/chain-maker.js';
import { ModuleScopedGuard } from '#interceptors/trpc-guard.js';
import { RawRequest, RawResponse } from '#services/request.js';
import { HttpErrorHandler } from '#services/http-error-handler.js';
import { CheckingDepsInSandboxFailed, GuardNotFound, InvalidInterceptor } from '../error/trpc-errors.js';
import { DefaultTrpcHttpBackend } from '#interceptors/default-http-backend.js';
import { DefaultTrpcHttpFrontend } from '#interceptors/default-http-frontend.js';
import { RouteScopedDefaultTrpcHttpBackend } from '#interceptors/default-ctx-http-backend.js';
import { RouteScopedDefaultTrpcHttpFrontend } from '#interceptors/default-ctx-http-frontend.js';
import { RouteScopedDefaultTrpcChainMaker } from '#interceptors/default-ctx-chain-maker.js';
import { InternalTrpcRouteService, TrpcRouteService } from '#services/route.service.js';
import { TRPC_OPTS } from '#types/constants.js';
import { TrpcOpts } from '#types/types.js';
import { getResolvedGuards } from '#utils/prepare-guards.js';
import { RouteScopedGuardedInterceptor } from '#interceptors/interceptor-with-guards-per-rou.js';
import { isInterceptor } from '#types/type.guards.js';
import { defaultProvidersPerReq } from '#providers/default-providers-per-req.js';
import { defaultProvidersPerRou } from '#providers/default-providers-per-rou.js';

@injectable()
export class TrpcRequestDispatcherExtension implements Extension<void> {
  protected extensionGroupMeta: ExtensionGroupMeta<RouteExtensionMeta>;
  protected injectorPerMod: Injector;
  protected injectorPerApp: Injector;

  constructor(
    protected extensionManager: ExtensionManager,
    protected moduleRegistry: ModuleRegistry,
  ) {}

  async stage1() {
    this.extensionGroupMeta = await this.extensionManager.stage1(TrpcRouteExtension);
    this.addDefaultProviders(this.extensionGroupMeta.groupData);
  }

  async stage2(injectorPerMod: Injector) {
    this.injectorPerMod = injectorPerMod;
  }

  async stage3() {
    this.prepareRoutesMeta(this.extensionGroupMeta.groupData);
  }

  protected addDefaultProviders(routeExtensionsMeta: RouteExtensionMeta[]) {
    // Since each extension received the same `meta` array and not a copy of it,
    // we can take `meta` from any element in the `groupData` array.
    const routeExtensionMeta = routeExtensionsMeta.at(0);
    if (!routeExtensionMeta) {
      return;
    }

    routeExtensionMeta.meta.providersPerReq.unshift(
      { token: TrpcHttpBackend, useClass: DefaultTrpcHttpBackend },
      { token: TrpcHttpFrontend, useClass: DefaultTrpcHttpFrontend },
      TrpcChainMaker,
      ...defaultProvidersPerReq,
    );

    routeExtensionMeta.meta.providersPerRou.unshift(
      { token: TrpcHttpBackend, useClass: RouteScopedDefaultTrpcHttpBackend },
      { token: TrpcChainMaker, useClass: RouteScopedDefaultTrpcChainMaker },
      { token: TrpcHttpFrontend, useClass: RouteScopedDefaultTrpcHttpFrontend },
      ...defaultProvidersPerRou,
    );
  }

  protected prepareRoutesMeta(routeExtensionsMeta: RouteExtensionMeta[]) {
    routeExtensionsMeta.forEach((routeExtensionMeta) => {
      if (!routeExtensionMeta.controllersMeta.length) {
        // No routes from this extension.
        return;
      }

      const { controllersMeta } = routeExtensionMeta;

      controllersMeta.forEach((controllerMeta) => {
        this.setHandlerPerReq(routeExtensionMeta, this.injectorPerMod, controllerMeta);
      });
    });
  }

  protected getHandlerPerRou(
    routeExtensionMeta: RouteExtensionMeta,
    injectorPerMod: Injector,
    controllerMeta: ControllerMeta,
  ): AnyMiddlewareFunction {
    const { providersPerRou, routeMeta: baseRouteMeta } = controllerMeta;

    const routeMeta = baseRouteMeta as typeof baseRouteMeta;
    const mergedPerRou: Provider[] = [];
    mergedPerRou.push({ token: TRPC_HTTP_INTERCEPTORS, useToken: TrpcHttpFrontend as any, multi: true });
    const controllerName = getDebugClassName(routeMeta.Controller) || 'unknown';

    if (routeExtensionMeta.guardsPerMod.length || controllerMeta.guards.length) {
      mergedPerRou.push(RouteScopedGuardedInterceptor);
      mergedPerRou.push({ token: TRPC_HTTP_INTERCEPTORS, useToken: RouteScopedGuardedInterceptor, multi: true });
    }

    for (const Interceptor of controllerMeta.interceptors) {
      if (isInterceptor(Interceptor)) {
        providersPerRou.push({ token: TRPC_HTTP_INTERCEPTORS, useClass: Interceptor, multi: true });
      } else {
        const whatIsThis = inspect(Interceptor, false, 3).slice(0, 500);
        throw new InvalidInterceptor(whatIsThis);
      }
    }
    mergedPerRou.push(...routeExtensionMeta.meta.providersPerRou, ...providersPerRou);

    const resolvedPerRou = Injector.resolve(mergedPerRou);
    routeMeta.resolvedGuards = getResolvedGuards(controllerMeta.guards, resolvedPerRou);
    routeMeta.resolvedGuardsPerMod = this.getResolvedGuardsPerMod(routeExtensionMeta.guardsPerMod, controllerName);
    const injectorPerRou = injectorPerMod.createChildFromResolved(resolvedPerRou, 'Rou');
    this.checkDeps(injectorPerRou, routeMeta, controllerName);
    const resolvedTrpcChainMaker = resolvedPerRou.find((rp) => rp.dualKey.token === TrpcChainMaker)!;
    const resolvedErrHandler = resolvedPerRou.find((rp) => rp.dualKey.token === HttpErrorHandler)!;
    const chainMaker = injectorPerRou.instantiateResolved<RouteScopedDefaultTrpcChainMaker>(resolvedTrpcChainMaker);
    const errorHandler = injectorPerRou.instantiateResolved(resolvedErrHandler) as HttpErrorHandler;

    if (this.hasInterceptors(mergedPerRou)) {
      return (async (opts) => {
        const result = await chainMaker.makeChain(opts).handle(); // First HTTP handler in the chain of HTTP interceptors.
        // .catch((err) => {
        //   return errorHandler.handleError(err, ctx);
        // })
        return opts.next(result);
      }) as AnyMiddlewareFunction;
    } else {
      return this.handleWithoutInterceptors(errorHandler);
    }
  }

  protected hasInterceptors(mergedPerRou: Provider[]) {
    const interceptors = mergedPerRou.filter((p) => {
      const token = getToken(p);
      return token === TRPC_HTTP_INTERCEPTORS || token === TrpcHttpBackend;
    });

    // The application has two default interceptors.
    return interceptors.length > 2;
  }

  protected handleWithoutInterceptors(errorHandler: HttpErrorHandler) {
    // const interceptor = new RouteScopedDefaultTrpcHttpFrontend();
    return (async (opts) => {
      // try {
      //   interceptor.before(ctx).after(ctx, await routeHandler(ctx));
      // } catch (err: any) {
      //   await errorHandler.handleError(err, ctx);
      // }
      // const val = await routeHandler(opts);
      // const result = await interceptor.before(ctx).after(ctx, val);
      return opts.next();
    }) as AnyMiddlewareFunction;
  }

  protected setHandlerPerReq(routeExtensionMeta: RouteExtensionMeta, injectorPerMod: Injector, controllerMeta: ControllerMeta) {
    const { providersPerRou, providersPerReq, routeMeta } = controllerMeta;
    const mergedPerRou: Provider[] = [...routeExtensionMeta.meta.providersPerRou, ...providersPerRou];
    const injectorPerRou = injectorPerMod.resolveAndCreateChild(mergedPerRou, 'Rou');

    const mergedPerReq: Provider[] = [];
    mergedPerReq.push({ token: TRPC_HTTP_INTERCEPTORS, useToken: TrpcHttpFrontend as any, multi: true });
    if (routeExtensionMeta.guardsPerMod.length || controllerMeta.guards.length) {
      mergedPerReq.push(RequestScopedGuardedInterceptor);
      mergedPerReq.push({ token: TRPC_HTTP_INTERCEPTORS, useToken: RequestScopedGuardedInterceptor, multi: true });
    }
    mergedPerReq.push(...routeExtensionMeta.meta.providersPerReq, ...providersPerReq);

    const resolvedPerReq = Injector.resolve(mergedPerReq);
    const controllerName = getDebugClassName(routeMeta.Controller) || 'unknown';
    routeMeta.resolvedGuards = getResolvedGuards(controllerMeta.guards, resolvedPerReq);
    routeMeta.resolvedGuardsPerMod = this.getResolvedGuardsPerMod(routeExtensionMeta.guardsPerMod, controllerName, true);
    const injPerReq = injectorPerRou.createChildFromResolved(resolvedPerReq, 'Req');
    // routeMeta.resolvedHandler = this.getResolvedHandler(routeMeta, resolvedPerReq);
    this.checkDeps(injPerReq, routeMeta, controllerName);
    const resolvedTrpcChainMaker = resolvedPerReq.find((rp) => rp.dualKey.token === TrpcChainMaker)!;
    const RegistryPerReq = Injector.prepareRegistry(resolvedPerReq);

    const handlerPerReq = async (opts: TrpcOpts<any, any>) => {
      const rawReq: RawRequest = opts.ctx.req;
      const rawRes: RawResponse = opts.ctx.res;
      const injector = new Injector(RegistryPerReq, 'Req', injectorPerRou);
      (injector.get(Context) as Context).set(TRPC_OPTS, opts).set(RAW_REQ, rawReq).set(RAW_RES, rawRes);
      return injector.instantiateResolved<TrpcChainMaker>(resolvedTrpcChainMaker).makeChain(opts).handle(); // First HTTP handler in the chain of HTTP interceptors.
      // .catch((err) => {
      //   const errorHandler = injector.instantiateResolved(resolvedErrHandler) as HttpErrorHandler;
      //   return errorHandler.handleError(err, ctx);
      // });
    };

    const routeService = injectorPerRou.get(TrpcRouteService) as InternalTrpcRouteService;
    const middlewarePerRou = () => this.getHandlerPerRou(routeExtensionMeta, injectorPerMod, controllerMeta);
    routeService.setHandlerPerReq(routeMeta, resolvedPerReq, middlewarePerRou, handlerPerReq);

    const methodAsToken = routeMeta.Controller.prototype[routeMeta.methodName];
    const ctx = injectorPerMod.get(Context) as Context;
    ctx.set(methodAsToken, injectorPerRou.get(methodAsToken));
  }

  /**
   * Used as "sandbox" to test resolvable of controllers, guards and HTTP interceptors.
   */
  protected checkDeps(inj: Injector, routeMeta: TrpcRouteMeta, controllerName: string) {
    try {
      const ignoreDeps: any[] = [TRPC_HTTP_INTERCEPTORS, TrpcRouteService];
      DepsChecker.check(inj, HttpErrorHandler, undefined, ignoreDeps);
      DepsChecker.check(inj, TrpcChainMaker, undefined, ignoreDeps);
      DepsChecker.check(inj, TrpcHttpFrontend, undefined, ignoreDeps);
      DepsChecker.check(inj, SystemLogMediator, undefined, ignoreDeps);
      routeMeta.resolvedGuards!.forEach((item) => DepsChecker.checkForResolved(inj, item.guard, ignoreDeps));
      DepsChecker.check(inj, TrpcHttpBackend, undefined, ignoreDeps);
      if (routeMeta?.resolvedHandler) {
        DepsChecker.checkForResolved(inj, routeMeta.resolvedHandler, ignoreDeps);
      }
      DepsChecker.check(inj, TRPC_HTTP_INTERCEPTORS, fromSelf, ignoreDeps);
    } catch (cause: any) {
      throw new CheckingDepsInSandboxFailed(cause, controllerName);
    }
  }

  protected getResolvedHandler(routeMeta: TrpcRouteMeta, resolvedProviders: ResolvedProvider[]) {
    const { Controller, methodName } = routeMeta;
    const factoryProvider: ClassFactoryProvider = { useFactory: [Controller, Controller.prototype[methodName]] };
    const resolvedHandler = Injector.resolve([factoryProvider])[0];
    return resolvedProviders.concat([resolvedHandler]).find((rp) => rp.dualKey.token === Controller.prototype[methodName]);
  }

  protected getResolvedGuardsPerMod(guards: ModuleScopedGuard[], controllerName: string, perReq?: boolean) {
    return guards.map((g) => {
      const resolvedPerMod = Injector.resolve(g.normalizedModuleMeta.providersPerMod);
      const resolvedPerRou = Injector.resolve(g.meta.providersPerRou);
      const resolvedPerReq = Injector.resolve(g.meta.providersPerReq);
      const resolvedProviders = perReq ? resolvedPerReq.concat(resolvedPerRou, resolvedPerMod) : resolvedPerRou.concat(resolvedPerMod);

      const guard = resolvedProviders.find((rp) => rp.dualKey.token === g.guard);

      if (!guard) {
        const levels = ['providersPerRou', 'providersPerMod'];
        if (perReq) {
          levels.push('providersPerReq');
        }
        const levelNames = levels.join(' and ');
        throw new GuardNotFound(g.normalizedModuleMeta.name, controllerName, g.guard.name, levelNames, perReq);
      }

      const injectorPerMod = this.moduleRegistry.injectorStore.getInjectorPerMod(g.normalizedModuleMeta.modRefId, true);
      const injectorPerRou = injectorPerMod.createChildFromResolved(resolvedPerRou, 'Rou');

      const resolvedGuard: ModuleScopedResolvedGuard = {
        guard,
        injectorPerRou,
        resolvedPerReq,
        params: g.params,
      };

      return resolvedGuard;
    });
  }
}
