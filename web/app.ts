const state = {
  tasks: [],
  wallets: [],
  rpcNodes: [],
  settings: {},
  chains: [],
  mintSources: [],
  telemetry: null,
  runState: { status: "idle", activeTaskId: null, activeTaskIds: [], activeRuns: [], logs: [], startedAt: null },
  session: { authenticated: false, user: null, authRequired: true },
  currentView: "dashboard",
  walletGroupFilter: "All",
  taskStatusFilter: "all",
  mintRadar: {
    items: [],
    loading: false,
    error: "",
    fetchedAt: "",
    limitation: "",
    warnings: [],
    filter: "all",
    chainFilter: "all",
    searchQuery: ""
  }
};
const fallbackMintSources = [
  {
    type: "generic_contract",
    label: "Generic Contract",
    description: "Direct contract minting with local ABI, RPC routing, and optional claim fetch.",
    capabilities: {
      backendPayload: false,
      scheduleSync: false,
      sessionAuth: false
    },
    configExample: {
      target: "",
      stage: "auto"
    }
  },
  {
    type: "opensea",
    label: "OpenSea",
    description: "Marketplace adapter foundation for OpenSea drops, stage discovery, and future source-auth hooks.",
    capabilities: {
      backendPayload: true,
      scheduleSync: true,
      sessionAuth: true
    },
    configExample: {
      target: "https://opensea.io/collection/example-drop",
      stage: "allowlist"
    }
  },
  {
    type: "magiceden",
    label: "Magic Eden",
    description: "Marketplace adapter foundation for Magic Eden launch pages and source-specific mint preparation.",
    capabilities: {
      backendPayload: true,
      scheduleSync: true,
      sessionAuth: true
    },
    configExample: {
      target: "https://magiceden.io/launchpad/example-drop",
      stage: "allowlist"
    }
  },
  {
    type: "custom_launchpad",
    label: "Custom Launchpad",
    description: "Third-party mint sites that need custom HTTP preparation, proofs, or signed payload fetches.",
    capabilities: {
      backendPayload: true,
      scheduleSync: true,
      sessionAuth: true
    },
    configExample: {
      target: "https://mint.project.xyz/drop/example",
      stage: "custom"
    }
  }
];
const walletAssetSnapshotStorageKey = "mintbot.wallet-assets.snapshots.v1";
const walletAssetSelectedStorageKey = "mintbot.wallet-assets.selected.v1";
const walletAssetAutoSyncIntervalMs = 2 * 60 * 1000;
const rpcHealthWarningLatencyMs = 180;
const rpcHealthCriticalLatencyMs = 320;
const rpcHealthAutoPulseIntervalMs = 3 * 60 * 1000;
const mintRadarAutoSyncIntervalMs = 5 * 60 * 1000;

const body = document.body;
body.dataset.currentView = state.currentView;
const authOverlay = document.getElementById("auth-overlay");
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username-input");
const loginPasswordInput = document.getElementById("login-password-input");
const loginStatus = document.getElementById("login-status");
const navButtons = [...document.querySelectorAll(".nav-button")];
const views = [...document.querySelectorAll(".view")];
const dashboardRunHistory = document.getElementById("dashboard-run-history");
const taskGrid = document.getElementById("task-grid");
const mintRadarSearchInput = document.getElementById("mint-radar-search-input");
const mintRadarChainInput = document.getElementById("mint-radar-chain-input");
const mintRadarRefreshButton = document.getElementById("mint-radar-refresh-button");
const mintRadarFilterInput = document.getElementById("mint-radar-filter-input");
const mintRadarStatus = document.getElementById("mint-radar-status");
const mintRadarCount = document.getElementById("mint-radar-count");
const mintRadarUpdated = document.getElementById("mint-radar-updated");
const mintRadarLimitation = document.getElementById("mint-radar-limitation");
const mintRadarWarningList = document.getElementById("mint-radar-warning-list");
const mintRadarList = document.getElementById("mint-radar-list");
const tasksSummaryCopy = document.getElementById("tasks-summary-copy");
const taskStatusLegend = document.getElementById("task-status-legend");
const systemAlerts = document.getElementById("system-alerts");
const dashboardHealthPill = document.getElementById("dashboard-health-pill");
const sidebarModeLabel = document.getElementById("sidebar-mode-label");
const sidebarModeDot = document.getElementById("sidebar-mode-dot");
const heroModeCopy = document.getElementById("hero-mode-copy");
const liveClock = document.getElementById("live-clock");
const logOutput = document.getElementById("log-output");
const resultsOutput = document.getElementById("results-output");
const runtimeOutput = document.getElementById("runtime-output");
const clearLogsButton = document.getElementById("clear-logs-button");
const dashboardRefreshButton = document.getElementById("dashboard-refresh-button");
const newTaskButton = document.getElementById("new-task-button");
const dashboardOpenTaskButton = document.getElementById("dashboard-open-task-button");
const runPriorityButton = document.getElementById("run-priority-button");
const rpcPulseButton = document.getElementById("rpc-pulse-button");
const snapshotButton = document.getElementById("snapshot-button");
const walletImportForm = document.getElementById("wallet-import-form");
const walletImportSubmitButton = document.getElementById("wallet-import-submit-button");
const walletGroupInput = document.getElementById("wallet-group-input");
const walletKeysInput = document.getElementById("wallet-keys-input");
const walletList = document.getElementById("wallet-list");
const walletCount = document.getElementById("wallet-count");
const walletAssetsTitle = document.getElementById("wallet-assets-title");
const walletAssetsSubtitle = document.getElementById("wallet-assets-subtitle");
const walletAssetsStatus = document.getElementById("wallet-assets-status");
const walletAssetsList = document.getElementById("wallet-assets-list");
const walletAssetsRefreshButton = document.getElementById("wallet-assets-refresh-button");
const walletBalancesRefreshAllButton = document.getElementById("wallet-balances-refresh-all-button");
const walletBalanceSyncStatus = document.getElementById("wallet-balance-sync-status");
const rpcForm = document.getElementById("rpc-form");
const rpcFormTitle = document.getElementById("rpc-form-title");
const rpcFormSubtitle = document.getElementById("rpc-form-subtitle");
const rpcFormBadge = document.getElementById("rpc-form-badge");
const rpcCancelButton = document.getElementById("rpc-cancel-button");
const rpcSubmitButton = document.getElementById("rpc-submit-button");
const rpcImportChainlistButton = document.getElementById("rpc-import-chainlist-button");
const rpcImportAlchemyButton = document.getElementById("rpc-import-alchemy-button");
const rpcImportDrpcButton = document.getElementById("rpc-import-drpc-button");
const rpcChainSearchField = document.getElementById("rpc-chain-search-field");
const rpcChainSearchInput = document.getElementById("rpc-chain-search-input");
const rpcTransportTabs = document.getElementById("rpc-transport-tabs");
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
const rpcHealthSyncStatus = document.getElementById("rpc-health-sync-status");
const rpcAlertList = document.getElementById("rpc-alert-list");
const rpcList = document.getElementById("rpc-list");
const rpcOperationProgress = getOperationProgressRefs("rpc-operation-progress");
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
const rpcConfirmProgress = getOperationProgressRefs("rpc-confirm-progress");
const rpcDeleteModal = document.getElementById("rpc-delete-modal");
const rpcDeleteCloseButton = document.getElementById("rpc-delete-close-button");
const rpcDeleteCancelButton = document.getElementById("rpc-delete-cancel-button");
const rpcDeleteSubmitButton = document.getElementById("rpc-delete-submit-button");
const rpcDeleteName = document.getElementById("rpc-delete-name");
const rpcDeleteChain = document.getElementById("rpc-delete-chain");
const rpcDeleteUrl = document.getElementById("rpc-delete-url");
const walletDeleteModal = document.getElementById("wallet-delete-modal");
const walletDeleteCloseButton = document.getElementById("wallet-delete-close-button");
const walletDeleteCancelButton = document.getElementById("wallet-delete-cancel-button");
const walletDeleteSubmitButton = document.getElementById("wallet-delete-submit-button");
const walletDeleteName = document.getElementById("wallet-delete-name");
const walletDeleteAddress = document.getElementById("wallet-delete-address");
const settingsForm = document.getElementById("settings-form");
const saveSettingsButton = document.getElementById("save-settings-button");
const testAllApiKeysButton = document.getElementById("test-all-api-keys-button");
const explorerApiKeyInput = document.getElementById("explorer-api-key-input");
const explorerConfigStatus = document.getElementById("explorer-config-status");
const deleteExplorerKeyButton = document.getElementById("delete-explorer-key-button");
const testExplorerKeyButton = document.getElementById("test-explorer-key-button");
const openaiApiKeyInput = document.getElementById("openai-api-key-input");
const openaiConfigStatus = document.getElementById("openai-config-status");
const deleteOpenaiKeyButton = document.getElementById("delete-openai-key-button");
const testOpenaiKeyButton = document.getElementById("test-openai-key-button");
const alchemyApiKeyInput = document.getElementById("alchemy-api-key-input");
const alchemyConfigStatus = document.getElementById("alchemy-config-status");
const deleteAlchemyKeyButton = document.getElementById("delete-alchemy-key-button");
const testAlchemyKeyButton = document.getElementById("test-alchemy-key-button");
const drpcApiKeyInput = document.getElementById("drpc-api-key-input");
const drpcConfigStatus = document.getElementById("drpc-config-status");
const deleteDrpcKeyButton = document.getElementById("delete-drpc-key-button");
const testDrpcKeyButton = document.getElementById("test-drpc-key-button");
const openseaApiKeyInput = document.getElementById("opensea-api-key-input");
const openseaConfigStatus = document.getElementById("opensea-config-status");
const deleteOpenseaKeyButton = document.getElementById("delete-opensea-key-button");
const testOpenseaKeyButton = document.getElementById("test-opensea-key-button");
const apiKeyDraftState = {
  explorer: { value: "", validated: false },
  openai: { value: "", validated: false },
  alchemy: { value: "", validated: false },
  drpc: { value: "", validated: false },
  opensea: { value: "", validated: false }
};
const accountLabel = document.getElementById("account-label");
const accountStatus = document.getElementById("account-status");
const logoutButton = document.getElementById("logout-button");
const toastStack = document.getElementById("toast-stack");
const assistantPanel = document.getElementById("assistant-panel");
const assistantResetButton = document.getElementById("assistant-reset-button");
const assistantMessages = document.getElementById("assistant-messages");
const assistantForm = document.getElementById("assistant-form");
const assistantInput = document.getElementById("assistant-input");
const assistantSendButton = document.getElementById("assistant-send-button");
const walletImportProgress = getOperationProgressRefs("wallet-import-progress");
const explorerKeyProgress = getOperationProgressRefs("explorer-key-progress");
const openaiKeyProgress = getOperationProgressRefs("openai-key-progress");
const alchemyKeyProgress = getOperationProgressRefs("alchemy-key-progress");
const drpcKeyProgress = getOperationProgressRefs("drpc-key-progress");
const openseaKeyProgress = getOperationProgressRefs("opensea-key-progress");
const operationProgressState = new WeakMap();

function getApiKeyDraft(name) {
  return apiKeyDraftState[name] || { value: "", validated: false };
}

function getOperationProgressRefs(idBase) {
  return {
    container: document.getElementById(idBase),
    label: document.getElementById(`${idBase}-label`),
    value: document.getElementById(`${idBase}-value`),
    bar: document.getElementById(`${idBase}-bar`)
  };
}

function stageApiKeyDraft(name, value, options = {}) {
  const normalizedValue = String(value || "").trim();
  apiKeyDraftState[name] = {
    value: normalizedValue,
    validated: normalizedValue ? Boolean(options.validated) : false
  };
}

function clearApiKeyDraft(name) {
  stageApiKeyDraft(name, "");
}

function hasApiKeyDraft(name) {
  return Boolean(getApiKeyDraft(name).value);
}

function isApiKeyDraftValidated(name) {
  const draft = getApiKeyDraft(name);
  return Boolean(draft.value && draft.validated);
}

function syncApiKeyDraftFromInput(name, input) {
  const normalizedValue = String(input?.value || "").trim();
  if (normalizedValue) {
    stageApiKeyDraft(name, normalizedValue, { validated: false });
    return;
  }

  if (!isApiKeyDraftValidated(name)) {
    clearApiKeyDraft(name);
  }
}

function getApiKeyCandidate(name, input) {
  const visibleValue = String(input?.value || "").trim();
  if (visibleValue) {
    stageApiKeyDraft(name, visibleValue, { validated: false });
    return visibleValue;
  }
  return getApiKeyDraft(name).value;
}

function clearAllApiKeyDrafts() {
  Object.keys(apiKeyDraftState).forEach((name) => clearApiKeyDraft(name));
}

function clearAllApiKeyInputs() {
  explorerApiKeyInput.value = "";
  openaiApiKeyInput.value = "";
  alchemyApiKeyInput.value = "";
  drpcApiKeyInput.value = "";
  openseaApiKeyInput.value = "";
}

function formatLabelList(labels) {
  if (!labels.length) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

const taskModal = document.getElementById("task-modal");
const taskDeleteModal = document.getElementById("task-delete-modal");
const modalTitle = document.getElementById("modal-title");
const closeModalButton = document.getElementById("close-modal-button");
const cancelTaskButton = document.getElementById("cancel-task-button");
const taskDeleteCloseButton = document.getElementById("task-delete-close-button");
const taskDeleteCancelButton = document.getElementById("task-delete-cancel-button");
const taskDeleteSubmitButton = document.getElementById("task-delete-submit-button");
const taskDeleteName = document.getElementById("task-delete-name");
const taskDeleteChain = document.getElementById("task-delete-chain");
const taskDeleteContract = document.getElementById("task-delete-contract");
const taskAdvancedToggleButton = document.getElementById("task-advanced-toggle-button");
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
const taskSourceTypeInput = document.getElementById("task-source-type-input");
const taskSourceTargetInput = document.getElementById("task-source-target-input");
const taskSourceStageInput = document.getElementById("task-source-stage-input");
const taskSourceConfigInput = document.getElementById("task-source-config-input");
const taskSourceHint = document.getElementById("task-source-hint");
const taskDiscoveryCollectionInput = document.getElementById("task-discovery-collection-input");
const taskDestinationWalletInput = document.getElementById("task-destination-wallet-input");
const taskDiscoveryNftContractInput = document.getElementById("task-discovery-nft-contract-input");
const taskDiscoveryRouteContractInput = document.getElementById("task-discovery-route-contract-input");
const taskMintRouteHint = document.getElementById("task-mint-route-hint");
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
const taskQuickDropTypeInput = document.getElementById("task-quick-drop-type-input");
const taskSimpleLaunchModeInput = document.getElementById("task-simple-launch-mode-input");
const taskSimpleStartTimeField = document.getElementById("task-simple-start-time-field");
const taskSimpleStartTimeInput = document.getElementById("task-simple-start-time-input");
const taskSimpleTargetBlockField = document.getElementById("task-simple-target-block-field");
const taskSimpleTargetBlockInput = document.getElementById("task-simple-target-block-input");
const taskSimpleMempoolField = document.getElementById("task-simple-mempool-field");
const taskSimpleMempoolInput = document.getElementById("task-simple-mempool-input");
const taskSimpleLaunchHint = document.getElementById("task-simple-launch-hint");
const taskQuickStackSummary = document.getElementById("task-quick-stack-summary");
const taskQuickProofHint = document.getElementById("task-quick-proof-hint");
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
const taskAdvancedSections = [...document.querySelectorAll(".task-advanced-section")];
let events = null;
let abiAutofillTimer = null;
let abiAutofillRequestId = 0;
let abiExplorerFetchTimer = null;
let abiExplorerFetchRequestId = 0;
let sourceDiscoveryTimer = null;
let sourceDiscoveryRequestId = 0;
let taskSourceDiscoveryStatus = "";
let rpcInspectTimer = null;
let rpcInspectRequestId = 0;
let rpcChainSearchTimer = null;
let rpcDiscoveryRequestId = 0;
let rpcAutoSuggestedName = "";
let activeRpcEditId = null;
let rpcFormGroup = "Custom";
let rpcSelectedChainlistCandidate = null;
let rpcPendingSavePayload = null;
let walletAssetSnapshots = loadPersistedWalletAssetSnapshots();
let walletAssetsRefreshAllInFlight = false;
let walletAssetsAutoSyncInFlight = false;
let walletAssetsAutoSyncTimer = null;
let walletAssetsAutoSyncKickTimer = null;
let rpcHealthAutoPulseInFlight = false;
let rpcHealthAutoPulseTimer = null;
let rpcHealthAutoPulseKickTimer = null;
let mintRadarAutoSyncTimer = null;
let mintRadarAutoSyncKickTimer = null;
let rpcHealthNotificationPrimed = false;
let walletAssetInspector = createWalletAssetInspector(
  loadPersistedSelectedWalletAssetId(),
  walletAssetSnapshots[loadPersistedSelectedWalletAssetId()] || null
);
let rpcDiscoveryState = {
  query: "",
  chain: null,
  match: null,
  providerKey: "",
  providerLabel: "",
  candidates: [],
  selectedUrls: [],
  transportFilter: "http",
  loading: false,
  summary: null,
  error: ""
};
let rpcChainlistScan = {
  chainKey: "",
  candidates: [],
  selectedUrl: "",
  loading: false,
  summary: null
};
let taskAdvancedVisible = false;
let taskDeleteTargetId = "";
let taskDeletePending = false;
let rpcDeleteTargetId = "";
let rpcDeletePending = false;
let walletDeleteTargetId = "";
let walletDeletePending = false;
let currentMintStartDetection = {
  enabled: false,
  config: null
};
let currentTaskLaunchRecommendation = {
  mode: "",
  waitUntilIso: "",
  reason: ""
};
let currentTaskExecutionBlocker = "";
let currentTaskSourceDiscovery = null;
let currentTaskMintAutofill = null;
let assistantState = {
  loading: false,
  messages: []
};
let assistantRequestController = null;
let assistantRequestToken = 0;
const assistantViewCommands = [
  {
    view: "dashboard",
    label: "Dashboard",
    aliases: ["dashboard", "home", "main dashboard", "control surface"]
  },
  {
    view: "tasks",
    label: "Tasks",
    aliases: ["tasks", "task list", "task board"]
  },
  {
    view: "wallets",
    label: "Wallets",
    aliases: ["wallets", "wallet", "saved wallets"]
  },
  {
    view: "rpc",
    label: "RPC Nodes",
    aliases: ["rpc", "rpc node", "rpc nodes", "rpc mesh", "mesh"]
  },
  {
    view: "assistant",
    label: "Operator AI",
    aliases: ["assistant", "operator ai", "operator", "ai", "copilot"]
  },
  {
    view: "settings",
    label: "Settings",
    aliases: ["settings", "setting", "config", "configuration"]
  }
];

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

function formatUsdBalance(value, fallback = "$--") {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: normalized >= 1000 ? 0 : 2
  }).format(normalized);
}

function formatTokenBalance(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "0";
  }

  if (normalized === 0) {
    return "0";
  }

  if (Math.abs(normalized) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(normalized);
  }

  if (Math.abs(normalized) >= 1) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4
    }).format(normalized);
  }

  if (Math.abs(normalized) >= 0.0001) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    }).format(normalized);
  }

  return normalized.toExponential(2);
}

function summarizeWalletAssets(assets = [], options = {}) {
  const maxItems = Math.max(1, Number(options.maxItems || 2));
  const totals = new Map();

  assets.forEach((asset) => {
    const symbol = String(asset?.assetSymbol || "").trim();
    const balance = Number(asset?.balanceFloat || 0);
    if (!symbol || !Number.isFinite(balance) || balance <= 0) {
      return;
    }

    totals.set(symbol, (totals.get(symbol) || 0) + balance);
  });

  const entries = [...totals.entries()]
    .map(([symbol, amount]) => ({ symbol, amount }))
    .sort((left, right) => right.amount - left.amount);

  if (entries.length === 0) {
    return "";
  }

  const visible = entries
    .slice(0, maxItems)
    .map((entry) => `${formatTokenBalance(entry.amount)} ${entry.symbol}`);

  return entries.length > maxItems ? `${visible.join(" + ")} + ${entries.length - maxItems} more` : visible.join(" + ");
}

function safeLocalStorageGet(key) {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {}
}

function safeLocalStorageRemove(key) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {}
}

function normalizeWalletAssetSnapshot(snapshot = null) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const assets = Array.isArray(snapshot.assets) ? snapshot.assets : [];
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
  const generatedAt = String(snapshot.generatedAt || "").trim();
  const summary = snapshot.summary && typeof snapshot.summary === "object" ? snapshot.summary : null;

  if (!assets.length && !warnings.length && !generatedAt && !summary) {
    return null;
  }

  return {
    assets,
    warnings,
    generatedAt,
    summary
  };
}

function createWalletAssetInspector(walletId = "", snapshot = null, overrides = {}) {
  const normalizedSnapshot = normalizeWalletAssetSnapshot(snapshot);
  return {
    walletId: String(walletId || "").trim(),
    loading: false,
    error: "",
    assets: normalizedSnapshot?.assets || [],
    warnings: normalizedSnapshot?.warnings || [],
    generatedAt: normalizedSnapshot?.generatedAt || "",
    summary: normalizedSnapshot?.summary || null,
    ...overrides
  };
}

function loadPersistedWalletAssetSnapshots() {
  const raw = safeLocalStorageGet(walletAssetSnapshotStorageKey);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([walletId, snapshot]) => [walletId, normalizeWalletAssetSnapshot(snapshot)])
        .filter((entry) => Boolean(entry[0]) && Boolean(entry[1]))
    );
  } catch {
    return {};
  }
}

function persistWalletAssetSnapshots() {
  safeLocalStorageSet(walletAssetSnapshotStorageKey, JSON.stringify(walletAssetSnapshots));
}

function loadPersistedSelectedWalletAssetId() {
  return String(safeLocalStorageGet(walletAssetSelectedStorageKey) || "").trim();
}

function persistSelectedWalletAssetId(walletId) {
  const normalized = String(walletId || "").trim();
  if (!normalized) {
    safeLocalStorageRemove(walletAssetSelectedStorageKey);
    return;
  }

  safeLocalStorageSet(walletAssetSelectedStorageKey, normalized);
}

function getWalletAssetSnapshot(walletId) {
  return normalizeWalletAssetSnapshot(walletAssetSnapshots[String(walletId || "").trim()] || null);
}

function setWalletAssetSnapshot(walletId, snapshot) {
  const normalizedWalletId = String(walletId || "").trim();
  const normalizedSnapshot = normalizeWalletAssetSnapshot(snapshot);
  if (!normalizedWalletId || !normalizedSnapshot) {
    return;
  }

  walletAssetSnapshots = {
    ...walletAssetSnapshots,
    [normalizedWalletId]: normalizedSnapshot
  };
  persistWalletAssetSnapshots();
}

function deleteWalletAssetSnapshot(walletId) {
  const normalizedWalletId = String(walletId || "").trim();
  if (!normalizedWalletId || !Object.prototype.hasOwnProperty.call(walletAssetSnapshots, normalizedWalletId)) {
    return;
  }

  const { [normalizedWalletId]: _removed, ...rest } = walletAssetSnapshots;
  walletAssetSnapshots = rest;
  persistWalletAssetSnapshots();
}

function walletBalanceStateFromSnapshot(snapshot) {
  const normalizedSnapshot = normalizeWalletAssetSnapshot(snapshot);
  if (!normalizedSnapshot) {
    return {};
  }

  return {
    balanceUsd: Number.isFinite(Number(normalizedSnapshot.summary?.totalUsd))
      ? Number(normalizedSnapshot.summary.totalUsd)
      : undefined,
    balanceAssetLabel: summarizeWalletAssets(normalizedSnapshot.assets || [], { maxItems: 2 }) || "",
    balanceUpdatedAt: normalizedSnapshot.generatedAt || undefined
  };
}

function latestWalletAssetSyncAt() {
  return Object.values(walletAssetSnapshots)
    .map((snapshot) => String(snapshot?.generatedAt || "").trim())
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || "";
}

function walletAssetSnapshotAgeMs(snapshot) {
  const generatedAt = String(snapshot?.generatedAt || "").trim();
  if (!generatedAt) {
    return Number.POSITIVE_INFINITY;
  }

  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return Number.isFinite(ageMs) ? ageMs : Number.POSITIVE_INFINITY;
}

function hasFreshWalletAssetSnapshot(walletId, maxAgeMs = walletAssetAutoSyncIntervalMs) {
  return walletAssetSnapshotAgeMs(getWalletAssetSnapshot(walletId)) <= maxAgeMs;
}

function shouldAutoSyncWalletBalances() {
  return (
    state.session.authenticated &&
    state.wallets.length > 0 &&
    state.wallets.some((wallet) => !hasFreshWalletAssetSnapshot(wallet.id))
  );
}

function syncWalletAssetInspectorFromCache() {
  const selectedWalletId = String(walletAssetInspector.walletId || "").trim();
  if (!selectedWalletId) {
    walletAssetInspector = createWalletAssetInspector();
    persistSelectedWalletAssetId("");
    return;
  }

  if (!state.wallets.some((wallet) => wallet.id === selectedWalletId)) {
    walletAssetInspector = createWalletAssetInspector();
    persistSelectedWalletAssetId("");
    deleteWalletAssetSnapshot(selectedWalletId);
    return;
  }

  const snapshot = getWalletAssetSnapshot(selectedWalletId);
  if (!walletAssetInspector.loading && snapshot) {
    walletAssetInspector = createWalletAssetInspector(selectedWalletId, snapshot, {
      error: walletAssetInspector.error || ""
    });
  } else {
    walletAssetInspector.walletId = selectedWalletId;
  }

  persistSelectedWalletAssetId(selectedWalletId);
}

function selectWalletAsset(walletId) {
  const normalizedWalletId = String(walletId || "").trim();
  walletAssetInspector = createWalletAssetInspector(normalizedWalletId, getWalletAssetSnapshot(normalizedWalletId));
  persistSelectedWalletAssetId(normalizedWalletId);
}

