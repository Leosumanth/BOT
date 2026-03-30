import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";

type RootResponse = {
  json(body: unknown): void;
  redirect(statusCode: number, url: string): void;
};

function shouldRedirectToFrontend(frontendUrl: string): boolean {
  try {
    const url = new URL(frontendUrl);
    return !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });
  const config = app.get(AppConfigService);
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.get("/", (_req: unknown, res: RootResponse) => {
    if (shouldRedirectToFrontend(config.frontendUrl)) {
      res.redirect(302, config.frontendUrl);
      return;
    }

    res.json({
      service: "mintbot-backend",
      ok: true,
      apiBasePath: `/${config.apiPrefix}`,
      frontendUrl: config.frontendUrl
    });
  });

  expressApp.get("/health", (_req: unknown, res: Pick<RootResponse, "json">) => {
    res.json({
      service: "mintbot-backend",
      ok: true,
      timestamp: new Date().toISOString()
    });
  });

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
