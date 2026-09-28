import { getStore } from "@netlify/blobs";

const CONFIG_STORE = "showbox-configs";
const CONFIGURE_SESSION_STORE = "showbox-configure-sessions";

const SESSION_IDLE_MS = 5 * 60 * 1000;
const SESSION_TOTAL_IDLE_MS = 10 * 60 * 1000;

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

  const session = await store.get(id, {
    type: "json",
    consistency: "strong"
  });

  if (!session || typeof session !== "object") {
    return null;
  }

  if (session.state === "expired") {
    return {
      ...session,
      state: "expired"
    };
  }

  const lastActivityAt = Number(session.lastActivityAt);

  if (!Number.isFinite(lastActivityAt)) {
    return null;
  }

  const idle = Date.now() - lastActivityAt;

  if (idle >= SESSION_TOTAL_IDLE_MS) {
    const expired = {
      ...session,
      state: "expired",
      expiredAt: Date.now()
    };

    await store.setJSON(id, expired);

    return expired;
  }

  return {
    ...session,
    state: idle >= SESSION_IDLE_MS ? "warning" : "active"
  };
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

  const lastActivityAt = Number(session.lastActivityAt);

  if (!Number.isFinite(lastActivityAt)) {
    return {
      ok: false,
      state: "invalid"
    };
  }

  const now = Date.now();
  const idle = now - lastActivityAt;

  if (idle >= SESSION_TOTAL_IDLE_MS) {
    await store.setJSON(id, {
      ...session,
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
    lastActivityAt: now,
    state: "active"
  });

  return {
    ok: true,
    state: "active",
    lastActivityAt: now
  };
}
