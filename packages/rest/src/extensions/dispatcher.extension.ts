import {
  Injector,
  fromSelf,
  injectable,
  DepsChecker,
  SystemLogMediator,
  ExtensionContext,
  ExtensionManager,
  Extension,
  Provider,
  ExtensionGroupMeta,
  AppExtensionGroupMeta,
  FactoryProvider,
  ResolvedGuard,
  ResolvedProvider,
  ModuleScopedResolvedGuard,
  RequireProps,
  getToken,
  ModuleRegistry,
  HttpMethod,
  getDebugClassName,
} from '@holu/core';

import { routeChannel } from '#diagnostics-channel';
import { RouteExtensionMeta, PreparedRouteMeta } from '../types/types.js';
import { HTTP_INTERCEPTORS } from '../top/constants.js';
import { ControllerMeta } from '../types/controller-metadata.js';
import { RouteScopedGuardedInterceptor } from '#interceptors/route-scoped-guarded.interceptor.js';
import { RequestScopedGuardedInterceptor } from '#interceptors/request-scoped-guarded.interceptor.js';
import { RouteMeta } from '../types/route-data.js';
import { ChainMaker } from '#interceptors/chain-maker.js';
import { RequestScopedHttpBackend } from '#interceptors/request-scoped-http-backend.js';
import { RouteScopedHttpBackendImpl } from '#interceptors/route-scoped-http-backend.js';
import { RouteScopedChainMaker } from '#interceptors/route-scoped-chain-maker.js';
import { RouteScopedHttpFrontend } from '#interceptors/route-scoped-http-frontend.js';
import { RequestScopedHttpFrontend } from '#interceptors/request-scoped-http-frontend.js';
import { HttpBackend, HttpFrontend } from '#interceptors/tokens-and-types.js';
import { ModuleScopedGuard, NormalizedGuard } from '#interceptors/guard.js';
import { RouteHandler, Router } from '#services/router.js';
import { HttpErrorHandler } from '#services/http-error-handler.js';
import { RequestContext } from '#services/request-context.js';
import { RestRouteExtension } from './rest-route.extension.js';
import { CheckingDepsInSandboxFailed, GuardNotFound, InvalidConfigurationOfRoute } from '#errors';
import { RouteContext } from '#services/route-context.js';
import { RequestDispatcher } from '#services/request-dispatcher.js';

@injectable()
export class DispatcherExtension implements Extension<void> {
  protected extensionGroupMeta: ExtensionGroupMeta<RouteExtensionMeta>;
  protected injectorPerMod: Injector;

  constructor(
    protected extensionManager: ExtensionManager,
    protected moduleRegistry: ModuleRegistry,
    protected log: SystemLogMediator,
    protected extensionContext: ExtensionContext,
    protected requestDispatcher: RequestDispatcher,
  ) {}

  async stage1() {
    this.extensionGroupMeta = await this.extensionManager.stage1(RestRouteExtension);
    this.addDefaultProviders(this.extensionGroupMeta.groupData);
  }

  async stage2(injectorPerMod: Injector) {
    this.injectorPerMod = injectorPerMod;
  }

  async stage3() {
    const preparedRouteMeta = this.prepareRoutesMeta(this.extensionGroupMeta.groupData);
    this.setRoutes(this.extensionGroupMeta, preparedRouteMeta);
  }

  protected addDefaultProviders(routeExtensionsMeta: RouteExtensionMeta[]) {
    // Since each extension received the same `meta` array and not a copy of it,
    // we can take `meta` from any element in the `groupData` array.
    const routeExtensionMeta = routeExtensionsMeta.at(0);
    if (!routeExtensionMeta) {
      return;
    }

    routeExtensionMeta.meta.providersPerReq.unshift(
      { token: HttpBackend, useClass: RequestScopedHttpBackend },
      { token: HttpFrontend, useClass: RequestScopedHttpFrontend },
      ChainMaker,
    );

    routeExtensionMeta.meta.providersPerRou.unshift(
      { token: HttpBackend, useClass: RouteScopedHttpBackendImpl },
      { token: ChainMaker, useClass: RouteScopedChainMaker },
      { token: HttpFrontend, useClass: RouteScopedHttpFrontend },
    );
  }

