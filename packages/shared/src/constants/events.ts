export const SOCKET_EVENTS = {
  dashboardSnapshot: "dashboard:snapshot",
  dashboardTelemetry: "dashboard:telemetry",
  mintFeed: "mint:feed",
  trackerFeed: "tracker:feed",
  gasFeed: "gas:feed",
  walletMetrics: "wallet:metrics",
  jobStatus: "job:status"
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
