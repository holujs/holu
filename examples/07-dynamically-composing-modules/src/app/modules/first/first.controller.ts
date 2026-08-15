import { AppReinitializer, MutableModuleRegistry, DynamicModule, skipSelf } from '@holu/core';
import { controller, route, RequestContext, RestDynamicOptions } from '@holu/rest';

import { SecondModule } from '../second.module.js';
import { ThirdModule } from '../third/third.module.js';

const secondDynamicModule: DynamicModule & RestDynamicOptions = { path: '', module: SecondModule };
const thirdDynamicModule: DynamicModule = { module: ThirdModule };

@controller()
export class FirstController {
  constructor(
    @skipSelf() private moduleRegistry: MutableModuleRegistry,
    @skipSelf() private appReinitializer: AppReinitializer,
  ) {}

  @route('GET')
  tellHello(ctx: RequestContext) {
    ctx.send('first module.\n');
  }

  @route('GET', 'add-2')
  async addSecondModule(ctx: RequestContext) {
    this.moduleRegistry.addImport(secondDynamicModule);
    await this.reinitApp(ctx, 'second', 'importing');
  }

  @route('GET', 'del-2')
  async removeSecondModule(ctx: RequestContext) {
    this.moduleRegistry.removeImport(secondDynamicModule);
    await this.reinitApp(ctx, 'second', 'removing');
  }

  @route('GET', 'add-3')
  async addThirdModule(ctx: RequestContext) {
    this.moduleRegistry.addImport(thirdDynamicModule);
    await this.reinitApp(ctx, 'third', 'importing');
  }

  @route('GET', 'del-3')
  async removeThirdModule(ctx: RequestContext) {
    this.moduleRegistry.removeImport(thirdDynamicModule);
    await this.reinitApp(ctx, 'third', 'removing');
  }

  private async reinitApp(ctx: RequestContext, moduleName: 'second' | 'third', action: 'importing' | 'removing') {
    const err = await this.appReinitializer.reinit();
    if (err) {
      ctx.send(`${action} ${moduleName} failed: ${err.message}\n`);
    } else {
      ctx.send(`${moduleName} successfully ${action}!\n`);
    }
  }
}
