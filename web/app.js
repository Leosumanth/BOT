const state = {
  tasks: [],
  wallets: [],
  rpcNodes: [],
  settings: {},
  chains: [],
  telemetry: null,
  runState: { status: "idle", activeTaskId: null, activeTaskIds: [], activeRuns: [], logs: [], startedAt: null },
  session: { authenticated: false, user: null, authRequired: true },
  currentView: "dashboard",
  walletGroupFilter: "All",
  taskSearch: "",
  taskStatusFilter: "all"
};

const body = document.body;
const authOverlay = document.getElementById("auth-overlay");
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username-input");
const loginPasswordInput = document.getElementById("login-password-input");
const loginStatus = document.getElementById("login-status");
const navButtons = [...document.querySelectorAll(".nav-button")];
const views = [...document.querySelectorAll(".view")];
const dashboardStats = document.getElementById("dashboard-stats");
const dashboardRecentTasks = document.getElementById("dashboard-recent-tasks");
const chainBreakdown = document.getElementById("chain-breakdown");
const walletGroupBreakdown = document.getElementById("wallet-group-breakdown");
const runInsights = document.getElementById("run-insights");
const tasksSubtitle = document.getElementById("tasks-subtitle");
const taskGrid = document.getElementById("task-grid");
const telemetrySummary = document.getElementById("telemetry-summary");
const systemAlerts = document.getElementById("system-alerts");
const priorityQueue = document.getElementById("priority-queue");
const rpcHealthGrid = document.getElementById("rpc-health-grid");
const commandScore = document.getElementById("command-score");
const dashboardHealthPill = document.getElementById("dashboard-health-pill");
const sidebarModeLabel = document.getElementById("sidebar-mode-label");
const sidebarModeDot = document.getElementById("sidebar-mode-dot");
const heroModeCopy = document.getElementById("hero-mode-copy");
const liveClock = document.getElementById("live-clock");
const logOutput = document.getElementById("log-output");
const resultsOutput = document.getElementById("results-output");
const runtimeOutput = document.getElementById("runtime-output");
const refreshButton = document.getElementById("refresh-button");
const dashboardRefreshButton = document.getElementById("dashboard-refresh-button");
const newTaskButton = document.getElementById("new-task-button");
const dashboardOpenTaskButton = document.getElementById("dashboard-open-task-button");
const runPriorityButton = document.getElementById("run-priority-button");
const rpcPulseButton = document.getElementById("rpc-pulse-button");
const snapshotButton = document.getElementById("snapshot-button");
const clearLogsButton = document.getElementById("clear-logs-button");
const taskSearchInput = document.getElementById("task-search-input");
const taskStatusFilter = document.getElementById("task-status-filter");
const walletImportForm = document.getElementById("wallet-import-form");
const walletGroupInput = document.getElementById("wallet-group-input");
const walletKeysInput = document.getElementById("wallet-keys-input");
const walletList = document.getElementById("wallet-list");
const walletCount = document.getElementById("wallet-count");
const rpcForm = document.getElementById("rpc-form");
const rpcNameInput = document.getElementById("rpc-name-input");
const rpcChainInput = document.getElementById("rpc-chain-input");
const rpcUrlInput = document.getElementById("rpc-url-input");
const rpcList = document.getElementById("rpc-list");
const settingsForm = document.getElementById("settings-form");
const profileNameInput = document.getElementById("profile-name-input");
const themeInput = document.getElementById("theme-input");
const resultsPathInput = document.getElementById("results-path-input");
const explorerApiKeyInput = document.getElementById("explorer-api-key-input");
const explorerConfigStatus = document.getElementById("explorer-config-status");
const telegramEnabledInput = document.getElementById("telegram-enabled-input");
const telegramBotTokenInput = document.getElementById("telegram-bot-token-input");
const telegramChatIdInput = document.getElementById("telegram-chat-id-input");
const telegramConfigStatus = document.getElementById("telegram-config-status");
const discordEnabledInput = document.getElementById("discord-enabled-input");
const discordWebhookUrlInput = document.getElementById("discord-webhook-url-input");
const discordConfigStatus = document.getElementById("discord-config-status");
const alertOnStartInput = document.getElementById("alert-on-start-input");
const alertOnSuccessInput = document.getElementById("alert-on-success-input");
const alertOnFailureInput = document.getElementById("alert-on-failure-input");
const alertOnStopInput = document.getElementById("alert-on-stop-input");
const testAlertsButton = document.getElementById("test-alerts-button");
const accountLabel = document.getElementById("account-label");
const accountStatus = document.getElementById("account-status");
const batchToggle = document.getElementById("batch-toggle");
const batchStatus = document.getElementById("batch-status");
const globalStopButton = document.getElementById("global-stop-button");
const logoutButton = document.getElementById("logout-button");
const toastStack = document.getElementById("toast-stack");

