import { Logger } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { OnGatewayInit } from "@nestjs/websockets";
import { Socket, Server } from "socket.io";
import type { DashboardSnapshot, MintJobResult, PendingMintActivity, SocketEventName, WalletPerformanceMetric } from "@mintbot/shared";
import { SOCKET_EVENTS } from "@mintbot/shared";
import { AppConfigService } from "../../config/app-config.service.js";
import { verifyRealtimeAuthToken } from "../../auth/auth.utils.js";
import { toJsonSafe } from "../../utils/json.js";

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly config: AppConfigService) {}

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server): void {
    server.engine.opts.cors = {
      origin: (origin, callback) => {
        if (this.config.isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin is not allowed."), false);
      },
      credentials: true
    };

    server.use((socket, next) => {
      const origin = socket.handshake.headers.origin;
      const requestHost = socket.handshake.headers.host;

      if (!this.config.isAllowedOrigin(origin, requestHost)) {
        this.logger.warn(`Rejected realtime connection from origin ${origin ?? "unknown"}.`);
        next(new Error("Origin is not allowed."));
        return;
      }

      const authToken = this.extractRealtimeToken(socket);
      if (!authToken || !verifyRealtimeAuthToken(authToken, this.config.realtimeAuthSecret)) {
        next(new Error("Realtime authentication is required."));
        return;
      }

      next();
    });
  }

  emitSnapshot(snapshot: DashboardSnapshot): void {
    this.server.emit(SOCKET_EVENTS.dashboardSnapshot, toJsonSafe(snapshot));
  }

  emitTelemetry(payload: unknown): void {
    this.server.emit(SOCKET_EVENTS.dashboardTelemetry, toJsonSafe(payload));
  }

  emitMintFeed(activity: PendingMintActivity): void {
    this.server.emit(SOCKET_EVENTS.mintFeed, toJsonSafe(activity));
  }

  emitWalletMetrics(metrics: WalletPerformanceMetric[]): void {
    this.server.emit(SOCKET_EVENTS.walletMetrics, toJsonSafe(metrics));
  }

  emitJobStatus(result: MintJobResult): void {
    this.server.emit(SOCKET_EVENTS.jobStatus, toJsonSafe(result));
  }

  emit(event: SocketEventName, payload: unknown): void {
    this.server.emit(event, toJsonSafe(payload));
  }

  private extractRealtimeToken(socket: Socket): string | null {
    const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token.trim() : "";
    if (authToken) {
      return authToken;
    }

    const authorization = socket.handshake.headers.authorization;
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length).trim() || null;
    }

    return null;
  }
}
