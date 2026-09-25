import { injectable } from '@holu/core';

@injectable()
export class OtherService {
  async helloAdmin() {
    return 'Hello, admin!\n';
  }
}