const taskModal = document.getElementById("task-modal");
const modalTitle = document.getElementById("modal-title");
const closeModalButton = document.getElementById("close-modal-button");
const cancelTaskButton = document.getElementById("cancel-task-button");
const taskForm = document.getElementById("task-form");
const taskSubmitButton = taskForm.querySelector('button[type="submit"]');
const taskIdInput = document.getElementById("task-id-input");
const taskNameInput = document.getElementById("task-name-input");
const taskPriorityInput = document.getElementById("task-priority-input");
const taskTagsInput = document.getElementById("task-tags-input");
const taskContractInput = document.getElementById("task-contract-input");
const taskChainInput = document.getElementById("task-chain-input");
const taskQuantityInput = document.getElementById("task-quantity-input");
const taskPriceInput = document.getElementById("task-price-input");
const taskAbiFileInput = document.getElementById("task-abi-file-input");
const taskAbiInput = document.getElementById("task-abi-input");
const abiStatus = document.getElementById("abi-status");
const abiDropzone = document.getElementById("abi-dropzone");
const fetchAbiButton = document.getElementById("fetch-abi-button");
const taskPlatformInput = document.getElementById("task-platform-input");
const taskFunctionInput = document.getElementById("task-function-input");
const taskArgsInput = document.getElementById("task-args-input");
const walletGroupTabs = document.getElementById("wallet-group-tabs");
const walletSelector = document.getElementById("wallet-selector");
const selectAllWalletsButton = document.getElementById("select-all-wallets-button");
const walletSelectionCount = document.getElementById("wallet-selection-count");
const rpcSelector = document.getElementById("rpc-selector");
const selectAllRpcButton = document.getElementById("select-all-rpc-button");
const rpcSelectionCount = document.getElementById("rpc-selection-count");
const taskScheduleToggle = document.getElementById("task-schedule-toggle");
const taskStartTimeInput = document.getElementById("task-start-time-input");
const taskWalletModeInput = document.getElementById("task-wallet-mode-input");
const taskGasStrategyInput = document.getElementById("task-gas-strategy-input");
const taskGasLimitInput = document.getElementById("task-gas-limit-input");
const taskPollIntervalInput = document.getElementById("task-poll-interval-input");
const taskTxTimeoutInput = document.getElementById("task-tx-timeout-input");
const taskMaxFeeInput = document.getElementById("task-max-fee-input");
const taskPriorityFeeInput = document.getElementById("task-priority-fee-input");
const taskGasBoostInput = document.getElementById("task-gas-boost-input");
const taskPriorityBoostInput = document.getElementById("task-priority-boost-input");
const taskReplaceBumpInput = document.getElementById("task-replace-bump-input");
const taskReplaceAttemptsInput = document.getElementById("task-replace-attempts-input");
const taskRetriesInput = document.getElementById("task-retries-input");
const taskRetryDelayInput = document.getElementById("task-retry-delay-input");
const taskRetryWindowInput = document.getElementById("task-retry-window-input");
const taskJitterInput = document.getElementById("task-jitter-input");
const taskMinBalanceInput = document.getElementById("task-min-balance-input");
const taskTriggerModeInput = document.getElementById("task-trigger-mode-input");
const taskTriggerContractInput = document.getElementById("task-trigger-contract-input");
const taskTriggerTimeoutInput = document.getElementById("task-trigger-timeout-input");
const taskTriggerEventSignatureInput = document.getElementById("task-trigger-event-signature-input");
const taskTriggerEventConditionInput = document.getElementById("task-trigger-event-condition-input");
const taskTriggerMempoolSignatureInput = document.getElementById("task-trigger-mempool-signature-input");
const taskPrivateRelayUrlInput = document.getElementById("task-private-relay-url-input");
const taskPrivateRelayMethodInput = document.getElementById("task-private-relay-method-input");
const taskPrivateRelayHeadersInput = document.getElementById("task-private-relay-headers-input");
const taskReadyFunctionInput = document.getElementById("task-ready-function-input");
const taskReadyArgsInput = document.getElementById("task-ready-args-input");
const taskReadyModeInput = document.getElementById("task-ready-mode-input");
const taskReadyExpectedInput = document.getElementById("task-ready-expected-input");
const taskReadyIntervalInput = document.getElementById("task-ready-interval-input");
const taskTransferAddressInput = document.getElementById("task-transfer-address-input");
const taskSimulateToggle = document.getElementById("task-simulate-toggle");
const taskDryRunToggle = document.getElementById("task-dry-run-toggle");
const taskWarmupToggle = document.getElementById("task-warmup-toggle");
const taskMultiRpcBroadcastToggle = document.getElementById("task-multi-rpc-broadcast-toggle");
const taskSmartReplaceToggle = document.getElementById("task-smart-replace-toggle");
const taskPrivateRelayToggle = document.getElementById("task-private-relay-toggle");
const taskPrivateRelayOnlyToggle = document.getElementById("task-private-relay-only-toggle");
const taskTransferToggle = document.getElementById("task-transfer-toggle");
const taskNotesInput = document.getElementById("task-notes-input");
let events = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateMiddle(value, start = 8, end = 6) {
  if (!value || value.length <= start + end + 3) {
    return value || "";
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeGasStrategyValue(value) {
  const normalized = String(value || "normal").trim().toLowerCase();

  if (normalized === "provider") {
    return "normal";
  }

  if (normalized === "manual") {
    return "custom";
  }

  return normalized || "normal";
}

function relativeTime(isoString) {
  if (!isoString) {
    return "Never";
  }

  const deltaMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) {
    return "0s";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function priorityRank(priority) {
  return {
    critical: 3,
    high: 2,
    standard: 1
  }[priority] || 0;
}

function humanizePriority(priority) {
  return priority ? `${priority[0].toUpperCase()}${priority.slice(1)}` : "Standard";
}

function setLoginStatus(message) {
  loginStatus.textContent = message;
}

function setAuthState(authenticated, user = null, authRequired = true) {
  state.session = {
    authenticated,
    user,
    authRequired
  };

  body.dataset.authState = authenticated || !authRequired ? "unlocked" : "locked";
  authOverlay.classList.toggle("hidden", authenticated || !authRequired);
  logoutButton.classList.toggle("hidden", !authenticated || !authRequired);

  if (!authenticated && authRequired) {
    accountLabel.textContent = "Secure Operator";
    accountStatus.textContent = "Sign in required";
    globalStopButton.disabled = true;
    loginPasswordInput.value = "";
    window.setTimeout(() => {
      if (!authOverlay.classList.contains("hidden")) {
        loginUsernameInput.focus();
      }
    }, 0);
  }
}

function handleUnauthorized(message = "Session expired. Sign in again.") {
  disconnectEvents();
  setAuthState(false, null, true);
  setLoginStatus(message);
}

function disconnectEvents() {
  if (!events) {
    return;
  }

  events.close();
  events = null;
}

async function loadSession(options = {}) {
  let response;
  try {
    response = await fetch("/api/session", { credentials: "same-origin" });
  } catch (error) {
    if (!options.silent) {
      setLoginStatus(error.message || "Unable to reach the dashboard session endpoint.");
    }
    setAuthState(false, null, true);
    return false;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setAuthState(false, null, payload.authRequired !== false);
    if (!options.silent) {
      setLoginStatus(payload.error || "Sign in to continue.");
    }
    return false;
  }

  setAuthState(true, payload.user || null, payload.authRequired !== false);
  setLoginStatus("Authenticated. Secure state sync is active.");
  return true;
}

async function syncSessionAfterEventError() {
  disconnectEvents();
  const authenticated = await loadSession({ silent: true });
  if (authenticated) {
    connectEvents();
  }
}

function connectEvents() {
  if (events || !state.session.authenticated) {
    return;
  }

  events = new EventSource("/api/events");

  events.addEventListener("state", (event) => {
    const payload = JSON.parse(event.data);
    const currentWalletSelection = selectedWalletIds();
    const currentRpcSelection = selectedRpcIds();
    applyAppState(payload);
    populateChainSelectors();

    if (!taskModal.classList.contains("hidden")) {
      renderWalletSelector(currentWalletSelection);
      renderRpcSelector(currentRpcSelection);
    }
  });

  events.addEventListener("log", (event) => {
    const payload = JSON.parse(event.data);
    state.runState.logs = [...(state.runState.logs || []), payload].slice(-200);
    renderLogs();
  });

  events.addEventListener("error", () => {
    if (state.session.authenticated) {
      window.setTimeout(() => {
        void syncSessionAfterEventError();
      }, 1200);
    }
  });
}

function activeTask() {
  const primaryActiveTaskId = (state.runState.activeTaskIds || [])[0] || state.runState.activeTaskId;
  return state.tasks.find((task) => task.id === primaryActiveTaskId) || null;
}

function activeTaskIds() {
  const taskIds = state.runState.activeTaskIds || [];
  if (taskIds.length > 0) {
    return taskIds;
  }

  return state.runState.activeTaskId ? [state.runState.activeTaskId] : [];
}

function walletGroups() {
  return ["All", ...new Set(state.wallets.map((wallet) => wallet.group || "Imported"))];
}

function chainLabel(chainKey) {
  return state.chains.find((chain) => chain.key === chainKey)?.label || chainKey || "Unknown";
}

function selectedWalletIds() {
  return [...walletSelector.querySelectorAll('input[type="checkbox"]:checked')].map(
    (checkbox) => checkbox.value
  );
}

function selectedRpcIds() {
  return [...rpcSelector.querySelectorAll('input[type="checkbox"]:checked')].map(
    (checkbox) => checkbox.value
  );
}

function setWalletSelectionCount() {
  const count = selectedWalletIds().length;
  walletSelectionCount.textContent = `${pluralize(count, "wallet")} selected`;
}

function setRpcSelectionCount() {
  const count = selectedRpcIds().length;
  rpcSelectionCount.textContent = `${pluralize(count, "RPC node")} selected`;
  rpcSelectionCount.classList.toggle("warning", count === 0);
}

function computeSuccessRateNumeric() {
  const summaries = state.tasks.map((task) => task.summary || {});
  const total = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const success = summaries.reduce((sum, summary) => sum + (summary.success || 0), 0);
  return total ? Math.round((success / total) * 100) : 0;
}

function getEligibleRpcCount(task) {
  const rpcNodeIds = Array.isArray(task.rpcNodeIds) ? task.rpcNodeIds : [];
  return state.rpcNodes.filter(
    (node) =>
      node.enabled &&
      node.chainKey === task.chainKey &&
      (rpcNodeIds.length === 0 || rpcNodeIds.includes(node.id))
  ).length;
}

function taskReadiness(task) {
  const issues = [];
  let score = 0;
  const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];

  if (task.contractAddress) {
    score += 25;
  } else {
    issues.push("Missing contract address");
  }

  if (task.abiJson) {
    score += 25;
  } else {
    issues.push("ABI not loaded");
  }

  if (walletIds.length > 0) {
    score += 25;
  } else {
    issues.push("No wallets selected");
  }

  const rpcCount = getEligibleRpcCount(task);
  if (rpcCount > 0) {
    score += 25;
  } else {
    issues.push("No enabled RPC nodes");
  }

  let health = "blocked";
  if (score >= 100) {
    health = "armed";
  } else if (score >= 50) {
    health = "warming";
  }

  return {
    score,
    health,
    rpcCount,
    issues
  };
}

function filteredTasks() {
  return state.tasks.filter((task) => {
    const search = state.taskSearch.toLowerCase();
    const matchesSearch =
      !search ||
      (task.name || "").toLowerCase().includes(search) ||
      (task.contractAddress || "").toLowerCase().includes(search) ||
      (task.tags || []).some((tag) => tag.toLowerCase().includes(search));

    const matchesStatus =
      state.taskStatusFilter === "all" || task.status === state.taskStatusFilter;

    return matchesSearch && matchesStatus;
  });
}

function setStatusPill(element, tone, label) {
  if (!element) {
    return;
  }

  element.className = `status-pill${tone ? ` ${tone}` : ""}`;
  element.textContent = label;
}

function deriveFallbackTelemetry() {
  const active = activeTask();
  const healthyRpcCount = state.rpcNodes.filter(
    (node) => node.lastHealth?.status === "healthy"
  ).length;
  const unhealthyRpcCount = state.rpcNodes.filter(
    (node) => node.lastHealth?.status === "error"
  ).length;
  const priorityTasks = [...state.tasks]
    .filter((task) => !task.done)
    .sort((left, right) => {
      const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
    })
    .slice(0, 5);

  const priorityQueueItems = priorityTasks.map((task) => {
    const readiness = taskReadiness(task);
    const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];
    return {
      id: task.id,
      name: task.name,
      chainKey: task.chainKey,
      chainLabel: chainLabel(task.chainKey),
      priority: task.priority,
      priorityLabel: humanizePriority(task.priority),
      status: task.status,
      statusLabel: task.status,
      readinessScore: readiness.score,
      health: readiness.health,
      walletCount: walletIds.length,
      rpcCount: readiness.rpcCount,
      issues: readiness.issues,
      updatedAt: task.updatedAt
    };
  });

  const readinessScore = priorityQueueItems.length
    ? Math.round(
        priorityQueueItems.reduce((sum, task) => sum + task.readinessScore, 0) /
          priorityQueueItems.length
      )
    : 0;

  const latestRunTask = [...state.tasks]
    .filter((task) => task.lastRunAt)
    .sort((left, right) => new Date(right.lastRunAt) - new Date(left.lastRunAt))[0];

  const chainLoad = Object.entries(
    state.tasks.reduce((map, task) => {
      map[task.chainKey] = (map[task.chainKey] || 0) + 1;
      return map;
    }, {})
  )
    .map(([chainKey, count]) => ({
      chainKey,
      label: chainLabel(chainKey),
      count,
      share: state.tasks.length ? Math.round((count / state.tasks.length) * 100) : 0
    }))
    .sort((left, right) => right.count - left.count);

  const alerts = [];
  if (state.wallets.length === 0) {
    alerts.push({
      severity: "critical",
      title: "No wallet fleet loaded",
      detail: "Import at least one wallet before attempting a run."
    });
  }
  if (state.rpcNodes.length === 0) {
    alerts.push({
      severity: "critical",
      title: "RPC mesh is empty",
      detail: "Add RPC nodes to arm task execution paths."
    });
  }
  if (unhealthyRpcCount > 0) {
    alerts.push({
      severity: "warning",
      title: "RPC degradation detected",
      detail: `${pluralize(unhealthyRpcCount, "RPC node")} reported an error on the last health check.`
    });
  }
  if (active) {
    alerts.push({
      severity: "info",
      title: "Run in progress",
      detail: `${active.name} is currently executing with ${active.progress?.percent || 0}% completion.`
    });
  }
  if (!alerts.length) {
    alerts.push({
      severity: "info",
      title: "System standing by",
      detail: "No immediate blockers detected in the current local operator stack."
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    readinessScore,
    successRate: computeSuccessRateNumeric(),
    healthyRpcCount,
    unhealthyRpcCount,
    walletGroupCount: walletGroups().filter((group) => group !== "All").length,
    readyTaskCount: priorityQueueItems.filter((task) => task.health === "armed").length,
    liveLogCount: (state.runState.logs || []).length,
    runDurationMs:
      state.runState.startedAt && state.runState.status === "running"
        ? Date.now() - new Date(state.runState.startedAt).getTime()
        : 0,
    activeTaskName: active?.name || null,
    topChainLabel: chainLoad[0]?.label || "No chain load",
    lastRunTaskName: latestRunTask?.name || "No history",
    lastRunAt: latestRunTask?.lastRunAt || null,
    priorityQueue: priorityQueueItems,
    chainLoad,
    alerts,
    rpcMatrix: state.rpcNodes.slice(0, 6).map((node) => ({
      id: node.id,
      name: node.name,
      chainLabel: chainLabel(node.chainKey),
      chainKey: node.chainKey,
      status: node.lastHealth?.status || "unknown",
      latencyMs: node.lastHealth?.latencyMs || null,
      checkedAt: node.lastHealth?.checkedAt || null,
      url: node.url
    }))
  };
}

function telemetryView() {
  return {
    ...deriveFallbackTelemetry(),
    ...(state.telemetry || {})
  };
}

function pushLocalLog(level, message) {
  state.runState.logs = [
    ...(state.runState.logs || []),
    {
      level,
      message,
      timestamp: new Date().toISOString()
    }
  ].slice(-200);
  renderLogs();
}

function showToast(message, tone = "info", title = null) {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `
    <strong>${escapeHtml(title || (tone === "error" ? "Request Error" : tone === "success" ? "Action Complete" : "Heads Up"))}</strong>
    <p>${escapeHtml(message)}</p>
  `;

  toastStack.prepend(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 4200);
}

function animateNumberNodes(root = document) {
  root.querySelectorAll("[data-animate-number]").forEach((node) => {
    const target = Number(node.dataset.animateNumber || 0);
    const precision = Number(node.dataset.precision || 0);
    const prefix = node.dataset.prefix || "";
    const suffix = node.dataset.suffix || "";

    if (!Number.isFinite(target)) {
      return;
    }

    const previous = Number(node.dataset.renderedValue || 0);
    if (previous === target && node.dataset.hasAnimated === "true") {
      node.textContent = `${prefix}${target.toFixed(precision)}${suffix}`;
      return;
    }

    const start = performance.now();
    const duration = 720;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const value = previous + (target - previous) * eased;
      node.textContent = `${prefix}${value.toFixed(precision)}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }

      node.dataset.renderedValue = String(target);
      node.dataset.hasAnimated = "true";
      node.textContent = `${prefix}${target.toFixed(precision)}${suffix}`;
    };

    requestAnimationFrame(tick);
  });
}

function initializeMotionSurfaces(root = document) {
  root.querySelectorAll("[data-tilt]").forEach((element) => {
    element.style.transform = "";
  });
}

function updateClock() {
  liveClock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function walletRowsMarkup(wallets, selectedIds) {
  return wallets
    .map((wallet) => {
      const checked = selectedIds.includes(wallet.id);
      return `
        <label class="wallet-selector-item ${checked ? "selected" : ""}">
          <input type="checkbox" value="${escapeHtml(wallet.id)}" ${checked ? "checked" : ""} />
          <div>
            <strong>${escapeHtml(wallet.label)}</strong>
            <div class="muted-copy">${escapeHtml(wallet.addressShort)} · ${escapeHtml(wallet.group || "Imported")}</div>
          </div>
          <span class="wallet-chip">${escapeHtml(wallet.status || "ready")}</span>
        </label>
      `;
    })
    .join("");
}

function rpcRowsMarkup(rpcNodes, selectedIds) {
  return rpcNodes
    .map((node) => {
      const checked = selectedIds.includes(node.id);
      const healthStatus = node.lastHealth?.status || "unknown";
      const healthText =
        healthStatus === "healthy"
          ? `${node.lastHealth.latencyMs}ms`
          : healthStatus === "error"
            ? "error"
            : "untested";

      return `
        <label class="wallet-selector-item ${checked ? "selected" : ""}">
          <input type="checkbox" value="${escapeHtml(node.id)}" ${checked ? "checked" : ""} />
          <div>
            <strong>${escapeHtml(node.name)}</strong>
            <div class="muted-copy">${escapeHtml(node.url)}</div>
          </div>
          <span class="rpc-chip ${escapeHtml(healthStatus)}">${escapeHtml(healthText)}</span>
        </label>
      `;
    })
    .join("");
}

function bindSelectorCheckboxes(container, afterChange) {
  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      checkbox.closest(".wallet-selector-item").classList.toggle("selected", checkbox.checked);
      afterChange();
    });
  });
}

function renderWalletSelector(selectedIds = []) {
  const groups = walletGroups();
  if (!groups.includes(state.walletGroupFilter)) {
    state.walletGroupFilter = "All";
  }

  walletGroupTabs.innerHTML = groups
    .map(
      (group) => `
        <button class="group-tab ${group === state.walletGroupFilter ? "active" : ""}" data-wallet-group="${escapeHtml(group)}" type="button">
          ${escapeHtml(group)}${group === "All" ? ` (${state.wallets.length})` : ""}
        </button>
      `
    )
    .join("");

  const filteredWallets =
    state.walletGroupFilter === "All"
      ? state.wallets
      : state.wallets.filter((wallet) => (wallet.group || "Imported") === state.walletGroupFilter);

  walletSelector.innerHTML = filteredWallets.length
    ? walletRowsMarkup(filteredWallets, selectedIds)
    : `<div class="empty-state"><h3>No wallets yet</h3><p>Import wallets in the Wallets view first.</p></div>`;

  setWalletSelectionCount();

  walletGroupTabs.querySelectorAll(".group-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.walletGroupFilter = button.dataset.walletGroup;
      renderWalletSelector(selectedWalletIds());
    });
  });

  bindSelectorCheckboxes(walletSelector, setWalletSelectionCount);
}

function renderRpcSelector(selectedIds = []) {
  const activeChain = taskChainInput.value || state.chains[0]?.key || "base_sepolia";
  const rpcNodes = state.rpcNodes.filter((node) => node.chainKey === activeChain && node.enabled);

  rpcSelector.innerHTML = rpcNodes.length
    ? rpcRowsMarkup(rpcNodes, selectedIds)
    : `<div class="empty-state"><h3>No RPC nodes</h3><p>Add enabled nodes for ${escapeHtml(chainLabel(activeChain))} in the RPC view.</p></div>`;

  setRpcSelectionCount();
  bindSelectorCheckboxes(rpcSelector, setRpcSelectionCount);
}

function renderLogs() {
  logOutput.textContent = (state.runState.logs || [])
    .map((entry) => {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "--:--:--";
      return `[${time}] [${entry.level}] ${entry.message}`;
    })
    .join("\n");
  logOutput.scrollTop = logOutput.scrollHeight;
}

function renderTelemetrySummary(telemetry) {
  telemetrySummary.innerHTML = [
    {
      label: "Readiness Score",
      number: telemetry.readinessScore || 0,
      suffix: "%",
      subtext: `${pluralize(telemetry.readyTaskCount || 0, "armed task")}`
    },
    {
      label: "Healthy RPC",
      number: telemetry.healthyRpcCount || 0,
      suffix: "",
      subtext: `${pluralize(telemetry.unhealthyRpcCount || 0, "degraded node")}`
    },
    {
      label: "Wallet Groups",
      number: telemetry.walletGroupCount || 0,
      suffix: "",
      subtext: `${pluralize(state.wallets.length, "wallet")} loaded`
    },
    {
      label: "Live Logs",
      number: telemetry.liveLogCount || 0,
      suffix: "",
      subtext:
        state.runState.status === "running"
          ? `Runtime ${formatDuration(telemetry.runDurationMs || 0)}`
          : "Awaiting next launch window"
    }
  ]
    .map(
      (card) => `
        <article class="telemetry-card" data-tilt>
          <span class="micro-label">${escapeHtml(card.label)}</span>
          <strong data-animate-number="${card.number}" data-suffix="${escapeHtml(card.suffix)}">0</strong>
          <p>${escapeHtml(card.subtext)}</p>
        </article>
      `
    )
    .join("");

  animateNumberNodes(telemetrySummary);
}

function renderSystemAlerts(telemetry) {
  systemAlerts.innerHTML = telemetry.alerts?.length
    ? telemetry.alerts
        .slice(0, 4)
        .map(
          (alert) => `
            <article class="alert-item ${escapeHtml(alert.severity)}">
              <strong>${escapeHtml(alert.title)}</strong>
              <p class="muted-copy">${escapeHtml(alert.detail)}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No alerts</h3><p>Everything is quiet for now.</p></div>`;
}

function renderPriorityQueue(telemetry) {
  const queue = telemetry.priorityQueue || [];

  priorityQueue.innerHTML = queue.length
    ? queue
        .map(
          (task) => `
            <article class="queue-item">
              <div class="queue-head">
                <div>
                  <strong>${escapeHtml(task.name)}</strong>
                  <p class="muted-copy">${escapeHtml(task.chainLabel || chainLabel(task.chainKey))} · ${escapeHtml(task.priorityLabel || humanizePriority(task.priority))}</p>
                </div>
                <span class="queue-chip ${escapeHtml(task.health || "warming")}">${escapeHtml(task.health || "warming")}</span>
              </div>
              <div class="queue-meta">
                <span class="wallet-chip">${pluralize(task.walletCount || 0, "wallet")}</span>
                <span class="rpc-chip ${(task.health || "warming") === "armed" ? "healthy" : ""}">${pluralize(task.rpcCount || 0, "rpc")}</span>
                <span class="wallet-chip">${escapeHtml(task.statusLabel || task.status || "draft")}</span>
                <span class="wallet-chip">${task.readinessScore || 0}% ready</span>
              </div>
              <p class="muted-copy">${escapeHtml(task.issues?.[0] || "Ready for operator action with current configuration.")}</p>
              <div class="queue-actions">
                <button class="mini-button primary fx-button" data-command-action="run" data-task-id="${escapeHtml(task.id)}" ${task.health === "blocked" ? "disabled" : ""}>Run</button>
                <button class="mini-button fx-button" data-command-action="edit" data-task-id="${escapeHtml(task.id)}">Open</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No queued tasks</h3><p>Create or re-enable tasks to populate the command center.</p></div>`;

  priorityQueue.querySelectorAll("[data-command-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.taskId;
      const task = state.tasks.find((entry) => entry.id === taskId);
      if (!task) {
        return;
      }

      if (button.dataset.commandAction === "edit") {
        openTaskModal(task);
        return;
      }

      try {
        await request(`/api/tasks/${taskId}/run`, { method: "POST" });
        showToast(`${task.name} is starting now.`, "success", "Task Launch");
      } catch {}
    });
  });
}

function renderRpcHealthGrid(telemetry) {
  rpcHealthGrid.innerHTML = telemetry.rpcMatrix?.length
    ? telemetry.rpcMatrix
        .map(
          (node) => `
            <div class="mesh-row">
              <div>
                <strong>${escapeHtml(node.name)}</strong>
                <p class="muted-copy">${escapeHtml(node.chainLabel || chainLabel(node.chainKey))} · ${escapeHtml(truncateMiddle(node.url, 16, 12))}</p>
              </div>
              <div class="mesh-meta">
                <span class="rpc-chip ${escapeHtml(node.status)}">${escapeHtml(node.status)}</span>
                <span class="wallet-chip">${node.latencyMs ? `${node.latencyMs}ms` : "untested"}</span>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No mesh data</h3><p>Save or test RPC nodes to see live health signals.</p></div>`;
}

function renderDashboard() {
  const telemetry = telemetryView();
  const active = activeTask();
  const activeTaskCount = activeTaskIds().length;
  const completedTasks = state.tasks.filter((task) => task.status === "completed").length;
  const runningTasks = state.tasks.filter((task) => task.status === "running").length;
  const armedTasks = (telemetry.priorityQueue || []).filter((task) => task.health === "armed").length;

  renderTelemetrySummary(telemetry);
  renderSystemAlerts(telemetry);
  renderPriorityQueue(telemetry);
  renderRpcHealthGrid(telemetry);

  dashboardStats.innerHTML = [
    {
      label: "Task Library",
      number: state.tasks.length,
      subtext: `${pluralize(completedTasks, "completed task")}`
    },
    {
      label: "Hot Runs",
      number: runningTasks,
      subtext:
        activeTaskCount > 1
          ? `${pluralize(activeTaskCount, "task")} active`
          : active
            ? active.name
            : "No active task"
    },
    {
      label: "Armed Queue",
      number: armedTasks,
      subtext: `${pluralize((telemetry.priorityQueue || []).length, "priority task")}`
    },
    {
      label: "Wallet Fleet",
      number: state.wallets.length,
      subtext: `${pluralize(telemetry.walletGroupCount || 0, "group")}`
    }
  ]
    .map(
      (card) => `
        <article class="stat-card" data-tilt>
          <span class="micro-label">${escapeHtml(card.label)}</span>
          <strong data-animate-number="${card.number}">0</strong>
          <p class="muted-copy">${escapeHtml(card.subtext)}</p>
        </article>
      `
    )
    .join("");

  runInsights.innerHTML = [
    {
      label: "Success Rate",
      value: `${telemetry.successRate || 0}%`,
      subtext: `${pluralize(completedTasks, "completed task")}`
    },
    {
      label: "Top Chain",
      value: telemetry.topChainLabel || "No load",
      subtext: runningTasks ? "Live traffic detected" : "Standing by"
    },
    {
      label: "Last Run",
      value: telemetry.lastRunTaskName || "No history",
      subtext: telemetry.lastRunAt ? relativeTime(telemetry.lastRunAt) : "Nothing executed yet"
    }
  ]
    .map(
      (card) => `
        <article class="insight-card" data-tilt>
          <span class="micro-label">${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p class="muted-copy">${escapeHtml(card.subtext)}</p>
        </article>
      `
    )
    .join("");

  animateNumberNodes(dashboardStats);
  commandScore.textContent = `${telemetry.readinessScore || 0}%`;

  if (state.runState.status === "running") {
    setStatusPill(dashboardHealthPill, "running", "Live Run");
  } else if ((state.runState.queuedTaskIds || []).length > 0) {
    setStatusPill(dashboardHealthPill, "queued", "Queue Armed");
  } else if ((telemetry.alerts || []).some((alert) => alert.severity === "critical")) {
    setStatusPill(dashboardHealthPill, "failed", "Action Needed");
  } else if ((telemetry.readyTaskCount || 0) > 0) {
    setStatusPill(dashboardHealthPill, "completed", "Armed");
  } else {
    setStatusPill(dashboardHealthPill, "", "Standby");
  }

  const recentTasks = [...state.tasks]
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, 4);

  dashboardRecentTasks.innerHTML = recentTasks.length
    ? recentTasks
        .map(
          (task) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(task.name)}</strong>
                <p class="muted-copy">${escapeHtml(truncateMiddle(task.contractAddress || "No contract set"))} · ${escapeHtml(humanizePriority(task.priority))}</p>
              </div>
              <span class="status-pill ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No tasks created</h3><p>Create your first task from the Tasks view.</p></div>`;

  chainBreakdown.innerHTML = (telemetry.chainLoad || []).length
    ? telemetry.chainLoad
        .map(
          (entry) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(entry.label)}</strong>
                <p class="muted-copy">${pluralize(entry.count, "task")} · ${entry.share}% share</p>
              </div>
              <span class="wallet-chip">${entry.share}%</span>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No chain data yet</h3><p>Tasks will populate this breakdown.</p></div>`;

  const groupCounts = Object.entries(
    state.wallets.reduce((map, wallet) => {
      const group = wallet.group || "Imported";
      map[group] = (map[group] || 0) + 1;
      return map;
    }, {})
  );

  walletGroupBreakdown.innerHTML = groupCounts.length
    ? groupCounts
        .map(
          ([group, count]) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(group)}</strong>
                <p class="muted-copy">${pluralize(count, "wallet")}</p>
              </div>
              <span class="wallet-chip">${count}</span>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No wallet groups yet</h3><p>Import wallets to see group analytics.</p></div>`;
}

function renderTaskCard(task) {
  const summary = task.summary || {};
  const progress = task.progress || { phase: "Ready", percent: 0 };
  const latestHistory = task.history?.[0];
  const active = activeTaskIds().includes(task.id) && state.runState.status === "running";
  const queued = task.status === "queued";
  const hashCount = summary.hashes?.length || 0;
  const tags = [...(task.tags || [])];

  if (task.multiRpcBroadcast) {
    tags.push("RPC Mesh");
  }

  return `
    <article class="task-card ${escapeHtml(task.status)}" data-task-id="${escapeHtml(task.id)}" data-tilt>
      <div class="task-head">
        <div>
          <p class="eyebrow">${escapeHtml(chainLabel(task.chainKey))}</p>
          <h3>${escapeHtml(task.name)}</h3>
          <p class="muted-copy">${escapeHtml(task.platform)} · ${escapeHtml(humanizePriority(task.priority || "standard"))}</p>
        </div>
        <span class="status-pill ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
      </div>

      <div class="chip-row">
        <span class="tag-chip">${escapeHtml(humanizePriority(task.priority || "standard"))}</span>
        ${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}
      </div>

      <div class="task-meta">
        <div class="meta-item"><label>Contract</label><strong>${escapeHtml(truncateMiddle(task.contractAddress || "Not set"))}</strong></div>
        <div class="meta-item"><label>Chain</label><strong>${escapeHtml(chainLabel(task.chainKey))}</strong></div>
        <div class="meta-item"><label>Wallets</label><strong>${task.walletCount}</strong></div>
        <div class="meta-item"><label>RPC</label><strong>${task.rpcCount}</strong></div>
        <div class="meta-item"><label>Qty</label><strong>${task.quantityPerWallet}</strong></div>
        <div class="meta-item"><label>Price</label><strong>${escapeHtml(task.priceEth)} ETH</strong></div>
      </div>

      <div class="task-stats">
        <div class="stat-box"><label>Total</label><strong>${summary.total ?? task.walletCount}</strong></div>
        <div class="stat-box success"><label>Success</label><strong>${summary.success ?? 0}</strong></div>
        <div class="stat-box failed"><label>Failed</label><strong>${summary.failed ?? 0}</strong></div>
        <div class="stat-box"><label>Hashes</label><strong>${hashCount}</strong></div>
      </div>

      <div class="task-progress-row">
        <span class="muted-copy">${escapeHtml(progress.phase)} · ${progress.percent ?? 0}%</span>
        <span class="wallet-chip">${active ? "Live task" : relativeTime(task.updatedAt)}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width:${Number(progress.percent || 0)}%"></div></div>

      ${task.notes ? `<p class="muted-copy">${escapeHtml(task.notes)}</p>` : ""}

      <div class="task-actions">
        <button class="mini-button fx-button" data-task-action="done">${task.done ? "Undone" : "Done"}</button>
        <button class="mini-button ${active ? "" : queued ? "" : "primary"} fx-button" data-task-action="${active ? "stop" : "run"}" ${queued ? "disabled" : ""}>${active ? "Stop" : queued ? "Queued" : "Run"}</button>
        <button class="mini-button fx-button" data-task-action="edit">Edit</button>
        <button class="mini-button fx-button" data-task-action="duplicate">Duplicate</button>
        <button class="mini-button danger fx-button" data-task-action="delete">Delete</button>
      </div>

      <div class="history-block">
        <div class="muted-copy">History (${task.history?.length || 0})</div>
        ${
          latestHistory
            ? `
              <div class="history-item">
                <strong>Last run: ${new Date(latestHistory.ranAt).toLocaleString()}</strong>
                <p class="muted-copy">${latestHistory.summary.success} success · ${latestHistory.summary.failed} failed · ${latestHistory.summary.hashes.length} hashes</p>
              </div>
            `
            : `<p class="muted-copy">No history recorded yet.</p>`
        }
      </div>
    </article>
  `;
}

function renderTasks() {
  const tasks = filteredTasks();
  tasksSubtitle.textContent = `${pluralize(tasks.length, "task")} shown`;

  taskGrid.innerHTML = tasks.length
    ? tasks.map(renderTaskCard).join("")
    : `<div class="empty-state"><h3>No matching tasks</h3><p>Adjust the search or status filter, or create a new task.</p></div>`;

  taskGrid.querySelectorAll("[data-task-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-task-id]");
      const taskId = card.dataset.taskId;
      const action = button.dataset.taskAction;
      const task = state.tasks.find((entry) => entry.id === taskId);

      try {
        if (action === "edit") {
          openTaskModal(task);
          return;
        }

        if (action === "delete") {
          await request(`/api/tasks/${taskId}`, { method: "DELETE" });
          showToast(`${task?.name || "Task"} deleted.`, "success", "Task Removed");
          return;
        }

        if (action === "done") {
          await request(`/api/tasks/${taskId}/done`, { method: "POST" });
          showToast(`${task?.name || "Task"} status toggled.`, "success", "Task Updated");
          return;
        }

        if (action === "duplicate") {
          await request(`/api/tasks/${taskId}/duplicate`, { method: "POST" });
          showToast(`${task?.name || "Task"} duplicated.`, "success", "Task Duplicated");
          return;
        }

        if (action === "run") {
          await request(`/api/tasks/${taskId}/run`, { method: "POST" });
          showToast(`${task?.name || "Task"} launch requested.`, "success", "Task Launch");
          return;
        }

        if (action === "stop") {
          await request(`/api/tasks/${taskId}/stop`, { method: "POST" });
          showToast(`${task?.name || "Task"} stop requested.`, "info", "Run Control");
        }
      } catch {}
    });
  });
}

function renderWallets() {
  walletCount.textContent = pluralize(state.wallets.length, "wallet");
  walletList.innerHTML = state.wallets.length
    ? state.wallets
        .map(
          (wallet) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(wallet.label)}</strong>
                <p class="muted-copy">${escapeHtml(wallet.addressShort)} | ${escapeHtml(wallet.group || "Imported")} | ${escapeHtml(wallet.source || "stored")}</p>
              </div>
              <div class="task-actions">
                <span class="wallet-chip">${escapeHtml(wallet.status)}</span>
                ${
                  wallet.source === "env"
                    ? '<span class="rpc-chip">env-managed</span>'
                    : `<button class="mini-button danger fx-button" data-wallet-delete="${escapeHtml(wallet.id)}">Delete</button>`
                }
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No wallets imported</h3><p>Add wallets to start building task groups.</p></div>`;

  walletList.querySelectorAll("[data-wallet-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/wallets/${button.dataset.walletDelete}`, { method: "DELETE" });
        showToast("Wallet removed from local storage.", "success", "Wallet Deleted");
      } catch {}
    });
  });
}

