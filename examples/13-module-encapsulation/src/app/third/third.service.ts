import { injectable } from '@holu/core';

import { SecondService } from '../second/second.service.js';

@injectable()
export class ThirdService {
  constructor(private secondService: SecondService) {}

  getCounter() {
    return this.secondService.getCounter();
  }

  getBody(body: any) {
    return this.secondService.getBody(body);
  }
}
