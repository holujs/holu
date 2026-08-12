import { XOasObject } from '@ts-stack/openapi-spec';
import { featureModule, DynamicAspectOptionsMap, DynamicModule, ProviderBuilder } from '@holu/core';
import { DispatcherExtension, RestRouteExtension, restAspect } from '@holu/rest';

import { OpenapiCompilerExtension } from './extensions/openapi-compiler.extension.js';
import { OpenapiRouteExtension } from './extensions/openapi-routes.extension.js';
import { OpenapiController } from './openapi.controller.js';
import { SwaggerOAuthOptions } from './swagger-ui/o-auth-options.js';
import { OasExtensionConfig } from './types/oas-extension-options.js';
import { OpenapiLogMediator } from '#services/openapi-log-mediator.js';

@restAspect({
  providersPerMod: [OpenapiLogMediator],
  extensions: [
    { extension: OpenapiRouteExtension, groups: [RestRouteExtension], export: true },
    {
      extension: OpenapiCompilerExtension,
      afterExtensions: [RestRouteExtension],
      beforeExtensions: [DispatcherExtension],
      export: true,
    },
  ],
  controllers: [OpenapiController],
})
@featureModule()
export class OpenapiModule {
  /**
   * @param oasObject This object used for OpenAPI per application.
   * @param absolutePath This absolute path used for OpenAPI module with params.
   */
  static withOpts(
    oasObject: XOasObject<any>,
    absolutePath?: string,
    swaggerOAuthOptions?: SwaggerOAuthOptions,
  ): DynamicModule<OpenapiModule> {
    const oasExtensionConfig: OasExtensionConfig = {
      oasObject,
      swaggerOAuthOptions,
    };

    const aspectOptions: DynamicAspectOptionsMap = new Map();
    if (absolutePath !== undefined) {
      aspectOptions.set(restAspect, { absolutePath });
    }

    return {
      module: this,
      providersPerApp: new ProviderBuilder().useValue<OasExtensionConfig>(OasExtensionConfig, oasExtensionConfig),
      aspectOptions,
    };
  }
}
