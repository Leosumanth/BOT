import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";
import type { DashboardSnapshot, MintJobResult, PendingMintActivity, SocketEventName, WalletPerformanceMetric } from "@mintbot/shared";
import { SOCKET_EVENTS } from "@mintbot/shared";
import { toJsonSafe } from "../../utils/json.js";

@WebSocketGateway({
  cors: {
    origin: "*"
  }
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

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
}
