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
const rpcImportChainlistButton = document.getElementById("rpc-import-chainlist-button");
const rpcChainSearchField = document.getElementById("rpc-chain-search-field");
const rpcChainSearchInput = document.getElementById("rpc-chain-search-input");
const rpcSearchMatch = document.getElementById("rpc-search-match");
const rpcManualFields = document.getElementById("rpc-manual-fields");
const rpcNameInput = document.getElementById("rpc-name-input");
const rpcChainInput = document.getElementById("rpc-chain-input");
const rpcUrlInput = document.getElementById("rpc-url-input");
const rpcDetectStatus = document.getElementById("rpc-detect-status");
const rpcInlineSummary = document.getElementById("rpc-inline-summary");
const rpcInlineSelectionStatus = document.getElementById("rpc-inline-selection-status");
const rpcInlineCandidateList = document.getElementById("rpc-inline-candidate-list");
const rpcPagePulseButton = document.getElementById("rpc-page-pulse-button");
const rpcOpsOverview = document.getElementById("rpc-ops-overview");
const rpcBroadcastAdvisor = document.getElementById("rpc-broadcast-advisor");
const rpcChainCommandCaption = document.getElementById("rpc-chain-command-caption");
const rpcChainCommandGrid = document.getElementById("rpc-chain-command-grid");
const rpcAiGenerateButton = document.getElementById("rpc-ai-generate-button");
const rpcAiStatus = document.getElementById("rpc-ai-status");
const rpcAiPromptInput = document.getElementById("rpc-ai-prompt-input");
const rpcAiOutput = document.getElementById("rpc-ai-output");
const rpcDoctrineGrid = document.getElementById("rpc-doctrine-grid");
const rpcList = document.getElementById("rpc-list");
const rpcChainlistModal = document.getElementById("rpc-chainlist-modal");
const rpcChainlistModalTitle = document.getElementById("rpc-chainlist-modal-title");
const rpcChainlistModalSubtitle = document.getElementById("rpc-chainlist-modal-subtitle");
const rpcChainlistStatus = document.getElementById("rpc-chainlist-status");
const rpcChainlistSummary = document.getElementById("rpc-chainlist-summary");
const rpcChainlistCandidateList = document.getElementById("rpc-chainlist-candidate-list");
const rpcChainlistCloseButton = document.getElementById("rpc-chainlist-close-button");
const rpcChainlistCancelButton = document.getElementById("rpc-chainlist-cancel-button");
const rpcChainlistRefreshButton = document.getElementById("rpc-chainlist-refresh-button");
const rpcChainlistApplyButton = document.getElementById("rpc-chainlist-apply-button");
const rpcConfirmModal = document.getElementById("rpc-confirm-modal");
const rpcConfirmCloseButton = document.getElementById("rpc-confirm-close-button");
const rpcConfirmCancelButton = document.getElementById("rpc-confirm-cancel-button");
const rpcConfirmSubmitButton = document.getElementById("rpc-confirm-submit-button");
const rpcConfirmTitle = document.getElementById("rpc-confirm-title");
const rpcConfirmSubtitle = document.getElementById("rpc-confirm-subtitle");
const rpcConfirmName = document.getElementById("rpc-confirm-name");
const rpcConfirmChain = document.getElementById("rpc-confirm-chain");
const rpcConfirmSource = document.getElementById("rpc-confirm-source");
const rpcConfirmLatency = document.getElementById("rpc-confirm-latency");
const rpcConfirmUrl = document.getElementById("rpc-confirm-url");
const rpcConfirmNote = document.getElementById("rpc-confirm-note");
const settingsForm = document.getElementById("settings-form");
const explorerApiKeyInput = document.getElementById("explorer-api-key-input");
const explorerConfigStatus = document.getElementById("explorer-config-status");
const deleteExplorerKeyButton = document.getElementById("delete-explorer-key-button");
const testExplorerKeyButton = document.getElementById("test-explorer-key-button");
const openaiApiKeyInput = document.getElementById("openai-api-key-input");
const openaiConfigStatus = document.getElementById("openai-config-status");
const deleteOpenaiKeyButton = document.getElementById("delete-openai-key-button");
const testOpenaiKeyButton = document.getElementById("test-openai-key-button");
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
const taskClaimIntegrationToggle = document.getElementById("task-claim-integration-toggle");
const taskClaimProjectKeyInput = document.getElementById("task-claim-project-key-input");
const taskClaimFetchToggle = document.getElementById("task-claim-fetch-toggle");
const taskClaimFetchUrlInput = document.getElementById("task-claim-fetch-url-input");
const taskClaimFetchMethodInput = document.getElementById("task-claim-fetch-method-input");
const taskClaimResponseRootInput = document.getElementById("task-claim-response-root-input");
const taskWalletClaimsInput = document.getElementById("task-wallet-claims-input");
const taskClaimFetchHeadersInput = document.getElementById("task-claim-fetch-headers-input");
const taskClaimFetchCookiesInput = document.getElementById("task-claim-fetch-cookies-input");
const taskClaimFetchBodyInput = document.getElementById("task-claim-fetch-body-input");
const taskClaimResponseMappingInput = document.getElementById("task-claim-response-mapping-input");
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
let rpcInspectTimer = null;
let rpcInspectRequestId = 0;
let rpcChainSearchTimer = null;
let rpcDiscoveryRequestId = 0;
let rpcAutoSuggestedName = "";
let activeRpcEditId = null;
let rpcFormGroup = "Custom";
let rpcSelectedChainlistCandidate = null;
let rpcPendingSavePayload = null;
let rpcDiscoveryState = {
  query: "",
  chain: null,
  candidates: [],
  selectedUrls: [],
  loading: false,
  summary: null
};
let rpcAiState = {
  loading: false,
  content: "",
  model: "",
  generatedAt: null
};
let rpcChainlistScan = {
  chainKey: "",
  candidates: [],
  selectedUrl: "",
  loading: false,
  summary: null
};
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

const rpcChainAliases = {
  ethereum: ["ethereum", "eth", "mainnet", "mainnet eth", "eth mainnet"],
  sepolia: ["sepolia", "eth sepolia", "ethereum sepolia"],
  base: ["base", "base mainnet"],
  base_sepolia: ["base sepolia", "base testnet"],
  arbitrum: ["arbitrum", "arb", "arbitrum one"],
  blast: ["blast"],
  shape: ["shape"],
  plasma: ["plasma"]
};

function normalizeChainSearchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left, right) {
  const source = String(left || "");
  const target = String(right || "");
  if (!source) {
    return target.length;
  }
  if (!target) {
    return source.length;
  }

  const rows = Array.from({ length: source.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= target.length; column += 1) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const substitutionCost = source[row - 1] === target[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return rows[source.length][target.length];
}

function chainSearchTerms(chain) {
  const aliases = rpcChainAliases[chain.key] || [];
  return [
    chain.key,
    chain.label,
    chain.label.replace(/\bmainnet\b/gi, ""),
    chain.label.replace(/\bone\b/gi, ""),
    ...aliases
  ]
    .map((term) => normalizeChainSearchValue(term))
    .filter(Boolean);
}

function resolveRpcChainQuery(query) {
  const normalizedQuery = normalizeChainSearchValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const availableChains = state.chains.length ? state.chains : [];
  let bestMatch = null;

  availableChains.forEach((chain) => {
    const terms = [...new Set(chainSearchTerms(chain))];
    terms.forEach((term) => {
      let score = Infinity;
      let mode = "none";

      if (term === normalizedQuery) {
        score = 0;
        mode = "exact";
      } else if (term.startsWith(normalizedQuery) || normalizedQuery.startsWith(term)) {
        score = 1 + Math.abs(term.length - normalizedQuery.length) / 100;
        mode = "prefix";
      } else if (term.includes(normalizedQuery) || normalizedQuery.includes(term)) {
        score = 2 + Math.abs(term.length - normalizedQuery.length) / 100;
        mode = "contains";
      } else {
        const compactTerm = term.replace(/\s+/g, "");
        const compactQuery = normalizedQuery.replace(/\s+/g, "");
        const distance = levenshteinDistance(compactTerm, compactQuery);
        const threshold = Math.max(1, Math.ceil(Math.max(compactTerm.length, compactQuery.length) * 0.22));
        if (distance > threshold) {
          return;
        }

        score = 3 + distance / 10;
        mode = "fuzzy";
      }

      if (
        !bestMatch ||
        score < bestMatch.score ||
        (score === bestMatch.score && term.length < bestMatch.term.length)
      ) {
        bestMatch = { chain, term, score, mode };
      }
    });
  });

  return bestMatch;
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
      state.taskStatusFilter === "all" ||
      (state.taskStatusFilter === "done" ? Boolean(task.done) : task.status === state.taskStatusFilter);

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

function isRpcEditMode() {
  return Boolean(activeRpcEditId);
}

function defaultRpcDetectMessage() {
  return isRpcEditMode()
    ? "Editing stored node. Update the URL to re-detect its chain."
    : "Type an EVM chain name and the dashboard will scan fast Chainlist RPCs you can keep or uncheck.";
}

function setRpcDetectMessage(message) {
  if (!rpcDetectStatus) {
    return;
  }

  rpcDetectStatus.textContent = message || defaultRpcDetectMessage();
}

function maybeApplySuggestedRpcName(nameSuggestion) {
  const suggested = String(nameSuggestion || "").trim();
  if (!suggested) {
    return false;
  }

  const currentName = rpcNameInput.value.trim();
  if (!currentName || currentName === rpcAutoSuggestedName) {
    rpcNameInput.value = suggested;
    rpcAutoSuggestedName = suggested;
    return true;
  }

  return false;
}

function formatLatencyLabel(latencyMs) {
  const normalized = Number(latencyMs);
  return Number.isFinite(normalized) ? `${Math.round(normalized)}ms` : "Untested";
}

function healthyRpcDiscoveryCandidates() {
  return (rpcDiscoveryState.candidates || []).filter((candidate) => candidate.lastHealth?.status === "healthy");
}

function selectedRpcDiscoveryCandidates() {
  const selectedUrls = new Set(rpcDiscoveryState.selectedUrls || []);
  return healthyRpcDiscoveryCandidates().filter((candidate) => selectedUrls.has(candidate.url));
}

function updateRpcSubmitButton() {
  if (isRpcEditMode()) {
    rpcSubmitButton.textContent = "Update RPC Node";
    rpcSubmitButton.disabled = false;
    rpcImportChainlistButton.disabled = false;
    return;
  }

  const selectedCount = selectedRpcDiscoveryCandidates().length;
  rpcSubmitButton.textContent = selectedCount > 0 ? `Add ${pluralize(selectedCount, "RPC Node")}` : "Add Selected RPCs";
  rpcSubmitButton.disabled = selectedCount === 0 || rpcDiscoveryState.loading;
  rpcImportChainlistButton.disabled = rpcDiscoveryState.loading || !rpcChainSearchInput.value.trim();
}

function renderRpcDiscoveryMatch(match = rpcDiscoveryState.chain ? resolveRpcChainQuery(rpcChainSearchInput.value) : null) {
  if (!rpcSearchMatch) {
    return;
  }

  if (isRpcEditMode()) {
    rpcSearchMatch.classList.add("hidden");
    rpcSearchMatch.innerHTML = "";
    return;
  }

  if (!match?.chain) {
    rpcSearchMatch.classList.add("hidden");
    rpcSearchMatch.innerHTML = "";
    return;
  }

  const normalizedInput = normalizeChainSearchValue(rpcChainSearchInput.value);
  const chips = [`Matched ${match.chain.label}`];
  if (match.term && match.term !== normalizedInput) {
    chips.push(`Alias: ${match.term}`);
  }
  if (match.mode === "fuzzy") {
    chips.push("Fuzzy match");
  }

  rpcSearchMatch.classList.remove("hidden");
  rpcSearchMatch.innerHTML = chips.map((chip) => `<span class="queue-chip">${escapeHtml(chip)}</span>`).join("");
}

function renderRpcDiscoverySummary() {
  if (isRpcEditMode()) {
    rpcInlineSummary.classList.add("hidden");
    rpcInlineSummary.innerHTML = "";
    rpcInlineSelectionStatus.classList.add("hidden");
    rpcInlineSelectionStatus.textContent = "";
    return;
  }

  const summary = rpcDiscoveryState.summary;
  if (!summary) {
    rpcInlineSummary.classList.add("hidden");
    rpcInlineSummary.innerHTML = "";
  } else {
    const chips = [
      `${Number(summary.published || 0)} published`,
      `${Number(summary.probed || 0)} probed`,
      `${Number(summary.healthy || 0)} healthy`,
      Number(summary.skippedExisting || 0) > 0 ? `${Number(summary.skippedExisting)} already saved` : null,
      Number(summary.skippedProbeBudget || 0) > 0 ? `${Number(summary.skippedProbeBudget)} unprobed` : null
    ].filter(Boolean);

    rpcInlineSummary.classList.toggle("hidden", chips.length === 0);
    rpcInlineSummary.innerHTML = chips.map((chip) => `<span class="queue-chip">${escapeHtml(chip)}</span>`).join("");
  }

  const visibleCount = healthyRpcDiscoveryCandidates().length;
  const selectedCount = selectedRpcDiscoveryCandidates().length;
  if (visibleCount === 0) {
    rpcInlineSelectionStatus.classList.add("hidden");
    rpcInlineSelectionStatus.textContent = "";
  } else {
    rpcInlineSelectionStatus.classList.remove("hidden");
    rpcInlineSelectionStatus.textContent = `${pluralize(selectedCount, "RPC node")} selected from ${pluralize(visibleCount, "healthy result")}.`;
  }
}

function renderRpcDiscoveryCandidates() {
  if (isRpcEditMode()) {
    rpcInlineCandidateList.innerHTML = "";
    updateRpcSubmitButton();
    return;
  }

  if (rpcDiscoveryState.loading) {
    const chainLabelCopy = rpcDiscoveryState.chain?.label || "this chain";
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>Scanning ${escapeHtml(chainLabelCopy)}</h3>
        <p>Checking Chainlist endpoints for healthy responses and low latency.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  const query = String(rpcDiscoveryState.query || "").trim();
  if (!query) {
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>Search a chain</h3>
        <p>Type Ethereum, Base, Sepolia, Arbitrum, Blast, Shape, or Plasma to scan healthy RPCs.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  if (!rpcDiscoveryState.chain) {
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>No supported chain match</h3>
        <p>Try Ethereum, ETH, Base, Base Sepolia, Sepolia, Arbitrum, Blast, Shape, or Plasma.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  const candidates = healthyRpcDiscoveryCandidates();
  if (candidates.length === 0) {
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>No healthy RPCs ready</h3>
        <p>The live probe did not find a healthy low-latency endpoint for ${escapeHtml(rpcDiscoveryState.chain.label)}.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  const selectedUrls = new Set(rpcDiscoveryState.selectedUrls || []);
  rpcInlineCandidateList.innerHTML = candidates
    .map((candidate) => {
      const isSelected = selectedUrls.has(candidate.url);
      const rankingChip = candidate.recommended ? "Recommended" : `Rank #${candidate.rank || "?"}`;

      return `
        <label class="rpc-candidate-card ${isSelected ? "selected" : ""}">
          <div class="rpc-candidate-head">
            <div class="rpc-candidate-select">
              <input
                type="checkbox"
                data-rpc-discovery-toggle="${escapeHtml(candidate.url)}"
                ${isSelected ? "checked" : ""}
              />
            </div>
            <div class="rpc-candidate-copy">
              <div class="rpc-node-title-row">
                <strong>${escapeHtml(candidate.name || "Chainlist RPC")}</strong>
                ${rpcHealthMarkup(candidate)}
              </div>
              <div class="chip-row">
                <span class="queue-chip">${escapeHtml(candidate.chainLabel || rpcDiscoveryState.chain.label)}</span>
                <span class="queue-chip">${escapeHtml(rankingChip)}</span>
                <span class="queue-chip">${escapeHtml(formatLatencyLabel(candidate.lastHealth?.latencyMs))}</span>
              </div>
              <p class="rpc-node-url">${escapeHtml(candidate.url)}</p>
              <p class="muted-copy rpc-candidate-detail">${escapeHtml(rpcHealthDetail(candidate))}</p>
            </div>
          </div>
        </label>
      `;
    })
    .join("");

  rpcInlineCandidateList.querySelectorAll("[data-rpc-discovery-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = new Set(rpcDiscoveryState.selectedUrls || []);
      if (input.checked) {
        selected.add(input.dataset.rpcDiscoveryToggle);
      } else {
        selected.delete(input.dataset.rpcDiscoveryToggle);
      }

      rpcDiscoveryState.selectedUrls = [...selected];
      renderRpcDiscoveryCandidates();
    });
  });

  renderRpcDiscoverySummary();
  updateRpcSubmitButton();
}

function clearRpcDiscoveryState(options = {}) {
  const { preserveQuery = false } = options;
  if (rpcChainSearchTimer) {
    clearTimeout(rpcChainSearchTimer);
    rpcChainSearchTimer = null;
  }

  rpcDiscoveryRequestId += 1;
  rpcDiscoveryState = {
    query: preserveQuery ? String(rpcChainSearchInput.value || "").trim() : "",
    chain: null,
    candidates: [],
    selectedUrls: [],
    loading: false,
    summary: null
  };

  if (!preserveQuery) {
    rpcChainSearchInput.value = "";
  }

  renderRpcDiscoveryMatch(null);
  renderRpcDiscoveryCandidates();
}

async function runRpcDiscoveryScan(options = {}) {
  const { forceRefresh = false } = options;
  if (isRpcEditMode()) {
    return;
  }

  const query = String(rpcChainSearchInput.value || "").trim();
  const normalizedQuery = normalizeChainSearchValue(query);
  rpcDiscoveryState.query = query;

  if (!normalizedQuery) {
    clearRpcDiscoveryState();
    setRpcDetectMessage();
    updateRpcSubmitButton();
    return;
  }

  if (normalizedQuery.length < 2) {
    clearRpcDiscoveryState({ preserveQuery: true });
    setRpcDetectMessage("Keep typing the chain name to start the RPC scan.");
    updateRpcSubmitButton();
    return;
  }

  const match = resolveRpcChainQuery(query);
  renderRpcDiscoveryMatch(match);
  if (!match?.chain) {
    clearRpcDiscoveryState({ preserveQuery: true });
    setRpcDetectMessage(`No supported EVM chain matched "${query}". Try Ethereum, ETH, Base, or Arbitrum.`);
    updateRpcSubmitButton();
    return;
  }

  const requestId = ++rpcDiscoveryRequestId;
  const priorSelection = match.chain.key === rpcDiscoveryState.chain?.key ? new Set(rpcDiscoveryState.selectedUrls || []) : new Set();
  rpcDiscoveryState = {
    query,
    chain: match.chain,
    candidates: [],
    selectedUrls: [],
    loading: true,
    summary: null
  };
  rpcChainInput.value = match.chain.key;
  rpcFormGroup = "Chainlist";
  setRpcDetectMessage(`Scanning fast Chainlist RPCs for ${match.chain.label}...`);
  renderRpcDiscoveryCandidates();

  try {
    const payload = await request("/api/rpc-nodes/chainlist-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainKey: match.chain.key,
        limit: 8,
        probeBudget: 20,
        forceRefresh
      }),
      quiet: true
    });

    if (requestId !== rpcDiscoveryRequestId) {
      return;
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const healthyUrls = candidates
      .filter((candidate) => candidate.lastHealth?.status === "healthy")
      .map((candidate) => candidate.url);
    const selectedUrls = healthyUrls.filter((url) => priorSelection.has(url));

    rpcDiscoveryState = {
      query,
      chain: match.chain,
      candidates,
      selectedUrls: selectedUrls.length > 0 ? selectedUrls : healthyUrls,
      loading: false,
      summary: payload
    };

    const healthyCount = Number(payload.healthy || 0);
    setRpcDetectMessage(
      healthyCount > 0
        ? `${match.chain.label} matched. The recommended RPC is highlighted, and all healthy results are preselected so you can uncheck any you do not want.`
        : `${match.chain.label} matched, but no healthy RPC endpoints passed the live probe.`
    );
  } catch {
    if (requestId !== rpcDiscoveryRequestId) {
      return;
    }

    rpcDiscoveryState = {
      query,
      chain: match.chain,
      candidates: [],
      selectedUrls: [],
      loading: false,
      summary: null
    };
    setRpcDetectMessage(`RPC scan failed for ${match.chain.label}. Try Refresh Scan in a moment.`);
  }

  renderRpcDiscoveryCandidates();
}

function scheduleRpcDiscoveryScan(options = {}) {
  const { immediate = false, forceRefresh = false } = options;
  if (rpcChainSearchTimer) {
    clearTimeout(rpcChainSearchTimer);
    rpcChainSearchTimer = null;
  }

  if (immediate) {
    void runRpcDiscoveryScan({ forceRefresh });
    return;
  }

  rpcChainSearchTimer = window.setTimeout(() => {
    rpcChainSearchTimer = null;
    void runRpcDiscoveryScan({ forceRefresh });
  }, 450);
}

async function submitRpcDiscoverySelection() {
  const selectedCandidates = selectedRpcDiscoveryCandidates();
  if (selectedCandidates.length === 0) {
    showToast("Choose at least one healthy RPC before saving.", "info", "RPC Selection");
    return;
  }

  const buttonLabel = rpcSubmitButton.textContent;
  rpcSubmitButton.disabled = true;
  rpcSubmitButton.textContent = "Adding RPCs...";

  let savedCount = 0;
  const failures = [];

  for (const candidate of selectedCandidates) {
    try {
      await request("/api/rpc-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.name,
          chainKey: candidate.chainKey,
          url: candidate.url,
          group: "Chainlist"
        }),
        quiet: true
      });
      savedCount += 1;
    } catch (error) {
      failures.push({ candidate, error });
    }
  }

  try {
    await loadState();
    populateChainSelectors();
  } catch {}

  if (rpcChainSearchInput.value.trim()) {
    await runRpcDiscoveryScan();
  } else {
    renderRpcDiscoveryCandidates();
  }

  rpcSubmitButton.disabled = false;
  rpcSubmitButton.textContent = buttonLabel;
  updateRpcSubmitButton();

  if (savedCount > 0 && failures.length === 0) {
    showToast(`${savedCount} RPC node${savedCount === 1 ? "" : "s"} added from the live scan.`, "success", "RPC Added");
    return;
  }

  if (savedCount > 0) {
    showToast(
      `${savedCount} saved, ${failures.length} failed. The remaining healthy RPCs are still listed below.`,
      "info",
      "Partial RPC Import"
    );
    return;
  }

  showToast("No RPC nodes were added from the current selection.", "error", "RPC Save Failed");
}

