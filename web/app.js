const state = {
  tasks: [],
  wallets: [],
  rpcNodes: [],
  settings: {},
  chains: [],
  runState: { status: "idle", activeTaskId: null, logs: [], startedAt: null },
  currentView: "dashboard",
  walletGroupFilter: "All",
  taskSearch: "",
  taskStatusFilter: "all"
};

const navButtons = [...document.querySelectorAll(".nav-button")];
const views = [...document.querySelectorAll(".view")];
const dashboardStats = document.getElementById("dashboard-stats");
const dashboardRecentTasks = document.getElementById("dashboard-recent-tasks");
const chainBreakdown = document.getElementById("chain-breakdown");
const walletGroupBreakdown = document.getElementById("wallet-group-breakdown");
const runInsights = document.getElementById("run-insights");
const taskGrid = document.getElementById("task-grid");
const tasksSubtitle = document.getElementById("tasks-subtitle");
const logOutput = document.getElementById("log-output");
const resultsOutput = document.getElementById("results-output");
const runtimeOutput = document.getElementById("runtime-output");
const refreshButton = document.getElementById("refresh-button");
const newTaskButton = document.getElementById("new-task-button");
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
const accountLabel = document.getElementById("account-label");
const accountStatus = document.getElementById("account-status");
const batchToggle = document.getElementById("batch-toggle");
const batchStatus = document.getElementById("batch-status");
const globalStopButton = document.getElementById("global-stop-button");

const taskModal = document.getElementById("task-modal");
const modalTitle = document.getElementById("modal-title");
const closeModalButton = document.getElementById("close-modal-button");
const cancelTaskButton = document.getElementById("cancel-task-button");
const taskForm = document.getElementById("task-form");
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
const taskMaxFeeInput = document.getElementById("task-max-fee-input");
const taskPriorityFeeInput = document.getElementById("task-priority-fee-input");
const taskGasBoostInput = document.getElementById("task-gas-boost-input");
const taskPriorityBoostInput = document.getElementById("task-priority-boost-input");
const taskRetriesInput = document.getElementById("task-retries-input");
const taskRetryDelayInput = document.getElementById("task-retry-delay-input");
const taskJitterInput = document.getElementById("task-jitter-input");
const taskMinBalanceInput = document.getElementById("task-min-balance-input");
const taskReadyFunctionInput = document.getElementById("task-ready-function-input");
const taskReadyArgsInput = document.getElementById("task-ready-args-input");
const taskReadyModeInput = document.getElementById("task-ready-mode-input");
const taskReadyExpectedInput = document.getElementById("task-ready-expected-input");
const taskReadyIntervalInput = document.getElementById("task-ready-interval-input");
const taskTransferAddressInput = document.getElementById("task-transfer-address-input");
const taskSimulateToggle = document.getElementById("task-simulate-toggle");
const taskDryRunToggle = document.getElementById("task-dry-run-toggle");
const taskWarmupToggle = document.getElementById("task-warmup-toggle");
const taskTransferToggle = document.getElementById("task-transfer-toggle");
const taskNotesInput = document.getElementById("task-notes-input");

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

function activeTask() {
  return state.tasks.find((task) => task.id === state.runState.activeTaskId) || null;
}

function walletGroups() {
  return ["All", ...new Set(state.wallets.map((wallet) => wallet.group || "Imported"))];
}

function filteredTasks() {
  return state.tasks.filter((task) => {
    const matchesSearch = !state.taskSearch
      || task.name.toLowerCase().includes(state.taskSearch.toLowerCase())
      || task.contractAddress.toLowerCase().includes(state.taskSearch.toLowerCase())
      || (task.tags || []).some((tag) => tag.toLowerCase().includes(state.taskSearch.toLowerCase()));

    const matchesStatus =
      state.taskStatusFilter === "all" || task.status === state.taskStatusFilter;

    return matchesSearch && matchesStatus;
  });
}

function setView(viewName) {
  state.currentView = viewName;
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  views.forEach((view) => {
    view.classList.toggle("active", view.dataset.viewPanel === viewName);
  });
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
  walletSelectionCount.textContent = `${count} wallet${count === 1 ? "" : "s"} selected`;
}

