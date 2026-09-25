import request from 'supertest';
import { TestRestApplication } from '@holu/rest-testing';
import type { HttpServer } from '@holu/rest';

import { AppModule } from '#app/app.module.js';

describe('15-i18n', () => {
  let server: HttpServer;
  let testAgent: ReturnType<typeof request>;

  beforeAll(async () => {
    server = await TestRestApplication.createTestApp(AppModule).getServer();
    testAgent = request(server);
  });

  afterAll(() => {
    server?.close();
  });

  it('controller works', async () => {
    await testAgent.get('/first?lng=en').expect(200).expect('one, two, three');

    await testAgent.get('/first?lng=pl').expect(200).expect('nie, dwa, trzy');

    await testAgent.get('/first-extended?lng=en').expect(200).expect('overridden: one, two, three');

    await testAgent.get('/first-extended?lng=pl').expect(200).expect('nie, dwa, trzy');

    await testAgent.get('/first-extended?lng=uk').expect(200).expect('overridden: один, два, три');

    await testAgent.get('/second/Kostia?lng=en').expect(200).expect('Hello, Kostia!');

    await testAgent.get('/second/Kostia?lng=uk').expect(200).expect('Привіт, Kostia!');

    await testAgent.get('/third?lng=en').expect(200).expect('one, two, three');

    await testAgent.get('/third?lng=pl').expect(200).expect('nie, dwa, trzy');
  });
});