function hydrateWalletAssetSnapshotsForCurrentState() {
  const validWalletIds = new Set(state.wallets.map((wallet) => wallet.id));
  const nextSnapshots = Object.fromEntries(
    Object.entries(walletAssetSnapshots).filter(([walletId]) => validWalletIds.has(walletId))
  );

  if (Object.keys(nextSnapshots).length !== Object.keys(walletAssetSnapshots).length) {
    walletAssetSnapshots = nextSnapshots;
    persistWalletAssetSnapshots();
  }

  syncWalletAssetInspectorFromCache();
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

function hasTaskSourceTarget() {
  return Boolean(String(taskSourceTargetInput?.value || "").trim());
}

function syncTaskSourceTypeFromTarget() {
  if (!taskSourceTypeInput) {
    return;
  }

  taskSourceTypeInput.value = hasTaskSourceTarget() ? "opensea" : "generic_contract";
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
      warmupRpc: false,
      multiRpcBroadcast: true,
      smartGasReplacement: false
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
      warmupRpc: false,
      multiRpcBroadcast: true,
      smartGasReplacement: false
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

function utcDateTimeLocalToIsoString(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return "";
  }

  const [, year, month, day, hour, minute] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function isoStringToUtcDateTimeLocalValue(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const date = new Date(timestamp);
  const pad = (entry) => String(entry).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}`;
}

function normalizeTaskQuickDropType(value) {
  const normalized = String(value || "public").trim().toLowerCase();
  return ["public", "pass_fcfs", "allowlist", "gtd"].includes(normalized) ? normalized : "public";
}

function normalizeTaskQuickLaunchSignal(value) {
  const normalized = String(value || "onchain").trim().toLowerCase();
  return ["live", "utc", "onchain", "mempool", "block"].includes(normalized) ? normalized : "onchain";
}

function taskQuickDropTypeLabel(value) {
  const normalized = normalizeTaskQuickDropType(value);
  if (normalized === "pass_fcfs") {
    return "Pass Holder / FCFS";
  }
  if (normalized === "allowlist") {
    return "Allowlist / Proof";
  }
  if (normalized === "gtd") {
    return "GTD / Guaranteed";
  }
  return "Public / Open Mint";
}

function taskQuickLaunchSignalLabel(value) {
  const normalized = normalizeTaskQuickLaunchSignal(value);
  if (normalized === "utc") {
    return "UTC Schedule";
  }
  if (normalized === "live") {
    return "Run ASAP";
  }
  if (normalized === "mempool") {
    return "Mempool Trigger";
  }
  if (normalized === "block") {
    return "Exact Block";
  }
  return "On-Chain Open";
}

function taskQuickSourceStage(dropType) {
  const normalized = normalizeTaskQuickDropType(dropType);
  if (normalized === "allowlist") {
    return "allowlist";
  }
  if (normalized === "gtd" || normalized === "pass_fcfs") {
    return "gtd";
  }
  return "public";
}

function recommendedTaskLatencyProfile(dropType, launchSignal) {
  const normalizedDropType = normalizeTaskQuickDropType(dropType);
  const normalizedLaunchSignal = normalizeTaskQuickLaunchSignal(launchSignal);

  if (normalizedDropType === "public") {
    return "ultra_low_latency";
  }

  if (normalizedLaunchSignal === "mempool" || normalizedLaunchSignal === "block") {
    return "ultra_low_latency";
  }

  if (normalizedDropType === "allowlist" || normalizedDropType === "gtd" || normalizedDropType === "pass_fcfs") {
    return "low_latency";
  }

  return "low_latency";
}

function taskQuickDropTypeFromTask(task = null) {
  const sourceStage = String(task?.sourceStage || "").trim().toLowerCase();
  const descriptor = `${task?.name || ""} ${
    Array.isArray(task?.tags) ? task.tags.join(" ") : String(task?.tags || "")
  } ${task?.mintFunction || ""}`.toLowerCase();

  if (sourceStage === "allowlist") {
    return "allowlist";
  }

  if (sourceStage === "gtd") {
    return /pass|holder|fcfs/.test(descriptor) ? "pass_fcfs" : "gtd";
  }

  if (sourceStage === "custom" && task?.claimIntegrationEnabled) {
    return "allowlist";
  }

  return "public";
}

function taskQuickLaunchSignalFromTask(task = null) {
  const triggerMode = String(task?.executionTriggerMode || "standard").trim().toLowerCase();

  if (triggerMode === "block") {
    return "block";
  }

  if (triggerMode === "mempool") {
    return "mempool";
  }

  if (task?.useSchedule) {
    return "utc";
  }

  if (task?.readyCheckFunction || task?.mintStartDetectionEnabled) {
    return "onchain";
  }

  return "live";
}

function enforcePublicMintTaskDefaults() {
  if (taskQuickDropTypeInput) {
    taskQuickDropTypeInput.value = "public";
  }

  if (taskSourceStageInput) {
    taskSourceStageInput.value = "public";
  }

  syncTaskSourceTypeFromTarget();

  if (taskAutoPhaseToggle) {
    taskAutoPhaseToggle.checked = false;
    taskAutoPhaseToggle.disabled = true;
  }

  if (taskClaimIntegrationToggle) {
    taskClaimIntegrationToggle.checked = false;
  }
  if (taskClaimProjectKeyInput) {
    taskClaimProjectKeyInput.value = "";
  }
  if (taskClaimFetchToggle) {
    taskClaimFetchToggle.checked = false;
  }
  if (taskClaimFetchUrlInput) {
    taskClaimFetchUrlInput.value = "";
  }
  if (taskClaimFetchMethodInput) {
    taskClaimFetchMethodInput.value = "GET";
  }
  if (taskClaimResponseRootInput) {
    taskClaimResponseRootInput.value = "";
  }
  if (taskWalletClaimsInput) {
    taskWalletClaimsInput.value = "";
  }
  if (taskClaimFetchHeadersInput) {
    taskClaimFetchHeadersInput.value = "";
  }
  if (taskClaimFetchCookiesInput) {
    taskClaimFetchCookiesInput.value = "";
  }
  if (taskClaimFetchBodyInput) {
    taskClaimFetchBodyInput.value = "";
  }
  if (taskClaimResponseMappingInput) {
    taskClaimResponseMappingInput.value = "";
  }

  if (taskQuickProofHint) {
    taskQuickProofHint.textContent = "";
    taskQuickProofHint.classList.add("hidden");
  }

  if (taskAutoArmToggle) {
    taskAutoArmToggle.checked = true;
    taskAutoArmToggle.disabled = true;
  }

  if (taskWalletModeInput) {
    taskWalletModeInput.value = "parallel";
    taskWalletModeInput.disabled = true;
  }

  if (taskTransferToggle) {
    taskTransferToggle.checked = false;
    taskTransferToggle.disabled = true;
  }

  if (taskTransferAddressInput) {
    taskTransferAddressInput.value = "";
    taskTransferAddressInput.disabled = true;
  }

  if (taskGasStrategyInput) {
    taskGasStrategyInput.value = "aggressive";
    taskGasStrategyInput.disabled = true;
  }

  if (taskWarmupToggle) {
    taskWarmupToggle.checked = true;
    taskWarmupToggle.disabled = true;
  }

  if (taskMultiRpcBroadcastToggle) {
    taskMultiRpcBroadcastToggle.checked = true;
    taskMultiRpcBroadcastToggle.disabled = true;
  }

  if (taskSmartReplaceToggle) {
    taskSmartReplaceToggle.checked = true;
    taskSmartReplaceToggle.disabled = true;
  }

  if (taskLatencyProfileInput) {
    taskLatencyProfileInput.value = "ultra_low_latency";
    taskLatencyProfileInput.disabled = true;
  }

  applyLatencyProfile("ultra_low_latency");
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

function walletDisplayBalance(wallet, options = {}) {
  if (wallet?.balanceLoading) {
    return options.loadingLabel || "Loading...";
  }

  const assetLabel = String(wallet?.balanceAssetLabel || "").trim();
  const usdValue = Number(wallet?.balanceUsd);
  if (assetLabel && (!Number.isFinite(usdValue) || Math.abs(usdValue) < 0.01)) {
    return assetLabel;
  }

  return formatUsdBalance(wallet?.balanceUsd, options.fallback || "$--");
}

function mergeWalletBalanceState(wallets = []) {
  const existingBalances = new Map(
    state.wallets.map((wallet) => [
      wallet.id,
      {
        balanceUsd: wallet.balanceUsd,
        balanceAssetLabel: wallet.balanceAssetLabel,
        balanceLoading: wallet.balanceLoading,
        balanceError: wallet.balanceError,
        balanceUpdatedAt: wallet.balanceUpdatedAt
      }
    ])
  );

  return wallets.map((wallet) => ({
    ...wallet,
    ...walletBalanceStateFromSnapshot(getWalletAssetSnapshot(wallet.id)),
    ...(existingBalances.get(wallet.id) || {})
  }));
}

function patchWalletBalance(walletId, patch) {
  state.wallets = state.wallets.map((wallet) => (wallet.id === walletId ? { ...wallet, ...patch } : wallet));
}

function stopWalletAssetAutoSync() {
  if (walletAssetsAutoSyncKickTimer) {
    window.clearTimeout(walletAssetsAutoSyncKickTimer);
    walletAssetsAutoSyncKickTimer = null;
  }

  if (walletAssetsAutoSyncTimer) {
    window.clearInterval(walletAssetsAutoSyncTimer);
    walletAssetsAutoSyncTimer = null;
  }

  walletAssetsAutoSyncInFlight = false;
}

function stopRpcHealthAutoPulse() {
  if (rpcHealthAutoPulseKickTimer) {
    window.clearTimeout(rpcHealthAutoPulseKickTimer);
    rpcHealthAutoPulseKickTimer = null;
  }

  if (rpcHealthAutoPulseTimer) {
    window.clearInterval(rpcHealthAutoPulseTimer);
    rpcHealthAutoPulseTimer = null;
  }

  rpcHealthAutoPulseInFlight = false;
}

function stopMintRadarAutoSync() {
  if (mintRadarAutoSyncKickTimer) {
    window.clearTimeout(mintRadarAutoSyncKickTimer);
    mintRadarAutoSyncKickTimer = null;
  }

  if (mintRadarAutoSyncTimer) {
    window.clearInterval(mintRadarAutoSyncTimer);
    mintRadarAutoSyncTimer = null;
  }
}

function ensureWalletAssetAutoSync() {
  if (walletAssetsAutoSyncTimer || typeof window === "undefined") {
    return;
  }

  walletAssetsAutoSyncTimer = window.setInterval(() => {
    if (shouldAutoSyncWalletBalances()) {
      void refreshAllWalletBalances({ silent: true, source: "auto" });
    }
  }, walletAssetAutoSyncIntervalMs);
}

function shouldAutoSyncRpcHealth() {
  if (!state.session.authenticated) {
    return false;
  }

  const enabledNodes = state.rpcNodes.filter((node) => node.enabled !== false);
  if (!enabledNodes.length) {
    return false;
  }

  return enabledNodes.some((node) => {
    const checkedAt = new Date(node.lastHealth?.checkedAt || 0).getTime();
    return checkedAt <= 0 || Date.now() - checkedAt >= rpcHealthAutoPulseIntervalMs;
  });
}

function ensureRpcHealthAutoPulse() {
  if (rpcHealthAutoPulseTimer || typeof window === "undefined") {
    return;
  }

  rpcHealthAutoPulseTimer = window.setInterval(() => {
    if (shouldAutoSyncRpcHealth()) {
      void pulseRpcMesh({ silent: true }).catch(() => {});
    }
  }, rpcHealthAutoPulseIntervalMs);
}

function shouldAutoSyncMintRadar() {
  if (!state.session.authenticated || state.mintRadar.loading) {
    return false;
  }

  if (state.currentView !== "mint-radar" && (!Array.isArray(state.mintRadar.items) || state.mintRadar.items.length === 0)) {
    return false;
  }

  const fetchedAt = new Date(state.mintRadar.fetchedAt || 0).getTime();
  return fetchedAt <= 0 || Date.now() - fetchedAt >= mintRadarAutoSyncIntervalMs;
}

function ensureMintRadarAutoSync() {
  if (mintRadarAutoSyncTimer || typeof window === "undefined") {
    return;
  }

  mintRadarAutoSyncTimer = window.setInterval(() => {
    if (shouldAutoSyncMintRadar()) {
      void loadMintRadar({ forceRefresh: true, quiet: true, source: "auto" }).catch(() => {});
    }
  }, mintRadarAutoSyncIntervalMs);
}

function rpcHealthCadenceLabel(intervalMs = rpcHealthAutoPulseIntervalMs) {
  const totalSeconds = Math.max(1, Math.round(Number(intervalMs || 0) / 1000));
  if (totalSeconds % 60 === 0) {
    return `${Math.round(totalSeconds / 60)}m`;
  }
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds}s`;
}

function latestRpcHealthCheckedAt(rpcNodes = state.rpcNodes) {
  return (
    (rpcNodes || [])
      .map((node) => String(node?.lastHealth?.checkedAt || "").trim())
      .filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || ""
  );
}

function rpcHealthNotificationLabel(node) {
  const nodeLabel = rpcAlertNodeLabel(node);
  const chain = node?.chainLabel || chainLabel(node?.chainKey);
  return chain ? `${nodeLabel} on ${chain}` : nodeLabel;
}

function describeRpcHealthNodes(nodes = [], maxItems = 2) {
  const labels = nodes.map((node) => rpcHealthNotificationLabel(node)).filter(Boolean);
  const preview = labels.slice(0, maxItems);
  if (!preview.length) {
    return "RPC node";
  }
  return `${formatLabelList(preview)}${labels.length > maxItems ? ` +${labels.length - maxItems} more` : ""}`;
}

function renderRpcHealthSyncStatus(rpcNodes = state.rpcNodes) {
  if (rpcPagePulseButton) {
    rpcPagePulseButton.disabled = state.rpcNodes.length === 0 || rpcHealthAutoPulseInFlight;
    rpcPagePulseButton.textContent = rpcHealthAutoPulseInFlight ? "Refreshing..." : "Refresh";
  }

  if (rpcPulseButton) {
    rpcPulseButton.disabled = state.rpcNodes.length === 0 || rpcHealthAutoPulseInFlight;
  }

  if (!rpcHealthSyncStatus) {
    return;
  }

  if (!state.session.authenticated) {
    rpcHealthSyncStatus.textContent = "";
    return;
  }

  const enabledNodes = (rpcNodes || []).filter((node) => node.enabled !== false);
  if (rpcHealthAutoPulseInFlight) {
    rpcHealthSyncStatus.textContent = "Auto-sync is refreshing RPC health now...";
    return;
  }

  if (!enabledNodes.length) {
    rpcHealthSyncStatus.textContent = `Auto-sync on - add an RPC endpoint to start health checks every ${rpcHealthCadenceLabel()}.`;
    return;
  }

  const latestCheckedAt = latestRpcHealthCheckedAt(enabledNodes);
  rpcHealthSyncStatus.textContent = latestCheckedAt
    ? `Auto-sync on - checks every ${rpcHealthCadenceLabel()}. Last mesh pulse ${relativeTime(latestCheckedAt)}.`
    : `Auto-sync on - waiting for the first mesh pulse. Checks run every ${rpcHealthCadenceLabel()}.`;
}

function notifyRpcHealthTransitions(previousNodes = [], nextNodes = []) {
  if (!state.session.authenticated) {
    rpcHealthNotificationPrimed = false;
    return;
  }

  const enabledNodes = (nextNodes || []).filter((node) => node.enabled !== false);
  if (!rpcHealthNotificationPrimed) {
    rpcHealthNotificationPrimed = true;
    const downNodes = enabledNodes.filter((node) => node.lastHealth?.status === "error");
    if (downNodes.length > 0) {
      showToast(
        `${describeRpcHealthNodes(downNodes)} failed the latest health check. Open RPC Nodes to repair the endpoint${downNodes.length === 1 ? "" : "s"}.`,
        "error",
        downNodes.length === 1 ? "RPC Failure Detected" : "RPC Failures Detected"
      );
    }
    return;
  }

  const previousById = new Map((previousNodes || []).map((node) => [node.id, node]));
  const newlyDown = enabledNodes.filter(
    (node) => node.lastHealth?.status === "error" && previousById.get(node.id)?.lastHealth?.status !== "error"
  );
  const recovered = enabledNodes.filter(
    (node) => node.lastHealth?.status === "healthy" && previousById.get(node.id)?.lastHealth?.status === "error"
  );

  if (newlyDown.length > 0) {
    showToast(
      `${describeRpcHealthNodes(newlyDown)} failed the latest health check. Open RPC Nodes to repair the endpoint${newlyDown.length === 1 ? "" : "s"}.`,
      "error",
      newlyDown.length === 1 ? "RPC Failure Detected" : "RPC Failures Detected"
    );
  }

  if (recovered.length > 0) {
    const remainingDownCount = enabledNodes.filter((node) => node.lastHealth?.status === "error").length;
    showToast(
      remainingDownCount === 0
        ? `${describeRpcHealthNodes(recovered)} recovered. The tracked RPC mesh is back online.`
        : `${describeRpcHealthNodes(recovered)} recovered, but ${pluralize(remainingDownCount, "RPC node")} still need attention.`,
      "success",
      remainingDownCount === 0
        ? "RPC Mesh Recovered"
        : recovered.length === 1
          ? "RPC Recovered"
          : "RPCs Recovered"
    );
  }
}

function renderRpcHealthSurfaces() {
  renderShellTelemetry();
  renderDashboard();
  renderRpcNodes();

  if (!taskModal.classList.contains("hidden")) {
    renderRpcSelector(selectedRpcIds());
  }
}

function applyRpcHealthProbeResults(results = [], options = {}) {
  const { notifyTransitions = true } = options;
  if (!Array.isArray(results) || results.length === 0 || state.rpcNodes.length === 0) {
    renderRpcHealthSyncStatus();
    return false;
  }

  const healthById = new Map(
    results
      .filter((entry) => entry && entry.id)
      .map((entry) => [entry.id, entry.health && typeof entry.health === "object" ? { ...entry.health } : null])
  );

  if (!healthById.size) {
    renderRpcHealthSyncStatus();
    return false;
  }

  const previousRpcNodes = state.rpcNodes;
  let updated = false;
  state.rpcNodes = state.rpcNodes.map((node) => {
    if (!healthById.has(node.id)) {
      return node;
    }
    updated = true;
    return {
      ...node,
      lastHealth: healthById.get(node.id)
    };
  });

  if (!updated) {
    renderRpcHealthSyncStatus();
    return false;
  }

  if (notifyTransitions) {
    notifyRpcHealthTransitions(previousRpcNodes, state.rpcNodes);
  }

  renderRpcHealthSurfaces();
  return true;
}

function scheduleWalletAssetAutoSync(options = {}) {
  const { immediate = false } = options;
  if (!state.session.authenticated) {
    stopWalletAssetAutoSync();
    return;
  }

  ensureWalletAssetAutoSync();
  if (!immediate || walletAssetsAutoSyncKickTimer || walletAssetsRefreshAllInFlight || walletAssetsAutoSyncInFlight) {
    return;
  }

  if (!shouldAutoSyncWalletBalances()) {
    return;
  }

  walletAssetsAutoSyncKickTimer = window.setTimeout(() => {
    walletAssetsAutoSyncKickTimer = null;
    if (shouldAutoSyncWalletBalances()) {
      void refreshAllWalletBalances({ silent: true, source: "auto" });
    }
  }, 500);
}

function scheduleRpcHealthAutoPulse(options = {}) {
  const { immediate = false } = options;
  if (!state.session.authenticated) {
    stopRpcHealthAutoPulse();
    return;
  }

  ensureRpcHealthAutoPulse();
  if (!immediate || rpcHealthAutoPulseKickTimer || rpcHealthAutoPulseInFlight) {
    return;
  }

  if (!shouldAutoSyncRpcHealth()) {
    return;
  }

  rpcHealthAutoPulseKickTimer = window.setTimeout(() => {
    rpcHealthAutoPulseKickTimer = null;
    if (shouldAutoSyncRpcHealth()) {
      void pulseRpcMesh({ silent: true }).catch(() => {});
    }
  }, 1200);
}

function scheduleMintRadarAutoSync(options = {}) {
  const { immediate = false } = options;
  if (!state.session.authenticated) {
    stopMintRadarAutoSync();
    return;
  }

  ensureMintRadarAutoSync();
  if (!immediate || mintRadarAutoSyncKickTimer || !shouldAutoSyncMintRadar()) {
    return;
  }

  mintRadarAutoSyncKickTimer = window.setTimeout(() => {
    mintRadarAutoSyncKickTimer = null;
    if (shouldAutoSyncMintRadar()) {
      void loadMintRadar({ forceRefresh: true, quiet: true, source: "auto" }).catch(() => {});
    }
  }, 800);
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
  if (logoutButton) {
    logoutButton.classList.toggle("hidden", !authenticated || !authRequired);
  }

  if (!authenticated && authRequired) {
    stopWalletAssetAutoSync();
    stopRpcHealthAutoPulse();
    stopMintRadarAutoSync();
    rpcHealthNotificationPrimed = false;
    if (rpcHealthSyncStatus) {
      rpcHealthSyncStatus.textContent = "";
    }
    assistantState = {
      loading: false,
      messages: []
    };
    assistantInput.value = "";
    if (accountLabel) {
      accountLabel.textContent = "Secure Operator";
    }
    if (accountStatus) {
      accountStatus.textContent = "Sign in required";
    }
    loginPasswordInput.value = "";
    window.setTimeout(() => {
      if (!authOverlay.classList.contains("hidden")) {
        loginUsernameInput.focus();
      }
    }, 0);
  }

  renderAssistant();
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

const TASK_STATUS_ORDER = ["queued", "running", "completed", "failed", "stopped", "draft"];

const TASK_STATUS_META = {
  running: {
    label: "Running",
    tone: "running",
    detail: "Live execution in progress"
  },
  queued: {
    label: "Queued",
    tone: "queued",
    detail: "Waiting in the launch queue"
  },
  draft: {
    label: "Draft",
    tone: "draft",
    detail: "Preset saved and waiting for operator action"
  },
  completed: {
    label: "Completed",
    tone: "completed",
    detail: "Finished successfully"
  },
  failed: {
    label: "Failed",
    tone: "failed",
    detail: "Needs operator review"
  },
  stopped: {
    label: "Stopped",
    tone: "stopped",
    detail: "Stopped by the operator"
  },
};

function taskStatusMeta(status) {
  const key = String(status || "draft").toLowerCase();
  if (key === "all") {
    return {
      key,
      label: "All Statuses",
      tone: "all",
      detail: "View every task session"
    };
  }

  const meta = TASK_STATUS_META[key];
  if (meta) {
    return { key, ...meta };
  }

  return {
    key,
    label: key ? `${key[0].toUpperCase()}${key.slice(1)}` : "Draft",
    tone: "draft",
    detail: "Task state available"
  };
}

function buildTaskRuntimePipeline(task) {
  const rpcCount = Math.max(
    0,
    Number(task?.rpcCount || (Array.isArray(task?.rpcNodeIds) ? task.rpcNodeIds.length : 0) || 0)
  );
  const walletCount = Math.max(
    0,
    Number(task?.walletCount || (Array.isArray(task?.walletIds) ? task.walletIds.length : 0) || 0)
  );
  const sourceLabel = task?.sourceLabel || findMintSourceDefinition(task?.sourceType).label;
  const mintFunction = String(task?.mintFunction || "").trim() || "auto route";
  const priceLabel = String(task?.priceEth || "").trim() ? `${task.priceEth} ETH` : "auto value";
  const gasStrategy = String(task?.gasStrategy || "normal").trim().toLowerCase() || "normal";
  const gasProfileLabel =
    gasStrategy === "aggressive"
      ? "aggressive gas profile"
      : gasStrategy === "custom"
        ? "custom gas profile"
        : "standard gas profile";
  const broadcastLabel = task?.multiRpcBroadcast ? "multi-RPC mesh" : "primary RPC lane";
  const receiptTraceLabel = task?.waitForReceipt
    ? "tracking mempool echoes, block inclusion, and receipt outcome"
    : "capturing the first accepted hash and closing on fast-submit mode";
  const receiptDetail = task?.waitForReceipt
    ? "Watching mempool propagation, inclusion, and the final receipt outcome."
    : "Fast-submit mode closes the run as soon as the first accepted hash is secured.";

  return [
    {
      key: "backend",
      code: "CTRL",
      label: "Linking execution lane",
      shortLabel: "Exec Link",
      detail: "Handshaking with the backend runner and reserving a live launch lane.",
      traceLabel: "negotiating a live launch lane with the backend runner"
    },
    {
      key: "rpc",
      code: "RPC",
      label: "Scoring RPC lanes",
      shortLabel: "RPC Mesh",
      detail: "Health-ranking broadcast endpoints and selecting the primary route.",
      traceLabel:
        rpcCount > 0
          ? `health-scoring ${pluralize(rpcCount, "rpc lane")} and selecting the primary broadcaster`
          : "health-scoring available rpc lanes and selecting the primary broadcaster"
    },
    {
      key: "gas",
      code: "GAS",
      label: "Deriving fee plan",
      shortLabel: "Fee Plan",
      detail: "Sampling fee data, nonce state, and replacement budget for the live send.",
      traceLabel: `sampling fee data, nonce state, and ${gasProfileLabel}`
    },
    {
      key: "route",
      code: "ROUTE",
      label: "Locking mint route",
      shortLabel: "Route Lock",
      detail: "Binding the route, value, and launch guards before payload construction.",
      traceLabel: `locking ${mintFunction} on ${sourceLabel} with ${priceLabel}`
    },
    {
      key: "payload",
      code: "PAYLOAD",
      label: "Forging payload",
      shortLabel: "Payload Forge",
      detail: "Encoding calldata, validating the path, and staging signed execution payloads.",
      traceLabel:
        walletCount > 0
          ? `encoding ${mintFunction} for ${pluralize(walletCount, "wallet")} and staging the signed payload`
          : `encoding ${mintFunction} and staging the signed payload`
    },
    {
      key: "broadcast",
      code: "BURST",
      label: "Broadcasting strike",
      shortLabel: "Burst Cast",
      detail: "Pushing the signed payload through the active broadcast route.",
      traceLabel: `propagating the signed payload through the ${broadcastLabel}`
    },
    {
      key: "receipt",
      code: "TRACE",
      label: task?.waitForReceipt ? "Tracing chain outcome" : "Capturing accepted hash",
      shortLabel: task?.waitForReceipt ? "Chain Trace" : "Hash Capture",
      detail: receiptDetail,
      traceLabel: receiptTraceLabel
    },
    {
      key: "seal",
      code: "ARCHIVE",
      label: "Sealing run snapshot",
      shortLabel: "Run Seal",
      detail: "Persisting hashes, summary metrics, and the last-run snapshot.",
      traceLabel: "writing the execution snapshot, hash ledger, and terminal summary"
    }
  ];
}

function normalizeTaskPhaseKey(phase = "") {
  const normalized = String(phase || "").trim().toLowerCase();
  if (!normalized) {
    return "ready";
  }

  if (normalized.includes("queue")) {
    return "queued";
  }

  if (normalized.includes("pre-sign")) {
    return "pre-signing";
  }

  if (normalized.includes("broadcast")) {
    return "broadcasting";
  }

  if (normalized.includes("sett")) {
    return "settling";
  }

  if (normalized.includes("final")) {
    return "finalizing";
  }

  if (normalized.includes("prepar")) {
    return "preparing";
  }

  if (normalized.includes("schedul") || normalized.includes("waiting")) {
    return "waiting";
  }

  if (normalized.includes("arm")) {
    return "arming";
  }

  if (normalized.includes("complete")) {
    return "completed";
  }

  if (normalized.includes("fail")) {
    return "failed";
  }

  if (normalized.includes("stop")) {
    return "stopped";
  }

  return normalized;
}

function resolveTaskRuntimeStageIndex(statusKey, phaseKey, progressPercent) {
  if (statusKey === "completed" || phaseKey === "completed" || phaseKey === "finalizing") {
    return 7;
  }

  if (phaseKey === "broadcasting") {
    return 5;
  }

  if (phaseKey === "settling") {
    return 6;
  }

  if (phaseKey === "pre-signing") {
    return progressPercent >= 28 ? 4 : 2;
  }

  if (phaseKey === "arming" || phaseKey === "waiting") {
    return 3;
  }

  if (phaseKey === "preparing") {
    if (progressPercent <= 3) {
      return 0;
    }

    return progressPercent <= 10 ? 1 : 2;
  }

  return 0;
}

function buildTaskTraceWindow(pipeline, stageIndex, mode = "running") {
  const windowStart = Math.max(0, Math.min(stageIndex - 1, pipeline.length - 3));
  const visibleStages = pipeline.slice(windowStart, Math.min(pipeline.length, windowStart + 3));

  return visibleStages.map((stage, index) => {
    const absoluteIndex = windowStart + index;
    let state = "pending";

    if (mode === "completed") {
      state = "complete";
    } else if (mode === "failed" || mode === "stopped") {
      if (absoluteIndex < stageIndex) {
        state = "complete";
      } else if (absoluteIndex === stageIndex) {
        state = "error";
      }
    } else if (absoluteIndex < stageIndex) {
      state = "complete";
    } else if (absoluteIndex === stageIndex) {
      state = "active";
    }

    return {
      code: stage.code,
      label: stage.traceLabel,
      state
    };
  });
}

function taskRuntimeNarrative(task, statusKey = "draft") {
  const progress = task?.progress || { phase: "Ready", percent: 0 };
  const progressPercent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const phaseKey = normalizeTaskPhaseKey(progress.phase);
  const pipeline = buildTaskRuntimePipeline(task);

  if (statusKey === "draft" || statusKey === "ready") {
    return {
      phaseLabel: "Standby",
      detail: "Awaiting operator command before the control plane goes live.",
      signalLabel: "Execution standby",
      sidebarLabel: "Standby",
      trace: [
        { code: "IDLE", label: "launch lane parked until the next operator strike", state: "active" },
        { code: "RPC", label: "broadcast routes idle until execution is requested", state: "pending" },
        { code: "EXEC", label: "payload assembly begins when the run is armed", state: "pending" }
      ]
    };
  }

  if (statusKey === "queued" || phaseKey === "queued") {
    return {
      phaseLabel: "Launch lane armed",
      detail: "The control plane accepted the task and is opening a live execution lane.",
      signalLabel: "Launch lane armed",
      sidebarLabel: "Queue Armed",
      trace: [
        { code: "QUEUE", label: "launch request accepted and staged by the scheduler", state: "complete" },
        { code: "HANDOFF", label: "opening the execution lane on the backend runner", state: "active" },
        { code: "EXEC", label: "wallet sessions and route locks arming next", state: "pending" }
      ]
    };
  }

  if (statusKey === "failed" || statusKey === "stopped") {
    const stageIndex = resolveTaskRuntimeStageIndex(statusKey, phaseKey, progressPercent);
    return {
      phaseLabel: statusKey === "stopped" ? "Operator abort" : "Route fault",
      detail:
        statusKey === "stopped"
          ? "Execution was interrupted by operator command before the strike completed."
          : "Execution fault captured. Inspect the backend terminal and latest logs for the failure surface.",
      signalLabel: statusKey === "stopped" ? "Abort signal pushed" : "Fault captured",
      sidebarLabel: statusKey === "stopped" ? "Abort Signal" : "Route Fault",
      trace: buildTaskTraceWindow(pipeline, stageIndex, statusKey)
    };
  }

  const stageIndex = resolveTaskRuntimeStageIndex(statusKey, phaseKey, progressPercent);
  const stage = pipeline[stageIndex];

  if (statusKey === "completed") {
    return {
      phaseLabel: stage.label,
      detail: stage.detail,
      signalLabel: task?.waitForReceipt ? "Receipt archived" : "Hash archived",
      sidebarLabel: stage.shortLabel,
      trace: buildTaskTraceWindow(pipeline, stageIndex, "completed")
    };
  }

  return {
    phaseLabel: stage.label,
    detail: stage.detail,
    signalLabel: stage.shortLabel,
    sidebarLabel: stage.shortLabel,
    trace: buildTaskTraceWindow(pipeline, stageIndex, "running")
  };
}

function taskVisualStatus(task, activeTaskIdSet = null) {
  const activeIds = activeTaskIdSet || new Set(activeTaskIds());
  if (activeIds.has(task.id) && state.runState.status === "running") {
    return "running";
  }

  const normalized = String(task.status || "draft").toLowerCase();
  if (normalized === "done") {
    return Number(task?.summary?.success || 0) > 0 || Number(task?.history?.[0]?.summary?.success || 0) > 0
      ? "completed"
      : "draft";
  }

  if (normalized === "ready") {
    return "draft";
  }

  return TASK_STATUS_META[normalized] ? normalized : "draft";
}

function taskHistoryStatusMeta(entry = {}) {
  const status = String(entry?.status || "").trim().toLowerCase();
  const summary = entry?.summary || {};

  if (status === "failed") {
    return {
      tone: "failed",
      label: "Failed"
    };
  }

  if (status === "stopped") {
    return {
      tone: "stopped",
      label: "Stopped"
    };
  }

  if ((summary.failed || 0) > 0 && (summary.success || 0) > 0) {
    return {
      tone: "queued",
      label: "Partial"
    };
  }

  return {
    tone: "completed",
    label: "Completed"
  };
}

function taskHistorySummaryCopy(entry = {}) {
  const summary = entry?.summary || {};
  const hashCount = Array.isArray(summary.hashes) ? summary.hashes.length : 0;
  const total = Number(summary.total || 0);
  const success = Number(summary.success || 0);
  const failed = Number(summary.failed || 0);
  const stopped = Number(summary.stopped || 0);

  if (success > 0 || failed > 0 || stopped > 0 || total > 0) {
    return `${success} success / ${failed} failed / ${stopped} stopped / ${hashCount} ${
      hashCount === 1 ? "hash" : "hashes"
    }`;
  }

  return hashCount > 0 ? `${hashCount} ${hashCount === 1 ? "hash" : "hashes"} captured` : "No transaction hash recorded";
}

function renderTaskHistoryItems(task) {
  const entries = Array.isArray(task?.history) ? task.history.slice(0, 4) : [];
  if (entries.length === 0) {
    return `<p class="muted-copy">No run history recorded yet.</p>`;
  }

  return `<div class="history-list">
    ${entries
      .map((entry) => {
        const summary = entry?.summary || {};
        const hashList = Array.isArray(summary.hashes) ? summary.hashes.slice(0, 2) : [];
        const statusMeta = taskHistoryStatusMeta(entry);
        const errorText = String(entry?.error || "").trim();
        const durationLabel =
          Number(entry?.durationMs || 0) > 0 ? ` in ${formatDuration(entry.durationMs)}` : "";

        return `
          <div class="history-item">
            <div class="history-item-head">
              <strong>${escapeHtml(new Date(entry.ranAt).toLocaleString())}${escapeHtml(durationLabel)}</strong>
              <span class="status-pill ${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span>
            </div>
            <p class="muted-copy history-item-copy">${escapeHtml(taskHistorySummaryCopy(entry))}</p>
            ${
              hashList.length
                ? `<div class="history-hash-row">
                    ${hashList
                      .map((hash) => `<span class="wallet-chip history-hash-chip">${escapeHtml(truncateMiddle(hash, 12, 8))}</span>`)
                      .join("")}
                  </div>`
                : ""
            }
            ${errorText ? `<p class="muted-copy history-error-copy">${escapeHtml(truncateMiddle(errorText, 120, 36))}</p>` : ""}
          </div>
        `;
      })
      .join("")}
  </div>`;
}

function summarizeTaskStatuses(tasks, activeTaskIdSet = null) {
  const activeIds = activeTaskIdSet || new Set(activeTaskIds());
  const counts = TASK_STATUS_ORDER.reduce((map, status) => {
    map[status] = 0;
    return map;
  }, {});

  tasks.forEach((task) => {
    const status = taskVisualStatus(task, activeIds);
    counts[status] = (counts[status] || 0) + 1;
  });

  return counts;
}

function resolveTaskPrimaryAction(statusKey, active, queued) {
  if (active) {
    return {
      action: "stop",
      label: "Stop",
      className: "mini-button fx-button task-action-primary",
      disabled: false
    };
  }

  if (queued) {
    return {
      action: "queued",
      label: "Queued",
      className: "mini-button fx-button task-action-primary",
      disabled: true
    };
  }

  if (statusKey === "failed" || statusKey === "stopped") {
    return {
      action: "run",
      label: "Re-Run",
      className: "mini-button primary fx-button task-action-primary",
      disabled: false
    };
  }

  if (statusKey === "completed") {
    return null;
  }

  return {
    action: "run",
    label: "Run",
    className: "mini-button primary fx-button task-action-primary",
    disabled: false
  };
}

function buildTaskActionMarkup(statusKey, active, queued) {
  const actions = [
    {
      action: "edit",
      label: "Edit",
      className: "mini-button fx-button",
      disabled: false
    },
    {
      action: "duplicate",
      label: "Duplicate",
      className: "mini-button fx-button",
      disabled: false
    },
    {
      action: "delete",
      label: "Delete",
      className: "mini-button danger fx-button",
      disabled: false
    }
  ];

  const primaryAction = resolveTaskPrimaryAction(statusKey, active, queued);
  if (primaryAction) {
    actions.push(primaryAction);
  }

  return actions
    .map(
      (action) => `
        <button class="${escapeHtml(action.className)}" data-task-action="${escapeHtml(action.action)}" ${
          action.disabled ? "disabled" : ""
        }>${escapeHtml(action.label)}</button>
      `
    )
    .join("");
}

function walletGroups() {
  return ["All", ...new Set(state.wallets.map((wallet) => wallet.group || "Imported"))];
}

function chainLabel(chainKey) {
  return state.chains.find((chain) => chain.key === chainKey)?.label || chainKey || "Unknown";
}

const rpcChainAliases = {
  ethereum: ["ethereum", "eth", "mainnet", "mainnet eth", "eth mainnet"],
  bsc: ["bsc", "bnb", "bnb chain", "binance smart chain", "bnb smart chain"],
  sepolia: ["sepolia", "eth sepolia", "ethereum sepolia"],
  optimism: ["optimism", "op", "optimism mainnet"],
  polygon: ["polygon", "matic", "polygon mainnet"],
  base: ["base", "base mainnet"],
  base_sepolia: ["base sepolia", "base testnet"],
  arbitrum: ["arbitrum", "arb", "arbitrum one"],
  blast: ["blast"],
  scroll: ["scroll", "scroll mainnet"],
  zora: ["zora", "zora mainnet"],
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

function currentTaskCollectionFallbackLabel() {
  const target = String(taskSourceTargetInput?.value || "").trim();
  if (!target) {
    return "";
  }

  try {
    const url = new URL(target);
    const slugMatch = String(url.pathname || "").match(/\/collection\/([^/?#]+)/i);
    if (slugMatch?.[1]) {
      return slugMatch[1];
    }

    const normalizedPath = String(url.pathname || "").replace(/^\/+|\/+$/g, "");
    return normalizedPath || target;
  } catch {
    const slugMatch = target.match(/collection\/([^/?#]+)/i);
    return slugMatch?.[1] || target;
  }
}

function selectedTaskWalletRecords() {
  const selectedIds = selectedWalletIds();
  return state.wallets.filter((wallet) => selectedIds.includes(wallet.id));
}

function updateTaskMintSummary() {
  if (
    !taskDiscoveryCollectionInput ||
    !taskDestinationWalletInput ||
    !taskDiscoveryNftContractInput ||
    !taskDiscoveryRouteContractInput ||
    !taskMintRouteHint
  ) {
    return;
  }

  const collectionName =
    String(currentTaskSourceDiscovery?.collection?.name || "").trim() ||
    currentTaskCollectionFallbackLabel();
  const nftContract = String(currentTaskSourceDiscovery?.contractAddress || "").trim();
  const mintRouteContract = String(taskContractInput?.value || "").trim();
  const selectedWallets = selectedTaskWalletRecords();
  const livePrice = String(taskPriceInput?.value || "").trim();

  let destinationLabel = "";
  if (selectedWallets.length === 1) {
    const wallet = selectedWallets[0];
    destinationLabel = `${wallet.label || "Wallet"} · ${wallet.addressShort || truncateMiddle(wallet.address || "", 10, 6)}`;
  } else if (selectedWallets.length > 1) {
    destinationLabel = `${selectedWallets.length} wallets selected`;
  } else if (state.wallets.length === 0) {
    destinationLabel = "Import a wallet first";
  } else {
    destinationLabel = "Select the wallet that should receive the NFT";
  }

  taskDiscoveryCollectionInput.value = collectionName;
  taskDiscoveryNftContractInput.value = nftContract;
  taskDiscoveryRouteContractInput.value = mintRouteContract;
  taskDestinationWalletInput.value = destinationLabel;

  let hint = "";
  if (currentTaskExecutionBlocker) {
    hint = currentTaskExecutionBlocker;
  } else if (!collectionName) {
    hint = "Paste an OpenSea collection link and MintBot will discover the mint path for you.";
  } else if (!mintRouteContract) {
    hint = "MintBot is still discovering the correct mint route and ABI from the collection link.";
  } else if (nftContract && mintRouteContract && nftContract.toLowerCase() !== mintRouteContract.toLowerCase()) {
    hint =
      "This collection uses a separate mint route contract. MintBot sends the transaction there, but the NFT still mints into the selected wallet.";
  } else if (selectedWallets.length > 1) {
    hint = "Minted NFTs go directly to each selected wallet.";
  } else {
    hint = "Minted NFTs go directly to the selected wallet.";
  }

  if (livePrice) {
    hint += ` Live mint price: ${livePrice} ETH.`;
  }

  taskMintRouteHint.textContent = hint;
}

function setWalletSelectionCount() {
  const count = selectedWalletIds().length;
  walletSelectionCount.textContent = `${pluralize(count, "wallet")} selected`;
  updateTaskMintSummary();
}

function setRpcSelectionCount() {
  const count = selectedRpcIds().length;
  const activeChain = taskChainInput.value || state.chains[0]?.key || "base_sepolia";
  const enabledChainRpcCount = state.rpcNodes.filter((node) => node.chainKey === activeChain && node.enabled).length;

  if (count === 0 && enabledChainRpcCount > 0) {
    rpcSelectionCount.textContent = `Using all ${pluralize(enabledChainRpcCount, "enabled RPC node")} on ${chainLabel(activeChain)}`;
    rpcSelectionCount.classList.remove("warning");
    return;
  }

  rpcSelectionCount.textContent = `${pluralize(count, "RPC node")} selected`;
  rpcSelectionCount.classList.toggle("warning", count === 0);
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
  const sourceType = task.sourceType || "generic_contract";
  const sourceContext = task.sourceContext || null;
  let blockingSourceIssue = false;

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

  if (sourceType !== "generic_contract") {
    if (!task.sourceTarget) {
      issues.push("Source target missing");
      blockingSourceIssue = true;
    } else if (sourceContext && sourceContext.valid === false) {
      issues.push(sourceContext.error || "Source target is invalid");
      blockingSourceIssue = true;
    } else {
      score += 10;
    }
  }

  let health = "blocked";
  if (!blockingSourceIssue && score >= (sourceType === "generic_contract" ? 100 : 110)) {
    health = "armed";
  } else if (!blockingSourceIssue && score >= 50) {
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
  const activeTaskIdSet = new Set(activeTaskIds());
  return state.tasks.filter((task) => {
    const matchesStatus =
      state.taskStatusFilter === "all" ||
      taskVisualStatus(task, activeTaskIdSet) === state.taskStatusFilter;

    return matchesStatus;
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
  const readyTaskCount = state.tasks.filter((task) => taskReadiness(task).health === "armed").length;

  const alerts = [...buildRpcHealthAlerts()];
  if (state.wallets.length === 0) {
    alerts.push({
      severity: "critical",
      title: "No wallets loaded",
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
    readyTaskCount,
    runDurationMs:
      state.runState.startedAt && state.runState.status === "running"
        ? Date.now() - new Date(state.runState.startedAt).getTime()
        : 0,
    alerts
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

function isTaskModalOpen() {
  return Boolean(taskModal && !taskModal.classList.contains("hidden"));
}

function showToast(message, tone = "info", title = null, options = {}) {
  if (options.suppressWhenTaskModalOpen && isTaskModalOpen()) {
    return null;
  }

  const hideAfterMs = Math.max(0, Number(options.hideAfterMs || 4200));
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `
    <strong>${escapeHtml(title || (tone === "error" ? "Request Error" : tone === "success" ? "Action Complete" : "Heads Up"))}</strong>
    <p>${escapeHtml(message)}</p>
  `;

  toastStack.prepend(toast);
  if (hideAfterMs > 0) {
    window.setTimeout(() => {
      toast.remove();
    }, hideAfterMs);
  }
  return toast;
}

function assistantUsesSavedDashboardKey() {
  return state.settings.openaiApiKeySource === "saved";
}

function apiKeyHealthHasError(healthStatus) {
  return String(healthStatus || "").trim().toLowerCase() === "error";
}

function apiKeySourceLabel(source) {
  return source === "saved" ? "Saved" : source === "env" ? "Environment" : "Current";
}

function assistantAvailability() {
  if (!state.session.authenticated && state.session.authRequired !== false) {
    return {
      ready: false,
      fab: "Sign in required",
      emptyTitle: "Authentication required",
      emptyCopy: "Sign in first, then I can answer questions and control the app for you."
    };
  }

  if (!state.settings.openaiApiKeyConfigured) {
    return {
      ready: false,
      fab: "OpenAI key required",
      emptyTitle: "OpenAI key missing",
      emptyCopy: "Save an OpenAI API key in Settings, then I can manage tasks, RPCs, and dashboard controls for you."
    };
  }

  if (!assistantUsesSavedDashboardKey()) {
    return {
      ready: false,
      fab: "Saved key required",
      emptyTitle: "Saved key required",
      emptyCopy: "Operator AI uses the OpenAI key saved in the dashboard settings for live control."
    };
  }

  if (apiKeyHealthHasError(state.settings.openaiApiKeyHealthStatus)) {
    return {
      ready: false,
      fab: "OpenAI key invalid",
      emptyTitle: "OpenAI key invalid",
      emptyCopy: "Replace the saved OpenAI API key in Settings, then I can control tasks, RPCs, and settings again."
    };
  }

  return {
    ready: true,
    fab: "Live copilot ready",
    emptyTitle: "",
    emptyCopy: ""
  };
}

function normalizeAssistantLocalCommand(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[!?.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAssistantNavigationTarget(value) {
  return normalizeAssistantLocalCommand(value)
    .replace(/^(?:the|my)\s+/, "")
    .replace(/\b(?:page|screen|panel|tab|view|section)\b/g, " ")
    .replace(/\b(?:please|now)\b/g, " ")
    .replace(/\bfor me\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveAssistantViewCommand(message) {
  let normalized = normalizeAssistantLocalCommand(message);
  if (!normalized) {
    return null;
  }

  normalized = normalized
    .replace(/^(?:hey\s+)?(?:operator ai|assistant)[,:]?\s*/, "")
    .replace(/^(?:please\s+)?(?:can|could|would|will)\s+you\s+/, "")
    .trim();

  const resolveTarget = (target) => {
    const cleanedTarget = cleanAssistantNavigationTarget(target);
    if (!cleanedTarget) {
      return null;
    }

    return (
      assistantViewCommands.find((entry) =>
        entry.aliases.some((alias) => cleanAssistantNavigationTarget(alias) === cleanedTarget)
      ) || null
    );
  };

  const directMatch = resolveTarget(normalized);
  if (directMatch) {
    return directMatch;
  }

  const actionMatch = normalized.match(
    /^(?:open|show|go to|switch to|take me to|navigate to|move to|bring up|display)\s+(.+)$/
  );
  if (!actionMatch) {
    return null;
  }

  return resolveTarget(actionMatch[1]);
}

function handleAssistantLocalCommand(message) {
  const viewCommand = resolveAssistantViewCommand(message);
  if (!viewCommand) {
    return null;
  }

  const alreadyOpen = state.currentView === viewCommand.view;
  if (!alreadyOpen) {
    setView(viewCommand.view);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });

  return {
    reply: alreadyOpen ? `${viewCommand.label} is already open.` : `${viewCommand.label} opened.`,
    actions: [alreadyOpen ? `Stayed on ${viewCommand.label}` : `Opened ${viewCommand.label}`]
  };
}

function formatAssistantTimestamp(value) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function scrollAssistantMessagesToBottom() {
  window.requestAnimationFrame(() => {
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
  });
}

function renderAssistantWelcomeState() {
  return `
    <div class="assistant-empty-state welcome">
      <h4>Your live MintBot copilot is ready.</h4>
      <p>Ask naturally. I can manage tasks, RPCs, and saved API keys on the live app.</p>
    </div>
  `;
}

function renderAssistant() {
  const availability = assistantAvailability();
  const sendButtonLabel = assistantState.loading ? "Stop" : "Send";

  assistantInput.disabled = assistantState.loading || !availability.ready;
  assistantSendButton.textContent = sendButtonLabel;
  assistantSendButton.classList.toggle("ghost-button", assistantState.loading);
  assistantSendButton.classList.toggle("primary-button", !assistantState.loading);
  assistantSendButton.disabled = assistantState.loading ? false : !availability.ready || !assistantInput.value.trim();
  assistantSendButton.setAttribute("aria-label", assistantState.loading ? "Stop response" : "Send message");
  assistantResetButton.disabled = assistantState.loading;

  if (!availability.ready) {
    assistantMessages.innerHTML = `
      <div class="assistant-empty-state">
        <h4>${escapeHtml(availability.emptyTitle)}</h4>
        <p>${escapeHtml(availability.emptyCopy)}</p>
      </div>
    `;
    return;
  }

  if (!assistantState.messages.length && !assistantState.loading) {
    assistantMessages.innerHTML = renderAssistantWelcomeState();
    return;
  }

  const messageMarkup = assistantState.messages
    .map((entry) => {
      const actions = Array.isArray(entry.actions) && entry.actions.length
        ? `
          <div class="assistant-message-actions">
            ${entry.actions
              .map((action) => `<span class="assistant-action-chip">${escapeHtml(action)}</span>`)
              .join("")}
          </div>
        `
        : "";

      return `
        <article class="assistant-message ${escapeHtml(entry.role)}">
          <div class="assistant-bubble">${escapeHtml(entry.text || "").replace(/\n/g, "<br />")}</div>
          ${actions}
          <div class="assistant-message-meta">${escapeHtml(
            entry.role === "user" ? "You" : "Operator AI"
          )}${entry.timestamp ? ` · ${escapeHtml(formatAssistantTimestamp(entry.timestamp))}` : ""}</div>
        </article>
      `;
    })
    .join("");

  const loadingMarkup = assistantState.loading
    ? `
      <article class="assistant-message assistant">
        <div class="assistant-bubble">
          <div class="assistant-typing" aria-label="Operator AI is typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div class="assistant-message-meta">Operator AI</div>
      </article>
    `
    : "";

  assistantMessages.innerHTML = `${messageMarkup}${loadingMarkup}`;
  scrollAssistantMessagesToBottom();
}

function stopAssistantMessage(options = {}) {
  if (!assistantState.loading) {
    return;
  }

  const { notify = true } = options;
  assistantRequestToken += 1;

  if (assistantRequestController) {
    assistantRequestController.abort();
    assistantRequestController = null;
  }

  assistantState.loading = false;
  renderAssistant();

  if (notify) {
    showToast("Operator AI response stopped.", "info", "AI Operator");
  }

  if (!assistantInput.disabled) {
    assistantInput.focus();
  }
}

async function resetAssistantConversation(options = {}) {
  if (assistantState.loading) {
    return;
  }

  const { silent = false } = options;
  if (!silent && assistantState.messages.length > 0 && !window.confirm("Reset the Operator AI conversation?")) {
    return;
  }

  assistantState.messages = [];
  renderAssistant();

  if (!state.session.authenticated) {
    return;
  }

  try {
    await request("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
      quiet: true
    });
  } catch {}

  if (!silent) {
    showToast("Operator AI conversation cleared.", "info", "AI Operator");
  }
}

async function sendAssistantMessage() {
  const message = assistantInput.value.trim();
  if (!message || assistantState.loading || !assistantAvailability().ready) {
    renderAssistant();
    return;
  }

  assistantState.messages = [
    ...assistantState.messages,
    {
      role: "user",
      text: message,
      timestamp: new Date().toISOString()
    }
  ];
  assistantInput.value = "";

  const localCommandResult = handleAssistantLocalCommand(message);
  if (localCommandResult) {
    assistantState.loading = false;
    assistantState.messages = [
      ...assistantState.messages,
      {
        role: "assistant",
        text: localCommandResult.reply,
        actions: localCommandResult.actions || [],
        timestamp: new Date().toISOString()
      }
    ];
    renderAssistant();
    return;
  }

  const shouldResetConversation = assistantState.messages.length === 1;
  assistantState.loading = true;
  renderAssistant();

  const requestToken = ++assistantRequestToken;
  const controller = new AbortController();
  assistantRequestController = controller;

  try {
    const payload = await request("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        reset: shouldResetConversation
      }),
      quiet: true,
      signal: controller.signal
    });

    if (requestToken !== assistantRequestToken) {
      return;
    }

    assistantState.messages = [
      ...assistantState.messages,
      {
        role: "assistant",
        text: payload.reply || "Request completed.",
        actions: payload.actions || [],
        timestamp: new Date().toISOString()
      }
    ];

    if (payload.navigateTo) {
      setView(payload.navigateTo);
    }

    if (payload.changedState) {
      await loadState().catch(() => {});
      if (payload.navigateTo) {
        setView(payload.navigateTo);
      }
      showToast("Operator AI updated the app state.", "success", "AI Operator");
    }
  } catch (error) {
    if (error.name === "AbortError" || requestToken !== assistantRequestToken) {
      return;
    }

    assistantState.messages = [
      ...assistantState.messages,
      {
        role: "assistant",
        text: error.message || "I could not complete that request.",
        timestamp: new Date().toISOString()
      }
    ];
  } finally {
    if (requestToken !== assistantRequestToken) {
      return;
    }

    assistantRequestController = null;
    assistantState.loading = false;
    renderAssistant();
    if (!assistantInput.disabled) {
      assistantInput.focus();
    }
  }
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
      const healthStatus = rpcVisualTone(node);
      const healthText =
        healthStatus === "healthy" || healthStatus === "warning"
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
  if (!logOutput) {
    return;
  }

  logOutput.textContent = (state.runState.logs || [])
    .map((entry) => {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "--:--:--";
      return `[${time}] [${entry.level}] ${entry.message}`;
    })
    .join("\n");
  logOutput.scrollTop = logOutput.scrollHeight;
}

function buildFeatureAlerts() {
  const missingFeatures = [];
  const failingFeatures = [];

  function registerFeature({ label, keyLabel, configured, healthy, healthStatus }) {
    if (!configured) {
      missingFeatures.push({
        label,
        keyLabel
      });
      return;
    }

    if (healthy === false && apiKeyHealthHasError(healthStatus)) {
      failingFeatures.push({
        label,
        keyLabel
      });
    }
  }

  registerFeature({
    label: "OpenAI assistant",
    keyLabel: "OpenAI API key",
    configured: state.settings.openaiApiKeyConfigured,
    healthy: state.settings.openaiApiKeyHealthy,
    healthStatus: state.settings.openaiApiKeyHealthStatus
  });

  registerFeature({
    label: "Explorer ABI fetches",
    keyLabel: "Etherscan API key",
    configured: state.settings.explorerApiKeyConfigured,
    healthy: state.settings.explorerApiKeyHealthy,
    healthStatus: state.settings.explorerApiKeyHealthStatus
  });

  registerFeature({
    label: "Alchemy RPC import",
    keyLabel: "Alchemy API key",
    configured: state.settings.alchemyApiKeyConfigured,
    healthy: state.settings.alchemyApiKeyHealthy,
    healthStatus: state.settings.alchemyApiKeyHealthStatus
  });

  registerFeature({
    label: "dRPC RPC import",
    keyLabel: "dRPC API key",
    configured: state.settings.drpcApiKeyConfigured,
    healthy: state.settings.drpcApiKeyHealthy,
    healthStatus: state.settings.drpcApiKeyHealthStatus
  });

  registerFeature({
    label: "OpenSea discovery",
    keyLabel: "OpenSea API key",
    configured: state.settings.openseaApiKeyConfigured,
    healthy: state.settings.openseaApiKeyHealthy,
    healthStatus: state.settings.openseaApiKeyHealthStatus
  });

  const alerts = [];

  if (failingFeatures.length === 1) {
    const [feature] = failingFeatures;
    alerts.push({
      severity: "warning",
      title: `${feature.label} unavailable`,
      detail: `The current ${feature.keyLabel} failed validation. Replace it with a working key to restore ${feature.label.toLowerCase()}.`
    });
  } else if (failingFeatures.length > 1) {
    alerts.push({
      severity: "warning",
      title: "Features failing validation",
      detail: `Replace the current keys to restore ${formatLabelList(
        failingFeatures.map((feature) => feature.label)
      )}.`
    });
  }

  if (!missingFeatures.length) {
    return alerts;
  }

  if (missingFeatures.length === 1) {
    const [feature] = missingFeatures;
    alerts.push({
      severity: "warning",
      title: `${feature.label} unavailable`,
      detail: `Add the ${feature.keyLabel} in Settings to enable ${feature.label.toLowerCase()}.`
    });
    return alerts;
  }

  alerts.push({
    severity: "warning",
    title: "Features unavailable",
    detail: `Configure the missing keys in Settings to enable ${formatLabelList(
      missingFeatures.map((feature) => feature.label)
    )}.`
  });

  return alerts;
}

function buildSystemAlerts(telemetry) {
  const blockedTaskCount = state.tasks.filter((task) => taskReadiness(task).health === "blocked").length;
  const alertFeed = [...buildFeatureAlerts(), ...buildRpcHealthAlerts()];

  if (blockedTaskCount > 0) {
    alertFeed.push({
      severity: "warning",
      title: "Task configuration needs attention",
      detail: `${pluralize(blockedTaskCount, "task")} are missing required inputs such as source targets, ABI, wallets, contract data, or RPC coverage.`
    });
  }

  (telemetry.alerts || []).forEach((alert) => {
    const duplicate = alertFeed.some(
      (entry) => entry.title === alert.title && entry.detail === alert.detail
    );
    if (!duplicate) {
      alertFeed.push(alert);
    }
  });

  return alertFeed;
}

function renderSystemAlerts(telemetry) {
  const alertFeed = buildSystemAlerts(telemetry);

  systemAlerts.innerHTML = alertFeed.length
    ? alertFeed
        .slice(0, 6)
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

function renderDashboardRunHistory() {
  if (!dashboardRunHistory) {
    return;
  }

  const activeTaskIdSet = new Set(activeTaskIds());
  const runningTasks = state.tasks.filter((task) => taskVisualStatus(task, activeTaskIdSet) === "running");
  const recentHistory = [...state.tasks]
    .flatMap((task) =>
      (task.history || []).slice(0, 3).map((entry) => ({
        task,
        entry,
        ranAt: entry?.ranAt || task.lastRunAt || task.updatedAt || null
      }))
    )
    .sort((left, right) => new Date(right.ranAt || 0) - new Date(left.ranAt || 0))
    .slice(0, 6);

  const runningMarkup = runningTasks.length
    ? runningTasks
        .map((task) => {
          const progress = task.progress || { phase: "Running", percent: 0 };
          return `
            <article class="queue-item dashboard-history-item active">
              <div class="queue-head">
                <div>
                  <strong>${escapeHtml(task.name)}</strong>
                  <p class="muted-copy">${escapeHtml(chainLabel(task.chainKey))} · ${escapeHtml(progress.phase || "Running")}</p>
                </div>
                <span class="status-pill running">Running</span>
              </div>
              <div class="queue-meta">
                <span class="wallet-chip">${progress.percent || 0}% complete</span>
                <span class="wallet-chip">${pluralize(task.walletCount || 0, "wallet")}</span>
                <span class="wallet-chip">${pluralize(task.rpcCount || 0, "rpc")}</span>
              </div>
              <p class="muted-copy">${escapeHtml(task.notes || `Updated ${relativeTime(task.updatedAt)}`)}</p>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state"><h3>No active runs</h3><p>Running tasks will appear here while they are live.</p></div>`;

  const historyMarkup = recentHistory.length
    ? recentHistory
        .map(({ task, entry }) => {
          const summary = entry?.summary || {};
          const hashCount = Array.isArray(summary.hashes) ? summary.hashes.length : 0;
          const tone = (summary.failed || 0) > 0 && (summary.success || 0) === 0 ? "failed" : "completed";
          const label = tone === "failed" ? "Failed" : "Completed";
          return `
            <article class="list-row dashboard-history-row">
              <div>
                <strong>${escapeHtml(task.name)}</strong>
                <p class="muted-copy">${escapeHtml(chainLabel(task.chainKey))} · ${new Date(entry.ranAt).toLocaleString()}</p>
                <p class="muted-copy">${summary.success || 0} success / ${summary.failed || 0} failed / ${hashCount} hashes</p>
              </div>
              <span class="status-pill ${escapeHtml(tone)}">${label}</span>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state"><h3>No run history</h3><p>Completed or failed task runs will appear here.</p></div>`;

  dashboardRunHistory.innerHTML = `
    <section class="dashboard-history-group">
      <div class="dashboard-history-heading">
        <h4>Currently Running</h4>
        <p class="helper-copy">Live task sessions that are executing right now.</p>
      </div>
      ${runningMarkup}
    </section>
    <section class="dashboard-history-group">
      <div class="dashboard-history-heading">
        <h4>Recent History</h4>
        <p class="helper-copy">Latest completed and failed task results.</p>
      </div>
      ${historyMarkup}
    </section>
  `;
}

function renderDashboard() {
  const telemetry = telemetryView();
  const activeAlerts = buildSystemAlerts(telemetry);
  const hasActionableAlert = activeAlerts.some((alert) => ["critical", "warning"].includes(alert.severity));
  renderSystemAlerts(telemetry);
  renderDashboardRunHistory();

  if (hasActionableAlert) {
    setStatusPill(dashboardHealthPill, "failed", "Needs Attention");
  } else if (state.runState.status === "running") {
    setStatusPill(dashboardHealthPill, "running", "Live Run");
  } else if ((state.runState.queuedTaskIds || []).length > 0) {
    setStatusPill(dashboardHealthPill, "queued", "Queue Armed");
  } else {
    setStatusPill(dashboardHealthPill, "healthy", (telemetry.readyTaskCount || 0) > 0 ? "Armed" : "Healthy");
  }
}

function renderTaskCard(task, activeTaskIdSet = new Set()) {
  const summary = task.summary || {};
  const progress = task.progress || { phase: "Ready", percent: 0 };
  const progressPercent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const statusKey = taskVisualStatus(task, activeTaskIdSet);
  const statusMeta = taskStatusMeta(statusKey);
  const active = statusKey === "running";
  const queued = statusKey === "queued";
  const hashCount = Array.isArray(summary.hashes) ? summary.hashes.length : 0;
  const tags = [...(task.tags || [])];
  const updatedLabel = active ? "Live now" : `Updated ${relativeTime(task.updatedAt)}`;
  const sourceLabel = task.sourceLabel || findMintSourceDefinition(task.sourceType).label;
  const sourceSummary = task.sourceSummary || sourceLabel;
  const runtime = taskRuntimeNarrative(task, statusKey);

  if (task.multiRpcBroadcast) {
    tags.push("RPC Mesh");
  }

  return `
    <article class="task-card ${escapeHtml(statusMeta.tone)}" data-task-id="${escapeHtml(task.id)}" data-task-status="${escapeHtml(statusMeta.key)}" data-tilt>
      <div class="task-head">
        <div>
          <p class="eyebrow">${escapeHtml(chainLabel(task.chainKey))}</p>
          <h3>${escapeHtml(task.name || "Untitled Task")}</h3>
          <p class="muted-copy">${escapeHtml(task.platform || "Mint Flow")} / ${escapeHtml(humanizePriority(task.priority || "standard"))} priority / ${escapeHtml(runtime.detail)}</p>
        </div>
        <div class="task-head-side">
          <span class="status-pill ${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span>
          <span class="task-head-timestamp">${escapeHtml(updatedLabel)}</span>
        </div>
      </div>

      <div class="chip-row">
        <span class="tag-chip">${escapeHtml(sourceLabel)}</span>
        <span class="tag-chip">${escapeHtml(humanizePriority(task.priority || "standard"))}</span>
        ${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}
      </div>

      <div class="task-meta">
        <div class="meta-item"><label>Contract</label><strong>${escapeHtml(truncateMiddle(task.contractAddress || "Not set"))}</strong></div>
        <div class="meta-item"><label>Source</label><strong title="${escapeHtml(sourceSummary)}">${escapeHtml(truncateMiddle(sourceSummary, 24, 18) || sourceLabel)}</strong></div>
        <div class="meta-item"><label>Chain</label><strong>${escapeHtml(chainLabel(task.chainKey))}</strong></div>
        <div class="meta-item"><label>Wallets</label><strong>${task.walletCount || 0}</strong></div>
        <div class="meta-item"><label>RPC</label><strong>${task.rpcCount || 0}</strong></div>
        <div class="meta-item"><label>Qty</label><strong>${task.quantityPerWallet || 0}</strong></div>
        <div class="meta-item"><label>Price</label><strong>${escapeHtml(task.priceEth || "Auto")}${task.priceEth ? " ETH" : ""}</strong></div>
      </div>

      <div class="task-stats">
        <div class="stat-box"><label>Total</label><strong>${summary.total ?? task.walletCount ?? 0}</strong></div>
        <div class="stat-box success"><label>Success</label><strong>${summary.success ?? 0}</strong></div>
        <div class="stat-box failed"><label>Failed</label><strong>${summary.failed ?? 0}</strong></div>
        <div class="stat-box"><label>Hashes</label><strong>${hashCount}</strong></div>
      </div>

      <div class="task-progress-row">
        <span class="muted-copy">${escapeHtml(runtime.phaseLabel)} / ${progressPercent}%</span>
        <span class="task-signal-chip ${escapeHtml(statusMeta.tone)}">${escapeHtml(active || queued ? runtime.signalLabel : updatedLabel)}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width:${progressPercent}%"></div></div>

      <div class="task-trace-panel">
        <div class="task-trace-header">
          <span class="task-trace-title">System Trace</span>
          <span class="task-trace-caption">${escapeHtml(runtime.detail)}</span>
        </div>
        <div class="task-trace-lines">
          ${runtime.trace
            .map(
              (entry) => `
                <div class="task-trace-line ${escapeHtml(entry.state)}">
                  <span class="task-trace-code">${escapeHtml(entry.code)}</span>
                  <span class="task-trace-copy">${escapeHtml(entry.label)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      ${task.notes ? `<p class="muted-copy">${escapeHtml(task.notes)}</p>` : ""}

      <div class="task-actions">
        ${buildTaskActionMarkup(statusKey, active, queued)}
      </div>

      <div class="history-block">
        <div class="muted-copy">History (${task.history?.length || 0})</div>
        ${renderTaskHistoryItems(task)}
      </div>
    </article>
  `;
}

function renderTasks() {
  const activeTaskIdSet = new Set(activeTaskIds());
  const tasks = filteredTasks();
  const allStatusCounts = summarizeTaskStatuses(state.tasks, activeTaskIdSet);
  const totalTasks = state.tasks.length;
  const activeFilterMeta = taskStatusMeta(state.taskStatusFilter);

  if (tasksSummaryCopy) {
    let summaryText = `${pluralize(totalTasks, "task")} in the command center. `;
    if (state.taskStatusFilter === "all") {
      summaryText += `${pluralize(allStatusCounts.queued, "task")} queued, ${pluralize(allStatusCounts.running, "task")} running, and ${pluralize(allStatusCounts.completed, "task")} completed.`;
    } else {
      summaryText += `Showing ${pluralize(tasks.length, activeFilterMeta.label.toLowerCase() + " task")}.`;
    }
    tasksSummaryCopy.textContent = summaryText;
  }

  if (taskStatusLegend) {
    const legendItems = TASK_STATUS_ORDER.map((status) => ({
        count: allStatusCounts[status] || 0,
        ...taskStatusMeta(status)
      }));

    taskStatusLegend.innerHTML = legendItems
      .map(
        (item) => `
          <button type="button" class="task-status-chip ${escapeHtml(item.tone)}${state.taskStatusFilter === item.key ? " active" : ""}" data-task-status-chip="${escapeHtml(item.key)}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.count}</strong>
          </button>
        `
      )
      .join("");

    taskStatusLegend.querySelectorAll("[data-task-status-chip]").forEach((button) => {
      button.addEventListener("click", () => {
        state.taskStatusFilter = state.taskStatusFilter === button.dataset.taskStatusChip ? "all" : button.dataset.taskStatusChip;
        renderTasks();
      });
    });
  }

  const emptyTitle = totalTasks === 0 ? "No task sessions yet" : "No tasks match this view";
  const emptyMessage =
    totalTasks === 0
      ? "Create a new task to start building your launch queue."
      : `No ${activeFilterMeta.label.toLowerCase()} tasks right now. Pick another status or create a new task.`;

  taskGrid.innerHTML = tasks.length
    ? tasks.map((task) => renderTaskCard(task, activeTaskIdSet)).join("")
    : `<div class="empty-state"><h3>${emptyTitle}</h3><p>${emptyMessage}</p></div>`;

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
          openTaskDeleteModal(taskId);
          return;
        }

        if (action === "queued") {
          return;
        }

        if (action === "duplicate") {
          await request(`/api/tasks/${taskId}/duplicate`, { method: "POST" });
          showToast(`${task?.name || "Task"} duplicated.`, "success", "Task Duplicated");
          return;
        }

        if (action === "run") {
          await request(`/api/tasks/${taskId}/run`, { method: "POST" });
          const isRerun = ["failed", "stopped"].includes(taskVisualStatus(task, activeTaskIdSet));
          showToast(
            isRerun
              ? `${task?.name || "Task"} re-entered the live execution lane. Backend handshake, RPC lane scoring, and payload staging are already moving.`
              : `${task?.name || "Task"} is entering the live execution lane. Backend handshake, RPC lane scoring, and payload staging are in flight.`,
            "success",
            isRerun ? "Re-Launch Armed" : "Execution Armed"
          );
          return;
        }

        if (action === "stop") {
          await request(`/api/tasks/${taskId}/stop`, { method: "POST" });
          showToast(`${task?.name || "Task"} abort signal pushed to the control plane.`, "info", "Run Control");
        }
      } catch {}
    });
  });
}

function mintRadarStatusTone(status = "") {
  return status === "live" ? "running" : status === "upcoming" ? "queued" : "draft";
}

function mintRadarStatusLabel(status = "") {
  return status === "live" ? "Live" : status === "upcoming" ? "Upcoming" : "Watching";
}

function mintRadarChainValue(entry = {}) {
  const normalizedChainKey = String(entry.chainKey || "").trim();
  return normalizedChainKey || "__unknown";
}

function mintRadarChainLabelForValue(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "all") {
    return "All Chains";
  }

  if (normalized === "__unknown") {
    return "Unknown Chain";
  }

  const matchingItem = (Array.isArray(state.mintRadar.items) ? state.mintRadar.items : []).find(
    (entry) => String(entry.chainKey || "").trim() === normalized && String(entry.chainLabel || "").trim()
  );
  return matchingItem?.chainLabel || chainLabel(normalized);
}

function mintRadarChainOptions() {
  const options = new Map([["all", "All Chains"]]);

  state.chains.forEach((chain) => {
    if (chain?.key && chain?.label) {
      options.set(chain.key, chain.label);
    }
  });

  (Array.isArray(state.mintRadar.items) ? state.mintRadar.items : []).forEach((entry) => {
    const value = mintRadarChainValue(entry);
    const label =
      value === "__unknown"
        ? "Unknown Chain"
        : String(entry.chainLabel || "").trim() || chainLabel(value);
    options.set(value, label);
  });

  const selectedValue = String(state.mintRadar.chainFilter || "all").trim() || "all";
  if (!options.has(selectedValue)) {
    options.set(selectedValue, mintRadarChainLabelForValue(selectedValue));
  }

  return [...options.entries()].map(([value, label]) => ({ value, label }));
}

function filteredMintRadarItems() {
  const filter = String(state.mintRadar.filter || "all").trim().toLowerCase();
  const chainFilter = String(state.mintRadar.chainFilter || "all").trim();
  const searchQuery = String(state.mintRadar.searchQuery || "").trim().toLowerCase();
  const items = Array.isArray(state.mintRadar.items) ? state.mintRadar.items : [];
  return items
    .filter((entry) => filter === "all" || entry.status === filter)
    .filter((entry) => {
      if (chainFilter === "all") {
        return true;
      }

      return mintRadarChainValue(entry) === chainFilter;
    })
    .filter((entry) => {
      if (!searchQuery) {
        return true;
      }

      const haystack = [
        entry.collectionName,
        entry.name,
        entry.creator,
        entry.slug,
        entry.chainLabel,
        entry.chainKey,
        entry.summary
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchQuery);
    });
}

function parseMintRadarPriceValue(priceText = "") {
  const match = String(priceText || "").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? match[1] : "";
}

function preparePublicMintFromRadar(entry) {
  if (!entry?.url && !entry?.slug) {
    showToast("This radar entry does not include an OpenSea collection link yet.", "error", "Mint Radar");
    return;
  }

  const sourceTarget = String(entry.url || "").trim() || `https://opensea.io/collection/${entry.slug}`;
  const taskName = String(entry.collectionName || entry.name || "").trim();
  const priceValue = parseMintRadarPriceValue(entry.priceText);

  setView("tasks");
  openTaskModal();

  taskSourceTargetInput.value = sourceTarget;
  taskSourceStageInput.value = "public";
  syncTaskSourceTypeFromTarget();
  currentTaskSourceDiscovery = null;
  currentTaskMintAutofill = null;

  if (taskName && !String(taskNameInput.value || "").trim()) {
    taskNameInput.value = `${taskName} Public Mint`;
  }

  if (entry.chainKey && [...taskChainInput.options].some((option) => option.value === entry.chainKey)) {
    taskChainInput.value = entry.chainKey;
    renderRpcSelector(filterSelectedRpcIdsForChain(entry.chainKey));
  }

  if (priceValue && !String(taskPriceInput.value || "").trim()) {
    taskPriceInput.value = priceValue;
  }

  updateTaskSourceInputs();
  updateTaskMintSummary();
  scheduleTaskSourceDiscovery({
    force: true,
    quiet: false,
    successToastTitle: "Mint Radar",
    successToastMessage: `${taskName || "Collection"} loaded into the public mint builder.`
  });
}

function renderMintRadar() {
  if (!mintRadarList) {
    return;
  }

  const filter = String(state.mintRadar.filter || "all").trim().toLowerCase() || "all";
  const chainFilter = String(state.mintRadar.chainFilter || "all").trim() || "all";
  const searchQuery = String(state.mintRadar.searchQuery || "").trim();
  const items = filteredMintRadarItems();
  const allItems = Array.isArray(state.mintRadar.items) ? state.mintRadar.items : [];
  const warnings = Array.isArray(state.mintRadar.warnings) ? state.mintRadar.warnings : [];
  const fetchedAt = String(state.mintRadar.fetchedAt || "").trim();
  const limitation = String(state.mintRadar.limitation || "").trim();

  if (mintRadarChainInput) {
    const chainOptions = mintRadarChainOptions();
    mintRadarChainInput.innerHTML = chainOptions
      .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    mintRadarChainInput.value = chainFilter;
  }

  if (mintRadarSearchInput && mintRadarSearchInput.value !== searchQuery) {
    mintRadarSearchInput.value = searchQuery;
  }

  if (mintRadarFilterInput && mintRadarFilterInput.value !== filter) {
    mintRadarFilterInput.value = filter;
  }

  if (mintRadarStatus) {
    if (state.mintRadar.loading) {
      mintRadarStatus.textContent = "Refreshing the OpenSea drops feed and checking for new collections...";
    } else if (state.mintRadar.error) {
      mintRadarStatus.textContent = state.mintRadar.error;
    } else if (allItems.length > 0) {
      mintRadarStatus.textContent =
        "OpenSea drops loaded. Search, filter by chain, review live or upcoming mints, and send any collection straight into the public mint builder.";
    } else {
      mintRadarStatus.textContent = "Refresh the OpenSea drops feed to load live and upcoming mints.";
    }
  }

  if (mintRadarCount) {
    const chainCopy = chainFilter === "all" ? "" : ` on ${mintRadarChainLabelForValue(chainFilter)}`;
    const searchCopy = searchQuery ? ` matching "${searchQuery}"` : "";
    mintRadarCount.textContent =
      allItems.length > 0
        ? `Showing ${items.length} of ${allItems.length} tracked ${allItems.length === 1 ? "drop" : "drops"}${chainCopy}${searchCopy}.`
        : "No tracked drops yet.";
  }

  if (mintRadarUpdated) {
    mintRadarUpdated.textContent = fetchedAt
      ? `Updated ${relativeTime(fetchedAt)} · auto-sync every 5m`
      : "Auto-sync every 5m";
  }

  if (mintRadarLimitation) {
    mintRadarLimitation.textContent =
      limitation ||
      "This radar follows the drops OpenSea currently surfaces. It is not a universal calendar for every NFT mint on every website.";
  }

  if (mintRadarWarningList) {
    mintRadarWarningList.classList.toggle("hidden", warnings.length === 0);
    mintRadarWarningList.innerHTML = warnings.length
      ? warnings
          .slice(0, 4)
          .map(
            (warning) => `
              <article class="alert-item warning">
                <strong>OpenSea Radar Note</strong>
                <p class="muted-copy">${escapeHtml(warning)}</p>
              </article>
            `
          )
          .join("")
      : "";
  }

  if (items.length === 0) {
    const emptyTitle = state.mintRadar.error ? "Mint radar unavailable" : state.mintRadar.loading ? "Loading drops" : "No drops in this filter";
    const emptyMessage = state.mintRadar.error
      ? state.mintRadar.error
      : state.mintRadar.loading
        ? "OpenSea radar data is loading."
        : filter === "all" && chainFilter === "all" && !searchQuery
          ? "No live or upcoming drops were returned by OpenSea yet."
          : `No ${filter === "all" ? "tracked" : filter} drops are visible for ${mintRadarChainLabelForValue(chainFilter)}${searchQuery ? ` matching "${searchQuery}"` : ""} right now.`;
    mintRadarList.innerHTML = `<div class="empty-state"><h3>${escapeHtml(emptyTitle)}</h3><p>${escapeHtml(emptyMessage)}</p></div>`;
    return;
  }

  mintRadarList.innerHTML = items
    .map((entry) => {
      const tone = mintRadarStatusTone(entry.status);
      const statusLabel = mintRadarStatusLabel(entry.status);
      const contractLabel = entry.nftContractAddress ? truncateMiddle(entry.nftContractAddress) : "Discover on task load";
      const chainValue = entry.chainLabel || chainLabel(entry.chainKey) || "OpenSea";
      const sourceSummary =
        [entry.priceText, entry.scheduleText, entry.totalItemsText, entry.mintedCountText].filter(Boolean).join(" · ") ||
        entry.summary ||
        "OpenSea drop detected.";

      return `
        <article class="surface mint-radar-card" data-radar-slug="${escapeHtml(entry.slug || "")}" data-tilt>
          <div class="mint-radar-card-header">
            <div>
              <p class="eyebrow">${escapeHtml(chainValue)}</p>
              <h3>${escapeHtml(entry.collectionName || entry.name || "OpenSea Drop")}</h3>
              <p class="helper-copy">${escapeHtml(entry.creator || entry.slug || "")}</p>
            </div>
            <span class="status-pill ${escapeHtml(tone)}">${escapeHtml(statusLabel)}</span>
          </div>

          <div class="chip-row">
            ${entry.priceText ? `<span class="tag-chip">${escapeHtml(entry.priceText)}</span>` : ""}
            ${entry.scheduleText ? `<span class="tag-chip">${escapeHtml(entry.scheduleText)}</span>` : ""}
            ${entry.totalItemsText ? `<span class="tag-chip">Total ${escapeHtml(entry.totalItemsText)}</span>` : ""}
            ${entry.mintedCountText ? `<span class="tag-chip">Minted ${escapeHtml(entry.mintedCountText)}</span>` : ""}
          </div>

          <p class="muted-copy mint-radar-summary">${escapeHtml(sourceSummary)}</p>

          <div class="task-meta mint-radar-meta">
            <div class="meta-item">
              <label>Collection</label>
              <strong>${escapeHtml(entry.slug || "Unknown")}</strong>
            </div>
            <div class="meta-item">
              <label>NFT Contract</label>
              <strong>${escapeHtml(contractLabel)}</strong>
            </div>
            <div class="meta-item">
              <label>Source</label>
              <strong>${escapeHtml((entry.sources || []).join(", ") || "OpenSea")}</strong>
            </div>
          </div>

          ${
            Array.isArray(entry.warnings) && entry.warnings.length > 0
              ? `<p class="helper-copy mint-radar-card-note">${escapeHtml(entry.warnings[0])}</p>`
              : ""
          }

          <div class="mint-radar-actions">
            <button class="ghost-button fx-button" type="button" data-mint-radar-action="open" data-radar-slug="${escapeHtml(entry.slug || "")}">
              Open on OpenSea
            </button>
            <button class="primary-button fx-button" type="button" data-mint-radar-action="prepare" data-radar-slug="${escapeHtml(entry.slug || "")}">
              Prepare Public Mint
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  mintRadarList.querySelectorAll("[data-mint-radar-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = String(button.dataset.radarSlug || "").trim();
      const entry = allItems.find((item) => item.slug === slug);
      if (!entry) {
        return;
      }

      if (button.dataset.mintRadarAction === "open") {
        window.open(entry.url || `https://opensea.io/collection/${slug}`, "_blank", "noopener,noreferrer");
        return;
      }

      if (button.dataset.mintRadarAction === "prepare") {
        preparePublicMintFromRadar(entry);
      }
    });
  });
}

async function loadMintRadar(options = {}) {
  const { forceRefresh = false, quiet = false } = options;

  if (!mintRadarList) {
    return null;
  }

  if (state.mintRadar.loading && !forceRefresh) {
    return null;
  }

  state.mintRadar.loading = true;
  if (forceRefresh) {
    state.mintRadar.error = "";
  }
  renderMintRadar();

  try {
    const query = new URLSearchParams();
    query.set("limit", "160");
    if (forceRefresh) {
      query.set("refresh", "1");
    }

    const payload = await request(`/api/mint-radar/opensea${query.toString() ? `?${query.toString()}` : ""}`, {
      quiet
    });

    state.mintRadar.items = Array.isArray(payload.items) ? payload.items : [];
    state.mintRadar.fetchedAt = payload.fetchedAt || new Date().toISOString();
    state.mintRadar.limitation = payload.limitation || "";
    state.mintRadar.warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    state.mintRadar.error = "";
    return payload;
  } catch (error) {
    state.mintRadar.error = error.message || "Mint radar is unavailable right now.";
    if (!state.mintRadar.fetchedAt) {
      state.mintRadar.items = [];
    }
    return null;
  } finally {
    state.mintRadar.loading = false;
    renderMintRadar();
  }
}

function ensureMintRadarLoaded(options = {}) {
  const { forceRefresh = false } = options;
  const fetchedAt = String(state.mintRadar.fetchedAt || "").trim();
  const ageMs = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  const shouldLoad =
    forceRefresh ||
    (Array.isArray(state.mintRadar.items) && state.mintRadar.items.length === 0) ||
    !fetchedAt ||
    !Number.isFinite(ageMs) ||
    ageMs > 5 * 60 * 1000;

  if (!shouldLoad || state.mintRadar.loading) {
    return;
  }

  loadMintRadar({ forceRefresh, quiet: true }).catch(() => {});
}

function renderWalletBalanceSyncStatus() {
  if (walletCount) {
    walletCount.textContent = pluralize(state.wallets.length, "wallet");
  }

  if (walletBalanceSyncStatus) {
    if (walletAssetsRefreshAllInFlight) {
      walletBalanceSyncStatus.textContent = walletAssetsAutoSyncInFlight
        ? "Auto-sync is refreshing wallet balances..."
        : "Refreshing wallet balances...";
    } else {
      const latestSyncAt = latestWalletAssetSyncAt();
      walletBalanceSyncStatus.textContent = latestSyncAt
        ? `Auto-sync on · last sync ${relativeTime(latestSyncAt)}`
        : "Auto-sync on · waiting for the first wallet sync.";
    }
  }

  if (walletBalancesRefreshAllButton) {
    walletBalancesRefreshAllButton.disabled = state.wallets.length === 0 || walletAssetsRefreshAllInFlight;
    walletBalancesRefreshAllButton.textContent = walletAssetsRefreshAllInFlight
      ? "Refreshing Wallets..."
      : "Refresh All Wallets";
  }
}

function renderWallets() {
  const selectedWalletId = walletAssetInspector.walletId;
  renderWalletBalanceSyncStatus();
  walletList.innerHTML = state.wallets.length
    ? state.wallets
        .map(
          (wallet) => `
            <div
              class="list-row wallet-list-row ${selectedWalletId === wallet.id ? "selected" : ""}"
              data-wallet-select="${escapeHtml(wallet.id)}"
              tabindex="0"
              role="button"
              aria-pressed="${selectedWalletId === wallet.id ? "true" : "false"}"
            >
              <div>
                <strong title="${escapeHtml(wallet.address || wallet.addressShort)}">${escapeHtml(
                  wallet.addressShort
                )} | ${escapeHtml(wallet.label)} | ${escapeHtml(walletDisplayBalance(wallet))}</strong>
              </div>
              <div class="task-actions">
                <button class="mini-button fx-button" type="button" data-wallet-view="${escapeHtml(wallet.id)}">
                  View Assets
                </button>
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

  walletList.querySelectorAll("[data-wallet-select]").forEach((row) => {
    const openAssets = async () => {
      await loadWalletAssets(row.dataset.walletSelect);
    };

    row.addEventListener("click", async (event) => {
      if (event.target.closest("[data-wallet-delete]") || event.target.closest("[data-wallet-view]")) {
        return;
      }

      await openAssets();
    });

    row.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      await openAssets();
    });
  });

  walletList.querySelectorAll("[data-wallet-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadWalletAssets(button.dataset.walletView);
    });
  });

  walletList.querySelectorAll("[data-wallet-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      openWalletDeleteModal(button.dataset.walletDelete);
    });
  });
}

function closeWalletDeleteModal() {
  if (!walletDeleteModal || walletDeletePending) {
    return;
  }

  walletDeleteTargetId = "";
  walletDeleteSubmitButton.disabled = false;
  walletDeleteCancelButton.disabled = false;
  walletDeleteCloseButton.disabled = false;
  walletDeleteSubmitButton.textContent = "Yes, Delete";
  walletDeleteModal.classList.add("hidden");
}

function openWalletDeleteModal(walletId) {
  if (!walletDeleteModal) {
    return;
  }

  const wallet = state.wallets.find((entry) => entry.id === walletId);
  if (!wallet || wallet.source === "env") {
    return;
  }

  walletDeleteTargetId = wallet.id;
  walletDeleteName.textContent = wallet.label || "Saved wallet";
  walletDeleteAddress.textContent = wallet.address || wallet.addressShort || "-";
  walletDeleteSubmitButton.disabled = false;
  walletDeleteCancelButton.disabled = false;
  walletDeleteCloseButton.disabled = false;
  walletDeleteSubmitButton.textContent = "Yes, Delete";
  walletDeleteModal.classList.remove("hidden");
  initializeMotionSurfaces(walletDeleteModal);
}

async function submitWalletDelete() {
  if (!walletDeleteTargetId || walletDeletePending) {
    return;
  }

  const wallet = state.wallets.find((entry) => entry.id === walletDeleteTargetId);
  if (!wallet) {
    closeWalletDeleteModal();
    return;
  }

  walletDeletePending = true;
  walletDeleteSubmitButton.disabled = true;
  walletDeleteCancelButton.disabled = true;
  walletDeleteCloseButton.disabled = true;
  walletDeleteSubmitButton.textContent = "Deleting...";

  try {
    await request(`/api/wallets/${wallet.id}`, { method: "DELETE" });
    deleteWalletAssetSnapshot(wallet.id);
    if (walletAssetInspector.walletId === wallet.id) {
      walletAssetInspector = createWalletAssetInspector();
      persistSelectedWalletAssetId("");
    }
    walletDeletePending = false;
    closeWalletDeleteModal();
    showToast(`${wallet.label || "Wallet"} removed from local storage.`, "success", "Wallet Deleted");
  } catch {
    walletDeletePending = false;
    walletDeleteSubmitButton.disabled = false;
    walletDeleteCancelButton.disabled = false;
    walletDeleteCloseButton.disabled = false;
    walletDeleteSubmitButton.textContent = "Yes, Delete";
  }
}

function selectedInspectedWallet() {
  return state.wallets.find((wallet) => wallet.id === walletAssetInspector.walletId) || null;
}

function displayedWalletAssetSnapshot(walletId) {
  if (!walletId) {
    return null;
  }

  const inspectorSnapshot =
    walletAssetInspector.walletId === walletId
      ? normalizeWalletAssetSnapshot({
          assets: walletAssetInspector.assets,
          warnings: walletAssetInspector.warnings,
          generatedAt: walletAssetInspector.generatedAt,
          summary: walletAssetInspector.summary
        })
      : null;

  return inspectorSnapshot || getWalletAssetSnapshot(walletId);
}

function renderWalletAssets() {
  if (!walletAssetsList || !walletAssetsTitle || !walletAssetsSubtitle || !walletAssetsStatus || !walletAssetsRefreshButton) {
    return;
  }

  const wallet = selectedInspectedWallet();
  if (!wallet) {
    walletAssetInspector = createWalletAssetInspector();
    persistSelectedWalletAssetId("");
    walletAssetsTitle.textContent = "Assets & Coins";
    walletAssetsSubtitle.textContent = "Click a wallet to view native balances across available EVM chains.";
    walletAssetsStatus.classList.add("hidden");
    walletAssetsStatus.textContent = "";
    walletAssetsRefreshButton.disabled = true;
    walletAssetsList.innerHTML = `
      <div class="empty-state">
        <h3>Select a wallet</h3>
        <p>Click any saved wallet to load its native coin balances.</p>
      </div>
    `;
    return;
  }

  walletAssetsTitle.textContent = `${wallet.label} Assets`;
  walletAssetsSubtitle.textContent = `${wallet.addressShort} | ${wallet.label} | ${walletDisplayBalance(wallet, {
    fallback: "$--",
    loadingLabel: "Loading..."
  })}`;
  walletAssetsRefreshButton.disabled = walletAssetInspector.loading || walletAssetsRefreshAllInFlight;

  const snapshot = displayedWalletAssetSnapshot(wallet.id);
  const hasSnapshotData = Boolean(snapshot);

  if (walletAssetInspector.loading && !hasSnapshotData) {
    walletAssetsStatus.classList.remove("hidden");
    walletAssetsStatus.textContent = "Loading balances across configured and discovered chains...";
    walletAssetsList.innerHTML = `
      <div class="empty-state">
        <h3>Loading assets</h3>
        <p>Checking reachable RPCs and reading native balances for this wallet.</p>
      </div>
    `;
    return;
  }

  if (walletAssetInspector.error && !hasSnapshotData) {
    walletAssetsStatus.classList.remove("hidden");
    walletAssetsStatus.textContent = walletAssetInspector.error;
    walletAssetsList.innerHTML = `
      <div class="empty-state">
        <h3>Asset lookup failed</h3>
        <p>${escapeHtml(walletAssetInspector.error)}</p>
      </div>
    `;
    return;
  }

  const allAssets = Array.isArray(snapshot?.assets) ? snapshot.assets : [];
  const assets = allAssets.filter((asset) => Number(asset.balanceFloat || 0) > 0);
  const warnings = Array.isArray(snapshot?.warnings) ? snapshot.warnings : [];
  const nonZeroCount = assets.length;
  const assetSummaryLabel = summarizeWalletAssets(assets, { maxItems: 3 });
  const statusParts = [];
  if (walletAssetInspector.loading) {
    statusParts.push("Refreshing balances...");
  }
  if (walletAssetInspector.error) {
    statusParts.push(walletAssetInspector.error);
  }
  if (snapshot?.generatedAt) {
    statusParts.push(`Synced ${relativeTime(snapshot.generatedAt)}`);
  }
  if (allAssets.length > 0) {
    statusParts.push(`${pluralize(allAssets.length, "chain")} checked`);
    statusParts.push(nonZeroCount > 0 ? `${pluralize(nonZeroCount, "balance")} above zero` : "No balances above zero");
  }
  if (assetSummaryLabel) {
    statusParts.unshift(`Total ${assetSummaryLabel}`);
  }
  if (Number.isFinite(Number(snapshot?.summary?.totalUsd)) && Math.abs(Number(snapshot.summary.totalUsd)) >= 0.01) {
    statusParts.unshift(`Approx ${formatUsdBalance(snapshot.summary.totalUsd)}`);
  } else if (!assetSummaryLabel && Number.isFinite(Number(snapshot?.summary?.totalUsd))) {
    statusParts.unshift(`Total ${formatUsdBalance(snapshot.summary.totalUsd)}`);
  }
  walletAssetsStatus.classList.toggle("hidden", statusParts.length === 0);
  walletAssetsStatus.textContent = statusParts.join(" | ");

  if (!assets.length && !warnings.length && !hasSnapshotData) {
    walletAssetsList.innerHTML = `
      <div class="empty-state">
        <h3>No balance data yet</h3>
        <p>Use View Assets or Refresh Assets to sync this wallet for the first time.</p>
      </div>
    `;
    return;
  }

  if (!assets.length && !warnings.length) {
    walletAssetsList.innerHTML = `
      <div class="empty-state">
        <h3>No balances above zero</h3>
        <p>This wallet was checked successfully, but every detected native balance is currently zero.</p>
      </div>
    `;
    return;
  }

  const assetMarkup = assets
    .map(
      (asset) => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(asset.chainLabel || asset.chainKey || "Unknown chain")}</strong>
            <p class="muted-copy">${escapeHtml(asset.assetName || asset.assetSymbol || "Native coin")}</p>
          </div>
          <div class="wallet-assets-value">
            <strong class="wallet-assets-balance">${escapeHtml(asset.balanceFormatted || "0")} ${escapeHtml(asset.assetSymbol || "")}</strong>
            <div class="wallet-assets-meta">
              ${
                Number.isFinite(Number(asset.usdValue))
                  ? `<span class="wallet-chip">${escapeHtml(formatUsdBalance(asset.usdValue))}</span>`
                  : ""
              }
            </div>
          </div>
        </div>
      `
    )
    .join("");

  const warningMarkup = warnings
    .map(
      (warning) => `
        <div class="wallet-assets-warning">
          <strong>${escapeHtml(warning.chainLabel || "Chain warning")}</strong>
          <p class="muted-copy">${escapeHtml(warning.message || "Unable to read this chain right now.")}</p>
        </div>
      `
    )
    .join("");
  walletAssetsList.innerHTML = `${assetMarkup}${warningMarkup}`;
}

function applyWalletAssetSnapshotToState(walletId, snapshot) {
  const normalizedSnapshot = normalizeWalletAssetSnapshot(snapshot);
  if (!normalizedSnapshot) {
    return;
  }

  setWalletAssetSnapshot(walletId, normalizedSnapshot);
  patchWalletBalance(walletId, {
    ...walletBalanceStateFromSnapshot(normalizedSnapshot),
    balanceLoading: false,
    balanceError: ""
  });
}

async function fetchWalletAssetSnapshot(walletId) {
  const payload = await request(`/api/wallets/${walletId}/assets`);
  return normalizeWalletAssetSnapshot({
    assets: Array.isArray(payload.assets) ? payload.assets : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    generatedAt: payload.generatedAt || new Date().toISOString(),
    summary: payload.summary || null
  });
}

async function refreshWalletAssetSnapshot(walletId, options = {}) {
  const { render = true } = options;
  const wallet = state.wallets.find((entry) => entry.id === walletId);
  if (!wallet) {
    return { ok: false, error: "Wallet not found" };
  }

  const cachedSnapshot = getWalletAssetSnapshot(walletId);

  patchWalletBalance(walletId, {
    balanceLoading: true,
    balanceError: ""
  });

  if (walletAssetInspector.walletId === walletId) {
    walletAssetInspector = createWalletAssetInspector(walletId, cachedSnapshot, {
      loading: true,
      error: ""
    });
  }

  if (render) {
    renderWallets();
    renderWalletAssets();
  }

  try {
    const snapshot = await fetchWalletAssetSnapshot(walletId);
    applyWalletAssetSnapshotToState(walletId, snapshot);

    if (walletAssetInspector.walletId === walletId) {
      walletAssetInspector = createWalletAssetInspector(walletId, snapshot);
    }

    if (render) {
      renderWallets();
      renderWalletAssets();
    }

    return { ok: true, snapshot };
  } catch (error) {
    const message = error.message || "Asset lookup failed";
    patchWalletBalance(walletId, {
      balanceLoading: false,
      balanceError: message
    });

    if (walletAssetInspector.walletId === walletId) {
      walletAssetInspector = createWalletAssetInspector(walletId, cachedSnapshot, {
        error: message
      });
    }

    if (render) {
      renderWallets();
      renderWalletAssets();
    }

    return { ok: false, error: message };
  }
}

async function refreshAllWalletBalances(options = {}) {
  const { silent = false, source = "manual" } = options;
  if (walletAssetsRefreshAllInFlight || state.wallets.length === 0) {
    return;
  }

  walletAssetsRefreshAllInFlight = true;
  walletAssetsAutoSyncInFlight = source === "auto";
  renderWallets();
  renderWalletAssets();

  let successCount = 0;
  let failureCount = 0;

  for (const wallet of state.wallets) {
    const result = await refreshWalletAssetSnapshot(wallet.id, { render: false });
    if (result.ok) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
  }

  walletAssetsRefreshAllInFlight = false;
  walletAssetsAutoSyncInFlight = false;
  renderWallets();
  renderWalletAssets();

  if (!silent) {
    showToast(
      failureCount > 0
        ? `Synced ${successCount}/${state.wallets.length} wallets. ${failureCount} need another retry.`
        : `Synced ${pluralize(successCount, "wallet")} successfully.`,
      failureCount > 0 ? "info" : "success",
      "Wallet Balances"
    );
  }
}

async function loadWalletAssets(walletId, options = {}) {
  const { force = false } = options;
  const wallet = state.wallets.find((entry) => entry.id === walletId);
  if (!wallet) {
    return;
  }

  selectWalletAsset(walletId);
  renderWallets();
  renderWalletAssets();

  if (!force && hasFreshWalletAssetSnapshot(walletId)) {
    return;
  }

  await refreshWalletAssetSnapshot(walletId);
}

function rpcHealthMarkup(node) {
  if (!node.lastHealth) {
    return '<span class="rpc-chip untested">Untested</span>';
  }

  if (node.lastHealth.status === "healthy") {
    if (rpcHealthAlertSeverity(node)) {
      return `<span class="rpc-chip warning">Slow · ${node.lastHealth.latencyMs}ms</span>`;
    }

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
    if (rpcHealthAlertSeverity(node)) {
      return `${blockLabel} Last verified ${relativeTime(node.lastHealth.checkedAt)}. Latency is above the mint-safe target.`;
    }

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
    : "Type an EVM chain name, choose Normal RPC or WebSockets, then click Import From Chainlist, Import From Alchemy, or Import From dRPC.";
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

function rpcDiscoveryCandidatesByTransport(candidates = rpcDiscoveryState.candidates || []) {
  const transportFilter = String(rpcDiscoveryState.transportFilter || "http");
  if (transportFilter === "ws") {
    return candidates.filter((candidate) => isSocketRpcUrl(candidate.url));
  }

  return candidates.filter((candidate) => !isSocketRpcUrl(candidate.url));
}

function healthyVisibleRpcDiscoveryCandidates() {
  return rpcDiscoveryCandidatesByTransport(healthyRpcDiscoveryCandidates());
}

function selectedRpcDiscoveryCandidates() {
  const selectedUrls = new Set(rpcDiscoveryState.selectedUrls || []);
  return healthyVisibleRpcDiscoveryCandidates().filter((candidate) => selectedUrls.has(candidate.url));
}

function updateRpcSubmitButton() {
  if (isRpcEditMode()) {
    rpcSubmitButton.textContent = "Update RPC Node";
    rpcSubmitButton.disabled = false;
    syncRpcImportButtons();
    return;
  }

  const selectedCount = selectedRpcDiscoveryCandidates().length;
  rpcSubmitButton.textContent = selectedCount > 0 ? `Add ${pluralize(selectedCount, "RPC Node")}` : "Add Selected RPCs";
  rpcSubmitButton.disabled = selectedCount === 0 || rpcDiscoveryState.loading;
  syncRpcImportButtons();
}

function renderRpcDiscoveryMatch(match = rpcDiscoveryState.match) {
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
    chips.push(`Match: ${match.term}`);
  }
  if (match.mode === "fuzzy") {
    chips.push("Fuzzy match");
  }
  if (match.source === "chainlist_search" && (!rpcDiscoveryState.providerKey || rpcDiscoveryState.providerKey === "chainlist")) {
    chips.push("Chainlist lookup");
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
      String(summary.sourceLabel || rpcDiscoveryState.providerLabel || "").trim() || null,
      `${Number(summary.published || 0)} published`,
      `${Number(summary.probed || 0)} probed`,
      `${Number(summary.healthy || 0)} healthy`,
      Number(summary.skippedExisting || 0) > 0 ? `${Number(summary.skippedExisting)} already saved` : null,
      Number(summary.skippedProbeBudget || 0) > 0 ? `${Number(summary.skippedProbeBudget)} unprobed` : null
    ].filter(Boolean);

    rpcInlineSummary.classList.toggle("hidden", chips.length === 0);
    rpcInlineSummary.innerHTML = chips.map((chip) => `<span class="queue-chip">${escapeHtml(chip)}</span>`).join("");
  }

  const visibleCount = healthyVisibleRpcDiscoveryCandidates().length;
  const selectedCount = healthyVisibleRpcDiscoveryCandidates().filter((candidate) =>
    (rpcDiscoveryState.selectedUrls || []).includes(candidate.url)
  ).length;
  if (visibleCount === 0) {
    rpcInlineSelectionStatus.classList.add("hidden");
    rpcInlineSelectionStatus.textContent = "";
  } else {
    rpcInlineSelectionStatus.classList.remove("hidden");
    rpcInlineSelectionStatus.textContent = `${pluralize(selectedCount, "RPC node")} selected from ${pluralize(visibleCount, "healthy result")} in this view.`;
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
    const providerLabel = rpcDiscoveryState.providerLabel || "provider";
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>Scanning ${escapeHtml(chainLabelCopy)}</h3>
        <p>Checking ${escapeHtml(providerLabel)} endpoints for healthy responses and low latency.</p>
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
        <p>Type an EVM chain name, choose the transport, then click Import From Chainlist, Import From Alchemy, or Import From dRPC.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  if (!rpcDiscoveryState.chain) {
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>No chain match yet</h3>
        <p>Keep typing the chain name, or try a different EVM network spelling. Non-EVM chains like Solana will not appear in this EVM RPC flow.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  if (rpcDiscoveryState.error) {
    const sourceLabel = rpcDiscoveryState.providerLabel || "Import";
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(sourceLabel)} failed</h3>
        <p>${escapeHtml(rpcDiscoveryState.error)}</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  if (!rpcDiscoveryState.summary) {
    const transportLabel = rpcDiscoveryState.transportFilter === "ws" ? "websocket" : "normal";
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>Choose an import source</h3>
        <p>${escapeHtml(rpcDiscoveryState.chain.label)} is ready. Click Import From Chainlist, Import From Alchemy, or Import From dRPC to load healthy ${escapeHtml(transportLabel)} RPCs.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  if (rpcDiscoveryState.summary?.transportUnavailable) {
    const transportLabel = rpcDiscoveryState.transportFilter === "ws" ? "websocket" : "normal";
    const sourceLabel = rpcDiscoveryState.summary?.sourceLabel || rpcDiscoveryState.providerLabel || "This provider";
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>No ${escapeHtml(transportLabel)} RPCs published</h3>
        <p>${escapeHtml(sourceLabel)} does not currently publish ${escapeHtml(transportLabel)} RPC URLs for ${escapeHtml(rpcDiscoveryState.chain.label)}.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  const filteredCandidates = healthyVisibleRpcDiscoveryCandidates();
  if (filteredCandidates.length === 0) {
    const sourceLabel = rpcDiscoveryState.summary?.sourceLabel || rpcDiscoveryState.providerLabel || "This source";
    if (rpcDiscoveryState.summary?.allConfigured) {
      rpcInlineCandidateList.innerHTML = `
        <div class="empty-state">
          <h3>Already configured</h3>
          <p>All published ${escapeHtml(sourceLabel)} RPCs for ${escapeHtml(rpcDiscoveryState.chain.label)} are already saved in your dashboard.</p>
        </div>
      `;
      renderRpcDiscoverySummary();
      updateRpcSubmitButton();
      return;
    }

    const transportLabel =
      rpcDiscoveryState.transportFilter === "ws"
        ? "websocket RPCs"
        : "normal RPCs";
    rpcInlineCandidateList.innerHTML = `
      <div class="empty-state">
        <h3>No healthy ${escapeHtml(transportLabel)} ready</h3>
        <p>The live probe did not find a healthy low-latency ${escapeHtml(transportLabel)} endpoint from ${escapeHtml(sourceLabel)} for ${escapeHtml(rpcDiscoveryState.chain.label)}.</p>
      </div>
    `;
    renderRpcDiscoverySummary();
    updateRpcSubmitButton();
    return;
  }

  const selectedUrls = new Set(rpcDiscoveryState.selectedUrls || []);
  rpcInlineCandidateList.innerHTML = filteredCandidates
    .map((candidate) => {
      const isSelected = selectedUrls.has(candidate.url);
      const rankingChip = candidate.recommended ? "Recommended" : `Rank #${candidate.rank || "?"}`;
      const transportLabel = isSocketRpcUrl(candidate.url) ? "WebSocket" : "HTTPS";
      const providerLabel = String(candidate.group || rpcDiscoveryState.summary?.sourceLabel || rpcDiscoveryState.providerLabel || "").trim();

      return `
        <label class="rpc-candidate-card ${escapeHtml(rpcVisualTone(candidate))} ${isSelected ? "selected" : ""}">
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
                ${providerLabel ? `<span class="queue-chip">${escapeHtml(providerLabel)}</span>` : ""}
                <span class="queue-chip">${escapeHtml(rankingChip)}</span>
                <span class="queue-chip">${escapeHtml(transportLabel)}</span>
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
    match: null,
    providerKey: "",
    providerLabel: "",
    candidates: [],
    selectedUrls: [],
    transportFilter: rpcDiscoveryState.transportFilter || "http",
    loading: false,
    summary: null,
    error: ""
  };

  if (!preserveQuery) {
    rpcChainSearchInput.value = "";
  }

  renderRpcTransportTabs();
  renderRpcDiscoveryMatch(null);
  renderRpcDiscoveryCandidates();
}

function renderRpcTransportTabs() {
  if (!rpcTransportTabs) {
    return;
  }

  rpcTransportTabs.querySelectorAll("[data-rpc-transport-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.rpcTransportFilter === rpcDiscoveryState.transportFilter);
  });
}

function applyRpcDiscoveryQueryState() {
  if (isRpcEditMode()) {
    return;
  }

  const query = String(rpcChainSearchInput.value || "").trim();
  const normalizedQuery = normalizeChainSearchValue(query);
  const transportFilter = String(rpcDiscoveryState.transportFilter || "http");

  if (!normalizedQuery) {
    clearRpcDiscoveryState();
    setRpcDetectMessage();
    updateRpcSubmitButton();
    return;
  }

  if (normalizedQuery.length < 2) {
    clearRpcDiscoveryState({ preserveQuery: true });
    setRpcDetectMessage("Keep typing the chain name, then choose where to import RPCs from.");
    updateRpcSubmitButton();
    return;
  }

  const localMatch = resolveRpcChainQuery(query);
  const provisionalChain = localMatch?.chain || null;
  rpcDiscoveryRequestId += 1;
  rpcDiscoveryState = {
    query,
    chain: provisionalChain,
    match: localMatch || null,
    providerKey: "",
    providerLabel: "",
    candidates: [],
    selectedUrls: [],
    transportFilter,
    loading: false,
    summary: null,
    error: ""
  };

  if (provisionalChain?.key) {
    rpcChainInput.value = provisionalChain.key;
  }

  const transportLabel = transportFilter === "ws" ? "websocket" : "normal";
  setRpcDetectMessage(
    provisionalChain?.label
      ? `${provisionalChain.label} matched. Click Import From Chainlist, Import From Alchemy, or Import From dRPC to load healthy ${transportLabel} RPCs.`
      : `Ready to look up "${query}". Click Import From Chainlist, Import From Alchemy, or Import From dRPC to load healthy RPCs.`
  );

  renderRpcTransportTabs();
  renderRpcDiscoveryMatch();
  renderRpcDiscoveryCandidates();
}

async function loadRpcDiscoveryCandidates(providerKey, options = {}) {
  const { forceRefresh = true } = options;
  if (isRpcEditMode()) {
    return;
  }

  const providerLabel =
    providerKey === "alchemy" ? "Alchemy" : providerKey === "drpc" ? "dRPC" : "Chainlist";
  const transportFilter = String(rpcDiscoveryState.transportFilter || "http");
  const query = String(rpcChainSearchInput.value || "").trim();
  const normalizedQuery = normalizeChainSearchValue(query);

  if (!normalizedQuery) {
    clearRpcDiscoveryState();
    setRpcDetectMessage();
    updateRpcSubmitButton();
    return;
  }

  if (normalizedQuery.length < 2) {
    applyRpcDiscoveryQueryState();
    return;
  }

  const localMatch = resolveRpcChainQuery(query);
  const provisionalChain = localMatch?.chain || null;
  const requestId = ++rpcDiscoveryRequestId;
  const priorSelection =
    providerKey === rpcDiscoveryState.providerKey &&
    provisionalChain &&
    provisionalChain.key === rpcDiscoveryState.chain?.key
      ? new Set(rpcDiscoveryState.selectedUrls || [])
      : new Set();

  rpcDiscoveryState = {
    query,
    chain: provisionalChain,
    match: localMatch || null,
    providerKey,
    providerLabel,
    candidates: [],
    selectedUrls: [],
    transportFilter,
    loading: true,
    summary: null,
    error: ""
  };

  if (provisionalChain?.key) {
    rpcChainInput.value = provisionalChain.key;
  }

  setRpcDetectMessage(
    provisionalChain?.label
      ? `Scanning ${providerLabel} ${transportFilter === "ws" ? "websocket" : "normal"} RPCs for ${provisionalChain.label}...`
      : `Looking up "${query}" in ${providerLabel} and scanning healthy RPCs...`
  );
  renderRpcTransportTabs();
  renderRpcDiscoveryMatch();
  renderRpcDiscoveryCandidates();

  try {
    const endpoint =
      providerKey === "alchemy"
        ? "/api/rpc-nodes/alchemy-candidates"
        : providerKey === "drpc"
          ? "/api/rpc-nodes/drpc-candidates"
          : "/api/rpc-nodes/chainlist-candidates";
    const payload = await request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainKey: localMatch?.chain?.key || "",
        query,
        transportFilter: "all",
        limit: 10,
        probeBudget: 20,
        forceRefresh
      }),
      quiet: true
    });

    if (requestId !== rpcDiscoveryRequestId) {
      return;
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const resolvedChain = payload.chain || provisionalChain;
    if (resolvedChain) {
      ensureChainOption(resolvedChain);
      rpcChainInput.value = resolvedChain.key;
    }

    const healthyUrls = candidates
      .filter((candidate) => candidate.lastHealth?.status === "healthy")
      .map((candidate) => candidate.url);
    const selectedUrls = healthyUrls.filter((url) => priorSelection.has(url));
    const resolution = payload.resolution || {};
    const resolvedTerm = normalizeChainSearchValue(resolution.term || query);
    const match = resolvedChain
      ? {
          chain: resolvedChain,
          term: resolvedTerm,
          mode: resolution.mode || localMatch?.mode || "exact",
          source: resolution.source || (localMatch ? "local" : "chainlist_search")
        }
      : null;

    rpcDiscoveryState = {
      query,
      chain: resolvedChain,
      match,
      providerKey,
      providerLabel: String(payload.sourceLabel || providerLabel).trim() || providerLabel,
      candidates,
      selectedUrls: selectedUrls.length > 0 ? selectedUrls : healthyUrls,
      transportFilter,
      loading: false,
      summary: payload,
      error: ""
    };

    const healthyCount = Number(payload.healthy || 0);
    const transportLabel = transportFilter === "ws" ? "websocket" : "normal";
    setRpcDetectMessage(
      payload.transportUnavailable
        ? `${resolvedChain.label} matched, but ${providerLabel} does not currently publish ${transportLabel} RPC URLs for this chain.`
        : payload.allConfigured
          ? `${resolvedChain.label} matched. All published ${providerLabel} RPCs for this chain are already configured.`
          : healthyCount > 0
            ? `${resolvedChain.label} matched. ${providerLabel} results are loaded below and preselected so you can uncheck any you do not want.`
            : `${resolvedChain.label} matched, but no healthy ${providerLabel} RPC endpoints passed the live probe.`
    );
  } catch (error) {
    if (requestId !== rpcDiscoveryRequestId) {
      return;
    }

    const message = error.message || `${providerLabel} scan failed for "${query}". Try again in a moment.`;
    rpcDiscoveryState = {
      query,
      chain: provisionalChain,
      match: localMatch || null,
      providerKey,
      providerLabel,
      candidates: [],
      selectedUrls: [],
      transportFilter,
      loading: false,
      summary: null,
      error: message
    };
    setRpcDetectMessage(message);
  }

  renderRpcTransportTabs();
  renderRpcDiscoveryMatch();
  renderRpcDiscoveryCandidates();
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
  const progressIndicator = startOperationProgress(rpcOperationProgress, {
    steps: [
      `Preparing ${pluralize(selectedCandidates.length, "selected RPC")}...`,
      "Saving RPC nodes into the mesh...",
      "Refreshing the mesh view..."
    ],
    successLabel: "RPC add complete.",
    errorLabel: "RPC add failed."
  });
  progressIndicator.update(12, `Preparing ${pluralize(selectedCandidates.length, "selected RPC")}...`);

  let savedCount = 0;
  const failures = [];

  for (const [index, candidate] of selectedCandidates.entries()) {
    const progressPercent = 18 + Math.round(((index + 1) / Math.max(selectedCandidates.length, 1)) * 60);
    progressIndicator.update(
      progressPercent,
      `Saving RPC ${index + 1} of ${selectedCandidates.length}: ${candidate.name || candidate.url || "endpoint"}`
    );
    try {
      await request("/api/rpc-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.name,
          chainKey: candidate.chainKey,
          url: candidate.url,
          group: candidate.group || rpcDiscoveryState.providerLabel || "Custom"
        }),
        quiet: true
      });
      savedCount += 1;
    } catch (error) {
      failures.push({ candidate, error });
    }
  }

  progressIndicator.update(90, "Refreshing RPC mesh state...");

  try {
    await loadState();
    populateChainSelectors();
  } catch {}

  if (rpcChainSearchInput.value.trim() && rpcDiscoveryState.providerKey) {
    await loadRpcDiscoveryCandidates(rpcDiscoveryState.providerKey, { forceRefresh: true });
  } else {
    renderRpcDiscoveryCandidates();
  }

  rpcSubmitButton.disabled = false;
  rpcSubmitButton.textContent = buttonLabel;
  updateRpcSubmitButton();

  const providerLabel = rpcDiscoveryState.providerLabel || "RPC";
  if (savedCount > 0 && failures.length === 0) {
    progressIndicator.complete(
      `${savedCount} ${providerLabel} RPC node${savedCount === 1 ? "" : "s"} added successfully.`
    );
    showToast(
      `${savedCount} ${providerLabel} RPC node${savedCount === 1 ? "" : "s"} added from the current selection.`,
      "success",
      "RPC Added"
    );
    return;
  }

  if (savedCount > 0) {
    progressIndicator.fail(`${savedCount} saved, ${failures.length} failed.`);
    showToast(
      `${savedCount} saved, ${failures.length} failed. The remaining healthy RPCs are still listed below.`,
      "info",
      "Partial RPC Import"
    );
    return;
  }

  progressIndicator.fail("No RPC nodes were added.");
  showToast("No RPC nodes were added from the current selection.", "error", "RPC Save Failed");
}

function resetRpcForm(options = {}) {
  const { preserveSearch = false } = options;
  activeRpcEditId = null;
  rpcAutoSuggestedName = "";
  rpcFormGroup = "Custom";
  rpcSelectedChainlistCandidate = null;
  resetOperationProgress(rpcOperationProgress, {
    hide: true,
    label: "Preparing RPC import..."
  });
  rpcFormTitle.textContent = "Discovery Lab";
  rpcFormSubtitle.textContent = "Scan low-latency RPCs, stack healthy fallbacks, and deepen the mint mesh chain by chain.";
  rpcFormBadge.classList.add("hidden");
  rpcCancelButton.classList.add("hidden");
  rpcImportChainlistButton.classList.remove("hidden");
  rpcImportAlchemyButton?.classList.remove("hidden");
  rpcImportDrpcButton?.classList.remove("hidden");
  rpcImportChainlistButton.textContent = "Import From Chainlist";
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
      applyRpcDiscoveryQueryState();
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
  rpcImportAlchemyButton?.classList.add("hidden");
  rpcImportDrpcButton?.classList.add("hidden");
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
      const transportLabel = isSocketRpcUrl(candidate.url) ? "WebSocket" : "HTTPS";

      return `
        <button
          class="rpc-candidate-card ${escapeHtml(rpcVisualTone(candidate))} ${isSelected ? "selected" : ""}"
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
                <span class="queue-chip">${escapeHtml(transportLabel)}</span>
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
        transportFilter: rpcDiscoveryState.transportFilter || "http",
        limit: 8,
        probeBudget: rpcDiscoveryState.transportFilter === "ws" ? 8 : 12,
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

  resetOperationProgress(rpcConfirmProgress, {
    hide: true,
    label: "Validating RPC endpoint..."
  });
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
  resetOperationProgress(rpcConfirmProgress, {
    hide: true,
    label: "Validating RPC endpoint..."
  });
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
  const progressIndicator = startOperationProgress(rpcConfirmProgress, {
    steps: [
      "Inspecting RPC endpoint...",
      "Detecting chain and latency...",
      wasEditing ? "Updating RPC in the mesh..." : "Saving RPC into the mesh..."
    ],
    successLabel: wasEditing ? "RPC updated successfully." : "RPC saved successfully.",
    errorLabel: wasEditing ? "RPC update failed." : "RPC save failed."
  });
  progressIndicator.update(16, "Inspecting RPC endpoint...");

  try {
    await request("/api/rpc-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    progressIndicator.update(88, wasEditing ? "Applying updated RPC settings..." : "Finalizing RPC save...");
    progressIndicator.complete(wasEditing ? "RPC updated successfully." : "RPC saved successfully.");
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    closeRpcConfirmModal();
    resetRpcForm();
    showToast(
      wasEditing ? "RPC node updated successfully." : "RPC node saved to the mesh.",
      "success",
      wasEditing ? "RPC Updated" : "RPC Added"
    );
  } catch {
    progressIndicator.fail(wasEditing ? "RPC update failed." : "RPC save failed.");
    rpcConfirmSubmitButton.disabled = false;
    rpcConfirmSubmitButton.textContent = buttonLabel;
    return;
  }

  rpcConfirmSubmitButton.disabled = false;
  rpcConfirmSubmitButton.textContent = buttonLabel;
}

function closeRpcDeleteModal() {
  if (!rpcDeleteModal || rpcDeletePending) {
    return;
  }

  rpcDeleteTargetId = "";
  rpcDeleteSubmitButton.disabled = false;
  rpcDeleteCancelButton.disabled = false;
  rpcDeleteCloseButton.disabled = false;
  rpcDeleteSubmitButton.textContent = "Yes, Delete";
  rpcDeleteModal.classList.add("hidden");
}

function openRpcDeleteModal(rpcId) {
  if (!rpcDeleteModal) {
    return;
  }

  const node = state.rpcNodes.find((entry) => entry.id === rpcId);
  if (!node || node.source === "env") {
    return;
  }

  rpcDeleteTargetId = node.id;
  rpcDeleteName.textContent = node.name || "Saved RPC";
  rpcDeleteChain.textContent = node.chainLabel || chainLabel(node.chainKey) || "Unknown chain";
  rpcDeleteUrl.textContent = node.url || "-";
  rpcDeleteSubmitButton.disabled = false;
  rpcDeleteCancelButton.disabled = false;
  rpcDeleteCloseButton.disabled = false;
  rpcDeleteSubmitButton.textContent = "Yes, Delete";
  rpcDeleteModal.classList.remove("hidden");
  initializeMotionSurfaces(rpcDeleteModal);
}

async function submitRpcDelete() {
  if (!rpcDeleteTargetId || rpcDeletePending) {
    return;
  }

  const node = state.rpcNodes.find((entry) => entry.id === rpcDeleteTargetId);
  if (!node) {
    closeRpcDeleteModal();
    return;
  }

  rpcDeletePending = true;
  rpcDeleteSubmitButton.disabled = true;
  rpcDeleteCancelButton.disabled = true;
  rpcDeleteCloseButton.disabled = true;
  rpcDeleteSubmitButton.textContent = "Deleting...";

  try {
    await request(`/api/rpc-nodes/${node.id}`, { method: "DELETE" });
    if (activeRpcEditId === node.id) {
      resetRpcForm();
    }
    rpcDeletePending = false;
    closeRpcDeleteModal();
    showToast(`${node.name || "RPC node"} removed from the mesh.`, "success", "RPC Deleted");
  } catch {
    rpcDeletePending = false;
    rpcDeleteSubmitButton.disabled = false;
    rpcDeleteCancelButton.disabled = false;
    rpcDeleteCloseButton.disabled = false;
    rpcDeleteSubmitButton.textContent = "Yes, Delete";
  }
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

function rpcHealthAlertSeverity(node) {
  if (node?.lastHealth?.status === "error") {
    return "critical";
  }

  if (node?.lastHealth?.status !== "healthy") {
    return null;
  }

  const latency = rpcLatencyValue(node);
  if (!Number.isFinite(latency)) {
    return null;
  }

  if (latency >= rpcHealthCriticalLatencyMs) {
    return "critical";
  }

  if (latency >= rpcHealthWarningLatencyMs) {
    return "warning";
  }

  return null;
}

function rpcAlertNodeLabel(node) {
  return node?.name || truncateMiddle(node?.url || "RPC node", 20, 12);
}

function buildRpcHealthAlerts(rpcNodes = state.rpcNodes) {
  const enabledNodes = (rpcNodes || []).filter((node) => node.enabled !== false);
  const downNodes = enabledNodes.filter((node) => node.lastHealth?.status === "error");
  const highLatencyNodes = enabledNodes
    .filter((node) => node.lastHealth?.status === "healthy" && rpcHealthAlertSeverity(node))
    .sort((left, right) => rpcLatencyValue(right) - rpcLatencyValue(left));
  const alerts = [];

  if (downNodes.length > 0) {
    const rpcNames = downNodes
      .slice(0, 3)
      .map((node) => rpcAlertNodeLabel(node))
      .join(", ");
    alerts.push({
      severity: "critical",
      title: downNodes.length === 1 ? "RPC node down" : "Multiple RPC nodes down",
      detail: `${rpcNames}${downNodes.length > 3 ? ` +${downNodes.length - 3} more` : ""}. Check or replace the failing endpoint${downNodes.length === 1 ? "" : "s"} before the next mint window.`
    });
  }

  if (highLatencyNodes.length > 0) {
    const latencyPreview = highLatencyNodes
      .slice(0, 3)
      .map((node) => `${rpcAlertNodeLabel(node)} (${formatLatencyLabel(node.lastHealth?.latencyMs)})`)
      .join(", ");
    const hasCriticalLatency = highLatencyNodes.some((node) => rpcHealthAlertSeverity(node) === "critical");
    alerts.push({
      severity: hasCriticalLatency ? "critical" : "warning",
      title: highLatencyNodes.length === 1 ? "High-latency RPC detected" : "High-latency RPCs detected",
      detail: `${latencyPreview}${highLatencyNodes.length > 3 ? ` +${highLatencyNodes.length - 3} more` : ""}. Avoid routing hot mints through the slow endpoint${highLatencyNodes.length === 1 ? "" : "s"}.`
    });
  }

  return alerts;
}

function buildRpcAlertEntries(rpcNodes = state.rpcNodes) {
  return (rpcNodes || [])
    .filter((node) => node.enabled !== false)
    .flatMap((node) => {
      if (node.lastHealth?.status === "error") {
        return [
          {
            id: `rpc-alert-error-${node.id}`,
            nodeId: node.id,
            tone: "error",
            chipClass: "blocked",
            chipLabel: "RPC Down",
            title: `${node.name || "RPC node"} failed health checks`,
            detail: rpcHealthDetail(node),
            chainLabel: node.chainLabel || chainLabel(node.chainKey),
            sourceLabel: node.source === "env" ? "Env managed" : "Stored RPC",
            url: node.url || "",
            metric: new Date(node.lastHealth?.checkedAt || 0).getTime() || 0,
            action:
              node.source === "env"
                ? {
                    type: "disabled",
                    label: "Env Managed",
                    title: "This RPC is managed through environment variables."
                  }
                : {
                    type: "fix",
                    label: "Fix",
                    title: "Remove the failed state and re-add this RPC through the normal save flow."
                  }
          }
        ];
      }

      const severity = rpcHealthAlertSeverity(node);
      if (node.lastHealth?.status === "healthy" && severity) {
        return [
          {
            id: `rpc-alert-latency-${node.id}`,
            nodeId: node.id,
            tone: severity === "critical" ? "error" : "warning",
            chipClass: severity === "critical" ? "blocked" : "warming",
            chipLabel: severity === "critical" ? "Critical Latency" : "High Latency",
            title: `${node.name || "RPC node"} is running slow`,
            detail: rpcHealthDetail(node),
            chainLabel: node.chainLabel || chainLabel(node.chainKey),
            sourceLabel: node.source === "env" ? "Env managed" : "Stored RPC",
            url: node.url || "",
            metric: Number(node.lastHealth?.latencyMs) || 0,
            action: {
              type: "test",
              label: "Retest",
              title: "Run another live health probe for this endpoint."
            }
          }
        ];
      }

      return [];
    })
    .sort((left, right) => {
      const toneRank = { error: 0, warning: 1, healthy: 2 };
      const toneDelta = (toneRank[left.tone] ?? 99) - (toneRank[right.tone] ?? 99);
      if (toneDelta !== 0) {
        return toneDelta;
      }

      const metricDelta = Number(right.metric || 0) - Number(left.metric || 0);
      if (metricDelta !== 0) {
        return metricDelta;
      }

      return String(left.title || "").localeCompare(String(right.title || ""));
    });
}

async function runRpcNodeTest(rpcId) {
  const node = state.rpcNodes.find((entry) => entry.id === rpcId);
  const payload = await request(`/api/rpc-nodes/${rpcId}/test`, { method: "POST" });
  applyRpcHealthProbeResults([{ id: rpcId, health: payload.health }], { notifyTransitions: false });

  const severity = rpcHealthAlertSeverity({ lastHealth: payload.health });
  const nodeLabel = node?.name || "RPC node";
  if (payload.health?.status === "error") {
    showToast(
      `${nodeLabel} failed the latest health check. ${payload.health.error || "Review the RPC alert card for details."}`,
      "error",
      "RPC Failure Detected"
    );
    return;
  }

  if (severity === "critical") {
    showToast(
      `${nodeLabel} responded, but latency is ${formatLatencyLabel(payload.health?.latencyMs)} and is outside the mint-safe target.`,
      "error",
      "RPC Critical Latency"
    );
    return;
  }

  if (severity === "warning") {
    showToast(
      `${nodeLabel} is online, but latency is elevated at ${formatLatencyLabel(payload.health?.latencyMs)}.`,
      "info",
      "RPC Latency Warning"
    );
    return;
  }

  showToast(`${nodeLabel} is healthy at ${formatLatencyLabel(payload.health?.latencyMs)}.`, "success", "RPC Healthy");
}

async function fixRpcNode(rpcId) {
  const node = state.rpcNodes.find((entry) => entry.id === rpcId);
  if (!node) {
    return;
  }

  if (node.source === "env") {
    showToast("Env RPC nodes must be fixed through environment variables.", "info", "RPC Repair");
    return;
  }

  const payload = await request(`/api/rpc-nodes/${rpcId}/fix`, { method: "POST" });
  if (payload.rpcNode?.chainKey && payload.rpcNode?.chainLabel && payload.rpcNode?.chainId != null) {
    ensureChainOption({
      key: payload.rpcNode.chainKey,
      label: payload.rpcNode.chainLabel,
      chainId: payload.rpcNode.chainId
    });
  }

  state.rpcNodes = state.rpcNodes.map((entry) => (entry.id === rpcId ? payload.rpcNode || entry : entry));
  renderRpcHealthSurfaces();
  showToast(
    `${payload.rpcNode?.name || node.name || "RPC node"} recovered at ${formatLatencyLabel(
      payload.rpcNode?.lastHealth?.latencyMs
    )}.`,
    "success",
    "RPC Repair"
  );
}

function renderRpcAlerts(rpcNodes = state.rpcNodes) {
  if (!rpcAlertList) {
    return;
  }

  const entries = buildRpcAlertEntries(rpcNodes);
  const enabledNodes = (rpcNodes || []).filter((node) => node.enabled !== false);
  const healthyNodes = enabledNodes.filter(
    (node) => node.lastHealth?.status === "healthy" && !rpcHealthAlertSeverity(node)
  );
  const checkedNodes = enabledNodes.filter((node) => node.lastHealth?.checkedAt);
  if (!entries.length) {
    if (!enabledNodes.length) {
      rpcAlertList.innerHTML = `
        <article class="rpc-alert-card">
          <div class="chip-row">
            <span class="queue-chip">Awaiting RPCs</span>
          </div>
          <strong>No RPC mesh yet</strong>
          <p>Add at least one endpoint to start live failure and latency monitoring here.</p>
        </article>
      `;
      return;
    }

    if (!checkedNodes.length) {
      rpcAlertList.innerHTML = `
        <article class="rpc-alert-card">
          <div class="chip-row">
            <span class="queue-chip">Awaiting Pulse</span>
          </div>
          <strong>No live RPC probe data yet</strong>
          <p>Auto-sync runs every ${escapeHtml(rpcHealthCadenceLabel())} while your session is active. Click Refresh to pulse the mesh now.</p>
        </article>
      `;
      return;
    }

    rpcAlertList.innerHTML = `
      <article class="rpc-alert-card healthy">
        <div class="chip-row">
          <span class="queue-chip armed">Mesh Healthy</span>
        </div>
        <strong>No RPC alerts right now</strong>
        <p>${healthyNodes.length}/${enabledNodes.length} enabled RPC endpoints are healthy and under the warning latency target.</p>
      </article>
    `;
    return;
  }

  rpcAlertList.innerHTML = entries
    .map(
      (entry) => `
        <article class="rpc-alert-card ${escapeHtml(entry.tone)}">
          <div class="rpc-alert-head">
            <div class="rpc-alert-copy">
              <div class="chip-row">
                <span class="queue-chip ${escapeHtml(entry.chipClass)}">${escapeHtml(entry.chipLabel)}</span>
                <span class="queue-chip">${escapeHtml(entry.chainLabel || "Unknown Chain")}</span>
                <span class="queue-chip">${escapeHtml(entry.sourceLabel)}</span>
                ${
                  entry.tone === "warning" && Number.isFinite(Number(entry.metric))
                    ? `<span class="queue-chip">${escapeHtml(formatLatencyLabel(entry.metric))}</span>`
                    : ""
                }
              </div>
              <strong>${escapeHtml(entry.title)}</strong>
              <p>${escapeHtml(entry.detail)}</p>
              <p class="rpc-alert-url" title="${escapeHtml(entry.url)}">${escapeHtml(entry.url)}</p>
            </div>
            <div class="rpc-alert-actions">
              ${
                entry.action?.type === "fix"
                  ? `<button class="mini-button primary fx-button" data-rpc-fix="${escapeHtml(entry.nodeId)}" title="${escapeHtml(entry.action.title || "")}" type="button">${escapeHtml(entry.action.label)}</button>`
                  : entry.action?.type === "test"
                    ? `<button class="mini-button fx-button" data-rpc-alert-test="${escapeHtml(entry.nodeId)}" title="${escapeHtml(entry.action.title || "")}" type="button">${escapeHtml(entry.action.label)}</button>`
                    : `<button class="mini-button" disabled title="${escapeHtml(entry.action?.title || "No action available")}" type="button">${escapeHtml(entry.action?.label || "No Action")}</button>`
              }
            </div>
          </div>
        </article>
      `
    )
    .join("");

  rpcAlertList.querySelectorAll("[data-rpc-fix]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await fixRpcNode(button.dataset.rpcFix);
      } catch {}
    });
  });

  rpcAlertList.querySelectorAll("[data-rpc-alert-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await runRpcNodeTest(button.dataset.rpcAlertTest);
      } catch {}
    });
  });
}

function rpcVisualTone(node) {
  if (node?.lastHealth?.status === "error") {
    return "error";
  }

  if (node?.lastHealth?.status === "healthy" && rpcHealthAlertSeverity(node)) {
    return "warning";
  }

  return node?.lastHealth?.status || "untested";
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

async function pulseRpcMesh(options = {}) {
  const { silent = false } = options;
  if (rpcHealthAutoPulseInFlight) {
    return null;
  }

  rpcHealthAutoPulseInFlight = true;
  renderRpcHealthSyncStatus();
  try {
    const payload = await request("/api/control/test-rpc-pool", {
      method: "POST",
      quiet: silent
    });
    applyRpcHealthProbeResults(payload.results, { notifyTransitions: silent });
    const summary = payload.summary || {};
    const slowCount = Array.isArray(payload.results)
      ? payload.results.filter(
          (entry) =>
            entry?.health?.status === "healthy" && Boolean(rpcHealthAlertSeverity({ lastHealth: entry.health }))
        ).length
      : 0;
    if (!silent) {
      showToast(
        `${summary.healthy || 0} healthy, ${summary.error || 0} down, ${slowCount} slow, ${summary.total || 0} total`,
        summary.error > 0 ? "error" : slowCount > 0 ? "info" : "success",
        summary.error > 0 ? "RPC Failures Detected" : slowCount > 0 ? "RPC Warnings Found" : "RPC Refreshed"
      );
      return payload;
    }
    return payload;
  } finally {
    rpcHealthAutoPulseInFlight = false;
    renderRpcHealthSyncStatus();
  }

}

function currentRpcImportRequestPayload() {
  return {
    chainKey: String(rpcDiscoveryState.chain?.key || "").trim(),
    query: String(rpcChainSearchInput?.value || rpcDiscoveryState.query || "").trim(),
    transportFilter: String(rpcDiscoveryState.transportFilter || "http")
  };
}

function syncRpcImportButtons() {
  const isEditing = isRpcEditMode();
  const { query, transportFilter } = currentRpcImportRequestPayload();
  const hasQuery = Boolean(query);
  const transportLabel = transportFilter === "ws" ? "websocket" : "normal";

  if (rpcImportChainlistButton) {
    rpcImportChainlistButton.disabled = isEditing || rpcDiscoveryState.loading || !hasQuery;
    rpcImportChainlistButton.title = hasQuery
      ? `Load healthy Chainlist RPCs for the typed chain. Use the tabs to switch between ${transportLabel === "websocket" ? "websocket and normal" : "normal and websocket"} results without importing again.`
      : "Type an EVM chain name first.";
  }

  if (!rpcImportAlchemyButton) {
    return;
  }

  const configured = Boolean(state.settings.alchemyApiKeyConfigured);
  rpcImportAlchemyButton.disabled = isEditing || rpcDiscoveryState.loading || !hasQuery || !configured;
  rpcImportAlchemyButton.title = !hasQuery
    ? "Type an EVM chain name first."
    : !configured
      ? "Save an Alchemy API key in Settings first."
      : "Load healthy Alchemy RPCs for the typed chain. Use the tabs to switch between normal and websocket results without importing again.";

  if (!rpcImportDrpcButton) {
    return;
  }

  const drpcConfigured = Boolean(state.settings.drpcApiKeyConfigured);
  rpcImportDrpcButton.disabled = isEditing || rpcDiscoveryState.loading || !hasQuery || !drpcConfigured;
  rpcImportDrpcButton.title = !hasQuery
    ? "Type an EVM chain name first."
    : !drpcConfigured
      ? "Save a dRPC API key in Settings first."
      : "Load healthy dRPC endpoints for the typed chain. Use the tabs to switch between normal and websocket results without importing again.";
}

async function importChainlistRpcs() {
  const payload = currentRpcImportRequestPayload();
  if (!payload.query && !payload.chainKey) {
    throw new Error("Type an EVM chain name before importing Chainlist RPCs.");
  }

  const providerLabel = rpcImportProviderLabel("chainlist");
  const progressIndicator = startOperationProgress(rpcOperationProgress, {
    steps: [
      `Contacting ${providerLabel}...`,
      `Getting RPC candidates from ${providerLabel}...`,
      "Ranking healthy endpoints..."
    ],
    successLabel: `${providerLabel} RPCs ready.`,
    errorLabel: `${providerLabel} import failed.`
  });

  progressIndicator.update(16, `Contacting ${providerLabel}...`);

  try {
    await loadRpcDiscoveryCandidates("chainlist", { forceRefresh: true });
    const total = Array.isArray(rpcDiscoveryState.candidates) ? rpcDiscoveryState.candidates.length : 0;
    const healthy = Array.isArray(rpcDiscoveryState.candidates)
      ? rpcDiscoveryState.candidates.filter((candidate) => candidate.lastHealth?.status === "healthy").length
      : 0;
    progressIndicator.update(
      82,
      total
        ? `Received ${pluralize(total, "candidate")} from ${providerLabel}.`
        : `No RPC candidates returned from ${providerLabel}.`
    );
    progressIndicator.complete(
      total
        ? `${healthy}/${total} healthy endpoint${total === 1 ? "" : "s"} ready to add.`
        : `No RPCs found from ${providerLabel}.`
    );
  } catch (error) {
    progressIndicator.fail(`${providerLabel} import failed.`);
    throw error;
  }
}

async function importAlchemyRpcs() {
  const payload = currentRpcImportRequestPayload();
  if (!payload.query && !payload.chainKey) {
    throw new Error("Type an EVM chain name before importing Alchemy RPCs.");
  }

  const providerLabel = rpcImportProviderLabel("alchemy");
  const progressIndicator = startOperationProgress(rpcOperationProgress, {
    steps: [
      `Contacting ${providerLabel}...`,
      `Getting RPC candidates from ${providerLabel}...`,
      "Ranking healthy endpoints..."
    ],
    successLabel: `${providerLabel} RPCs ready.`,
    errorLabel: `${providerLabel} import failed.`
  });

  progressIndicator.update(16, `Contacting ${providerLabel}...`);

  try {
    await loadRpcDiscoveryCandidates("alchemy", { forceRefresh: true });
    const total = Array.isArray(rpcDiscoveryState.candidates) ? rpcDiscoveryState.candidates.length : 0;
    const healthy = Array.isArray(rpcDiscoveryState.candidates)
      ? rpcDiscoveryState.candidates.filter((candidate) => candidate.lastHealth?.status === "healthy").length
      : 0;
    progressIndicator.update(
      82,
      total
        ? `Received ${pluralize(total, "candidate")} from ${providerLabel}.`
        : `No RPC candidates returned from ${providerLabel}.`
    );
    progressIndicator.complete(
      total
        ? `${healthy}/${total} healthy endpoint${total === 1 ? "" : "s"} ready to add.`
        : `No RPCs found from ${providerLabel}.`
    );
  } catch (error) {
    progressIndicator.fail(`${providerLabel} import failed.`);
    throw error;
  }
}

async function importDrpcRpcs() {
  const payload = currentRpcImportRequestPayload();
  if (!payload.query && !payload.chainKey) {
    throw new Error("Type an EVM chain name before importing dRPC endpoints.");
  }

  const providerLabel = rpcImportProviderLabel("drpc");
  const progressIndicator = startOperationProgress(rpcOperationProgress, {
    steps: [
      `Contacting ${providerLabel}...`,
      `Getting RPC candidates from ${providerLabel}...`,
      "Ranking healthy endpoints..."
    ],
    successLabel: `${providerLabel} RPCs ready.`,
    errorLabel: `${providerLabel} import failed.`
  });

  progressIndicator.update(16, `Contacting ${providerLabel}...`);

  try {
    await loadRpcDiscoveryCandidates("drpc", { forceRefresh: true });
    const total = Array.isArray(rpcDiscoveryState.candidates) ? rpcDiscoveryState.candidates.length : 0;
    const healthy = Array.isArray(rpcDiscoveryState.candidates)
      ? rpcDiscoveryState.candidates.filter((candidate) => candidate.lastHealth?.status === "healthy").length
      : 0;
    progressIndicator.update(
      82,
      total
        ? `Received ${pluralize(total, "candidate")} from ${providerLabel}.`
        : `No RPC candidates returned from ${providerLabel}.`
    );
    progressIndicator.complete(
      total
        ? `${healthy}/${total} healthy endpoint${total === 1 ? "" : "s"} ready to add.`
        : `No RPCs found from ${providerLabel}.`
    );
  } catch (error) {
    progressIndicator.fail(`${providerLabel} import failed.`);
    throw error;
  }
}

function renderRpcNodes() {
  if (activeRpcEditId && !state.rpcNodes.some((node) => node.id === activeRpcEditId)) {
    resetRpcForm();
  }

  syncRpcImportButtons();
  renderRpcHealthSyncStatus();
  renderRpcAlerts();

  const chainGroups = buildRpcChainGroups();
  renderRpcOperationsOverview(chainGroups);
  renderRpcBroadcastAdvisor(chainGroups);

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
                    <article class="rpc-node-card ${escapeHtml(rpcVisualTone(node))}">
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
                            ${
                              node.source === "env"
                                ? '<span class="queue-chip">Env Managed</span>'
                                : ""
                            }
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
    button.addEventListener("click", () => {
      openRpcDeleteModal(button.dataset.rpcDelete);
    });
  });

  rpcList.querySelectorAll("[data-rpc-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await runRpcNodeTest(button.dataset.rpcTest);
      } catch {}
    });
  });
}

function setApiKeyStatus({
  input,
  statusNode,
  source,
  healthStatus = "missing",
  message = null,
  pendingValue = "",
  pendingValidated = false
}) {
  let status = "empty";
  let text = "Not configured";

  if (message) {
    const normalizedMessage = String(message).toLowerCase();

    text = message;
    if (normalizedMessage.includes("fail")) {
      status = "error";
    } else if (normalizedMessage.includes("no key")) {
      status = "empty";
    } else {
      status = "draft";
    }
  } else if (input.value.trim()) {
    text = "New key ready to test or save";
    status = "draft";
  } else if (pendingValue) {
    text = pendingValidated ? "Verified key hidden until you save" : "Pending key hidden until you test it";
    status = "draft";
  } else if (source && apiKeyHealthHasError(healthStatus)) {
    text = `${apiKeySourceLabel(source)} key failed validation`;
    status = "error";
  } else if (source === "saved") {
    text = "Saved key available";
    status = "saved";
  } else if (source === "env") {
    text = "Environment key available";
    status = "env";
  }

  statusNode.textContent = text;
  statusNode.dataset.status = status;
}

function syncApiKeyControls({
  input,
  deleteButton,
  source,
  healthStatus = "missing",
  placeholders,
  deleteLabel,
  pendingValue = "",
  pendingValidated = false
}) {
  if (pendingValue) {
    input.placeholder = pendingValidated
      ? "Verified key hidden until you save settings."
      : "Pending key hidden. Test it before saving.";
    deleteButton.disabled = false;
    deleteButton.textContent = "Clear Pending Key";
    deleteButton.title = pendingValidated
      ? "Discard the verified key before saving settings"
      : "Discard the pending key before saving settings";
    return;
  }

  if (source === "saved") {
    input.placeholder = apiKeyHealthHasError(healthStatus)
      ? "Saved key failed validation. Enter a new key to replace it."
      : placeholders.saved;
  } else if (source === "env") {
    input.placeholder = apiKeyHealthHasError(healthStatus)
      ? "Loaded from .env, but the key failed validation. Enter a new key to override it."
      : placeholders.env;
  } else {
    input.placeholder = placeholders.empty;
  }

  deleteButton.textContent = "Delete Saved Key";
  deleteButton.disabled = source !== "saved";
  deleteButton.title = source === "saved" ? deleteLabel : "Only saved dashboard keys can be deleted here";
}

function setExplorerKeyStatus(message = null) {
  setApiKeyStatus({
    input: explorerApiKeyInput,
    statusNode: explorerConfigStatus,
    source: state.settings.explorerApiKeySource,
    healthStatus: state.settings.explorerApiKeyHealthStatus,
    message,
    pendingValue: getApiKeyDraft("explorer").value,
    pendingValidated: isApiKeyDraftValidated("explorer")
  });
}

function syncExplorerKeyControls() {
  syncApiKeyControls({
    input: explorerApiKeyInput,
    deleteButton: deleteExplorerKeyButton,
    source: state.settings.explorerApiKeySource,
    healthStatus: state.settings.explorerApiKeyHealthStatus,
    placeholders: {
      saved: "Saved on server. Enter a new key to replace it.",
      env: "Loaded from .env. Enter a new key to override it.",
      empty: "Etherscan V2 API key"
    },
    deleteLabel: "Delete the saved explorer API key",
    pendingValue: getApiKeyDraft("explorer").value,
    pendingValidated: isApiKeyDraftValidated("explorer")
  });
}

function setOpenaiKeyStatus(message = null) {
  setApiKeyStatus({
    input: openaiApiKeyInput,
    statusNode: openaiConfigStatus,
    source: state.settings.openaiApiKeySource,
    healthStatus: state.settings.openaiApiKeyHealthStatus,
    message,
    pendingValue: getApiKeyDraft("openai").value,
    pendingValidated: isApiKeyDraftValidated("openai")
  });
}

function syncOpenaiKeyControls() {
  syncApiKeyControls({
    input: openaiApiKeyInput,
    deleteButton: deleteOpenaiKeyButton,
    source: state.settings.openaiApiKeySource,
    healthStatus: state.settings.openaiApiKeyHealthStatus,
    placeholders: {
      saved: "Saved on server. Enter a new key to replace it.",
      env: "Loaded from .env. Enter a new key to override it.",
      empty: "OpenAI API key"
    },
    deleteLabel: "Delete the saved OpenAI API key",
    pendingValue: getApiKeyDraft("openai").value,
    pendingValidated: isApiKeyDraftValidated("openai")
  });
}

function setAlchemyKeyStatus(message = null) {
  setApiKeyStatus({
    input: alchemyApiKeyInput,
    statusNode: alchemyConfigStatus,
    source: state.settings.alchemyApiKeySource,
    healthStatus: state.settings.alchemyApiKeyHealthStatus,
    message,
    pendingValue: getApiKeyDraft("alchemy").value,
    pendingValidated: isApiKeyDraftValidated("alchemy")
  });
}

function syncAlchemyKeyControls() {
  syncApiKeyControls({
    input: alchemyApiKeyInput,
    deleteButton: deleteAlchemyKeyButton,
    source: state.settings.alchemyApiKeySource,
    healthStatus: state.settings.alchemyApiKeyHealthStatus,
    placeholders: {
      saved: "Saved on server. Enter a new key to replace it.",
      env: "Loaded from .env. Enter a new key to override it.",
      empty: "Alchemy API key"
    },
    deleteLabel: "Delete the saved Alchemy API key",
    pendingValue: getApiKeyDraft("alchemy").value,
    pendingValidated: isApiKeyDraftValidated("alchemy")
  });
}

function setDrpcKeyStatus(message = null) {
  setApiKeyStatus({
    input: drpcApiKeyInput,
    statusNode: drpcConfigStatus,
    source: state.settings.drpcApiKeySource,
    healthStatus: state.settings.drpcApiKeyHealthStatus,
    message,
    pendingValue: getApiKeyDraft("drpc").value,
    pendingValidated: isApiKeyDraftValidated("drpc")
  });
}

function syncDrpcKeyControls() {
  syncApiKeyControls({
    input: drpcApiKeyInput,
    deleteButton: deleteDrpcKeyButton,
    source: state.settings.drpcApiKeySource,
    healthStatus: state.settings.drpcApiKeyHealthStatus,
    placeholders: {
      saved: "Saved on server. Enter a new key to replace it.",
      env: "Loaded from .env. Enter a new key to override it.",
      empty: "dRPC API key"
    },
    deleteLabel: "Delete the saved dRPC API key",
    pendingValue: getApiKeyDraft("drpc").value,
    pendingValidated: isApiKeyDraftValidated("drpc")
  });
}

function setOpenseaKeyStatus(message = null) {
  setApiKeyStatus({
    input: openseaApiKeyInput,
    statusNode: openseaConfigStatus,
    source: state.settings.openseaApiKeySource,
    healthStatus: state.settings.openseaApiKeyHealthStatus,
    message,
    pendingValue: getApiKeyDraft("opensea").value,
    pendingValidated: isApiKeyDraftValidated("opensea")
  });
}

function syncOpenseaKeyControls() {
  syncApiKeyControls({
    input: openseaApiKeyInput,
    deleteButton: deleteOpenseaKeyButton,
    source: state.settings.openseaApiKeySource,
    healthStatus: state.settings.openseaApiKeyHealthStatus,
    placeholders: {
      saved: "Saved on server. Enter a new key to replace it.",
      env: "Loaded from .env. Enter a new key to override it.",
      empty: "OpenSea API key"
    },
    deleteLabel: "Delete the saved OpenSea API key",
    pendingValue: getApiKeyDraft("opensea").value,
    pendingValidated: isApiKeyDraftValidated("opensea")
  });
}

function collectApiKeySaveEntries() {
  return [
    {
      draftKey: "explorer",
      label: "Explorer",
      payloadField: "explorerApiKey",
      value: getApiKeyCandidate("explorer", explorerApiKeyInput)
    },
    {
      draftKey: "openai",
      label: "OpenAI",
      payloadField: "openaiApiKey",
      value: getApiKeyCandidate("openai", openaiApiKeyInput)
    },
    {
      draftKey: "alchemy",
      label: "Alchemy",
      payloadField: "alchemyApiKey",
      value: getApiKeyCandidate("alchemy", alchemyApiKeyInput)
    },
    {
      draftKey: "drpc",
      label: "dRPC",
      payloadField: "drpcApiKey",
      value: getApiKeyCandidate("drpc", drpcApiKeyInput)
    },
    {
      draftKey: "opensea",
      label: "OpenSea",
      payloadField: "openseaApiKey",
      value: getApiKeyCandidate("opensea", openseaApiKeyInput)
    }
  ]
    .filter((entry) => entry.value)
    .map((entry) => ({
      ...entry,
      validated: isApiKeyDraftValidated(entry.draftKey)
    }));
}

async function runApiKeyTest({
  draftKey,
  label,
  input,
  button,
  progress,
  payloadField,
  endpoint,
  configured,
  statusSetter,
  syncControls,
  requiredTitle,
  requiredMessage
}, options = {}) {
  const { summaryMode = false } = options;
  const buttonLabel = button.textContent;
  const apiKeyValue = getApiKeyCandidate(draftKey, input);
  const usingDraft = Boolean(apiKeyValue);

  if (!apiKeyValue && !configured()) {
    statusSetter("No key to test");
    syncControls();
    if (!summaryMode) {
      showToast(requiredMessage, "info", requiredTitle);
    }
    return { tested: false, skipped: true, success: false };
  }

  button.disabled = true;
  button.textContent = "Testing...";
  const progressIndicator = startOperationProgress(progress, {
    steps: [
      `Checking ${label} key format...`,
      `Connecting to ${label} validation endpoint...`,
      `Confirming ${label} response...`
    ],
    successLabel: `${label} key verified.`,
    errorLabel: `${label} key test failed.`
  });

  if (usingDraft) {
    input.value = "";
    syncControls();
    statusSetter();
  }

  try {
    const payload = await request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [payloadField]: apiKeyValue
      }),
      quiet: summaryMode
    });

    if (payload.settings) {
      state.settings = payload.settings;
    }

    if (usingDraft) {
      stageApiKeyDraft(draftKey, apiKeyValue, { validated: true });
    }

    syncControls();
    statusSetter(
      usingDraft
        ? null
        : payload.source === "env"
          ? "Environment key verified"
          : "Saved key verified"
    );

    if (!summaryMode) {
      showToast(
        usingDraft
          ? `${label} API key is valid. The field was cleared for safety, and the key is staged until you save settings.`
          : payload.source === "env"
            ? `Environment ${label} API key is valid. Save a new key if you want to override it in the dashboard.`
            : `Saved ${label} API key is valid.`,
        "success",
        `${label} Key Valid`
      );
    }

    progressIndicator.complete(`${label} key verified.`);
    return { tested: true, skipped: false, success: true };
  } catch {
    if (usingDraft) {
      clearApiKeyDraft(draftKey);
      input.value = "";
    } else {
      await loadState().catch(() => {});
    }

    syncControls();
    statusSetter(usingDraft ? "Key test failed. Enter it again" : "Key test failed");
    progressIndicator.fail(`${label} key test failed.`);
    return { tested: true, skipped: false, success: false };
  } finally {
    button.disabled = false;
    button.textContent = buttonLabel;
  }
}

function clearPendingApiKeyUi({ draftKey, input, label, syncControls, statusSetter }) {
  if (!window.confirm(`Discard the pending ${label} API key?`)) {
    return;
  }

  clearApiKeyDraft(draftKey);
  input.value = "";
  syncControls();
  statusSetter();
  showToast(`Pending ${label} API key cleared.`, "info", "Pending Key Cleared");
}

function resetOperationProgress(progressRefs, options = {}) {
  if (!progressRefs?.container) {
    return;
  }

  const { hide = false, label = "" } = options;
  const activeState = operationProgressState.get(progressRefs.container);
  if (activeState) {
    window.clearInterval(activeState.intervalId);
    window.clearTimeout(activeState.hideTimer);
    operationProgressState.delete(progressRefs.container);
  }

  progressRefs.container.dataset.state = "idle";
  if (progressRefs.bar) {
    progressRefs.bar.style.width = "0%";
  }
  if (progressRefs.value) {
    progressRefs.value.textContent = "0%";
  }
  if (progressRefs.label && label) {
    progressRefs.label.textContent = label;
  }
  progressRefs.container.classList.toggle("hidden", hide);
}

function startOperationProgress(progressRefs, options = {}) {
  if (!progressRefs?.container) {
    return {
      complete() {},
      fail() {},
      stop() {}
    };
  }

  const steps = Array.isArray(options.steps) && options.steps.length
    ? options.steps
    : ["Working...", "Processing request...", "Finalizing..."];
  const baseLabel = steps[0];
  let percent = Math.max(10, Math.min(28, Number(options.initialPercent || 14)));
  let stepIndex = 0;
  let finished = false;

  const render = () => {
    progressRefs.container.classList.remove("hidden");
    progressRefs.container.dataset.state = finished ? progressRefs.container.dataset.state : "running";
    if (progressRefs.label) {
      progressRefs.label.textContent = steps[Math.min(stepIndex, steps.length - 1)] || baseLabel;
    }
    if (progressRefs.value) {
      progressRefs.value.textContent = `${Math.round(percent)}%`;
    }
    if (progressRefs.bar) {
      progressRefs.bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
  };

  resetOperationProgress(progressRefs, { hide: false, label: baseLabel });
  render();

  const intervalId = window.setInterval(() => {
    if (finished) {
      return;
    }

    const increment =
      percent < 42 ? 11
      : percent < 68 ? 7
      : percent < 84 ? 4
      : 2;
    percent = Math.min(92, percent + increment);

    if (steps.length > 1) {
      const nextStepIndex = Math.min(
        steps.length - 1,
        Math.floor((percent / 92) * steps.length)
      );
      stepIndex = Math.max(stepIndex, nextStepIndex);
    }

    render();
  }, Number(options.intervalMs || 320));

  operationProgressState.set(progressRefs.container, {
    intervalId,
    hideTimer: 0
  });

  const finish = (state, label) => {
    const activeState = operationProgressState.get(progressRefs.container);
    if (activeState) {
      window.clearInterval(activeState.intervalId);
      window.clearTimeout(activeState.hideTimer);
    }

    finished = true;
    percent = 100;
    progressRefs.container.dataset.state = state;
    if (progressRefs.label) {
      progressRefs.label.textContent = label;
    }
    if (progressRefs.value) {
      progressRefs.value.textContent = "100%";
    }
    if (progressRefs.bar) {
      progressRefs.bar.style.width = "100%";
    }

    const hideAfterMs =
      state === "error"
        ? Number(options.errorHideAfterMs || 2400)
        : Number(options.successHideAfterMs || 1700);

    const hideTimer = window.setTimeout(() => {
      resetOperationProgress(progressRefs, { hide: true, label: baseLabel });
    }, hideAfterMs);

    operationProgressState.set(progressRefs.container, {
      intervalId: 0,
      hideTimer
    });
  };

  return {
    update(nextPercent, label = "", options = {}) {
      if (finished) {
        return;
      }

      if (Number.isFinite(Number(nextPercent))) {
        percent = Math.max(percent, Math.min(99, Number(nextPercent)));
      }
      if (label && progressRefs.label) {
        progressRefs.label.textContent = label;
      }
      if (options.state) {
        progressRefs.container.dataset.state = options.state;
      }
      render();
    },
    complete(label = options.successLabel || "Done.") {
      finish("success", label);
    },
    fail(label = options.errorLabel || "Request failed.") {
      finish("error", label);
    },
    stop() {
      resetOperationProgress(progressRefs, { hide: true, label: baseLabel });
    }
  };
}

function withButtonBusyState(button, busyLabel, work) {
  if (!button) {
    return Promise.resolve().then(work);
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;

  return Promise.resolve()
    .then(work)
    .finally(() => {
      button.disabled = false;
      button.textContent = originalLabel;
    });
}

function rpcImportProviderLabel(providerKey = "") {
  return providerKey === "alchemy"
    ? "Alchemy"
    : providerKey === "drpc"
      ? "dRPC"
      : "Chainlist";
}

function renderSettings() {
  syncExplorerKeyControls();
  setExplorerKeyStatus();
  syncOpenaiKeyControls();
  setOpenaiKeyStatus();
  syncAlchemyKeyControls();
  setAlchemyKeyStatus();
  syncDrpcKeyControls();
  setDrpcKeyStatus();
  syncOpenseaKeyControls();
  setOpenseaKeyStatus();
}

function renderRuntime() {
  if (!runtimeOutput) {
    return;
  }

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
  if (!resultsOutput) {
    return;
  }

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
  const activeAlerts = buildSystemAlerts(telemetry);
  const active = activeTask();
  const activeTaskCount = activeTaskIds().length;
  const hasActionableAlert = activeAlerts.some((alert) => ["critical", "warning"].includes(alert.severity));
  const activeRuntime = active ? taskRuntimeNarrative(active, "running") : null;

  body.dataset.runState = state.runState.status;
  if (accountLabel) {
    accountLabel.textContent = state.settings.profileName || "Local Operator";
  }
  if (accountStatus) {
    accountStatus.textContent =
      state.runState.status === "running"
        ? activeTaskCount > 1
          ? `${activeTaskCount} live lanes`
          : activeRuntime?.sidebarLabel || "Live run"
        : (state.runState.queuedTaskIds || []).length > 0
          ? "Launch lane armed"
          : "Operator mode";
  }
  const heroMessage = active
    ? activeTaskCount > 1
      ? `${pluralize(activeTaskCount, "task")} are live in the control plane. Primary lane ${active.name} on ${chainLabel(active.chainKey)} is ${activeRuntime?.phaseLabel?.toLowerCase() || "executing"} at ${active.progress?.percent || 0}% completion.`
      : `${active.name} // ${activeRuntime?.phaseLabel || "Live execution"}. ${activeRuntime?.detail || ""}`
    : (state.runState.queuedTaskIds || []).length > 0
      ? `${pluralize((state.runState.queuedTaskIds || []).length, "task")} have a launch lane armed inside the control plane.`
      : "";
  heroModeCopy.textContent = heroMessage;
  heroModeCopy.classList.toggle("hidden", !heroMessage);

  if (hasActionableAlert) {
    sidebarModeLabel.textContent = "Needs Attention";
    sidebarModeDot.className = "signal-dot alert";
  } else if (state.runState.status === "running") {
    sidebarModeLabel.textContent = activeTaskCount > 1 ? "Live Runs" : activeRuntime?.sidebarLabel || "Live Run";
    sidebarModeDot.className = "signal-dot hot";
  } else if ((state.runState.queuedTaskIds || []).length > 0) {
    sidebarModeLabel.textContent = "Lane Armed";
    sidebarModeDot.className = "signal-dot hot";
  } else {
    sidebarModeLabel.textContent = "Activated";
    sidebarModeDot.className = "signal-dot";
  }
}

function renderAll() {
  renderShellTelemetry();
  renderLogs();
  renderDashboard();
  renderTasks();
  renderMintRadar();
  renderWallets();
  renderWalletAssets();
  renderRpcNodes();
  renderSettings();
  renderRuntime();
  renderResultsIfAvailable();
  renderAssistant();
  initializeMotionSurfaces(document);
}

function applyAppState(payload, options = {}) {
  const { notifyRpcTransitions = true } = options;
  const previousRpcNodes = state.rpcNodes || [];
  state.tasks = payload.tasks || [];
  state.wallets = mergeWalletBalanceState(payload.wallets || []);
  state.rpcNodes = payload.rpcNodes || [];
  state.settings = payload.settings || {};
  state.chains = payload.chains || [];
  state.mintSources = payload.mintSources || [];
  state.telemetry = payload.telemetry || null;
  state.runState = payload.runState || state.runState;
  state.session.authRequired = payload.authRequired !== false;
  hydrateWalletAssetSnapshotsForCurrentState();
  populateMintSourceSelectors(taskSourceTypeInput?.value || "generic_contract");

  if (notifyRpcTransitions) {
    notifyRpcHealthTransitions(previousRpcNodes, state.rpcNodes);
  }

  renderAll();
  scheduleWalletAssetAutoSync({ immediate: true });
  scheduleRpcHealthAutoPulse({ immediate: true });
  scheduleMintRadarAutoSync({ immediate: state.currentView === "mint-radar" });
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
  body.dataset.currentView = viewName;
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  views.forEach((view) => {
    view.classList.toggle("active", view.dataset.viewPanel === viewName);
  });
  dashboardOpenTaskButton.classList.toggle("hidden", viewName !== "dashboard");
  if (viewName === "wallets") {
    renderWallets();
    renderWalletAssets();
    scheduleWalletAssetAutoSync({ immediate: true });
  }
  if (viewName === "mint-radar") {
    renderMintRadar();
    ensureMintRadarLoaded();
    scheduleMintRadarAutoSync({ immediate: true });
  }
  if (viewName === "assistant" && assistantAvailability().ready) {
    window.setTimeout(() => {
      assistantInput.focus();
    }, 0);
  }
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

function mintSourceDefinitions() {
  return Array.isArray(state.mintSources) && state.mintSources.length > 0
    ? state.mintSources
    : fallbackMintSources;
}

function findMintSourceDefinition(sourceType = "") {
  const normalized = String(sourceType || "generic_contract").trim().toLowerCase();
  return (
    mintSourceDefinitions().find((entry) => String(entry.type || "").trim().toLowerCase() === normalized) ||
    fallbackMintSources[0]
  );
}

function formatMintSourceStage(stage = "auto") {
  const normalized = String(stage || "auto").trim().toLowerCase();
  if (normalized === "gtd") {
    return "GTD";
  }

  if (normalized === "allowlist") {
    return "Allowlist";
  }

  if (normalized === "auto") {
    return "Auto Detect";
  }

  if (normalized === "custom") {
    return "Custom";
  }

  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Auto Detect";
}

function populateMintSourceSelectors(selectedType = "") {
  if (!taskSourceTypeInput) {
    return;
  }

  const preferredType = String(selectedType || taskSourceTypeInput.value || "generic_contract").trim();
  const options = mintSourceDefinitions()
    .map(
      (source) =>
        `<option value="${escapeHtml(source.type || "")}">${escapeHtml(source.label || source.type || "Mint Source")}</option>`
    )
    .join("");

  taskSourceTypeInput.innerHTML = options;
  taskSourceTypeInput.value = findMintSourceDefinition(preferredType).type || "generic_contract";
  updateTaskSourceInputs();
}

function updateTaskSourceInputs() {
  if (!taskSourceTypeInput || !taskSourceTargetInput || !taskSourceConfigInput || !taskSourceHint) {
    return;
  }

  const sourceDefinition = findMintSourceDefinition(taskSourceTypeInput.value);
  const sourceType = sourceDefinition.type || "generic_contract";
  const sourceLabel = sourceDefinition.label || "Mint Source";
  const sourceDescription = String(sourceDefinition.description || "Source-aware mint adapter.").trim();
  const discoverySummary = String(sourceDefinition.discoveryPlan?.summary || "").trim();
  const configExample =
    sourceDefinition.configExample && typeof sourceDefinition.configExample === "object"
      ? sourceDefinition.configExample
      : {};
  const exampleTarget = String(configExample.target || "").trim();
  const stageLabel = formatMintSourceStage(taskSourceStageInput?.value || configExample.stage || "auto");
  const capabilityFlags = [];

  if (sourceDefinition.capabilities?.backendPayload) {
    capabilityFlags.push("backend payload");
  }
  if (sourceDefinition.capabilities?.scheduleSync) {
    capabilityFlags.push("schedule sync");
  }
  if (sourceDefinition.capabilities?.sessionAuth) {
    capabilityFlags.push("session auth");
  }

  taskSourceTargetInput.disabled = false;
  taskSourceTargetInput.placeholder =
    sourceType === "generic_contract"
      ? "Optional OpenSea collection link for auto-discovery"
      : exampleTarget || "Paste an OpenSea collection link or slug";
  taskSourceConfigInput.placeholder = JSON.stringify(configExample, null, 2);

  const targetCopy =
    sourceType === "generic_contract"
      ? "Leave the link empty if you prefer to fill the contract and ABI manually."
      : `Use an OpenSea collection link or slug for ${sourceLabel} auto-discovery.`;
  const capabilityCopy = capabilityFlags.length
    ? `Adapter focus: ${capabilityFlags.join(", ")}.`
    : "Adapter focus: local contract execution only.";
  const discoveryCopy = discoverySummary ? ` ${discoverySummary}` : "";
  const discoveryStatusCopy =
    taskSourceDiscoveryStatus && sourceType !== "generic_contract"
      ? ` Discovery status: ${taskSourceDiscoveryStatus}`
      : "";

  taskSourceHint.textContent = `${sourceDescription} ${targetCopy} Stage: ${stageLabel}. ${capabilityCopy}${discoveryCopy}${discoveryStatusCopy}`;
}

function setTaskSourceDiscoveryStatus(message = "") {
  taskSourceDiscoveryStatus = String(message || "").trim();
  updateTaskSourceInputs();
}

function activeTaskSourceDiscoveryPayload() {
  syncTaskSourceTypeFromTarget();
  return {
    sourceType: String(taskSourceTypeInput?.value || "").trim(),
    sourceTarget: String(taskSourceTargetInput?.value || "").trim(),
    sourceStage: String(taskSourceStageInput?.value || "auto").trim(),
    chainKey: String(taskChainInput?.value || "").trim(),
    walletIds: selectedWalletIds(),
    rpcNodeIds: selectedRpcIds(),
    quantityPerWallet: Math.max(1, Number(taskQuantityInput?.value || 1)),
    mintFunction: String(taskFunctionInput?.value || "").trim()
  };
}

function filterSelectedRpcIdsForChain(chainKey) {
  return selectedRpcIds().filter((rpcId) => {
    const node = state.rpcNodes.find((rpcNode) => rpcNode.id === rpcId);
    return node?.chainKey === chainKey;
  });
}

async function requestTaskSourceDiscovery(options = {}) {
  const {
    force = false,
    quiet = true,
    successToastTitle = "",
    successToastMessage = ""
  } = options;
  const payload = activeTaskSourceDiscoveryPayload();

  if (payload.sourceType !== "opensea") {
    if (force) {
      setTaskSourceDiscoveryStatus("");
    }
    currentTaskSourceDiscovery = null;
    currentTaskMintAutofill = null;
    updateTaskMintSummary();
    return null;
  }

  if (!payload.sourceTarget) {
    setTaskSourceDiscoveryStatus("Waiting for an OpenSea collection URL or slug.");
    currentTaskSourceDiscovery = null;
    currentTaskMintAutofill = null;
    updateTaskMintSummary();
    return null;
  }

  const requestId = ++sourceDiscoveryRequestId;
  setTaskSourceDiscoveryStatus("Discovering collection contract and ABI...");

  try {
    const response = await request("/api/sources/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      quiet
    });

    if (requestId !== sourceDiscoveryRequestId) {
      return null;
    }

    const discovery = response.discovery || null;
    if (!discovery) {
      return null;
    }
    currentTaskSourceDiscovery = discovery;

    if (discovery.chainKey && discovery.chainLabel && Number.isFinite(Number(discovery.chainId))) {
      ensureChainOption({
        key: discovery.chainKey,
        label: discovery.chainLabel,
        chainId: Number(discovery.chainId)
      });
    }

    if (discovery.chainKey) {
      taskChainInput.value = discovery.chainKey;
      renderRpcSelector(filterSelectedRpcIdsForChain(discovery.chainKey));
    }

    if (discovery.contractAddress) {
      taskContractInput.value = discovery.contractAddress;
    }

    const lookupKey = buildTaskAbiLookupKey(
      discovery.chainKey || taskChainInput.value,
      discovery.contractAddress || taskContractInput.value
    );
    const abiEntries = Array.isArray(response.abi) ? response.abi : [];

    if (
      abiEntries.length === 0 &&
      currentTaskAbiOrigin() === "explorer" &&
      taskAbiInput.dataset.abiLookupKey !== lookupKey
    ) {
      taskAbiInput.value = "";
      setTaskAbiOrigin("", lookupKey);
      setMintStartDetectionState(null);
      setTaskLaunchRecommendation(null);
      setTaskExecutionBlocker("");
      renderPhasePreview([]);
      updateAbiStatus("OpenSea auto-discovery found the contract, but ABI auto-load is not available yet.");
    }

    if (abiEntries.length > 0) {
      taskAbiInput.value = JSON.stringify(abiEntries, null, 2);
      setTaskAbiOrigin("explorer", lookupKey);
    }

    const autofill = response.autofill || discovery.autofill || null;
    if (autofill) {
      currentTaskMintAutofill = autofill;
      applyAutofillRouting(autofill, { sourceLabel: "OpenSea auto-discovery", notify: false });
      setMintStartDetectionState(autofill.mintStartDetection || null);
      renderPhasePreview(autofill.phasePreview || []);
      applyMintAutofill(autofill, {
        includeFunction: true,
        includeArgs: true,
        includeQuantity: true,
        includePrice: true,
        includePlatform: true
      });
      updateAbiStatus(buildAbiStatusSourceLabel("OpenSea auto-discovery", autofill));
    } else if (abiEntries.length > 0) {
      currentTaskMintAutofill = null;
      setTaskLaunchRecommendation(null);
      setTaskExecutionBlocker("");
      applyAbiAutofillFromCurrentInput({
        sourceLabel: "OpenSea auto-discovery",
        includeFunction: true,
        includeArgs: true,
        includeQuantity: true,
        includePrice: true,
        includePlatform: true,
        remote: false
      });
    }

    if (!String(taskNameInput.value || "").trim() && discovery.collection?.name) {
      taskNameInput.value = `${discovery.collection.name} Public Mint`;
    }

    const statusParts = [];
    if (discovery.collection?.name) {
      statusParts.push(`${discovery.collection.name} found`);
    }
    if (discovery.chainLabel) {
      statusParts.push(discovery.chainLabel);
    }
    if (discovery.contractAddress) {
      statusParts.push("contract discovered");
    }
    if (abiEntries.length > 0) {
      statusParts.push("ABI loaded");
    }
    if (Array.isArray(discovery.warnings) && discovery.warnings.length > 0) {
      statusParts.push(discovery.warnings[0]);
    }
    setTaskSourceDiscoveryStatus(statusParts.join(" · "));

    if (successToastTitle && successToastMessage) {
      showToast(successToastMessage, "success", successToastTitle);
    }

    updateTaskMintSummary();

    return response;
  } catch (error) {
    if (requestId === sourceDiscoveryRequestId) {
      setTaskSourceDiscoveryStatus(`Discovery unavailable: ${error.message || "request failed"}`);
    }
    updateTaskMintSummary();
    return null;
  }
}

function scheduleTaskSourceDiscovery(options = {}) {
  window.clearTimeout(sourceDiscoveryTimer);
  sourceDiscoveryTimer = window.setTimeout(() => {
    requestTaskSourceDiscovery(options).catch(() => {});
  }, 450);
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
  syncTaskSimpleLaunchFields();
}

function normalizeTaskLaunchRecommendation(value = null) {
  const config = value && typeof value === "object" ? value : null;
  const rawMode = String(config?.mode || "").trim().toLowerCase();
  const mode = ["utc", "live", "onchain", "mempool", "block"].includes(rawMode) ? rawMode : "";
  const waitUntilIso = String(config?.waitUntilIso || "").trim();
  const reason = String(config?.reason || "").trim();

  return {
    mode,
    waitUntilIso,
    reason
  };
}

function setTaskLaunchRecommendation(value = null) {
  currentTaskLaunchRecommendation = normalizeTaskLaunchRecommendation(value);
  syncTaskSimpleLaunchFields();
}

function setTaskExecutionBlocker(value = "") {
  currentTaskExecutionBlocker = String(value || "").trim();
  syncTaskSimpleLaunchFields();
  updateTaskMintSummary();
}

function applyRecommendedLaunchPlan(options = {}) {
  const { force = false, silent = true } = options;
  const recommendation = currentTaskLaunchRecommendation;
  if (!taskSimpleLaunchModeInput || !recommendation.mode) {
    return false;
  }

  const currentMode = normalizeTaskQuickLaunchSignal(taskSimpleLaunchModeInput.value);
  if (!force && currentMode !== "onchain") {
    return false;
  }

  if (recommendation.mode === "utc" && recommendation.waitUntilIso) {
    const utcValue = isoStringToUtcDateTimeLocalValue(recommendation.waitUntilIso);
    if (!utcValue) {
      return false;
    }

    taskSimpleLaunchModeInput.value = "utc";
    taskSimpleStartTimeInput.value = utcValue;
    applyTaskSimpleLaunchToAdvanced();
    syncTaskSimpleLaunchFromAdvanced();
    if (!silent) {
      showToast(
        "A launch time was detected from contract metadata, so the task was switched to UTC Schedule automatically.",
        "info",
        "Launch Mode Updated"
      );
    }
    return true;
  }

  if (recommendation.mode === "live") {
    taskSimpleLaunchModeInput.value = "live";
    taskSimpleStartTimeInput.value = "";
    applyTaskSimpleLaunchToAdvanced();
    syncTaskSimpleLaunchFromAdvanced();
    if (!silent) {
      showToast(
        "This mint appears live, so the task was switched to Run ASAP automatically.",
        "info",
        "Launch Mode Updated"
      );
    }
    return true;
  }

  return false;
}

function applyAutofillRouting(autofill, options = {}) {
  if (!autofill || typeof autofill !== "object") {
    currentTaskMintAutofill = null;
    setTaskLaunchRecommendation(null);
    setTaskExecutionBlocker("");
    updateTaskMintSummary();
    return false;
  }

  const { sourceLabel = "", notify = !isTaskModalOpen() } = options;
  currentTaskMintAutofill = autofill;
  let routeChanged = false;
  const nextContractAddress = String(autofill.contractAddressOverride || "").trim();
  const nextAbiEntries = Array.isArray(autofill.abiOverride) ? autofill.abiOverride : null;

  if (nextContractAddress && nextContractAddress !== String(taskContractInput.value || "").trim()) {
    taskContractInput.value = nextContractAddress;
    routeChanged = true;
  }

  if (nextAbiEntries && nextAbiEntries.length > 0) {
    const nextAbiJson = JSON.stringify(nextAbiEntries, null, 2);
    if (nextAbiJson !== String(taskAbiInput.value || "")) {
      taskAbiInput.value = nextAbiJson;
      setTaskAbiOrigin(
        "autofill",
        buildTaskAbiLookupKey(taskChainInput.value, nextContractAddress || taskContractInput.value.trim())
      );
      routeChanged = true;
    }
  }

  setTaskLaunchRecommendation(autofill.launchRecommendation || null);
  setTaskExecutionBlocker(autofill.executionBlocker || "");
  if (applyRecommendedLaunchPlan({ silent: true })) {
    routeChanged = true;
  }

  if (routeChanged && sourceLabel && notify) {
    showToast(
      `${sourceLabel} switched this task to the correct mint contract and launch mode automatically.`,
      "info",
      "Mint Route Updated",
      {
        hideAfterMs: 2200,
        suppressWhenTaskModalOpen: true
      }
    );
  }

  updateTaskMintSummary();
  return routeChanged;
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

  if (normalizedName === "mintseadrop") {
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
  const hasSeaDropTokenPattern =
    Boolean(findAbiFunctionEntry(abiEntries, "mintSeaDrop")) &&
    Boolean(findAbiFunctionEntry(abiEntries, "updatePublicDrop"));
  const hasSeaDropMintPattern =
    Boolean(findAbiFunctionEntry(abiEntries, "mintPublic")) &&
    Boolean(findAbiFunctionEntry(abiEntries, "getPublicDrop"));
  if (hasSeaDropTokenPattern || hasSeaDropMintPattern) {
    return "OpenSea SeaDrop";
  }

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

  updateTaskMintSummary();
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
  if (autofill?.routeLabel) {
    parts.push(autofill.routeLabel);
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

    applyAutofillRouting(autofill, { sourceLabel: "Contract autofill" });
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
    setTaskLaunchRecommendation(null);
    setTaskExecutionBlocker("");
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
    applyAutofillRouting(payload.autofill || null, { sourceLabel: payload.provider || "Explorer" });
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

    if (!Array.isArray(payload.autofill?.abiOverride) || payload.autofill.abiOverride.length === 0) {
      requestRemoteMintAutofill(payload.abi || [], {
        sourceLabel: `${payload.provider || "Explorer"} wallet preview`,
        includeFunction: false,
        includeArgs: false,
        includeQuantity: false,
        includePrice: false,
        includePlatform: false
      }).catch(() => {});
    }
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
  window.clearTimeout(sourceDiscoveryTimer);
  sourceDiscoveryRequestId += 1;
  taskSourceDiscoveryStatus = "";
  currentTaskSourceDiscovery = null;
  currentTaskMintAutofill = null;

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
  populateMintSourceSelectors(task?.sourceTarget ? task?.sourceType || "opensea" : task?.sourceType || "opensea");
  taskSourceTypeInput.value = task?.sourceTarget ? task?.sourceType || "opensea" : task?.sourceType || "opensea";
  taskSourceTargetInput.value = task?.sourceTarget || "";
  taskSourceStageInput.value = "public";
  taskSourceConfigInput.value = task?.sourceConfigJson || "";
  syncTaskSourceTypeFromTarget();
  updateTaskSourceInputs();
  taskFunctionInput.value = task?.mintFunction || "";
  taskArgsInput.value = task?.mintArgs || "";
  taskAutoArmToggle.checked = task?.autoArm ?? true;
  taskScheduleToggle.checked = Boolean(task?.useSchedule);
  taskStartTimeInput.value = task?.waitUntilIso ? isoStringToUtcDateTimeLocalValue(task.waitUntilIso) : "";
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
  taskLatencyProfileInput.value = task ? "custom" : recommendedTaskLatencyProfile("public", "onchain");
  enforcePublicMintTaskDefaults();
  setMintStartDetectionState({
    enabled: task?.mintStartDetectionEnabled,
    ...(task?.mintStartDetectionConfig && typeof task.mintStartDetectionConfig === "object"
      ? task.mintStartDetectionConfig
      : {})
  });
  setTaskLaunchRecommendation(
    task?.useSchedule && task?.waitUntilIso
      ? {
          mode: "utc",
          waitUntilIso: task.waitUntilIso,
          reason: "Saved task schedule"
        }
      : null
  );
  setTaskExecutionBlocker("");
  if (taskQuickDropTypeInput) {
    taskQuickDropTypeInput.value = "public";
  }
  if (taskSimpleLaunchModeInput) {
    taskSimpleLaunchModeInput.value = task ? taskQuickLaunchSignalFromTask(task) : "onchain";
  }
  if (taskSimpleStartTimeInput) {
    taskSimpleStartTimeInput.value = task?.waitUntilIso ? isoStringToUtcDateTimeLocalValue(task.waitUntilIso) : "";
  }
  if (taskSimpleTargetBlockInput) {
    taskSimpleTargetBlockInput.value = task?.triggerBlockNumber || "";
  }
  if (taskSimpleMempoolInput) {
    taskSimpleMempoolInput.value = task?.triggerMempoolSignature || "";
  }
  taskAbiFileInput.value = "";
  setTaskAbiOrigin(
    task?.abiJson ? "manual" : "",
    task?.contractAddress ? buildTaskAbiLookupKey(task?.chainKey, task?.contractAddress) : ""
  );
  fetchAbiButton.disabled = false;
  fetchAbiButton.textContent = "Fetch from Explorer";
  renderPhasePreview([]);

  if (!task) {
    enforcePublicMintTaskDefaults();
    applyTaskSimpleLaunchToAdvanced({ applyProfile: true });
    if (state.settings.explorerApiKeyConfigured && isLikelyEvmAddress(taskContractInput.value)) {
      scheduleExplorerAbiFetch({ force: true });
    }
  }

  setTaskAdvancedVisibility(Boolean(task));
  if (task) {
    syncTaskSimpleLaunchFromAdvanced();
  } else {
    syncTaskSimpleLaunchFields();
  }
  updateAbiStatus();
  renderWalletSelector(task?.walletIds || (!task && state.wallets.length === 1 ? [state.wallets[0].id] : []));
  renderRpcSelector(task?.rpcNodeIds || []);
  updateTaskMintSummary();
  taskModal.classList.remove("hidden");
  document.body.classList.add("task-modal-open");
  initializeMotionSurfaces(taskModal);

  if ((task?.sourceType || taskSourceTypeInput.value) === "opensea" && String(taskSourceTargetInput.value || "").trim()) {
    scheduleTaskSourceDiscovery({ force: true, quiet: true });
  } else {
    updateTaskSourceInputs();
  }
}

function closeTaskModal() {
  taskModal.classList.add("hidden");
  document.body.classList.remove("task-modal-open");
}

function setTaskAdvancedVisibility(visible) {
  taskAdvancedVisible = Boolean(visible);
  taskAdvancedSections.forEach((section) => {
    section.classList.toggle("hidden", !taskAdvancedVisible);
  });

  if (taskAdvancedToggleButton) {
    taskAdvancedToggleButton.textContent = taskAdvancedVisible ? "Hide Advanced Settings" : "Show Advanced Settings";
    taskAdvancedToggleButton.setAttribute("aria-expanded", taskAdvancedVisible ? "true" : "false");
  }
}

function syncTaskSimpleLaunchFields() {
  const dropType = normalizeTaskQuickDropType(taskQuickDropTypeInput?.value);
  const mode = normalizeTaskQuickLaunchSignal(taskSimpleLaunchModeInput?.value);
  const profile = recommendedTaskLatencyProfile(dropType, mode);
  const profileLabel = profile === "ultra_low_latency" ? "Ultra Low Latency" : "Low Latency";
  const hasOnChainGate = currentMintStartDetection.enabled || Boolean(String(taskReadyFunctionInput?.value || "").trim());
  const chips = [
    taskQuickDropTypeLabel(dropType),
    formatMintSourceStage(taskQuickSourceStage(dropType)),
    taskQuickLaunchSignalLabel(mode),
    profileLabel,
    "Pre-Sign",
    "Warmup RPC",
    "Multi-RPC",
    "Smart Replace"
  ];

  if (mode === "onchain" && hasOnChainGate) {
    chips.push(currentMintStartDetection.enabled ? "ABI Mint-Open Detection" : "Ready Check Gate");
  }
  if (mode === "mempool") {
    chips.push("WS RPC Required");
  }
  if (mode === "block") {
    chips.push("Manual Block Intel");
  }

  taskSimpleStartTimeField?.classList.toggle("hidden", mode !== "utc");
  taskSimpleTargetBlockField?.classList.toggle("hidden", mode !== "block");
  taskSimpleMempoolField?.classList.toggle("hidden", mode !== "mempool");

  if (taskSimpleLaunchHint) {
    taskSimpleLaunchHint.textContent =
      currentTaskExecutionBlocker
        ? currentTaskExecutionBlocker
        : mode === "utc"
        ? "Enter the launch time in UTC. MintBot saves it in UTC and still waits on mint-open reads when the ABI exposes them."
        : mode === "block"
          ? "Only use Exact Block when the project gave a real block number or you derived one from trusted block intel. UTC times do not map to fixed blocks."
          : mode === "mempool"
            ? "Best when you know the admin opener transaction. Enter the function name or selector so the task fires as soon as that tx hits mempool."
          : mode === "live"
              ? "Use this only when the mint is already live right now and you want MintBot to fire through the fast path immediately."
              : hasOnChainGate
                ? "On-chain gating is ready. MintBot will pre-arm the task and wait for the sale-open signal before broadcasting."
                : currentTaskLaunchRecommendation.mode === "utc" && currentTaskLaunchRecommendation.waitUntilIso
                  ? "Contract metadata exposed a launch time, so MintBot can switch this task to UTC Schedule automatically."
                  : currentTaskLaunchRecommendation.mode === "live"
                    ? "Contract metadata suggests the mint is already live, so MintBot can switch this task to Run ASAP automatically."
                : "Load the ABI first so MintBot can detect a sale-open read automatically, or switch to UTC Time if the project only shares a clock time.";
  }

  if (taskQuickStackSummary) {
    const summary =
      mode === "utc"
        ? "MintBot will schedule the task in UTC, pre-arm the launch path, warm the RPC mesh, and broadcast through the fast route when the time lands."
        : mode === "block"
          ? "MintBot will wait for the target block, then fire with the aggressive launch path. Use this only when you already know the exact mint block."
          : mode === "mempool"
            ? "MintBot will watch pending transactions, look for the opener call, and launch as soon as that mempool signal appears."
            : mode === "live"
              ? "MintBot will arm the task for immediate broadcast with aggressive routing, multi-RPC fanout, and gas replacement."
              : "MintBot will keep the task armed and wait for the contract-side sale-open signal before pushing the mint transaction.";

    taskQuickStackSummary.innerHTML = `
      <div class="task-strategy-chip-row">
        ${chips.map((chip) => `<span class="task-strategy-chip">${escapeHtml(chip)}</span>`).join("")}
      </div>
      <p class="helper-copy">${escapeHtml(summary)}</p>
    `;
  }

  if (taskQuickProofHint) {
    let proofHint = "";
    if (dropType === "allowlist") {
      proofHint =
        "If this allowlist mint needs a proof, signature, voucher, or backend payload, open Advanced Settings and fill Claims and Adapter before saving.";
    } else if (dropType === "pass_fcfs") {
      proofHint =
        "If the FCFS pass only checks wallet ownership on-chain, no extra claim payload is needed. If the site returns signed mint args or proofs, add them in Advanced Settings.";
    } else if (dropType === "gtd") {
      proofHint =
        "If GTD eligibility is holder or pass based, the selected wallet is usually enough. If the project serves signed payloads, add them in Advanced Settings.";
    }

    taskQuickProofHint.textContent = proofHint;
    taskQuickProofHint.classList.toggle("hidden", !proofHint);
  }
}

function syncTaskSimpleLaunchFromAdvanced() {
  if (!taskSimpleLaunchModeInput) {
    return;
  }

  let mode = "live";
  if (taskTriggerModeInput.value === "block") {
    mode = "block";
  } else if (taskTriggerModeInput.value === "mempool") {
    mode = "mempool";
  } else if (taskScheduleToggle.checked) {
    mode = "utc";
  } else if (taskReadyFunctionInput.value.trim() || currentMintStartDetection.enabled) {
    mode = "onchain";
  }

  taskSimpleLaunchModeInput.value = mode;
  taskSimpleStartTimeInput.value = taskStartTimeInput.value || "";
  taskSimpleTargetBlockInput.value = taskTriggerBlockInput.value || "";
  taskSimpleMempoolInput.value = taskTriggerMempoolSignatureInput.value || "";
  syncTaskSimpleLaunchFields();
}

function applyTaskSimpleLaunchToAdvanced(options = {}) {
  if (!taskSimpleLaunchModeInput) {
    return;
  }

  const { applyProfile = false } = options;
  const dropType = normalizeTaskQuickDropType(taskQuickDropTypeInput?.value);
  const mode = normalizeTaskQuickLaunchSignal(taskSimpleLaunchModeInput.value);
  const recommendedProfile = recommendedTaskLatencyProfile(dropType, mode);

  taskSourceStageInput.value = taskQuickSourceStage(dropType);
  updateTaskSourceInputs();

  if (applyProfile) {
    taskAutoArmToggle.checked = true;
    taskLatencyProfileInput.value = recommendedProfile;
    applyLatencyProfile(recommendedProfile);
  }

  taskScheduleToggle.checked = mode === "utc";
  taskStartTimeInput.value = mode === "utc" ? String(taskSimpleStartTimeInput.value || "").trim() : "";

  if (mode === "block") {
    taskTriggerModeInput.value = "block";
    taskTriggerBlockInput.value = String(taskSimpleTargetBlockInput.value || "").trim();
    taskTriggerMempoolSignatureInput.value = "";
  } else if (mode === "mempool") {
    taskTriggerModeInput.value = "mempool";
    taskTriggerBlockInput.value = "";
    taskTriggerMempoolSignatureInput.value = String(taskSimpleMempoolInput.value || "").trim();
    if (!String(taskTriggerContractInput.value || "").trim() && String(taskContractInput.value || "").trim()) {
      taskTriggerContractInput.value = String(taskContractInput.value || "").trim();
    }
  } else {
    if (["block", "mempool"].includes(taskTriggerModeInput.value)) {
      taskTriggerModeInput.value = "standard";
    }
    taskTriggerBlockInput.value = "";
    taskTriggerMempoolSignatureInput.value = "";
  }

  syncTaskSimpleLaunchFields();
}

function closeTaskDeleteModal() {
  if (!taskDeleteModal || taskDeletePending) {
    return;
  }

  taskDeleteTargetId = "";
  taskDeleteSubmitButton.disabled = false;
  taskDeleteCancelButton.disabled = false;
  taskDeleteCloseButton.disabled = false;
  taskDeleteSubmitButton.textContent = "Yes, Delete";
  taskDeleteModal.classList.add("hidden");
}

function openTaskDeleteModal(taskId) {
  if (!taskDeleteModal) {
    return;
  }

  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return;
  }

  taskDeleteTargetId = task.id;
  taskDeleteName.textContent = task.name || "Untitled Task";
  taskDeleteChain.textContent = chainLabel(task.chainKey) || task.chainKey || "-";
  taskDeleteContract.textContent = task.contractAddress || "-";
  taskDeleteSubmitButton.disabled = false;
  taskDeleteCancelButton.disabled = false;
  taskDeleteCloseButton.disabled = false;
  taskDeleteSubmitButton.textContent = "Yes, Delete";
  taskDeleteModal.classList.remove("hidden");
  initializeMotionSurfaces(taskDeleteModal);
}

async function submitTaskDelete() {
  if (!taskDeleteTargetId || taskDeletePending) {
    return;
  }

  const task = state.tasks.find((entry) => entry.id === taskDeleteTargetId);
  if (!task) {
    closeTaskDeleteModal();
    return;
  }

  taskDeletePending = true;
  taskDeleteSubmitButton.disabled = true;
  taskDeleteCancelButton.disabled = true;
  taskDeleteCloseButton.disabled = true;
  taskDeleteSubmitButton.textContent = "Deleting...";

  try {
    await request(`/api/tasks/${task.id}`, { method: "DELETE" });
    taskDeletePending = false;
    closeTaskDeleteModal();
    showToast(`${task.name || "Task"} deleted.`, "success", "Task Removed");
  } catch {
    taskDeletePending = false;
    taskDeleteSubmitButton.disabled = false;
    taskDeleteCancelButton.disabled = false;
    taskDeleteCloseButton.disabled = false;
    taskDeleteSubmitButton.textContent = "Yes, Delete";
  }
}

function buildClaimTaskSettings() {
  return {
    claimIntegrationEnabled: false,
    claimProjectKey: "",
    walletClaimsJson: "",
    claimFetchEnabled: false,
    claimFetchUrl: "",
    claimFetchMethod: "GET",
    claimFetchHeadersJson: "",
    claimFetchCookiesJson: "",
    claimFetchBodyJson: "",
    claimResponseMappingJson: "",
    claimResponseRoot: ""
  };
}

async function ensureTaskSourceDiscoveryBeforeSave() {
  const sourceTarget = String(taskSourceTargetInput?.value || "").trim();
  if (!sourceTarget) {
    return null;
  }

  syncTaskSourceTypeFromTarget();

  const hasContractAddress = isLikelyEvmAddress(taskContractInput?.value || "");
  const hasAbiJson = Boolean(String(taskAbiInput?.value || "").trim());
  if (hasContractAddress && hasAbiJson) {
    return null;
  }

  const response = await requestTaskSourceDiscovery({
    force: true,
    quiet: false
  });

  const discoveredContractAddress = isLikelyEvmAddress(taskContractInput?.value || "");
  const discoveredAbiJson = Boolean(String(taskAbiInput?.value || "").trim());
  if (!discoveredContractAddress || !discoveredAbiJson) {
    throw new Error(
      "OpenSea auto-discovery could not fill the contract and ABI yet. Check your OpenSea and Explorer API keys, or paste the contract and ABI manually."
    );
  }

  return response;
}

function validateTaskQuickStrategy() {
  const mode = normalizeTaskQuickLaunchSignal(taskSimpleLaunchModeInput?.value);

  if (currentTaskExecutionBlocker) {
    showToast(currentTaskExecutionBlocker, "error", "Mint Blocked");
    return false;
  }

  if (mode === "utc") {
    if (!String(taskSimpleStartTimeInput?.value || "").trim()) {
      showToast("Enter the UTC launch time before saving this task.", "info", "UTC Time Required");
      return false;
    }

    if (!utcDateTimeLocalToIsoString(taskSimpleStartTimeInput.value)) {
      showToast("Enter a valid UTC date and time.", "info", "Invalid UTC Time");
      return false;
    }
  }

  if (mode === "block") {
    const targetBlock = Number(taskSimpleTargetBlockInput?.value || 0);
    if (!Number.isInteger(targetBlock) || targetBlock < 1) {
      showToast("Enter the exact target block before saving this task.", "info", "Block Required");
      return false;
    }
  }

  if (mode === "mempool" && !String(taskSimpleMempoolInput?.value || "").trim()) {
    showToast(
      "Enter the admin opener function or selector before using mempool mode.",
      "info",
      "Mempool Signal Required"
    );
    return false;
  }

  if (mode === "onchain" && !currentMintStartDetection.enabled && !String(taskReadyFunctionInput.value || "").trim()) {
    if (applyRecommendedLaunchPlan({ force: true, silent: false })) {
      return validateTaskQuickStrategy();
    }

    showToast(
      "Load the ABI first so MintBot can detect the sale-open function, or switch to UTC Time / Run ASAP.",
      "info",
      "On-Chain Open Needs ABI"
    );
    return false;
  }

  return true;
}

function buildTaskPayload() {
  applyTaskSimpleLaunchToAdvanced();
  syncTaskSourceTypeFromTarget();
  const sourceTarget = String(taskSourceTargetInput?.value || "").trim();
  const sourceType = sourceTarget ? "opensea" : "generic_contract";
  const triggerMode = String(taskTriggerModeInput.value || "standard").trim().toLowerCase() || "standard";
  const fastSubmitPreferred =
    !taskDryRunToggle.checked &&
    !taskTransferToggle.checked &&
    !taskScheduleToggle.checked &&
    !currentMintStartDetection.enabled &&
    !String(taskReadyFunctionInput.value || "").trim() &&
    triggerMode === "standard";

  return {
    id: taskIdInput.value || undefined,
    name: taskNameInput.value,
    priority: taskPriorityInput.value,
    tags: taskTagsInput.value,
    notes: taskNotesInput.value,
    contractAddress: taskContractInput.value,
    chainKey: taskChainInput.value,
    sourceType,
    sourceTarget,
    sourceStage: "public",
    sourceConfigJson: sourceTarget ? taskSourceConfigInput.value.trim() : "",
    sourceExecutionBlocker: currentTaskExecutionBlocker,
    quantityPerWallet: taskQuantityInput.value,
    priceEth: taskPriceInput.value,
    abiJson: taskAbiInput.value,
    platform: taskPlatformInput.value,
    walletIds: selectedWalletIds(),
    rpcNodeIds: selectedRpcIds(),
    mintFunction: taskFunctionInput.value,
    mintArgs: taskArgsInput.value,
    ...buildClaimTaskSettings(),
    autoGeneratePhaseTasks: false,
    autoArm: taskAutoArmToggle.checked,
    gasStrategy: taskGasStrategyInput.value,
    gasLimit: taskGasLimitInput.value,
    maxFeeGwei: taskMaxFeeInput.value,
    maxPriorityFeeGwei: taskPriorityFeeInput.value,
    gasBoostPercent: taskGasBoostInput.value,
    priorityBoostPercent: taskPriorityBoostInput.value,
    txTimeoutMs: taskTxTimeoutInput.value,
    smartGasReplacement: fastSubmitPreferred ? false : taskSmartReplaceToggle.checked,
    replacementBumpPercent: taskReplaceBumpInput.value,
    replacementMaxAttempts: taskReplaceAttemptsInput.value,
    simulateTransaction:
      fastSubmitPreferred && sourceType === "opensea" ? false : taskSimulateToggle.checked,
    dryRun: taskDryRunToggle.checked,
    waitForReceipt: !fastSubmitPreferred,
    warmupRpc: fastSubmitPreferred ? false : taskWarmupToggle.checked,
    preSignTransactions: true,
    multiRpcBroadcast: taskMultiRpcBroadcastToggle.checked,
    continueOnError: false,
    walletMode: taskWalletModeInput.value,
    useSchedule: taskScheduleToggle.checked,
    waitUntilIso:
      taskScheduleToggle.checked && taskStartTimeInput.value
        ? utcDateTimeLocalToIsoString(taskStartTimeInput.value)
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

  const rawPayload = await response.text().catch(() => "");
  let payload = {};
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      payload = {};
    }
  }
  const fallbackMessage =
    payload.error ||
    (rawPayload && !/^\s*</.test(rawPayload) ? rawPayload.trim() : "") ||
    response.statusText ||
    "Request failed";

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
    const message = fallbackMessage;
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
    populateChainSelectors();
    resetRpcForm();
    renderWalletSelector([]);
    renderRpcSelector([]);
    connectEvents();
    setView("dashboard");
    showToast("Authenticated successfully.", "success", "Access Granted");
  } catch {}
});

dashboardRefreshButton?.addEventListener("click", () => {
  loadState()
    .then(() => showToast("Application state refreshed.", "success", "Refreshed"))
    .catch(() => {});
});

mintRadarRefreshButton?.addEventListener("click", async () => {
  try {
    await withButtonBusyState(mintRadarRefreshButton, "Refreshing...", async () => {
      const payload = await loadMintRadar({ forceRefresh: true, quiet: false });
      if (payload) {
        showToast("OpenSea mint radar refreshed.", "success", "Mint Radar");
      }
    });
  } catch {}
});

mintRadarFilterInput?.addEventListener("change", () => {
  state.mintRadar.filter = String(mintRadarFilterInput.value || "all").trim().toLowerCase() || "all";
  renderMintRadar();
  if (state.currentView === "mint-radar") {
    ensureMintRadarLoaded();
  }
});

mintRadarChainInput?.addEventListener("change", () => {
  state.mintRadar.chainFilter = String(mintRadarChainInput.value || "all").trim() || "all";
  renderMintRadar();
  if (state.currentView === "mint-radar") {
    ensureMintRadarLoaded();
  }
});

mintRadarSearchInput?.addEventListener("input", () => {
  state.mintRadar.searchQuery = String(mintRadarSearchInput.value || "").trim();
  renderMintRadar();
});

newTaskButton.addEventListener("click", () => openTaskModal());
dashboardOpenTaskButton.addEventListener("click", () => {
  setView("tasks");
});

runPriorityButton?.addEventListener("click", async () => {
  try {
    const payload = await request("/api/control/run-priority", { method: "POST" });
    showToast(
      `${payload.task?.name || "Priority task"} is opening a live lane. Backend contact and RPC mesh provisioning are in flight.`,
      "success",
      "Priority Launch"
    );
  } catch {}
});

rpcPulseButton?.addEventListener("click", async () => {
  try {
    await pulseRpcMesh();
  } catch {}
});

rpcPagePulseButton.addEventListener("click", async () => {
  try {
    await pulseRpcMesh();
  } catch {}
});

rpcImportAlchemyButton?.addEventListener("click", async () => {
  try {
    await withButtonBusyState(rpcImportAlchemyButton, "Loading...", async () => {
      await importAlchemyRpcs();
    });
  } catch {}
});

rpcImportDrpcButton?.addEventListener("click", async () => {
  try {
    await withButtonBusyState(rpcImportDrpcButton, "Loading...", async () => {
      await importDrpcRpcs();
    });
  } catch {}
});

snapshotButton?.addEventListener("click", async () => {
  try {
    const payload = await request("/api/control/snapshot", { method: "POST" });
    if (runtimeOutput) {
      runtimeOutput.textContent = JSON.stringify(payload.snapshot, null, 2);
    }
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

taskAdvancedToggleButton?.addEventListener("click", () => {
  setTaskAdvancedVisibility(!taskAdvancedVisible);
  syncTaskSimpleLaunchFields();
});

taskQuickDropTypeInput?.addEventListener("change", () => {
  applyTaskSimpleLaunchToAdvanced({ applyProfile: true });
});

taskSimpleLaunchModeInput?.addEventListener("change", () => {
  applyTaskSimpleLaunchToAdvanced({ applyProfile: true });
});

taskSimpleStartTimeInput?.addEventListener("change", () => {
  applyTaskSimpleLaunchToAdvanced();
});

taskSimpleTargetBlockInput?.addEventListener("change", () => {
  applyTaskSimpleLaunchToAdvanced();
});

taskSimpleMempoolInput?.addEventListener("change", () => {
  applyTaskSimpleLaunchToAdvanced();
});

taskDeleteCloseButton.addEventListener("click", closeTaskDeleteModal);
taskDeleteCancelButton.addEventListener("click", closeTaskDeleteModal);
taskDeleteSubmitButton.addEventListener("click", async () => {
  await submitTaskDelete();
});

taskDeleteModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeTaskDeleteModal === "true") {
    closeTaskDeleteModal();
  }
});

clearLogsButton?.addEventListener("click", () => {
  state.runState.logs = [];
  renderLogs();
});

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch {}

    disconnectEvents();
    setAuthState(false, null, true);
    setLoginStatus("Signed out. Sign in again to resume secure state access.");
    showToast("Session closed.", "info", "Signed Out");
  });
}

assistantResetButton.addEventListener("click", async () => {
  await resetAssistantConversation();
});

assistantSendButton.addEventListener("click", async () => {
  if (assistantState.loading) {
    stopAssistantMessage();
    return;
  }

  await sendAssistantMessage();
});

assistantInput.addEventListener("input", () => {
  renderAssistant();
});

assistantInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendAssistantMessage();
  }
});

assistantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendAssistantMessage();
});

walletImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const walletLabel = String(walletGroupInput.value || "Imported").trim() || "Imported";
  const progressIndicator = startOperationProgress(walletImportProgress, {
    steps: [
      `Preparing ${walletLabel} wallet...`,
      "Validating private key...",
      "Saving wallet to the dashboard..."
    ],
    successLabel: "Wallet import finished.",
    errorLabel: "Wallet import failed."
  });

  try {
    const payload = await withButtonBusyState(walletImportSubmitButton, "Importing...", async () =>
      request("/api/wallets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group: walletGroupInput.value || "Imported",
          privateKeys: walletKeysInput.value
        })
      })
    );
    walletKeysInput.value = "";
    progressIndicator.complete(
      payload.imported > 0
        ? `${payload.imported} wallet${payload.imported === 1 ? "" : "s"} imported.`
        : "Wallet import checked."
    );
    showToast(
      `${payload.imported} imported · ${payload.skipped} skipped`,
      "success",
      "Wallet Import Complete"
    );
  } catch {
    progressIndicator.fail("Wallet import failed.");
  }
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

  try {
    await withButtonBusyState(rpcImportChainlistButton, "Loading...", async () => {
      await importChainlistRpcs();
    });
  } catch {}
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

