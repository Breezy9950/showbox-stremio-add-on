import {
  createConfig,
  getConfig,
  saveConfig
} from "./config-store.js";

const DEFAULT_QUALITIES = [
  { name: "ORG", enabled: true },
  { name: "4K", enabled: true },
  { name: "1440p", enabled: true },
  { name: "1080p", enabled: true },
  { name: "720p", enabled: true },
  { name: "480p", enabled: true },
  { name: "360p", enabled: true }
];

const DEFAULT_FILTERS = {
  cam: true
};

const MAX_CONFIG_BODY_BYTES = 16 * 1024;
const MAX_QUALITY_ITEMS = 20;
const MAX_FILE_SIZE_GB = 200;
const CONFIGURE_SESSION_MS = 60 * 60 * 1000;

function decodeConfig(value) {
  try {
    if (!value) {
      return {};
    }

    let base64 = value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    while (base64.length % 4) {
      base64 += "=";
    }

    const json = Buffer.from(
      base64,
      "base64"
    ).toString("utf8");

    return JSON.parse(json);
  } catch {
    return {};
  }
}

function normalizeQualities(qualities) {
  if (!Array.isArray(qualities)) {
    return DEFAULT_QUALITIES.map(item => ({
      ...item
    }));
  }

  const allowed = new Set(
    DEFAULT_QUALITIES.map(
      item => item.name
    )
  );

  const result = DEFAULT_QUALITIES.map(
    item => ({
      name: item.name,
      enabled: item.enabled
    })
  );

  for (const item of qualities) {
    if (
      !item ||
      typeof item !== "object" ||
      !allowed.has(item.name)
    ) {
      continue;
    }

    const target = result.find(
      quality =>
        quality.name === item.name
    );

    if (target) {
      target.enabled =
        item.enabled !== false;
    }
  }

  const ordered = [];

  for (const item of qualities) {
    if (
      !item ||
      typeof item !== "object" ||
      !allowed.has(item.name)
    ) {
      continue;
    }

    const target = result.find(
      quality =>
        quality.name === item.name
    );

    if (
      target &&
      !ordered.some(
        quality =>
          quality.name === target.name
      )
    ) {
      ordered.push(target);
    }
  }

  for (const item of result) {
    if (
      !ordered.some(
        quality =>
          quality.name === item.name
      )
    ) {
      ordered.push(item);
    }
  }

  return ordered;
}

function normalizeFilters(filters) {
  if (
    !filters ||
    typeof filters !== "object" ||
    Array.isArray(filters)
  ) {
    return {
      ...DEFAULT_FILTERS
    };
  }

  return {
    cam: filters.cam !== false
  };
}

function normalizeFileSize(fileSize) {
  if (
    !fileSize ||
    typeof fileSize !== "object" ||
    Array.isArray(fileSize)
  ) {
    return {
      minGb: null,
      maxGb: null
    };
  }

  const min =
    fileSize.minGb === null ||
    fileSize.minGb === undefined ||
    fileSize.minGb === ""
      ? null
      : Number(fileSize.minGb);

  const max =
    fileSize.maxGb === null ||
    fileSize.maxGb === undefined ||
    fileSize.maxGb === ""
      ? null
      : Number(fileSize.maxGb);

  return {
    minGb: Number.isFinite(min)
      ? min
      : null,

    maxGb: Number.isFinite(max)
      ? max
      : null
  };
}

