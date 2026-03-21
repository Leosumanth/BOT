function resolveQueueConfig(env = process.env) {
  const mode = String(env.QUEUE_MODE || "local").trim().toLowerCase() || "local";
  const namespace = String(env.REDIS_NAMESPACE || "mintbot").trim() || "mintbot";

  return {
    mode,
    enabled: mode === "redis",
    redisUrl: String(env.REDIS_URL || "").trim(),
    namespace,
    queueKey: `${namespace}:queue`,
    runStateKey: `${namespace}:run-state`,
    eventsChannel: `${namespace}:events`,
    controlChannel: `${namespace}:control`,
    blockTimeoutSeconds: Math.max(1, Number(env.REDIS_BLOCK_TIMEOUT_SEC || 5)),
    workerId: String(env.WORKER_ID || "").trim() || null
  };
}

function createIdleRunState(config = resolveQueueConfig()) {
  return {
    status: "idle",
    activeTaskId: null,
    startedAt: null,
    workerId: null,
    queueMode: config.enabled ? "redis" : "local",
    queuedTaskIds: []
  };
}

function requireRedisLibrary() {
  try {
    return require("redis");
  } catch (error) {
    throw new Error(
      `Redis queue mode requires the "redis" package. Install dependencies before starting queue mode. (${error.message})`
    );
  }
}

function serializeMessage(message) {
  return JSON.stringify({
    ...message,
    emittedAt: message.emittedAt || new Date().toISOString()
  });
}

function parseMessage(raw) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildTaskClaimKey(config, taskId) {
  return `${config.namespace}:task:${taskId}:queued`;
}

async function createRedisCoordinator(config = resolveQueueConfig(), options = {}) {
  if (!config.enabled) {
    return {
      config,
      enabled: false,
      close: async () => {},
      getRunState: async () => createIdleRunState(config),
      listQueuedJobs: async () => [],
      publishEvent: async () => {},
      requestStop: async () => false
    };
  }

  if (!config.redisUrl) {
    throw new Error("REDIS_URL is required when QUEUE_MODE=redis");
  }

  const { createClient } = requireRedisLibrary();
  const commands = createClient({ url: config.redisUrl });
  const subscriber = options.subscribe ? createClient({ url: config.redisUrl }) : null;
  const blocker = options.blocking ? createClient({ url: config.redisUrl }) : null;

  await commands.connect();

  if (subscriber) {
    await subscriber.connect();
  }

  if (blocker) {
    await blocker.connect();
  }

  const subscriptions = [];

  async function publishEvent(type, payload = {}) {
    await commands.publish(
      config.eventsChannel,
      serializeMessage({
        type,
        payload
      })
    );
  }

  async function publishControl(type, payload = {}) {
    await commands.publish(
      config.controlChannel,
      serializeMessage({
        type,
        payload
      })
    );
  }

  async function subscribeToEvents(handler) {
    if (!subscriber) {
      throw new Error("This Redis coordinator was not created with subscribe support");
    }

    subscriptions.push({ channel: config.eventsChannel, handler });
    await subscriber.subscribe(config.eventsChannel, (rawMessage) => {
      const message = parseMessage(rawMessage);
      if (message) {
        handler(message);
      }
    });
  }

  async function subscribeToControl(handler) {
    if (!subscriber) {
      throw new Error("This Redis coordinator was not created with subscribe support");
    }

    subscriptions.push({ channel: config.controlChannel, handler });
    await subscriber.subscribe(config.controlChannel, (rawMessage) => {
      const message = parseMessage(rawMessage);
      if (message) {
        handler(message);
      }
    });
  }

  async function setRunState(runState) {
    await commands.set(config.runStateKey, JSON.stringify(runState));
    await publishEvent("run-state", {
      runState
    });
  }

  async function clearRunState() {
    await commands.del(config.runStateKey);
    await publishEvent("run-state", {
      runState: createIdleRunState(config)
    });
  }

  async function getRunState() {
    const raw = await commands.get(config.runStateKey);
    return raw ? parseMessage(raw) || createIdleRunState(config) : createIdleRunState(config);
  }

  async function listQueuedJobs() {
    const rawJobs = await commands.lRange(config.queueKey, 0, -1);

    return rawJobs
      .map((entry) => parseMessage(entry))
      .filter(Boolean);
  }

  async function enqueueTask(job) {
    const taskClaimKey = buildTaskClaimKey(config, job.taskId);
    const claimed = await commands.set(taskClaimKey, job.id, {
      NX: true
    });

    if (!claimed) {
      return {
        enqueued: false,
        reason: "duplicate"
      };
    }

    try {
      await commands.rPush(config.queueKey, JSON.stringify(job));
      await publishEvent("task-queued", {
        taskId: job.taskId,
        jobId: job.id,
        requestedAt: job.requestedAt,
        requestedBy: job.requestedBy || null
      });
      return {
        enqueued: true
      };
    } catch (error) {
      await commands.del(taskClaimKey);
      throw error;
    }
  }

  async function dequeueTask(timeoutSeconds = config.blockTimeoutSeconds) {
    if (!blocker) {
      throw new Error("This Redis coordinator was not created with blocking support");
    }

    const popped = await blocker.blPop(config.queueKey, timeoutSeconds);
    if (!popped) {
      return null;
    }

    const rawJob = popped.element || popped[1];
    const job = parseMessage(rawJob);
    if (!job?.taskId) {
      return null;
    }

    await commands.del(buildTaskClaimKey(config, job.taskId));
    await publishEvent("task-dequeued", {
      taskId: job.taskId,
      jobId: job.id || null
    });
    return job;
  }

  async function requestStop(taskId) {
    await publishControl("stop-task", { taskId });
    return true;
  }

  async function close() {
    if (subscriber) {
      for (const subscription of subscriptions.reverse()) {
        try {
          await subscriber.unsubscribe(subscription.channel);
        } catch {
          // Best effort shutdown.
        }
      }
    }

    await Promise.all(
      [blocker, subscriber, commands]
        .filter(Boolean)
        .map((client) =>
          client.quit().catch(async () => {
            try {
              await client.disconnect();
            } catch {
              // Ignore shutdown errors.
            }
          })
        )
    );
  }

  return {
    config,
    enabled: true,
    clearRunState,
    close,
    dequeueTask,
    enqueueTask,
    getRunState,
    listQueuedJobs,
    publishEvent,
    requestStop,
    setRunState,
    subscribeToControl,
    subscribeToEvents
  };
}

module.exports = {
  createIdleRunState,
  createRedisCoordinator,
  resolveQueueConfig
};
