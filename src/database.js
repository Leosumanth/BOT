const { Pool } = require("pg");
const { createDefaultDashboardSettings, normalizeDashboardSettings } = require("./integrations");

function createDefaultPersistentState() {
  return {
    tasks: [],
    rpcNodes: [],
    settings: createDefaultDashboardSettings()
  };
}

function normalizePersistentState(state) {
  const fallback = createDefaultPersistentState();
  const source = state && typeof state === "object" ? state : {};

  return {
    tasks: Array.isArray(source.tasks) ? source.tasks : [],
    rpcNodes: Array.isArray(source.rpcNodes) ? source.rpcNodes : [],
    settings: normalizeDashboardSettings(source.settings)
  };
}

function mapWalletRow(row) {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    addressShort: row.address_short,
    group: row.wallet_group,
    status: row.status,
    source: row.source,
    hasSecret: Boolean(row.secret_ciphertext),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function mapUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function mapTaskRuntimeRow(row) {
  if (!row) {
    return null;
  }

  return {
    taskId: row.task_id,
    status: row.status,
    progress: row.progress || null,
    summary: row.summary || null,
    active: Boolean(row.active),
    queued: Boolean(row.queued),
    error: row.error || null,
    workerId: row.worker_id || null,
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    lastRunAt: row.last_run_at instanceof Date ? row.last_run_at.toISOString() : row.last_run_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function mapTaskHistoryRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    taskId: row.task_id,
    ranAt: row.ran_at instanceof Date ? row.ran_at.toISOString() : row.ran_at,
    summary: row.summary || {}
  };
}

function shouldUseSsl(connectionString) {
  if (process.env.DATABASE_SSL === "false" || process.env.PGSSLMODE === "disable") {
    return false;
  }

  return !/localhost|127\.0\.0\.1/i.test(connectionString || "");
}

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run the secure dashboard");
  }

  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false
  });

  async function query(text, params = []) {
    return pool.query(text, params);
  }

  async function ensureSchema() {
    await query(`
      create table if not exists app_state (
        id integer primary key,
        state jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists wallets (
        id text primary key,
        label text not null,
        address text not null unique,
        address_short text not null,
        secret_ciphertext text not null,
        wallet_group text not null default 'Imported',
        status text not null default 'ready',
        source text not null default 'stored',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists users (
        id text primary key,
        username text not null unique,
        password_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists sessions (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        created_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists app_secrets (
        secret_key text primary key,
        secret_ciphertext text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists task_runtime (
        task_id text primary key,
        status text not null,
        progress jsonb not null default '{"phase":"Ready","percent":0}'::jsonb,
        summary jsonb not null default '{"total":0,"success":0,"failed":0,"stopped":0,"hashes":[]}'::jsonb,
        active boolean not null default false,
        queued boolean not null default false,
        error text,
        worker_id text,
        started_at timestamptz,
        last_run_at timestamptz,
        updated_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists task_history (
        id text primary key,
        task_id text not null,
        ran_at timestamptz not null,
        summary jsonb not null,
        created_at timestamptz not null default now()
      )
    `);
  }

  async function ensureBaseState() {
    await query(
      `
        insert into app_state (id, state)
        values (1, $1::jsonb)
        on conflict (id) do nothing
      `,
      [JSON.stringify(createDefaultPersistentState())]
    );
  }

  async function loadState() {
    const result = await query("select state from app_state where id = 1");
    if (!result.rows[0]) {
      return createDefaultPersistentState();
    }

    return normalizePersistentState(result.rows[0].state);
  }

  async function saveState(state) {
    const normalized = normalizePersistentState(state);
    await query(
      `
        insert into app_state (id, state, updated_at)
        values (1, $1::jsonb, now())
        on conflict (id)
        do update set state = excluded.state, updated_at = now()
      `,
      [JSON.stringify(normalized)]
    );
    return normalized;
  }

  async function listWallets() {
    const result = await query(
      `
        select id, label, address, address_short, wallet_group, status, source, secret_ciphertext, created_at, updated_at
        from wallets
        order by created_at asc
      `
    );

    return result.rows.map(mapWalletRow);
  }

  async function getStoredWalletSecret(id) {
    const result = await query(
      `
        select id, secret_ciphertext
        from wallets
        where id = $1
      `,
      [id]
    );

    return result.rows[0] || null;
  }

  async function findWalletByAddress(address) {
    const result = await query(
      `
        select id, label, address, address_short, wallet_group, status, source, secret_ciphertext, created_at, updated_at
        from wallets
        where lower(address) = lower($1)
        limit 1
      `,
      [address]
    );

    return result.rows[0] ? mapWalletRow(result.rows[0]) : null;
  }

  async function insertWallet(wallet) {
    await query(
      `
        insert into wallets (
          id,
          label,
          address,
          address_short,
          secret_ciphertext,
          wallet_group,
          status,
          source,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
      `,
      [
        wallet.id,
        wallet.label,
        wallet.address,
        wallet.addressShort,
        wallet.secretCiphertext,
        wallet.group,
        wallet.status,
        wallet.source,
        wallet.createdAt,
        wallet.updatedAt
      ]
    );
  }

  async function deleteWallet(id) {
    const result = await query("delete from wallets where id = $1", [id]);
    return result.rowCount > 0;
  }

  async function listUsers() {
    const result = await query(
      `
        select id, username, password_hash, created_at, updated_at
        from users
        order by created_at asc
      `
    );

    return result.rows.map(mapUserRow);
  }

  async function getUserByUsername(username) {
    const result = await query(
      `
        select id, username, password_hash, created_at, updated_at
        from users
        where lower(username) = lower($1)
        limit 1
      `,
      [username]
    );

    return mapUserRow(result.rows[0]);
  }

  async function upsertUser(user) {
    const result = await query(
      `
        insert into users (id, username, password_hash, created_at, updated_at)
        values ($1, $2, $3, now(), now())
        on conflict (username)
        do update set password_hash = excluded.password_hash, updated_at = now()
        returning id, username, password_hash, created_at, updated_at
      `,
      [user.id, user.username, user.passwordHash]
    );

    return mapUserRow(result.rows[0]);
  }

  async function createSession(session) {
    await query(
      `
        insert into sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
        values ($1, $2, $3, $4::timestamptz, now(), now())
      `,
      [session.id, session.userId, session.tokenHash, session.expiresAt]
    );
  }

  async function getSessionByTokenHash(tokenHash) {
    const result = await query(
      `
        select
          sessions.id,
          sessions.user_id,
          sessions.expires_at,
          sessions.last_seen_at,
          users.username
        from sessions
        join users on users.id = sessions.user_id
        where sessions.token_hash = $1
          and sessions.expires_at > now()
        limit 1
      `,
      [tokenHash]
    );

    return result.rows[0] || null;
  }

  async function touchSession(sessionId) {
    await query(
      `
        update sessions
        set last_seen_at = now()
        where id = $1
      `,
      [sessionId]
    );
  }

  async function deleteSessionByTokenHash(tokenHash) {
    await query("delete from sessions where token_hash = $1", [tokenHash]);
  }

  async function deleteExpiredSessions() {
    await query("delete from sessions where expires_at <= now()");
  }

  async function getSecret(secretKey) {
    const result = await query(
      `
        select secret_ciphertext
        from app_secrets
        where secret_key = $1
        limit 1
      `,
      [secretKey]
    );

    return result.rows[0]?.secret_ciphertext || null;
  }

  async function upsertSecret(secretKey, secretCiphertext) {
    await query(
      `
        insert into app_secrets (secret_key, secret_ciphertext, created_at, updated_at)
        values ($1, $2, now(), now())
        on conflict (secret_key)
        do update set secret_ciphertext = excluded.secret_ciphertext, updated_at = now()
      `,
      [secretKey, secretCiphertext]
    );
  }

  async function deleteSecret(secretKey) {
    await query("delete from app_secrets where secret_key = $1", [secretKey]);
  }

  async function listTaskRuntime(taskIds = null) {
    if (Array.isArray(taskIds) && taskIds.length === 0) {
      return [];
    }

    const result = Array.isArray(taskIds)
      ? await query(
          `
            select
              task_id,
              status,
              progress,
              summary,
              active,
              queued,
              error,
              worker_id,
              started_at,
              last_run_at,
              updated_at
            from task_runtime
            where task_id = any($1::text[])
            order by updated_at desc
          `,
          [taskIds]
        )
      : await query(`
          select
            task_id,
            status,
            progress,
            summary,
            active,
            queued,
            error,
            worker_id,
            started_at,
            last_run_at,
            updated_at
          from task_runtime
          order by updated_at desc
        `);

    return result.rows.map(mapTaskRuntimeRow);
  }

  async function getTaskRuntime(taskId) {
    const result = await query(
      `
        select
          task_id,
          status,
          progress,
          summary,
          active,
          queued,
          error,
          worker_id,
          started_at,
          last_run_at,
          updated_at
        from task_runtime
        where task_id = $1
        limit 1
      `,
      [taskId]
    );

    return mapTaskRuntimeRow(result.rows[0]);
  }

  async function upsertTaskRuntime(runtime) {
    const result = await query(
      `
        insert into task_runtime (
          task_id,
          status,
          progress,
          summary,
          active,
          queued,
          error,
          worker_id,
          started_at,
          last_run_at,
          updated_at
        )
        values (
          $1,
          $2,
          $3::jsonb,
          $4::jsonb,
          $5,
          $6,
          $7,
          $8,
          $9::timestamptz,
          $10::timestamptz,
          now()
        )
        on conflict (task_id)
        do update set
          status = excluded.status,
          progress = excluded.progress,
          summary = excluded.summary,
          active = excluded.active,
          queued = excluded.queued,
          error = excluded.error,
          worker_id = excluded.worker_id,
          started_at = excluded.started_at,
          last_run_at = excluded.last_run_at,
          updated_at = now()
        returning
          task_id,
          status,
          progress,
          summary,
          active,
          queued,
          error,
          worker_id,
          started_at,
          last_run_at,
          updated_at
      `,
      [
        runtime.taskId,
        runtime.status,
        JSON.stringify(runtime.progress || { phase: "Ready", percent: 0 }),
        JSON.stringify(
          runtime.summary || { total: 0, success: 0, failed: 0, stopped: 0, hashes: [] }
        ),
        runtime.active === true,
        runtime.queued === true,
        runtime.error || null,
        runtime.workerId || null,
        runtime.startedAt || null,
        runtime.lastRunAt || null
      ]
    );

    return mapTaskRuntimeRow(result.rows[0]);
  }

  async function clearTaskRuntime(taskId) {
    await query("delete from task_runtime where task_id = $1", [taskId]);
  }

  async function listTaskHistory(taskIds = null, limitPerTask = 8) {
    if (Array.isArray(taskIds) && taskIds.length === 0) {
      return [];
    }

    const result = Array.isArray(taskIds)
      ? await query(
          `
            select id, task_id, ran_at, summary
            from task_history
            where task_id = any($1::text[])
            order by ran_at desc
          `,
          [taskIds]
        )
      : await query(`
          select id, task_id, ran_at, summary
          from task_history
          order by ran_at desc
        `);

    const grouped = new Map();

    for (const row of result.rows.map(mapTaskHistoryRow)) {
      const bucket = grouped.get(row.taskId) || [];
      if (bucket.length >= limitPerTask) {
        continue;
      }

      bucket.push(row);
      grouped.set(row.taskId, bucket);
    }

    return [...grouped.values()].flat();
  }

  async function insertTaskHistory(entry) {
    const result = await query(
      `
        insert into task_history (id, task_id, ran_at, summary, created_at)
        values ($1, $2, $3::timestamptz, $4::jsonb, now())
        returning id, task_id, ran_at, summary
      `,
      [entry.id, entry.taskId, entry.ranAt, JSON.stringify(entry.summary || {})]
    );

    return mapTaskHistoryRow(result.rows[0]);
  }

  async function pruneTaskHistory(taskId, keep = 8) {
    await query(
      `
        delete from task_history
        where task_id = $1
          and id not in (
            select id
            from task_history
            where task_id = $1
            order by ran_at desc
            limit $2
          )
      `,
      [taskId, keep]
    );
  }

  async function deleteTaskArtifacts(taskId) {
    await query("delete from task_runtime where task_id = $1", [taskId]);
    await query("delete from task_history where task_id = $1", [taskId]);
  }

  async function close() {
    await pool.end();
  }

  return {
    close,
    createSession,
    deleteExpiredSessions,
    deleteSessionByTokenHash,
    deleteTaskArtifacts,
    deleteWallet,
    ensureBaseState,
    ensureSchema,
    findWalletByAddress,
    getTaskRuntime,
    getSecret,
    getSessionByTokenHash,
    getStoredWalletSecret,
    getUserByUsername,
    insertWallet,
    insertTaskHistory,
    listTaskHistory,
    listTaskRuntime,
    listUsers,
    listWallets,
    loadState,
    pruneTaskHistory,
    saveState,
    touchSession,
    upsertTaskRuntime,
    upsertSecret,
    deleteSecret,
    upsertUser
  };
}

module.exports = {
  createDatabase,
  createDefaultPersistentState,
  normalizePersistentState
};