function rpcHealthMarkup(node) {
  if (!node.lastHealth) {
    return '<span class="rpc-chip">untested</span>';
  }

  if (node.lastHealth.status === "healthy") {
    return `<span class="rpc-chip healthy">${node.lastHealth.latencyMs}ms</span>`;
  }

  return '<span class="rpc-chip error">error</span>';
}

function renderRpcNodes() {
  rpcList.innerHTML = state.rpcNodes.length
    ? state.rpcNodes
        .map(
          (node) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(node.name)}</strong>
                <p class="muted-copy">${escapeHtml(chainLabel(node.chainKey))} | ${escapeHtml(node.url)} | ${escapeHtml(node.source || "stored")}</p>
              </div>
              <div class="task-actions">
                ${rpcHealthMarkup(node)}
                <button class="mini-button fx-button" data-rpc-test="${escapeHtml(node.id)}">Test</button>
                ${
                  node.source === "env"
                    ? '<span class="rpc-chip">env-managed</span>'
                    : `<button class="mini-button danger fx-button" data-rpc-delete="${escapeHtml(node.id)}">Delete</button>`
                }
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No RPC nodes saved</h3><p>Add chain endpoints to build a failover mesh.</p></div>`;

  rpcList.querySelectorAll("[data-rpc-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/rpc-nodes/${button.dataset.rpcDelete}`, { method: "DELETE" });
        showToast("RPC node removed from the mesh.", "success", "RPC Deleted");
      } catch {}
    });
  });

  rpcList.querySelectorAll("[data-rpc-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/rpc-nodes/${button.dataset.rpcTest}/test`, { method: "POST" });
        showToast("RPC health test completed.", "success", "RPC Pulse");
      } catch {}
    });
  });
}

