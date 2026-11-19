import type { AnyObj, ClassFactoryProvider, Override, ResolvedProvider } from '@holu/core';
import { inject, injectable, Injector } from '@holu/core';
import type { AnyMiddlewareFunction, TRPCMutationProcedure, TRPCQueryProcedure, TRPCProcedureBuilder } from '@trpc/server';
import type { ParserWithInputOutput, UnsetMarker } from '@trpc/server/unstable-core-do-not-import';

import { TRPC_ROOT } from '#types/constants.js';
import type { TrpcOpts, TrpcRootObject } from '#types/types.js';
import type { TrpcRouteMeta } from '#types/trpc-route-data.js';

/**
 * Preserve tRPC's procedure definition, including error types, when supplying types known through DI.
 */
type DiProcedureDef<Context extends AnyObj, Input, Output> =
  ReturnType<TrpcRootObject<Context>['procedure']['query']> extends TRPCQueryProcedure<infer Def>
    ? Override<Def, { input: Input; output: Output; meta: AnyObj }>
    : never;

@injectable()
export class TrpcRouteService<Context extends AnyObj = AnyObj, Input = void> {
  /**
   * This procedure builder should be used when you perform input validation directly in the code instead of in interceptors.
   */
  get procedure() {
    return this.#procedure.use(this.middlewarePerRou()) as TRPCProcedureBuilder<
      Context,
      object,
      object,
      UnsetMarker,
      Input extends void ? UnsetMarker : Input,
      UnsetMarker,
      UnsetMarker,
      false
    >;
  }
  /**
   * This procedure builder should be used when input validation takes place automatically in interceptors.
   */
  get procedureAfterInput() {
    return this.#procedure.input((val) => val).use(this.middlewarePerRou()) as TRPCProcedureBuilder<
      Context,
      object,
      object,
      UnsetMarker,
      Input extends void ? UnsetMarker : Input,
      UnsetMarker,
      UnsetMarker,
      false
    >;
  }
  protected middlewarePerRou: () => AnyMiddlewareFunction;
  protected handlerPerReq: (opts: TrpcOpts) => any;
  protected resolvedPerReq: ResolvedProvider[];
  protected routeMeta: TrpcRouteMeta;
  #procedure: TrpcRootObject<Context>['procedure'];

  constructor(
    @inject(TRPC_ROOT) protected t: TrpcRootObject<any>,
    protected injectorPerRou: Injector,
  ) {
    this.#procedure = t.procedure;
  }

  /**
   * Performs a `query` request using the DI injector. This means that this method
   * is not equivalent to `t.procedure.query()`. It also means that for this method to work correctly,
   * you must first provide a {@link ClassFactoryProvider } to DI in the following format:
   * 
```ts
{ useFactory: [YourService, YourService.prototype.methodName] }
```
   *
   * Then you can use its token in this method: `routeService.diQuery(YourService.prototype.methodName)`.
   * In this case, DI will create an instance of `YourService` and execute the specified method on each request.
   * 
   * @see [Example on github](https://github.com/holujs/holu/blob/main/examples/18-trpc-server/src/app/modules/post/post.controller.ts)
   * 
   * @param methodAsToken Class method as a DI token in the format `ClassName.prototype.methodName`.
   */
  diQuery<R>(methodAsToken: (...args: any[]) => R) {
    const query = this.getHandler<R>(methodAsToken);
    return this.#procedure.query(query) as TRPCQueryProcedure<DiProcedureDef<Context, Input, R>>;
  }

  /**
   * Performs a `query` request using the DI injector. This means that this method
   * is not equivalent to `t.procedure.query()`. It also means that for this method to work correctly,
   * you must first provide a {@link ClassFactoryProvider } to DI in the following format:
   * 
```ts
{ useFactory: [YourService, YourService.prototype.methodName] }
```
   *
   * Then you can use its token in this method: `routeService.diInputAndQuery(z.any(), YourService.prototype.methodName)`.
   * In this case, DI will create an instance of `YourService` and execute the specified method on each request.
   * 
   * @see [Example on github](https://github.com/holujs/holu/blob/main/examples/18-trpc-server/src/app/modules/post/post.controller.ts)
   * 
   * @param methodAsToken Class method as a DI token in the format `ClassName.prototype.methodName`.
   */
  diInputAndQuery<Input, Output, R>(input: ParserWithInputOutput<Input, Output>, methodAsToken: (...args: any[]) => R) {
    const query = this.getHandler<R>(methodAsToken);
    return this.#procedure.input(input).query(query) as TRPCQueryProcedure<DiProcedureDef<Context, Input, R>>;
  }

