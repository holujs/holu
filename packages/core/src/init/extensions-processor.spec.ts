import type { ModRefId } from '#decorators/module-decorator-options.js';
import { featureModule } from '#decorators/feature-module.js';
import { injectable } from '#di/decorators.js';
import { Extension } from '#extension/extension-types.js';
import { KeyRegistry } from '#di/key-registry.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { InvalidExtension } from '#error/core-errors.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';

describe('ExtensionsProcessor (via ModuleNormalizer)', () => {
  class MockModuleNormalizer extends ModuleNormalizer {
    override normalize(modRefId: ModRefId): NormalizedModuleMeta {
      return super.normalize(modRefId);
    }
  }

  let normalizer: MockModuleNormalizer;

  beforeEach(() => {
    clearDebugClassNames();
    const systemLogMediator = { externalModuleDetectionFailed: () => {} } as any;
    normalizer = new MockModuleNormalizer(systemLogMediator);
  });

  describe('extensions', () => {
    it('normalizes and exports an extension class that implements a stage method', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @featureModule({ extensions: [{ extension: Extension1, export: true }] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.extensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.exportedExtensionProviders).toEqual([Extension1]);
    });

    it('accepts extensions that implement only stage2 or only stage3', () => {
      @injectable()
      class Stage2Extension implements Extension {
        async stage2() {}
      }

      @injectable()
      class Stage3Extension implements Extension {
        async stage3() {}
      }

      @featureModule({ extensions: [Stage2Extension, Stage3Extension] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.extensionProviders).toEqual([Stage2Extension, Stage3Extension]);
    });

    it('throws InvalidExtension when an extension provider has no stage method', () => {
      @injectable()
      class Extension1 {}

      @featureModule({ extensions: [{ extension: Extension1, export: true }] })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new InvalidExtension('Module1', 'Extension1'));
    });

    it('normalizes extension group providers and records the group token mapping', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @injectable()
      class Extension2 implements Extension {
        async stage1() {}
      }

      @featureModule({ extensions: [{ extension: Extension1, groups: [Extension2] }] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      const groupToken = KeyRegistry.getExtensionGroupToken(Extension2);
      expect(normalizedModuleMeta.extensionProviders).toEqual([
        { token: groupToken, useToken: Extension2, multi: true },
        Extension1,
        { token: groupToken, useToken: Extension1, multi: true },
      ]);
      expect(normalizedModuleMeta.extensionGroupTokensMap.get(Extension2)).toBe(groupToken);
    });

    it('puts exportOnly extensions only into exported extension metadata', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @featureModule({ extensions: [{ extension: Extension1, exportOnly: true }] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.extensionProviders).toEqual([]);
      expect(normalizedModuleMeta.exportedExtensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.exportedExtensionConfigs).toHaveLength(1);
    });
  });
});