function renderSettings() {
  profileNameInput.value = state.settings.profileName || "local";
  themeInput.value = state.settings.theme || "quantum-operator";
  resultsPathInput.value = state.settings.resultsPath || "./dist/mint-results.json";
  explorerApiKeyInput.value = "";
  telegramBotTokenInput.value = "";
  telegramChatIdInput.value = "";
  discordWebhookUrlInput.value = "";
  telegramEnabledInput.checked = Boolean(state.settings.telegramEnabled);
  discordEnabledInput.checked = Boolean(state.settings.discordEnabled);
  alertOnStartInput.checked = state.settings.alertOnRunStart !== false;
  alertOnSuccessInput.checked = state.settings.alertOnRunSuccess !== false;
  alertOnFailureInput.checked = state.settings.alertOnRunFailure !== false;
  alertOnStopInput.checked = state.settings.alertOnRunStop !== false;

  explorerApiKeyInput.placeholder = state.settings.explorerApiKeyConfigured
    ? "Saved on server. Leave blank to keep it."
    : "Etherscan V2 API key";
  telegramBotTokenInput.placeholder = state.settings.telegramBotTokenConfigured
    ? "Saved on server. Leave blank to keep it."
    : "123456:ABC...";
  telegramChatIdInput.placeholder = state.settings.telegramChatIdConfigured
    ? "Saved on server. Leave blank to keep it."
    : "-1001234567890";
  discordWebhookUrlInput.placeholder = state.settings.discordWebhookUrlConfigured
    ? "Saved on server. Leave blank to keep it."
    : "https://discord.com/api/webhooks/...";

  explorerConfigStatus.textContent = state.settings.explorerApiKeyConfigured
    ? "Key available"
    : "Not configured";
  telegramConfigStatus.textContent = state.settings.telegramConfigured
    ? `Telegram ready${state.settings.telegramEnabled ? "" : " (disabled)"}`
    : state.settings.telegramEnabled
      ? "Telegram is enabled but still missing a token or chat ID."
      : "Telegram is disabled.";
  discordConfigStatus.textContent = state.settings.discordConfigured
    ? `Discord ready${state.settings.discordEnabled ? "" : " (disabled)"}`
    : state.settings.discordEnabled
      ? "Discord is enabled but still missing a webhook URL."
      : "Discord is disabled.";
}

