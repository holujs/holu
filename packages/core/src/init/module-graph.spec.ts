import { ModuleGraph } from '#init/module-graph.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';

describe('ModuleGraph', () => {
  let graph: ModuleGraph;

  beforeEach(() => {
    graph = new ModuleGraph();
  });

  it('should encapsulate its collections', () => {
    expect(graph.normalizedMetaMap).toBeInstanceOf(Map);
    expect(graph.childrenMap).toBeInstanceOf(Map);
    expect(graph.moduleIdMap).toBeInstanceOf(Map);
    // Note: providersPerApp is a read-only array but internally an array
    expect(Array.isArray(graph.providersPerApp)).toBe(true);
    expect(graph.scanningModules).toBeInstanceOf(Set);
    expect(graph.scannedModules).toBeInstanceOf(Set);
  });

  it('should manage scanning lifecycle', () => {
    class ModuleA {}
    graph.beginScanning(ModuleA);
    expect(graph.isScanning(ModuleA)).toBe(true);
    expect(graph.isScanned(ModuleA)).toBe(false);

    graph.finishScanning(ModuleA);
    expect(graph.isScanning(ModuleA)).toBe(false);
    expect(graph.isScanned(ModuleA)).toBe(true);
    
    graph.cancelScanning(ModuleA);
    expect(graph.isScanning(ModuleA)).toBe(false);
  });

  it('should manage children edges', () => {
    class Parent {}
    class Child1 {}
    class Child2 {}

    graph.addChild(Parent, Child1);
    expect(graph.childrenMap.get(Parent)?.has(Child1)).toBe(true);

    graph.addChild(Parent, Child2);
    expect(graph.childrenMap.get(Parent)?.has(Child2)).toBe(true);

    graph.removeChild(Parent, Child1);
    expect(graph.childrenMap.get(Parent)?.has(Child1)).toBe(false);
    expect(graph.childrenMap.get(Parent)?.has(Child2)).toBe(true);
  });

  describe('pruneUnreachableModules', () => {
    class AppModule {}
    class ModuleA {}
    class ModuleB {}
    class ModuleC {} // Will become orphan

    beforeEach(() => {
      graph.setRootModuleId(AppModule);

      const metaApp = new NormalizedModuleMeta();
      metaApp.modRefId = AppModule;
      metaApp.name = 'AppModule';

      const metaA = new NormalizedModuleMeta();
      metaA.modRefId = ModuleA;
      metaA.name = 'ModuleA';
      metaA.id = 'mod-a';
      metaA.providersPerApp = [{ token: 'tokenA', useValue: 'A' }];

      const metaB = new NormalizedModuleMeta();
      metaB.modRefId = ModuleB;
      metaB.name = 'ModuleB';
      metaB.providersPerApp = [{ token: 'tokenB', useValue: 'B' }];

      const metaC = new NormalizedModuleMeta();
      metaC.modRefId = ModuleC;
      metaC.name = 'ModuleC';
      metaC.id = 'mod-c';
      metaC.providersPerApp = [{ token: 'tokenC', useValue: 'C' }];

      graph.setMeta(AppModule, metaApp);
      graph.setMeta(ModuleA, metaA);
      graph.setMeta(ModuleB, metaB);
      graph.setMeta(ModuleC, metaC);

      graph.addProvidersPerApp([{ token: 'tokenA', useValue: 'A' }, { token: 'tokenB', useValue: 'B' }, { token: 'tokenC', useValue: 'C' }]);
    });

    it('should keep all modules if they are reachable from root', () => {
      // App -> A -> B, App -> C
      graph.addChild(AppModule, ModuleA);
      graph.addChild(ModuleA, ModuleB);
      graph.addChild(AppModule, ModuleC);

      graph.pruneUnreachableModules();

      expect(graph.normalizedMetaMap.has(ModuleC)).toBe(true);
      expect(graph.providersPerApp.length).toBe(3);
    });

    it('should remove disconnected subgraphs (orphan cascading)', () => {
      // App -> A -> B
      // (C is disconnected from App)
      graph.addChild(AppModule, ModuleA);
      graph.addChild(ModuleA, ModuleB);
      // We don't add C to any parent

      graph.pruneUnreachableModules();

      expect(graph.normalizedMetaMap.has(ModuleA)).toBe(true);
      expect(graph.normalizedMetaMap.has(ModuleB)).toBe(true);
      expect(graph.normalizedMetaMap.has(ModuleC)).toBe(false);

      expect(graph.moduleIdMap.has('mod-a')).toBe(true);
      expect(graph.moduleIdMap.has('mod-c')).toBe(false); // C's ID should be deleted

      // Providers for C should be removed, leaving A and B
      expect(graph.providersPerApp.length).toBe(2);
      expect(graph.providersPerApp.some(p => (p as any).token === 'tokenC')).toBe(false);
    });
  });
  
  it('should clone deep structures properly', () => {
    class ModuleA {}
    const metaA = new NormalizedModuleMeta();
    metaA.modRefId = ModuleA;
    metaA.name = 'ModuleA';
    
    graph.setMeta(ModuleA, metaA);
    graph.addChild(ModuleA, class Child {});
    graph.addProvidersPerApp([{ token: 'some', useValue: '1' }]);
    graph.beginScanning(ModuleA);
    
    const clone = graph.clone();
    expect(clone.normalizedMetaMap.has(ModuleA)).toBe(true);
    expect(clone.childrenMap.get(ModuleA)?.size).toBe(1);
    expect(clone.scanningModules.has(ModuleA)).toBe(true);
    expect(clone.providersPerApp.length).toBe(1);
    
    // Mutations on clone should not affect original
    clone.cancelScanning(ModuleA);
    clone.addProvidersPerApp([{ token: 'another', useValue: '2' }]);
    
    expect(graph.isScanning(ModuleA)).toBe(true);
    expect(graph.providersPerApp.length).toBe(1);
  });
});

