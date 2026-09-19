import { injectable, Extension, Logger, type Injector } from '@holu/core';
import { GreetingService } from './greeting.service.js';

@injectable()
export class AppExtension implements Extension {
  constructor(private logger: Logger) {}

  async stage1() {
    this.logger.log('info', 'AppExtension: initializing in stage1.');
  }

  async stage2(injectorPerMod: Injector) {
    const greetingService = injectorPerMod.get(GreetingService);
    greetingService.greet('World');
  }
}
