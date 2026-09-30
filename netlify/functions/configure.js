import {
  createConfig,
  getConfig,
  saveConfig,
  createConfigureSession,
  getConfigureSession
} from "./config-store.js";

const DEFAULT_QUALITIES = [
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];

const MAX_CONFIG_BODY_BYTES =
  16 * 1024;

const MAX_QUALITY_ITEMS =
  DEFAULT_QUALITIES.length;

const MAX_FILE_SIZE_GB = 200;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function decodeConfig(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getConfigIdFromRequest(request) {
  const url = new URL(request.url);

  const direct =
    url.pathname.match(/^\/configure\/([^/]+)\/?$/);

  if (direct?.[1]) {
    return direct[1];
  }

  const alternate =
    url.pathname.match(/^\/([^/]+)\/configure\/?$/);

  if (alternate?.[1]) {
    return alternate[1];
  }

  return null;
}

async function getConfigFromRequest(request) {
  const configId =
    getConfigIdFromRequest(request);

  if (!configId) {
    return {
      configId: null,
      config: null
    };
  }

  const config =
    await getConfig(configId);

  return {
    configId,
    config
  };
}

function normalizeQualities(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_QUALITIES.map(name => ({
      name,
      enabled: true
    }));
  }

  const result = [];

  for (const item of value) {
    let name;
    let enabled = true;

    if (typeof item === "string") {
      name = item;
    } else if (
      item &&
      typeof item === "object"
    ) {
      name = item.name;
      enabled = item.enabled !== false;
    }

    if (
      typeof name !== "string" ||
      !DEFAULT_QUALITIES.includes(name)
    ) {
      continue;
    }

    if (
      result.some(item => item.name === name)
    ) {
      continue;
    }

    result.push({
      name,
      enabled
    });

    if (result.length >= MAX_QUALITY_ITEMS) {
      break;
    }
  }

  for (const name of DEFAULT_QUALITIES) {
    if (
      !result.some(item => item.name === name)
    ) {
      result.push({
        name,
        enabled: true
      });
    }
  }

  return result.slice(0, MAX_QUALITY_ITEMS);
}

function normalizeFileSize(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return {
      minGb: 0,
      maxGb: MAX_FILE_SIZE_GB
    };
  }

  const minGb =
    Number.isFinite(Number(value.minGb))
      ? Number(value.minGb)
      : 0;

  const maxGb =
    Number.isFinite(Number(value.maxGb))
      ? Number(value.maxGb)
      : MAX_FILE_SIZE_GB;

  return {
    minGb,
    maxGb
  };
}

function validateFileSize(fileSize) {
  if (
    !fileSize ||
    typeof fileSize !== "object"
  ) {
    return false;
  }

  const minGb = Number(fileSize.minGb);
  const maxGb = Number(fileSize.maxGb);

  if (
    !Number.isFinite(minGb) ||
    !Number.isFinite(maxGb)
  ) {
    return false;
  }

  if (minGb < 0 || maxGb < 0) {
    return false;
  }

  if (minGb > MAX_FILE_SIZE_GB) {
    return false;
  }

  if (maxGb > MAX_FILE_SIZE_GB) {
    return false;
  }

  if (minGb > maxGb) {
    return false;
  }

  return true;
}

function normalizeFilters(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return {
      cam: false
    };
  }

  return {
    cam: value.cam === true
  };
}

function expiredResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function invalidConfigResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function qualityRows(qualities) {
  return qualities.map((quality, index) => `
    <div
      class="quality-row"
      data-quality="${quality.name}"
      draggable="true"
    >
      <div class="quality-left">
        <span class="drag-handle">☷</span>
        <span class="quality-name">${quality.name}</span>
      </div>

      <label class="switch">
        <input
          type="checkbox"
          class="quality-toggle"
          data-quality="${quality.name}"
          ${quality.enabled ? "checked" : ""}
        >
        <span class="slider"></span>
      </label>
    </div>
  `).join("");
}

