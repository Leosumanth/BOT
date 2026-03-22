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
const rpcFormTitle = document.getElementById("rpc-form-title");
const rpcFormSubtitle = document.getElementById("rpc-form-subtitle");
const rpcFormBadge = document.getElementById("rpc-form-badge");
const rpcCancelButton = document.getElementById("rpc-cancel-button");
const rpcSubmitButton = document.getElementById("rpc-submit-button");
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
const deleteExplorerKeyButton = document.getElementById("delete-explorer-key-button");
const testExplorerKeyButton = document.getElementById("test-explorer-key-button");
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
const taskAutoPhaseToggle = document.getElementById("task-auto-phase-toggle");
const taskPhasePreview = document.getElementById("task-phase-preview");
const walletGroupTabs = document.getElementById("wallet-group-tabs");
const walletSelector = document.getElementById("wallet-selector");
const selectAllWalletsButton = document.getElementById("select-all-wallets-button");
const walletSelectionCount = document.getElementById("wallet-selection-count");
const rpcSelector = document.getElementById("rpc-selector");
const selectAllRpcButton = document.getElementById("select-all-rpc-button");
const rpcSelectionCount = document.getElementById("rpc-selection-count");
const taskLatencyProfileInput = document.getElementById("task-latency-profile-input");
const taskScheduleToggle = document.getElementById("task-schedule-toggle");
const taskAutoArmToggle = document.getElementById("task-auto-arm-toggle");
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
const taskTriggerBlockInput = document.getElementById("task-trigger-block-input");
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
let abiAutofillTimer = null;
let abiAutofillRequestId = 0;
let abiExplorerFetchTimer = null;
let abiExplorerFetchRequestId = 0;
let activeRpcEditId = null;
let currentMintStartDetection = {
  enabled: false,
  config: null
};

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

function isLikelyEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function buildTaskAbiLookupKey(chainKey = taskChainInput.value, address = taskContractInput.value) {
  const normalizedChainKey = String(chainKey || "").trim();
  const normalizedAddress = String(address || "").trim().toLowerCase();

  if (!normalizedChainKey || !normalizedAddress) {
    return "";
  }

  return `${normalizedChainKey}:${normalizedAddress}`;
}

function setTaskAbiOrigin(origin = "", lookupKey = "") {
  if (origin) {
    taskAbiInput.dataset.abiOrigin = origin;
  } else {
    delete taskAbiInput.dataset.abiOrigin;
  }

  if (lookupKey) {
    taskAbiInput.dataset.abiLookupKey = lookupKey;
  } else {
    delete taskAbiInput.dataset.abiLookupKey;
  }
}

function currentTaskAbiOrigin() {
  return taskAbiInput.dataset.abiOrigin || "";
}

function applyLatencyProfile(profile) {
  const normalized = String(profile || "").trim().toLowerCase();

  if (normalized === "custom") {
    return;
  }

  const profiles = {
    balanced: {
      walletMode: "parallel",
      gasStrategy: "normal",
      pollIntervalMs: "1000",
      retries: "1",
      retryDelayMs: "1000",
      retryWindowMin: "30",
      startJitterMs: "0",
      txTimeoutMs: "",
      gasBoostPercent: "0",
      priorityBoostPercent: "0",
      replacementBumpPercent: "12",
      replacementAttempts: "2",
      simulate: true,
      dryRun: false,
      warmupRpc: true,
      multiRpcBroadcast: false,
      smartGasReplacement: false
    },
    low_latency: {
      walletMode: "parallel",
      gasStrategy: "aggressive",
      pollIntervalMs: "250",
      retries: "1",
      retryDelayMs: "400",
      retryWindowMin: "5",
      startJitterMs: "0",
      txTimeoutMs: "45000",
      gasBoostPercent: "0",
      priorityBoostPercent: "0",
      replacementBumpPercent: "12",
      replacementAttempts: "2",
      simulate: true,
      dryRun: false,
      warmupRpc: true,
      multiRpcBroadcast: true,
      smartGasReplacement: true
    },
    ultra_low_latency: {
      walletMode: "parallel",
      gasStrategy: "aggressive",
      pollIntervalMs: "150",
      retries: "1",
      retryDelayMs: "250",
      retryWindowMin: "5",
      startJitterMs: "0",
      txTimeoutMs: "25000",
      gasBoostPercent: "8",
      priorityBoostPercent: "10",
      replacementBumpPercent: "15",
      replacementAttempts: "3",
      simulate: true,
      dryRun: false,
      warmupRpc: true,
      multiRpcBroadcast: true,
      smartGasReplacement: true
    }
  };

  const selectedProfile = profiles[normalized];
  if (!selectedProfile) {
    return;
  }

  taskWalletModeInput.value = selectedProfile.walletMode;
  taskGasStrategyInput.value = selectedProfile.gasStrategy;
  taskPollIntervalInput.value = selectedProfile.pollIntervalMs;
  taskRetriesInput.value = selectedProfile.retries;
  taskRetryDelayInput.value = selectedProfile.retryDelayMs;
  taskRetryWindowInput.value = selectedProfile.retryWindowMin;
  taskJitterInput.value = selectedProfile.startJitterMs;
  taskTxTimeoutInput.value = selectedProfile.txTimeoutMs;
  taskGasBoostInput.value = selectedProfile.gasBoostPercent;
  taskPriorityBoostInput.value = selectedProfile.priorityBoostPercent;
  taskReplaceBumpInput.value = selectedProfile.replacementBumpPercent;
  taskReplaceAttemptsInput.value = selectedProfile.replacementAttempts;
  taskSimulateToggle.checked = selectedProfile.simulate;
  taskDryRunToggle.checked = selectedProfile.dryRun;
  taskWarmupToggle.checked = selectedProfile.warmupRpc;
  taskMultiRpcBroadcastToggle.checked = selectedProfile.multiRpcBroadcast;
  taskSmartReplaceToggle.checked = selectedProfile.smartGasReplacement;
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

  bindSelectorCheckboxes(walletSelector, () => {
    setWalletSelectionCount();
    refreshPhasePreviewFromCurrentInput("Wallet selection updated");
  });
}

