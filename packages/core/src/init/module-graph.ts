import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { ModulesMap } from '#init/module-registry.js';
import type { Provider } from '#di/top/types-and-models.js';

export class ModuleGraph {
  normalizedMetaMap: ModulesMap = new Map();
  childrenMap = new Map<ModRefId, Set<ModRefId>>();
  scannedModules = new Set<ModRefId>();
  scanningModules = new Set<ModRefId>();
  moduleIdMap = new Map<string, ModRefId>();
  providersPerApp: Provider[] = [];

  /**
   * @experimental
   */
  clone(): ModuleGraph {
    const copy = new ModuleGraph();
    this.normalizedMetaMap.forEach((meta, id) => {
      copy.normalizedMetaMap.set(id, meta.clone());
    });
    this.childrenMap.forEach((children, id) => {
      copy.childrenMap.set(id, new Set(children));
    });
    copy.scannedModules = new Set(this.scannedModules);
    copy.scanningModules = new Set(this.scanningModules);
    copy.moduleIdMap = new Map(this.moduleIdMap);
    copy.providersPerApp = this.providersPerApp.slice();
    return copy;
  }
}