function renderRuntime() {
  runtimeOutput.textContent = JSON.stringify(
    {
      view: state.currentView,
      runState: state.runState,
      telemetry: telemetryView(),
      taskCount: state.tasks.length,
      walletCount: state.wallets.length,
      rpcNodeCount: state.rpcNodes.length
    },
    null,
    2
  );
}

function renderResultsIfAvailable() {
  const latestCompletedTask = [...state.tasks]
    .filter((task) => task.history?.length)
    .sort((left, right) => new Date(right.lastRunAt || 0) - new Date(left.lastRunAt || 0))[0];

  if (!latestCompletedTask) {
    resultsOutput.textContent = "No results yet.";
    return;
  }

  resultsOutput.textContent = JSON.stringify(latestCompletedTask.history[0], null, 2);
}

function renderShellTelemetry() {
  const telemetry = telemetryView();
  const active = activeTask();
  const activeTaskCount = activeTaskIds().length;
  const hasCriticalAlert = (telemetry.alerts || []).some((alert) => alert.severity === "critical");

  body.dataset.runState = state.runState.status;
  accountLabel.textContent =
    state.session.user?.username || state.settings.profileName || "Local Operator";
  accountStatus.textContent =
    state.runState.status === "running"
      ? activeTaskCount > 1
        ? `${activeTaskCount} tasks running`
        : "Task running"
      : (state.runState.queuedTaskIds || []).length > 0
        ? "Queue armed"
        : "Authenticated";
  heroModeCopy.textContent = active
    ? activeTaskCount > 1
      ? `${pluralize(activeTaskCount, "task")} are executing concurrently. Primary run: ${active.name} on ${chainLabel(active.chainKey)} at ${active.progress?.percent || 0}% completion.`
      : `${active.name} is active on ${chainLabel(active.chainKey)} with ${active.progress?.percent || 0}% completion.`
    : (state.runState.queuedTaskIds || []).length > 0
      ? `${pluralize((state.runState.queuedTaskIds || []).length, "task")} queued for worker execution across the Redis lane.`
      : `Monitoring ${pluralize(state.tasks.length, "task")}, ${pluralize(state.wallets.length, "wallet")}, and ${pluralize(state.rpcNodes.length, "RPC node")} from one control surface.`;

  if (state.runState.status === "running") {
    sidebarModeLabel.textContent = activeTaskCount > 1 ? "Live Runs" : "Live Run";
    sidebarModeDot.className = "signal-dot hot";
  } else if ((state.runState.queuedTaskIds || []).length > 0) {
    sidebarModeLabel.textContent = "Queued";
    sidebarModeDot.className = "signal-dot alert";
  } else if (hasCriticalAlert) {
    sidebarModeLabel.textContent = "Alert";
    sidebarModeDot.className = "signal-dot alert";
  } else {
    sidebarModeLabel.textContent = (telemetry.readyTaskCount || 0) > 0 ? "Armed" : "Standby";
    sidebarModeDot.className = "signal-dot";
  }

  globalStopButton.disabled = activeTaskCount === 0;
}

