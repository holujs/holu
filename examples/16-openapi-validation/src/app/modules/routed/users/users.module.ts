import { DynamicAspectOptionsMap, DynamicModuleWithAspectOptions } from '@holu/core';
import { ValidationModule } from '@holu/openapi-validation';
import { BodyParserModule } from '@holu/body-parser';
import { restAspect, restModule } from '@holu/rest';

import { UsersController } from './users.controller.js';

@restModule({
  imports: [BodyParserModule, ValidationModule],
  controllers: [UsersController],
})
export class UsersModule {
  static withPath(path?: string): DynamicModuleWithAspectOptions<UsersModule> {
    const dynamicAspectOptionsMap: DynamicAspectOptionsMap = new Map();
    dynamicAspectOptionsMap.set(restAspect, { path });

    return {
      module: this,
      dynamicAspectOptionsMap,
    };
  }
}
