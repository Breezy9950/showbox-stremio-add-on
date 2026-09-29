import {
  createConfig,
  getConfig,
  saveConfig,
  createConfigureSession,
  getConfigureSession
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

const MAX_CONFIG_BODY_BYTES = 16 * 1024;
const MAX_QUALITY_ITEMS = DEFAULT_QUALITIES.length;
const MAX_FILE_SIZE_GB = 200;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function decodeConfig(value) {
  try {
    if (!value) {
      return {};
    }

    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");

    while (base64.length % 4) {
      base64 += "=";
    }

    let jsonStr = "";

    if (typeof Buffer !== "undefined") {
      jsonStr = Buffer.from(base64, "base64").toString("utf8");
    } else if (typeof atob !== "undefined") {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      jsonStr = new TextDecoder().decode(bytes);
    } else {
      return {};
    }

    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

function normalizeQualities(qualities) {
  if (!Array.isArray(qualities)) {
    return DEFAULT_QUALITIES.map((item) => ({ ...item }));
  }

  const allowed = new Map(
    DEFAULT_QUALITIES.map((item) => [item.name, item])
  );

  const result = [];
  const used = new Set();

  for (const item of qualities) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      !allowed.has(item.name) ||
      used.has(item.name)
    ) {
      continue;
    }

    result.push({
      name: item.name,
      enabled: item.enabled !== false
    });

    used.add(item.name);

    if (result.length >= MAX_QUALITY_ITEMS) {
      break;
    }
  }

  for (const item of DEFAULT_QUALITIES) {
    if (!used.has(item.name)) {
      result.push({ ...item });
    }
  }

  return result;
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return { cam: true };
  }

  return {
    cam: filters.cam !== false
  };
}

function normalizeFileSize(fileSize) {
  if (!fileSize || typeof fileSize !== "object" || Array.isArray(fileSize)) {
    return {
      minGb: null,
      maxGb: null
    };
  }

  const parseValue = (val) => {
    if (val === null || val === undefined || val === "") {
      return null;
    }

    const num = Number(val);

    return Number.isFinite(num) ? num : NaN;
  };

  return {
    minGb: parseValue(fileSize.minGb),
    maxGb: parseValue(fileSize.maxGb)
  };
}

function validateFileSize(fileSize) {
  const normalized = normalizeFileSize(fileSize);

  if (
    normalized.minGb !== null &&
    (Number.isNaN(normalized.minGb) ||
      normalized.minGb < 0 ||
      normalized.minGb > MAX_FILE_SIZE_GB)
  ) {
    throw new Error("Minimum size must be between 0 and 200 GB.");
  }

  if (
    normalized.maxGb !== null &&
    (Number.isNaN(normalized.maxGb) ||
      normalized.maxGb < 0 ||
      normalized.maxGb > MAX_FILE_SIZE_GB)
  ) {
    throw new Error("Maximum size must be between 0 and 200 GB.");
  }

  if (
    normalized.minGb !== null &&
    normalized.maxGb !== null &&
    normalized.minGb > normalized.maxGb
  ) {
    throw new Error("Minimum size cannot be greater than maximum size.");
  }

  return normalized;
}

function getConfigIdFromRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "");

  const match =
    pathname.match(/^\/configure\/([^/]+)$/) ||
    pathname.match(/^\/([^/]+)\/configure$/);

  return match ? decodeURIComponent(match[1]) : null;
}

async function getConfigFromRequest(request) {
  const configValue = getConfigIdFromRequest(request);

  if (!configValue) {
    return null;
  }

  const stored = await getConfig(configValue);

  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    return {
      id: configValue,
      config: stored
    };
  }

  const legacy = decodeConfig(configValue);

  if (
    !legacy ||
    typeof legacy !== "object" ||
    Array.isArray(legacy) ||
    !Object.keys(legacy).length
  ) {
    return null;
  }

  return {
    id: null,
    config: legacy
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
  return new Response(
    `
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShowBox</title>
<style>
*{box-sizing:border-box;}
body{margin:0;padding:32px 16px;background:#0d0e11;color:#f1f1f3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
.card{width:min(560px,100%);margin:auto;padding:28px;border-radius:18px;background:#17181d;}
p{color:#aaa;line-height:1.5;}
</style>
</head>
<body>
<div class="card">
<h2>Invalid configuration</h2>
<p>This Configure page must be opened using an existing addon configuration.</p>
</div>
</body>
</html>
`,
    {
      status: 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      }
    }
  );
}