function resetRpcForm(options = {}) {
  const { preserveSearch = false } = options;
  activeRpcEditId = null;
  rpcAutoSuggestedName = "";
  rpcFormGroup = "Custom";
  rpcSelectedChainlistCandidate = null;
  rpcFormTitle.textContent = "Discovery Lab";
  rpcFormSubtitle.textContent = "Scan low-latency RPCs, stack healthy fallbacks, and deepen the mint mesh chain by chain.";
  rpcFormBadge.classList.add("hidden");
  rpcCancelButton.classList.add("hidden");
  rpcImportChainlistButton.classList.remove("hidden");
  rpcImportChainlistButton.textContent = "Deep Scan Chainlist";
  rpcChainSearchField.classList.remove("hidden");
  rpcManualFields.classList.add("hidden");
  rpcInlineSummary.classList.remove("hidden");
  rpcInlineCandidateList.classList.remove("hidden");

  rpcNameInput.value = "";
  rpcUrlInput.value = "";
  rpcAutoSuggestedName = "";

  if (!preserveSearch) {
    clearRpcDiscoveryState();
  } else {
    clearRpcDiscoveryState({ preserveQuery: true });
    if (rpcChainSearchInput.value.trim()) {
      void runRpcDiscoveryScan();
    }
  }

  setRpcDetectMessage();
  updateRpcSubmitButton();
}

