import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { MintQueueProcessor } from "../modules/queues/mint-queue.processor.js";

async function bootstrapWorker(): Promise<void> {
  process.env.ENABLE_INLINE_WORKER = process.env.ENABLE_INLINE_WORKER ?? "true";
  process.env.ENABLE_MEMPOOL_TRACKER = "false";
  const app = await NestFactory.createApplicationContext(AppModule);
  app.get(MintQueueProcessor);
  new Logger("MintWorker").log("Dedicated mint worker started.");
}

void bootstrapWorker();
