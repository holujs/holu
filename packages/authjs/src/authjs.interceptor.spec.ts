import { jest } from '@jest/globals';
import type * as AuthCore from '@auth/core';
import type * as HoluRest from '@holu/rest';
import type { HttpHandler, RequestContext } from '@holu/rest';
import { AuthjsConfig } from './authjs.config.js';

let mockAuthResponse: Response;
const applyResponseSpy = jest.fn(async (_res: any, _rawRes: any) => {});
const applyHeadersSpy = jest.fn((_res: any, _rawRes: any) => {});

jest.unstable_mockModule('@auth/core', async () => {
  const mod = await jest.requireActual<typeof AuthCore>('@auth/core');
  return {
    ...mod,
    Auth: jest.fn(async () => mockAuthResponse),
  };
});

jest.unstable_mockModule('@holu/rest', async () => {
  const mod = await jest.requireActual<typeof HoluRest>('@holu/rest');
  return {
    ...mod,
    applyResponse: applyResponseSpy,
    applyHeaders: applyHeadersSpy,
  };
});

import type * as AuthjsInterceptorType from './authjs.interceptor.js';

const { AuthjsInterceptor } = await import('./authjs.interceptor.js');

describe('AuthjsInterceptor', () => {
  let interceptor: AuthjsInterceptorType.AuthjsInterceptor;
  let config: AuthjsConfig;
  let nextHandler: HttpHandler;
  let reqCtx: RequestContext;

  beforeEach(() => {
    jest.clearAllMocks();
    config = new AuthjsConfig();
    interceptor = new AuthjsInterceptor(config);
    nextHandler = { handle: jest.fn<HttpHandler['handle']>().mockResolvedValue('next-result') };
    reqCtx = {
      protocol: 'http',
      rawReq: {
        url: '/api/auth/session',
        method: 'GET',
        headers: {},
      },
      rawRes: {} as any,
    } as unknown as RequestContext;
  });

  it('calls applyResponse and returns when Auth response has a body', async () => {
    mockAuthResponse = new Response('some body content', { status: 200 });

    await interceptor.intercept(nextHandler, reqCtx);

    expect(applyResponseSpy).toHaveBeenCalledWith(mockAuthResponse, reqCtx.rawRes);
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it('calls applyResponse and returns when Auth status is neither OK nor FOUND', async () => {
    mockAuthResponse = new Response(null, { status: 401 });

    await interceptor.intercept(nextHandler, reqCtx);

    expect(applyResponseSpy).toHaveBeenCalledWith(mockAuthResponse, reqCtx.rawRes);
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it('calls applyResponse and returns when status is 302 (FOUND) with an external Location header', async () => {
    const externalUrl = 'https://github.com/login/oauth/authorize?client_id=123';
    const headers = new Headers({ location: externalUrl });
    mockAuthResponse = new Response(null, { status: 302, headers });

    await interceptor.intercept(nextHandler, reqCtx);

    expect(applyResponseSpy).toHaveBeenCalledWith(mockAuthResponse, reqCtx.rawRes);
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it('calls applyResponse and returns when status is 302 (FOUND) with an error parameter in Location header', async () => {
    const headers = new Headers({ location: '/auth/signin?error=CredentialsSignin' });
    mockAuthResponse = new Response(null, { status: 302, headers });

    await interceptor.intercept(nextHandler, reqCtx);

    expect(applyResponseSpy).toHaveBeenCalledWith(mockAuthResponse, reqCtx.rawRes);
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it('calls applyResponse and returns when status is 302 (FOUND) from a form-urlencoded request', async () => {
    reqCtx.rawReq.headers['content-type'] = 'application/x-www-form-urlencoded';
    const headers = new Headers({ location: '/' });
    mockAuthResponse = new Response(null, { status: 302, headers });

    await interceptor.intercept(nextHandler, reqCtx);

    expect(applyResponseSpy).toHaveBeenCalledWith(mockAuthResponse, reqCtx.rawRes);
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it('deletes location header, applies headers, and calls next.handle when status is 302 (FOUND) with relative/internal Location header on JSON API request', async () => {
    const headers = new Headers({ location: '/redirect', 'set-cookie': 'session=abc' });
    mockAuthResponse = new Response(null, { status: 302, headers });

    const result = await interceptor.intercept(nextHandler, reqCtx);

    expect(applyHeadersSpy).toHaveBeenCalled();
    const passedRes: Response = applyHeadersSpy.mock.calls[0][0];
    expect(passedRes.headers.get('location')).toBeNull();
    expect(passedRes.headers.get('set-cookie')).toBe('session=abc');
    expect(nextHandler.handle).toHaveBeenCalled();
    expect(result).toBe('next-result');
  });

  it('applies headers and calls next.handle when status is 200 (OK) with no body', async () => {
    const headers = new Headers({ 'x-custom-header': 'val' });
    mockAuthResponse = new Response(null, { status: 200, headers });

    const result = await interceptor.intercept(nextHandler, reqCtx);

    expect(applyHeadersSpy).toHaveBeenCalledWith(mockAuthResponse, reqCtx.rawRes);
    expect(nextHandler.handle).toHaveBeenCalled();
    expect(result).toBe('next-result');
  });
});
