import {
  clearDebugClassNames,
  featureModule,
  ModuleRegistry,
  DynamicModule,
  NormalizedModuleMeta,
  SystemLogMediator,
  ModRefId,
} from '@holu/core';

import { CanActivate, guard } from '../interceptors/guard.js';
import { controller } from '../types/controller.js';
import { RequestContext } from '../services/request-context.js';
import { RestAppendOptions, type RestDynamicOptions } from './rest-aspect-raw-meta.js';
import { restAspect, restRootModule } from '#decorators/rest-module-aspects.js';

let mock: MockModuleRegistry;

class MockModuleRegistry extends ModuleRegistry {
  declare normalizedMetaMap: Map<ModRefId, NormalizedModuleMeta>;
  declare moduleIdMap: Map<string, ModRefId>;
}

beforeEach(() => {
  clearDebugClassNames();
  const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
  mock = new MockModuleRegistry(systemLogMediator);
});

it('imports and appends with gruards for some modules', () => {
  @guard()
  class Guard1 implements CanActivate {
    async canActivate(ctx: RequestContext, params?: any[]) {
      return false;
    }
  }

  @guard()
  class Guard2 implements CanActivate {
    async canActivate(ctx: RequestContext, params?: any[]) {
      return false;
    }
  }

  @controller()
  class Controller1 {}

  @controller()
  class Controller2 {}

  @restAspect({ controllers: [Controller1] })
  @featureModule()
  class Module1 {}

  @restAspect({ controllers: [Controller2] })
  @featureModule()
  class Module2 {}

  const dynamicModule: RestDynamicOptions & DynamicModule = {
    path: 'module1',
    module: Module1,
    guards: [Guard1],
  };
  const appendsWithOpts: RestAppendOptions = {
    path: 'module2',
    module: Module2,
    guards: [Guard2],
  };

  @restRootModule({
    appends: [appendsWithOpts],
    imports: [dynamicModule],
  })
  class AppModule {}

  mock.scanRootModule(AppModule);
  const aspectMeta1 = mock.getNormalizedModuleMeta(dynamicModule)?.normalizedAspectsMetaMap.get(restAspect)?.params;
  const aspectMeta2 = mock.getNormalizedModuleMeta(appendsWithOpts)?.normalizedAspectsMetaMap.get(restAspect)?.params;
  expect(mock.modulesMap.size).toBe(5);
  expect(aspectMeta1).toMatchObject({ guards: [{ guard: Guard1 }], path: 'module1' });
  expect(aspectMeta2).toMatchObject({ guards: [{ guard: Guard2 }], path: 'module2' });
});
