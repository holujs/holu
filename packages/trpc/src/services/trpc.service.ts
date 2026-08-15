import { injectable, ModRefId, ModuleRegistry } from '@holu/core';
import { ModuleWithTrpcRoutes } from '#types/types.js';

@injectable()
export class TrpcService {
  constructor(protected moduleRegistry: ModuleRegistry) {}

  getModuleConfig<T extends ModuleWithTrpcRoutes<any>>(modRefId: ModRefId<T>) {
    return this.moduleRegistry.getInstanceOf(modRefId, true).getRouterConfig();
  }
}
