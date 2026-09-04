import { injectable, Extension, LoggerConfig, ProviderBuilder, rootModule, StandaloneApplication } from '@holu/core';

@injectable()
class GreetingService {
  static lastGreeting = '';

  greet(name: string) {
    GreetingService.lastGreeting = `Hello, ${name}!`;
    return GreetingService.lastGreeting;
  }
}

@injectable()
class TestExtension implements Extension {
  constructor(private greetingService: GreetingService) {}

  async stage1() {}

  async stage3() {
    this.greetingService.greet('Holu');
  }
}

@rootModule({
  providersPerMod: [GreetingService],
  providersPerApp: new ProviderBuilder().useValue(LoggerConfig, { level: 'off' }),
  extensions: [TestExtension],
})
class AppModule {}

describe('00-standalone-application', () => {
  it('extension uses injected service during bootstrap', async () => {
    GreetingService.lastGreeting = '';
    const app = await StandaloneApplication.create(AppModule);
    expect(GreetingService.lastGreeting).toBe('Hello, Holu!');
    await app.close();
  });
});
