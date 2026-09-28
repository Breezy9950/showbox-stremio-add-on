import { getStore } from "@netlify/blobs";

const CONFIG_STORE = "showbox-configs";

function getConfigStore() {
  return getStore({
    name: CONFIG_STORE,
    consistency: "strong"
  });
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
  if (!id || typeof id !== "string") {
    return null;
  }

  if (!/^[a-f0-9]{32}$/i.test(id)) {
    return null;
  }

  const store = getConfigStore();

  return await store.get(id, {
    type: "json",
    consistency: "strong"
  });
}

export async function saveConfig(id, config) {
  if (!id || !/^[a-f0-9]{32}$/i.test(id)) {
    throw new Error("Invalid configuration ID");
  }

  const store = getConfigStore();

  await store.setJSON(id, config);
}