function setRpcSelectionCount() {
  const count = selectedRpcIds().length;
  rpcSelectionCount.textContent = `${count} RPC node${count === 1 ? "" : "s"} selected`;
  rpcSelectionCount.classList.toggle("warning", count === 0);
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
            <div class="muted-copy">${escapeHtml(wallet.addressShort)} - ${escapeHtml(wallet.group || "Imported")}</div>
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

function chainLabel(chainKey) {
  return state.chains.find((chain) => chain.key === chainKey)?.label || chainKey;
}

function computeSuccessRate() {
  const summaries = state.tasks.map((task) => task.summary || {});
  const total = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const success = summaries.reduce((sum, summary) => sum + (summary.success || 0), 0);
  return total ? `${Math.round((success / total) * 100)}%` : "0%";
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
  const chainKey = taskChainInput.value || "base_sepolia";
  const rpcNodes = state.rpcNodes.filter((node) => node.chainKey === chainKey && node.enabled);

  rpcSelector.innerHTML = rpcNodes.length
    ? rpcRowsMarkup(rpcNodes, selectedIds)
    : `<div class="empty-state"><h3>No RPC nodes</h3><p>Add enabled nodes for ${escapeHtml(chainLabel(chainKey))} in the RPC view.</p></div>`;

  setRpcSelectionCount();
  bindSelectorCheckboxes(rpcSelector, setRpcSelectionCount);
}

function renderDashboard() {
  const runningTasks = state.tasks.filter((task) => task.status === "running").length;
  const completedTasks = state.tasks.filter((task) => task.status === "completed").length;
  const totalWallets = state.wallets.length;
  const totalRpc = state.rpcNodes.length;
  const active = activeTask();

  dashboardStats.innerHTML = [
    { label: "Tasks", value: state.tasks.length },
    { label: "Running", value: runningTasks },
    { label: "Wallets", value: totalWallets },
    { label: "RPC Nodes", value: totalRpc }
  ]
    .map(
      (card) => `
        <article class="stat-card">
          <span class="muted-copy">${escapeHtml(card.label)}</span>
          <strong>${card.value}</strong>
        </article>
      `
    )
    .join("");

  const latestRunTask = [...state.tasks]
    .filter((task) => task.lastRunAt)
    .sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt))[0];

  runInsights.innerHTML = [
    {
      label: "Success Rate",
      value: computeSuccessRate(),
      subtext: `${completedTasks} completed tasks`
    },
    {
      label: "Active Task",
      value: active ? active.name : "None",
      subtext: active ? `${active.progress?.phase || "Running"} - ${active.progress?.percent || 0}%` : "Idle"
    },
    {
      label: "Last Run",
      value: latestRunTask ? latestRunTask.name : "No history",
      subtext: latestRunTask ? relativeTime(latestRunTask.lastRunAt) : "Nothing executed yet"
    }
  ]
    .map(
      (card) => `
        <article class="insight-card">
          <span class="muted-copy">${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p class="muted-copy">${escapeHtml(card.subtext)}</p>
        </article>
      `
    )
    .join("");

  const recentTasks = [...state.tasks]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4);

  dashboardRecentTasks.innerHTML = recentTasks.length
    ? recentTasks
        .map(
          (task) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(task.name)}</strong>
                <p>${escapeHtml(truncateMiddle(task.contractAddress || "No contract"))}</p>
              </div>
              <span class="status-pill ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No tasks created</h3><p>Create your first task from the Tasks view.</p></div>`;

  const chainCounts = Object.entries(
    state.tasks.reduce((map, task) => {
      map[task.chainKey] = (map[task.chainKey] || 0) + 1;
      return map;
    }, {})
  );

  chainBreakdown.innerHTML = chainCounts.length
    ? chainCounts
        .map(
          ([chainKey, count]) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(chainLabel(chainKey))}</strong>
                <p>${count} task${count === 1 ? "" : "s"}</p>
              </div>
              <span class="status-pill">${count}</span>
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
                <p>${count} wallet${count === 1 ? "" : "s"}</p>
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
  const active = state.runState.activeTaskId === task.id && state.runState.status === "running";
  const hashCount = summary.hashes?.length || 0;
  const tags = task.tags || [];

  return `
    <article class="task-card ${escapeHtml(task.status)}" data-task-id="${escapeHtml(task.id)}">
      <div class="task-head">
        <div>
          <h3>${escapeHtml(task.name)}</h3>
          <p class="muted-copy">${escapeHtml(task.platform)} - ${escapeHtml(task.priority || "standard")}</p>
        </div>
        <div class="task-actions">
          <button class="mini-button" data-task-action="done">${task.done ? "Undone" : "Done"}</button>
          <button class="mini-button ${active ? "" : "primary"}" data-task-action="${active ? "stop" : "run"}">${active ? "Stop" : "Run"}</button>
          <button class="mini-button" data-task-action="edit">Edit</button>
          <button class="mini-button" data-task-action="duplicate">Duplicate</button>
          <button class="mini-button danger" data-task-action="delete">Delete</button>
        </div>
      </div>

      <div class="task-meta">
        <div class="meta-item"><label>Contract</label><strong>${escapeHtml(truncateMiddle(task.contractAddress))}</strong></div>
        <div class="meta-item"><label>Chain</label><strong>${escapeHtml(chainLabel(task.chainKey))}</strong></div>
        <div class="meta-item"><label>Wallets</label><strong>${task.walletCount}</strong></div>
        <div class="meta-item"><label>RPC</label><strong>${task.rpcCount}</strong></div>
        <div class="meta-item"><label>Qty</label><strong>${task.quantityPerWallet}</strong></div>
        <div class="meta-item"><label>Price</label><strong>${escapeHtml(task.priceEth)} ETH</strong></div>
      </div>

      ${tags.length ? `<div class="chip-row">${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}

      <div class="task-stats">
        <div class="stat-box"><label>Total</label><strong>${summary.total ?? task.walletCount}</strong></div>
        <div class="stat-box success"><label>Success</label><strong>${summary.success ?? 0}</strong></div>
        <div class="stat-box failed"><label>Failed</label><strong>${summary.failed ?? 0}</strong></div>
        <div class="stat-box"><label>Hashes</label><strong>${hashCount}</strong></div>
      </div>

      <div class="task-progress-row">
        <span class="muted-copy">${escapeHtml(progress.phase)} - ${progress.percent ?? 0}%</span>
        <span class="status-pill ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width:${Number(progress.percent || 0)}%"></div></div>

      ${task.notes ? `<p class="muted-copy" style="margin-top:12px;">${escapeHtml(task.notes)}</p>` : ""}

      <div class="history-block">
        <div class="muted-copy">History (${task.history?.length || 0})</div>
        ${
          latestHistory
            ? `
              <div class="history-item">
                <strong>Last run: ${new Date(latestHistory.ranAt).toLocaleString()}</strong>
                <p class="muted-copy">${latestHistory.summary.success} success - ${latestHistory.summary.failed} failed - ${latestHistory.summary.hashes.length} hashes</p>
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
  tasksSubtitle.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"} shown`;

  taskGrid.innerHTML = tasks.length
    ? tasks.map(renderTaskCard).join("")
    : `<div class="empty-state"><h3>No matching tasks</h3><p>Adjust the search or status filter, or create a new task.</p></div>`;

  taskGrid.querySelectorAll("[data-task-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-task-id]");
      const taskId = card.dataset.taskId;
      const action = button.dataset.taskAction;

      try {
        if (action === "edit") {
          openTaskModal(state.tasks.find((task) => task.id === taskId));
          return;
        }

        if (action === "delete") {
          await request(`/api/tasks/${taskId}`, { method: "DELETE" });
          return;
        }

        if (action === "done") {
          await request(`/api/tasks/${taskId}/done`, { method: "POST" });
          return;
        }

        if (action === "duplicate") {
          await request(`/api/tasks/${taskId}/duplicate`, { method: "POST" });
          return;
        }

        if (action === "run") {
          await request(`/api/tasks/${taskId}/run`, { method: "POST" });
          return;
        }

        if (action === "stop") {
          await request("/api/run/stop", { method: "POST" });
        }
      } catch {}
    });
  });
}

