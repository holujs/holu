import { jest } from '@jest/globals';
import {
  clearDebugClassNames,
  defaultProvidersPerApp,
  ExtensionConfig,
  Provider,
  featureModule,
  injectable,
  Injector,
  ModRefId,
  ModuleManager,
  StaticModule,
  NormalizedModuleMeta,
  rootModule,
  SystemLogMediator,
  ShallowModuleImports,
} from '@holu/core';

import { ChainMaker } from './chain-maker.js';
import { RequestScopedHttpBackend } from './request-scoped-http-backend.js';
import { HttpBackend, HttpFrontend, HttpHandler, HttpInterceptor } from './tokens-and-types.js';
import { HTTP_INTERCEPTORS } from '../top/constants.js';
import { defaultProvidersPerReq } from '#providers/default-providers-per-req.js';
import { restAspect } from '#decorators/rest-module-aspects.js';
import { RestShallowModulesImporter } from '#init/rest-shallow-modules-importer.js';
import { RequestContext } from '#services/request-context.js';

describe('HttpInterceptor', () => {
  const jestFn = jest.fn((interceptorName: string) => interceptorName);

  class Interceptor1 implements HttpInterceptor {
    intercept(next: HttpHandler) {
      jestFn('Interceptor1');
      return next.handle();
    }
  }

  class Interceptor2 implements HttpInterceptor {
    intercept(next: HttpHandler) {
      jestFn('Interceptor2');
      return next.handle();
    }
  }

  class MockHttpFrontend implements HttpFrontend {
    intercept(next: HttpHandler) {
      jestFn('HttpFrontend');
      return next.handle();
    }
  }

  class MockHttpBackend implements HttpHandler {
    handle() {
      jestFn('HttpBackend');
      return Promise.resolve();
    }
  }

  const defaultProviders: Provider[] = [
    ...defaultProvidersPerApp,
    ...defaultProvidersPerReq,
    { token: HttpBackend, useClass: RequestScopedHttpBackend },
    ChainMaker,
  ];

  beforeEach(() => {
    jestFn.mockRestore();
  });

  it('each interceptor calls next.handle()', async () => {
    class Interceptor3 implements HttpInterceptor {
      intercept(next: HttpHandler) {
        jestFn('Interceptor3');
        return next.handle();
      }
    }

    const injector = Injector.resolveAndCreate([
      ...defaultProviders,
      { token: HttpFrontend, useClass: MockHttpFrontend },
      { token: HttpBackend, useClass: MockHttpBackend },
      { token: HTTP_INTERCEPTORS, useClass: Interceptor1, multi: true },
      { token: HTTP_INTERCEPTORS, useClass: Interceptor2, multi: true },
      { token: HTTP_INTERCEPTORS, useClass: Interceptor3, multi: true },
    ]);

    const chainMaker = injector.get(ChainMaker) as ChainMaker;
    const chain = chainMaker.makeChain({} as any);
    await chain.handle();
    expect(jestFn.mock.calls).toEqual([['Interceptor1'], ['Interceptor2'], ['Interceptor3'], ['HttpBackend']]);
  });

  it('last interceptor run without calls next.handle()', async () => {
    class Interceptor3 implements HttpInterceptor {
      intercept() {
        jestFn('Interceptor3');
        return Promise.resolve();
      }
    }

    const injector = Injector.resolveAndCreate([
      ...defaultProviders,
      HttpBackend as any,
      { token: HttpFrontend, useClass: MockHttpFrontend },
      { token: HTTP_INTERCEPTORS, useClass: Interceptor1, multi: true },
      { token: HTTP_INTERCEPTORS, useClass: Interceptor2, multi: true },
      { token: HTTP_INTERCEPTORS, useClass: Interceptor3, multi: true },
    ]);

    const chainMaker = injector.get(ChainMaker) as ChainMaker;
    const chain = chainMaker.makeChain({} as any);
    await chain.handle();
    expect(jestFn.mock.calls).toEqual([['Interceptor1'], ['Interceptor2'], ['Interceptor3']]);
  });

  it('without HTTP_INTERCEPTORS, chain should be HttpBackend', () => {
    const injector = Injector.resolveAndCreate([...defaultProviders, HttpBackend as any]);

    const chainMaker = injector.get(ChainMaker) as ChainMaker;
    const chain = chainMaker.makeChain({} as any);
    const backend = injector.get(HttpBackend) as HttpBackend;
    expect(chain).toBe(backend);
  });
});

