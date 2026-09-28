import { getStore } from "@netlify/blobs";

const CONFIG_STORE = "showbox-configs";
const CONFIGURE_SESSION_STORE = "showbox-configure-sessions";
const CHECK_INTERVAL_MS = 150 * 1000;

function getConfigStore() {
  return getStore({
    name: CONFIG_STORE,
    consistency: "strong"
  });
}

function getConfigureSessionStore() {
  return getStore({
    name: CONFIGURE_SESSION_STORE,
    consistency: "strong"
  });
}

function validId(id) {
  return typeof id === "string" && /^[a-f0-9]{32}$/i.test(id);
}

export async function createConfig(config) {
  const store = getConfigStore();
  const id = crypto.randomUUID().replace(/-/g, "");

  await store.setJSON(id, config, {
    onlyIfNew: true
  });

  return id;
}

export async function getConfig(id) {
  if (!validId(id)) {
    return null;
  }

  const store = getConfigStore();

  return await store.get(id, {
    type: "json",
    consistency: "strong"
  });
}

export async function saveConfig(id, config) {
  if (!validId(id)) {
    throw new Error("Invalid configuration ID");
  }

  const store = getConfigStore();

  await store.setJSON(id, config);
}

export async function createConfigureSession() {
  const store = getConfigureSessionStore();
  const id = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();

  await store.setJSON(
    id,
    {
      createdAt: now,
      lastActivityAt: now,
      missedChecks: 0,
      state: "active"
    },
    {
      onlyIfNew: true
    }
  );

  return {
    id,
    createdAt: now
  };
}

export async function getConfigureSession(id) {
  if (!validId(id)) {
    return null;
  }

  const store = getConfigureSessionStore();

  return await store.get(id, {
    type: "json",
    consistency: "strong"
  });
}

export async function recordConfigureActivity(id) {
  if (!validId(id)) {
    return {
      ok: false,
      state: "invalid"
    };
  }

  const store = getConfigureSessionStore();

  const session = await store.get(id, {
    type: "json",
    consistency: "strong"
  });

  if (!session || typeof session !== "object") {
    return {
      ok: false,
      state: "invalid"
    };
  }

  if (session.state === "expired") {
    return {
      ok: false,
      state: "expired"
    };
  }

  const now = Date.now();

  await store.setJSON(id, {
    ...session,
    lastActivityAt: now,
    missedChecks: 0,
    state: "active"
  });

  return {
    ok: true,
    state: "active",
    lastActivityAt: now
  };
}

export async function checkConfigureSession(id) {
  if (!validId(id)) {
    return {
      ok: false,
      state: "invalid"
    };
  }

  const store = getConfigureSessionStore();

  const session = await store.get(id, {
    type: "json",
    consistency: "strong"
  });

  if (!session || typeof session !== "object") {
    return {
      ok: false,
      state: "invalid"
    };
  }

  if (session.state === "expired") {
    return {
      ok: false,
      state: "expired"
    };
  }

  const now = Date.now();
  const lastActivityAt = Number(session.lastActivityAt);

  if (!Number.isFinite(lastActivityAt)) {
    return {
      ok: false,
      state: "invalid"
    };
  }

  const elapsed = now - lastActivityAt;

  if (elapsed < CHECK_INTERVAL_MS) {
    return {
      ok: true,
      state: "active",
      missedChecks: 0
    };
  }

  const missedChecks =
    Number(session.missedChecks) || 0;

  const nextMissedChecks =
    missedChecks + 1;

  if (nextMissedChecks >= 2) {
    await store.setJSON(id, {
      ...session,
      missedChecks: nextMissedChecks,
      state: "expired",
      expiredAt: now
    });

    return {
      ok: false,
      state: "expired"
    };
  }

  await store.setJSON(id, {
    ...session,
    missedChecks: nextMissedChecks,
    state: "warning"
  });

  return {
    ok: true,
    state: "warning",
    missedChecks: nextMissedChecks
  };
}