function renderAll() {
  renderShellTelemetry();
  renderLogs();
  renderDashboard();
  renderTasks();
  renderWallets();
  renderRpcNodes();
  renderSettings();
  renderRuntime();
  renderResultsIfAvailable();
  initializeMotionSurfaces(document);
}

function applyAppState(payload) {
  state.tasks = payload.tasks || [];
  state.wallets = payload.wallets || [];
  state.rpcNodes = payload.rpcNodes || [];
  state.settings = payload.settings || {};
  state.chains = payload.chains || [];
  state.telemetry = payload.telemetry || null;
  state.runState = payload.runState || state.runState;
  state.session.authRequired = payload.authRequired !== false;

  batchStatus.textContent = batchToggle.checked
    ? "Batch mode is enabled for selection planning."
    : "Batch tools are available for visual planning.";

  renderAll();
}

function setView(viewName) {
  state.currentView = viewName;
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  views.forEach((view) => {
    view.classList.toggle("active", view.dataset.viewPanel === viewName);
  });
  renderRuntime();
}

function populateChainSelectors() {
  const options = state.chains
    .map((chain) => `<option value="${escapeHtml(chain.key)}">${escapeHtml(chain.label)}</option>`)
    .join("");

  taskChainInput.innerHTML = options;
  rpcChainInput.innerHTML = options;

  if (!state.chains.find((chain) => chain.key === taskChainInput.value)) {
    taskChainInput.value = state.chains[0]?.key || "";
  }

  if (!state.chains.find((chain) => chain.key === rpcChainInput.value)) {
    rpcChainInput.value = state.chains[0]?.key || "";
  }
}

function parseAbiEntries(value) {
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : parsed.abi || [];
}

function suggestFunctionFromAbi(abiEntries) {
  const functions = abiEntries.filter((item) => item?.type === "function" && item.name);
  const currentFunction = taskFunctionInput.value.trim();

  if (currentFunction && functions.some((item) => item.name === currentFunction)) {
    return "";
  }

  return (
    functions.find((item) => item.name === "mint")?.name ||
    functions.find((item) => /mint/i.test(item.name))?.name ||
    functions[0]?.name ||
    ""
  );
}

