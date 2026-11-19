import type { AnyObj } from '@holu/core';
import { Injector } from '@holu/core';
import type { inferProcedureInput, inferProcedureOutput } from '@trpc/server';
import { initTRPC } from '@trpc/server';

import { TrpcRouteMeta } from '#types/trpc-route-data.js';
import type { TrpcOpts } from '#types/types.js';
import { TrpcRouteService } from './route.service.js';

type Equal<Actual, Expected> = (<T>() => T extends Actual ? 1 : 2) extends <T>() => T extends Expected ? 1 : 2 ? true : false;

function expectType<T extends true>() {}

const t = initTRPC.create();

class TestRouteService<Input = void> extends TrpcRouteService<AnyObj, Input> {
  constructor(methodAsToken: (...args: any[]) => unknown, handlerPerReq: (opts: TrpcOpts) => unknown) {
    super(t, Injector.resolveAndCreate([]));
    this.setHandlerPerReq(
      new TrpcRouteMeta(),
      Injector.resolve([{ token: methodAsToken, useValue: null }]),
      () =>
        ({ next }) =>
          next(),
      handlerPerReq,
    );
  }
}

describe('TrpcRouteService', () => {
  it.each(['diQuery', 'diMutation'] as const)('%s preserves native procedure types and the declared input', async (method) => {
    const handler = () => 'result';
    const service = new TestRouteService(handler, handler);
    const procedure = service[method](handler);
    const nativeProcedure = t.procedure.query(handler);

    // Compare the whole definition so errorShape and future tRPC fields cannot be silently discarded.
    expectType<Equal<typeof procedure._def.$types, typeof nativeProcedure._def.$types>>();
    expectType<Equal<inferProcedureInput<typeof procedure>, void>>();
    expectType<Equal<inferProcedureOutput<typeof procedure>, string>>();

    const typedService = new TestRouteService<{ id: string }>(handler, handler);
    const typedProcedure = typedService[method](handler);
    expectType<Equal<inferProcedureInput<typeof typedProcedure>, { id: string }>>();

    const caller = t.router({ route: procedure }).createCaller({});
    await expect(caller.route()).resolves.toBe('result');
  });

  it.each(['diInputAndQuery', 'diInputAndMutation'] as const)('%s preserves parser input and native error types', async (method) => {
    const parser = {
      _input: '',
      _output: 0,
      parse(value: unknown) {
        if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value))) {
          throw new Error('Expected a numeric string');
        }
        return Number(value);
      },
    };
    const handler = () => 'result';
    const service = new TestRouteService(handler, (opts) => `parsed: ${opts.input}`);
    const procedure = service[method](parser, handler);
    const nativeProcedure = t.procedure.input(parser).query(handler);

    expectType<Equal<typeof procedure._def.$types, typeof nativeProcedure._def.$types>>();
    expectType<Equal<inferProcedureInput<typeof procedure>, string>>();
    expectType<Equal<inferProcedureOutput<typeof procedure>, string>>();

    const caller = t.router({ route: procedure }).createCaller({});
    await expect(caller.route('42')).resolves.toBe('parsed: 42');
    await expect(caller.route('invalid')).rejects.toThrow('Expected a numeric string');
  });
});