  protected prepareRoutesMeta(routeExtensionsMeta: RouteExtensionMeta[]) {
    const preparedRouteMeta: PreparedRouteMeta[] = [];

    routeExtensionsMeta.forEach((routeExtensionMeta) => {
      if (!routeExtensionMeta.controllersMeta.length) {
        // No routes from this extension.
        return;
      }

      const { controllersMeta, guardsPerMod } = routeExtensionMeta;

      controllersMeta.forEach((controllerMeta) => {
        let handle: RouteHandler;
        if (controllerMeta.scope == 'route') {
          handle = this.getHandlerPerMod(routeExtensionMeta, this.injectorPerMod, controllerMeta);
        } else {
          handle = this.getHandlerPerReq(routeExtensionMeta, this.injectorPerMod, controllerMeta);
        }

        const countOfGuards = controllerMeta.routeMeta.resolvedGuards!.length + guardsPerMod.length;

        preparedRouteMeta.push({
          moduleName: routeExtensionMeta.normalizedModuleMeta.name,
          httpMethods: controllerMeta.httpMethods,
          fullPath: controllerMeta.fullPath,
          handle,
          countOfGuards,
        });
      });
    });

    return preparedRouteMeta;
  }

  protected getHandlerPerMod(routeExtensionMeta: RouteExtensionMeta, injectorPerMod: Injector, controllerMeta: ControllerMeta) {
    const { providersPerRou, routeMeta: baseRouteMeta, httpMethods, fullPath } = controllerMeta;

    const routeMeta = baseRouteMeta as RequireProps<typeof baseRouteMeta, 'routeHandler'>;
    const mergedPerRou: Provider[] = [];
    mergedPerRou.push({ token: HTTP_INTERCEPTORS, useToken: HttpFrontend, multi: true });
    const controllerName = getDebugClassName(routeMeta.Controller) || 'unknown';

    if (routeExtensionMeta.guardsPerMod.length || controllerMeta.guards.length) {
      mergedPerRou.push(RouteScopedGuardedInterceptor);
      mergedPerRou.push({ token: HTTP_INTERCEPTORS, useToken: RouteScopedGuardedInterceptor, multi: true });
    }
    mergedPerRou.push(...routeExtensionMeta.meta.providersPerRou, ...providersPerRou);

    const resolvedPerRou = Injector.resolve(mergedPerRou);
    routeMeta.resolvedGuards = this.getResolvedGuards(controllerMeta.guards, resolvedPerRou);
    routeMeta.resolvedGuardsPerMod = this.getResolvedGuardsPerMod(
      routeExtensionMeta.guardsPerMod,
      controllerName,
      httpMethods,
      fullPath,
    );
    const injectorPerRou = injectorPerMod.createChildFromResolved(resolvedPerRou, 'Rou');
    this.checkDeps(injectorPerRou, routeMeta, controllerName, httpMethods, fullPath);
    const resolvedChainMaker = resolvedPerRou.find((rp) => rp.dualKey.token === ChainMaker)!;
    const resolvedErrHandler = resolvedPerRou.find((rp) => rp.dualKey.token === HttpErrorHandler)!;
    const chainMaker = injectorPerRou.instantiateResolved<RouteScopedChainMaker>(resolvedChainMaker);
    const ctrl = injectorPerMod.get(routeMeta.Controller);
    const routeHandler = ctrl[routeMeta.methodName].bind(ctrl) as typeof routeMeta.routeHandler;
    routeMeta.routeHandler = routeHandler;
    const errorHandler = injectorPerRou.instantiateResolved(resolvedErrHandler) as HttpErrorHandler;
    const RouteContextClass = injectorPerRou.getAny<typeof RouteContext>(RouteContext);

    if (this.hasInterceptors(mergedPerRou)) {
      return (async (rawReq, rawRes, pathParams, queryString) => {
        const ctx = new RouteContextClass(rawReq, rawRes, pathParams, queryString);
        await chainMaker
          .makeChain(ctx)
          .handle() // First HTTP handler in the chain of HTTP interceptors.
          .catch((err) => {
            return errorHandler.handleError(err, ctx);
          });
      }) as RouteHandler;
    } else {
      return this.handleWithoutInterceptors(RouteContextClass, routeHandler, errorHandler);
    }
  }

