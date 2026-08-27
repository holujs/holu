import type { Extension } from '#extension/extension-types.js';
import type { ExtensionConfig } from '#extension/extension-providers-and-configs.js';
import {
  normalizeExtensionConfig,
  isOverrideExtensionConfig,
  isStandardExtensionConfig,
  getExtensionProviders,
} from '#extension/extension-providers-and-configs.js';
import type { Provider } from '#di/top/types-and-models.js';
import { KeyRegistry } from '#di/key-registry.js';

describe('extension-providers-and-configs', () => {
  class Extension1 implements Extension {
    async stage1() {}
  }
  class Extension2 implements Extension {
    async stage1() {}
  }
  class Extension3 implements Extension {
    async stage1() {}
  }

  describe('isOverrideExtensionConfig()', () => {
    it('should return true if overrideExtension is defined', () => {
      expect(isOverrideExtensionConfig({ extension: Extension2, overrideExtension: Extension1 })).toBe(true);
    });

    it('should return false if overrideExtension is not defined', () => {
      expect(isOverrideExtensionConfig({ extension: Extension1 })).toBe(false);
    });
  });

  describe('isStandardExtensionConfig()', () => {
    it('should return true if extension is defined', () => {
      expect(isStandardExtensionConfig({ extension: Extension1 })).toBe(true);
      expect(isStandardExtensionConfig({ extension: Extension2, overrideExtension: Extension1 })).toBe(true);
    });

    it('should return false if extension is not defined', () => {
      expect(isStandardExtensionConfig({})).toBe(false);
    });
  });

  describe('normalizeExtensionConfig()', () => {
    describe('without groups', () => {
      const providers: Provider[] = [Extension1];

      it('extension without exports (two arguments)', () => {
        const args: ExtensionConfig = { extension: Extension1 };
        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers,
          exportedProviders: [],
          config: args,
          groupTokensMap: new Map(),
        });
      });

      it('extension with override', () => {
        const args: ExtensionConfig = { extension: Extension2, overrideExtension: Extension1 };
        const overrideProviders: Provider[] = [{ token: Extension1, useClass: Extension2 }];
        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers: overrideProviders,
          exportedProviders: [],
        });
      });

      it('extension with override ignores other properties at runtime', () => {
        const args = { extension: Extension2, overrideExtension: Extension1, export: true, groups: [Extension3] } as any;
        const overrideProviders: Provider[] = [{ token: Extension1, useClass: Extension2 }];
        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers: overrideProviders,
          exportedProviders: [],
        });
        expect(normalizeExtensionConfig(args).config).toBeUndefined();
      });

      it('extension without exports (export: false)', () => {
        const args: ExtensionConfig = { extension: Extension1, export: false };
        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers,
          exportedProviders: [],
          config: args,
          groupTokensMap: new Map(),
        });
      });

      it('extension with exports', () => {
        const args: ExtensionConfig = { extension: Extension1, export: true };
        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers,
          exportedProviders: providers,
          config: args,
          exportedConfig: args,
          groupTokensMap: new Map(),
          exportedGroupTokensMap: new Map(),
        });
      });

      it('extension with exportOnly', () => {
        const args: ExtensionConfig = { extension: Extension1, exportOnly: true };
        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers: [],
          exportedProviders: providers,
          exportedConfig: args,
          exportedGroupTokensMap: new Map(),
        });
      });
    });

    describe('with groups', () => {
      it('extension with groups without export', () => {
        const args: ExtensionConfig = { extension: Extension1, groups: [Extension2, Extension3] };
        const groupToken2 = KeyRegistry.getExtensionGroupToken(Extension2);
        const groupToken3 = KeyRegistry.getExtensionGroupToken(Extension3);
        const expectedProviders: Provider[] = [
          Extension1,
          { token: groupToken2, useToken: Extension1, multi: true },
          { token: groupToken3, useToken: Extension1, multi: true },
        ];
        const groupTokensMap = new Map();
        groupTokensMap.set(Extension2, groupToken2);
        groupTokensMap.set(Extension3, groupToken3);

        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers: expectedProviders,
          exportedProviders: [],
          config: args,
          groupTokensMap,
        });
      });

      it('extension with groups and export', () => {
        const args: ExtensionConfig = { extension: Extension1, export: true, groups: [Extension2] };
        const groupToken2 = KeyRegistry.getExtensionGroupToken(Extension2);
        const expectedProviders: Provider[] = [Extension1, { token: groupToken2, useToken: Extension1, multi: true }];
        const groupTokensMap = new Map();
        groupTokensMap.set(Extension2, groupToken2);

        expect(normalizeExtensionConfig(args)).toMatchObject({
          providers: expectedProviders,
          exportedProviders: expectedProviders,
          config: args,
          exportedConfig: args,
          groupTokensMap,
          exportedGroupTokensMap: groupTokensMap,
        });
      });

      it('extension with groups and exportOnly', () => {
        const args: ExtensionConfig = { extension: Extension1, exportOnly: true, groups: [Extension2] };
        const groupToken2 = KeyRegistry.getExtensionGroupToken(Extension2);
        const expectedProviders: Provider[] = [Extension1, { token: groupToken2, useToken: Extension1, multi: true }];
        const groupTokensMap = new Map();
        groupTokensMap.set(Extension2, groupToken2);

        const result = normalizeExtensionConfig(args);
        expect(result).toMatchObject({
          providers: [],
          exportedProviders: expectedProviders,
          exportedConfig: args,
          exportedGroupTokensMap: groupTokensMap,
        });
        expect(result.config).toBeUndefined();
        expect(result.groupTokensMap).toBeUndefined();
      });
    });
  });

  describe('getExtensionProviders()', () => {
    it('should extract providers from multiple configs', () => {
      const args1: ExtensionConfig = { extension: Extension1 };
      const args2: ExtensionConfig = { extension: Extension2, overrideExtension: Extension3 };
      const args3: ExtensionConfig = { extension: Extension3, exportOnly: true };

      const providers = getExtensionProviders([args1, args2, args3]);
      expect(providers).toEqual([Extension1, { token: Extension3, useClass: Extension2 }]);
    });
  });
});
