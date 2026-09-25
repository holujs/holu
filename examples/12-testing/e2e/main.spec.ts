import request from 'supertest';
import type { HttpServer } from '@holu/rest';
import { HttpErrorHandler } from '@holu/rest';
import { TestRestApplication } from '@holu/rest-testing';
import { InstantiationError, NoProvider } from '@holu/core/errors';
import { jest } from '@jest/globals';

import { AppModule } from '#app/app.module.js';
import { CustomHttpErrorHandler } from './custom-controller-error-handler.js';
import { ErrorContainer } from './error-container.js';

describe('12-testing', () => {
  it('controller works case 1', async () => {
    const server = await TestRestApplication.createTestApp(AppModule).getServer();

    const { status, text } = await request(server).get('/');
    expect(status).toBe(200);
    expect(text).toBe('Hello, World!\n');
    server?.close();
  });

  it('controller works case 2', async () => {
    const server = await TestRestApplication.createTestApp(AppModule).getServer();

    const { status, text } = await request(server).get('/admin');
    expect(status).toBe(200);
    expect(text).toBe('Hello, admin!\n');
    server?.close();
  });

  describe('good error stack trace', () => {
    const setError = jest.fn();
    const errorContainer = { setError } as ErrorContainer;
    let server: HttpServer;

    beforeAll(async () => {
      server = await TestRestApplication.createTestApp(AppModule)
        .addProvidersToModule(AppModule, [{ token: ErrorContainer, useValue: errorContainer }])
        .overrideModuleMeta([
          {
            token: HttpErrorHandler,
            useClass: CustomHttpErrorHandler,
          },
        ])
        .getServer();
    });

    afterAll(() => {
      server?.close();
    });

    it('should start from "Controller1.method1"', async () => {
      const { status } = await request(server).get('/fail1');
      expect(status).toBe(500);
      const cause = new NoProvider(['[non-existing-token in Req >> Rou >> Mod >> App]']);
      const err = new InstantiationError(cause, ['Controller1.prototype.method1']);
      expect(setError).toHaveBeenCalledWith(err);
      expect(setError).toHaveBeenCalledTimes(1);
    });
  });
});