function updateAbiStatus(sourceLabel = "") {
  if (!taskAbiInput.value.trim()) {
    abiStatus.textContent = "Paste JSON or load a file.";
    return;
  }

  try {
    const abi = parseAbiEntries(taskAbiInput.value);
    const functionCount = abi.filter((item) => item.type === "function").length;
    abiStatus.textContent = `ABI loaded - ${pluralize(functionCount, "function")}${
      sourceLabel ? ` - ${sourceLabel}` : ""
    }`;
  } catch {
    abiStatus.textContent = "ABI JSON is not valid yet.";
  }
}

async function fetchAbiForCurrentTask() {
  const chainKey = taskChainInput.value;
  const address = taskContractInput.value.trim();

  if (!chainKey) {
    showToast("Choose a chain before fetching ABI data.", "error", "Explorer ABI");
    return;
  }

  if (!address) {
    showToast("Enter a contract address before fetching ABI data.", "error", "Explorer ABI");
    return;
  }

  const idleLabel = fetchAbiButton.textContent;
  fetchAbiButton.disabled = true;
  fetchAbiButton.textContent = "Fetching...";
  abiStatus.textContent = "Fetching ABI from explorer...";

  try {
    const payload = await request(
      `/api/explorer/abi?chainKey=${encodeURIComponent(chainKey)}&address=${encodeURIComponent(address)}`
    );
    taskAbiInput.value = JSON.stringify(payload.abi, null, 2);
    const suggestedFunction = suggestFunctionFromAbi(payload.abi || []);
    if (suggestedFunction) {
      taskFunctionInput.value = suggestedFunction;
    }

    updateAbiStatus(payload.provider || "Explorer");
    showToast(`ABI loaded from ${payload.provider || "the explorer"}.`, "success", "ABI Loaded");
  } catch {
    updateAbiStatus();
  } finally {
    fetchAbiButton.disabled = false;
    fetchAbiButton.textContent = idleLabel;
  }
}

function openTaskModal(task = null) {
  modalTitle.textContent = task ? "Edit Task" : "New Task";
  taskSubmitButton.textContent = task ? "Save Task" : "Create Task";

  taskIdInput.value = task?.id || "";
  taskNameInput.value = task?.name || "";
  taskPriorityInput.value = task?.priority || "standard";
  taskTagsInput.value = (task?.tags || []).join(", ");
  taskContractInput.value = task?.contractAddress || "";
  taskChainInput.value = task?.chainKey || state.chains[0]?.key || "base_sepolia";
  taskQuantityInput.value = task?.quantityPerWallet || 1;
  taskPriceInput.value = task?.priceEth || "0";
  taskAbiInput.value = task?.abiJson || "";
  taskPlatformInput.value = task?.platform || "Generic EVM (auto-detect)";
  taskFunctionInput.value = task?.mintFunction || "mint";
  taskArgsInput.value = task?.mintArgs || "[1]";
  taskScheduleToggle.checked = Boolean(task?.useSchedule);
  taskStartTimeInput.value = task?.waitUntilIso ? task.waitUntilIso.slice(0, 16) : "";
  taskWalletModeInput.value = task?.walletMode || "parallel";
  taskGasStrategyInput.value = normalizeGasStrategyValue(task?.gasStrategy || "normal");
  taskGasLimitInput.value = task?.gasLimit || "";
  taskPollIntervalInput.value = task?.pollIntervalMs || "1000";
  taskTxTimeoutInput.value = task?.txTimeoutMs || "";
  taskMaxFeeInput.value = task?.maxFeeGwei || "";
  taskPriorityFeeInput.value = task?.maxPriorityFeeGwei || "";
  taskGasBoostInput.value = task?.gasBoostPercent || "0";
  taskPriorityBoostInput.value = task?.priorityBoostPercent || "0";
  taskReplaceBumpInput.value = task?.replacementBumpPercent || "12";
  taskReplaceAttemptsInput.value = task?.replacementMaxAttempts || "2";
  taskRetriesInput.value = task?.maxRetries || "1";
  taskRetryDelayInput.value = task?.retryDelayMs || "1000";
  taskRetryWindowInput.value = String(
    Math.max(0, Math.round(Number(task?.retryWindowMs || 1800000) / 60000))
  );
  taskJitterInput.value = task?.startJitterMs || "0";
  taskMinBalanceInput.value = task?.minBalanceEth || "";
  taskTriggerModeInput.value = task?.executionTriggerMode || "standard";
  taskTriggerContractInput.value = task?.triggerContractAddress || "";
  taskTriggerTimeoutInput.value = task?.triggerTimeoutMs || "";
  taskTriggerEventSignatureInput.value = task?.triggerEventSignature || "";
  taskTriggerEventConditionInput.value = task?.triggerEventCondition || "";
  taskTriggerMempoolSignatureInput.value = task?.triggerMempoolSignature || "";
  taskPrivateRelayUrlInput.value = task?.privateRelayUrl || "";
  taskPrivateRelayMethodInput.value = task?.privateRelayMethod || "eth_sendRawTransaction";
  taskPrivateRelayHeadersInput.value = task?.privateRelayHeadersJson || "";
  taskReadyFunctionInput.value = task?.readyCheckFunction || "";
  taskReadyArgsInput.value = task?.readyCheckArgs || "[]";
  taskReadyModeInput.value = task?.readyCheckMode || "truthy";
  taskReadyExpectedInput.value = task?.readyCheckExpected || "";
  taskReadyIntervalInput.value = task?.readyCheckIntervalMs || "1000";
  taskTransferAddressInput.value = task?.transferAddress || "";
  taskSimulateToggle.checked = task?.simulateTransaction ?? true;
  taskDryRunToggle.checked = Boolean(task?.dryRun);
  taskWarmupToggle.checked = task?.warmupRpc ?? true;
  taskMultiRpcBroadcastToggle.checked = Boolean(task?.multiRpcBroadcast);
  taskSmartReplaceToggle.checked = Boolean(task?.smartGasReplacement);
  taskPrivateRelayToggle.checked = Boolean(task?.privateRelayEnabled);
  taskPrivateRelayOnlyToggle.checked = Boolean(task?.privateRelayOnly);
  taskTransferToggle.checked = Boolean(task?.transferAfterMinted);
  taskNotesInput.value = task?.notes || "";
  taskAbiFileInput.value = "";
  fetchAbiButton.disabled = false;
  fetchAbiButton.textContent = "Fetch from Explorer";

  updateAbiStatus();
  renderWalletSelector(task?.walletIds || []);
  renderRpcSelector(task?.rpcNodeIds || []);
  taskModal.classList.remove("hidden");
  initializeMotionSurfaces(taskModal);
}

function closeTaskModal() {
  taskModal.classList.add("hidden");
}

function buildTaskPayload() {
  return {
    id: taskIdInput.value || undefined,
    name: taskNameInput.value,
    priority: taskPriorityInput.value,
    tags: taskTagsInput.value,
    notes: taskNotesInput.value,
    contractAddress: taskContractInput.value,
    chainKey: taskChainInput.value,
    quantityPerWallet: taskQuantityInput.value,
    priceEth: taskPriceInput.value,
    abiJson: taskAbiInput.value,
    platform: taskPlatformInput.value,
    walletIds: selectedWalletIds(),
    rpcNodeIds: selectedRpcIds(),
    mintFunction: taskFunctionInput.value,
    mintArgs: taskArgsInput.value,
    gasStrategy: taskGasStrategyInput.value,
    gasLimit: taskGasLimitInput.value,
    maxFeeGwei: taskMaxFeeInput.value,
    maxPriorityFeeGwei: taskPriorityFeeInput.value,
    gasBoostPercent: taskGasBoostInput.value,
    priorityBoostPercent: taskPriorityBoostInput.value,
    txTimeoutMs: taskTxTimeoutInput.value,
    smartGasReplacement: taskSmartReplaceToggle.checked,
    replacementBumpPercent: taskReplaceBumpInput.value,
    replacementMaxAttempts: taskReplaceAttemptsInput.value,
    simulateTransaction: taskSimulateToggle.checked,
    dryRun: taskDryRunToggle.checked,
    waitForReceipt: true,
    warmupRpc: taskWarmupToggle.checked,
    preSignTransactions: true,
    multiRpcBroadcast: taskMultiRpcBroadcastToggle.checked,
    continueOnError: false,
    walletMode: taskWalletModeInput.value,
    useSchedule: taskScheduleToggle.checked,
    waitUntilIso:
      taskScheduleToggle.checked && taskStartTimeInput.value
        ? new Date(taskStartTimeInput.value).toISOString()
        : "",
    readyCheckFunction: taskReadyFunctionInput.value,
    readyCheckArgs: taskReadyArgsInput.value,
    readyCheckMode: taskReadyModeInput.value,
    readyCheckExpected: taskReadyExpectedInput.value,
    readyCheckIntervalMs: taskReadyIntervalInput.value,
    pollIntervalMs: taskPollIntervalInput.value,
    maxRetries: taskRetriesInput.value,
    retryDelayMs: taskRetryDelayInput.value,
    retryWindowMs: String(Math.max(0, Math.round(Number(taskRetryWindowInput.value || 0) * 60000))),
    startJitterMs: taskJitterInput.value,
    minBalanceEth: taskMinBalanceInput.value,
    nonceOffset: "0",
    privateRelayEnabled: taskPrivateRelayToggle.checked,
    privateRelayUrl: taskPrivateRelayUrlInput.value,
    privateRelayMethod: taskPrivateRelayMethodInput.value,
    privateRelayHeadersJson: taskPrivateRelayHeadersInput.value,
    privateRelayOnly: taskPrivateRelayOnlyToggle.checked,
    executionTriggerMode: taskTriggerModeInput.value,
    triggerContractAddress: taskTriggerContractInput.value,
    triggerEventSignature: taskTriggerEventSignatureInput.value,
    triggerEventCondition: taskTriggerEventConditionInput.value,
    triggerMempoolSignature: taskTriggerMempoolSignatureInput.value,
    triggerTimeoutMs: taskTriggerTimeoutInput.value,
    transferAfterMinted: taskTransferToggle.checked,
    transferAddress: taskTransferAddressInput.value
  };
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options
    });
  } catch (error) {
    pushLocalLog("error", error.message || "Network request failed");
    showToast(error.message || "Network request failed", "error");
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const message = payload.error || "Session expired. Sign in again.";
    handleUnauthorized(message);
    pushLocalLog("error", message);
    showToast(message, "error");
    throw new Error(message);
  }

  if (!response.ok) {
    const message = payload.error || "Request failed";
    pushLocalLog("error", message);
    showToast(message, "error");
    throw new Error(message);
  }

  return payload;
}

