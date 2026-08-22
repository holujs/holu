import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { ModulesMap } from '#init/module-registry.js';
import type { Provider } from '#di/top/types-and-models.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { isRootModule } from '#decorators/type-guards.js';

export class ModuleGraph {
  #normalizedMetaMap: ModulesMap = new Map();
  #childrenMap = new Map<ModRefId, Set<ModRefId>>();
  #scannedModules = new Set<ModRefId>();
  #scanningModules = new Set<ModRefId>();
  #moduleIdMap = new Map<string, ModRefId>();
  #providersPerApp: Provider[] = [];

  get normalizedMetaMap(): ReadonlyMap<ModRefId, NormalizedModuleMeta> {
    return this.#normalizedMetaMap;
  }

  get childrenMap(): ReadonlyMap<ModRefId, ReadonlySet<ModRefId>> {
    return this.#childrenMap;
  }

  get moduleIdMap(): ReadonlyMap<string, ModRefId> {
    return this.#moduleIdMap;
  }

  get providersPerApp(): readonly Provider[] {
    return this.#providersPerApp;
  }

  get scanningModules(): ReadonlySet<ModRefId> {
    return this.#scanningModules;
  }

  get scannedModules(): ReadonlySet<ModRefId> {
    return this.#scannedModules;
  }

  clear(): void {
    this.#providersPerApp = [];
    this.#childrenMap.clear();
    this.#normalizedMetaMap.clear();
    this.#moduleIdMap.clear();
    this.#scanningModules.clear();
    this.#scannedModules.clear();
  }

  setChildren(modRefId: ModRefId, children: Set<ModRefId>): void {
    this.#childrenMap.set(modRefId, children);
  }

  isScanning(modRefId: ModRefId): boolean {
    return this.#scanningModules.has(modRefId);
  }

  beginScanning(modRefId: ModRefId): void {
    this.#scanningModules.add(modRefId);
  }

  finishScanning(modRefId: ModRefId): void {
    this.#scanningModules.delete(modRefId);
    this.#scannedModules.add(modRefId);
  }

  setRootModuleId(appModule: ModRefId): void {
    this.#moduleIdMap.set('root', appModule);
  }

  addProvidersPerApp(providers: Provider[]): void {
    this.#providersPerApp.push(...providers);
  }

  getMeta(modRefId: ModRefId): NormalizedModuleMeta | undefined {
    return this.#normalizedMetaMap.get(modRefId);
  }

  setMeta(modRefId: ModRefId, meta: NormalizedModuleMeta): void {
    this.#normalizedMetaMap.set(modRefId, meta);
    if (meta.id) {
      this.#moduleIdMap.set(meta.id, modRefId);
    }
    if (!isRootModule(meta)) {
      this.addProvidersPerApp(meta.providersPerApp);
    }
  }

  isScanned(modRefId: ModRefId): boolean {
    return this.#scannedModules.has(modRefId);
  }

  /**
   * @experimental
   */
  clone(): ModuleGraph {
    const copy = new ModuleGraph();
    this.#normalizedMetaMap.forEach((meta, id) => {
      copy.#normalizedMetaMap.set(id, meta.clone());
    });
    this.#childrenMap.forEach((children, id) => {
      copy.#childrenMap.set(id, new Set(children));
    });
    copy.#scannedModules = new Set(this.#scannedModules);
    copy.#scanningModules = new Set(this.#scanningModules);
    copy.#moduleIdMap = new Map(this.#moduleIdMap);
    copy.#providersPerApp = this.#providersPerApp.slice();
    return copy;
  }

  addChild(parentId: ModRefId, childId: ModRefId): void {
    let children = this.#childrenMap.get(parentId);
    if (!children) {
      children = new Set();
      this.#childrenMap.set(parentId, children);
    }
    children.add(childId);
  }

  removeChild(parentId: ModRefId, childId: ModRefId): void {
    const children = this.#childrenMap.get(parentId);
    if (children) {
      children.delete(childId);
    }
  }

  cancelScanning(modRefId: ModRefId): void {
    this.#scanningModules.delete(modRefId);
  }

  rebuildProvidersPerApp(): void {
    this.#providersPerApp = [];
    this.#normalizedMetaMap.forEach((m) => {
      if (!isRootModule(m)) {
        this.#providersPerApp.push(...m.providersPerApp);
      }
    });
  }

  pruneUnreachableModules(): void {
    const reachable = new Set<ModRefId>();

    const traverse = (modRefId: ModRefId) => {
      if (reachable.has(modRefId)) {
        return;
      }
      reachable.add(modRefId);
      const children = this.#childrenMap.get(modRefId);
      if (children) {
        for (const child of children) {
          traverse(child);
        }
      }
    };

    const rootModRefId = this.#moduleIdMap.get('root');
    if (rootModRefId) {
      traverse(rootModRefId);
    }

    let hasOrphans = false;
    for (const [modRefId, meta] of this.#normalizedMetaMap.entries()) {
      if (!reachable.has(modRefId)) {
        hasOrphans = true;
        this.#normalizedMetaMap.delete(modRefId);
        this.#childrenMap.delete(modRefId);
        if (meta.id) {
          this.#moduleIdMap.delete(meta.id);
        }
      }
    }

    if (hasOrphans) {
      this.rebuildProvidersPerApp();
    }
  }
}
