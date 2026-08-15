import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { ModuleRegistry } from '#init/module-registry.js';
import { Module1 } from '#init/module-registry4.spec.js';
import { forwardRef } from '#di/forward-ref.js';

@featureModule({ imports: [forwardRef(() => Module1)], providersPerApp: [{ token: 'token2' }] })
class Module2 {}

@featureModule({ imports: [Module2], providersPerApp: [{ token: 'token3' }] })
export class Module3 {}

describe('ModuleRegistry', () => {
  let mock: ModuleRegistry;

  beforeEach(() => {
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    mock = new ModuleRegistry(systemLogMediator);
  });

  it('circular imports modules with forwardRef()', () => {
    @featureModule({ imports: [Module3], providersPerApp: [{ token: 'token4' }] })
    class Module4 {}

    @rootModule({
      imports: [Module4],
    })
    class AppModule {}
    expect(() => mock.scanRootModule(AppModule)).not.toThrow();
  });
});