function startRpcEdit(node) {
  if (!node || node.source === "env") {
    return;
  }

  activeRpcEditId = node.id;
  rpcFormGroup = node.group || "Custom";
  rpcSelectedChainlistCandidate = null;
  rpcFormTitle.textContent = "Edit RPC Node";
  rpcFormSubtitle.textContent = "Correct the chain, label, or endpoint URL for this stored node.";
  rpcFormBadge.classList.remove("hidden");
  rpcCancelButton.classList.remove("hidden");
  rpcImportChainlistButton.classList.add("hidden");
  rpcChainSearchField.classList.add("hidden");
  rpcSearchMatch.classList.add("hidden");
  rpcManualFields.classList.remove("hidden");
  rpcInlineSummary.classList.add("hidden");
  rpcInlineSelectionStatus.classList.add("hidden");
  rpcInlineCandidateList.classList.add("hidden");
  rpcNameInput.value = node.name || "";
  rpcChainInput.value = node.chainKey || rpcChainInput.value;
  rpcUrlInput.value = node.url || "";
  rpcAutoSuggestedName = "";
  setRpcDetectMessage();
  updateRpcSubmitButton();
  rpcNameInput.focus();
  rpcForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearSelectedChainlistCandidate(options = {}) {
  const { preserveGroup = false } = options;
  rpcSelectedChainlistCandidate = null;
  if (!preserveGroup && !activeRpcEditId) {
    rpcFormGroup = "Custom";
  }
}

function syncSelectedChainlistCandidateWithForm() {
  if (!rpcSelectedChainlistCandidate) {
    return;
  }

  const currentUrl = String(rpcUrlInput.value || "").trim();
  const selectedUrl = String(rpcSelectedChainlistCandidate.url || "").trim();
  if (currentUrl && currentUrl === selectedUrl) {
    return;
  }

  clearSelectedChainlistCandidate();
}

function selectedChainlistCandidate() {
  return (
    rpcChainlistScan.candidates.find((candidate) => candidate.url === rpcChainlistScan.selectedUrl) || null
  );
}

function setRpcChainlistStatus(message) {
  if (!rpcChainlistStatus) {
    return;
  }

  rpcChainlistStatus.textContent =
    message || "Choose a chain, then scan Chainlist to compare healthy RPC endpoints.";
}

function renderRpcChainlistSummary() {
  if (!rpcChainlistSummary) {
    return;
  }

  const summary = rpcChainlistScan.summary;
  if (!summary) {
    rpcChainlistSummary.classList.add("hidden");
    rpcChainlistSummary.innerHTML = "";
    return;
  }

  const chips = [
    `${Number(summary.published || 0)} published`,
    `${Number(summary.probed || 0)} probed`,
    `${Number(summary.healthy || 0)} healthy`,
    Number(summary.skippedExisting || 0) > 0 ? `${Number(summary.skippedExisting)} already saved` : null,
    Number(summary.skippedProbeBudget || 0) > 0 ? `${Number(summary.skippedProbeBudget)} unprobed` : null
  ].filter(Boolean);

  rpcChainlistSummary.classList.remove("hidden");
  rpcChainlistSummary.innerHTML = chips
    .map((chip) => `<span class="queue-chip">${escapeHtml(chip)}</span>`)
    .join("");
}

function renderRpcChainlistCandidates() {
  if (!rpcChainlistCandidateList) {
    return;
  }

  const chainKey = rpcChainlistScan.chainKey || rpcChainInput.value;
  const chainLabelCopy = chainLabel(chainKey);

  if (rpcChainlistScan.loading) {
    rpcChainlistCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>Scanning ${escapeHtml(chainLabelCopy)}</h3>
        <p>Checking Chainlist endpoints for healthy responses and low latency.</p>
      </div>
    `;
    rpcChainlistApplyButton.disabled = true;
    return;
  }

  if (rpcChainlistScan.candidates.length === 0) {
    rpcChainlistCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>No candidates ready</h3>
        <p>Run a Chainlist scan to compare live RPC endpoints for this chain.</p>
      </div>
    `;
    rpcChainlistApplyButton.disabled = true;
    return;
  }

  rpcChainlistCandidateList.innerHTML = rpcChainlistScan.candidates
    .map((candidate) => {
      const isHealthy = candidate.lastHealth?.status === "healthy";
      const isSelected = candidate.url === rpcChainlistScan.selectedUrl;
      const rankingChip = candidate.recommended ? "Fastest healthy" : `Rank #${candidate.rank || "?"}`;

      return `
        <button
          class="rpc-candidate-card ${escapeHtml(candidate.lastHealth?.status || "untested")} ${isSelected ? "selected" : ""}"
          type="button"
          data-rpc-chainlist-select="${escapeHtml(candidate.url)}"
          ${isHealthy ? "" : "disabled"}
        >
          <div class="rpc-candidate-head">
            <div class="rpc-candidate-copy">
              <div class="rpc-node-title-row">
                <strong>${escapeHtml(candidate.name || "Chainlist RPC")}</strong>
                ${rpcHealthMarkup(candidate)}
              </div>
              <div class="chip-row">
                <span class="queue-chip">${escapeHtml(candidate.chainLabel || chainLabelCopy)}</span>
                <span class="queue-chip">${escapeHtml(rankingChip)}</span>
                <span class="queue-chip">${escapeHtml("Chainlist")}</span>
              </div>
              <p class="rpc-node-url">${escapeHtml(candidate.url)}</p>
              <p class="muted-copy rpc-candidate-detail">${escapeHtml(rpcHealthDetail(candidate))}</p>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  rpcChainlistCandidateList.querySelectorAll("[data-rpc-chainlist-select]").forEach((button) => {
    button.addEventListener("click", () => {
      rpcChainlistScan.selectedUrl = button.dataset.rpcChainlistSelect;
      renderRpcChainlistCandidates();
    });
  });

  const candidate = selectedChainlistCandidate();
  rpcChainlistApplyButton.disabled = !candidate || candidate.lastHealth?.status !== "healthy";
}

function closeRpcChainlistModal() {
  if (!rpcChainlistModal) {
    return;
  }

  rpcChainlistModal.classList.add("hidden");
}

async function loadChainlistRpcCandidates(options = {}) {
  const { forceRefresh = false } = options;
  const chainKey = rpcChainInput.value;
  if (!chainKey) {
    showToast("Choose a chain before scanning Chainlist RPCs.", "info", "Chain Required");
    return;
  }

  const chainLabelCopy = chainLabel(chainKey);
  rpcChainlistScan = {
    chainKey,
    candidates: [],
    selectedUrl: "",
    loading: true,
    summary: null
  };
  rpcChainlistModalTitle.textContent = `${chainLabelCopy} Chainlist RPC Scan`;
  rpcChainlistModalSubtitle.textContent =
    "Probe published endpoints, rank them by live latency, and choose which RPC to stage.";
  rpcChainlistRefreshButton.disabled = true;
  rpcChainlistApplyButton.disabled = true;
  setRpcChainlistStatus(`Scanning Chainlist RPCs for ${chainLabelCopy}...`);
  renderRpcChainlistSummary();
  renderRpcChainlistCandidates();

  try {
    const payload = await request("/api/rpc-nodes/chainlist-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainKey,
        limit: 8,
        probeBudget: 20,
        forceRefresh
      })
    });

    rpcChainlistScan = {
      chainKey,
      candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
      selectedUrl: "",
      loading: false,
      summary: payload
    };

    const firstHealthyCandidate = rpcChainlistScan.candidates.find(
      (candidate) => candidate.lastHealth?.status === "healthy"
    );
    if (firstHealthyCandidate) {
      rpcChainlistScan.selectedUrl = firstHealthyCandidate.url;
    }

    renderRpcChainlistSummary();
    renderRpcChainlistCandidates();

    const healthyCount = Number(payload.healthy || 0);
    setRpcChainlistStatus(
      healthyCount > 0
        ? `Found ${healthyCount} healthy Chainlist RPC ${healthyCount === 1 ? "endpoint" : "endpoints"} for ${chainLabelCopy}. Select one to stage in the form.`
        : `Chainlist scan finished for ${chainLabelCopy}, but no healthy RPC endpoints passed the live probe.`
    );
  } catch {
    rpcChainlistScan = {
      chainKey,
      candidates: [],
      selectedUrl: "",
      loading: false,
      summary: null
    };
    renderRpcChainlistSummary();
    renderRpcChainlistCandidates();
    setRpcChainlistStatus(`Chainlist scan failed for ${chainLabelCopy}. You can still add an RPC manually.`);
  } finally {
    rpcChainlistRefreshButton.disabled = false;
  }
}

async function openRpcChainlistModal() {
  const chainKey = rpcChainInput.value;
  if (!chainKey) {
    showToast("Choose a chain before scanning Chainlist RPCs.", "info", "Chain Required");
    return;
  }

  rpcChainlistModal.classList.remove("hidden");
  initializeMotionSurfaces(rpcChainlistModal);
  await loadChainlistRpcCandidates();
}

function applySelectedChainlistRpc() {
  const candidate = selectedChainlistCandidate();
  if (!candidate || candidate.lastHealth?.status !== "healthy") {
    showToast("Select a healthy Chainlist RPC before staging it.", "info", "RPC Selection");
    return;
  }

  ensureChainOption({
    key: candidate.chainKey,
    label: candidate.chainLabel,
    chainId: candidate.chainId
  });
  rpcFormGroup = "Chainlist";
  rpcSelectedChainlistCandidate = candidate;
  rpcChainInput.value = candidate.chainKey;
  rpcUrlInput.value = candidate.url;
  rpcNameInput.value = candidate.name || "";
  rpcAutoSuggestedName = candidate.name || "";
  setRpcDetectMessage(
    `Staged ${candidate.name || "Chainlist RPC"} from Chainlist with observed latency ${formatLatencyLabel(candidate.lastHealth?.latencyMs)}. Confirm the save when you're ready.`
  );
  closeRpcChainlistModal();
  rpcForm.scrollIntoView({ behavior: "smooth", block: "start" });
  rpcNameInput.focus();
  showToast(
    `${candidate.name || "Chainlist RPC"} is staged in the form. Save it to add this endpoint.`,
    "success",
    "RPC Staged"
  );
}

function buildRpcSavePayload() {
  return {
    id: activeRpcEditId || undefined,
    name: rpcNameInput.value,
    chainKey: rpcChainInput.value,
    url: rpcUrlInput.value,
    group: rpcFormGroup || "Custom"
  };
}

function closeRpcConfirmModal() {
  if (!rpcConfirmModal) {
    return;
  }

  rpcPendingSavePayload = null;
  rpcConfirmModal.classList.add("hidden");
}

function openRpcConfirmModal(payload) {
  const pendingPayload = payload || buildRpcSavePayload();
  const selectedCandidate =
    rpcSelectedChainlistCandidate &&
    String(rpcSelectedChainlistCandidate.url || "").trim() === String(pendingPayload.url || "").trim()
      ? rpcSelectedChainlistCandidate
      : null;
  const sourceLabelCopy =
    pendingPayload.group === "Chainlist"
      ? "Chainlist scan"
      : activeRpcEditId
        ? "Manual update"
        : "Custom entry";

  rpcPendingSavePayload = pendingPayload;
  rpcConfirmTitle.textContent = activeRpcEditId ? "Confirm RPC Update" : "Confirm RPC Save";
  rpcConfirmSubtitle.textContent = activeRpcEditId
    ? "Review the updated endpoint before saving it back into the failover mesh."
    : "Review the selected endpoint before it is added to the failover mesh.";
  rpcConfirmName.textContent = pendingPayload.name?.trim() || "Auto-name from RPC inspection";
  rpcConfirmChain.textContent = chainLabel(pendingPayload.chainKey) || "Auto-detect on save";
  rpcConfirmSource.textContent = sourceLabelCopy;
  rpcConfirmLatency.textContent = selectedCandidate
    ? formatLatencyLabel(selectedCandidate.lastHealth?.latencyMs)
    : "Fresh check on save";
  rpcConfirmUrl.textContent = pendingPayload.url?.trim() || "-";
  rpcConfirmNote.textContent = selectedCandidate
    ? "A fresh inspection will run again on save so the stored node keeps an up-to-date latency snapshot."
    : "We will validate the RPC, auto-detect its chain, and save the latest latency snapshot.";
  rpcConfirmSubmitButton.textContent = activeRpcEditId ? "Confirm and Update" : "Confirm and Save";
  rpcConfirmModal.classList.remove("hidden");
  initializeMotionSurfaces(rpcConfirmModal);
}

async function submitConfirmedRpcSave() {
  if (!rpcPendingSavePayload) {
    return;
  }

  const payload = rpcPendingSavePayload;
  const wasEditing = Boolean(activeRpcEditId);
  const buttonLabel = rpcConfirmSubmitButton.textContent;
  rpcConfirmSubmitButton.disabled = true;
  rpcConfirmSubmitButton.textContent = wasEditing ? "Updating..." : "Saving...";

  try {
    await request("/api/rpc-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    closeRpcConfirmModal();
    resetRpcForm();
    showToast(
      wasEditing ? "RPC node updated successfully." : "RPC node saved to the mesh.",
      "success",
      wasEditing ? "RPC Updated" : "RPC Added"
    );
  } catch {
    rpcConfirmSubmitButton.disabled = false;
    rpcConfirmSubmitButton.textContent = buttonLabel;
    return;
  }

  rpcConfirmSubmitButton.disabled = false;
  rpcConfirmSubmitButton.textContent = buttonLabel;
}

async function inspectRpcUrl(url, options = {}) {
  const { immediate = false } = options;
  const normalizedUrl = String(url || "").trim();

  if (rpcInspectTimer) {
    clearTimeout(rpcInspectTimer);
    rpcInspectTimer = null;
  }

  if (!normalizedUrl) {
    rpcInspectRequestId += 1;
    rpcNameInput.value = "";
    rpcAutoSuggestedName = "";
    setRpcDetectMessage();
    return;
  }

  const runInspection = async () => {
    const requestId = ++rpcInspectRequestId;
    setRpcDetectMessage("Inspecting RPC endpoint...");

    try {
      const payload = await request("/api/rpc-nodes/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
        quiet: true
      });

      if (requestId !== rpcInspectRequestId) {
        return;
      }

      if (payload.chainKey && payload.chainLabel && payload.chainId != null) {
        ensureChainOption({
          key: payload.chainKey,
          label: payload.chainLabel,
          chainId: payload.chainId
        });
        rpcChainInput.value = payload.chainKey;
      }

      const appliedName = maybeApplySuggestedRpcName(payload.nameSuggestion);
      const chainCopy = payload.chainLabel
        ? `Detected ${payload.chainLabel} (chain ID ${payload.chainId}).`
        : `Detected chain ID ${payload.chainId}.`;
      const nameCopy =
        appliedName && payload.nameSuggestion ? ` Suggested name: ${payload.nameSuggestion}.` : "";
      setRpcDetectMessage(`${chainCopy}${nameCopy}`);
    } catch {
      if (requestId !== rpcInspectRequestId) {
        return;
      }

      setRpcDetectMessage("Unable to auto-detect this RPC. You can still choose the chain manually.");
    }
  };

  if (immediate) {
    await runInspection();
    return;
  }

  rpcInspectTimer = setTimeout(() => {
    rpcInspectTimer = null;
    void runInspection();
  }, 350);
}

function isSocketRpcUrl(url) {
  return /^wss?:\/\//i.test(String(url || "").trim());
}

function rpcLatencyValue(node) {
  const latency = Number(node?.lastHealth?.latencyMs);
  return Number.isFinite(latency) ? latency : Infinity;
}

function rpcStatusRank(node) {
  if (node?.lastHealth?.status === "healthy") {
    return 0;
  }

  if (!node?.lastHealth) {
    return 1;
  }

  if (node.lastHealth.status === "untested" || node.lastHealth.status === "unknown") {
    return 2;
  }

  return 3;
}

function sortRpcNodesForMinting(nodes = []) {
  return [...nodes].sort((left, right) => {
    const statusDelta = rpcStatusRank(left) - rpcStatusRank(right);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const latencyDelta = rpcLatencyValue(left) - rpcLatencyValue(right);
    if (latencyDelta !== 0) {
      return latencyDelta;
    }

    const socketDelta = Number(isSocketRpcUrl(right?.url)) - Number(isSocketRpcUrl(left?.url));
    if (socketDelta !== 0) {
      return socketDelta;
    }

    const freshnessDelta =
      new Date(right?.lastHealth?.checkedAt || 0).getTime() -
      new Date(left?.lastHealth?.checkedAt || 0).getTime();
    if (freshnessDelta !== 0) {
      return freshnessDelta;
    }

    return String(left?.name || "").localeCompare(String(right?.name || ""));
  });
}

function rpcHostname(url) {
  try {
    return new URL(String(url || "")).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function rpcProviderLabel(node) {
  const hostname = rpcHostname(node?.url);
  const firstLabel = (hostname.split(".")[0] || "")
    .replace(/[-_]/g, " ")
    .replace(/\brpc\b/gi, "")
    .trim();
  if (!firstLabel) {
    return hostname || "Unknown provider";
  }

  return firstLabel
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

function chainTaskDemand(chainKey) {
  const tasks = state.tasks.filter((task) => task.chainKey === chainKey);
  return {
    total: tasks.length,
    live: tasks.filter((task) => ["running", "queued"].includes(task.status)).length,
    multiRpcBroadcast: tasks.filter((task) => task.multiRpcBroadcast).length,
    mempool: tasks.filter((task) => task.executionTriggerMode === "mempool").length,
    relay: tasks.filter((task) => task.privateRelayEnabled).length
  };
}

function activeRpcChainKeys() {
  const chainKeys = new Set([
    ...state.rpcNodes.map((node) => node.chainKey),
    ...state.tasks.map((task) => task.chainKey),
    rpcDiscoveryState.chain?.key || ""
  ]);

  return [...chainKeys].filter(Boolean);
}

function buildRpcChainGroups() {
  return activeRpcChainKeys()
    .map((chainKey) => {
      const nodes = sortRpcNodesForMinting(state.rpcNodes.filter((node) => node.chainKey === chainKey));
      const healthyNodes = nodes.filter((node) => node.lastHealth?.status === "healthy");
      const socketNodes = nodes.filter((node) => isSocketRpcUrl(node.url));
      const healthySocketNodes = healthyNodes.filter((node) => isSocketRpcUrl(node.url));
      const demand = chainTaskDemand(chainKey);
      const freshHealthyCount = healthyNodes.filter((node) => {
        const checkedAt = new Date(node.lastHealth?.checkedAt || 0).getTime();
        return checkedAt > 0 && Date.now() - checkedAt <= 15 * 60 * 1000;
      }).length;
      const maxLatency = Math.max(
        1,
        ...healthyNodes
          .map((node) => rpcLatencyValue(node))
          .filter((latency) => Number.isFinite(latency))
      );

      let readinessTone = "error";
      let readinessLabel = "No healthy mesh";

      if (healthyNodes.length >= 3) {
        readinessTone = "healthy";
        readinessLabel = demand.mempool > 0 && healthySocketNodes.length > 0 ? "Sniper-ready mesh" : "Broadcast mesh ready";
      } else if (healthyNodes.length >= 2) {
        readinessTone = "warming";
        readinessLabel = healthySocketNodes.length > 0 ? "Broadcast ready" : "Mesh ready, no socket edge";
      } else if (healthyNodes.length === 1) {
        readinessTone = "warming";
        readinessLabel = "Single-node risk";
      }

      return {
        chainKey,
        chainLabel: chainLabel(chainKey),
        demand,
        nodes,
        healthyNodes,
        socketNodes,
        healthySocketNodes,
        primaryNode: healthyNodes[0] || nodes[0] || null,
        fallbackNode: healthyNodes[1] || null,
        readinessTone,
        readinessLabel,
        freshHealthyCount,
        maxLatency
      };
    })
    .sort((left, right) => {
      const leftDemandScore =
        left.demand.live * 4 + left.demand.total * 2 + left.demand.mempool * 2 + left.demand.relay;
      const rightDemandScore =
        right.demand.live * 4 + right.demand.total * 2 + right.demand.mempool * 2 + right.demand.relay;
      if (leftDemandScore !== rightDemandScore) {
        return rightDemandScore - leftDemandScore;
      }

      const readinessRank = { healthy: 0, warming: 1, error: 2 };
      const readinessDelta = readinessRank[left.readinessTone] - readinessRank[right.readinessTone];
      if (readinessDelta !== 0) {
        return readinessDelta;
      }

      return left.chainLabel.localeCompare(right.chainLabel);
    });
}

function chainReadinessChipClass(group) {
  if (group.readinessTone === "healthy") {
    return "armed";
  }

  if (group.readinessTone === "error") {
    return "blocked";
  }

  return "warming";
}

function mintRoleLabel(node, group, index) {
  if (!node) {
    return "Unassigned";
  }

  const healthy = node.lastHealth?.status === "healthy";
  if (!healthy) {
    return "Recovery Candidate";
  }

  if (index === 0 && isSocketRpcUrl(node.url) && group.demand.mempool > 0) {
    return "Primary + Mempool";
  }

  if (index === 0) {
    return "Primary Broadcast";
  }

  if (index === 1) {
    return "Hot Failover";
  }

  if (isSocketRpcUrl(node.url)) {
    return "Mempool Watch";
  }

  return "Deep Fallback";
}

function latencyFillWidth(node, group) {
  const latency = rpcLatencyValue(node);
  if (!Number.isFinite(latency)) {
    return 14;
  }

  const maxLatency = Math.max(group?.maxLatency || latency, latency, 1);
  return Math.max(14, Math.round((1 - latency / (maxLatency * 1.15)) * 100));
}

function buildRpcMeshSnapshot(groups = buildRpcChainGroups()) {
  const healthyNodes = state.rpcNodes.filter((node) => node.lastHealth?.status === "healthy");
  const fastestNode = sortRpcNodesForMinting(healthyNodes)[0] || null;
  const averageLatency = healthyNodes.length
    ? Math.round(
        healthyNodes.reduce((sum, node) => sum + rpcLatencyValue(node), 0) / healthyNodes.length
      )
    : null;

  return {
    totalNodes: state.rpcNodes.length,
    healthyNodes: healthyNodes.length,
    healthySocketNodes: healthyNodes.filter((node) => isSocketRpcUrl(node.url)).length,
    averageLatency,
    fastestNode,
    broadcastReadyChains: groups.filter((group) => group.healthyNodes.length >= 2).length,
    sniperReadyChains: groups.filter(
      (group) => group.healthyNodes.length >= 2 && group.healthySocketNodes.length > 0
    ).length,
    deepRecoveryChains: groups.filter((group) => group.healthyNodes.length >= 3).length,
    activeTasks: state.tasks.filter((task) => ["running", "queued"].includes(task.status)).length,
    multiRpcTasks: state.tasks.filter((task) => task.multiRpcBroadcast).length,
    mempoolTasks: state.tasks.filter((task) => task.executionTriggerMode === "mempool").length,
    relayTasks: state.tasks.filter((task) => task.privateRelayEnabled).length
  };
}

function renderRpcOperationsOverview(groups = buildRpcChainGroups()) {
  const snapshot = buildRpcMeshSnapshot(groups);
  const cards = [
    {
      label: "Healthy Mesh",
      value: `${snapshot.healthyNodes}/${snapshot.totalNodes || 0}`,
      detail: `${snapshot.broadcastReadyChains} chain${snapshot.broadcastReadyChains === 1 ? "" : "s"} ready for multi-RPC broadcast`
    },
    {
      label: "Fastest Endpoint",
      value: snapshot.fastestNode ? formatLatencyLabel(snapshot.fastestNode.lastHealth?.latencyMs) : "--",
      detail: snapshot.fastestNode
        ? `${snapshot.fastestNode.name} · ${chainLabel(snapshot.fastestNode.chainKey)}`
        : "Run a mesh pulse to populate live latency"
    },
    {
      label: "WebSocket Hooks",
      value: String(snapshot.healthySocketNodes),
      detail: `${snapshot.sniperReadyChains} chain${snapshot.sniperReadyChains === 1 ? "" : "s"} ready for mempool or event arming`
    },
    {
      label: "Recovery Depth",
      value: String(snapshot.deepRecoveryChains),
      detail: "Chains with three or more healthy endpoints for hot-failover depth"
    },
    {
      label: "Mint Pressure",
      value: String(snapshot.multiRpcTasks || snapshot.activeTasks || 0),
      detail: `${snapshot.multiRpcTasks} multi-RPC · ${snapshot.mempoolTasks} mempool · ${snapshot.relayTasks} relay task${snapshot.relayTasks === 1 ? "" : "s"}`
    }
  ];

  rpcOpsOverview.innerHTML = cards
    .map(
      (card) => `
        <article class="rpc-stat-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function buildRpcAdvisoryCards(groups = buildRpcChainGroups()) {
  const snapshot = buildRpcMeshSnapshot(groups);
  const mempoolDemandChains = groups.filter((group) => group.demand.mempool > 0);
  const relayDemandChains = groups.filter((group) => group.demand.relay > 0);
  const freshHealthyNodes = state.rpcNodes.filter((node) => {
    const checkedAt = new Date(node.lastHealth?.checkedAt || 0).getTime();
    return node.lastHealth?.status === "healthy" && checkedAt > 0 && Date.now() - checkedAt <= 15 * 60 * 1000;
  }).length;

  return [
    {
      tone:
        snapshot.broadcastReadyChains >= Math.max(1, groups.filter((group) => group.demand.total > 0).length)
          ? "healthy"
          : snapshot.broadcastReadyChains > 0
            ? "warning"
            : "error",
      title: "Public Swarm",
      detail:
        snapshot.broadcastReadyChains > 0
          ? `${snapshot.broadcastReadyChains} chain${snapshot.broadcastReadyChains === 1 ? "" : "s"} have at least two healthy endpoints for parallel broadcast.`
          : "No chain currently has enough healthy endpoints for a real broadcast swarm."
    },
    {
      tone:
        mempoolDemandChains.length === 0
          ? "healthy"
          : mempoolDemandChains.every((group) => group.healthySocketNodes.length > 0)
            ? "healthy"
            : "warning",
      title: "WebSocket Trigger Net",
      detail:
        mempoolDemandChains.length === 0
          ? "No mempool-triggered tasks are active, but socket listeners are still valuable for launch windows."
          : `${mempoolDemandChains.filter((group) => group.healthySocketNodes.length > 0).length}/${mempoolDemandChains.length} mempool chain${mempoolDemandChains.length === 1 ? "" : "s"} have a healthy websocket listener.`
    },
    {
      tone:
        relayDemandChains.length === 0
          ? "healthy"
          : relayDemandChains.every((group) => group.healthyNodes.length > 0)
            ? "healthy"
            : "warning",
      title: "Relay Hybrid",
      detail:
        relayDemandChains.length === 0
          ? "No private relay tasks are currently active."
          : `${relayDemandChains.filter((group) => group.healthyNodes.length > 0).length}/${relayDemandChains.length} relay chain${relayDemandChains.length === 1 ? "" : "s"} still have public fallback coverage if the relay stalls.`
    },
    {
      tone: freshHealthyNodes >= Math.max(1, snapshot.healthyNodes * 0.7) ? "healthy" : "warning",
      title: "Latency Hygiene",
      detail:
        snapshot.healthyNodes === 0
          ? "Healthy latency data is missing. Pulse the mesh before a hot mint."
          : `${freshHealthyNodes}/${snapshot.healthyNodes} healthy endpoint${snapshot.healthyNodes === 1 ? "" : "s"} were checked in the last 15 minutes.`
    }
  ];
}

function renderRpcBroadcastAdvisor(groups = buildRpcChainGroups()) {
  rpcBroadcastAdvisor.innerHTML = buildRpcAdvisoryCards(groups)
    .map(
      (card) => `
        <article class="rpc-advisory-card ${escapeHtml(card.tone)}">
          <div class="chip-row">
            <span class="queue-chip ${card.tone === "healthy" ? "armed" : card.tone === "error" ? "blocked" : "warming"}">${escapeHtml(card.title)}</span>
          </div>
          <strong>${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function renderRpcDoctrineGrid(groups = buildRpcChainGroups()) {
  const snapshot = buildRpcMeshSnapshot(groups);
  const doctrineCards = [
    {
      tone: snapshot.broadcastReadyChains > 0 ? "healthy" : "warning",
      title: "Public Mint Swarm",
      detail: "Use one fastest primary plus at least one healthy fallback on the same chain so multi-RPC broadcast wins on first acceptance and still propagates wide."
    },
    {
      tone: snapshot.healthySocketNodes > 0 ? "healthy" : "warning",
      title: "WebSocket Sentinel",
      detail: "Keep at least one healthy websocket endpoint on chains where you run event or mempool triggers, so the bot can arm before public traffic catches up."
    },
    {
      tone: snapshot.relayTasks === 0 || snapshot.broadcastReadyChains > 0 ? "healthy" : "warning",
      title: "Relay + Public Hybrid",
      detail: "Private relay protects against mempool copy-trading, but a healthy public fallback mesh still matters when relay submission fails or rate limits."
    },
    {
      tone: snapshot.averageLatency != null && snapshot.averageLatency <= 400 ? "healthy" : "warning",
      title: "Latency Hygiene",
      detail: "Re-test the mesh before hot launches. Endpoints drifting above roughly 400ms should become deep fallback, not primary broadcast targets."
    }
  ];

  rpcDoctrineGrid.innerHTML = doctrineCards
    .map(
      (card) => `
        <article class="rpc-advisory-card ${escapeHtml(card.tone)}">
          <strong>${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function renderRpcChainCommandGrid(groups = buildRpcChainGroups()) {
  rpcChainCommandCaption.textContent = groups.length
    ? `${pluralize(groups.length, "chain")} tracked`
    : "No chain mesh yet";

  if (groups.length === 0) {
    rpcChainCommandGrid.innerHTML = `
      <div class="empty-state">
        <h3>No chain intelligence yet</h3>
        <p>Add or scan RPC endpoints to build a ranked chain command matrix for your mint mesh.</p>
      </div>
    `;
    return;
  }

  rpcChainCommandGrid.innerHTML = groups
    .map(
      (group) => `
        <article class="rpc-chain-command-card ${escapeHtml(group.readinessTone)}">
          <div class="rpc-chain-command-top">
            <div class="rpc-chain-command-copy">
              <strong>${escapeHtml(group.chainLabel)}</strong>
              <p>${escapeHtml(group.readinessLabel)}</p>
            </div>
            <span class="queue-chip ${chainReadinessChipClass(group)}">${escapeHtml(group.readinessLabel)}</span>
          </div>
          <div class="chip-row">
            <span class="queue-chip">${pluralize(group.nodes.length, "node")}</span>
            <span class="queue-chip">${pluralize(group.healthyNodes.length, "healthy endpoint", "healthy endpoints")}</span>
            <span class="queue-chip">${pluralize(group.healthySocketNodes.length, "socket hook")}</span>
          </div>
          <p>
            ${
              group.primaryNode
                ? `Primary: ${group.primaryNode.name} • ${formatLatencyLabel(group.primaryNode.lastHealth?.latencyMs)}`
                : "Primary: none yet"
            }
          </p>
          <p>
            ${
              group.fallbackNode
                ? `Hot failover: ${group.fallbackNode.name} • ${formatLatencyLabel(group.fallbackNode.lastHealth?.latencyMs)}`
                : "Hot failover: add at least one more healthy endpoint"
            }
          </p>
          <p>
            ${
              group.healthySocketNodes[0]
                ? `WebSocket listener: ${group.healthySocketNodes[0].name}`
                : "WebSocket listener: add one for event or mempool arming"
            }
          </p>
          <p>
            ${
              group.demand.total > 0
                ? `${group.demand.total} task${group.demand.total === 1 ? "" : "s"} • ${group.demand.multiRpcBroadcast} multi-RPC • ${group.demand.mempool} mempool • ${group.demand.relay} relay`
                : "No tasks are currently bound to this chain."
            }
          </p>
        </article>
      `
    )
    .join("");
}

function renderRpcAiPanel() {
  const aiReady = Boolean(state.settings.openaiApiKeyConfigured);
  const source = state.settings.openaiApiKeySource === "env" ? ".env" : "dashboard";
  rpcAiGenerateButton.disabled = !aiReady || rpcAiState.loading;

  if (!aiReady) {
    rpcAiStatus.textContent = "Set an OpenAI API key to enable";
    rpcAiOutput.textContent = "Add an OpenAI API key in Settings or set OPENAI_API_KEY in .env to enable the AI RPC advisor.";
    return;
  }

  if (rpcAiState.loading) {
    rpcAiStatus.textContent = `Generating brief via ${source}...`;
    rpcAiOutput.textContent = "OpenAI is reviewing the current mesh, tasks, websocket coverage, and broadcast depth...";
    return;
  }

  rpcAiStatus.textContent = `Ready via ${source} · ${state.settings.openaiRpcAdvisorModel || "OpenAI"}`;

  if (!rpcAiState.content) {
    rpcAiOutput.textContent = "Ask for a mint-focused RPC brief. Example: Which chain is weakest right now, and what should I add before a public mint?";
    return;
  }

  const generatedLabel = rpcAiState.generatedAt ? `Generated ${relativeTime(rpcAiState.generatedAt)}` : "Generated just now";
  rpcAiOutput.textContent = [
    `Model: ${rpcAiState.model || state.settings.openaiRpcAdvisorModel || "OpenAI"}`,
    generatedLabel,
    "",
    rpcAiState.content
  ].join("\n");
}

async function generateRpcAiAdvice() {
  if (!state.settings.openaiApiKeyConfigured) {
    showToast("Add an OpenAI API key in Settings or .env first to enable the AI advisor.", "info", "AI Advisor");
    return;
  }

  rpcAiState.loading = true;
  renderRpcAiPanel();

  try {
    const payload = await request("/api/rpc-nodes/ai-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainKey: rpcDiscoveryState.chain?.key || "",
        prompt: rpcAiPromptInput.value
      }),
      quiet: true
    });

    rpcAiState = {
      loading: false,
      content: String(payload.advice || "").trim(),
      model: payload.model || state.settings.openaiRpcAdvisorModel || "",
      generatedAt: payload.generatedAt || new Date().toISOString()
    };
    renderRpcAiPanel();
    showToast("AI RPC brief generated.", "success", "AI Advisor");
  } catch (error) {
    rpcAiState.loading = false;
    renderRpcAiPanel();
    showToast(error.message || "AI advisor failed.", "error", "AI Advisor");
  }
}

async function pulseRpcMesh() {
  const payload = await request("/api/control/test-rpc-pool", { method: "POST" });
  const summary = payload.summary || {};
  showToast(
    `${summary.healthy || 0} healthy · ${summary.error || 0} error · ${summary.total || 0} total`,
    "success",
    "RPC Mesh Pulse"
  );
}

function renderRpcNodes() {
  if (activeRpcEditId && !state.rpcNodes.some((node) => node.id === activeRpcEditId)) {
    resetRpcForm();
  }

  const chainGroups = buildRpcChainGroups();
  renderRpcOperationsOverview(chainGroups);
  renderRpcBroadcastAdvisor(chainGroups);
  renderRpcDoctrineGrid(chainGroups);
  renderRpcChainCommandGrid(chainGroups);
  renderRpcAiPanel();

  rpcList.innerHTML = chainGroups.length
    ? chainGroups
        .map((group) => {
          const groupChips = [
            `<span class="queue-chip ${chainReadinessChipClass(group)}">${escapeHtml(group.readinessLabel)}</span>`,
            `<span class="queue-chip">${escapeHtml(pluralize(group.healthyNodes.length, "healthy endpoint", "healthy endpoints"))}</span>`,
            `<span class="queue-chip">${escapeHtml(pluralize(group.healthySocketNodes.length, "socket hook"))}</span>`,
            group.freshHealthyCount > 0
              ? `<span class="queue-chip">${escapeHtml(`${group.freshHealthyCount} fresh probe${group.freshHealthyCount === 1 ? "" : "s"}`)}</span>`
              : "",
            group.demand.total > 0
              ? `<span class="queue-chip">${escapeHtml(`${group.demand.total} task${group.demand.total === 1 ? "" : "s"}`)}</span>`
              : ""
          ]
            .filter(Boolean)
            .join("");

          const nodeMarkup = group.nodes.length
            ? group.nodes
                .map((node, index) => {
                  const roleLabel = mintRoleLabel(node, group, index);
                  const latency = formatLatencyLabel(node.lastHealth?.latencyMs);
                  const provider = rpcProviderLabel(node);
                  const transportLabel = isSocketRpcUrl(node.url) ? "WebSocket" : "HTTPS";

                  return `
                    <article class="rpc-node-card ${escapeHtml(node.lastHealth?.status || "untested")}">
                      <div class="rpc-node-top">
                        <div class="rpc-node-copy">
                          <div class="rpc-node-title-row">
                            <strong>${escapeHtml(node.name)}</strong>
                            ${rpcHealthMarkup(node)}
                          </div>
                          <div class="chip-row rpc-node-chips">
                            <span class="queue-chip">${escapeHtml(group.chainLabel)}</span>
                            <span class="queue-chip">${escapeHtml(roleLabel)}</span>
                            <span class="queue-chip">${escapeHtml(transportLabel)}</span>
                            <span class="queue-chip">${escapeHtml(provider)}</span>
                            <span class="queue-chip">${escapeHtml(node.source === "env" ? "Env Managed" : "Stored")}</span>
                            ${
                              node.lastHealth?.checkedAt
                                ? `<span class="queue-chip">${escapeHtml(relativeTime(node.lastHealth.checkedAt))}</span>`
                                : ""
                            }
                          </div>
                          <div class="rpc-node-score">
                            <div class="rpc-node-stat-row">
                              <span class="muted-copy">Observed latency</span>
                              <strong>${escapeHtml(latency)}</strong>
                            </div>
                            <div class="rpc-latency-bar">
                              <span style="width:${latencyFillWidth(node, group)}%"></span>
                            </div>
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
                  `;
                })
                .join("")
            : `
              <article class="rpc-node-card empty-chain">
                <strong>${escapeHtml(group.chainLabel)} has no endpoints yet</strong>
                <p class="muted-copy">
                  Add at least two healthy RPCs for multi-RPC broadcast${group.demand.mempool > 0 ? ", plus one websocket listener for mempool/event arming" : ""}.
                </p>
              </article>
            `;

          return `
            <section class="rpc-chain-group">
              <div class="rpc-chain-group-header">
                <div class="rpc-chain-group-copy">
                  <h4>${escapeHtml(group.chainLabel)}</h4>
                  <p class="muted-copy">
                    ${
                      group.demand.total > 0
                        ? `${group.demand.total} task${group.demand.total === 1 ? "" : "s"} on this chain · ${group.demand.multiRpcBroadcast} multi-RPC · ${group.demand.mempool} mempool · ${group.demand.relay} relay`
                        : "No tasks are currently bound to this chain, but it is ready to be staged for future mints."
                    }
                  </p>
                </div>
                <div class="chip-row">
                  ${groupChips}
                </div>
              </div>
              <div class="rpc-chain-node-grid">
                ${nodeMarkup}
              </div>
            </section>
          `;
        })
        .join("")
    : `<div class="empty-state"><h3>No RPC mesh yet</h3><p>Add chain endpoints to build a mint-ready broadcast mesh.</p></div>`;

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

function setApiKeyStatus({ input, statusNode, source, message = null }) {
  if (message) {
    statusNode.textContent = message;
    return;
  }

  if (input.value.trim()) {
    statusNode.textContent = "New key ready to test or save";
    return;
  }

  if (source === "saved") {
    statusNode.textContent = "Saved key available";
    return;
  }

  if (source === "env") {
    statusNode.textContent = "Environment key available";
    return;
  }

  statusNode.textContent = "Not configured";
}

function syncApiKeyControls({ input, deleteButton, source, placeholders, deleteLabel }) {
  if (source === "saved") {
    input.placeholder = placeholders.saved;
  } else if (source === "env") {
    input.placeholder = placeholders.env;
  } else {
    input.placeholder = placeholders.empty;
  }

  deleteButton.disabled = source !== "saved";
  deleteButton.title = source === "saved" ? deleteLabel : "Only saved dashboard keys can be deleted here";
}

function setExplorerKeyStatus(message = null) {
  setApiKeyStatus({
    input: explorerApiKeyInput,
    statusNode: explorerConfigStatus,
    source: state.settings.explorerApiKeySource,
    message
  });
}

function syncExplorerKeyControls() {
  syncApiKeyControls({
    input: explorerApiKeyInput,
    deleteButton: deleteExplorerKeyButton,
    source: state.settings.explorerApiKeySource,
    placeholders: {
      saved: "Saved on server. Enter a new key to replace it.",
      env: "Loaded from .env. Enter a new key to override it.",
      empty: "Etherscan V2 API key"
    },
    deleteLabel: "Delete the saved explorer API key"
  });
}

function setOpenaiKeyStatus(message = null) {
  setApiKeyStatus({
    input: openaiApiKeyInput,
    statusNode: openaiConfigStatus,
    source: state.settings.openaiApiKeySource,
    message
  });
}

function syncOpenaiKeyControls() {
  syncApiKeyControls({
    input: openaiApiKeyInput,
    deleteButton: deleteOpenaiKeyButton,
    source: state.settings.openaiApiKeySource,
    placeholders: {
      saved: "Saved on server. Enter a new key to replace it.",
      env: "Loaded from .env. Enter a new key to override it.",
      empty: "OpenAI API key"
    },
    deleteLabel: "Delete the saved OpenAI API key"
  });
}

function renderSettings() {
  explorerApiKeyInput.value = "";
  openaiApiKeyInput.value = "";

  syncExplorerKeyControls();
  setExplorerKeyStatus();
  syncOpenaiKeyControls();
  setOpenaiKeyStatus();
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

function ensureChainOption(chain) {
  const key = String(chain?.key || chain?.chainKey || "").trim();
  const label = String(chain?.label || chain?.chainLabel || "").trim();
  const chainId = Number(chain?.chainId);

  if (!key || !label || !Number.isFinite(chainId)) {
    return;
  }

  const existingIndex = state.chains.findIndex((entry) => entry.key === key);
  const nextEntry = { key, label, chainId };

  if (existingIndex === -1) {
    state.chains = [...state.chains, nextEntry];
  } else {
    state.chains = state.chains.map((entry, index) => (index === existingIndex ? nextEntry : entry));
  }

  populateChainSelectors();
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

function defaultValueForAbiInput(input, inputIndex, totalInputs, quantity = 1) {
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
    return looksLikeQuantityInput(input, inputIndex, totalInputs) ? quantity : 0;
  }

  return null;
}

function inferMintArgsFromAbi(abiEntries, mintFunction = "", quantity = 1) {
  const mintEntry = findAbiFunctionEntry(abiEntries, mintFunction);
  if (!mintEntry?.inputs?.length) {
    return [];
  }

  return mintEntry.inputs.map((input, inputIndex) =>
    defaultValueForAbiInput(input, inputIndex, mintEntry.inputs.length, quantity)
  );
}

function buildLocalMintAutofill(abiEntries, requestedFunction = "", quantityPerWallet = null) {
  const resolvedMintFunction = resolveMintFunctionFromAbi(abiEntries, requestedFunction);
  const normalizedQuantity =
    quantityPerWallet === null || quantityPerWallet === undefined
      ? null
      : Math.max(1, Number(quantityPerWallet || 1));
  return {
    mintFunction: resolvedMintFunction.mintFunction,
    mintArgs: inferMintArgsFromAbi(
      abiEntries,
      resolvedMintFunction.mintFunction,
      normalizedQuantity ?? 1
    ),
    quantityPerWallet: normalizedQuantity,
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

  if (
    includeQuantity &&
    autofill?.quantityPerWallet !== null &&
    autofill?.quantityPerWallet !== undefined &&
    (!taskQuantityInput.value.trim() || Number(taskQuantityInput.value) < 1)
  ) {
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
        quantityPerWallet: Number(taskQuantityInput.value || 1),
        ...buildClaimTaskSettings()
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
    const localAutofill = buildLocalMintAutofill(
      abiEntries,
      taskFunctionInput.value,
      Number(taskQuantityInput.value || 1)
    );
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
    applyMintAutofill(
      payload.autofill ||
        buildLocalMintAutofill(payload.abi || [], taskFunctionInput.value, Number(taskQuantityInput.value || 1))
    );
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
  taskClaimIntegrationToggle.checked = Boolean(task?.claimIntegrationEnabled);
  taskClaimProjectKeyInput.value = task?.claimProjectKey || "";
  taskClaimFetchToggle.checked = Boolean(task?.claimFetchEnabled);
  taskClaimFetchUrlInput.value = task?.claimFetchUrl || "";
  taskClaimFetchMethodInput.value = task?.claimFetchMethod || "GET";
  taskClaimResponseRootInput.value = task?.claimResponseRoot || "";
  taskWalletClaimsInput.value = task?.walletClaimsJson || "";
  taskClaimFetchHeadersInput.value = task?.claimFetchHeadersJson || "";
  taskClaimFetchCookiesInput.value = task?.claimFetchCookiesJson || "";
  taskClaimFetchBodyInput.value = task?.claimFetchBodyJson || "";
  taskClaimResponseMappingInput.value = task?.claimResponseMappingJson || "";
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

function buildClaimTaskSettings() {
  return {
    claimIntegrationEnabled: taskClaimIntegrationToggle.checked,
    claimProjectKey: taskClaimProjectKeyInput.value,
    walletClaimsJson: taskWalletClaimsInput.value,
    claimFetchEnabled: taskClaimFetchToggle.checked,
    claimFetchUrl: taskClaimFetchUrlInput.value,
    claimFetchMethod: taskClaimFetchMethodInput.value,
    claimFetchHeadersJson: taskClaimFetchHeadersInput.value,
    claimFetchCookiesJson: taskClaimFetchCookiesInput.value,
    claimFetchBodyJson: taskClaimFetchBodyInput.value,
    claimResponseMappingJson: taskClaimResponseMappingInput.value,
    claimResponseRoot: taskClaimResponseRootInput.value
  };
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
    ...buildClaimTaskSettings(),
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
    await pulseRpcMesh();
  } catch {}
});

rpcPagePulseButton.addEventListener("click", async () => {
  try {
    await pulseRpcMesh();
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
  if (!isRpcEditMode()) {
    await submitRpcDiscoverySelection();
    return;
  }

  const payload = buildRpcSavePayload();
  if (!String(payload.url || "").trim()) {
    showToast("Enter an RPC URL before saving this node.", "info", "RPC URL Required");
    return;
  }

  openRpcConfirmModal(payload);
});

rpcCancelButton.addEventListener("click", () => {
  resetRpcForm();
});

rpcImportChainlistButton.addEventListener("click", async () => {
  if (isRpcEditMode()) {
    return;
  }

  await runRpcDiscoveryScan({ forceRefresh: true });
});

rpcChainlistCloseButton.addEventListener("click", closeRpcChainlistModal);
rpcChainlistCancelButton.addEventListener("click", closeRpcChainlistModal);
rpcChainlistRefreshButton.addEventListener("click", async () => {
  await loadChainlistRpcCandidates({ forceRefresh: true });
});
rpcChainlistApplyButton.addEventListener("click", applySelectedChainlistRpc);

rpcChainlistModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeRpcChainlistModal === "true") {
    closeRpcChainlistModal();
  }
});

rpcConfirmCloseButton.addEventListener("click", closeRpcConfirmModal);
rpcConfirmCancelButton.addEventListener("click", closeRpcConfirmModal);
rpcConfirmSubmitButton.addEventListener("click", async () => {
  await submitConfirmedRpcSave();
});

rpcConfirmModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeRpcConfirmModal === "true") {
    closeRpcConfirmModal();
  }
});

rpcUrlInput.addEventListener("input", () => {
  syncSelectedChainlistCandidateWithForm();
  void inspectRpcUrl(rpcUrlInput.value);
});

rpcUrlInput.addEventListener("blur", () => {
  syncSelectedChainlistCandidateWithForm();
  void inspectRpcUrl(rpcUrlInput.value, { immediate: true });
});

rpcChainInput.addEventListener("change", () => {
  if (rpcSelectedChainlistCandidate && rpcSelectedChainlistCandidate.chainKey !== rpcChainInput.value) {
    clearSelectedChainlistCandidate();
  }
});

rpcNameInput.addEventListener("input", () => {
  if (rpcNameInput.value.trim() !== rpcAutoSuggestedName) {
    rpcAutoSuggestedName = "";
  }
});

rpcChainSearchInput.addEventListener("input", () => {
  if (isRpcEditMode()) {
    return;
  }

  const query = rpcChainSearchInput.value.trim();
  if (!query) {
    clearRpcDiscoveryState();
    setRpcDetectMessage();
    updateRpcSubmitButton();
    return;
  }

  scheduleRpcDiscoveryScan();
});

rpcChainSearchInput.addEventListener("blur", () => {
  if (isRpcEditMode() || !rpcChainSearchInput.value.trim()) {
    return;
  }

  scheduleRpcDiscoveryScan({ immediate: true });
});

rpcAiGenerateButton.addEventListener("click", async () => {
  await generateRpcAiAdvice();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const explorerApiKeyValue = explorerApiKeyInput.value.trim();
  const openaiApiKeyValue = openaiApiKeyInput.value.trim();
  const updatedKeys = [];
  if (explorerApiKeyValue) {
    updatedKeys.push("Explorer");
  }
  if (openaiApiKeyValue) {
    updatedKeys.push("OpenAI");
  }

  try {
    const payload = await request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explorerApiKey: explorerApiKeyValue,
        openaiApiKey: openaiApiKeyValue
      })
    });
    if (payload.settings) {
      state.settings = payload.settings;
    }
    explorerApiKeyInput.value = "";
    openaiApiKeyInput.value = "";
    showToast(
      updatedKeys.length
        ? `${updatedKeys.join(" and ")} API ${updatedKeys.length === 1 ? "key" : "keys"} updated.`
        : "API settings saved.",
      "success",
      updatedKeys.length ? "API Keys Updated" : "Settings Saved"
    );
    syncExplorerKeyControls();
    setExplorerKeyStatus();
    syncOpenaiKeyControls();
    setOpenaiKeyStatus();
  } catch {}
});

explorerApiKeyInput.addEventListener("input", () => {
  setExplorerKeyStatus();
});

openaiApiKeyInput.addEventListener("input", () => {
  setOpenaiKeyStatus();
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

deleteOpenaiKeyButton.addEventListener("click", async () => {
  if (state.settings.openaiApiKeySource !== "saved") {
    showToast("There is no saved OpenAI dashboard key to delete.", "info", "No Saved Key");
    return;
  }

  if (!window.confirm("Delete the saved OpenAI API key?")) {
    return;
  }

  const buttonLabel = deleteOpenaiKeyButton.textContent;
  deleteOpenaiKeyButton.disabled = true;
  deleteOpenaiKeyButton.textContent = "Deleting...";

  try {
    const payload = await request("/api/settings/openai-key", {
      method: "DELETE"
    });

    if (payload.settings) {
      state.settings = payload.settings;
    }

    openaiApiKeyInput.value = "";
    syncOpenaiKeyControls();
    setOpenaiKeyStatus();
    showToast("Saved OpenAI API key deleted.", "success", "OpenAI Key Deleted");
  } catch {
    syncOpenaiKeyControls();
    setOpenaiKeyStatus();
  } finally {
    deleteOpenaiKeyButton.textContent = buttonLabel;
    syncOpenaiKeyControls();
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

testOpenaiKeyButton.addEventListener("click", async () => {
  const buttonLabel = testOpenaiKeyButton.textContent;
  const openaiApiKeyValue = openaiApiKeyInput.value.trim();

  testOpenaiKeyButton.disabled = true;
  testOpenaiKeyButton.textContent = "Testing...";

  try {
    const payload = await request("/api/control/test-openai-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openaiApiKey: openaiApiKeyValue
      })
    });

    const statusMessage =
      payload.source === "input"
        ? "Typed key verified"
        : payload.source === "env"
          ? "Environment key verified"
          : "Saved key verified";
    setOpenaiKeyStatus(statusMessage);
    showToast(
      payload.source === "input"
        ? "OpenAI API key is valid. Save settings to replace the current key."
        : payload.source === "env"
          ? "Environment OpenAI API key is valid. Save a new key if you want to override it in the dashboard."
          : "Saved OpenAI API key is valid.",
      "success",
      "OpenAI Key Valid"
    );
  } catch {
    setOpenaiKeyStatus("Key test failed");
  } finally {
    testOpenaiKeyButton.disabled = false;
    testOpenaiKeyButton.textContent = buttonLabel;
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

[taskClaimIntegrationToggle, taskClaimFetchToggle, taskClaimFetchMethodInput].forEach((element) => {
  element.addEventListener("change", () => {
    refreshPhasePreviewFromCurrentInput("Claims updated");
  });
});

[
  taskClaimProjectKeyInput,
  taskClaimFetchUrlInput,
  taskClaimResponseRootInput,
  taskWalletClaimsInput,
  taskClaimFetchHeadersInput,
  taskClaimFetchCookiesInput,
  taskClaimFetchBodyInput,
  taskClaimResponseMappingInput
].forEach((element) => {
  element.addEventListener("change", () => {
    refreshPhasePreviewFromCurrentInput("Claims updated");
  });
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
    resetRpcForm();
    renderWalletSelector([]);
    renderRpcSelector([]);
    connectEvents();
    setView("dashboard");
    showToast("Advanced command surface online.", "success", "System Ready");
  })
  .catch(() => {});