function renderWallets() {
  walletCount.textContent = `${state.wallets.length} wallet${state.wallets.length === 1 ? "" : "s"}`;
  walletList.innerHTML = state.wallets.length
    ? state.wallets
        .map(
          (wallet) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(wallet.label)}</strong>
                <p>${escapeHtml(wallet.addressShort)} - ${escapeHtml(wallet.group || "Imported")}</p>
              </div>
              <div class="task-actions">
                <span class="wallet-chip">${escapeHtml(wallet.status)}</span>
                <button class="mini-button danger" data-wallet-delete="${escapeHtml(wallet.id)}">Delete</button>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No wallets imported</h3><p>Add wallets on the left to start creating tasks.</p></div>`;

  walletList.querySelectorAll("[data-wallet-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/wallets/${button.dataset.walletDelete}`, { method: "DELETE" });
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
                <p>${escapeHtml(chainLabel(node.chainKey))} - ${escapeHtml(node.url)}</p>
              </div>
              <div class="task-actions">
                ${rpcHealthMarkup(node)}
                <button class="mini-button" data-rpc-test="${escapeHtml(node.id)}">Test</button>
                <button class="mini-button danger" data-rpc-delete="${escapeHtml(node.id)}">Delete</button>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>No RPC nodes saved</h3><p>Add chain endpoints to build a failover pool.</p></div>`;

  rpcList.querySelectorAll("[data-rpc-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/rpc-nodes/${button.dataset.rpcDelete}`, { method: "DELETE" });
      } catch {}
    });
  });

  rpcList.querySelectorAll("[data-rpc-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/rpc-nodes/${button.dataset.rpcTest}/test`, { method: "POST" });
      } catch {}
    });
  });
}