function validateFileSize(fileSize) {
  if (
    !fileSize ||
    typeof fileSize !== "object" ||
    Array.isArray(fileSize)
  ) {
    return {
      minGb: null,
      maxGb: null
    };
  }

  const min =
    fileSize.minGb === null ||
    fileSize.minGb === undefined ||
    fileSize.minGb === ""
      ? null
      : Number(fileSize.minGb);

  const max =
    fileSize.maxGb === null ||
    fileSize.maxGb === undefined ||
    fileSize.maxGb === ""
      ? null
      : Number(fileSize.maxGb);

  if (
    min !== null &&
    !Number.isFinite(min)
  ) {
    throw new Error(
      "Invalid minimum file size"
    );
  }

  if (
    max !== null &&
    !Number.isFinite(max)
  ) {
    throw new Error(
      "Invalid maximum file size"
    );
  }

  if (
    min !== null &&
    (
      min < 0 ||
      min > MAX_FILE_SIZE_GB
    )
  ) {
    throw new Error(
      "Minimum file size must be between 0 and 200 GB"
    );
  }

  if (
    max !== null &&
    (
      max < 0 ||
      max > MAX_FILE_SIZE_GB
    )
  ) {
    throw new Error(
      "Maximum file size must be between 0 and 200 GB"
    );
  }

  if (
    min !== null &&
    max !== null &&
    min > max
  ) {
    throw new Error(
      "Minimum size cannot be greater than maximum size"
    );
  }

  return {
    minGb: min,
    maxGb: max
  };
}

async function getConfigFromRequest(request) {
  const url = new URL(request.url);

  const pathname =
    url.pathname.replace(
      /\/+$/,
      ""
    );

  let configValue = null;

  let match = pathname.match(
    /^\/configure\/([^/]+)$/
  );

  if (match) {
    configValue = match[1];
  }

  if (!configValue) {
    match = pathname.match(
      /^\/([^/]+)\/configure$/
    );

    if (match) {
      configValue = match[1];
    }
  }

  if (!configValue) {
    return null;
  }

  const storedConfig =
    await getConfig(configValue);

  if (
    storedConfig &&
    typeof storedConfig === "object" &&
    !Array.isArray(storedConfig)
  ) {
    return {
      id: configValue,
      config: storedConfig,
      legacy: false
    };
  }

  const legacyConfig =
    decodeConfig(configValue);

  if (
    !legacyConfig ||
    typeof legacyConfig !== "object" ||
    Array.isArray(legacyConfig) ||
    Object.keys(legacyConfig).length === 0
  ) {
    return null;
  }

  return {
    id: null,
    config: legacyConfig,
    legacy: true
  };
}

export const config = {
  path: [
    "/configure/:config",
    "/:config/configure"
  ]
};

