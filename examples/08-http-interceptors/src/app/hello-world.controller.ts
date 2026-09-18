import { RequestContext, controller, route } from '@holu/rest';

@controller()
export class HelloWorldController {
  @route('GET')
  tellHello(ctx: RequestContext) {
    return 'Original message!';
  }

  @route('GET', 'throw-error')
  throwError() {
    throw new Error('some error here!');
  }
}

@controller({ scope: 'route' })
export class RouteScopedController {
  @route('GET', 'route-scoped')
  tellHello(ctx: RequestContext) {
    return 'Original message!';
  }
}
