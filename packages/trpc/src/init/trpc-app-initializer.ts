import type { ModRefId, ProvidersByLevel } from '@holu/core';
import { AppInitializer, NormalizedModuleMeta } from '@holu/core';
import { initTRPC } from '@trpc/server';

import type { RequestListener, TrpcRootModule } from '../types/types.js';
import { SERVER } from '../types/types.js';
import { TrpcRequestDispatcher } from '#services/request-dispatcher.js';
import type { HttpServer } from '#types/server-options.js';
import { TRPC_ROOT } from '#types/constants.js';
import { TrpcInternalService } from '#services/trpc-internal.service.js';
import { TrpcService } from '#services/trpc.service.js';

export class TrpcAppInitializer extends AppInitializer {
  protected requestDispatcher: TrpcRequestDispatcher;
  protected server: HttpServer;

  protected override addDefaultProvidersPerApp() {
    this.normalizedModuleMeta.providersPerApp.unshift(
      TrpcRequestDispatcher,
      { token: SERVER, useFactory: () => this.server },
      {
        token: TRPC_ROOT,
        useFactory: () => this.getTrpcRootObject(),
      },
    );
    super.addDefaultProvidersPerApp();
  }

  protected getTrpcRootObject() {
    const mod = this.moduleRegistry.getInstanceOf('root', true) as Partial<TrpcRootModule>;
    return initTRPC.create(mod.setTrpcCreateOptions?.());
  }

  override async bootstrapModulesAndExtensions() {
    const injectorPerApp = await super.bootstrapModulesAndExtensions();
    this.requestDispatcher = injectorPerApp.get(TrpcRequestDispatcher) as TrpcRequestDispatcher;
    return injectorPerApp;
  }

  requestListener: RequestListener = (rawReq, rawRes) => this.requestDispatcher.requestListener(rawReq, rawRes);

  protected override overrideMetaAfterStage1(modRefId: ModRefId, normalizedModuleMeta: ProvidersByLevel): void {
    if (normalizedModuleMeta instanceof NormalizedModuleMeta) {
      normalizedModuleMeta.providersPerMod.unshift(TrpcService, TrpcInternalService);
    }
    super.overrideMetaAfterStage1(modRefId, normalizedModuleMeta);
  }

  async resetRequestListener() {
    const injectorPerMod = this.moduleRegistry.getInjectorPerMod('root', true);
    const trpcInternalService = injectorPerMod.get(TrpcInternalService) as TrpcInternalService;
    trpcInternalService.setTrpcRouter(this.normalizedModuleMeta);
  }

  setServer(server: HttpServer) {
    this.server = server;
  }
}