describe('mix per app, per mod or per req', () => {
  class ImportedProvider<T extends Provider = Provider> {
    modRefId: ModRefId;
    /**
     * This property can have more than one element for multi-providers only.
     */
    providers: T[] = [];
  }

  class AppProviders {
    importedProvidersPerMod = new Map<any, ImportedProvider>();
    importedProvidersPerRou = new Map<any, ImportedProvider>();
    importedProvidersPerReq = new Map<any, ImportedProvider>();
    importedMultiProvidersPerMod = new Map<ModRefId, Provider[]>();
    importedMultiProvidersPerRou = new Map<ModRefId, Provider[]>();
    importedMultiProvidersPerReq = new Map<ModRefId, Provider[]>();
    importedExtensions = new Map<ModRefId, Provider[]>();
    importedExtensionConfigs: ExtensionConfig[] = [];
  }

  @injectable()
  class MockShallowModulesImporter extends RestShallowModulesImporter {
    injectorPerMod: Injector;
    declare prefixPerMod: string;
    override moduleName = 'MockModule';
    override normalizedModuleMeta = new NormalizedModuleMeta();
    override shallowModuleImportsMap = new Map<StaticModule, ShallowModuleImports>();
    override importedProvidersPerRou = new Map<any, ImportedProvider>();
    override importedProvidersPerReq = new Map<any, ImportedProvider>();
    override importedMultiProvidersPerRou = new Map<ModRefId, Provider[]>();
    override importedMultiProvidersPerReq = new Map<ModRefId, Provider[]>();
    // override guardsPerMod: ModuleScopedGuard[] = [];

    // override exportAppProviders(moduleManager: ModuleManager, providersPerApp: Provider[]) {
    //   return super.exportAppProviders(moduleManager, providersPerApp);
    // }
  }

  let mock: MockShallowModulesImporter;
  let moduleManager: ModuleManager;

  beforeEach(() => {
    clearDebugClassNames();
    const injectorPerApp = Injector.resolveAndCreate([...defaultProvidersPerApp, MockShallowModulesImporter]);
    mock = injectorPerApp.get(MockShallowModulesImporter);
    moduleManager = new ModuleManager(new SystemLogMediator({ moduleName: 'fakeName' }));
  });

  class Provider0 {}
  class Provider1 {}
  class Provider2 {}

  it('case 1', () => {
    @featureModule({
      exports: [Provider0],
      providersPerMod: [Provider0],
    })
    class Module0 {}

    @rootModule({
      imports: [Module0],
      providersPerApp: [Provider0],
    })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    const msg = 'AppModule failed: exports from Module0 causes collision with Provider0.';
    expect(() => mock.importModulesShallow([Provider0], new AppProviders(), '', AppModule, moduleManager, new Set())).toThrow(msg);
  });

  it('resolved case 1', () => {
    @featureModule({
      exports: [Provider1],
      providersPerMod: [{ token: Provider1, useValue: 'fake' }],
    })
    class Module1 {}

    @rootModule({
      imports: [Module1],
      providersPerApp: [Provider1],
      resolvedCollisionsPerMod: [[Provider1, Module1]],
    })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    const callback = () => mock.importModulesShallow([Provider1], new AppProviders(), '', AppModule, moduleManager, new Set());
    expect(callback).not.toThrow();
    expect([...mock.importedProvidersPerMod]).toEqual([
      [Provider1, { modRefId: Module1, providers: [{ token: Provider1, useValue: 'fake' }] }],
    ]);
  });

  it('case 2', () => {
    @restAspect({ providersPerReq: [{ token: Provider1, useClass: Provider1 }] })
    @featureModule({ exports: [Provider1] })
    class Module0 {}

    @restAspect({ providersPerReq: [] })
    @rootModule({
      imports: [Module0],
      providersPerMod: [Provider1],
    })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    const msg = 'AppModule failed: exports from Module0 causes collision with Provider1.';
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).toThrow(msg);
  });

  it('resolved case 2', () => {
    @restAspect({ providersPerReq: [{ token: Provider1, useClass: Provider1 }], exports: [Provider1] })
    @featureModule()
    class Module1 {}

    @restAspect({ resolvedCollisionsPerReq: [[Provider1, Module1]] })
    @rootModule({ imports: [Module1], providersPerMod: [Provider1] })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).not.toThrow();
    expect([...mock.importedProvidersPerReq]).toEqual([
      [Provider1, { modRefId: Module1, providers: [{ token: Provider1, useClass: Provider1 }] }],
    ]);
  });

  it('double resolve', () => {
    @restAspect({ providersPerReq: [Provider1] })
    @featureModule({ exports: [Provider1] })
    class Module1 {}

    @featureModule({
      exports: [Provider1],
      providersPerMod: [{ token: Provider1, useClass: Provider2 }],
    })
    class Module2 {}

    @restAspect({ resolvedCollisionsPerReq: [[Provider1, Module1]] })
    @rootModule({
      imports: [Module1, Module2],
      providersPerApp: [Provider1],
      resolvedCollisionsPerMod: [[Provider1, AppModule]],
    })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    expect(() => {
      mock.importModulesShallow([Provider1], new AppProviders(), '', AppModule, moduleManager, new Set());
    }).not.toThrow();
    expect([...mock.importedProvidersPerMod]).toEqual([]);
    expect([...mock.importedProvidersPerReq]).toEqual([[Provider1, { modRefId: Module1, providers: [Provider1] }]]);
  });

  it('point to current module to increase scope and to resolve case 2', () => {
    @restAspect({ providersPerReq: [{ token: Provider1, useClass: Provider1 }] })
    @featureModule({ exports: [Provider1] })
    class Module1 {}

    @restAspect({ resolvedCollisionsPerReq: [[Provider1, AppModule]] })
    @rootModule({ imports: [Module1], providersPerMod: [Provider1] })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).not.toThrow();
    expect([...mock.importedProvidersPerReq]).toEqual([]);
  });

  it('wrong point to current module', () => {
    @restAspect({ providersPerReq: [{ token: Provider2, useClass: Provider1 }] })
    @featureModule({ exports: [Provider2] })
    class Module1 {}

    @restAspect({ resolvedCollisionsPerReq: [[Provider1, AppModule]] })
    @rootModule({ imports: [Module1], providersPerMod: [Provider1] })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    const msg = 'AppModule failed: Provider1 mapped with AppModule, but providersPerReq does not imports Provider1';
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).toThrow(msg);
  });

  xit('resolve case 3', () => {
    @featureModule({
      exports: [HttpBackend],
      providersPerReq: [{ token: HttpBackend, useValue: '' }],
    })
    class Module0 {}

    @restAspect({ resolvedCollisionsPerReq: [[HttpBackend, AppModule]] })
    @rootModule({ imports: [Module0] })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).not.toThrow();
    expect([...mock.importedProvidersPerReq]).toEqual([]);
  });

  it('resolve 2 case 3', () => {
    @restAspect({ providersPerReq: [{ token: RequestContext, useClass: RequestContext }] })
    @featureModule({ exports: [RequestContext] })
    class Module1 {}

    @restAspect({ resolvedCollisionsPerReq: [[RequestContext, Module1]] })
    @rootModule({ imports: [Module1] })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).not.toThrow();
    expect([...mock.importedProvidersPerReq]).toEqual([
      [RequestContext, { modRefId: Module1, providers: [{ token: RequestContext, useClass: RequestContext }] }],
    ]);
  });

  xit('case 4', () => {
    @featureModule({
      exports: [HttpBackend],
      providersPerReq: [{ token: HttpBackend, useValue: '' }],
    })
    class Module0 {}

    @rootModule({
      imports: [Module0],
    })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    const msg = 'AppModule failed: exports from Module0 causes collision with HttpBackend.';
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).toThrow(msg);
  });

  xit('resolve case 4', () => {
    @featureModule({
      providersPerReq: [{ token: HttpBackend, useValue: '' }],
      exports: [HttpBackend],
    })
    class Module0 {}

    @restAspect({ resolvedCollisionsPerReq: [[HttpBackend, AppModule]] })
    @rootModule({ imports: [Module0] })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).not.toThrow();
    expect([...mock.importedProvidersPerReq]).toEqual([]);
  });

  it('resolved case 4', () => {
    @restAspect({ providersPerReq: [{ token: HttpBackend, useValue: '' }] })
    @featureModule({ exports: [HttpBackend] })
    class Module1 {}

    @restAspect({ resolvedCollisionsPerReq: [[HttpBackend, Module1]] })
    @rootModule({ imports: [Module1] })
    class AppModule {}

    moduleManager.scanRootModule(AppModule);
    expect(() => mock.importModulesShallow([], new AppProviders(), '', AppModule, moduleManager, new Set())).not.toThrow();
    expect([...mock.importedProvidersPerReq]).toEqual([
      [HttpBackend, { modRefId: Module1, providers: [{ token: HttpBackend, useValue: '' }] }],
    ]);
  });
});
