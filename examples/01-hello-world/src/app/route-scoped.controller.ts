import { controller, route } from '@holu/rest';

@controller({ scope: 'route' })
export class RouteScopedController {
  @route('GET', 'route-scoped')
  hello() {
    return 'Hello, Route!';
  }
}
