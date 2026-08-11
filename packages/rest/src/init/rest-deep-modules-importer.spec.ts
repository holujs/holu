import {
  clearDebugClassNames,
  featureModule,
  forwardRef,
  inject,
  injectable,
  Injector,
  ModuleManager,
  StaticModule,
  Provider,
  rootModule,
  SystemLogMediator,
  AppInitializer,
  BaseAppOptions,
  NormalizedModuleMeta,
  DeepModulesImporter,
  ModRefId,
  ResolvedModuleMeta,
  DynamicModule,
  Context,
} from '@holu/core';

import { CanActivate, guard } from '#interceptors/guard.js';
import { RequestContext } from '#services/request-context.js';
import { aspectRest, restModule, restRootModule } from '#decorators/rest-module-aspects.js';
import { RestResolvedModuleMeta } from './types.js';
import { RestDynamicOptions } from './rest-mixin-raw-meta.js';

describe('DeepModulesImporter', () => {
  class AppInitializerMock extends AppInitializer {
    override normalizedModuleMeta = new NormalizedModuleMeta();

    override collectProvidersShallow(moduleManager: ModuleManager) {
      return super.collectProvidersShallow(moduleManager);
    }
  }

  function getResolvedModuleMeta(rootModule: StaticModule) {
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    const moduleManager = new ModuleManager(systemLogMediator);
    moduleManager.scanRootModule(rootModule);
    const baseAppOptions = new BaseAppOptions();
    const initializer = new AppInitializerMock(baseAppOptions, moduleManager, systemLogMediator);
    initializer.bootstrapProvidersPerApp();
    systemLogMediator.flush();
    const shallowModuleImportsMap = initializer.collectProvidersShallow(moduleManager);
    const deepModulesImporter = new DeepModulesImporter({
      moduleManager,
      shallowModuleImportsMap,
      providersPerApp: initializer.normalizedModuleMeta.providersPerApp,
      log: systemLogMediator,
    });
    const { resolvedModuleMetaMap } = deepModulesImporter.importModulesDeep();
    return resolvedModuleMetaMap as Map<ModRefId, ResolvedModuleMeta<RestResolvedModuleMeta>>;
  }

  function getRestResolvedModuleMeta(rootModule: StaticModule) {
    return getResolvedModuleMeta(rootModule).get(rootModule)?.deepImportedModules.get(aspectRest);
  }

  beforeEach(() => {
    clearDebugClassNames();
  });

  it('synchronization between normalizedModuleMeta and mixinMeta remains', () => {
    class Service1 {}
    class Service2 {}
    class Service3 {}
    class Service4 {}
    class Service5 {}
    class Service6 {}

    @aspectRest({
      providersPerApp: [Service3],
      providersPerMod: [Service4],
    })
    @featureModule({
      providersPerApp: [Service1],
      providersPerMod: [Service2],
    })
    class Module1 {}

    @aspectRest({
      imports: [Module1],
      providersPerApp: [Service5],
      providersPerMod: [Service6],
    })
    @rootModule()
    class AppModule {}

    const map = getResolvedModuleMeta(AppModule);
    const rootNormalizedModuleMeta = map.get(AppModule)?.normalizedModuleMeta;
    const mod1NormalizedModuleMeta = map.get(Module1)?.normalizedModuleMeta;

    expect(mod1NormalizedModuleMeta?.providersPerApp).toEqual([Service1, Service3]);
    expect(mod1NormalizedModuleMeta?.providersPerMod.includes(Service2)).toBeTruthy();
    expect(mod1NormalizedModuleMeta?.providersPerMod.includes(Service4)).toBeTruthy();
    expect(rootNormalizedModuleMeta?.providersPerApp.includes(Service5)).toBeTruthy();
    expect(rootNormalizedModuleMeta?.providersPerMod.includes(Service6)).toBeTruthy();

    const mod1MixinMeta = mod1NormalizedModuleMeta?.normalizedAspectMetaMap.get(aspectRest);
    expect(mod1NormalizedModuleMeta?.providersPerApp).toBe(mod1MixinMeta?.providersPerApp);
    expect(mod1NormalizedModuleMeta?.providersPerMod).toBe(mod1MixinMeta?.providersPerMod);
    expect(mod1MixinMeta?.providersPerApp).toEqual([Service1, Service3]);
    expect(mod1MixinMeta?.providersPerMod.includes(Service2)).toBeTruthy();
    expect(mod1MixinMeta?.providersPerMod.includes(Service4)).toBeTruthy();

    const rootMixinMeta = rootNormalizedModuleMeta?.normalizedAspectMetaMap.get(aspectRest);
    expect(rootNormalizedModuleMeta?.providersPerApp).toBe(rootMixinMeta?.providersPerApp);
    expect(rootNormalizedModuleMeta?.providersPerMod).toBe(rootMixinMeta?.providersPerMod);
    expect(rootMixinMeta?.providersPerApp.includes(Service5)).toBeTruthy();
    expect(rootMixinMeta?.providersPerMod.includes(Service6)).toBeTruthy();
  });

  it('reexport module that has aspectRest decorator', () => {
    class Service1 {}

    @aspectRest({ providersPerReq: [Service1], exports: [Service1] })
    @featureModule()
    class Module1 {}

    @featureModule({ imports: [Module1], exports: [Module1] })
    class Module2 {}

    @rootModule({ imports: [Module2] })
    class AppModule {}

    const map = getResolvedModuleMeta(AppModule);
    const rootMod = map.get(AppModule)?.deepImportedModules.get(aspectRest)!;
    const mod2 = map.get(Module2)?.deepImportedModules.get(aspectRest)!;
    expect(rootMod?.meta.providersPerReq.includes(Service1)).toBeTruthy();
    expect(mod2?.meta.providersPerReq.includes(Service1)).toBeTruthy();
  });

  it('root module without aspectRest decorator imports Module1 that has aspectRest decorator', () => {
    class Provider1 {}

    @aspectRest({
      providersPerRou: [Provider1],
      exports: [Provider1],
    })
    @featureModule()
    class Module1 {}

    @rootModule({ imports: [Module1] })
    class AppModule {}

    const restResolvedModuleMeta = getRestResolvedModuleMeta(AppModule);
    expect(restResolvedModuleMeta?.meta.providersPerRou.includes(Provider1)).toBeTruthy();
  });

  it('root module with aspectRest decorator exports Provider2 and imports Module1 that has not aspectRest decorator', () => {
    class Provider1 {}
    class Provider2 {}

    @featureModule({ providersPerApp: [Provider1] })
    class Module1 {}

    @aspectRest({ providersPerReq: [Provider2], exports: [Provider2] })
    @rootModule({ imports: [Module1] })
    class AppModule {}

    const map = getResolvedModuleMeta(AppModule);
    const mod1 = map.get(Module1)?.deepImportedModules.get(aspectRest)!;
    expect(mod1).toBeDefined();
    expect(mod1.meta.providersPerReq.includes(Provider2)).toBeTruthy();
  });

  it('root module without aspectRest decorator exports Module2 that has aspectRest and imports Module1 also that has not aspectRest', () => {
    class Provider1 {}
    class Provider2 {}

    @featureModule({ providersPerApp: [Provider1] })
    class Module1 {}

    @aspectRest({ providersPerReq: [Provider2], exports: [Provider2] })
    @featureModule({ providersPerApp: [Provider1] })
    class Module2 {}

    @rootModule({ imports: [Module1, Module2], exports: [Module2] })
    class AppModule {}

    const map = getResolvedModuleMeta(AppModule);
    const mod1 = map.get(Module1)?.deepImportedModules.get(aspectRest)!;
    expect(mod1).toBeDefined();
    expect(mod1.meta.providersPerReq.includes(Provider2)).toBeTruthy();
  });

  it('root module with aspectRest decorator imports Module1 that has params, but has not aspectRest decorator', () => {
    class Provider1 {}
    class Guard1 implements CanActivate {
      async canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }
    class Guard2 implements CanActivate {
      async canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }

    @featureModule({ providersPerApp: [Provider1] })
    class Module1 {}

    const dynamicModule: RestDynamicOptions & DynamicModule = {
      path: 'test-prefix',
      guards: [Guard1, [Guard2, { one: 1 }]],
      module: Module1,
    };

    @aspectRest({ imports: [dynamicModule] })
    @rootModule()
    class AppModule {}

    const map = getResolvedModuleMeta(AppModule);
    const rootMod = map.get(AppModule)?.deepImportedModules.get(aspectRest)!;
    const mod1 = map.get(dynamicModule)?.deepImportedModules.get(aspectRest)!;
    expect(mod1.prefixPerMod).toBe('test-prefix');
    expect(mod1.guardsPerMod[0].guard).toBe(Guard1);
    expect(mod1.guardsPerMod[0].meta).toBe(rootMod.meta);
    expect(mod1.guardsPerMod[1].params).toEqual([{ one: 1 }]);
  });

  it('circular imports modules with forwardRef()', () => {
    class Provider1 {}
    class Provider2 {}

    @aspectRest({
      imports: [forwardRef(() => Module3)],
      providersPerReq: [Provider1],
      exports: [Provider1],
    })
    @featureModule()
    class Module1 {}

    @aspectRest({ imports: [Module1], exports: [Module1] })
    @featureModule()
    class Module2 {}

    @aspectRest({
      imports: [Module2],
      providersPerRou: [Provider2],
      exports: [Provider2],
    })
    @featureModule()
    class Module3 {}

    @rootModule({ imports: [Module3] })
    class AppModule {}

    const map = getResolvedModuleMeta(AppModule);
    const mod1 = map.get(Module1)?.deepImportedModules.get(aspectRest)!;
    const mod3 = map.get(Module3)?.deepImportedModules.get(aspectRest)!;
    expect(mod1.meta.providersPerRou.includes(Provider2));
    expect(mod3.meta.providersPerRou.includes(Provider1));
  });

  it(`Module3 imports Module2, which has a dependency on Service1, but Module2 does not import any modules with Service1;
    in this case an error should be thrown`, () => {
    @injectable()
    class Service1 {}

    @injectable()
    class Service2 {
      constructor(public service1: Service1) {}
    }
    @aspectRest({ providersPerRou: [Service2], exports: [Service2] })
    @featureModule()
    class Module2 {}

    @rootModule({ imports: [Module2] })
    class Module3 {}

    let msg = 'Module2: no provider for Service1! (required by Service2 -> Service1). ';
    msg += 'Searched in providersPerRou, providersPerMod, providersPerApp';
    expect(() => getResolvedModuleMeta(Module3)).toThrow(msg);
  });

  it(`There is the following dependency chain: Service4 -> Service3 -> Service2 -> Service1;
    AppModule imports Module2, which exports only Service4, but DeepModulesImporter imports
    the entire dependency chain (both from Module2 and from Module1, which is imported
    into Module2)`, () => {
    @injectable()
    class Service1 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @injectable()
    class Service2 {
      constructor(public service1: Service1) {}
    }

    @injectable()
    class Service3 {
      constructor(public service2: Service2) {}
    }

    @injectable()
    class Service4 {
      constructor(public service3: Service3) {}
    }

    @restModule({
      providersPerRou: [Service3, Service4],
      exports: [Service4],
      imports: [Module1],
      providersPerMod: [Service2],
    })
    class Module2 {}

    @restRootModule({
      imports: [Module2],
    })
    class AppModule {}

    const mixinMeta = getRestResolvedModuleMeta(AppModule)!.meta!;
    const arr = [Service3, Service4, Context];
    expect(arr.every((item) => mixinMeta.providersPerRou.includes(item))).toBe(true);
    expect([Context].every((item) => mixinMeta.providersPerReq.includes(item))).toBe(true);
    expect(mixinMeta.providersPerMod.includes(Service1)).toBeTruthy();
    expect(mixinMeta.providersPerMod.includes(Service2)).toBeTruthy();
  });

  it('circular dependencies in one module', () => {
    @injectable()
    class Service1 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @injectable()
    class Service2 {
      constructor(@inject(forwardRef(() => Service4)) public service4: any) {}
    }

    @injectable()
    class Service3 {
      constructor(public service2: Service2) {}
    }

    @injectable()
    class Service4 {
      constructor(public service3: Service3) {}
    }

    @aspectRest({ providersPerRou: [Service2, Service3, Service4], exports: [Service4] })
    @featureModule({
      imports: [Module1],
    })
    class Module2 {}

    @rootModule({
      imports: [Module2],
    })
    class AppModule {}

    let msg = 'Detected circular dependencies: [Service3 in Module2] -> [Service2 in Module2]';
    msg += ' -> [Service4 in Module2] -> [Service3 in Module2]';
    expect(() => getResolvedModuleMeta(AppModule)).toThrow(msg);
  });

  it('circular dependencies in different modules', () => {
    @injectable()
    class Service1 {
      constructor(@inject(forwardRef(() => Service4)) public service4: any) {}
    }

    @aspectRest({ providersPerRou: [Service1], exports: [Service1] })
    @featureModule({
      imports: [forwardRef(() => Module2)],
    })
    class Module1 {}

    @injectable()
    class Service2 {
      constructor(public service1: Service1) {}
    }

    @injectable()
    class Service3 {
      constructor(public service2: Service2) {}
    }

    @injectable()
    class Service4 {
      constructor(public service3: Service3) {}
    }

    @aspectRest({ providersPerRou: [Service2, Service3, Service4], exports: [Service4] })
    @featureModule({
      imports: [Module1],
    })
    class Module2 {}

    @rootModule({
      imports: [Module2],
    })
    class Module3 {}

    let msg = 'Detected circular dependencies: [Service3 in Module2] -> [Service2 in Module2]';
    msg += ' -> [Service1 in Module1] -> [Service4 in Module2] -> [Service3 in Module2]';
    expect(() => getResolvedModuleMeta(Module3)).toThrow(msg);
  });

  it(`AppModule imports Module2, which has a dependency on Module1, but Module2 does not import Module1;
    although AppModule imports Module1, an error should be thrown`, () => {
    @injectable()
    class Service1 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @injectable()
    class Service2 {
      constructor(public service1: Service1) {}
    }

    @restModule({ providersPerRou: [Service2], exports: [Service2] })
    class Module2 {}

    @rootModule({ imports: [Module1, Module2] })
    class AppModule {}

    let msg = 'Module2: no provider for Service1! (required by Service2 -> Service1). ';
    msg += 'Searched in providersPerRou, providersPerMod, providersPerApp';
    expect(() => getResolvedModuleMeta(AppModule)).toThrow(msg);
  });

  it('Service2 declared per route and it has dependency on Service1 which is declared per module', () => {
    @injectable()
    class Service1 {}

    @injectable()
    class Service2 {
      constructor(public service1: Service1) {}
    }

    @restModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @restModule({ imports: [Module1], providersPerRou: [Service2], exports: [Service2] })
    class Module2 {}

    @restRootModule({ imports: [Module2] })
    class AppModule {}

    const mixinMeta = getRestResolvedModuleMeta(AppModule)!.meta!;
    const arr = [Context];
    expect(arr.every((item) => mixinMeta.providersPerReq.includes(item))).toBe(true);
    expect(mixinMeta.providersPerRou.includes(Service2)).toBe(true);
    expect(mixinMeta.providersPerMod.includes(Service1)).toBeTruthy();
  });

  it('Service2 is not exported from the host module, but is imported into the AppModule because Service3 depends on it', () => {
    class Service1 {}
    class Service2 {}

    @injectable()
    class Service3 {
      constructor(service1: Service1, service2: Service2) {}
    }

    @restModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @restModule({ imports: [Module1], providersPerRou: [Service3, Service2], exports: [Service3] })
    class Module2 {}

    @restRootModule({
      imports: [Module1, Module2],
    })
    class AppModule {}

    const mixinMeta = getRestResolvedModuleMeta(AppModule)!.meta!;
    const arr = [Context];
    expect(arr.every((item) => mixinMeta.providersPerReq.includes(item))).toBe(true);
    expect(mixinMeta.providersPerRou.includes(Service2)).toBeTruthy();
    expect(mixinMeta.providersPerRou.includes(Service3)).toBeTruthy();
    expect(mixinMeta.providersPerMod.includes(Service1)).toBeTruthy();
  });

  it('deep importer does not load the Service1 to AppModule as dependency because Service2 does not declare this dependency', () => {
    @injectable()
    class Service1 {}

    @injectable()
    class Service2 {
      constructor(public injector: Injector) {
        this.injector.get(Service1); // Lazy loading here.
      }
    }

    @injectable()
    class Service3 {
      constructor(public service2: Service2) {}
    }

    @restModule({ providersPerRou: [Service1], exports: [Service1] })
    class Module1 {}

    @restModule({ providersPerRou: [Service2], exports: [Service2], imports: [Module1] })
    class Module2 {}

    @restRootModule({ providersPerRou: [Service3], exports: [Service3], imports: [Module2] })
    class AppModule {}

    const mixinMeta = getRestResolvedModuleMeta(AppModule)!.meta!;
    expect(mixinMeta.providersPerRou.includes(Service2)).toBe(true);
    expect(mixinMeta.providersPerRou.includes(Service1)).toBe(false);
  });

  it(`By directly importing Module1, AppModule adds all providers from that module,
    regardless of whether those providers resolve the declared dependency or not`, () => {
    @injectable()
    class Service1 {}

    @injectable()
    class Service2 {
      constructor(public injector: Injector) {
        this.injector.get(Service1); // Lazy loading here.
      }
    }

    @aspectRest({ providersPerRou: [Service1], exports: [Service1] })
    @featureModule()
    class Module1 {}

    @aspectRest({ providersPerRou: [Service2], exports: [Service2] })
    @rootModule({ imports: [Module1] })
    class AppModule {}

    const mixinMeta = getRestResolvedModuleMeta(AppModule)!.meta!;
    const injector = Injector.resolveAndCreate(mixinMeta.providersPerRou);
    expect(() => injector.get(Service2)).not.toThrow();
  });

  it('guards per a module', () => {
    @injectable()
    class Service0 {}

    @injectable()
    class Service1 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @injectable()
    class Service2 {
      constructor(private service0: Service0) {}
    }

    /**
     * This guard is used as token only.
     */
    @guard()
    class BearerGuard1 implements CanActivate {
      async canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }

    /**
     * This guard is used as substitution of BearerGuard1.
     */
    @guard()
    class BearerGuard2 implements CanActivate {
      constructor(private service2: Service2) {}

      async canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }

    const mod1WithOpts: DynamicModule & RestDynamicOptions = { module: Module1, guards: [BearerGuard1] };
    const provider: Provider = { token: BearerGuard1, useClass: BearerGuard2 };

    @restRootModule({ imports: [mod1WithOpts], providersPerRou: [provider, Service0, Service2] })
    class AppModule {}

    const resolvedModuleMetaMap = getResolvedModuleMeta(AppModule);
    const mod1 = resolvedModuleMetaMap.get(mod1WithOpts);
    const restResolvedModuleMeta = mod1?.deepImportedModules.get(aspectRest) as RestResolvedModuleMeta;
    expect(restResolvedModuleMeta.guardsPerMod.at(0)?.guard).toBe(BearerGuard1);

    // Guards per a module must have ref to host module normalizedModuleMeta.
    expect(restResolvedModuleMeta.guardsPerMod.at(0)?.normalizedModuleMeta.modRefId).toBe(AppModule);

    // The injector must have enough providers to create a guard instance.
    const injector = Injector.resolveAndCreate(restResolvedModuleMeta.guardsPerMod.at(0)?.meta.providersPerRou || []);
    expect(() => injector.get(BearerGuard1)).not.toThrow();
    expect(injector.get(BearerGuard1)).toBeInstanceOf(BearerGuard2);
  });
});
