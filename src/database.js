const { Pool } = require("pg");

function createDefaultPersistentState() {
  return {
    tasks: [],
    rpcNodes: [],
    settings: {
      profileName: "local",
      theme: "quantum-operator",
      resultsPath: "./dist/mint-results.json"
    }
  };
}

function normalizePersistentState(state) {
  const fallback = createDefaultPersistentState();
  const source = state && typeof state === "object" ? state : {};

  return {
    tasks: Array.isArray(source.tasks) ? source.tasks : [],
    rpcNodes: Array.isArray(source.rpcNodes) ? source.rpcNodes : [],
    settings: {
      ...fallback.settings,
      ...(source.settings && typeof source.settings === "object" ? source.settings : {})
    }
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

  async function close() {
    await pool.end();
  }

  return {
    close,
    createSession,
    deleteExpiredSessions,
    deleteSessionByTokenHash,
    deleteWallet,
    ensureBaseState,
    ensureSchema,
    findWalletByAddress,
    getSessionByTokenHash,
    getStoredWalletSecret,
    getUserByUsername,
    insertWallet,
    listUsers,
    listWallets,
    loadState,
    saveState,
    touchSession,
    upsertUser
  };
}

module.exports = {
  createDatabase,
  createDefaultPersistentState,
  normalizePersistentState
};