  /**
   * Performs a `mutation` request using the DI injector. This means that this method
   * is not equivalent to `t.procedure.mutation()`. It also means that for this method to work correctly,
   * you must first provide a {@link ClassFactoryProvider } to DI in the following format:
   * 
```ts
{ useFactory: [YourService, YourService.prototype.methodName] }
```
   *
   * Then you can use its token in this method: `routeService.diMutation(YourService.prototype.methodName)`.
   * In this case, DI will create an instance of `YourService` and execute the specified method on each request.
   * 
   * @see [Example on github](https://github.com/holujs/holu/blob/main/examples/18-trpc-server/src/app/modules/post/post.controller.ts)
   * 
   * @param methodAsToken Class method as a DI token in the format `ClassName.prototype.methodName`.
   */
  diMutation<R>(methodAsToken: (...args: any[]) => R) {
    const mutation = this.getHandler<R>(methodAsToken);
    return this.#procedure.input((val) => val).mutation(mutation) as TRPCMutationProcedure<DiProcedureDef<Context, Input, R>>;
  }

  /**
   * Performs a `mutation` request using the DI injector. This means that this method
   * is not equivalent to `t.procedure.mutation()`. It also means that for this method to work correctly,
   * you must first provide a {@link ClassFactoryProvider } to DI in the following format:
   * 
```ts
{ useFactory: [YourService, YourService.prototype.methodName] }
```
   *
   * Then you can use its token in this method: `routeService.diInputAndMutation(z.any(), YourService.prototype.methodName)`.
   * In this case, DI will create an instance of `YourService` and execute the specified method on each request.
   * 
   * @see [Example on github](https://github.com/holujs/holu/blob/main/examples/18-trpc-server/src/app/modules/post/post.controller.ts)
   * 
   * @param methodAsToken Class method as a DI token in the format `ClassName.prototype.methodName`.
   */
  diInputAndMutation<Input, Output, R>(input: ParserWithInputOutput<Input, Output>, methodAsToken: (...args: any[]) => R) {
    const mutation = this.getHandler<R>(methodAsToken);
    return this.#procedure.input(input).mutation(mutation) as TRPCMutationProcedure<DiProcedureDef<Context, Input, R>>;
  }

  protected getHandler<R>(fn: (...args: any[]) => R) {
    const resolvedHandler = this.resolvedPerReq.find((rp) => rp.dualKey.token === fn);
    if (!resolvedHandler) {
      throw new Error(`${fn.name} not found in "providersPerReq" array`);
    }

    this.routeMeta.resolvedHandler = resolvedHandler;
    return this.handlerPerReq;
  }

  protected setHandlerPerReq(
    routeMeta: TrpcRouteMeta,
    resolvedPerReq: ResolvedProvider[],
    middlewarePerRou: () => AnyMiddlewareFunction,
    handlerPerReq: (opts: TrpcOpts) => any,
  ) {
    this.routeMeta = routeMeta;
    this.resolvedPerReq = resolvedPerReq;
    this.middlewarePerRou = middlewarePerRou;
    this.handlerPerReq = handlerPerReq;
  }
}

/**
 * Opens protected properties.
 */
export class InternalTrpcRouteService extends TrpcRouteService {
  override setHandlerPerReq(
    routeMeta: TrpcRouteMeta,
    resolvedPerReq: ResolvedProvider[],
    middlewarePerRou: () => AnyMiddlewareFunction,
    handlerPerReq: (opts: TrpcOpts) => any,
  ) {
    return super.setHandlerPerReq(routeMeta, resolvedPerReq, middlewarePerRou, handlerPerReq);
  }
}
