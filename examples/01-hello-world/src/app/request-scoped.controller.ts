import { controller, route } from '@holu/rest';

@controller()
export class RequestScopedController {
  @route('GET', 'request-scoped')
  hello() {
    return 'Hello, World!';
  }
}
