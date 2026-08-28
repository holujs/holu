---
sidebar_position: 0
---

# Application workflow

As mentioned in [introducing application and initializer classes][1], Holu provides an API for writing applications with different architectural styles (REST, tRPC, GraphQL, WebSockets, Microservices, etc.). Each architectural style is delivered via a [platform package][1]. Initialization starts with creating an instance of the application class, and it is at this stage that the configuration accepted by the application class and the order of its assembly are determined.

The initialization stages of applications with different architectural styles may differ, but as a rule, the following happens:

1. First, [ModuleRegistry][2] scans all modules, starting with the root module.
2. Decorators of the [root module, feature modules][5], and [aspect decorators][3] allow attaching certain metadata to module classes. During application scanning, this metadata is normalized and validated.
3. Then the [AppInitializer][4] analyzes this metadata, collects providers, and runs extensions.
4. Application initialization is completed in the [Application][1] class, the web server is started, and the application begins operating in normal mode, accepting HTTP requests.


[1]: /basic-components/application/
[2]: /deep-dive/module-registry/
[3]: /deep-dive/module-aspects/
[4]: /deep-dive/app-initializer/
[5]: /basic-components/modules/
[6]: /deep-dive/extension-manager/

