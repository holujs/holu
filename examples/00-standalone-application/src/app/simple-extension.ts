import { injectable, Extension, Logger } from '@holu/core';
import { GreetingService } from './greeting.service.js';

@injectable()
export class AppExtension implements Extension {
  constructor(
    private greetingService: GreetingService,
    private logger: Logger,
  ) {}

  async stage1() {
    this.logger.log('info', 'AppExtension: initializing in stage1.');
  }

  async stage3() {
    this.greetingService.greet('World');
  }
}