function filterRows(filters) {
  return `
    <div class="filter-row">
      <div>
        <div class="filter-title">CAM</div>
        <div class="filter-description">
          Exclude cam / low-quality releases
        </div>
      </div>

      <label class="switch">
        <input
          type="checkbox"
          id="cam-filter"
          ${filters.cam ? "checked" : ""}
        >
        <span class="slider"></span>
      </label>
    </div>
  `;
}

function clientScript() {
  return `
(() => {
  const dataElement =
    document.getElementById("showbox-config-data");

  if (!dataElement) {
    return;
  }

  let data;

  try {
    data = JSON.parse(dataElement.textContent);
  } catch {
    window.location.replace(
      "/__showbox_configure_expired__"
    );
    return;
  }

  const sessionId =
    typeof data.sessionId === "string"
      ? data.sessionId
      : "";

  const remainingMs =
    Number(data.remainingMs);

  if (
    !sessionId ||
    !Number.isFinite(remainingMs) ||
    remainingMs <= 0
  ) {
    window.location.replace(
      "/__showbox_configure_expired__"
    );
    return;
  }

  const expiresAt =
    Number(data.expiresAt);

  const deadline =
    Number.isFinite(expiresAt)
      ? expiresAt
      : Date.now() + remainingMs;

  let expired = false;

  function expire() {
    if (expired) {
      return;
    }

    expired = true;

    window.location.replace(
      "/__showbox_configure_expired__"
    );
  }

  const timerDelay =
    Math.max(0, deadline - Date.now());

  window.setTimeout(expire, timerDelay);

  window.addEventListener(
    "pageshow",
    () => {
      if (Date.now() >= deadline) {
        expire();
      }
    }
  );

  const saveButton =
    document.getElementById("save-configuration");

  const status =
    document.getElementById("save-status");

  const manifestInput =
    document.getElementById("manifest-url");

  const copyButton =
    document.getElementById("copy-manifest");

  const installLink =
    document.getElementById("install-manifest");

  const minInput =
    document.getElementById("min-size");

  const maxInput =
    document.getElementById("max-size");

  function getQualities() {
    return Array.from(
      document.querySelectorAll(".quality-row")
    ).map(row => {
      const name =
        row.dataset.quality;

      const checkbox =
        row.querySelector(".quality-toggle");

      return {
        name,
        enabled: checkbox
          ? checkbox.checked
          : true
      };
    });
  }

  function getFilters() {
    const checkbox =
      document.getElementById("cam-filter");

    return {
      cam: checkbox
        ? checkbox.checked
        : false
    };
  }

  function getFileSize() {
    return {
      minGb: Number(minInput.value),
      maxGb: Number(maxInput.value)
    };
  }

  function setStatus(message, error = false) {
    if (!status) {
      return;
    }

    status.textContent = message;
    status.classList.toggle(
      "error",
      error
    );
  }

  if (saveButton) {
    saveButton.addEventListener(
      "click",
      async () => {
        if (Date.now() >= deadline) {
          expire();
          return;
        }

        saveButton.disabled = true;

        setStatus("Saving...");

        try {
          const response =
            await fetch(
              window.location.pathname +
              window.location.search,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json"
                },
                body: JSON.stringify({
                  action: "save",
                  sessionId,
                  fileSize: getFileSize(),
                  qualities: getQualities(),
                  filters: getFilters()
                })
              }
            );

          if (
            response.status === 404 ||
            response.status === 410
          ) {
            expire();
            return;
          }

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result?.error ||
              "Unable to save configuration"
            );
          }

          if (
            manifestInput &&
            result.manifestUrl
          ) {
            manifestInput.value =
              result.manifestUrl;
          }

          if (
            installLink &&
            result.installUrl
          ) {
            installLink.href =
              result.installUrl;
          }

          setStatus(
            "Configuration saved"
          );
        } catch (error) {
          setStatus(
            error?.message ||
            "Unable to save configuration",
            true
          );
        } finally {
          saveButton.disabled = false;
        }
      }
    );
  }

  if (copyButton && manifestInput) {
    copyButton.addEventListener(
      "click",
      async () => {
        try {
          await navigator.clipboard.writeText(
            manifestInput.value
          );

          setStatus(
            "Manifest URL copied"
          );
        } catch {
          manifestInput.select();
          document.execCommand("copy");

          setStatus(
            "Manifest URL copied"
          );
        }
      }
    );
  }

  const qualityContainer =
    document.getElementById(
      "quality-list"
    );

  if (qualityContainer) {
    let dragged = null;

    qualityContainer
      .querySelectorAll(".quality-row")
      .forEach(row => {
        row.addEventListener(
          "dragstart",
          event => {
            dragged = row;

            row.classList.add(
              "dragging"
            );

            event.dataTransfer.effectAllowed =
              "move";
          }
        );

        row.addEventListener(
          "dragend",
          () => {
            row.classList.remove(
              "dragging"
            );

            dragged = null;
          }
        );

        row.addEventListener(
          "dragover",
          event => {
            event.preventDefault();

            if (
              !dragged ||
              dragged === row
            ) {
              return;
            }

            const rect =
              row.getBoundingClientRect();

            const before =
              event.clientY <
              rect.top +
              rect.height / 2;

            if (before) {
              qualityContainer.insertBefore(
                dragged,
                row
              );
            } else {
              qualityContainer.insertBefore(
                dragged,
                row.nextSibling
              );
            }
          }
        );
      });
  }

  if (minInput && maxInput) {
    function clampSizes() {
      let min =
        Number(minInput.value);

      let max =
        Number(maxInput.value);

      if (!Number.isFinite(min)) {
        min = 0;
      }

      if (!Number.isFinite(max)) {
        max = ${MAX_FILE_SIZE_GB};
      }

      min = Math.max(
        0,
        Math.min(
          ${MAX_FILE_SIZE_GB},
          min
        )
      );

      max = Math.max(
        0,
        Math.min(
          ${MAX_FILE_SIZE_GB},
          max
        )
      );

      if (min > max) {
        if (
          document.activeElement ===
          minInput
        ) {
          max = min;
        } else {
          min = max;
        }
      }

      minInput.value = min;
      maxInput.value = max;
    }

    minInput.addEventListener(
      "change",
      clampSizes
    );

    maxInput.addEventListener(
      "change",
      clampSizes
    );
  }
})();
`;
}

