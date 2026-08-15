import { featureModule } from '#decorators/feature-module.js';
import { injectable } from '#di/decorators.js';
import { forwardRef } from '#di/forward-ref.js';
import { Module3 } from './module-registry3.spec.js';

@injectable()
class Provider1 {}

// Used for circular imports modules with forwardRef()
@featureModule({ providersPerApp: [Provider1], imports: [forwardRef(() => Module3)] })
export class Module1 {}
