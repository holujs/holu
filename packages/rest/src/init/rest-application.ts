import type * as http from 'node:http';
import type * as http2 from 'node:http2';
import type * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import type { StaticModule } from '@holu/core';
import { SystemLogMediator, BaseApplication } from '@holu/core';

import type { AppOptions } from '#types/app-options.js';
import type { HttpServerModule, HttpsServerModule } from '#init/http-module.js';
import type { Http2SecureServerOptions, HttpServer } from '#types/server-options.js';
import { isHttp2SecureServerOptions } from '#types/type.guards.js';
import type { RequestListener } from '#services/request.js';
import { RestAppInitializer } from './rest-app-initializer.js';
import { CreateSecureServerInHttp2NotFound } from '#errors';

export class RestApplication extends BaseApplication {
  server: HttpServer;
  declare protected appOptions: AppOptions;

  /**
   * @param appModule The root module of the application.
   * @param restOptions {@link RestApplication} options.
   */
  static async create(appModule: StaticModule, restOptions?: AppOptions) {
    const app = new this();
    try {
      app.init(restOptions);
      const moduleRegistry = app.scanRootModule(appModule);
      const appInitializer = new RestAppInitializer(app.appOptions, moduleRegistry, app.log);
      await app.bootstrapApplication(appInitializer);
      await app.createServerAndBindToListening(appInitializer);
      return app;
    } catch (err: any) {
      (app.log as PublicLogMediator).updateOutputLogLevel();
      app.log.internalServerError(app, err);
      app.flushLogs();
      process.exit(1);
    }
  }

  protected override init(restOptions?: AppOptions) {
    this.appOptions = { ...restOptions };
    super.init(restOptions);
    this.checkSecureServerOption();
  }

  protected checkSecureServerOption() {
    const serverOptions = this.appOptions.serverOptions as Http2SecureServerOptions;
    if (serverOptions?.isHttp2SecureServer && !(this.appOptions.httpModule as typeof http2).createSecureServer) {
      throw new CreateSecureServerInHttp2NotFound();
    }
  }

  protected async createServerAndBindToListening(appInitializer: RestAppInitializer) {
    this.flushLogs();
    this.server = await this.createServer(appInitializer.requestListener);
    appInitializer.setServer(this.server);
    this.server.on('listening', () => {
      const info = this.server.address() as AddressInfo;
      this.log.serverListen(this, info.address, info.port);
    });
  }

  protected async createServer(requestListener: RequestListener): Promise<HttpServer> {
    if (isHttp2SecureServerOptions(this.appOptions.serverOptions || {})) {
      const serverModule = this.appOptions.httpModule as typeof http2;
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      return serverModule.createSecureServer(this.appOptions.serverOptions || {}, requestListener);
    } else {
      const serverModule = (this.appOptions.httpModule || (await import('http'))) as HttpServerModule | HttpsServerModule;
      const serverOptions = this.appOptions.serverOptions as http.ServerOptions | https.ServerOptions;
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      return serverModule.createServer(serverOptions, requestListener);
    }
  }

  protected override async customShutdown(signal?: string): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      if ('closeAllConnections' in this.server) {
        const server = this.server;
        const timeoutVal = this.appOptions.shutdownTimeout ?? 15000;
        timer = setTimeout(() => server.closeAllConnections(), timeoutVal);
      }

      this.server.close((err) => {
        if (timer) {
          clearTimeout(timer);
        }
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });

      if ('closeIdleConnections' in this.server) {
        this.server.closeIdleConnections();
      }
    });
  }
}

/**
 * This class is needed only as type to access the protected methods of the `LogMediator` class.
 */
export class PublicLogMediator extends SystemLogMediator {
  override updateOutputLogLevel() {
    return super.updateOutputLogLevel();
  }
}