rpcDeleteCloseButton.addEventListener("click", closeRpcDeleteModal);
rpcDeleteCancelButton.addEventListener("click", closeRpcDeleteModal);
rpcDeleteSubmitButton.addEventListener("click", async () => {
  await submitRpcDelete();
});

rpcDeleteModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeRpcDeleteModal === "true") {
    closeRpcDeleteModal();
  }
});

walletDeleteCloseButton.addEventListener("click", closeWalletDeleteModal);
walletDeleteCancelButton.addEventListener("click", closeWalletDeleteModal);
walletDeleteSubmitButton.addEventListener("click", async () => {
  await submitWalletDelete();
});

walletDeleteModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeWalletDeleteModal === "true") {
    closeWalletDeleteModal();
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

  applyRpcDiscoveryQueryState();
});

rpcChainSearchInput.addEventListener("blur", () => {
  if (isRpcEditMode()) {
    return;
  }

  applyRpcDiscoveryQueryState();
});

if (walletAssetsRefreshButton) {
  walletAssetsRefreshButton.addEventListener("click", async () => {
    if (!walletAssetInspector.walletId || walletAssetInspector.loading) {
      return;
    }

    await loadWalletAssets(walletAssetInspector.walletId, { force: true });
  });
}

if (walletBalancesRefreshAllButton) {
  walletBalancesRefreshAllButton.addEventListener("click", async () => {
    await refreshAllWalletBalances({ silent: false, source: "manual" });
  });
}

