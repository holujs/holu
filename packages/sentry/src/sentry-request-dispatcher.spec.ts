import { jest } from '@jest/globals';
import { Injector, SystemLogMediator } from '@holu/core';
import { DefaultHeadStrategy, HeadStrategy, Router } from '@holu/rest';

// Mock Sentry
const mockSpan = {
  setStatus: jest.fn(),
};

jest.unstable_mockModule('@sentry/node', () => {
  return {
    withIsolationScope: jest.fn((callback: any) => callback()),
    continueTrace: jest.fn((options: any, callback: any) => callback()),
    startSpan: jest.fn((options: any, callback: any) => callback(mockSpan)),
    captureException: jest.fn(),
  };
});

// Dynamically import code under test
const { SentryRequestDispatcher } = await import('./sentry-request-dispatcher.js');
const Sentry = (await import('@sentry/node')) as any;

describe('SentryRequestDispatcher', () => {
  let dispatcher: any;
  let mockRouter: any;
  let mockSystemLogMediator: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRouter = {
      find: jest.fn(() => ({ handle: jest.fn(() => Promise.resolve()), params: [] })),
    };

    mockSystemLogMediator = {
      internalServerError: jest.fn(),
    };

    const injector = Injector.resolveAndCreate([
      { token: Router, useValue: mockRouter },
      { token: SystemLogMediator, useValue: mockSystemLogMediator },
      { token: HeadStrategy, useClass: DefaultHeadStrategy },
      SentryRequestDispatcher,
    ]);

    dispatcher = injector.get(SentryRequestDispatcher);
  });

  it('should wrap requestListener with isolation scope, continueTrace and startSpan', async () => {
    const rawReq = {
      method: 'GET',
      url: '/users/123?foo=bar',
      headers: {
        'sentry-trace': 'trace-id',
        baggage: 'baggage-data',
      },
    };
    const rawRes = {
      statusCode: 200,
      end: jest.fn(),
    };

    await dispatcher.requestListener(rawReq, rawRes);

    expect(Sentry.withIsolationScope).toHaveBeenCalled();
    expect(Sentry.continueTrace).toHaveBeenCalledWith(
      {
        sentryTrace: 'trace-id',
        baggage: 'baggage-data',
      },
      expect.any(Function),
    );
    expect(Sentry.startSpan).toHaveBeenCalledWith(
      {
        name: 'GET /users/123',
        op: 'http.server',
      },
      expect.any(Function),
    );
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
  });

  it('should capture the exception and send HTTP 500 when the handler rejects', async () => {
    const rawReq = {
      method: 'GET',
      url: '/users/123',
      headers: {},
    };
    const rawRes = {
      statusCode: 200,
      end: jest.fn(),
    };

    const error = new Error('Database connection failed');
    mockRouter.find.mockReturnValue({
      handle: jest.fn(() => Promise.reject(error)),
      params: [],
    });

    await dispatcher.requestListener(rawReq, rawRes);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'HTTP 500' });
    expect(rawRes.statusCode).toBe(500);
    expect(rawRes.end).toHaveBeenCalled();
  });
});
