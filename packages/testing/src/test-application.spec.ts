import { StaticModule, rootModule } from '@holu/core';
import { AppOptions, restAspect, Router } from '@holu/rest';
import { Server } from 'node:http';

import { TestRestApplication } from './test-application.js';

describe('TestRestApplication', () => {
  class TestRestApplicationMock extends TestRestApplication {
    declare preTestRestApplication: TestRestApplicationMock;
    static override async create(appModule: StaticModule, appOptions?: AppOptions) {
      return super.createTestApp(appModule, appOptions) as unknown as TestRestApplicationMock;
    }
  }

  const path = 'some-prefix';
  class Service1 {}

  @restAspect({ providersPerApp: [Service1, { token: Router, useValue: {} }] })
  @rootModule()
  class RootModule1 {}

  describe('create()', () => {
    it('not throw an error', async () => {
      await expect(TestRestApplicationMock.create(RootModule1, { path })).resolves.not.toThrow();
    });
  });

  describe('getServer()', () => {
    it('not to throw an error', async () => {
      const mock = await TestRestApplicationMock.create(RootModule1, { path });
      await expect(mock.getServer()).resolves.not.toThrow();
    });

    it('returns instance of http.Server', async () => {
      const mock = await TestRestApplicationMock.create(RootModule1, { path });
      const server = await mock.getServer();
      expect(server).toBeInstanceOf(Server);
    });
  });
});