function renderRpcSelector(selectedIds = []) {
  const activeChain = taskChainInput.value || state.chains[0]?.key || "base_sepolia";
  const rpcNodes = state.rpcNodes.filter((node) => node.chainKey === activeChain && node.enabled);

  rpcSelector.innerHTML = rpcNodes.length
    ? rpcRowsMarkup(rpcNodes, selectedIds)
    : `<div class="empty-state"><h3>No RPC nodes</h3><p>Add enabled nodes for ${escapeHtml(chainLabel(activeChain))} in the RPC view.</p></div>`;

  setRpcSelectionCount();
  bindSelectorCheckboxes(rpcSelector, () => {
    setRpcSelectionCount();
    refreshPhasePreviewFromCurrentInput("RPC selection updated");
  });
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
        <div class="meta-item"><label>Price</label><strong>${escapeHtml(task.priceEth || "Auto")}${task.priceEth ? " ETH" : ""}</strong></div>
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
    return '<span class="rpc-chip untested">Untested</span>';
  }

  if (node.lastHealth.status === "healthy") {
    return `<span class="rpc-chip healthy">Healthy · ${node.lastHealth.latencyMs}ms</span>`;
  }

  return '<span class="rpc-chip error">Probe Failed</span>';
}

function rpcHealthDetail(node) {
  if (!node.lastHealth) {
    return "No live probe has been run yet. Test the endpoint before assigning it to a hot task.";
  }

  if (node.lastHealth.status === "healthy") {
    const blockLabel =
      node.lastHealth.blockNumber !== undefined && node.lastHealth.blockNumber !== null
        ? `Latest block ${node.lastHealth.blockNumber}.`
        : "Live block data received.";
    return `${blockLabel} Last verified ${relativeTime(node.lastHealth.checkedAt)}.`;
  }

  return node.lastHealth.error
    ? `Last probe failed: ${node.lastHealth.error}`
    : "The most recent health probe did not return a successful result.";
}

function resetRpcForm(options = {}) {
  activeRpcEditId = null;
  rpcFormTitle.textContent = "Add RPC Node";
  rpcFormSubtitle.textContent = "Create a stronger mesh with multiple fallback nodes.";
  rpcFormBadge.classList.add("hidden");
  rpcSubmitButton.textContent = "Save RPC Node";
  rpcCancelButton.classList.add("hidden");

  if (!options.preserveName) {
    rpcNameInput.value = "";
  }

  if (!options.preserveUrl) {
    rpcUrlInput.value = "";
  }
}

