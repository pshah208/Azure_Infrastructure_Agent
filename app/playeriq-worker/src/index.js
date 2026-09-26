import { mkdir } from "node:fs/promises";
import { createAzureServices } from "./azureServices.js";
import { getConfig, validateConfig } from "./config.js";
import { createProcessor } from "./processor.js";

const config = getConfig();
validateConfig(config);
await mkdir(config.tempRoot, { recursive: true });

const services = createAzureServices(config);
const processVideoJob = createProcessor({ config, services });
const receiver = services.createReceiver();

receiver.subscribe(
  {
    async processMessage(message) {
      const result = await processVideoJob(message.body);
      console.log(JSON.stringify({ event: "video-processing-completed", ...result }));
    },
    async processError(args) {
      console.error(
        JSON.stringify({
          event: "video-processing-error",
          errorSource: args.errorSource,
          entityPath: args.entityPath,
          namespace: args.fullyQualifiedNamespace,
          message: args.error?.message,
          stack: args.error?.stack
        })
      );
    }
  },
  {
    autoCompleteMessages: true,
    maxConcurrentCalls: 1
  }
);

console.log(
  JSON.stringify({
    event: "worker-started",
    queue: config.videoProcessingQueueName,
    maxSampleFrames: config.maxSampleFrames
  })
);

async function shutdown(signal) {
  console.log(JSON.stringify({ event: "worker-stopping", signal }));
  await receiver.close();
  await services.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