export default async function handler(request) {
  const configData =
    await getConfigFromRequest(request);

  const existingConfig =
    configData?.config || null;

  const configId =
    configData?.id || null;

  if (!existingConfig) {
    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <meta
    name="theme-color"
    content="#111"
  >

  <title>ShowBox Configure</title>

  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #111;
      color: #fff;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .card {
      width: min(560px, 100%);
      padding: 28px;
      border-radius: 18px;
      background: #17181d;
      border: 1px solid #24252c;
      text-align: center;
    }

    h2 {
      margin: 0 0 10px;
    }

    p {
      margin: 0;
      color: #999ba3;
      line-height: 1.5;
    }
  </style>
</head>

<body>
  <div class="card">
    <h2>Invalid configuration</h2>

    <p>
      This Configure page must be opened using
      an existing addon configuration.
    </p>
  </div>
</body>
</html>`,
      {
        status: 400,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer"
        }
      }
    );
  }

  const uiToken =
    typeof existingConfig.uiToken === "string"
      ? existingConfig.uiToken
      : "";

  const qualities =
    normalizeQualities(
      existingConfig.qualities
    );

  const fileSize =
    normalizeFileSize(
      existingConfig.fileSize
    );

  const filters =
    normalizeFilters(
      existingConfig.filters
    );

  if (request.method === "POST") {
    try {
      const requestBody =
        await request.text();

      if (
        new TextEncoder()
          .encode(requestBody)
          .byteLength >
        MAX_CONFIG_BODY_BYTES
      ) {
        return new Response(
          JSON.stringify({
            error:
              "Configuration request is too large"
          }),
          {
            status: 413,
            headers: {
              "Content-Type":
                "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
              "Referrer-Policy": "no-referrer"
            }
          }
        );
      }

      let body;

      try {
        body = JSON.parse(requestBody);
      } catch {
        throw new Error(
          "Invalid JSON"
        );
      }

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {
        throw new Error(
          "Invalid configuration"
        );
      }

      if (
        Array.isArray(body.qualities) &&
        body.qualities.length >
          MAX_QUALITY_ITEMS
      ) {
        throw new Error(
          "Too many quality entries"
        );
      }

      const newQualities =
        normalizeQualities(
          body.qualities
        );

      const newFileSize =
        validateFileSize(
          body.fileSize
        );

      const newFilters =
        normalizeFilters(
          body.filters
        );

      const newConfig = {
        ...existingConfig,
        uiToken,
        fileSize: newFileSize,
        qualities: newQualities.map(
          item => ({
            name: item.name,
            enabled: item.enabled
          })
        ),
        filters: newFilters
      };

      const requestUrl =
        new URL(request.url);

      let finalConfigId =
        configId;

      if (!finalConfigId) {
        finalConfigId =
          await createConfig(
            newConfig
          );
      } else {
        await saveConfig(
          finalConfigId,
          newConfig
        );
      }

      const manifestUrl =
        `${requestUrl.origin}/${finalConfigId}/manifest.json`;

      return new Response(
        JSON.stringify({
          manifestUrl
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer"
          }
        }
      );
    } catch (error) {
      console.error(
        "[Configure] Save error:",
        error?.message
      );

      const message =
        error?.message ||
        "Invalid configuration";

      const status =
        message ===
        "Configuration request is too large"
          ? 413
          : 400;

      return new Response(
        JSON.stringify({
          error: message
        }),
        {
          status,
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer"
          }
        }
      );
    }
  }

  const publicConfig = {
    qualities,
    fileSize,
    filters
  };

  const qualitiesJson =
    JSON.stringify(
      publicConfig.qualities
    )
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

  const fileSizeJson =
    JSON.stringify(
      publicConfig.fileSize
    )
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

  const filtersJson =
    JSON.stringify(
      publicConfig.filters
    )
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  >

  <meta
    name="theme-color"
    content="#111"
  >

  <title>ShowBox Configure</title>

  <style>
    :root {
      color-scheme: dark;

      --bg: #111;
      --surface: #17181d;
      --surface-2: #20222a;
      --surface-3: #2b2d36;

      --border: #24252c;
      --border-light: #303139;

      --text: #fff;
      --text-soft: #ddd;
      --muted: #9b9ca3;
      --muted-2: #8f9098;

      --white: #fff;
      --black: #111;

      --success: #a7e3b1;
      --error: #ff9b9b;

      --radius-lg: 18px;
      --radius-md: 14px;
      --radius-sm: 11px;
    }

    * {
      box-sizing: border-box;
    }

    html {
      background: var(--bg);
    }

    body {
      margin: 0;
      min-height: 100vh;
      padding: 40px 16px 60px;

      background:
        radial-gradient(
          circle at 50% -15%,
          rgba(255,255,255,.045),
          transparent 38%
        ),
        var(--bg);

      color: var(--text);

      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "SF Pro Display",
        "SF Pro Text",
        "Segoe UI",
        sans-serif;

      -webkit-font-smoothing: antialiased;
    }

    .container {
      width: min(560px, 100%);
      margin: auto;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 29px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: -.7px;
    }

    .subtitle {
      margin: 0 0 28px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }

    .card {
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .card + .card {
      margin-top: 16px;
    }

    .card-title {
      margin-bottom: 6px;
      color: var(--text);
      font-size: 17px;
      font-weight: 650;
    }

    .card-description {
      margin-bottom: 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .size-row {
      display: flex;
      gap: 12px;
    }

    .size-field {
      flex: 1 1 0;
      min-width: 0;
    }

    label {
      display: block;
      margin-bottom: 7px;
      color: #a5a6ae;
      font-size: 13px;
    }

    input[type="number"] {
      width: 100%;
      height: 45px;
      padding: 0 13px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      outline: none;
      background: var(--surface-2);
      color: var(--text);
      font-size: 15px;
    }

    input[type="number"]:focus {
      border-color: #62646e;
    }

    input[type="number"]::placeholder {
      color: var(--muted-2);
    }

    .file-size-error {
      min-height: 18px;
      margin-top: 10px;
      color: var(--error);
      font-size: 13px;
      line-height: 1.45;
    }

    .quality-list,
    .filter-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .quality-row,
    .filter-row {
      display: flex;
      align-items: center;
      min-height: 48px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--surface-2);
    }

    .quality-row {
      gap: 12px;
    }

    .quality-checkbox,
    .filter-checkbox {
      flex: 0 0 auto;
      width: 19px;
      height: 19px;
      margin: 0;
      accent-color: var(--white);
    }

    .quality-name {
      flex: 1;
      color: var(--text);
      font-size: 15px;
      font-weight: 500;
    }

    .quality-controls {
      display: flex;
      gap: 6px;
    }

    .quality-controls button {
      width: 34px;
      height: 34px;
      padding: 0;
      border: 0;
      border-radius: 9px;
      background: var(--surface-3);
      color: var(--text-soft);
      font-size: 17px;
      cursor: pointer;
    }

    .quality-controls button:hover {
      background: #353741;
    }

    .quality-controls button:active {
      transform: scale(.95);
    }

    .quality-controls button:disabled {
      opacity: .3;
      cursor: default;
    }

    .filter-label {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      color: var(--text);
      font-size: 15px;
      cursor: pointer;
    }

    .main-button {
      width: 100%;
      height: 50px;
      margin-top: 18px;
      padding: 0 20px;
      border: 0;
      border-radius: 13px;
      background: var(--white);
      color: var(--black);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition:
        opacity .15s ease,
        transform .12s ease;
    }

    .main-button:hover {
      opacity: .9;
    }

    .main-button:active {
      transform: scale(.985);
    }

    .main-button:disabled {
      opacity: .5;
      cursor: default;
    }

    .status {
      min-height: 18px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .status.success {
      color: var(--success);
    }

    .status.error {
      color: var(--error);
    }

    .result {
      margin-top: 28px;
    }

    .result-label {
      display: block;
      margin-bottom: 9px;
      color: var(--muted-2);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .result-row {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: 8px;
      width: 100%;
    }

    #manifestUrl {
      flex: 1 1 auto;
      min-width: 0;
      width: 0;
      height: 50px;
      padding: 0 12px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      outline: none;
      background: var(--surface-2);
      color: var(--text-soft);
      font-size: 11px;
    }

    #copyButton {
      flex: 0 0 72px;
      width: 72px;
      height: 50px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: var(--surface-3);
      color: var(--text);
      font-size: 12px;
      font-weight: 650;
      cursor: pointer;
    }

    #copyButton:hover {
      background: #353741;
    }

    #installButton {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 50px;
      margin-top: 10px;
      padding: 0 16px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      background: var(--white);
      color: var(--black);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity .15s ease;
    }

    #installButton:hover {
      opacity: .9;
    }

    .note {
      margin-top: 12px;
      color: var(--muted-2);
      font-size: 11px;
      line-height: 1.5;
    }

    @media (max-width: 600px) {
      body {
        padding: 38px 12px 60px;
      }

      h1 {
        font-size: 27px;
      }

      .size-row {
        gap: 9px;
      }

      .result-row {
        flex-direction: row;
        gap: 8px;
      }

      #manifestUrl {
        flex: 1 1 auto;
        width: 0;
        min-width: 0;
      }

      #copyButton {
        flex: 0 0 72px;
        width: 72px;
      }
    }
  </style>
</head>

<body>
  <div class="container">
    <h1>ShowBox Configure</h1>

    <p class="subtitle">
      Configure your stream preferences.
    </p>

    <div class="card">
      <div class="card-title">
        File size
      </div>

      <div class="card-description">
        Only show files within the selected size range.
        Leave a field empty for no limit.
      </div>

      <div class="size-row">
        <div class="size-field">
          <label for="minSize">
            Minimum (GB)
          </label>

          <input
            id="minSize"
            type="number"
            min="0"
            max="200"
            step="0.1"
            placeholder="No minimum"
          >
        </div>

        <div class="size-field">
          <label for="maxSize">
            Maximum (GB)
          </label>

          <input
            id="maxSize"
            type="number"
            min="0"
            max="200"
            step="0.1"
            placeholder="No maximum"
          >
        </div>
      </div>

      <div
        id="fileSizeError"
        class="file-size-error"
      ></div>
    </div>

    <div class="card">
      <div class="card-title">
        Quality
      </div>

      <div class="card-description">
        Enable the qualities you want and use
        the arrows to change their priority.
      </div>

      <div
        id="qualityList"
        class="quality-list"
      ></div>
    </div>

    <div class="card">
      <div class="card-title">
        Stream filters
      </div>

      <div class="card-description">
        Enable the stream types you want to keep.
        These settings do not change quality priority.
      </div>

      <div class="filter-list">
        <div class="filter-row">
          <label class="filter-label">
            <input
              id="camFilter"
              class="filter-checkbox"
              type="checkbox"
            >

            <span>CAM</span>
          </label>
        </div>
      </div>
    </div>

    <button
      id="save"
      class="main-button"
      type="button"
    >
      Save configuration
    </button>

    <div
      id="status"
      class="status"
    ></div>

    <div
      id="result"
      class="result"
    >
      <span class="result-label">
        Manifest URL
      </span>

      <div class="result-row">
        <input
          id="manifestUrl"
          type="text"
          readonly
        >

        <button
          id="copyButton"
          type="button"
        >
          Copy
        </button>
      </div>

      <button
        id="installButton"
        type="button"
      >
        Install in Stremio
      </button>

      <div class="note">
        On iOS/iPadOS, if Stremio does not open automatically,
        copy the manifest URL and add it manually through
        Stremio's Add-ons page.
      </div>
    </div>
  </div>

  <script>
    const qualities = ${qualitiesJson};
    const fileSize = ${fileSizeJson};
    const filters = ${filtersJson};

    const SESSION_DURATION = ${CONFIGURE_SESSION_MS};
    const sessionStartedAt = Date.now();
    let sessionExpired = false;
    let sessionTimer = null;

    const qualityList =
      document.getElementById("qualityList");

    const minSizeInput =
      document.getElementById("minSize");

    const maxSizeInput =
      document.getElementById("maxSize");

    const fileSizeError =
      document.getElementById("fileSizeError");

    const camFilter =
      document.getElementById("camFilter");

    const saveButton =
      document.getElementById("save");

    const status =
      document.getElementById("status");

    const result =
      document.getElementById("result");

    const manifestUrl =
      document.getElementById("manifestUrl");

    const copyButton =
      document.getElementById("copyButton");

    const installButton =
      document.getElementById("installButton");

    function expireSession() {
      if (sessionExpired) {
        return;
      }

      sessionExpired = true;

      if (sessionTimer) {
        clearTimeout(sessionTimer);
        sessionTimer = null;
      }

      document.body.innerHTML = "";

      const wrapper =
        document.createElement("div");

      wrapper.style.cssText =
        "min-height:100vh;" +
        "display:flex;" +
        "align-items:center;" +
        "justify-content:center;" +
        "padding:24px;" +
        "background:#111;" +
        "color:#fff;" +
        "font-family:-apple-system,BlinkMacSystemFont," +
        "\"Segoe UI\",sans-serif;";

      const card =
        document.createElement("div");

      card.style.cssText =
        "width:min(460px,100%);" +
        "padding:28px;" +
        "border:1px solid #24252c;" +
        "border-radius:18px;" +
        "background:#17181d;" +
        "text-align:center;";

      const title =
        document.createElement("h1");

      title.textContent =
        "Configure session expired";

      title.style.cssText =
        "margin:0 0 10px;" +
        "font-size:24px;";

      const message =
        document.createElement("p");

      message.textContent =
        "This Configure page expired after one hour. " +
        "Open Configure again from Stremio to start a new session.";

      message.style.cssText =
        "margin:0;" +
        "color:#999ba3;" +
        "font-size:14px;" +
        "line-height:1.5;";

      card.appendChild(title);
      card.appendChild(message);
      wrapper.appendChild(card);
      document.body.appendChild(wrapper);

      try {
        window.close();
      } catch {}
    }

    function checkSession() {
      if (
        Date.now() - sessionStartedAt >=
        SESSION_DURATION
      ) {
        expireSession();
      }
    }

    sessionTimer = setTimeout(
      expireSession,
      SESSION_DURATION
    );

    document.addEventListener(
      "visibilitychange",
      checkSession
    );

    window.addEventListener(
      "focus",
      checkSession
    );

    function renderQualities() {
      qualityList.innerHTML = "";

      qualities.forEach(
        (quality, index) => {
          const row =
            document.createElement("div");

          row.className =
            "quality-row";

          const checkbox =
            document.createElement("input");

          checkbox.type = "checkbox";
          checkbox.className =
            "quality-checkbox";
          checkbox.checked =
            quality.enabled;

          checkbox.addEventListener(
            "change",
            () => {
              quality.enabled =
                checkbox.checked;

              settingsChanged();
            }
          );

          const name =
            document.createElement("div");

          name.className =
            "quality-name";

          name.textContent =
            quality.name;

          const controls =
            document.createElement("div");

          controls.className =
            "quality-controls";

          const up =
            document.createElement("button");

          up.type = "button";
          up.textContent = "↑";
          up.disabled = index === 0;

          up.addEventListener(
            "click",
            () => {
              if (index === 0) {
                return;
              }

              const temp =
                qualities[index - 1];

              qualities[index - 1] =
                qualities[index];

              qualities[index] =
                temp;

              settingsChanged();
              renderQualities();
            }
          );

          const down =
            document.createElement("button");

          down.type = "button";
          down.textContent = "↓";

          down.disabled =
            index ===
            qualities.length - 1;

          down.addEventListener(
            "click",
            () => {
              if (
                index ===
                qualities.length - 1
              ) {
                return;
              }

              const temp =
                qualities[index + 1];

              qualities[index + 1] =
                qualities[index];

              qualities[index] =
                temp;

              settingsChanged();
              renderQualities();
            }
          );

          controls.appendChild(up);
          controls.appendChild(down);

          row.appendChild(checkbox);
          row.appendChild(name);
          row.appendChild(controls);

          qualityList.appendChild(row);
        }
      );
    }

    function showStatus(
      message,
      type
    ) {
      status.textContent =
        message;

      status.className =
        type
          ? "status " + type
          : "status";
    }

    function settingsChanged() {
      showStatus(
        "Settings changed. Save again to update the addon."
      );
    }

    function getFileSizeConfig() {
      const minValue =
        minSizeInput.value.trim();

      const maxValue =
        maxSizeInput.value.trim();

      return {
        minGb:
          minValue === ""
            ? null
            : Number(minValue),

        maxGb:
          maxValue === ""
            ? null
            : Number(maxValue)
      };
    }

    function validateFileSizeInputs() {
      const current =
        getFileSizeConfig();

      let error = "";

      if (
        current.minGb !== null &&
        (
          !Number.isFinite(
            current.minGb
          ) ||
          current.minGb < 0 ||
          current.minGb > 200
        )
      ) {
        error =
          "Minimum size must be between 0 and 200 GB.";
      } else if (
        current.maxGb !== null &&
        (
          !Number.isFinite(
            current.maxGb
          ) ||
          current.maxGb < 0 ||
          current.maxGb > 200
        )
      ) {
        error =
          "Maximum size must be between 0 and 200 GB.";
      } else if (
        current.minGb !== null &&
        current.maxGb !== null &&
        current.minGb >
          current.maxGb
      ) {
        error =
          "Minimum size cannot be greater than maximum size.";
      }

      fileSizeError.textContent =
        error;

      if (error) {
        showStatus(
          error,
          "error"
        );

        return false;
      }

      return true;
    }

    async function saveConfiguration() {
      checkSession();

      if (sessionExpired) {
        return;
      }

      if (!validateFileSizeInputs()) {
        return;
      }

      const fileSize =
        getFileSizeConfig();

      saveButton.disabled = true;
      saveButton.textContent = "Saving...";

      const config = {
        qualities:
          qualities.map(item => ({
            name: item.name,
            enabled: item.enabled
          })),

        fileSize,

        filters: {
          cam: camFilter.checked
        }
      };

      try {
        const response =
          await fetch(
            window.location.pathname,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(config)
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.manifestUrl
        ) {
          throw new Error(
            data.error ||
            "Failed to save configuration"
          );
        }

        manifestUrl.value =
          data.manifestUrl;

        result.classList.add(
          "visible"
        );

        showStatus(
          "Configuration saved.",
          "success"
        );

        window.scrollTo({
          top:
            document.body.scrollHeight,
          behavior:
            "smooth"
        });
      } catch (error) {
        console.error(
          "[Configure] Save failed:",
          error?.message
        );

        showStatus(
          error.message ||
          "Something went wrong.",
          "error"
        );
      } finally {
        saveButton.disabled = false;
        saveButton.textContent =
          "Save configuration";
      }
    }

    minSizeInput.addEventListener(
      "input",
      () => {
        validateFileSizeInputs();

        if (!fileSizeError.textContent) {
          settingsChanged();
        }
      }
    );

    maxSizeInput.addEventListener(
      "input",
      () => {
        validateFileSizeInputs();

        if (!fileSizeError.textContent) {
          settingsChanged();
        }
      }
    );

    camFilter.addEventListener(
      "change",
      () => {
        settingsChanged();
      }
    );

    copyButton.addEventListener(
      "click",
      async () => {
        const url =
          manifestUrl.value;

        if (!url) {
          return;
        }

        try {
          await navigator.clipboard.writeText(
            url
          );

          copyButton.textContent =
            "Copied!";

          setTimeout(
            () => {
              copyButton.textContent =
                "Copy";
            },
            1500
          );
        } catch {
          manifestUrl.focus();
          manifestUrl.select();

          try {
            document.execCommand(
              "copy"
            );

            copyButton.textContent =
              "Copied!";

            setTimeout(
              () => {
                copyButton.textContent =
                  "Copy";
              },
              1500
            );
          } catch {
            showStatus(
              "Copy failed. Select the URL manually.",
              "error"
            );
          }
        }
      }
    );

    installButton.addEventListener(
      "click",
      () => {
        const url =
          manifestUrl.value;

        if (!url) {
          return;
        }

        const stremioUrl =
          "stremio://" +
          url.replace(
            /^https?:\/\//,
            ""
          );

        window.location.href =
          stremioUrl;
      }
    );

    if (fileSize.minGb !== null) {
      minSizeInput.value =
        fileSize.minGb;
    }

    if (fileSize.maxGb !== null) {
      maxSizeInput.value =
        fileSize.maxGb;
    }

    camFilter.checked =
      filters.cam !== false;

    renderQualities();

    saveButton.addEventListener(
      "click",
      saveConfiguration
    );

    validateFileSizeInputs();
  </script>
</body>
</html>`;

  return new Response(
    html,
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      }
    }
  );
}