  protected hasInterceptors(mergedPerRou: Provider[]) {
    const interceptors = mergedPerRou.filter((p) => {
      const token = getToken(p);
      return token === HTTP_INTERCEPTORS || token === HttpBackend;
    });

    // The application has two default interceptors.
    return interceptors.length > 2;
  }

  protected handleWithoutInterceptors(
    RouteContextClass: typeof RouteContext,
    routeHandler: (ctx: RouteContext) => Promise<any>,
    errorHandler: HttpErrorHandler,
  ) {
    const interceptor = new RouteScopedHttpFrontend();
    return (async (rawReq, rawRes, pathParams, queryString) => {
      const ctx = new RouteContextClass(rawReq, rawRes, pathParams, queryString);
      try {
        interceptor.before(ctx).after(ctx, await routeHandler(ctx));
      } catch (err: any) {
        await errorHandler.handleError(err, ctx);
      }
    }) as RouteHandler;
  }

  protected getHandlerPerReq(routeExtensionMeta: RouteExtensionMeta, injectorPerMod: Injector, controllerMeta: ControllerMeta) {
    const { providersPerRou, providersPerReq, routeMeta, httpMethods: httpMethod, fullPath } = controllerMeta;
    const mergedPerRou = [...routeExtensionMeta.meta.providersPerRou, ...providersPerRou];
    const injectorPerRou = injectorPerMod.resolveAndCreateChild(mergedPerRou, 'Rou');

    const mergedPerReq: Provider[] = [];
    mergedPerReq.push({ token: HTTP_INTERCEPTORS, useToken: HttpFrontend, multi: true });
    if (routeExtensionMeta.guardsPerMod.length || controllerMeta.guards.length) {
      mergedPerReq.push(RequestScopedGuardedInterceptor);
      mergedPerReq.push({ token: HTTP_INTERCEPTORS, useToken: RequestScopedGuardedInterceptor, multi: true });
    }
    mergedPerReq.push(...routeExtensionMeta.meta.providersPerReq, ...providersPerReq);

    const resolvedPerReq = Injector.resolve(mergedPerReq);
    const resolvedPerRou = Injector.resolve(mergedPerRou);
    const controllerName = getDebugClassName(routeMeta.Controller) || 'unknown';
    routeMeta.resolvedGuards = this.getResolvedGuards(controllerMeta.guards, resolvedPerReq);
    routeMeta.resolvedGuardsPerMod = this.getResolvedGuardsPerMod(
      routeExtensionMeta.guardsPerMod,
      controllerName,
      httpMethod,
      fullPath,
      true,
    );
    const injPerReq = injectorPerRou.createChildFromResolved(resolvedPerReq, 'Req');
    routeMeta.resolvedHandler = this.getResolvedHandler(routeMeta, resolvedPerReq);
    this.checkDeps(injPerReq, routeMeta, controllerName, httpMethod, fullPath);
    const resolvedChainMaker = resolvedPerReq.find((rp) => rp.dualKey.token === ChainMaker)!;
    const resolvedErrHandler = resolvedPerReq.concat(resolvedPerRou).find((rp) => rp.dualKey.token === HttpErrorHandler)!;
    const RegistryPerReq = Injector.prepareRegistry(resolvedPerReq);

    return (async (rawReq, rawRes, pathParams, queryString) => {
      const injector = new Injector(RegistryPerReq, 'Req', injectorPerRou);
      const ctx = injector.get(RequestContext).setCtx(rawReq, rawRes, pathParams, queryString);

      await injector
        .instantiateResolved<ChainMaker>(resolvedChainMaker)
        .makeChain(ctx)
        .handle() // First HTTP handler in the chain of HTTP interceptors.
        .catch((err) => {
          const errorHandler = injector.instantiateResolved(resolvedErrHandler) as HttpErrorHandler;
          return errorHandler.handleError(err, ctx);
        });
    }) as RouteHandler;
  }

  protected getResolvedGuardsPerMod(
    guards: ModuleScopedGuard[],
    controllerName: string,
    httpMethod: HttpMethod | HttpMethod[],
    path: string,
    perReq?: boolean,
  ) {
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
        throw new GuardNotFound(g.normalizedModuleMeta.name, controllerName, g.guard.name, httpMethod, path, levelNames, perReq);
      }