function startRpcEdit(node) {
  if (!node || node.source === "env") {
    return;
  }

  activeRpcEditId = node.id;
  rpcFormTitle.textContent = "Edit RPC Node";
  rpcFormSubtitle.textContent = "Correct the chain, label, or endpoint URL for this stored node.";
  rpcFormBadge.classList.remove("hidden");
  rpcSubmitButton.textContent = "Update RPC Node";
  rpcCancelButton.classList.remove("hidden");
  rpcNameInput.value = node.name || "";
  rpcChainInput.value = node.chainKey || rpcChainInput.value;
  rpcUrlInput.value = node.url || "";
  rpcNameInput.focus();
  rpcForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderRpcNodes() {
  if (activeRpcEditId && !state.rpcNodes.some((node) => node.id === activeRpcEditId)) {
    resetRpcForm();
  }

  rpcList.innerHTML = state.rpcNodes.length
    ? state.rpcNodes
        .map(
          (node) => `
            <article class="rpc-node-card ${escapeHtml(node.lastHealth?.status || "untested")}">
              <div class="rpc-node-top">
                <div class="rpc-node-copy">
                  <div class="rpc-node-title-row">
                    <strong>${escapeHtml(node.name)}</strong>
                    ${rpcHealthMarkup(node)}
                  </div>
                  <div class="chip-row rpc-node-chips">
                    <span class="queue-chip">${escapeHtml(chainLabel(node.chainKey))}</span>
                    <span class="queue-chip">${escapeHtml(node.source === "env" ? "Env Managed" : "Stored")}</span>
                    ${
                      node.lastHealth?.checkedAt
                        ? `<span class="queue-chip">${escapeHtml(relativeTime(node.lastHealth.checkedAt))}</span>`
                        : ""
                    }
                  </div>
                  <p class="rpc-node-url">${escapeHtml(node.url)}</p>
                  <p class="muted-copy rpc-node-detail">${escapeHtml(rpcHealthDetail(node))}</p>
                </div>
                <div class="rpc-node-actions">
                  <button class="mini-button fx-button" data-rpc-test="${escapeHtml(node.id)}">Test</button>
                  ${
                    node.source === "env"
                      ? '<span class="rpc-chip">Env Managed</span>'
                      : `<button class="mini-button fx-button" data-rpc-edit="${escapeHtml(node.id)}">Edit</button>
                         <button class="mini-button danger fx-button" data-rpc-delete="${escapeHtml(node.id)}">Delete</button>`
                  }
                </div>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No RPC nodes saved</h3><p>Add chain endpoints to build a failover mesh.</p></div>`;

  rpcList.querySelectorAll("[data-rpc-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const node = state.rpcNodes.find((entry) => entry.id === button.dataset.rpcEdit);
      if (!node) {
        return;
      }

      startRpcEdit(node);
      showToast(`Editing ${node.name}.`, "info", "RPC Editor");
    });
  });

  rpcList.querySelectorAll("[data-rpc-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/rpc-nodes/${button.dataset.rpcDelete}`, { method: "DELETE" });
        if (activeRpcEditId === button.dataset.rpcDelete) {
          resetRpcForm();
        }
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

function setExplorerKeyStatus(message = null) {
  if (message) {
    explorerConfigStatus.textContent = message;
    return;
  }

  if (explorerApiKeyInput.value.trim()) {
    explorerConfigStatus.textContent = "New key ready to test or save";
    return;
  }

  if (state.settings.explorerApiKeySource === "saved") {
    explorerConfigStatus.textContent = "Saved key available";
    return;
  }

  if (state.settings.explorerApiKeySource === "env") {
    explorerConfigStatus.textContent = "Environment key available";
    return;
  }

  explorerConfigStatus.textContent = "Not configured";
}

function syncExplorerKeyControls() {
  if (state.settings.explorerApiKeySource === "saved") {
    explorerApiKeyInput.placeholder = "Saved on server. Enter a new key to replace it.";
  } else if (state.settings.explorerApiKeySource === "env") {
    explorerApiKeyInput.placeholder = "Loaded from .env. Enter a new key to override it.";
  } else {
    explorerApiKeyInput.placeholder = "Etherscan V2 API key";
  }

  deleteExplorerKeyButton.disabled = state.settings.explorerApiKeySource !== "saved";
  deleteExplorerKeyButton.title =
    state.settings.explorerApiKeySource === "saved"
      ? "Delete the saved explorer API key"
      : "Only saved dashboard keys can be deleted here";
}

function renderSettings() {
  profileNameInput.value = state.settings.profileName || "local";
  themeInput.value = state.settings.theme || "quantum-operator";
  resultsPathInput.value = state.settings.resultsPath || "./dist/mint-results.json";
  explorerApiKeyInput.value = "";

  syncExplorerKeyControls();
  setExplorerKeyStatus();
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

function normalizeMintStartDetectionState(value = null) {
  const config = value && typeof value === "object" ? value : null;
  const enabled = Boolean(config?.enabled && (config?.saleActiveFunction || config?.stateFunction));

  return {
    enabled,
    config: config
      ? {
          enabled,
          pollIntervalMs: Number(config.pollIntervalMs || 500) || 500,
          saleActiveFunction: config.saleActiveFunction || null,
          pausedFunction: config.pausedFunction || null,
          totalSupplyFunction: config.totalSupplyFunction || null,
          stateFunction: config.stateFunction || null,
          signals: Array.isArray(config.signals) ? config.signals : []
        }
      : null
  };
}

function setMintStartDetectionState(value = null) {
  currentMintStartDetection = normalizeMintStartDetectionState(value);
}

function findAbiFunctionEntry(abiEntries, functionName) {
  const requested = String(functionName || "").trim().toLowerCase();
  if (!requested) {
    return null;
  }

  return (
    abiEntries.find(
      (entry) =>
        entry?.type === "function" &&
        typeof entry.name === "string" &&
        entry.name.trim().toLowerCase() === requested
    ) || null
  );
}

function abiFunctionNames(abiEntries) {
  return abiEntries
    .filter((item) => item?.type === "function" && typeof item.name === "string" && item.name.trim())
    .map((item) => item.name.trim());
}

function normalizeAbiName(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isIntegerAbiType(type) {
  return /^u?int(\d+)?$/i.test(String(type || ""));
}

const preferredMintFunctionNames = [
  "mint",
  "publicMint",
  "safeMint",
  "publicSaleMint",
  "saleMint",
  "presaleMint",
  "allowlistMint",
  "whitelistMint",
  "mintAllowlist",
  "mintWhitelist",
  "mintPresale",
  "mintPublic",
  "mintTo",
  "claim",
  "buy",
  "purchase",
  "redeem"
];

const preferredMintFunctionNameSet = new Set(
  preferredMintFunctionNames.map((name) => normalizeAbiName(name))
);

function writableAbiFunctionEntries(abiEntries) {
  return abiEntries.filter(
    (entry) =>
      entry?.type === "function" &&
      typeof entry.name === "string" &&
      entry.name.trim() &&
      !["view", "pure"].includes(String(entry.stateMutability || "").toLowerCase())
  );
}

function mintFunctionCandidateScore(entry) {
  const normalizedName = normalizeAbiName(entry?.name);
  if (!normalizedName) {
    return -1;
  }

  if (/^(set|get|is|has|supports|owner|admin|pause|unpause|toggle|update|edit|configure|config|withdraw)/.test(normalizedName)) {
    return -1;
  }

  let score = 0;

  if (preferredMintFunctionNameSet.has(normalizedName)) {
    score += 1000;
  }

  if (/mint/.test(normalizedName)) {
    score += 500;
  }

  if (/claim|buy|purchase|redeem/.test(normalizedName)) {
    score += 450;
  }

  if (/public|sale|allowlist|whitelist|presale/.test(normalizedName)) {
    score += 120;
  }

  if (/airdrop|reserve|owner|admin|team|dev|gift|promo|partner/.test(normalizedName)) {
    score -= 250;
  }

  if (
    /price|cost|fee|state|status|active|open|live|start|end|time|date|phase|paused|supply|limit|max|remaining|nonce|proof|signature|signer|root|baseuri|tokenuri|balanceof|ownerof/.test(
      normalizedName
    )
  ) {
    score -= 150;
  }

  if (String(entry.stateMutability || "").toLowerCase() === "payable") {
    score += 50;
  }

  return score;
}

function detectMintFunctionsFromAbi(abiEntries) {
  const namesByLower = abiFunctionNames(abiEntries).reduce((map, name) => {
    const lowerName = name.toLowerCase();
    if (!map.has(lowerName)) {
      map.set(lowerName, name);
    }
    return map;
  }, new Map());

  const explicitMatches = preferredMintFunctionNames
    .map((name) => namesByLower.get(name.toLowerCase()) || null)
    .filter((name, index, values) => Boolean(name) && values.indexOf(name) === index);
  const inferredMatches = writableAbiFunctionEntries(abiEntries)
    .map((entry) => ({
      name: entry.name.trim(),
      score: mintFunctionCandidateScore(entry)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .map((candidate) => candidate.name);

  return [...explicitMatches, ...inferredMatches].filter(
    (name, index, values) => Boolean(name) && values.indexOf(name) === index
  );
}

function describeMintFunctionDetection(abiEntries, detectedFunctions) {
  const functionCount = abiFunctionNames(abiEntries).length;
  if (functionCount === 0) {
    return "ABI contains 0 functions; load the contract ABI JSON.";
  }

  if (detectedFunctions.length > 0) {
    return `detected ${detectedFunctions.join(", ")}`;
  }

  const availableWriteFunctions = writableAbiFunctionEntries(abiEntries)
    .map((entry) => entry.name.trim())
    .slice(0, 5);
  if (availableWriteFunctions.length > 0) {
    return `no common mint function detected; write functions include ${availableWriteFunctions.join(", ")}`;
  }

  return `ABI has ${pluralize(functionCount, "function")} but no writable mint candidates`;
}

function resolveMintFunctionFromAbi(abiEntries, requestedFunction = "") {
  const namesByLower = abiFunctionNames(abiEntries).reduce((map, name) => {
    const lowerName = name.toLowerCase();
    if (!map.has(lowerName)) {
      map.set(lowerName, name);
    }
    return map;
  }, new Map());
  const detectedFunctions = detectMintFunctionsFromAbi(abiEntries);
  const requested = requestedFunction.trim();
  const matchedRequestedFunction = requested ? namesByLower.get(requested.toLowerCase()) || "" : "";

  return {
    detectedFunctions,
    mintFunction: matchedRequestedFunction || detectedFunctions[0] || "",
    shouldAutofill: Boolean(!matchedRequestedFunction && detectedFunctions[0])
  };
}

function inferTaskPlatformFromAbi(abiEntries, mintFunction = "") {
  const mintEntry = findAbiFunctionEntry(abiEntries, mintFunction);
  const abiNames = abiEntries
    .filter((entry) => typeof entry?.name === "string")
    .map((entry) => entry.name.toLowerCase());
  const mintInputNames = (mintEntry?.inputs || []).map((input) => normalizeAbiName(input?.name));
  const mintInputTypes = (mintEntry?.inputs || []).map((input) => String(input?.type || "").toLowerCase());

  const hasAllowlistPattern =
    [mintFunction, ...abiNames].some((name) => /allow|white|merkle|proof|presale|claim|signature|voucher/i.test(name)) ||
    mintInputNames.some((name) => /allow|white|merkle|proof|presale|claim|signature|voucher/i.test(name)) ||
    mintInputTypes.some((type) => type === "bytes32[]" || type === "bytes" || type === "bytes32");

  const hasErc1155Pattern =
    abiEntries.some(
      (entry) =>
        entry?.type === "function" &&
        entry.name === "balanceOf" &&
        Array.isArray(entry.inputs) &&
        entry.inputs.length === 2
    ) ||
    abiEntries.some((entry) => entry?.type === "function" && entry.name === "uri") ||
    abiEntries.some(
      (entry) => entry?.type === "event" && /TransferSingle|TransferBatch/.test(String(entry.name || ""))
    );

  const hasErc721Pattern =
    abiEntries.some((entry) => entry?.type === "function" && entry.name === "ownerOf") ||
    abiEntries.some((entry) => entry?.type === "function" && entry.name === "tokenURI") ||
    abiEntries.some((entry) => entry?.type === "event" && entry.name === "Transfer");

  if (hasAllowlistPattern) {
    return "Allowlist Mint";
  }

  if (hasErc1155Pattern) {
    return "ERC1155 Mint";
  }

  if (hasErc721Pattern) {
    return "ERC721 Public Mint";
  }

  return "Generic EVM (auto-detect)";
}

function looksLikeQuantityInput(input, inputIndex, totalInputs) {
  const normalizedName = normalizeAbiName(input?.name);
  if (!isIntegerAbiType(input?.type)) {
    return false;
  }

  if (
    /id|tokenid|proof|phase|nonce|timestamp|max|limit|sale|price|cost|wei|eth|index/.test(
      normalizedName
    )
  ) {
    return false;
  }

  if (
    /qty|quantity|count|mintamount|mintqty|requestedquantity|numberoftokens|numberofnfts|numtokens|tokenquantity|amount/.test(
      normalizedName
    )
  ) {
    return true;
  }

  return totalInputs === 1 && inputIndex === 0;
}

function defaultValueForAbiInput(input, inputIndex, totalInputs) {
  const type = String(input?.type || "");

  if (/^address$/i.test(type)) {
    return "{{wallet}}";
  }

  if (/\[\]$/.test(type)) {
    return [];
  }

  if (/^bool$/i.test(type)) {
    return false;
  }

  if (/^string$/i.test(type)) {
    return "";
  }

  if (/^bytes(\d+)?$/i.test(type)) {
    return "0x";
  }

  if (/^tuple/i.test(type)) {
    return null;
  }

  if (isIntegerAbiType(type)) {
    return looksLikeQuantityInput(input, inputIndex, totalInputs) ? 1 : 0;
  }

  return null;
}

function inferMintArgsFromAbi(abiEntries, mintFunction = "") {
  const mintEntry = findAbiFunctionEntry(abiEntries, mintFunction);
  if (!mintEntry?.inputs?.length) {
    return [];
  }

  return mintEntry.inputs.map((input, inputIndex) =>
    defaultValueForAbiInput(input, inputIndex, mintEntry.inputs.length)
  );
}

function buildLocalMintAutofill(abiEntries, requestedFunction = "") {
  const resolvedMintFunction = resolveMintFunctionFromAbi(abiEntries, requestedFunction);
  return {
    mintFunction: resolvedMintFunction.mintFunction,
    mintArgs: inferMintArgsFromAbi(abiEntries, resolvedMintFunction.mintFunction),
    quantityPerWallet: 1,
    platform: inferTaskPlatformFromAbi(abiEntries, resolvedMintFunction.mintFunction),
    detectedMintFunctions: resolvedMintFunction.detectedFunctions
  };
}

function applyMintAutofill(autofill, options = {}) {
  const {
    includeFunction = true,
    includeArgs = true,
    includeQuantity = true,
    includePrice = true,
    includePlatform = true
  } = options;

  if (includeFunction && autofill?.mintFunction) {
    taskFunctionInput.value = autofill.mintFunction;
  }

  if (includeArgs && Array.isArray(autofill?.mintArgs)) {
    taskArgsInput.value = JSON.stringify(autofill.mintArgs);
  }

  if (includeQuantity && autofill?.quantityPerWallet) {
    taskQuantityInput.value = String(autofill.quantityPerWallet);
  }

  if (includePrice && autofill?.priceEth !== undefined && autofill?.priceEth !== null) {
    const hasExistingCustomPrice =
      taskPriceInput.value.trim() !== "" && taskPriceInput.value.trim() !== "0";
    if (autofill.priceSource || !hasExistingCustomPrice) {
      taskPriceInput.value = String(autofill.priceEth);
    }
  }

  if (
    includePlatform &&
    autofill?.platform &&
    [...taskPlatformInput.options].some((option) => option.value === autofill.platform)
  ) {
    taskPlatformInput.value = autofill.platform;
  }
}

function formatPhasePreviewTime(isoString) {
  if (!isoString) {
    return "Watch contract state";
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return "Watch contract state";
  }

  return parsed.toLocaleString();
}

function renderPhasePreview(phasePreview = []) {
  if (!taskPhasePreview) {
    return;
  }

  if (!Array.isArray(phasePreview) || phasePreview.length === 0) {
    taskPhasePreview.innerHTML =
      '<div class="empty-state"><h3>No phases detected yet</h3><p>Load an ABI and contract to preview GTD, allowlist, and public/free-mint details.</p></div>';
    return;
  }

  taskPhasePreview.innerHTML = phasePreview
    .map((phase) => {
      const priceLabel =
        phase.priceEth !== undefined && phase.priceEth !== null
          ? `${escapeHtml(String(phase.priceEth))} ETH`
          : "Auto";
      const statusTone =
        phase.eligibilityStatus === "eligible"
          ? "running"
          : phase.eligibilityStatus === "ineligible"
            ? "failed"
            : phase.eligibilityStatus === "review"
              ? "warning"
              : phase.autoLaunchMode === "scheduled" || phase.autoLaunchMode === "watch"
                ? "running"
                : "";
      const statusLabel =
        phase.eligibilityStatus === "eligible"
          ? "Eligible"
          : phase.eligibilityStatus === "ineligible"
            ? "Excluded"
            : phase.eligibilityStatus === "review"
              ? "Review"
              : phase.eligibilityStatus === "no_wallets"
                ? "Select Wallets"
                : phase.autoLaunchMode === "scheduled"
                  ? "Scheduled"
                  : phase.autoLaunchMode === "watch"
                    ? "Watching"
                    : phase.autoLaunchMode === "instant"
                      ? "Ready"
                      : "Auto";
      const warningLine = phase.warning
        ? `<p class="muted-copy">${escapeHtml(phase.warning)}</p>`
        : "";

      return `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(phase.label || phase.phaseType || "Phase")}</strong>
            <p class="muted-copy">${escapeHtml(phase.signature || phase.mintFunction || "Unknown mint")}</p>
            <p class="muted-copy">Eligibility: ${escapeHtml(phase.eligibilityLabel || "Unknown")}</p>
            <p class="muted-copy">Price: ${priceLabel}${phase.priceSource ? ` via ${escapeHtml(phase.priceSource)}` : ""}</p>
            <p class="muted-copy">Start: ${escapeHtml(formatPhasePreviewTime(phase.waitUntilIso))}${phase.startTimeSource ? ` via ${escapeHtml(phase.startTimeSource)}` : ""}</p>
            <p class="muted-copy">${escapeHtml(phase.autoLaunchLabel || "Automatic launch unavailable")}</p>
            ${warningLine}
          </div>
          <span class="status-pill ${statusTone}">${escapeHtml(statusLabel)}</span>
        </div>
      `;
    })
    .join("");
}

function refreshPhasePreviewFromCurrentInput(sourceLabel = "Eligibility updated") {
  if (!taskAbiInput.value.trim()) {
    return;
  }

  try {
    const abiEntries = parseAbiEntries(taskAbiInput.value);
    requestRemoteMintAutofill(abiEntries, {
      sourceLabel,
      includeFunction: false,
      includeArgs: false,
      includeQuantity: false,
      includePrice: false,
      includePlatform: false
    }).catch(() => {});
  } catch {
    // Ignore preview refresh when ABI is incomplete.
  }
}

function buildAbiStatusSourceLabel(sourceLabel, autofill = null) {
  const parts = [];
  if (sourceLabel) {
    parts.push(sourceLabel);
  }
  if (autofill?.mintStartDetection?.enabled) {
    parts.push("mint start detection armed");
  }
  if (Array.isArray(autofill?.phasePreview) && autofill.phasePreview.length > 0) {
    parts.push(`${autofill.phasePreview.length} phase plan${autofill.phasePreview.length === 1 ? "" : "s"} detected`);
  }
  if (autofill?.priceSource) {
    parts.push(`price via ${autofill.priceSource}`);
  } else if (autofill?.warnings?.length) {
    parts.push("partial autofill");
  }
  return parts.join(" · ");
}

function updateAbiStatus(sourceLabel = "") {
  if (!taskAbiInput.value.trim()) {
    renderPhasePreview([]);
    abiStatus.textContent = state.settings.explorerApiKeyConfigured
      ? "Enter a contract address to auto-fetch ABI, or paste JSON manually."
      : "Paste JSON or load a file. Add an Etherscan API key in Settings to auto-fetch ABI.";
    return;
  }

  try {
    const abi = parseAbiEntries(taskAbiInput.value);
    const functionCount = abiFunctionNames(abi).length;
    const resolvedMintFunction = resolveMintFunctionFromAbi(abi, taskFunctionInput.value);
    if (resolvedMintFunction.shouldAutofill) {
      taskFunctionInput.value = resolvedMintFunction.mintFunction;
    }

    const statusParts = [`ABI loaded - ${pluralize(functionCount, "function")}`];
    if (resolvedMintFunction.detectedFunctions.length > 0) {
      statusParts.push(`detected ${resolvedMintFunction.detectedFunctions.join(", ")}`);
    } else {
      statusParts.push(describeMintFunctionDetection(abi, resolvedMintFunction.detectedFunctions));
    }
    if (sourceLabel) {
      statusParts.push(sourceLabel);
    }

    abiStatus.textContent = statusParts.join(" - ");
  } catch {
    renderPhasePreview([]);
    abiStatus.textContent = "ABI JSON is not valid yet.";
  }
}

function scheduleExplorerAbiFetch(options = {}) {
  const { force = false } = options;
  window.clearTimeout(abiExplorerFetchTimer);

  if (!state.settings.explorerApiKeyConfigured) {
    return;
  }

  const chainKey = taskChainInput.value;
  const address = taskContractInput.value.trim();
  const lookupKey = buildTaskAbiLookupKey(chainKey, address);
  const abiOrigin = currentTaskAbiOrigin();
  const abiLookupKey = taskAbiInput.dataset.abiLookupKey || "";

  if (!chainKey || !isLikelyEvmAddress(address)) {
    return;
  }

  if (!force && taskAbiInput.value.trim() && abiOrigin !== "explorer") {
    return;
  }

  if (!force && abiOrigin === "explorer" && abiLookupKey === lookupKey && taskAbiInput.value.trim()) {
    return;
  }

  abiExplorerFetchTimer = window.setTimeout(() => {
    fetchAbiForCurrentTask({ auto: true }).catch(() => {});
  }, 450);
}

async function requestRemoteMintAutofill(abiEntries, options = {}) {
  const {
    sourceLabel = "",
    includeFunction = true,
    includeArgs = true,
    includeQuantity = true,
    includePrice = true,
    includePlatform = true
  } = options;
  const chainKey = taskChainInput.value;
  const contractAddress = taskContractInput.value.trim();

  if (!chainKey) {
    return null;
  }

  const requestId = ++abiAutofillRequestId;

  try {
    const payload = await request("/api/contracts/autofill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainKey,
        contractAddress,
        abi: abiEntries,
        mintFunction: taskFunctionInput.value,
        walletIds: selectedWalletIds(),
        rpcNodeIds: selectedRpcIds(),
        quantityPerWallet: Number(taskQuantityInput.value || 1)
      })
    });

    if (requestId !== abiAutofillRequestId) {
      return null;
    }

    const autofill = payload.autofill || null;
    if (!autofill) {
      return null;
    }

    setMintStartDetectionState(autofill.mintStartDetection || null);
    renderPhasePreview(autofill.phasePreview || []);
    applyMintAutofill(autofill, {
      includeFunction,
      includeArgs,
      includeQuantity,
      includePrice,
      includePlatform
    });
    updateAbiStatus(buildAbiStatusSourceLabel(sourceLabel, autofill));
    return autofill;
  } catch {
    if (requestId === abiAutofillRequestId) {
      renderPhasePreview([]);
      updateAbiStatus(sourceLabel);
    }
    return null;
  }
}

function scheduleRemoteMintAutofill(abiEntries, options = {}) {
  window.clearTimeout(abiAutofillTimer);
  abiAutofillTimer = window.setTimeout(() => {
    requestRemoteMintAutofill(abiEntries, options).catch(() => {});
  }, 350);
}

function applyAbiAutofillFromCurrentInput(options = {}) {
  const {
    sourceLabel = "",
    includeFunction = true,
    includeArgs = true,
    includeQuantity = true,
    includePrice = true,
    includePlatform = true,
    remote = true
  } = options;

  if (!taskAbiInput.value.trim()) {
    updateAbiStatus();
    return;
  }

  try {
    const abiEntries = parseAbiEntries(taskAbiInput.value);
    const localAutofill = buildLocalMintAutofill(abiEntries, taskFunctionInput.value);
    setMintStartDetectionState(null);
    renderPhasePreview([]);
    applyMintAutofill(localAutofill, {
      includeFunction,
      includeArgs,
      includeQuantity,
      includePrice: false,
      includePlatform
    });
    updateAbiStatus(buildAbiStatusSourceLabel(sourceLabel, localAutofill));

    if (remote) {
      scheduleRemoteMintAutofill(abiEntries, {
        sourceLabel,
        includeFunction,
        includeArgs,
        includeQuantity,
        includePrice,
        includePlatform
      });
    }
  } catch {
    updateAbiStatus();
  }
}

async function fetchAbiForCurrentTask(options = {}) {
  const { auto = false } = options;
  const chainKey = taskChainInput.value;
  const address = taskContractInput.value.trim();

  if (!chainKey) {
    if (!auto) {
      showToast("Choose a chain before fetching ABI data.", "error", "Explorer ABI");
    }
    return;
  }

  if (!address) {
    if (!auto) {
      showToast("Enter a contract address before fetching ABI data.", "error", "Explorer ABI");
    }
    return;
  }

  if (auto && !state.settings.explorerApiKeyConfigured) {
    return;
  }

  const idleLabel = fetchAbiButton.textContent;
  const lookupKey = buildTaskAbiLookupKey(chainKey, address);
  const requestId = ++abiExplorerFetchRequestId;

  if (!auto) {
    fetchAbiButton.disabled = true;
    fetchAbiButton.textContent = "Fetching...";
  }
  abiStatus.textContent = "Fetching ABI from explorer...";

  try {
    const payload = await request(
      `/api/explorer/abi?chainKey=${encodeURIComponent(chainKey)}&address=${encodeURIComponent(address)}`,
      { quiet: auto }
    );
    if (requestId !== abiExplorerFetchRequestId) {
      return;
    }

    taskAbiInput.value = JSON.stringify(payload.abi, null, 2);
    setTaskAbiOrigin("explorer", lookupKey);
    setMintStartDetectionState(payload.autofill?.mintStartDetection || null);
    renderPhasePreview(payload.autofill?.phasePreview || []);
    applyMintAutofill(payload.autofill || buildLocalMintAutofill(payload.abi || [], taskFunctionInput.value));
    updateAbiStatus(
      buildAbiStatusSourceLabel(
        auto ? `${payload.provider || "Explorer"} auto-loaded` : payload.provider || "Explorer",
        payload.autofill
      )
    );
    if (!auto) {
      showToast(
        `ABI loaded from ${payload.provider || "the explorer"} and mint fields were auto-filled.`,
        "success",
        "ABI Loaded"
      );
    }

    requestRemoteMintAutofill(payload.abi || [], {
      sourceLabel: `${payload.provider || "Explorer"} wallet preview`,
      includeFunction: false,
      includeArgs: false,
      includeQuantity: false,
      includePrice: false,
      includePlatform: false
    }).catch(() => {});
  } catch {
    if (requestId === abiExplorerFetchRequestId) {
      updateAbiStatus();
    }
  } finally {
    if (!auto) {
      fetchAbiButton.disabled = false;
      fetchAbiButton.textContent = idleLabel;
    }
  }
}

function openTaskModal(task = null) {
  modalTitle.textContent = task ? "Edit Task" : "New Task";
  taskSubmitButton.textContent = task ? "Save Task" : "Create Task";
  window.clearTimeout(abiExplorerFetchTimer);

  taskIdInput.value = task?.id || "";
  taskNameInput.value = task?.name || "";
  taskPriorityInput.value = task?.priority || "standard";
  taskTagsInput.value = (task?.tags || []).join(", ");
  taskContractInput.value = task?.contractAddress || "";
  taskChainInput.value = task?.chainKey || state.chains[0]?.key || "base_sepolia";
  taskQuantityInput.value = task?.quantityPerWallet || 1;
  taskPriceInput.value = task?.priceEth || "";
  taskAbiInput.value = task?.abiJson || "";
  taskPlatformInput.value = task?.platform || "Generic EVM (auto-detect)";
  taskFunctionInput.value = task?.mintFunction || "";
  taskArgsInput.value = task?.mintArgs || "";
  taskAutoPhaseToggle.checked = !task;
  taskAutoPhaseToggle.disabled = Boolean(task);
  taskAutoArmToggle.checked = task?.autoArm ?? true;
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
  taskTriggerBlockInput.value = task?.triggerBlockNumber || "";
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
  taskLatencyProfileInput.value = task ? "custom" : "low_latency";
  setMintStartDetectionState({
    enabled: task?.mintStartDetectionEnabled,
    ...(task?.mintStartDetectionConfig && typeof task.mintStartDetectionConfig === "object"
      ? task.mintStartDetectionConfig
      : {})
  });
  taskAbiFileInput.value = "";
  setTaskAbiOrigin(
    task?.abiJson ? "manual" : "",
    task?.contractAddress ? buildTaskAbiLookupKey(task?.chainKey, task?.contractAddress) : ""
  );
  fetchAbiButton.disabled = false;
  fetchAbiButton.textContent = "Fetch from Explorer";
  renderPhasePreview([]);

  if (!task) {
    applyLatencyProfile(taskLatencyProfileInput.value);
    if (state.settings.explorerApiKeyConfigured && isLikelyEvmAddress(taskContractInput.value)) {
      scheduleExplorerAbiFetch({ force: true });
    }
  }

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
    autoGeneratePhaseTasks: !taskIdInput.value && taskAutoPhaseToggle.checked,
    autoArm: taskAutoArmToggle.checked,
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
    mintStartDetectionEnabled: currentMintStartDetection.enabled,
    mintStartDetectionConfig: currentMintStartDetection.config,
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
    triggerBlockNumber: taskTriggerBlockInput.value,
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
  const { quiet = false, ...fetchOptions } = options;
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...fetchOptions
    });
  } catch (error) {
    if (!quiet) {
      pushLocalLog("error", error.message || "Network request failed");
      showToast(error.message || "Network request failed", "error");
    }
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const message = payload.error || "Session expired. Sign in again.";
    handleUnauthorized(message);
    if (!quiet) {
      pushLocalLog("error", message);
      showToast(message, "error");
    }
    throw new Error(message);
  }

  if (!response.ok) {
    const message = payload.error || "Request failed";
    if (!quiet) {
      pushLocalLog("error", message);
      showToast(message, "error");
    }
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
        id: activeRpcEditId || undefined,
        name: rpcNameInput.value,
        chainKey: rpcChainInput.value,
        url: rpcUrlInput.value
      })
    });
    const wasEditing = Boolean(activeRpcEditId);
    resetRpcForm();
    showToast(
      wasEditing ? "RPC node updated successfully." : "RPC node saved to the mesh.",
      "success",
      wasEditing ? "RPC Updated" : "RPC Added"
    );
  } catch {}
});

