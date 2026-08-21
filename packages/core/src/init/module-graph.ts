import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { ModulesMap } from '#init/module-registry.js';
import type { Provider } from '#di/top/types-and-models.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { isRootModule } from '#decorators/type-guards.js';

export class ModuleGraph {
  protected _normalizedMetaMap: ModulesMap = new Map();
  protected _childrenMap = new Map<ModRefId, Set<ModRefId>>();
  protected _scannedModules = new Set<ModRefId>();
  protected _scanningModules = new Set<ModRefId>();
  protected _moduleIdMap = new Map<string, ModRefId>();
  protected _providersPerApp: Provider[] = [];

  get normalizedMetaMap(): ReadonlyMap<ModRefId, NormalizedModuleMeta> {
    return this._normalizedMetaMap;
  }

  get childrenMap(): ReadonlyMap<ModRefId, ReadonlySet<ModRefId>> {
    return this._childrenMap;
  }

  get moduleIdMap(): ReadonlyMap<string, ModRefId> {
    return this._moduleIdMap;
  }

  get providersPerApp(): readonly Provider[] {
    return this._providersPerApp;
  }

  get scanningModules(): ReadonlySet<ModRefId> {
    return this._scanningModules;
  }

  get scannedModules(): ReadonlySet<ModRefId> {
    return this._scannedModules;
  }

  /**
   * @experimental
   */
  clone(): ModuleGraph {
    const copy = new ModuleGraph();
    this._normalizedMetaMap.forEach((meta, id) => {
      copy._normalizedMetaMap.set(id, meta.clone());
    });
    this._childrenMap.forEach((children, id) => {
      copy._childrenMap.set(id, new Set(children));
    });
    copy._scannedModules = new Set(this._scannedModules);
    copy._scanningModules = new Set(this._scanningModules);
    copy._moduleIdMap = new Map(this._moduleIdMap);
    copy._providersPerApp = this._providersPerApp.slice();
    return copy;
  }

  clear(): void {
    this._providersPerApp = [];
    this._childrenMap.clear();
    this._normalizedMetaMap.clear();
    this._moduleIdMap.clear();
    this._scanningModules.clear();
    this._scannedModules.clear();
  }

  setMeta(modRefId: ModRefId, meta: NormalizedModuleMeta): void {
    this._normalizedMetaMap.set(modRefId, meta);
    if (meta.id) {
      this._moduleIdMap.set(meta.id, modRefId);
    }
  }

  getMeta(modRefId: ModRefId): NormalizedModuleMeta | undefined {
    return this._normalizedMetaMap.get(modRefId);
  }

  setChildren(modRefId: ModRefId, children: Set<ModRefId>): void {
    this._childrenMap.set(modRefId, children);
  }

  addChild(parentId: ModRefId, childId: ModRefId): void {
    let children = this._childrenMap.get(parentId);
    if (!children) {
      children = new Set();
      this._childrenMap.set(parentId, children);
    }
    children.add(childId);
  }

  removeChild(parentId: ModRefId, childId: ModRefId): void {
    const children = this._childrenMap.get(parentId);
    if (children) {
      children.delete(childId);
    }
  }

  addProvidersPerApp(providers: Provider[]): void {
    this._providersPerApp.push(...providers);
  }

  beginScanning(modRefId: ModRefId): void {
    this._scanningModules.add(modRefId);
  }

  finishScanning(modRefId: ModRefId): void {
    this._scanningModules.delete(modRefId);
    this._scannedModules.add(modRefId);
  }

  cancelScanning(modRefId: ModRefId): void {
    this._scanningModules.delete(modRefId);
  }

  isScanning(modRefId: ModRefId): boolean {
    return this._scanningModules.has(modRefId);
  }

  isScanned(modRefId: ModRefId): boolean {
    return this._scannedModules.has(modRefId);
  }

  setRootModuleId(appModule: ModRefId): void {
    this._moduleIdMap.set('root', appModule);
  }

  rebuildProvidersPerApp(): void {
    this._providersPerApp = [];
    this._normalizedMetaMap.forEach((m) => {
      if (!isRootModule(m)) {
        this._providersPerApp.push(...m.providersPerApp);
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
      const children = this._childrenMap.get(modRefId);
      if (children) {
        for (const child of children) {
          traverse(child);
        }
      }
    };

    const rootModRefId = this._moduleIdMap.get('root');
    if (rootModRefId) {
      traverse(rootModRefId);
    }

    let hasOrphans = false;
    for (const [modRefId, meta] of this._normalizedMetaMap.entries()) {
      if (!reachable.has(modRefId)) {
        hasOrphans = true;
        this._normalizedMetaMap.delete(modRefId);
        this._childrenMap.delete(modRefId);
        if (meta.id) {
          this._moduleIdMap.delete(meta.id);
        }
      }
    }

    if (hasOrphans) {
      this.rebuildProvidersPerApp();
    }
  }
}