async function loadState() {
  const payload = await request("/api/app-state");
  applyAppState(payload);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsernameInput.value,
        password: loginPasswordInput.value
      })
    });

    setAuthState(true, payload.user || null, true);
    setLoginStatus("Authenticated. Secure state sync is active.");
    initializeMotionSurfaces(document);
    await loadState();
    connectEvents();
    showToast("Authenticated successfully.", "success", "Access Granted");
  } catch {}
});

taskSearchInput.addEventListener("input", () => {
  state.taskSearch = taskSearchInput.value.trim();
  renderTasks();
});

taskStatusFilter.addEventListener("change", () => {
  state.taskStatusFilter = taskStatusFilter.value;
  renderTasks();
});

refreshButton.addEventListener("click", () => {
  loadState()
    .then(() => showToast("Application state refreshed.", "success", "Telemetry Synced"))
    .catch(() => {});
});

dashboardRefreshButton.addEventListener("click", () => {
  loadState()
    .then(() => showToast("Advanced telemetry refreshed.", "success", "Dashboard Updated"))
    .catch(() => {});
});

newTaskButton.addEventListener("click", () => openTaskModal());
dashboardOpenTaskButton.addEventListener("click", () => openTaskModal());

runPriorityButton.addEventListener("click", async () => {
  try {
    const payload = await request("/api/control/run-priority", { method: "POST" });
    showToast(`${payload.task?.name || "Priority task"} launch requested.`, "success", "Priority Launch");
  } catch {}
});

rpcPulseButton.addEventListener("click", async () => {
  try {
    const payload = await request("/api/control/test-rpc-pool", { method: "POST" });
    const summary = payload.summary || {};
    showToast(
      `${summary.healthy || 0} healthy · ${summary.error || 0} error · ${summary.total || 0} total`,
      "success",
      "RPC Mesh Pulse"
    );
  } catch {}
});

snapshotButton.addEventListener("click", async () => {
  try {
    const payload = await request("/api/control/snapshot", { method: "POST" });
    runtimeOutput.textContent = JSON.stringify(payload.snapshot, null, 2);
    setView("admin");
    showToast("Runtime snapshot captured.", "success", "Snapshot Ready");
  } catch {}
});

closeModalButton.addEventListener("click", closeTaskModal);
cancelTaskButton.addEventListener("click", closeTaskModal);

taskModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeModal === "true") {
    closeTaskModal();
  }
});

clearLogsButton.addEventListener("click", () => {
  state.runState.logs = [];
  renderLogs();
});

batchToggle.addEventListener("change", () => {
  batchStatus.textContent = batchToggle.checked
    ? "Batch mode is enabled for selection planning."
    : "Batch tools are available for visual planning.";
});

globalStopButton.addEventListener("click", async () => {
  try {
    await request("/api/run/stop", { method: "POST" });
    showToast("Stop signal sent to all active runs.", "info", "Run Control");
  } catch {}
});

logoutButton.addEventListener("click", async () => {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {}

  disconnectEvents();
  setAuthState(false, null, true);
  setLoginStatus("Signed out. Sign in again to resume secure state access.");
  showToast("Session closed.", "info", "Signed Out");
});

walletImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await request("/api/wallets/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: walletGroupInput.value || "Imported",
        privateKeys: walletKeysInput.value
      })
    });
    walletKeysInput.value = "";
    showToast(
      `${payload.imported} imported · ${payload.skipped} skipped`,
      "success",
      "Wallet Import Complete"
    );
  } catch {}
});

rpcForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/rpc-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: rpcNameInput.value,
        chainKey: rpcChainInput.value,
        url: rpcUrlInput.value
      })
    });
    rpcNameInput.value = "";
    rpcUrlInput.value = "";
    showToast("RPC node saved to the mesh.", "success", "RPC Added");
  } catch {}
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileName: profileNameInput.value,
        theme: themeInput.value,
        resultsPath: resultsPathInput.value,
        explorerApiKey: explorerApiKeyInput.value,
        telegramEnabled: telegramEnabledInput.checked,
        telegramBotToken: telegramBotTokenInput.value,
        telegramChatId: telegramChatIdInput.value,
        discordEnabled: discordEnabledInput.checked,
        discordWebhookUrl: discordWebhookUrlInput.value,
        alertOnRunStart: alertOnStartInput.checked,
        alertOnRunSuccess: alertOnSuccessInput.checked,
        alertOnRunFailure: alertOnFailureInput.checked,
        alertOnRunStop: alertOnStopInput.checked
      })
    });
    explorerApiKeyInput.value = "";
    telegramBotTokenInput.value = "";
    telegramChatIdInput.value = "";
    discordWebhookUrlInput.value = "";
    showToast("Local operator settings and integrations saved.", "success", "Settings Updated");
  } catch {}
});

testAlertsButton.addEventListener("click", async () => {
  try {
    const payload = await request("/api/control/test-alerts", { method: "POST" });
    showToast(
      `Delivered via ${(payload.result?.channels || []).join(", ") || "configured channels"}.`,
      "success",
      "Test Alert Sent"
    );
  } catch {}
});

selectAllWalletsButton.addEventListener("click", () => {
  walletSelector.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = true;
    checkbox.closest(".wallet-selector-item").classList.add("selected");
  });
  setWalletSelectionCount();
});

selectAllRpcButton.addEventListener("click", () => {
  rpcSelector.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = true;
    checkbox.closest(".wallet-selector-item").classList.add("selected");
  });
  setRpcSelectionCount();
});

taskChainInput.addEventListener("change", () => {
  renderRpcSelector(
    selectedRpcIds().filter((rpcId) => {
      const node = state.rpcNodes.find((rpcNode) => rpcNode.id === rpcId);
      return node?.chainKey === taskChainInput.value;
    })
  );
});

taskAbiInput.addEventListener("input", updateAbiStatus);

fetchAbiButton.addEventListener("click", () => {
  fetchAbiForCurrentTask().catch(() => {});
});

taskAbiFileInput.addEventListener("change", async () => {
  const file = taskAbiFileInput.files?.[0];
  if (!file) {
    return;
  }

  taskAbiInput.value = await file.text();
  updateAbiStatus();
});

["dragenter", "dragover"].forEach((eventName) => {
  abiDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    abiDropzone.classList.add("active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  abiDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    abiDropzone.classList.remove("active");
  });
});

abiDropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  taskAbiInput.value = await file.text();
  updateAbiStatus();
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTaskPayload())
    });
    closeTaskModal();
    showToast("Task preset saved locally.", "success", "Task Saved");
  } catch {}
});

updateClock();
window.setInterval(updateClock, 1000);

setAuthState(false, null, true);

loadSession()
  .then(async (authenticated) => {
    if (!authenticated) {
      return;
    }

    initializeMotionSurfaces(document);
    await loadState();
    populateChainSelectors();
    renderWalletSelector([]);
    renderRpcSelector([]);
    connectEvents();
    setView("dashboard");
    showToast("Advanced command surface online.", "success", "System Ready");
  })
  .catch(() => {});