rpcCancelButton.addEventListener("click", () => {
  resetRpcForm();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const explorerApiKeyValue = explorerApiKeyInput.value.trim();
  try {
    const payload = await request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileName: profileNameInput.value,
        theme: themeInput.value,
        resultsPath: resultsPathInput.value,
        explorerApiKey: explorerApiKeyValue
      })
    });
    if (payload.settings) {
      state.settings = payload.settings;
    }
    explorerApiKeyInput.value = "";
    showToast(
      explorerApiKeyValue
        ? "Settings saved. Explorer API key updated."
        : "Local operator settings saved.",
      "success",
      explorerApiKeyValue ? "Explorer Key Updated" : "Settings Updated"
    );
    syncExplorerKeyControls();
    setExplorerKeyStatus();
  } catch {}
});

explorerApiKeyInput.addEventListener("input", () => {
  setExplorerKeyStatus();
});

deleteExplorerKeyButton.addEventListener("click", async () => {
  if (state.settings.explorerApiKeySource !== "saved") {
    showToast("There is no saved dashboard key to delete.", "info", "No Saved Key");
    return;
  }

  if (!window.confirm("Delete the saved explorer API key?")) {
    return;
  }

  const buttonLabel = deleteExplorerKeyButton.textContent;
  deleteExplorerKeyButton.disabled = true;
  deleteExplorerKeyButton.textContent = "Deleting...";

  try {
    const payload = await request("/api/settings/explorer-key", {
      method: "DELETE"
    });

    if (payload.settings) {
      state.settings = payload.settings;
    }

    explorerApiKeyInput.value = "";
    syncExplorerKeyControls();
    setExplorerKeyStatus();
    showToast("Saved explorer API key deleted.", "success", "Explorer Key Deleted");
  } catch {
    syncExplorerKeyControls();
    setExplorerKeyStatus();
  } finally {
    deleteExplorerKeyButton.textContent = buttonLabel;
    syncExplorerKeyControls();
  }
});

