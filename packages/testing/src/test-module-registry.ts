import type { ModRefId, NormalizedModuleMeta } from '@holu/core';
import { getModule, MutableModuleRegistry } from '@holu/core';

export class TestModuleRegistry extends MutableModuleRegistry {
  protected externalModules = new Set<ModRefId>();

  markModuleAsExternal(...modRefIds: ModRefId[]) {
    modRefIds.forEach((modRefId) => {
      const mod = getModule(modRefId);
      this.externalModules.add(mod);
    });
  }

  protected override normalizeMeta(modRefId: ModRefId): NormalizedModuleMeta {
    const normalizedModuleMeta = super.normalizeMeta(modRefId);
    const mod = getModule(modRefId);
    if (this.externalModules.has(mod)) {
      normalizedModuleMeta.isExternal = true;
    }
    return normalizedModuleMeta;
  }
}
