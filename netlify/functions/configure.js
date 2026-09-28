import {
  createConfig,
  getConfig,
  saveConfig,
  createConfigureSession,
  getConfigureSession,
  recordConfigureActivity
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

    return JSON.parse(
      Buffer.from(base64, "base64").toString("utf8")
    );
  } catch {
    return {};
  }
}

function normalizeQualities(qualities) {
  if (!Array.isArray(qualities)) {
    return DEFAULT_QUALITIES.map(item => ({ ...item }));
  }

  const allowed = new Map(
    DEFAULT_QUALITIES.map(item => [item.name, item])
  );

  const result = [];
  const used = new Set();

  for (const item of qualities) {
    if (
      !item ||
      typeof item !== "object" ||
      !allowed.has(item.name) ||
      used.has(item.name)
    ) {
      continue;
    }

    result.push({
      name: item.name,
      enabled: item.enabled === true
    });

    used.add(item.name);
  }

  for (const item of DEFAULT_QUALITIES) {
    if (!used.has(item.name)) {
      result.push({
        name: item.name,
        enabled: item.enabled
      });
    }
  }

  return result;
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== "object") {
    return { ...DEFAULT_FILTERS };
  }

  return {
    cam: filters.cam !== false
  };
}

function normalizeFileSize(fileSize) {
  if (!fileSize || typeof fileSize !== "object") {
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
    minGb: Number.isFinite(min) ? min : null,
    maxGb: Number.isFinite(max) ? max : null
  };
}

function validateFileSize(fileSize) {
  if (!fileSize || typeof fileSize !== "object") {
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

  if (min !== null && !Number.isFinite(min)) {
    throw new Error("Invalid minimum file size");
  }

  if (max !== null && !Number.isFinite(max)) {
    throw new Error("Invalid maximum file size");
  }

  if (
    min !== null &&
    (min < 0 || min > MAX_FILE_SIZE_GB)
  ) {
    throw new Error(
      "Minimum file size must be between 0 and 200 GB"
    );
  }

  if (
    max !== null &&
    (max < 0 || max > MAX_FILE_SIZE_GB)
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
  const pathname = url.pathname.replace(/\/+$/, "");

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

  const storedConfig = await getConfig(configValue);

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

  const legacyConfig = decodeConfig(configValue);

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

function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      }
    }
  );
}

function htmlResponse(html, status = 200) {
  return new Response(
    html,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      }
    }
  );
}

function invalidConfigPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShowBox Configure</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:40px 20px;background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
.card{max-width:560px;margin:auto;background:#17181d;padding:28px;border-radius:18px}
p{color:#aaa;line-height:1.5}
</style>
</head>
<body>
<div class="card">
<h2>Invalid configuration</h2>
<p>This Configure page must be opened using an existing addon configuration.</p>
</div>
</body>
</html>
`;
}

function expiredPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configure Expired</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:40px 20px;background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
.card{max-width:560px;margin:auto;background:#17181d;border:1px solid #24252c;padding:28px;border-radius:18px}
p{color:#999;line-height:1.5}
</style>
</head>
<body>
<div class="card">
<h2>Configure session expired</h2>
<p>This Configure session has expired because there was no activity for 10 minutes.</p>
<p>Open Configure again from Stremio to start a new session.</p>
</div>
</body>
</html>
`;
}

export const config = {
  path: [
    "/configure/:config",
    "/:config/configure"
  ]
};

export default async function handler(request) {
  const configData = await getConfigFromRequest(request);

  if (!configData || !configData.config) {
    return htmlResponse(invalidConfigPage(), 400);
  }

  const existingConfig = configData.config;
  const configId = configData.id;

  if (request.method === "POST") {
    try {
      const requestBody = await request.text();

      if (
        new TextEncoder()
          .encode(requestBody)
          .byteLength > MAX_CONFIG_BODY_BYTES
      ) {
        return jsonResponse(
          {
            error: "Configuration request is too large"
          },
          413
        );
      }

      let body;

      try {
        body = JSON.parse(requestBody);
      } catch {
        throw new Error("Invalid JSON");
      }

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {
        throw new Error("Invalid request");
      }

      if (body.action === "create-session") {
        const session = await createConfigureSession();

        return jsonResponse({
          sessionId: session.id
        });
      }

      if (body.action === "activity") {
        const session = await getConfigureSession(
          body.sessionId
        );

        if (!session) {
          return jsonResponse(
            {
              ok: false,
              state: "invalid"
            },
            403
          );
        }

        if (session.state === "expired") {
          return jsonResponse(
            {
              ok: false,
              state: "expired"
            },
            410
          );
        }

        const activity =
          await recordConfigureActivity(
            body.sessionId
          );

        if (!activity.ok) {
          return jsonResponse(
            activity,
            activity.state === "expired" ? 410 : 403
          );
        }

        return jsonResponse(activity);
      }

      if (body.action === "check-session") {
        const session = await getConfigureSession(
          body.sessionId
        );

        if (!session) {
          return jsonResponse(
            {
              ok: false,
              state: "invalid"
            },
            403
          );
        }

        if (session.state === "expired") {
          return jsonResponse(
            {
              ok: false,
              state: "expired"
            },
            410
          );
        }

        return jsonResponse({
          ok: true,
          state: session.state
        });
      }

      const sessionId = body.sessionId;

      const session = await getConfigureSession(
        sessionId
      );

      if (!session) {
        return jsonResponse(
          {
            error: "Configure session is invalid"
          },
          403
        );
      }

      if (session.state === "expired") {
        return jsonResponse(
          {
            error: "Configure session has expired"
          },
          410
        );
      }

      const activity =
        await recordConfigureActivity(
          sessionId
        );

      if (!activity.ok) {
        return jsonResponse(
          {
            error:
              activity.state === "expired"
                ? "Configure session has expired"
                : "Configure session is invalid"
          },
          activity.state === "expired" ? 410 : 403
        );
      }

      if (
        Array.isArray(body.qualities) &&
        body.qualities.length > MAX_QUALITY_ITEMS
      ) {
        throw new Error("Too many quality entries");
      }

      const newQualities =
        normalizeQualities(body.qualities);

      const newFileSize =
        validateFileSize(body.fileSize);

      const newFilters =
        normalizeFilters(body.filters);

      const uiToken =
        typeof existingConfig.uiToken === "string"
          ? existingConfig.uiToken
          : "";

      const newConfig = {
        ...existingConfig,
        uiToken,
        fileSize: newFileSize,
        qualities: newQualities.map(item => ({
          name: item.name,
          enabled: item.enabled
        })),
        filters: newFilters
      };

      const requestUrl = new URL(request.url);

      let finalConfigId = configId;

      if (!finalConfigId) {
        finalConfigId = await createConfig(
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

      return jsonResponse({
        manifestUrl
      });
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

      return jsonResponse(
        {
          error: message
        },
        status
      );
    }
  }

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

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ShowBox Stremio Addon</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 40px;background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.container{width:100%;max-width:560px;margin:0 auto}
h1{margin:8px 0;font-size:27px;font-weight:700;letter-spacing:-.5px}
.subtitle{margin:0 0 26px;color:#9b9ca3;font-size:15px;line-height:1.5}
.card{background:#17181d;border:1px solid #24252c;border-radius:18px;padding:20px;margin-bottom:16px}
.card-title{font-size:17px;font-weight:650;margin-bottom:6px}
.card-description{color:#92939b;font-size:13px;line-height:1.45;margin-bottom:18px}
.size-row{display:flex;gap:12px}
.size-field{flex:1}
label{display:block;color:#a5a6ae;font-size:13px;margin-bottom:7px}
input[type=number]{width:100%;height:45px;border:1px solid #303139;border-radius:11px;background:#20222a;color:#fff;padding:0 13px;font-size:15px;outline:none}
input[type=number]:focus{border-color:#62646e}
.file-size-error{min-height:18px;margin-top:10px;color:#ff9b9b;font-size:13px;line-height:1.45}
.quality-list,.filter-list{display:flex;flex-direction:column;gap:8px}
.quality-row{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 10px;background:#20222a;border-radius:11px}
.quality-row>input{flex:0 0 auto}
.quality-name{flex:1;font-size:15px}
.quality-controls{display:flex;gap:6px}
.quality-controls button{width:34px;height:34px;border:0;border-radius:9px;background:#2b2d36;color:#ddd;font-size:17px}
.quality-controls button:active{background:#383a45}
.quality-controls button:disabled{opacity:.3}
.filter-row{display:flex;align-items:center;min-height:48px;padding:8px 10px;background:#20222a;border-radius:11px}
.filter-label{display:flex;align-items:center;gap:12px;margin:0;color:#fff;font-size:15px;cursor:pointer}
input[type=checkbox]{width:19px;height:19px;accent-color:#fff}
button.main{width:100%;height:47px;border:0;border-radius:12px;background:#fff;color:#111;font-size:15px;font-weight:650;margin-top:18px}
button.main:active{opacity:.8}
button.main:disabled{opacity:.5}
.result{display:none;margin-top:16px}
.result.visible{display:block}
.manifest-url{width:100%;padding:12px;border-radius:11px;background:#20222a;color:#aaa;font-size:12px;line-height:1.45;word-break:break-all;user-select:all}
.result-buttons{display:flex;gap:10px;margin-top:12px}
.result-buttons button{flex:1;height:44px;border:0;border-radius:11px;font-size:14px;font-weight:600}
.copy{background:#292b33;color:#fff}
.install{background:#fff;color:#111}
.note{margin-top:20px;padding:14px;border-radius:12px;background:#17181d;color:#8f9098;font-size:13px;line-height:1.5}
.status{display:none;margin-top:12px;padding:11px 12px;border-radius:10px;background:#20222a;color:#aaa;font-size:13px}
.status.visible{display:block}
.session-warning{display:none;position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:528px;margin:auto;padding:14px 16px;border-radius:13px;background:#20222a;border:1px solid #383a45;color:#fff;font-size:13px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.session-warning.visible{display:block}
.session-warning strong{display:block;margin-bottom:4px}
.expired-overlay{display:none;position:fixed;inset:0;z-index:2000;background:#111;color:#fff;padding:40px 20px;align-items:center;justify-content:center;text-align:center}
.expired-overlay.visible{display:flex}
.expired-box{width:100%;max-width:560px;background:#17181d;border:1px solid #24252c;border-radius:18px;padding:28px}
.expired-box p{color:#999;line-height:1.5}
@media(max-width:480px){
.size-row{gap:8px}
.card{padding:17px}
.result-buttons{gap:8px}
}
</style>
</head>
<body>
<div class="container">
<h1>ShowBox Stremio Addon</h1>
<p class="subtitle">Configure your stream preferences.</p>

<div class="card">
<div class="card-title">File size</div>
<div class="card-description">Only show files within the selected size range. Leave a field empty for no limit.</div>
<div class="size-row">
<div class="size-field">
<label for="minSize">Minimum (GB)</label>
<input id="minSize" type="number" min="0" max="200" step="0.1" placeholder="No minimum">
</div>
<div class="size-field">
<label for="maxSize">Maximum (GB)</label>
<input id="maxSize" type="number" min="0" max="200" step="0.1" placeholder="No maximum">
</div>
</div>
<div id="fileSizeError" class="file-size-error"></div>
</div>

<div class="card">
<div class="card-title">Quality</div>
<div class="card-description">Enable the qualities you want and use the arrows to change their priority.</div>
<div id="qualityList" class="quality-list"></div>
</div>

<div class="card">
<div class="card-title">Stream filters</div>
<div class="card-description">Enable the stream types you want to keep. These settings do not change quality priority.</div>
<div class="filter-list">
<div class="filter-row">
<label class="filter-label">
<input id="camFilter" type="checkbox">
<span>CAM</span>
</label>
</div>
</div>
</div>

<button id="save" class="main">Save configuration</button>

<div id="status" class="status"></div>

<div id="result" class="result">
<div class="card">
<div class="card-title">Manifest URL</div>
<div id="manifestUrl" class="manifest-url"></div>
<div class="result-buttons">
<button id="copy" class="copy">Copy</button>
<button id="install" class="install">Install in Stremio</button>
</div>
</div>
</div>

<div class="note">
On iOS/iPadOS, if Stremio does not open automatically, copy the manifest URL and add it manually through Stremio's Add-ons page.
</div>
</div>

<div id="sessionWarning" class="session-warning">
<strong>Configure session will expire soon</strong>
<span id="sessionCountdown">5:00</span> remaining. Interact with the page to keep it open.
</div>

<div id="expiredOverlay" class="expired-overlay">
<div class="expired-box">
<h2>Configure session expired</h2>
<p>This Configure session expired after 10 minutes without activity.</p>
<p>Open Configure again from Stremio to start a new session.</p>
</div>
</div>

<script>
const qualities=${qualitiesJson};
const fileSize=${fileSizeJson};
const filters=${filtersJson};

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
const sessionWarning=document.getElementById("sessionWarning");
const sessionCountdown=document.getElementById("sessionCountdown");
const expiredOverlay=document.getElementById("expiredOverlay");

const SESSION_IDLE_MS=5*60*1000;
const SESSION_WARNING_MS=5*60*1000;
const ACTIVITY_SYNC_MS=60*1000;

let sessionId=null;
let lastActivity=Date.now();
let lastServerSync=0;
let warningTimer=null;
let inactivityTimer=null;
let countdownTimer=null;
let expired=false;
let syncing=false;

function showStatus(message){
  status.textContent=message;
  status.classList.add("visible");
}

function hideStatus(){
  status.classList.remove("visible");
}

function invalidateResult(){
  manifestUrl.textContent="";
  result.classList.remove("visible");
}

function formatTime(ms){
  const total=Math.max(0,Math.ceil(ms/1000));
  const minutes=Math.floor(total/60);
  const seconds=total%60;
  return String(minutes)+":"+String(seconds).padStart(2,"0");
}

function permanentlyExpire(){
  if(expired){
    return;
  }

  expired=true;

  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);
  clearInterval(countdownTimer);

  sessionWarning.classList.remove("visible");
  saveButton.disabled=true;

  expiredOverlay.classList.add("visible");

  try{
    window.close();
  }catch{}
}

function startInactivityTimer(){
  clearTimeout(inactivityTimer);

  if(expired){
    return;
  }

  inactivityTimer=setTimeout(
    startWarning,
    SESSION_IDLE_MS
  );
}

function startWarning(){
  if(expired){
    return;
  }

  sessionWarning.classList.add("visible");

  const warningStarted=Date.now();

  clearInterval(countdownTimer);

  countdownTimer=setInterval(()=>{
    if(expired){
      clearInterval(countdownTimer);
      return;
    }

    const remaining=
      SESSION_WARNING_MS-
      (Date.now()-warningStarted);

    sessionCountdown.textContent=
      formatTime(remaining);

    if(remaining<=0){
      clearInterval(countdownTimer);
      permanentlyExpire();
    }
  },1000);

  clearTimeout(warningTimer);

  warningTimer=setTimeout(
    permanentlyExpire,
    SESSION_WARNING_MS
  );
}

async function syncActivity(force=false){
  if(!sessionId||expired||syncing){
    return;
  }

  const now=Date.now();

  if(
    !force &&
    now-lastServerSync<ACTIVITY_SYNC_MS
  ){
    return;
  }

  syncing=true;

  try{
    const response=await fetch(
      window.location.pathname,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          action:"activity",
          sessionId
        }),
        cache:"no-store"
      }
    );

    if(response.status===410){
      permanentlyExpire();
      return;
    }

    if(!response.ok){
      return;
    }

    const data=await response.json();

    if(!data.ok){
      if(data.state==="expired"){
        permanentlyExpire();
      }
      return;
    }

    lastServerSync=Date.now();
  }catch{
  }finally{
    syncing=false;
  }
}

function registerActivity(){
  if(expired){
    return;
  }

  lastActivity=Date.now();

  clearTimeout(warningTimer);
  clearInterval(countdownTimer);

  sessionWarning.classList.remove("visible");

  startInactivityTimer();

  syncActivity(false);
}

async function createSession(){
  try{
    const existing=
      sessionStorage.getItem(
        "showboxConfigureSession"
      );

    if(existing){
      const response=await fetch(
        window.location.pathname,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            action:"check-session",
            sessionId:existing
          }),
          cache:"no-store"
        }
      );

      if(response.ok){
        const data=await response.json();

        if(data.ok){
          sessionId=existing;
          lastActivity=Date.now();
          lastServerSync=Date.now();
          startInactivityTimer();

          if(data.state==="warning"){
            startWarning();
          }

          return true;
        }
      }

      sessionStorage.removeItem(
        "showboxConfigureSession"
      );
    }

    const response=await fetch(
      window.location.pathname,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          action:"create-session"
        }),
        cache:"no-store"
      }
    );

    if(!response.ok){
      throw new Error("Unable to start Configure session");
    }

    const data=await response.json();

    if(!data.sessionId){
      throw new Error("Unable to start Configure session");
    }

    sessionId=data.sessionId;

    sessionStorage.setItem(
      "showboxConfigureSession",
      sessionId
    );

    lastActivity=Date.now();
    lastServerSync=Date.now();

    startInactivityTimer();

    return true;
  }catch(error){
    showStatus(
      error.message||
      "Unable to start Configure session."
    );

    saveButton.disabled=true;

    return false;
  }
}

function renderQualities(){
  qualityList.innerHTML="";

  qualities.forEach((quality,index)=>{
    const row=document.createElement("div");
    row.className="quality-row";

    const checkbox=document.createElement("input");
    checkbox.type="checkbox";
    checkbox.checked=quality.enabled;

    checkbox.addEventListener(
      "change",
      ()=>{
        registerActivity();
        quality.enabled=checkbox.checked;
        invalidateResult();
      }
    );

    const name=document.createElement("div");
    name.className="quality-name";
    name.textContent=quality.name;

    const controls=document.createElement("div");
    controls.className="quality-controls";

    const up=document.createElement("button");
    up.type="button";
    up.textContent="↑";
    up.disabled=index===0;

    up.addEventListener(
      "click",
      ()=>{
        registerActivity();

        if(index===0){
          return;
        }

        const temp=qualities[index-1];
        qualities[index-1]=qualities[index];
        qualities[index]=temp;

        invalidateResult();
        renderQualities();
      }
    );

    const down=document.createElement("button");
    down.type="button";
    down.textContent="↓";
    down.disabled=
      index===qualities.length-1;

    down.addEventListener(
      "click",
      ()=>{
        registerActivity();

        if(index===qualities.length-1){
          return;
        }

        const temp=qualities[index+1];
        qualities[index+1]=qualities[index];
        qualities[index]=temp;

        invalidateResult();
        renderQualities();
      }
    );

    controls.appendChild(up);
    controls.appendChild(down);

    row.appendChild(checkbox);
    row.appendChild(name);
    row.appendChild(controls);

    qualityList.appendChild(row);
  });
}

function getFileSizeConfig(){
  const minValue=minSizeInput.value.trim();
  const maxValue=maxSizeInput.value.trim();

  return {
    minGb:minValue===""?null:Number(minValue),
    maxGb:maxValue===""?null:Number(maxValue)
  };
}

function validateFileSizeInputs(){
  const value=getFileSizeConfig();
  let error="";

  if(
    value.minGb!==null &&
    (
      !Number.isFinite(value.minGb)||
      value.minGb<0||
      value.minGb>200
    )
  ){
    error="Minimum size must be between 0 and 200 GB.";
  }else if(
    value.maxGb!==null &&
    (
      !Number.isFinite(value.maxGb)||
      value.maxGb<0||
      value.maxGb>200
    )
  ){
    error="Maximum size must be between 0 and 200 GB.";
  }else if(
    value.minGb!==null&&
    value.maxGb!==null&&
    value.minGb>value.maxGb
  ){
    error="Minimum size cannot be greater than maximum size.";
  }

  fileSizeError.textContent=error;

  if(error){
    invalidateResult();
    return false;
  }

  return true;
}

async function saveConfiguration(){
  registerActivity();
  hideStatus();

  if(!validateFileSizeInputs()){
    invalidateResult();
    return;
  }

  if(expired){
    return;
  }

  const currentFileSize=getFileSizeConfig();

  saveButton.disabled=true;
  saveButton.textContent="Saving...";

  const config={
    qualities:qualities.map(item=>({
      name:item.name,
      enabled:item.enabled
    })),
    fileSize:currentFileSize,
    filters:{
      cam:camFilter.checked
    }
  };

  try{
    await syncActivity(true);

    if(expired){
      return;
    }

    const response=await fetch(
      window.location.pathname,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          ...config,
          sessionId
        }),
        cache:"no-store"
      }
    );

    const data=await response.json();

    if(response.status===410){
      permanentlyExpire();
      return;
    }

    if(
      !response.ok||
      !data.manifestUrl
    ){
      throw new Error(
        data.error||
        "Failed to save configuration"
      );
    }

    manifestUrl.textContent=
      data.manifestUrl;

    result.classList.add("visible");

    showStatus(
      "Configuration saved."
    );

    window.scrollTo({
      top:document.body.scrollHeight,
      behavior:"smooth"
    });
  }catch(error){
    if(!expired){
      showStatus(
        error.message||
        "Something went wrong."
      );
    }
  }finally{
    if(!expired){
      saveButton.disabled=false;
      saveButton.textContent=
        "Save configuration";
    }
  }
}

minSizeInput.addEventListener(
  "input",
  ()=>{
    registerActivity();
    invalidateResult();
    validateFileSizeInputs();
  }
);

maxSizeInput.addEventListener(
  "input",
  ()=>{
    registerActivity();
    invalidateResult();
    validateFileSizeInputs();
  }
);

camFilter.addEventListener(
  "change",
  ()=>{
    registerActivity();
    invalidateResult();
  }
);

copyButton.addEventListener(
  "click",
  async ()=>{
    registerActivity();

    const url=manifestUrl.textContent;

    if(!url){
      return;
    }

    try{
      await navigator.clipboard.writeText(url);

      copyButton.textContent="Copied!";

      setTimeout(()=>{
        if(!expired){
          copyButton.textContent="Copy";
        }
      },1500);
    }catch{
      showStatus(
        "Copy failed. Select the URL manually."
      );
    }
  }
);

installButton.addEventListener(
  "click",
  ()=>{
    registerActivity();

    const url=manifestUrl.textContent;

    if(!url||expired){
      return;
    }

    const stremioUrl=
      "stremio://"+
      url.replace(/^https?:\/\//,"");

    window.location.href=stremioUrl;
  }
);

document.addEventListener(
  "pointerdown",
  ()=>{
    registerActivity();
  },
  {passive:true}
);

document.addEventListener(
  "keydown",
  ()=>{
    registerActivity();
  },
  {passive:true}
);

document.addEventListener(
  "scroll",
  ()=>{
    registerActivity();
  },
  {passive:true}
);

if(fileSize.minGb!==null){
  minSizeInput.value=fileSize.minGb;
}

if(fileSize.maxGb!==null){
  maxSizeInput.value=fileSize.maxGb;
}

camFilter.checked=
  filters.cam!==false;

renderQualities();

saveButton.addEventListener(
  "click",
  saveConfiguration
);

validateFileSizeInputs();

createSession();
</script>
</body>
</html>
`;

  return htmlResponse(html);
}
