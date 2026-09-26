import { createApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const app = createApp({ config });

app.listen(config.port, config.authEnabled ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`PlayerIQ API listening on port ${config.port}`);
});
