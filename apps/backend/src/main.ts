import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";

type RootResponse = {
  json(body: unknown): void;
  redirect(statusCode: number, url: string): void;
};

type RootServerResponse = RootResponse & ServerResponse;

type FrontendRequest = IncomingMessage & {
  headers: IncomingMessage["headers"] & { host?: string };
  originalUrl?: string;
  path?: string;
};

type ExpressLikeApp = {
  get(path: string, handler: (req: FrontendRequest, res: RootServerResponse) => void): void;
  set(key: string, value: unknown): void;
  use(handler: (req: FrontendRequest, res: ServerResponse, next: (error?: unknown) => void) => void): void;
};

type EmbeddedFrontendHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
type NextModule = { default: typeof import("next").default };

const moduleDir = dirname(fileURLToPath(import.meta.url));
const frontendDirCandidates = [
  resolve(process.cwd(), "..", "frontend"),
  resolve(process.cwd(), "apps", "frontend"),
  resolve(moduleDir, "..", "..", "frontend")
];

function getPublicFrontendUrl(frontendUrl: string): URL | null {
  try {
    const url = new URL(frontendUrl);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) ? null : url;
  } catch {
    return null;
  }
}

function getRequestPath(req: FrontendRequest): string {
  return req.path ?? req.originalUrl ?? "/";
}

function isFrontendRoute(path: string, apiPrefix: string): boolean {
  return path !== "/health" && !path.startsWith(`/${apiPrefix}`) && !path.startsWith("/socket.io");
}

function buildFrontendRedirectUrl(frontendUrl: URL, originalUrl: string | undefined): string {
  return new URL(originalUrl ?? "/", frontendUrl).toString();
}

function shouldRedirectRequest(frontendUrl: URL, requestHost: string | undefined): boolean {
  return requestHost?.split(":")[0]?.toLowerCase() !== frontendUrl.hostname.toLowerCase();
}

function findBuiltFrontendDir(): string | null {
  for (const candidate of frontendDirCandidates) {
    if (existsSync(resolve(candidate, ".next", "BUILD_ID"))) {
      return candidate;
    }
  }

  return null;
}

async function prepareEmbeddedFrontend(logger: Logger, shouldWarnIfMissing: boolean): Promise<EmbeddedFrontendHandler | null> {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const frontendDir = findBuiltFrontendDir();

  if (!frontendDir) {
    if (shouldWarnIfMissing) {
      logger.warn("No built Next.js frontend was found. Backend root will use the fallback response.");
    }

    return null;
  }

  const { default: createNextServer } = (await import("next")) as unknown as NextModule;
  const nextApp = createNextServer({
    dev: false,
    dir: frontendDir
  });

  await nextApp.prepare();
  logger.log(`Serving built frontend from ${frontendDir}`);

  const requestHandler = nextApp.getRequestHandler();
  return async (req, res) => {
    await requestHandler(req, res);
  };
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, {
    cors: true
  });
  const config = app.get(AppConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as ExpressLikeApp;
  const publicFrontendUrl = getPublicFrontendUrl(config.frontendUrl);
  const embeddedFrontendHandler = await prepareEmbeddedFrontend(logger, publicFrontendUrl === null);

  expressApp.get("/health", (_req: FrontendRequest, res: RootServerResponse) => {
    res.json({
      service: "mintbot-backend",
      ok: true,
      timestamp: new Date().toISOString()
    });
  });

  app.use(
    helmet({
      // Next.js app-router responses include inline hydration scripts. The default
      // Helmet CSP blocks them and can leave the embedded frontend on a blank page.
      contentSecurityPolicy: embeddedFrontendHandler ? false : undefined
    })
  );
  app.setGlobalPrefix(config.apiPrefix);
  expressApp.set("json replacer", (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
  app.enableCors({
    origin: [config.frontendUrl],
    credentials: true
  });
  expressApp.get("/", (req: FrontendRequest, res: RootServerResponse) => {
    if (publicFrontendUrl && shouldRedirectRequest(publicFrontendUrl, req.headers.host)) {
      res.redirect(302, buildFrontendRedirectUrl(publicFrontendUrl, req.originalUrl));
      return;
    }

    if (embeddedFrontendHandler) {
      void embeddedFrontendHandler(req, res).catch((error) => {
        logger.error("Embedded frontend failed to respond for /", error instanceof Error ? error.stack : String(error));

        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              service: "mintbot-backend",
              ok: false,
              message: "Embedded frontend failed to render."
            })
          );
        }
      });
      return;
    }

    res.json({
      service: "mintbot-backend",
      ok: true,
      apiBasePath: `/${config.apiPrefix}`,
      frontendUrl: config.frontendUrl
    });
  });
  expressApp.use((req, res, next) => {
    const path = getRequestPath(req);

    if (!isFrontendRoute(path, config.apiPrefix)) {
      next();
      return;
    }

    if (publicFrontendUrl && shouldRedirectRequest(publicFrontendUrl, req.headers.host)) {
      res.writeHead(302, {
        Location: buildFrontendRedirectUrl(publicFrontendUrl, req.originalUrl)
      });
      res.end();
      return;
    }

    if (embeddedFrontendHandler) {
      void embeddedFrontendHandler(req, res).catch(next);
      return;
    }

    next();
  });

  await app.listen(config.port);
  logger.log(`MintBot backend listening on http://localhost:${config.port}/${config.apiPrefix}`);
}

void bootstrap();
