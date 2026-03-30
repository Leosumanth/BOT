export const QUEUE_NAMES = {
  mint: "mint-jobs",
  tracker: "tracker-jobs"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