function html({
  configId,
  config,
  sessionId,
  remainingMs,
  expiresAt
}) {
  const qualities =
    normalizeQualities(
      config?.qualities
    );

  const fileSize =
    normalizeFileSize(
      config?.fileSize
    );

  const filters =
    normalizeFilters(
      config?.filters
    );

  const manifestUrl =
    `/manifest.json?config=${encodeURIComponent(
      configId
    )}`;

  const installUrl =
    `stremio://${manifestUrl}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
  <title>ShowBox Configuration</title>

  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: #0b0b0f;
      color: #f5f5f7;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    body {
      padding: 32px 18px 48px;
    }

    .container {
      width: min(720px, 100%);
      margin: 0 auto;
    }

    .title {
      font-size: 30px;
      font-weight: 700;
      letter-spacing: -0.6px;
      margin-bottom: 28px;
    }

    .section {
      margin-bottom: 28px;
    }

    .section-title {
      font-size: 17px;
      font-weight: 650;
      margin-bottom: 12px;
    }

    .card {
      background: #151519;
      border: 1px solid #29292f;
      border-radius: 16px;
      overflow: hidden;
    }

    .size-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding: 16px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .field label {
      font-size: 13px;
      color: #a5a5ad;
    }

    .field input {
      width: 100%;
      border: 1px solid #303038;
      background: #0f0f13;
      color: #fff;
      border-radius: 10px;
      padding: 12px;
      font-size: 15px;
      outline: none;
    }

    .field input:focus {
      border-color: #66666f;
    }

    .quality-row,
    .filter-row {
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #29292f;
    }

    .quality-row:last-child,
    .filter-row:last-child {
      border-bottom: 0;
    }

    .quality-row.dragging {
      opacity: 0.45;
    }

    .quality-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .drag-handle {
      color: #777780;
      font-size: 22px;
      cursor: grab;
      line-height: 1;
    }

    .quality-name {
      font-size: 15px;
      font-weight: 500;
    }

    .filter-title {
      font-size: 15px;
      font-weight: 500;
    }

    .filter-description {
      color: #85858d;
      font-size: 13px;
      margin-top: 3px;
    }

    .switch {
      position: relative;
      width: 48px;
      height: 28px;
      flex: 0 0 auto;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: #36363d;
      cursor: pointer;
      transition: 0.18s ease;
    }

    .slider::before {
      content: "";
      position: absolute;
      width: 22px;
      height: 22px;
      left: 3px;
      top: 3px;
      border-radius: 50%;
      background: white;
      transition: 0.18s ease;
    }

    .switch input:checked + .slider {
      background: #ffffff;
    }

    .switch input:checked + .slider::before {
      background: #111115;
      transform: translateX(20px);
    }

    .save-button {
      width: 100%;
      border: 0;
      border-radius: 13px;
      padding: 14px 18px;
      background: #ffffff;
      color: #111115;
      font-size: 15px;
      font-weight: 650;
      cursor: pointer;
    }

    .save-button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .status {
      min-height: 22px;
      margin-top: 10px;
      color: #8f8f98;
      font-size: 13px;
    }

    .status.error {
      color: #ff7b7b;
    }

    .manifest-row {
      display: flex;
      gap: 8px;
      padding: 16px;
    }

    .manifest-row input {
      min-width: 0;
      flex: 1;
      border: 1px solid #303038;
      background: #0f0f13;
      color: #cfcfd5;
      border-radius: 10px;
      padding: 12px;
      font-size: 13px;
      outline: none;
    }

    .small-button {
      border: 1px solid #303038;
      background: #202027;
      color: #fff;
      border-radius: 10px;
      padding: 0 14px;
      cursor: pointer;
      white-space: nowrap;
    }

    .install {
      display: block;
      margin: 0 16px 16px;
      padding: 13px;
      border-radius: 11px;
      text-align: center;
      text-decoration: none;
      background: #202027;
      color: #fff;
      border: 1px solid #303038;
      font-size: 14px;
    }

    @media (max-width: 520px) {
      body {
        padding: 24px 14px 40px;
      }

      .title {
        font-size: 27px;
      }

      .size-row {
        grid-template-columns: 1fr;
      }

      .manifest-row {
        flex-direction: column;
      }

      .small-button {
        min-height: 42px;
      }
    }
  </style>
</head>

<body>
  <div class="container">

    <div class="title">
      Settings
    </div>

    <div class="section">
      <div class="section-title">
        File size
      </div>

      <div class="card">
        <div class="size-row">
          <div class="field">
            <label for="min-size">
              Minimum (GB)
            </label>

            <input
              id="min-size"
              type="number"
              min="0"
              max="${MAX_FILE_SIZE_GB}"
              step="0.1"
              value="${fileSize.minGb}"
            >
          </div>

          <div class="field">
            <label for="max-size">
              Maximum (GB)
            </label>

            <input
              id="max-size"
              type="number"
              min="0"
              max="${MAX_FILE_SIZE_GB}"
              step="0.1"
              value="${fileSize.maxGb}"
            >
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        Quality settings
      </div>

      <div
        class="card"
        id="quality-list"
      >
        ${qualityRows(qualities)}
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        Stream filters
      </div>

      <div class="card">
        ${filterRows(filters)}
      </div>
    </div>

    <div class="section">
      <button
        class="save-button"
        id="save-configuration"
      >
        Save Configuration
      </button>

      <div
        class="status"
        id="save-status"
      ></div>
    </div>

    <div class="section">
      <div class="section-title">
        Manifest URL
      </div>

      <div class="card">
        <div class="manifest-row">
          <input
            id="manifest-url"
            readonly
            value="${manifestUrl}"
          >

          <button
            class="small-button"
            id="copy-manifest"
          >
            Copy
          </button>
        </div>

        <a
          class="install"
          id="install-manifest"
          href="${installUrl}"
        >
          Install
        </a>
      </div>
    </div>

  </div>

  <script
    type="application/json"
    id="showbox-config-data"
  >${JSON.stringify({
    sessionId,
    remainingMs,
    expiresAt
  })}</script>

  <script src="/configure-client.js"></script>
</body>
</html>`;
}

