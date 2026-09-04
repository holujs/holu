import { injectable, Logger, BeforeShutdown } from '@holu/core';

@injectable()
export class GreetingService implements BeforeShutdown {
  constructor(private logger: Logger) {}

  greet(name: string) {
    const message = `Hello, ${name}! The StandaloneApplication is working.`;
    this.logger.log('info', message);
    return message;
  }

  beforeShutdown() {
    this.logger.log('info', 'GreetingService: releasing resources before shutdown...');
  }
}