function safeJsonStringify(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export const config = {
  method: ["GET", "POST"],
  path: ["/configure/:config", "/:config/configure"]
};

export default async function handler(request) {
  const url = new URL(request.url);

  if (request.method === "POST") {
    try {
      const contentLength = request.headers.get("content-length");

      if (
        contentLength &&
        Number.isFinite(Number(contentLength)) &&
        Number(contentLength) > MAX_CONFIG_BODY_BYTES
      ) {
        return jsonResponse(
          { error: "Configuration request is too large" },
          413
        );
      }

      const requestBody = await request.text();

      if (
        new TextEncoder().encode(requestBody).byteLength > MAX_CONFIG_BODY_BYTES
      ) {
        return jsonResponse(
          { error: "Configuration request is too large" },
          413
        );
      }

      let body;

      try {
        body = JSON.parse(requestBody);
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse({ error: "Invalid configuration" }, 400);
      }

      if (body.action !== "save") {
        return jsonResponse({ error: "Invalid configuration action" }, 400);
      }

      const sessionId =
        typeof body.sessionId === "string" ? body.sessionId : "";

      if (!sessionId) {
        return jsonResponse({ error: "Configure session is invalid" }, 403);
      }

      const activeSession = await getConfigureSession(sessionId);

      if (!activeSession) {
        return expiredResponse();
      }

      const configData = await getConfigFromRequest(request);

      if (!configData) {
        return jsonResponse(
          { error: "Invalid addon configuration context" },
          400
        );
      }

      const configId = configData.id;
      const existingConfig = configData.config;

      if (
        Array.isArray(body.qualities) &&
        body.qualities.length > MAX_QUALITY_ITEMS
      ) {
        throw new Error("Too many quality entries");
      }

      const qualities = normalizeQualities(body.qualities);

      if (!qualities.some((item) => item.enabled)) {
        throw new Error("Enable at least one quality.");
      }

      const fileSize = validateFileSize(body.fileSize);
      const filters = normalizeFilters(body.filters);

      const uiToken =
        typeof existingConfig.uiToken === "string"
          ? existingConfig.uiToken
          : "";

      if (!uiToken) {
        throw new Error(
          "The existing configuration does not contain a ShowBox UI token."
        );
      }

      const newConfig = {
        ...existingConfig,
        uiToken,
        fileSize,
        qualities,
        filters
      };

      let finalConfigId = configId;

      if (!finalConfigId) {
        finalConfigId = await createConfig(newConfig);
      } else {
        await saveConfig(finalConfigId, newConfig);
      }

      return jsonResponse({
        ok: true,
        configId: finalConfigId,
        manifestUrl: `${url.origin}/${finalConfigId}/manifest.json`,
        stremioUrl: `stremio://${url.host}/${finalConfigId}/manifest.json`
      });
    } catch (error) {
      console.error("[Configure] Save error:", error?.message);

      return jsonResponse(
        {
          error: error?.message || "Failed to save configuration."
        },
        400
      );
    }
  }

  const configData = await getConfigFromRequest(request);

  if (!configData) {
    return invalidConfigResponse();
  }

  const existingConfig = configData.config;

  const session = await createConfigureSession();
  const sessionId = session.id;

  const qualities = normalizeQualities(existingConfig.qualities);
  const fileSize = normalizeFileSize(existingConfig.fileSize);
  const filters = normalizeFilters(existingConfig.filters);

  const qualitiesJson = safeJsonStringify(qualities);
  const fileSizeJson = safeJsonStringify(fileSize);
  const filtersJson = safeJsonStringify(filters);
  const sessionJson = safeJsonStringify(sessionId);
  const expiresAt = Number(session.expiresAt);

  const html = `
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d0e11">
<title>ShowBox</title>

<style>
:root{color-scheme:dark;--bg:#0d0e11;--surface:#15161b;--surface-2:#1d1f25;--input:#252831;--border:#292c34;--border-light:#343740;--text:#f1f1f3;--muted:#858892;--muted-2:#696c75;--white:#f4f4f5;--black:#101115;--success:#a7e3b1;--error:#ff9b9b;}
*{box-sizing:border-box;}
html{background:var(--bg);}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% -15%,rgba(255,255,255,.055),transparent 38%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;}
.container{width:min(clamp(700px,74vw,960px),calc(100% - 28px));margin:auto;padding:20px 0 clamp(50px,6vw,80px);}
.header{margin-bottom:clamp(28px,4vw,40px);}
.header h1{margin:0;color:var(--text);font-size:clamp(40px,5.5vw,58px);line-height:.98;font-weight:700;letter-spacing:-2.5px;}
.section{margin-top:clamp(26px,3.5vw,38px);}
.section:first-of-type{margin-top:0;}
.section-title{margin:0 0 6px;color:var(--text);font-size:clamp(25px,3vw,34px);line-height:1.1;font-weight:700;letter-spacing:-1px;}
.section-description{margin:0 0 clamp(12px,1.5vw,18px);color:var(--muted);font-size:clamp(12px,1.4vw,14px);line-height:1.5;}
.file-size-card{padding:clamp(11px,1.2vw,14px);border:1px solid var(--border);border-radius:clamp(15px,1.8vw,20px);background:var(--surface);}
.file-size-heading{display:flex;align-items:center;gap:12px;padding:4px 7px clamp(9px,1vw,12px);color:var(--muted-2);font-size:clamp(9px,1vw,11px);font-weight:700;letter-spacing:.12em;text-transform:uppercase;}
.file-size-heading svg{width:clamp(17px,1.8vw,22px);height:clamp(17px,1.8vw,22px);flex-shrink:0;}
.file-size-inner{padding:clamp(15px,1.8vw,20px);padding-bottom:4px;border:1px solid var(--border-light);border-radius:clamp(11px,1.4vw,15px);background:var(--surface-2);}
.file-size-inner-header{margin-bottom:clamp(13px,1.6vw,17px);color:var(--text);font-size:clamp(16px,1.8vw,20px);line-height:1.2;font-weight:700;}
.size-row{display:grid;grid-template-columns:1fr 1fr;gap:clamp(9px,1.2vw,12px);}
.size-field label{display:block;margin-bottom:clamp(5px,1vw,7px);color:var(--muted-2);font-size:clamp(10px,1.1vw,12px);}
.size-field input{width:100%;padding:9px clamp(10px,1.3vw,14px);border:1px solid #343740;border-radius:clamp(10px,1.3vw,13px);background:var(--input);color:#fff;font-size:clamp(12px,1.3vw,14px);line-height:1.25;outline:0;}
.size-field input:focus{border-color:#4b4f59;}
.size-field input::placeholder{color:var(--muted-2);}
.file-size-error{min-height:0;margin-top:0;color:var(--error);line-height:1.4;font-size:11px;}
.file-size-error:empty{display:none;}
.file-size-error:not(:empty){margin-top:8px;padding-bottom:4px;}
.quality-card,.filter-card{padding:clamp(10px,1.2vw,13px);border:1px solid var(--border);border-radius:clamp(15px,1.8vw,20px);background:var(--surface);}
.quality-list{display:flex;flex-direction:column;gap:clamp(6px,.9vw,9px);}
.quality-row{display:flex;align-items:center;justify-content:space-between;min-height:clamp(52px,5vw,62px);padding:clamp(9px,1.1vw,12px) clamp(11px,1.3vw,15px);border-radius:clamp(11px,1.3vw,14px);background:var(--surface-2);}
.quality-check{width:clamp(18px,1.8vw,21px);height:clamp(18px,1.8vw,21px);margin:0 clamp(9px,1.2vw,13px) 0 0;flex-shrink:0;}
.quality-name{flex:1;min-width:0;color:#ededf0;font-size:clamp(14px,1.5vw,17px);font-weight:600;}
.quality-controls{display:flex;gap:clamp(5px,.7vw,7px);}
.quality-controls button{width:clamp(32px,3.3vw,40px);height:clamp(32px,3.3vw,40px);padding:0;border:1px solid #343740;border-radius:clamp(9px,1.1vw,11px);background:var(--input);color:#c9cad0;font-size:clamp(13px,1.5vw,16px);cursor:pointer;}
.quality-controls button:disabled{opacity:.3;cursor:default;}
.filter-row{display:flex;align-items:center;min-height:clamp(52px,5vw,62px);padding:clamp(9px,1.1vw,12px) clamp(11px,1.3vw,15px);border-radius:clamp(11px,1.3vw,14px);background:var(--surface-2);}
.filter-label{display:flex;align-items:center;gap:clamp(9px,1.2vw,13px);color:#ededf0;font-size:clamp(14px,1.5vw,17px);font-weight:600;cursor:pointer;}
.filter-label input{width:clamp(18px,1.8vw,21px);height:clamp(18px,1.8vw,21px);margin:0;flex-shrink:0;}
#save{display:flex;align-items:center;justify-content:center;width:100%;height:clamp(46px,4.5vw,54px);margin-top:clamp(20px,2.5vw,28px);padding:0 20px;border:0;border-radius:clamp(12px,1.5vw,15px);background:var(--white);color:var(--black);font-size:clamp(13px,1.4vw,15px);font-weight:700;cursor:pointer;}
#save:disabled{opacity:.55;cursor:default;}
#status{min-height:18px;margin-top:9px;color:var(--muted);font-size:11px;}
#status.success{color:var(--success);}
#status.error{color:var(--error);}
#result{display:none;margin-top:clamp(24px,3vw,32px);}
.result-card{padding:clamp(14px,1.6vw,18px);border:1px solid var(--border);border-radius:clamp(15px,1.8vw,20px);background:var(--surface);}
.result-title{margin-bottom:10px;color:var(--text);font-size:clamp(16px,1.7vw,19px);font-weight:700;}
#manifestUrl{overflow:auto;padding:clamp(11px,1.2vw,14px);border:1px solid #343740;border-radius:clamp(10px,1.3vw,13px);background:var(--surface-2);color:#c9cad0;font-size:clamp(11px,1.1vw,13px);line-height:1.45;word-break:break-all;}
.result-buttons{display:flex;gap:9px;margin-top:10px;}
.result-buttons button{flex:1;height:clamp(42px,4vw,48px);border:0;border-radius:clamp(10px,1.2vw,13px);font-size:clamp(11px,1.2vw,13px);font-weight:700;cursor:pointer;}
.copy{background:var(--input);color:#fff;}
.install{background:var(--white);color:var(--black);}
.note{margin-top:clamp(16px,2vw,22px);color:var(--muted-2);font-size:clamp(9px,1vw,11px);line-height:1.5;}

.debug{
  margin-top:40px;
  padding:16px;
  border:1px solid #343740;
  border-radius:16px;
  background:#101115;
}

.debug-title{
  margin:0 0 8px;
  color:#f1f1f3;
  font-size:16px;
  font-weight:700;
}

.debug-description{
  margin:0 0 12px;
  color:#777b85;
  font-size:11px;
  line-height:1.5;
}

#debugLogs{
  width:100%;
  min-height:300px;
  max-height:600px;
  overflow:auto;
  padding:14px;
  border:1px solid #292c34;
  border-radius:12px;
  background:#090a0d;
  color:#bfc2ca;
  font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;
  font-size:11px;
  line-height:1.6;
  white-space:pre-wrap;
  word-break:break-word;
}

.debug-buttons{
  display:flex;
  gap:8px;
  margin-top:10px;
}

.debug-buttons button{
  flex:1;
  min-height:40px;
  border:1px solid #343740;
  border-radius:10px;
  background:#1d1f25;
  color:#dddfe5;
  font-size:12px;
  font-weight:600;
  cursor:pointer;
}

@media(max-width:600px){
  .container{width:100%;padding:22px 0 48px;}
  .header{margin-bottom:28px;}
  .header h1{font-size:30px;letter-spacing:-1.2px;}
  .section{margin-top:25px;}
  .section-title{margin-bottom:5px;font-size:23px;letter-spacing:-.7px;}
  .section-description{margin-bottom:11px;font-size:11px;}
  .file-size-card,.quality-card,.filter-card{padding:9px;border-radius:14px;}
  .file-size-heading{padding:3px 6px 8px;font-size:10px;}
  .file-size-heading svg{width:18px;height:18px;}
  .file-size-inner{padding:12px;padding-bottom:4px;border-radius:11px;}
  .file-size-inner-header{margin-bottom:12px;font-size:16px;}
  .size-row{gap:8px;}
  .size-field label{margin-bottom:5px;font-size:10px;}
  .size-field input{padding:8px 10px;border-radius:9px;font-size:12px;}
  .quality-list{gap:6px;}
  .quality-row,.filter-row{min-height:47px;padding:8px 10px;border-radius:11px;}
  .quality-check,.filter-label input{width:18px;height:18px;}
  .quality-name,.filter-label{font-size:13px;}
  .quality-controls{gap:5px;}
  .quality-controls button{width:30px;height:30px;border-radius:9px;font-size:13px;}
  #save{height:44px;margin-top:18px;border-radius:12px;font-size:13px;}
  #result{margin-top:22px;}
  .result-card{padding:12px;border-radius:14px;}
  .result-buttons button{height:42px;font-size:11px;}
  .note{font-size:10px;}

  .debug{
    margin-top:30px;
    padding:12px;
    border-radius:13px;
  }

  #debugLogs{
    min-height:280px;
    max-height:500px;
    font-size:10px;
  }
}

@media(max-width:380px){
  .container{padding-left:0;padding-right:0;}
  .header h1{font-size:28px;}
  .section-title{font-size:22px;}
  .file-size-card,.quality-card,.filter-card{padding:8px;}
  .file-size-inner{padding:12px;padding-bottom:4px;}
  .quality-row,.filter-row{padding-left:9px;padding-right:9px;}
  .quality-controls button{width:28px;height:28px;}
}
</style>
</head>

<body>
<div class="container">

<header class="header">
<h1>Settings</h1>
</header>

<section class="section">
<h2 class="section-title">File size</h2>
<p class="section-description">Keep streams between the selected minimum and maximum size.</p>

<div class="file-size-card">
<div class="file-size-heading">
<span>FILE SIZE</span>

<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
<path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>
</svg>
</div>

<div class="file-size-inner">
<div class="file-size-inner-header">Keep streams between</div>

<div class="size-row">
<div class="size-field">
<label for="minSize">Min (GB)</label>
<input id="minSize" type="number" min="0" max="200" step="0.1" placeholder="No minimum">
</div>

<div class="size-field">
<label for="maxSize">Max (GB)</label>
<input id="maxSize" type="number" min="0" max="200" step="0.1" placeholder="No maximum">
</div>
</div>

<div id="fileSizeError" class="file-size-error"></div>
</div>
</div>
</section>

<section class="section">
<h2 class="section-title">Quality settings</h2>
<p class="section-description">Enable the qualities you want. Move them up or down to set their priority.</p>

<div class="quality-card">
<div id="qualityList" class="quality-list"></div>
</div>
</section>

<section class="section">
<h2 class="section-title">Stream filters</h2>
<p class="section-description">Enable the stream types you want to keep. These settings do not change quality priority.</p>

<div class="filter-card">
<div class="filter-row">
<label class="filter-label">
<input id="camFilter" type="checkbox">
<span>CAM</span>
</label>
</div>
</div>
</section>

<button id="save" type="button">Save Configuration</button>

<div id="status"></div>

<div id="result">
<div class="result-card">
<div class="result-title">Manifest URL</div>
<div id="manifestUrl"></div>

<div class="result-buttons">
<button id="copy" class="copy" type="button">Copy</button>
<button id="install" class="install" type="button">Install in Stremio</button>
</div>
</div>
</div>

<div class="note">
On iOS/iPadOS, if Stremio does not open automatically, copy the manifest URL and add it manually through Stremio's Add-ons page.
</div>

<section class="debug">
<h2 class="debug-title">Debug Logs</h2>

<p class="debug-description">
Client-side logs are shown here so you can see exactly what happens when the page initializes and when Save Configuration is pressed.
</p>

<div id="debugLogs"></div>

<div class="debug-buttons">
<button id="clearLogs" type="button">Clear Logs</button>
<button id="testSave" type="button">Test Save Button</button>
</div>
</section>

</div>

<script>
"use strict";

const qualities=${qualitiesJson};
const fileSize=${fileSizeJson};
const filters=${filtersJson};
const sessionId=${sessionJson};
const expiresAt=${expiresAt};

const qualityList=document.getElementById("qualityList");
const minSizeInput=document.getElementById("minSize");
const maxSizeInput=document.getElementById("maxSize");
const fileSizeError=document.getElementById("fileSizeError");
const camFilter=document.getElementById("camFilter");
const saveButton=document.getElementById("save");
const status=document.getElementById("status");
const result=document.getElementById("result");
const manifestUrl=document.getElementById("manifestUrl");
const copyButton=document.getElementById("copy");
const installButton=document.getElementById("install");
const debugLogs=document.getElementById("debugLogs");
const clearLogsButton=document.getElementById("clearLogs");
const testSaveButton=document.getElementById("testSave");

let expired=false;

function debugLog(message,data){
  const time=new Date().toLocaleTimeString();

  let line="[" + time + "] " + message;

  if(data!==undefined){
    try{
      if(typeof data==="string"){
        line+="\n  " + data;
      }else{
        line+="\n  " + JSON.stringify(data,null,2);
      }
    }catch{
      line+="\n  " + String(data);
    }
  }

  console.log("[ShowBox Configure]",message,data);

  if(debugLogs){
    debugLogs.textContent+=line+"\n\n";
    debugLogs.scrollTop=debugLogs.scrollHeight;
  }
}

function debugError(message,error){
  const details=error?.stack || error?.message || String(error);

  debugLog("ERROR: " + message,details);
}

debugLog("Configure script started.");

debugLog("DOM lookup complete.",{
  qualityList:!!qualityList,
  minSizeInput:!!minSizeInput,
  maxSizeInput:!!maxSizeInput,
  fileSizeError:!!fileSizeError,
  camFilter:!!camFilter,
  saveButton:!!saveButton,
  status:!!status,
  result:!!result,
  manifestUrl:!!manifestUrl,
  copyButton:!!copyButton,
  installButton:!!installButton,
  debugLogs:!!debugLogs
});

debugLog("Session information loaded.",{
  sessionId,
  expiresAt,
  expiresInMs:expiresAt-Date.now(),
  expiresInSeconds:Math.round((expiresAt-Date.now())/1000)
});

function setStatus(message,type=""){
  status.textContent=message;
  status.className=type;
}

function expire(){
  if(expired) return;

  debugLog("Configure session expired.");

  expired=true;
  saveButton.disabled=true;

  window.location.replace("/__showbox_configure_expired__");
}

const expirationDelay=Math.max(0,expiresAt-Date.now());

debugLog("Starting expiration timer.",{
  expirationDelay,
  expiresAt
});

setTimeout(expire,expirationDelay);

function renderQualities(){
  debugLog("Rendering quality settings.");

  qualityList.innerHTML="";

  qualities.forEach((quality,index)=>{
    const row=document.createElement("div");
    row.className="quality-row";

    const checkbox=document.createElement("input");
    checkbox.type="checkbox";
    checkbox.className="quality-check";
    checkbox.checked=quality.enabled;

    checkbox.addEventListener("change",()=>{
      quality.enabled=checkbox.checked;

      debugLog("Quality changed.",{
        name:quality.name,
        enabled:quality.enabled
      });

      invalidateResult();
    });

    const name=document.createElement("div");
    name.className="quality-name";
    name.textContent=quality.name;

    const controls=document.createElement("div");
    controls.className="quality-controls";

    const up=document.createElement("button");
    up.type="button";
    up.textContent="↑";
    up.disabled=index===0;

    up.addEventListener("click",()=>{
      if(index<=0) return;

      debugLog("Moving quality up.",quality.name);

      [qualities[index-1],qualities[index]]=[
        qualities[index],
        qualities[index-1]
      ];

      invalidateResult();
      renderQualities();
    });

    const down=document.createElement("button");
    down.type="button";
    down.textContent="↓";
    down.disabled=index===qualities.length-1;

    down.addEventListener("click",()=>{
      if(index>=qualities.length-1) return;

      debugLog("Moving quality down.",quality.name);

      [qualities[index+1],qualities[index]]=[
        qualities[index],
        qualities[index+1]
      ];

      invalidateResult();
      renderQualities();
    });

    controls.append(up,down);
    row.append(checkbox,name,controls);
    qualityList.appendChild(row);
  });

  debugLog("Quality settings rendered.",{
    count:qualities.length
  });
}

function getFileSize(){
  const min=minSizeInput.value.trim();
  const max=maxSizeInput.value.trim();

  return {
    minGb:min==="" ? null : Number(min),
    maxGb:max==="" ? null : Number(max)
  };
}

function validateFileSize(){
  const value=getFileSize();
  let error="";

  if(
    value.minGb!==null &&
    (
      !Number.isFinite(value.minGb) ||
      value.minGb<0 ||
      value.minGb>200
    )
  ){
    error="Minimum size must be between 0 and 200 GB.";
  }else if(
    value.maxGb!==null &&
    (
      !Number.isFinite(value.maxGb) ||
      value.maxGb<0 ||
      value.maxGb>200
    )
  ){
    error="Maximum size must be between 0 and 200 GB.";
  }else if(
    value.minGb!==null &&
    value.maxGb!==null &&
    value.minGb>value.maxGb
  ){
    error="Minimum size cannot be greater than maximum size.";
  }

  fileSizeError.textContent=error;

  return !error;
}

function invalidateResult(){
  result.style.display="none";
  manifestUrl.textContent="";
  setStatus("");
}

async function saveConfiguration(){
  debugLog("SAVE BUTTON HANDLER STARTED.");

  if(expired){
    debugLog("Save aborted: session is already expired.");
    return;
  }

  const remaining=expiresAt-Date.now();

  debugLog("Checking session expiration.",{
    remainingMs:remaining,
    remainingSeconds:Math.round(remaining/1000)
  });

  if(Date.now()>=expiresAt){
    debugLog("Save aborted: session reached expiration.");
    expire();
    return;
  }

  debugLog("Validating file size.");

  if(!validateFileSize()){
    debugLog("Save aborted: invalid file size.",{
      fileSize:getFileSize()
    });

    return;
  }

  if(!qualities.some(quality=>quality.enabled)){
    debugLog("Save aborted: no qualities enabled.");

    setStatus("Enable at least one quality.","error");
    return;
  }

  const payload={
    action:"save",
    sessionId,
    qualities:qualities.map(quality=>({
      name:quality.name,
      enabled:quality.enabled
    })),
    fileSize:getFileSize(),
    filters:{
      cam:camFilter.checked
    }
  };

  debugLog("Save validation passed.",payload);

  saveButton.disabled=true;
  saveButton.textContent="Saving...";
  setStatus("");

  const requestUrl=window.location.pathname;

  debugLog("Sending POST request.",{
    url:requestUrl,
    method:"POST"
  });

  try{
    const response=await fetch(requestUrl,{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload),
      cache:"no-store"
    });

    debugLog("POST response received.",{
      status:response.status,
      statusText:response.statusText,
      ok:response.ok,
      url:response.url
    });

    if(response.status===404 || response.status===410){
      debugLog("Server reported expired Configure session.");
      expire();
      return;
    }

    const text=await response.text();

    debugLog("Raw server response received.",text);

    let data;

    try{
      data=JSON.parse(text);
    }catch(error){
      debugError("Could not parse server response as JSON.",error);

      throw new Error(
        text || "The server returned an invalid response."
      );
    }

    debugLog("Parsed server response.",data);

    if(!response.ok){
      throw new Error(
        data.error || "Failed to save configuration."
      );
    }

    if(!data.manifestUrl){
      throw new Error(
        "The server did not return a manifest URL."
      );
    }

    debugLog("SAVE SUCCESSFUL.",{
      configId:data.configId,
      manifestUrl:data.manifestUrl,
      stremioUrl:data.stremioUrl
    });

    manifestUrl.textContent=data.manifestUrl;
    result.style.display="block";

    setStatus("Configuration saved.","success");

    window.scrollTo({
      top:document.body.scrollHeight,
      behavior:"smooth"
    });
  }catch(error){
    debugError("Save request failed.",error);

    if(!expired){
      setStatus(
        error?.message ||
        "Failed to save configuration.",
        "error"
      );
    }
  }finally{
    debugLog("Save handler finished.",{
      expired,
      buttonDisabled:saveButton.disabled
    });

    if(!expired){
      saveButton.disabled=false;
      saveButton.textContent="Save Configuration";
    }
  }
}

/*
 * IMPORTANT:
 * Attach the Save listener BEFORE the rest of the initialization.
 * If something below throws an exception, the Save button still has
 * its event handler.
 */
debugLog("Attaching Save button listener.");

saveButton.addEventListener("click",saveConfiguration);

debugLog("Save button listener attached successfully.");

minSizeInput.addEventListener("input",()=>{
  debugLog("Minimum file size changed.",minSizeInput.value);

  validateFileSize();
  invalidateResult();
});

maxSizeInput.addEventListener("input",()=>{
  debugLog("Maximum file size changed.",maxSizeInput.value);

  validateFileSize();
  invalidateResult();
});

camFilter.addEventListener("change",()=>{
  debugLog("CAM filter changed.",camFilter.checked);

  invalidateResult();
});

copyButton.addEventListener("click",async()=>{
  debugLog("Copy button clicked.");

  const value=manifestUrl.textContent;

  if(!value){
    debugLog("Copy aborted: no manifest URL.");
    return;
  }

  try{
    await navigator.clipboard.writeText(value);

    debugLog("Manifest URL copied.");

    copyButton.textContent="Copied";

    setTimeout(()=>{
      if(!expired){
        copyButton.textContent="Copy";
      }
    },1500);
  }catch(error){
    debugError("Copy failed.",error);

    setStatus(
      "Copy failed. Select the manifest URL manually.",
      "error"
    );
  }
});

installButton.addEventListener("click",()=>{
  debugLog("Install button clicked.");

  const value=manifestUrl.textContent;

  if(!value || expired){
    debugLog("Install aborted.",{
      hasManifest:!!value,
      expired
    });

    return;
  }

  const stremioUrl=
    "stremio://" +
    value.replace(/^https?:\/\//,"");

  debugLog("Opening Stremio URL.",stremioUrl);

  window.location.href=stremioUrl;
});

clearLogsButton.addEventListener("click",()=>{
  debugLogs.textContent="";
  debugLog("Logs cleared.");
});

testSaveButton.addEventListener("click",()=>{
  debugLog("TEST SAVE BUTTON PRESSED.");

  setStatus(
    "Debug test button works. Now press Save Configuration.",
    "success"
  );
});

window.addEventListener("error",(event)=>{
  debugError(
    "Unhandled JavaScript error.",
    event.error || event.message
  );
});

window.addEventListener("unhandledrejection",(event)=>{
  debugError(
    "Unhandled Promise rejection.",
    event.reason
  );
});

try{
  debugLog("Applying saved file size values.");

  if(fileSize.minGb!==null){
    minSizeInput.value=fileSize.minGb;
  }

  if(fileSize.maxGb!==null){
    maxSizeInput.value=fileSize.maxGb;
  }

  debugLog("Applying CAM filter.",filters.cam!==false);

  camFilter.checked=filters.cam!==false;

  debugLog("Starting quality rendering.");

  renderQualities();

  debugLog("Running initial file size validation.");

  validateFileSize();

  debugLog("Configure UI initialization completed successfully.");
}catch(error){
  debugError(
    "Configure UI initialization failed.",
    error
  );

  setStatus(
    error?.message ||
    "Configure page failed to initialize.",
    "error"
  );
}

debugLog("Configure script finished.");
</script>
</body>
</html>
`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
