import { featureModule } from '@holu/core';

import { route } from '#decorators/route.js';
import { RestModule } from '#init/rest.module.js';
import { controller } from '#types/controller.js';
import { restAspect } from '#decorators/rest-module-aspects.js';

@controller()
class Controller2 {
  @route('GET', 'controller2')
  method1() {
    return 'controller2';
  }
}

@restAspect({ controllers: [Controller2] })
@featureModule({
  imports: [RestModule],
})
export class Module2 {}