testExplorerKeyButton.addEventListener("click", async () => {
  const buttonLabel = testExplorerKeyButton.textContent;
  const explorerApiKeyValue = explorerApiKeyInput.value.trim();

  testExplorerKeyButton.disabled = true;
  testExplorerKeyButton.textContent = "Testing...";

  try {
    const payload = await request("/api/control/test-explorer-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explorerApiKey: explorerApiKeyValue
      })
    });

    const statusMessage =
      payload.source === "input"
        ? "Typed key verified"
        : payload.source === "env"
          ? "Environment key verified"
          : "Saved key verified";
    setExplorerKeyStatus(statusMessage);
    showToast(
      payload.source === "input"
        ? "Explorer API key is valid. Save settings to replace the current key."
        : payload.source === "env"
          ? "Environment explorer API key is valid. Save a new key if you want to override it in the dashboard."
          : "Saved explorer API key is valid.",
      "success",
      "Explorer Key Valid"
    );
  } catch {
    setExplorerKeyStatus("Key test failed");
  } finally {
    testExplorerKeyButton.disabled = false;
    testExplorerKeyButton.textContent = buttonLabel;
  }
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

taskLatencyProfileInput.addEventListener("change", () => {
  applyLatencyProfile(taskLatencyProfileInput.value);
});