export const config = {
  method: ["GET", "POST"],
  path: [
    "/configure/:config",
    "/:config/configure",
    "/configure-client.js"
  ]
};

export default async function handler(request) {
  const url =
    new URL(request.url);

  /*
   * Serve the external client script first.
   */
  if (
    url.pathname ===
    "/configure-client.js"
  ) {
    return new Response(
      clientScript(),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/javascript; charset=utf-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff",
          "Referrer-Policy":
            "no-referrer"
        }
      }
    );
  }

  const {
    configId,
    config
  } = await getConfigFromRequest(
    request
  );

  if (!configId || !config) {
    return invalidConfigResponse();
  }

  /*
   * The Configure session belongs to the
   * URL/tab, not to a shared cookie.
   */
  const urlSessionId =
    url.searchParams.get(
      "__showbox_session"
    );

  /*
   * POST / save
   */
  if (request.method === "POST") {
    const contentLength =
      Number(
        request.headers.get(
          "content-length"
        ) || 0
      );

    if (
      contentLength >
      MAX_CONFIG_BODY_BYTES
    ) {
      return jsonResponse(
        {
          error:
            "Request body too large"
        },
        413
      );
    }

    let body;

    try {
      body =
        await request.json();
    } catch {
      return jsonResponse(
        {
          error:
            "Invalid JSON"
        },
        400
      );
    }

    if (
      !body ||
      body.action !== "save"
    ) {
      return jsonResponse(
        {
          error:
            "Invalid action"
        },
        400
      );
    }

    const bodySessionId =
      typeof body.sessionId === "string"
        ? body.sessionId
        : "";

    /*
     * Both the URL session and body session
     * must match. This prevents one tab from
     * submitting another tab's session.
     */
    if (
      !urlSessionId ||
      !bodySessionId ||
      urlSessionId !== bodySessionId
    ) {
      return expiredResponse();
    }

    const session =
      await getConfigureSession(
        urlSessionId
      );

    if (!session) {
      return expiredResponse();
    }

    const fileSize =
      normalizeFileSize(
        body.fileSize
      );

    if (
      !validateFileSize(
        fileSize
      )
    ) {
      return jsonResponse(
        {
          error:
            "Invalid file size"
        },
        400
      );
    }

    const qualities =
      normalizeQualities(
        body.qualities
      );

    const filters =
      normalizeFilters(
        body.filters
      );

    const updatedConfig = {
      ...config,
      fileSize,
      qualities,
      filters
    };

    await saveConfig(
      configId,
      updatedConfig
    );

    const manifestUrl =
      `/manifest.json?config=${encodeURIComponent(
        configId
      )}`;

    return jsonResponse({
      success: true,
      manifestUrl,
      installUrl:
        `stremio://${manifestUrl}`
    });
  }

  /*
   * GET without a session:
   *
   * Create a brand-new session and redirect
   * to a URL containing that session ID.
   *
   * This is what makes each browser tab
   * independent.
   */
  if (!urlSessionId) {
    const session =
      await createConfigureSession();

    url.searchParams.set(
      "__showbox_session",
      session.id
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location:
          url.toString(),
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff",
        "Referrer-Policy":
          "no-referrer"
      }
    });
  }

  /*
   * Existing session URL:
   * never create a replacement session.
   *
   * If it expired, this exact tab gets 404.
   */
  const session =
    await getConfigureSession(
      urlSessionId
    );

  if (!session) {
    return expiredResponse();
  }

  const remainingMs =
    Math.max(
      0,
      Number(session.expiresAt) -
      Date.now()
    );

  if (remainingMs <= 0) {
    return expiredResponse();
  }

  return new Response(
    html({
      configId,
      config,
      sessionId: urlSessionId,
      remainingMs,
      expiresAt:
        Number(session.expiresAt)
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/html; charset=utf-8",
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff",
        "Referrer-Policy":
          "no-referrer"
      }
    }
  );
}
