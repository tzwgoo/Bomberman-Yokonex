/**
 * IMPORTANT:
 * ---------
 * Do not manually edit this file if you'd like to use Colyseus Cloud
 *
 * If you're self-hosting (without Colyseus Cloud), you can manually instantiate a
 * Colyseus Server as documented here: 👉 https://docs.colyseus.io/server/api/#constructor-options
 */
import { listen } from "@colyseus/tools";

// Import arena config
import appConfig from "./app.config";

// 默认使用项目约定的后端端口，也允许部署时通过 PORT 覆盖。
process.env.PORT ||= "45170";

listen(appConfig);