taskChainInput.addEventListener("change", () => {
  renderRpcSelector(
    selectedRpcIds().filter((rpcId) => {
      const node = state.rpcNodes.find((rpcNode) => rpcNode.id === rpcId);
      return node?.chainKey === taskChainInput.value;
    })
  );

  const lookupKey = buildTaskAbiLookupKey();
  if (currentTaskAbiOrigin() === "explorer" && taskAbiInput.dataset.abiLookupKey !== lookupKey) {
    taskAbiInput.value = "";
    setTaskAbiOrigin("", "");
    setMintStartDetectionState(null);
    renderPhasePreview([]);
  }

  scheduleExplorerAbiFetch({
    force: currentTaskAbiOrigin() === "explorer" || !taskAbiInput.value.trim()
  });

  if (taskAbiInput.value.trim()) {
    applyAbiAutofillFromCurrentInput({
      sourceLabel: "Chain updated",
      includeFunction: false,
      includeArgs: false,
      includeQuantity: false,
      includePrice: true,
      includePlatform: false
    });
  }
});

taskContractInput.addEventListener("input", () => {
  const lookupKey = buildTaskAbiLookupKey();
  if (currentTaskAbiOrigin() === "explorer" && taskAbiInput.dataset.abiLookupKey !== lookupKey) {
    taskAbiInput.value = "";
    setTaskAbiOrigin("", "");
    setMintStartDetectionState(null);
    renderPhasePreview([]);
    updateAbiStatus();
  }

  scheduleExplorerAbiFetch({
    force: currentTaskAbiOrigin() === "explorer" || !taskAbiInput.value.trim()
  });
});