      const injectorPerMod = this.moduleRegistry.getInjectorPerMod(g.normalizedModuleMeta.modRefId, true);
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

  protected getResolvedGuards(guards: NormalizedGuard[], resolvedProviders: ResolvedProvider[]) {
    return guards.map((g) => {
      const defaultResolvedGuard = Injector.resolve([g.guard])[0];

      const resolvedGuard: ResolvedGuard = {
        guard: resolvedProviders.concat([defaultResolvedGuard]).find((rp) => rp.dualKey.token === g.guard)!,
        params: g.params,
      };

      return resolvedGuard;
    });
  }

  protected getResolvedHandler(routeMeta: RouteMeta, resolvedPerReq: ResolvedProvider[]) {
    const { Controller, methodName } = routeMeta;
    const factoryProvider: FactoryProvider = { useFactory: [Controller, Controller.prototype[methodName]] };
    const resolvedHandler = Injector.resolve([factoryProvider])[0];
    return resolvedPerReq.concat([resolvedHandler]).find((rp) => rp.dualKey.token === Controller.prototype[methodName]);
  }

  /**
   * Used as "sandbox" to test resolvable of controllers, guards and HTTP interceptors.
   */
  protected checkDeps(
    inj: Injector,
    routeMeta: RouteMeta,
    controllerName: string,
    httpMethod: HttpMethod | HttpMethod[],
    path: string,
  ) {
    try {
      const ignoreDeps: any[] = [HTTP_INTERCEPTORS];
      DepsChecker.check(inj, HttpErrorHandler, undefined, ignoreDeps);
      DepsChecker.check(inj, ChainMaker, undefined, ignoreDeps);
      DepsChecker.check(inj, HttpFrontend, undefined, ignoreDeps);
      DepsChecker.check(inj, SystemLogMediator, undefined, ignoreDeps);
      routeMeta.resolvedGuards!.forEach((item) => DepsChecker.checkForResolved(inj, item.guard, ignoreDeps));
      DepsChecker.check(inj, HttpBackend, undefined, ignoreDeps);
      if (routeMeta?.resolvedHandler) {
        DepsChecker.checkForResolved(inj, routeMeta.resolvedHandler, ignoreDeps);
      }
      DepsChecker.check(inj, HTTP_INTERCEPTORS, fromSelf, ignoreDeps);
    } catch (cause: any) {
      throw new CheckingDepsInSandboxFailed(cause, controllerName, httpMethod, path);
    }
  }

  protected setRoutes(extensionGroupMeta: ExtensionGroupMeta<RouteExtensionMeta>, preparedRouteMeta: PreparedRouteMeta[]) {
    const router = this.injectorPerMod.get(Router);
    if (!extensionGroupMeta.delay) {
      const appHasRoutes = this.checkPresenceOfRoutesInApplication(extensionGroupMeta.groupDataPerApp);
      if (!appHasRoutes) {
        this.log.noRoutes(this);
        return;
      }
    }

    preparedRouteMeta.forEach((data) => {
      const { moduleName, fullPath, httpMethods, handle, countOfGuards } = data;

      if (fullPath?.charAt(0) == '/') {
        throw new InvalidConfigurationOfRoute(moduleName, fullPath);
      }

      httpMethods.forEach((httpMethod) => {
        this.log.printRoute(this, httpMethod, fullPath, countOfGuards);
        routeChannel('holu.route').publish({ moduleName, httpMethod, fullPath, countOfGuards });
        this.requestDispatcher.assertSupportedMethods(httpMethod, fullPath);
        if (httpMethod == 'ALL') {
          router.all(`/${fullPath}`, handle);
        } else {
          router.on(httpMethod, `/${fullPath}`, handle);
        }
      });
    });
  }

  protected checkPresenceOfRoutesInApplication(groupDataPerApp: AppExtensionGroupMeta<RouteExtensionMeta>[]) {
    return groupDataPerApp.reduce((prev1, curr1) => {
      return prev1 || curr1.groupData.reduce((prev2, curr2) => prev2 || Boolean(curr2.controllersMeta.length), false);
    }, false);
  }
}
