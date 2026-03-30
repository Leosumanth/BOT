import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });
  const config = app.get(AppConfigService);
  const expressApp = app.getHttpAdapter().getInstance();

  app.use(helmet());
  app.setGlobalPrefix(config.apiPrefix);
  expressApp.set("json replacer", (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
  app.enableCors({
    origin: [config.frontendUrl],
    credentials: true
  });

  await app.listen(config.port);
  new Logger("Bootstrap").log(`MintBot backend listening on http://localhost:${config.port}/${config.apiPrefix}`);
}

void bootstrap();