taskContractInput.addEventListener("change", () => {
  scheduleExplorerAbiFetch({
    force: currentTaskAbiOrigin() === "explorer" || !taskAbiInput.value.trim()
  });

  if (taskAbiInput.value.trim()) {
    applyAbiAutofillFromCurrentInput({
      sourceLabel: "Contract updated",
      includeFunction: false,
      includeArgs: false,
      includeQuantity: false,
      includePrice: true,
      includePlatform: false
    });
  }
});

taskFunctionInput.addEventListener("change", () => {
  if (taskAbiInput.value.trim()) {
    applyAbiAutofillFromCurrentInput({
      sourceLabel: "Mint function updated",
      includeFunction: true,
      includeArgs: true,
      includeQuantity: true,
      includePrice: false,
      includePlatform: true,
      remote: false
    });
  }
});

taskQuantityInput.addEventListener("change", () => {
  refreshPhasePreviewFromCurrentInput("Quantity updated");
});

taskAbiInput.addEventListener("input", () => {
  setTaskAbiOrigin(taskAbiInput.value.trim() ? "manual" : "", buildTaskAbiLookupKey());
  applyAbiAutofillFromCurrentInput({
    sourceLabel: "Manual ABI",
    includeFunction: true,
    includeArgs: true,
    includeQuantity: true,
    includePrice: true,
    includePlatform: true
  });
});