function renderSettings() {
  profileNameInput.value = state.settings.profileName || "local";
  themeInput.value = state.settings.theme || "dark-panel";
  resultsPathInput.value = state.settings.resultsPath || "./dist/mint-results.json";
}

function renderRuntime() {
  runtimeOutput.textContent = JSON.stringify(
    {
      runState: state.runState,
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
    .sort((a, b) => new Date(b.lastRunAt || 0) - new Date(a.lastRunAt || 0))[0];

  if (!latestCompletedTask) {
    return;
  }

  resultsOutput.textContent = JSON.stringify(latestCompletedTask.history[0], null, 2);
}

function applyAppState(payload) {
  state.tasks = payload.tasks || [];
  state.wallets = payload.wallets || [];
  state.rpcNodes = payload.rpcNodes || [];
  state.settings = payload.settings || {};
  state.chains = payload.chains || [];
  state.runState = payload.runState || state.runState;

  accountLabel.textContent = state.settings.profileName || "Local Operator";
  accountStatus.textContent = state.runState.status === "running" ? "Task running" : "Ready";
  globalStopButton.disabled = state.runState.status !== "running";
  batchStatus.textContent = batchToggle.checked
    ? "Batch mode is enabled for selection planning."
    : "Batch tools are available for visual planning.";

  renderDashboard();
  renderTasks();
  renderWallets();
  renderRpcNodes();
  renderSettings();
  renderRuntime();
  renderResultsIfAvailable();
}

function openTaskModal(task = null) {
  modalTitle.textContent = task ? "Edit Task" : "New Task";
  taskIdInput.value = task?.id || "";
  taskNameInput.value = task?.name || "";
  taskPriorityInput.value = task?.priority || "standard";
  taskTagsInput.value = (task?.tags || []).join(", ");
  taskContractInput.value = task?.contractAddress || "";
  taskChainInput.value = task?.chainKey || "base_sepolia";
  taskQuantityInput.value = task?.quantityPerWallet || 1;
  taskPriceInput.value = task?.priceEth || "0";
  taskAbiInput.value = task?.abiJson || "";
  taskPlatformInput.value = task?.platform || "Generic EVM (auto-detect)";
  taskFunctionInput.value = task?.mintFunction || "mint";
  taskArgsInput.value = task?.mintArgs || "[1]";
  taskScheduleToggle.checked = Boolean(task?.useSchedule);
  taskStartTimeInput.value = task?.waitUntilIso ? task.waitUntilIso.slice(0, 16) : "";
  taskWalletModeInput.value = task?.walletMode || "parallel";
  taskGasStrategyInput.value = task?.gasStrategy || "provider";
  taskGasLimitInput.value = task?.gasLimit || "";
  taskPollIntervalInput.value = task?.pollIntervalMs || "1000";
  taskMaxFeeInput.value = task?.maxFeeGwei || "";
  taskPriorityFeeInput.value = task?.maxPriorityFeeGwei || "";
  taskGasBoostInput.value = task?.gasBoostPercent || "0";
  taskPriorityBoostInput.value = task?.priorityBoostPercent || "0";
  taskRetriesInput.value = task?.maxRetries || "1";
  taskRetryDelayInput.value = task?.retryDelayMs || "1000";
  taskJitterInput.value = task?.startJitterMs || "0";
  taskMinBalanceInput.value = task?.minBalanceEth || "";
  taskReadyFunctionInput.value = task?.readyCheckFunction || "";
  taskReadyArgsInput.value = task?.readyCheckArgs || "[]";
  taskReadyModeInput.value = task?.readyCheckMode || "truthy";
  taskReadyExpectedInput.value = task?.readyCheckExpected || "";
  taskReadyIntervalInput.value = task?.readyCheckIntervalMs || "1000";
  taskTransferAddressInput.value = task?.transferAddress || "";
  taskSimulateToggle.checked = task?.simulateTransaction ?? true;
  taskDryRunToggle.checked = Boolean(task?.dryRun);
  taskWarmupToggle.checked = task?.warmupRpc ?? true;
  taskTransferToggle.checked = Boolean(task?.transferAfterMinted);
  taskNotesInput.value = task?.notes || "";
  taskAbiFileInput.value = "";

  updateAbiStatus();
  renderWalletSelector(task?.walletIds || []);
  renderRpcSelector(task?.rpcNodeIds || []);
  taskModal.classList.remove("hidden");
}

function closeTaskModal() {
  taskModal.classList.add("hidden");
}

function updateAbiStatus() {
  if (!taskAbiInput.value.trim()) {
    abiStatus.textContent = "Paste JSON or load a file.";
    return;
  }

  try {
    const parsed = JSON.parse(taskAbiInput.value);
    const abi = Array.isArray(parsed) ? parsed : parsed.abi || [];
    const functionCount = abi.filter((item) => item.type === "function").length;
    abiStatus.textContent = `ABI loaded - ${functionCount} functions`;
  } catch {
    abiStatus.textContent = "ABI JSON is not valid yet.";
  }
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
    simulateTransaction: taskSimulateToggle.checked,
    dryRun: taskDryRunToggle.checked,
    waitForReceipt: true,
    warmupRpc: taskWarmupToggle.checked,
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
    startJitterMs: taskJitterInput.value,
    minBalanceEth: taskMinBalanceInput.value,
    nonceOffset: "0",
    transferAfterMinted: taskTransferToggle.checked,
    transferAddress: taskTransferAddressInput.value
  };
}

function appendLog(line) {
  logOutput.textContent += `${line}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    appendLog(`[error] ${payload.error || "Request failed"}`);
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

async function loadState() {
  const payload = await request("/api/app-state");
  applyAppState(payload);
}

function populateChainSelectors() {
  const options = state.chains
    .map((chain) => `<option value="${escapeHtml(chain.key)}">${escapeHtml(chain.label)}</option>`)
    .join("");
  taskChainInput.innerHTML = options;
  rpcChainInput.innerHTML = options;
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
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
  loadState().catch((error) => appendLog(`[error] ${error.message}`));
});

newTaskButton.addEventListener("click", () => openTaskModal());
closeModalButton.addEventListener("click", closeTaskModal);
cancelTaskButton.addEventListener("click", closeTaskModal);
taskModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeModal === "true") {
    closeTaskModal();
  }
});

clearLogsButton.addEventListener("click", () => {
  logOutput.textContent = "";
});

batchToggle.addEventListener("change", () => {
  batchStatus.textContent = batchToggle.checked
    ? "Batch mode is enabled for selection planning."
    : "Batch tools are available for visual planning.";
});

globalStopButton.addEventListener("click", async () => {
  try {
    await request("/api/run/stop", { method: "POST" });
  } catch {}
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
    appendLog(`[info] Wallet import complete - imported ${payload.imported}, skipped ${payload.skipped}`);
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
        resultsPath: resultsPathInput.value
      })
    });
    appendLog("[info] Settings saved");
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
  } catch {}
});

const events = new EventSource("/api/events");
events.addEventListener("state", (event) => {
  const payload = JSON.parse(event.data);
  const currentWalletSelection = selectedWalletIds();
  const currentRpcSelection = selectedRpcIds();
  applyAppState(payload);
  populateChainSelectors();
  renderWalletSelector(currentWalletSelection);
  renderRpcSelector(currentRpcSelection);
});

events.addEventListener("log", (event) => {
  const payload = JSON.parse(event.data);
  appendLog(`[${payload.level}] ${payload.message}`);
});

loadState()
  .then(() => {
    populateChainSelectors();
    renderWalletSelector([]);
    renderRpcSelector([]);
    setView("tasks");
  })
  .catch((error) => {
    appendLog(`[error] ${error.message}`);
  });