if (rpcTransportTabs) {
  rpcTransportTabs.querySelectorAll("[data-rpc-transport-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isRpcEditMode()) {
        return;
      }

      const nextFilter = String(button.dataset.rpcTransportFilter || "http");
      if (nextFilter === rpcDiscoveryState.transportFilter) {
        return;
      }

      rpcDiscoveryState.transportFilter = nextFilter;
      renderRpcTransportTabs();
      syncRpcImportButtons();
      const currentQuery = normalizeChainSearchValue(rpcChainSearchInput.value);
      const loadedQuery = normalizeChainSearchValue(rpcDiscoveryState.query);
      if (rpcDiscoveryState.providerKey && rpcDiscoveryState.summary && currentQuery && currentQuery === loadedQuery) {
        const providerLabel = rpcDiscoveryState.providerLabel || "provider";
        const transportLabel = nextFilter === "ws" ? "websocket" : "normal";
        setRpcDetectMessage(
          `${rpcDiscoveryState.chain?.label || "This chain"} ${providerLabel} results are loaded. Showing ${transportLabel} RPCs from the current import.`
        );
        renderRpcDiscoverySummary();
        renderRpcDiscoveryCandidates();
        return;
      }

      applyRpcDiscoveryQueryState();
    });
  });
}

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKeyEntries = collectApiKeySaveEntries();

  if (!apiKeyEntries.length) {
    showToast("Enter a new API key before saving settings.", "info", "No Changes");
    return;
  }

  const unverifiedEntries = apiKeyEntries.filter((entry) => !entry.validated);
  if (unverifiedEntries.length) {
    showToast(
      `Test ${formatLabelList(unverifiedEntries.map((entry) => entry.label))} before saving settings.`,
      "info",
      "Test Keys First"
    );
    return;
  }

  const updatedKeys = apiKeyEntries.map((entry) => entry.label);
  const confirmationCopy = `Save ${formatLabelList(updatedKeys)} API ${
    updatedKeys.length === 1 ? "key" : "keys"
  } now?`;
  if (!window.confirm(confirmationCopy)) {
    return;
  }

  const saveButton = saveSettingsButton || settingsForm.querySelector('button[type="submit"]');

  try {
    await withButtonBusyState(saveButton, "Saving...", async () => {
      const payloadBody = {};
      apiKeyEntries.forEach((entry) => {
        payloadBody[entry.payloadField] = entry.value;
      });

      const payload = await request("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
      });
      if (payload.settings) {
        state.settings = payload.settings;
      }
      clearAllApiKeyDrafts();
      clearAllApiKeyInputs();
      showToast(
        `${formatLabelList(updatedKeys)} API ${updatedKeys.length === 1 ? "key" : "keys"} updated.`,
        "success",
        "Settings Saved"
      );
      syncExplorerKeyControls();
      setExplorerKeyStatus();
      syncOpenaiKeyControls();
      setOpenaiKeyStatus();
      syncAlchemyKeyControls();
      setAlchemyKeyStatus();
      syncDrpcKeyControls();
      setDrpcKeyStatus();
      syncOpenseaKeyControls();
      setOpenseaKeyStatus();
    });
  } catch {} finally {
    syncExplorerKeyControls();
    setExplorerKeyStatus();
    syncOpenaiKeyControls();
    setOpenaiKeyStatus();
    syncAlchemyKeyControls();
    setAlchemyKeyStatus();
    syncDrpcKeyControls();
    setDrpcKeyStatus();
    syncOpenseaKeyControls();
    setOpenseaKeyStatus();
  }
});