fetchAbiButton.addEventListener("click", () => {
  fetchAbiForCurrentTask().catch(() => {});
});

taskAbiFileInput.addEventListener("change", async () => {
  const file = taskAbiFileInput.files?.[0];
  if (!file) {
    return;
  }

  taskAbiInput.value = await file.text();
  setTaskAbiOrigin("manual", buildTaskAbiLookupKey());
  applyAbiAutofillFromCurrentInput({
    sourceLabel: "ABI file",
    includeFunction: true,
    includeArgs: true,
    includeQuantity: true,
    includePrice: true,
    includePlatform: true
  });
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
  setTaskAbiOrigin("manual", buildTaskAbiLookupKey());
  applyAbiAutofillFromCurrentInput({
    sourceLabel: "Dropped ABI",
    includeFunction: true,
    includeArgs: true,
    includeQuantity: true,
    includePrice: true,
    includePlatform: true
  });
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTaskPayload())
    });
    closeTaskModal();
    const savedTasks = Array.isArray(payload.tasks)
      ? payload.tasks
      : payload.task
        ? [payload.task]
        : [];
    const launchedCount = savedTasks.filter((task) => ["running", "queued"].includes(task.status)).length;
    const scheduledCount = savedTasks.filter((task) => task.schedulePending).length;
    const reviewCount = savedTasks.filter(
      (task) => task.autoArm && !task.autoArmPending && !task.schedulePending && !["running", "queued"].includes(task.status)
    ).length;
    if (Array.isArray(payload.tasks) && payload.tasks.length > 1) {
      showToast(
        `${payload.tasks.length} phase tasks created. ${launchedCount} armed now, ${scheduledCount} scheduled, ${reviewCount} awaiting review.`,
        "success",
        "Phase Tasks Created"
      );
      return;
    }

    if (launchedCount > 0) {
      showToast("Task saved and auto-armed immediately.", "success", "Task Armed");
      return;
    }

    if (scheduledCount > 0) {
      showToast("Task saved and scheduled automatically.", "success", "Task Scheduled");
      return;
    }

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