explorerApiKeyInput.addEventListener("input", () => {
  syncApiKeyDraftFromInput("explorer", explorerApiKeyInput);
  syncExplorerKeyControls();
  setExplorerKeyStatus();
});

openaiApiKeyInput.addEventListener("input", () => {
  syncApiKeyDraftFromInput("openai", openaiApiKeyInput);
  syncOpenaiKeyControls();
  setOpenaiKeyStatus();
});

alchemyApiKeyInput.addEventListener("input", () => {
  syncApiKeyDraftFromInput("alchemy", alchemyApiKeyInput);
  syncAlchemyKeyControls();
  setAlchemyKeyStatus();
});

drpcApiKeyInput.addEventListener("input", () => {
  syncApiKeyDraftFromInput("drpc", drpcApiKeyInput);
  syncDrpcKeyControls();
  setDrpcKeyStatus();
});

openseaApiKeyInput.addEventListener("input", () => {
  syncApiKeyDraftFromInput("opensea", openseaApiKeyInput);
  syncOpenseaKeyControls();
  setOpenseaKeyStatus();
});

deleteExplorerKeyButton.addEventListener("click", async () => {
  if (hasApiKeyDraft("explorer")) {
    clearPendingApiKeyUi({
      draftKey: "explorer",
      input: explorerApiKeyInput,
      label: "Explorer",
      syncControls: syncExplorerKeyControls,
      statusSetter: setExplorerKeyStatus
    });
    return;
  }

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
  if (hasApiKeyDraft("openai")) {
    clearPendingApiKeyUi({
      draftKey: "openai",
      input: openaiApiKeyInput,
      label: "OpenAI",
      syncControls: syncOpenaiKeyControls,
      statusSetter: setOpenaiKeyStatus
    });
    return;
  }

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

deleteAlchemyKeyButton.addEventListener("click", async () => {
  if (hasApiKeyDraft("alchemy")) {
    clearPendingApiKeyUi({
      draftKey: "alchemy",
      input: alchemyApiKeyInput,
      label: "Alchemy",
      syncControls: syncAlchemyKeyControls,
      statusSetter: setAlchemyKeyStatus
    });
    return;
  }

  if (state.settings.alchemyApiKeySource !== "saved") {
    showToast("There is no saved Alchemy dashboard key to delete.", "info", "No Saved Key");
    return;
  }

  if (!window.confirm("Delete the saved Alchemy API key?")) {
    return;
  }

  const buttonLabel = deleteAlchemyKeyButton.textContent;
  deleteAlchemyKeyButton.disabled = true;
  deleteAlchemyKeyButton.textContent = "Deleting...";

  try {
    const payload = await request("/api/settings/alchemy-key", {
      method: "DELETE"
    });

    if (payload.settings) {
      state.settings = payload.settings;
    }

    alchemyApiKeyInput.value = "";
    syncAlchemyKeyControls();
    setAlchemyKeyStatus();
    showToast("Saved Alchemy API key deleted.", "success", "Alchemy Key Deleted");
  } catch {
    syncAlchemyKeyControls();
    setAlchemyKeyStatus();
  } finally {
    deleteAlchemyKeyButton.textContent = buttonLabel;
    syncAlchemyKeyControls();
  }
});

deleteDrpcKeyButton.addEventListener("click", async () => {
  if (hasApiKeyDraft("drpc")) {
    clearPendingApiKeyUi({
      draftKey: "drpc",
      input: drpcApiKeyInput,
      label: "dRPC",
      syncControls: syncDrpcKeyControls,
      statusSetter: setDrpcKeyStatus
    });
    return;
  }

  if (state.settings.drpcApiKeySource !== "saved") {
    showToast("There is no saved dRPC dashboard key to delete.", "info", "No Saved Key");
    return;
  }

  if (!window.confirm("Delete the saved dRPC API key?")) {
    return;
  }

  const buttonLabel = deleteDrpcKeyButton.textContent;
  deleteDrpcKeyButton.disabled = true;
  deleteDrpcKeyButton.textContent = "Deleting...";

  try {
    const payload = await request("/api/settings/drpc-key", {
      method: "DELETE"
    });

    if (payload.settings) {
      state.settings = payload.settings;
    }

    drpcApiKeyInput.value = "";
    syncDrpcKeyControls();
    setDrpcKeyStatus();
    showToast("Saved dRPC API key deleted.", "success", "dRPC Key Deleted");
  } catch {
    syncDrpcKeyControls();
    setDrpcKeyStatus();
  } finally {
    deleteDrpcKeyButton.textContent = buttonLabel;
    syncDrpcKeyControls();
  }
});

deleteOpenseaKeyButton.addEventListener("click", async () => {
  if (hasApiKeyDraft("opensea")) {
    clearPendingApiKeyUi({
      draftKey: "opensea",
      input: openseaApiKeyInput,
      label: "OpenSea",
      syncControls: syncOpenseaKeyControls,
      statusSetter: setOpenseaKeyStatus
    });
    return;
  }

  if (state.settings.openseaApiKeySource !== "saved") {
    showToast("There is no saved OpenSea dashboard key to delete.", "info", "No Saved Key");
    return;
  }

  if (!window.confirm("Delete the saved OpenSea API key?")) {
    return;
  }

  const buttonLabel = deleteOpenseaKeyButton.textContent;
  deleteOpenseaKeyButton.disabled = true;
  deleteOpenseaKeyButton.textContent = "Deleting...";

  try {
    const payload = await request("/api/settings/opensea-key", {
      method: "DELETE"
    });

    if (payload.settings) {
      state.settings = payload.settings;
    }

    openseaApiKeyInput.value = "";
    syncOpenseaKeyControls();
    setOpenseaKeyStatus();
    showToast("Saved OpenSea API key deleted.", "success", "OpenSea Key Deleted");
  } catch {
    syncOpenseaKeyControls();
    setOpenseaKeyStatus();
  } finally {
    deleteOpenseaKeyButton.textContent = buttonLabel;
    syncOpenseaKeyControls();
  }
});

testExplorerKeyButton.addEventListener("click", async () => {
  await runApiKeyTest({
    draftKey: "explorer",
    label: "Explorer",
    input: explorerApiKeyInput,
    button: testExplorerKeyButton,
    progress: explorerKeyProgress,
    payloadField: "explorerApiKey",
    endpoint: "/api/control/test-explorer-key",
    configured: () => state.settings.explorerApiKeyConfigured,
    statusSetter: setExplorerKeyStatus,
    syncControls: syncExplorerKeyControls,
    requiredTitle: "Explorer Key Required",
    requiredMessage: "Paste an explorer key first, or save one before testing."
  });
});

testOpenaiKeyButton.addEventListener("click", async () => {
  await runApiKeyTest({
    draftKey: "openai",
    label: "OpenAI",
    input: openaiApiKeyInput,
    button: testOpenaiKeyButton,
    progress: openaiKeyProgress,
    payloadField: "openaiApiKey",
    endpoint: "/api/control/test-openai-key",
    configured: () => state.settings.openaiApiKeyConfigured,
    statusSetter: setOpenaiKeyStatus,
    syncControls: syncOpenaiKeyControls,
    requiredTitle: "OpenAI Key Required",
    requiredMessage: "Paste an OpenAI key first, or save one before testing."
  });
});

testAlchemyKeyButton.addEventListener("click", async () => {
  await runApiKeyTest({
    draftKey: "alchemy",
    label: "Alchemy",
    input: alchemyApiKeyInput,
    button: testAlchemyKeyButton,
    progress: alchemyKeyProgress,
    payloadField: "alchemyApiKey",
    endpoint: "/api/control/test-alchemy-key",
    configured: () => state.settings.alchemyApiKeyConfigured,
    statusSetter: setAlchemyKeyStatus,
    syncControls: syncAlchemyKeyControls,
    requiredTitle: "Alchemy Key Required",
    requiredMessage: "Paste an Alchemy key first, or save one before testing."
  });
});

testDrpcKeyButton.addEventListener("click", async () => {
  await runApiKeyTest({
    draftKey: "drpc",
    label: "dRPC",
    input: drpcApiKeyInput,
    button: testDrpcKeyButton,
    progress: drpcKeyProgress,
    payloadField: "drpcApiKey",
    endpoint: "/api/control/test-drpc-key",
    configured: () => state.settings.drpcApiKeyConfigured,
    statusSetter: setDrpcKeyStatus,
    syncControls: syncDrpcKeyControls,
    requiredTitle: "dRPC Key Required",
    requiredMessage: "Paste a dRPC key first, or save one before testing."
  });
});

testOpenseaKeyButton.addEventListener("click", async () => {
  await runApiKeyTest({
    draftKey: "opensea",
    label: "OpenSea",
    input: openseaApiKeyInput,
    button: testOpenseaKeyButton,
    progress: openseaKeyProgress,
    payloadField: "openseaApiKey",
    endpoint: "/api/control/test-opensea-key",
    configured: () => state.settings.openseaApiKeyConfigured,
    statusSetter: setOpenseaKeyStatus,
    syncControls: syncOpenseaKeyControls,
    requiredTitle: "OpenSea Key Required",
    requiredMessage: "Paste an OpenSea key first, or save one before testing."
  });
});

testAllApiKeysButton?.addEventListener("click", async () => {
  await withButtonBusyState(testAllApiKeysButton, "Testing All...", async () => {
    const results = [];
    results.push(
      await runApiKeyTest({
        draftKey: "explorer",
        label: "Explorer",
        input: explorerApiKeyInput,
        button: testExplorerKeyButton,
        progress: explorerKeyProgress,
        payloadField: "explorerApiKey",
        endpoint: "/api/control/test-explorer-key",
        configured: () => state.settings.explorerApiKeyConfigured,
        statusSetter: setExplorerKeyStatus,
        syncControls: syncExplorerKeyControls,
        requiredTitle: "Explorer Key Required",
        requiredMessage: "Paste an explorer key first, or save one before testing."
      }, { summaryMode: true })
    );
    results.push(
      await runApiKeyTest({
        draftKey: "openai",
        label: "OpenAI",
        input: openaiApiKeyInput,
        button: testOpenaiKeyButton,
        progress: openaiKeyProgress,
        payloadField: "openaiApiKey",
        endpoint: "/api/control/test-openai-key",
        configured: () => state.settings.openaiApiKeyConfigured,
        statusSetter: setOpenaiKeyStatus,
        syncControls: syncOpenaiKeyControls,
        requiredTitle: "OpenAI Key Required",
        requiredMessage: "Paste an OpenAI key first, or save one before testing."
      }, { summaryMode: true })
    );
    results.push(
      await runApiKeyTest({
        draftKey: "alchemy",
        label: "Alchemy",
        input: alchemyApiKeyInput,
        button: testAlchemyKeyButton,
        progress: alchemyKeyProgress,
        payloadField: "alchemyApiKey",
        endpoint: "/api/control/test-alchemy-key",
        configured: () => state.settings.alchemyApiKeyConfigured,
        statusSetter: setAlchemyKeyStatus,
        syncControls: syncAlchemyKeyControls,
        requiredTitle: "Alchemy Key Required",
        requiredMessage: "Paste an Alchemy key first, or save one before testing."
      }, { summaryMode: true })
    );
    results.push(
      await runApiKeyTest({
        draftKey: "drpc",
        label: "dRPC",
        input: drpcApiKeyInput,
        button: testDrpcKeyButton,
        progress: drpcKeyProgress,
        payloadField: "drpcApiKey",
        endpoint: "/api/control/test-drpc-key",
        configured: () => state.settings.drpcApiKeyConfigured,
        statusSetter: setDrpcKeyStatus,
        syncControls: syncDrpcKeyControls,
        requiredTitle: "dRPC Key Required",
        requiredMessage: "Paste a dRPC key first, or save one before testing."
      }, { summaryMode: true })
    );
    results.push(
      await runApiKeyTest({
        draftKey: "opensea",
        label: "OpenSea",
        input: openseaApiKeyInput,
        button: testOpenseaKeyButton,
        progress: openseaKeyProgress,
        payloadField: "openseaApiKey",
        endpoint: "/api/control/test-opensea-key",
        configured: () => state.settings.openseaApiKeyConfigured,
        statusSetter: setOpenseaKeyStatus,
        syncControls: syncOpenseaKeyControls,
        requiredTitle: "OpenSea Key Required",
        requiredMessage: "Paste an OpenSea key first, or save one before testing."
      }, { summaryMode: true })
    );

    const testedCount = results.filter((result) => result.tested).length;
    const successCount = results.filter((result) => result.success).length;
    const failedCount = results.filter((result) => result.tested && !result.success).length;

    if (!testedCount) {
      showToast("Paste a key or save one before using Test All Keys.", "info", "No Keys To Test");
      return;
    }

    showToast(
      `Tested ${testedCount} API ${testedCount === 1 ? "key" : "keys"}: ${successCount} valid, ${failedCount} failed.`,
      failedCount ? "error" : "success",
      "Key Test Complete"
    );
  });
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

taskSourceTypeInput?.addEventListener("change", () => {
  updateTaskSourceInputs();
  if (taskSourceTypeInput.value === "opensea") {
    scheduleTaskSourceDiscovery({ force: true, quiet: true });
    return;
  }

  window.clearTimeout(sourceDiscoveryTimer);
  sourceDiscoveryRequestId += 1;
  setTaskSourceDiscoveryStatus("");
});

taskSourceStageInput?.addEventListener("change", () => {
  updateTaskSourceInputs();
  scheduleTaskSourceDiscovery({ force: true, quiet: true });
});

taskSourceTargetInput?.addEventListener("input", () => {
  currentTaskSourceDiscovery = null;
  currentTaskMintAutofill = null;
  syncTaskSourceTypeFromTarget();
  updateTaskSourceInputs();
  updateTaskMintSummary();
  scheduleTaskSourceDiscovery({ quiet: true });
});

taskLatencyProfileInput.addEventListener("change", () => {
  applyLatencyProfile(taskLatencyProfileInput.value);
});

taskScheduleToggle.addEventListener("change", () => {
  syncTaskSimpleLaunchFromAdvanced();
});

taskStartTimeInput.addEventListener("change", () => {
  syncTaskSimpleLaunchFromAdvanced();
});

taskTriggerModeInput.addEventListener("change", () => {
  syncTaskSimpleLaunchFromAdvanced();
});

taskTriggerBlockInput.addEventListener("change", () => {
  syncTaskSimpleLaunchFromAdvanced();
});

taskTriggerMempoolSignatureInput.addEventListener("change", () => {
  syncTaskSimpleLaunchFromAdvanced();
});

taskReadyFunctionInput.addEventListener("change", () => {
  syncTaskSimpleLaunchFromAdvanced();
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
    setTaskLaunchRecommendation(null);
    setTaskExecutionBlocker("");
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
    setTaskLaunchRecommendation(null);
    setTaskExecutionBlocker("");
    renderPhasePreview([]);
    updateAbiStatus();
  }

  scheduleExplorerAbiFetch({
    force: currentTaskAbiOrigin() === "explorer" || !taskAbiInput.value.trim()
  });
  updateTaskMintSummary();
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

  updateTaskMintSummary();
});

taskPriceInput?.addEventListener("input", () => {
  updateTaskMintSummary();
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
    await ensureTaskSourceDiscoveryBeforeSave();
  } catch (error) {
    showToast(error.message || "OpenSea auto-discovery failed.", "error", "Auto-Discovery Failed");
    return;
  }

  if (!validateTaskQuickStrategy()) {
    return;
  }

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

populateMintSourceSelectors();
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
