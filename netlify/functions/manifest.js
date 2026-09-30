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

const SESSION_COOKIE =
  "showbox_configure_session";

const SESSION_COOKIE_MAX_AGE =
  60 * 60;

function jsonResponse(
  data,
  status = 200
){
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
        "Access-Control-Allow-Origin":
          "*",
        "X-Content-Type-Options":
          "nosniff",
        "Referrer-Policy":
          "no-referrer"
      }
    }
  );
}

function decodeConfig(value){
  if(
    typeof value !== "string" ||
    !value
  ){
    return null;
  }

  try{
    const json =
      Buffer.from(
        value,
        "base64url"
      ).toString("utf8");

    const parsed =
      JSON.parse(json);

    if(
      !parsed ||
      typeof parsed !== "object"
    ){
      return null;
    }

    return parsed;
  }
  catch{
    return null;
  }
}

function getConfigIdFromRequest(
  request
){
  const url =
    new URL(request.url);

  const match =
    url.pathname.match(
      /^\/configure\/([^/]+)\/?$/
    ) ||
    url.pathname.match(
      /^\/([^/]+)\/configure\/?$/
    );

  return match?.[1] || null;
}

async function getConfigFromRequest(
  request
){
  const configId =
    getConfigIdFromRequest(
      request
    );

  if(!configId){
    return null;
  }

  const stored =
    await getConfig(configId);

  if(stored){
    return stored;
  }

  return decodeConfig(
    configId
  );
}

function normalizeQualities(
  input
){
  if(!Array.isArray(input)){
    return DEFAULT_QUALITIES.map(
      name => ({
        name,
        enabled:true
      })
    );
  }

  const allowed =
    new Set(
      DEFAULT_QUALITIES
    );

  const seen =
    new Set();

  const result = [];

  for(
    const item of input
  ){
    let name;
    let enabled = true;

    if(
      typeof item === "string"
    ){
      name =
        item.trim();
    }
    else if(
      item &&
      typeof item === "object"
    ){
      name =
        typeof item.name === "string"
          ? item.name.trim()
          : "";

      enabled =
        item.enabled !== false;
    }

    if(
      !allowed.has(name) ||
      seen.has(name)
    ){
      continue;
    }

    seen.add(name);

    result.push({
      name,
      enabled
    });

    if(
      result.length >=
      MAX_QUALITY_ITEMS
    ){
      break;
    }
  }

  if(!result.length){
    return DEFAULT_QUALITIES.map(
      name => ({
        name,
        enabled:true
      })
    );
  }

  return result;
}

function normalizeFileSize(
  input
){
  if(
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ){
    return {
      minGb:null,
      maxGb:null
    };
  }

  let minGb = null;
  let maxGb = null;

  if(
    input.minGb !== null &&
    input.minGb !== undefined &&
    input.minGb !== ""
  ){
    const value =
      Number(input.minGb);

    if(
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_FILE_SIZE_GB
    ){
      minGb =
        Math.round(
          value * 100
        ) / 100;
    }
  }

  if(
    input.maxGb !== null &&
    input.maxGb !== undefined &&
    input.maxGb !== ""
  ){
    const value =
      Number(input.maxGb);

    if(
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_FILE_SIZE_GB
    ){
      maxGb =
        Math.round(
          value * 100
        ) / 100;
    }
  }

  return {
    minGb,
    maxGb
  };
}

function validateFileSize(
  fileSize
){
  if(
    fileSize.minGb !== null &&
    (
      !Number.isFinite(
        fileSize.minGb
      ) ||
      fileSize.minGb < 0 ||
      fileSize.minGb >
        MAX_FILE_SIZE_GB
    )
  ){
    return "Minimum file size must be between 0 and 200 GB.";
  }

  if(
    fileSize.maxGb !== null &&
    (
      !Number.isFinite(
        fileSize.maxGb
      ) ||
      fileSize.maxGb < 0 ||
      fileSize.maxGb >
        MAX_FILE_SIZE_GB
    )
  ){
    return "Maximum file size must be between 0 and 200 GB.";
  }

  if(
    fileSize.minGb !== null &&
    fileSize.maxGb !== null &&
    fileSize.minGb >
      fileSize.maxGb
  ){
    return "Minimum size cannot be greater than maximum size.";
  }

  return null;
}

function normalizeFilters(
  input
){
  if(
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ){
    return {
      cam:true
    };
  }

  return {
    cam:
      input.cam !== false
  };
}

function getCookie(
  request,
  name
){
  const header =
    request.headers.get(
      "cookie"
    );

  if(!header){
    return null;
  }

  for(
    const part of
      header.split(";")
  ){
    const index =
      part.indexOf("=");

    if(index === -1){
      continue;
    }

    const key =
      part
        .slice(0,index)
        .trim();

    if(key !== name){
      continue;
    }

    return decodeURIComponent(
      part
        .slice(index + 1)
        .trim()
    );
  }

  return null;
}

function encodeSessionCookie(
  configId,
  sessionId
){
  return encodeURIComponent(
    JSON.stringify({
      configId,
      sessionId
    })
  );
}

function decodeSessionCookie(
  value
){
  if(
    typeof value !== "string" ||
    !value
  ){
    return null;
  }

  try{
    const parsed =
      JSON.parse(
        decodeURIComponent(
          value
        )
      );

    if(
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.configId !== "string" ||
      typeof parsed.sessionId !== "string"
    ){
      return null;
    }

    return parsed;
  }
  catch{
    return null;
  }
}

function buildSessionCookie(
  configId,
  sessionId
){
  return [
    `${SESSION_COOKIE}=${encodeSessionCookie(
      configId,
      sessionId
    )}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    "Secure"
  ].join("; ");
}

function expiredResponse(){
  return new Response(
    "Not Found",
    {
      status:404,
      headers:{
        "Content-Type":
          "text/plain; charset=utf-8",
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

function invalidConfigResponse(){
  return new Response(
    "Invalid configuration",
    {
      status:404,
      headers:{
        "Content-Type":
          "text/plain; charset=utf-8",
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

function qualityRows(
  qualities
){
  return qualities.map(
    (item,index) => `
      <div class="quality-row">
        <label class="quality-name">
          <input
            type="checkbox"
            class="quality-checkbox"
            data-quality="${item.name}"
            ${item.enabled ? "checked" : ""}
          >
          <span>${item.name}</span>
        </label>

        <div class="move-buttons">
          <button
            type="button"
            class="move-button"
            data-action="up"
            ${index === 0 ? "disabled" : ""}
          >↑</button>

          <button
            type="button"
            class="move-button"
            data-action="down"
            ${
              index ===
              qualities.length - 1
                ? "disabled"
                : ""
            }
          >↓</button>
        </div>
      </div>
    `
  ).join("");
}

function filterRows(
  filters
){
  return `
    <div class="filter-setting-row">
      <label class="filter-setting-name">
        <input
          type="checkbox"
          class="filter-setting-checkbox"
          id="camFilter"
          ${filters.cam ? "checked" : ""}
        >
        <span>
          CAM
        </span>
      </label>
    </div>
  `;
}

function clientScript(){
  return `
(function(){
"use strict";

const dataElement =
  document.getElementById(
    "showbox-config-data"
  );

if(!dataElement){
  return;
}

let data;

try{
  data =
    JSON.parse(
      dataElement.textContent
    );
}
catch{
  return;
}

const sessionId =
  data.sessionId;

const remainingMs =
  Number(
    data.remainingMs
  );

const qualityList =
  document.getElementById(
    "qualityList"
  );

const filterList =
  document.getElementById(
    "filterList"
  );

const minSizeInput =
  document.getElementById(
    "minSize"
  );

const maxSizeInput =
  document.getElementById(
    "maxSize"
  );

const fileSizeStatus =
  document.getElementById(
    "fileSizeStatus"
  );

const saveConfiguration =
  document.getElementById(
    "saveConfiguration"
  );

const result =
  document.getElementById(
    "result"
  );

const manifestUrl =
  document.getElementById(
    "manifestUrl"
  );

const copyButton =
  document.getElementById(
    "copyButton"
  );

const installButton =
  document.getElementById(
    "installButton"
  );

let expired = false;

if(
  !sessionId ||
  !Number.isFinite(
    remainingMs
  ) ||
  remainingMs <= 0
){
  window.location.replace(
    "/__showbox_configure_expired__"
  );
  return;
}

const deadline =
  performance.now() +
  remainingMs;

function expire(){
  if(expired){
    return;
  }

  expired = true;

  saveConfiguration.disabled =
    true;

  window.location.replace(
    "/__showbox_configure_expired__"
  );
}

setTimeout(
  expire,
  remainingMs
);

window.addEventListener(
  "pageshow",
  event => {
    if(
      event.persisted ||
      performance.now() >=
        deadline
    ){
      expire();
    }
  }
);

function getRows(){
  return Array.from(
    qualityList.querySelectorAll(
      ".quality-row"
    )
  );
}

function getQualityConfig(){
  return getRows().map(
    row => {
      const checkbox =
        row.querySelector(
          ".quality-checkbox"
        );

      return {
        name:
          checkbox.dataset.quality,
        enabled:
          checkbox.checked
      };
    }
  );
}

function getFilterConfig(){
  const checkbox =
    document.getElementById(
      "camFilter"
    );

  return {
    cam:
      checkbox
        ? checkbox.checked
        : true
  };
}

function getFileSizeConfig(){
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

function validateFileSizeInputs(){
  const fileSize =
    getFileSizeConfig();

  let error = "";

  if(
    fileSize.minGb !== null &&
    (
      !Number.isFinite(
        fileSize.minGb
      ) ||
      fileSize.minGb < 0 ||
      fileSize.minGb > 200
    )
  ){
    error =
      "Minimum file size must be between 0 and 200 GB.";
  }
  else if(
    fileSize.maxGb !== null &&
    (
      !Number.isFinite(
        fileSize.maxGb
      ) ||
      fileSize.maxGb < 0 ||
      fileSize.maxGb > 200
    )
  ){
    error =
      "Maximum file size must be between 0 and 200 GB.";
  }
  else if(
    fileSize.minGb !== null &&
    fileSize.maxGb !== null &&
    fileSize.minGb >
      fileSize.maxGb
  ){
    error =
      "Minimum size cannot be greater than maximum size.";
  }

  fileSizeStatus.textContent =
    error;

  fileSizeStatus.className =
    error
      ? "filter-error"
      : "";

  return !error;
}

async function save(){
  if(expired){
    return;
  }

  if(
    performance.now() >=
    deadline
  ){
    expire();
    return;
  }

  const qualities =
    getQualityConfig();

  if(
    !qualities.some(
      item => item.enabled
    )
  ){
    return;
  }

  if(
    !validateFileSizeInputs()
  ){
    return;
  }

  saveConfiguration.disabled =
    true;

  saveConfiguration.textContent =
    "Saving...";

  try{
    const response =
      await fetch(
        window.location.pathname,
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              action:"save",
              sessionId,
              fileSize:
                getFileSizeConfig(),
              qualities,
              filters:
                getFilterConfig()
            }),
          cache:"no-store"
        }
      );

    if(
      response.status === 404 ||
      response.status === 410
    ){
      expire();
      return;
    }

    let resultData;

    try{
      resultData =
        await response.json();
    }
    catch{
      throw new Error(
        "The server returned an invalid response."
      );
    }

    if(!response.ok){
      throw new Error(
        resultData.error ||
        "Failed to save configuration."
      );
    }

    if(
      !resultData.manifestUrl
    ){
      throw new Error(
        "The server did not return a manifest URL."
      );
    }

    manifestUrl.value =
      resultData.manifestUrl;

    installButton.href =
      resultData.stremioUrl ||
      "#";

    installButton.classList.remove(
      "disabled"
    );

    result.style.display =
      "block";

    window.scrollTo({
      top:
        document.body.scrollHeight,
      behavior:
        "smooth"
    });
  }
  catch(error){
    if(!expired){
      console.error(error);
    }
  }
  finally{
    if(!expired){
      saveConfiguration.disabled =
        false;

      saveConfiguration.textContent =
        "Save Configuration";
    }
  }
}

qualityList.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        ".move-button"
      );

    if(!button){
      return;
    }

    const row =
      button.closest(
        ".quality-row"
      );

    const rows =
      getRows();

    const index =
      rows.indexOf(row);

    if(
      button.dataset.action ===
        "up" &&
      index > 0
    ){
      qualityList.insertBefore(
        row,
        rows[index - 1]
      );
    }

    if(
      button.dataset.action ===
        "down" &&
      index <
        rows.length - 1
    ){
      qualityList.insertBefore(
        rows[index + 1],
        row
      );
    }
  }
);

minSizeInput.addEventListener(
  "input",
  validateFileSizeInputs
);

maxSizeInput.addEventListener(
  "input",
  validateFileSizeInputs
);

saveConfiguration.addEventListener(
  "click",
  save
);

copyButton.addEventListener(
  "click",
  async () => {
    if(!manifestUrl.value){
      return;
    }

    try{
      await navigator.clipboard.writeText(
        manifestUrl.value
      );
    }
    catch{
      manifestUrl.focus();
      manifestUrl.select();
      document.execCommand(
        "copy"
      );
    }

    copyButton.textContent =
      "Copied";

    setTimeout(
      () => {
        copyButton.textContent =
          "Copy";
      },
      1500
    );
  }
);

installButton.addEventListener(
  "click",
  event => {
    if(
      !manifestUrl.value ||
      expired
    ){
      event.preventDefault();
    }
  }
);

})();
`;
}

export const config = {
  method:[
    "GET",
    "POST"
  ],
  path:[
    "/configure/:config",
    "/:config/configure",
    "/configure-client.js"
  ]
};

export default async function handler(
  request
){
  const url =
    new URL(request.url);

  const pathname =
    url.pathname;

  if(
    request.method === "GET" &&
    pathname ===
      "/configure-client.js"
  ){
    return new Response(
      clientScript(),
      {
        status:200,
        headers:{
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

  const configId =
    getConfigIdFromRequest(
      request
    );

  if(!configId){
    return invalidConfigResponse();
  }

  if(
    request.method === "POST"
  ){
    const contentLength =
      request.headers.get(
        "content-length"
      );

    if(
      contentLength &&
      Number(contentLength) >
        MAX_CONFIG_BODY_BYTES
    ){
      return jsonResponse(
        {
          error:
            "Configuration request is too large"
        },
        413
      );
    }

    let requestBody;

    try{
      requestBody =
        await request.text();
    }
    catch{
      return jsonResponse(
        {
          error:
            "Unable to read request body"
        },
        400
      );
    }

    if(
      new TextEncoder()
        .encode(
          requestBody
        )
        .byteLength >
      MAX_CONFIG_BODY_BYTES
    ){
      return jsonResponse(
        {
          error:
            "Configuration request is too large"
        },
        413
      );
    }

    let body;

    try{
      body =
        JSON.parse(
          requestBody
        );
    }
    catch{
      return jsonResponse(
        {
          error:
            "Invalid JSON"
        },
        400
      );
    }

    if(
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(body)
    ){
      return jsonResponse(
        {
          error:
            "Invalid configuration"
        },
        400
      );
    }

    if(
      body.action !== "save"
    ){
      return jsonResponse(
        {
          error:
            "Invalid configuration action"
        },
        400
      );
    }

    const cookieValue =
      getCookie(
        request,
        SESSION_COOKIE
      );

    const cookieSession =
      decodeSessionCookie(
        cookieValue
      );

    const sessionId =
      typeof body.sessionId ===
        "string"
        ? body.sessionId
        : "";

    if(
      !cookieSession ||
      cookieSession.configId !==
        configId ||
      cookieSession.sessionId !==
        sessionId
    ){
      return expiredResponse();
    }

    const session =
      await getConfigureSession(
        sessionId
      );

    if(!session){
      return expiredResponse();
    }

    const existingConfig =
      await getConfigFromRequest(
        request
      );

    if(!existingConfig){
      return invalidConfigResponse();
    }

    if(
      Array.isArray(
        body.qualities
      ) &&
      body.qualities.length >
        MAX_QUALITY_ITEMS
    ){
      return jsonResponse(
        {
          error:
            "Too many quality entries"
        },
        400
      );
    }

    const qualities =
      normalizeQualities(
        body.qualities
      );

    if(
      !qualities.some(
        item => item.enabled
      )
    ){
      return jsonResponse(
        {
          error:
            "Enable at least one quality"
        },
        400
      );
    }

    const fileSize =
      normalizeFileSize(
        body.fileSize
      );

    const fileSizeError =
      validateFileSize(
        fileSize
      );

    if(fileSizeError){
      return jsonResponse(
        {
          error:
            fileSizeError
        },
        400
      );
    }

    const filters =
      normalizeFilters(
        body.filters
      );

    const uiToken =
      existingConfig.uiToken;

    if(
      typeof uiToken !==
        "string" ||
      !uiToken
    ){
      return jsonResponse(
        {
          error:
            "ShowBox UI token is missing"
        },
        400
      );
    }

    const newConfig = {
      ...existingConfig,

      uiToken,

      fileSize,

      qualities,

      filters
    };

    await saveConfig(
      configId,
      newConfig
    );

    return jsonResponse({
      ok:true,

      configId,

      manifestUrl:
        `${url.origin}/${configId}/manifest.json`,

      stremioUrl:
        `stremio://${url.host}/${configId}/manifest.json`
    });
  }

  if(
    request.method === "GET"
  ){
    const existingConfig =
      await getConfigFromRequest(
        request
      );

    if(!existingConfig){
      return invalidConfigResponse();
    }

    const cookieValue =
      getCookie(
        request,
        SESSION_COOKIE
      );

    const cookieSession =
      decodeSessionCookie(
        cookieValue
      );

    let session = null;

    let setCookie = null;

    /*
     * No session for this config:
     * create the 5-minute session.
     */
    if(
      !cookieSession ||
      cookieSession.configId !==
        configId
    ){
      session =
        await createConfigureSession();

      setCookie =
        buildSessionCookie(
          configId,
          session.id
        );
    }
    else{
      /*
       * A session cookie for this exact
       * config already exists.
       *
       * If it has expired, DO NOT create
       * another session. The Configure
       * URL is now permanently expired
       * for this session.
       */
      session =
        await getConfigureSession(
          cookieSession.sessionId
        );

      if(!session){
        return expiredResponse();
      }
    }

    const remainingMs =
      Math.max(
        0,
        Number(
          session.expiresAt
        ) -
        Date.now()
      );

    if(remainingMs <= 0){
      return expiredResponse();
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

    const configData =
      JSON.stringify({
        qualities,
        fileSize,
        filters,
        sessionId:
          session.id,
        remainingMs
      }).replace(
        /</g,
        "\\u003c"
      );

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,viewport-fit=cover"
>

<meta
  name="theme-color"
  content="#0d0e11"
>

<title>
ShowBox Configure
</title>

<style>
:root{
  color-scheme:dark;
  --bg:#0d0e11;
  --surface:#15161b;
  --surface-2:#1d1f25;
  --input:#252831;
  --border:#292c34;
  --border-light:#343740;
  --text:#f1f1f3;
  --text-soft:#c9cad0;
  --muted:#858892;
  --muted-2:#696c75;
  --white:#f4f4f5;
  --black:#101115;
  --success:#a7e3b1;
  --error:#ff9b9b;
}

*{
  box-sizing:border-box;
}

html{
  background:var(--bg);
}

body{
  margin:0 1.2vw;
  min-height:100vh;
  background:
    radial-gradient(
      circle at 50% -15%,
      rgba(255,255,255,.055),
      transparent 38%
    ),
    var(--bg);
  color:var(--text);
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "SF Pro Text",
    "Segoe UI",
    sans-serif;
  -webkit-font-smoothing:antialiased;
  zoom:1.1;
}

.container{
  width:
    min(
      clamp(700px,74vw,960px),
      calc(100% - 28px)
    );
  margin:auto;
  padding:
    20px
    0
    clamp(50px,6vw,80px);
}

.settings-header{
  margin-bottom:
    clamp(28px,4vw,40px);
}

.settings-title{
  margin:0;
  color:var(--text);
  font-size:
    clamp(40px,5.5vw,58px);
  line-height:.98;
  font-weight:700;
  letter-spacing:-2.5px;
}

.section-title,
.configuration-title{
  margin:
    0 0 6px;
  color:var(--text);
  font-size:
    clamp(25px,3vw,34px);
  line-height:1.1;
  font-weight:700;
  letter-spacing:-1px;
}

.section-description,
.description{
  margin:
    0
    0
    clamp(12px,1.5vw,18px);
  color:var(--muted);
  font-size:
    clamp(12px,1.4vw,14px);
  line-height:1.5;
}

.file-size-section{
  margin-top:0;
}

.file-size-card{
  padding:
    clamp(11px,1.2vw,14px);
  border:
    1px solid var(--border);
  border-radius:
    clamp(15px,1.8vw,20px);
  background:var(--surface);
}

.file-size-heading{
  display:flex;
  align-items:center;
  gap:12px;
  padding:
    4px
    7px
    clamp(9px,1vw,12px);
  color:var(--muted-2);
  font-size:
    clamp(9px,1vw,11px);
  font-weight:700;
  letter-spacing:.12em;
  text-transform:uppercase;
}

.file-size-heading svg{
  width:
    clamp(17px,1.8vw,22px);
  height:
    clamp(17px,1.8vw,22px);
  flex-shrink:0;
}

.file-size-inner{
  padding:
    clamp(15px,1.8vw,20px);
  padding-bottom:4px;
  border:
    1px solid var(--border-light);
  border-radius:
    clamp(11px,1.4vw,15px);
  background:var(--surface-2);
}

.file-size-inner-header{
  margin-bottom:
    clamp(13px,1.6vw,17px);
  color:var(--text);
  font-size:
    clamp(16px,1.8vw,20px);
  line-height:1.2;
  font-weight:700;
}

.file-size-fields{
  display:grid;
  grid-template-columns:
    1fr 1fr;
  gap:
    clamp(9px,1.2vw,12px);
}

.size-field label{
  display:block;
  margin-bottom:
    clamp(5px,1vw,7px);
  color:var(--muted-2);
  font-size:
    clamp(10px,1.1vw,12px);
}

.size-input{
  width:100%;
  padding:
    9px
    clamp(10px,1.3vw,14px);
  border:
    1px solid #343740;
  border-radius:
    clamp(10px,1.3vw,13px);
  background:var(--input);
  color:#fff;
  font-size:
    clamp(12px,1.3vw,14px);
  line-height:1.25;
  outline:0;
}

.size-input:focus{
  border-color:#4b4f59;
}

.size-input::placeholder{
  color:var(--muted-2);
}

.filter-error{
  min-height:0;
  margin-top:0;
  color:var(--error);
  line-height:1.4;
  font-size:11px;
}

.filter-error:empty{
  display:none;
}

.filter-error:not(:empty){
  margin-top:8px;
  padding-bottom:4px;
}

.quality-section,
.filter-section{
  margin-top:
    clamp(26px,3.5vw,38px);
}

.quality-list,
.filter-setting-list{
  display:flex;
  flex-direction:column;
  gap:
    clamp(6px,.9vw,9px);
  padding:
    clamp(10px,1.2vw,13px);
  border:
    1px solid var(--border);
  border-radius:
    clamp(15px,1.8vw,20px);
  background:var(--surface);
}

.quality-row,
.filter-setting-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  min-height:
    clamp(52px,5vw,62px);
  padding:
    clamp(9px,1.1vw,12px)
    clamp(11px,1.3vw,15px);
  border-radius:
    clamp(11px,1.3vw,14px);
  background:var(--surface-2);
}

.quality-name,
.filter-setting-name{
  display:flex;
  align-items:center;
  gap:
    clamp(9px,1.2vw,13px);
  color:#ededf0;
  font-size:
    clamp(14px,1.5vw,17px);
  font-weight:600;
  cursor:pointer;
}

.quality-checkbox,
.filter-setting-checkbox{
  width:
    clamp(18px,1.8vw,21px);
  height:
    clamp(18px,1.8vw,21px);
  margin:0;
  flex-shrink:0;
}

.move-buttons{
  display:flex;
  gap:
    clamp(5px,.7vw,7px);
}

.move-button{
  width:
    clamp(32px,3.3vw,40px);
  height:
    clamp(32px,3.3vw,40px);
  padding:0;
  border:
    1px solid #343740;
  border-radius:
    clamp(9px,1.1vw,11px);
  background:var(--input);
  color:#c9cad0;
  font-size:
    clamp(13px,1.5vw,16px);
}

.move-button:disabled{
  opacity:.3;
}

#saveConfiguration{
  display:flex;
  align-items:center;
  justify-content:center;
  width:100%;
  height:
    clamp(46px,4.5vw,54px);
  margin-top:
    clamp(20px,2.5vw,28px);
  padding:
    0 20px;
  border:0;
  border-radius:
    clamp(12px,1.5vw,15px);
  background:var(--white);
  color:var(--black);
  font-size:
    clamp(13px,1.4vw,15px);
  font-weight:700;
  line-height:1;
  cursor:pointer;
}

#saveConfiguration:disabled{
  opacity:.55;
}

#result{
  display:none;
  margin-top:
    clamp(24px,3vw,32px);
}

.result-label{
  display:block;
  margin-bottom:9px;
  color:var(--muted-2);
  font-size:
    clamp(9px,1vw,11px);
  font-weight:700;
  letter-spacing:.12em;
  text-transform:uppercase;
}

.result-row{
  display:flex;
  align-items:stretch;
  gap:8px;
  width:100%;
}

#manifestUrl{
  flex:1;
  min-width:0;
  width:0;
  height:
    clamp(42px,4vw,48px);
  padding:
    0 12px;
  border:
    1px solid #343740;
  border-radius:
    clamp(10px,1.3vw,13px);
  outline:none;
  background:var(--surface-2);
  color:#c9cad0;
  font-size:
    clamp(11px,1.1vw,13px);
}

#copyButton{
  flex:
    0 0 clamp(62px,7vw,72px);
  width:
    clamp(62px,7vw,72px);
  height:
    clamp(42px,4vw,48px);
  padding:0;
  border:0;
  border-radius:
    clamp(10px,1.3vw,13px);
  background:var(--input);
  color:#fff;
  font-size:
    clamp(11px,1.2vw,13px);
  font-weight:700;
  cursor:pointer;
}

#installButton{
  display:flex;
  align-items:center;
  justify-content:center;
  width:100%;
  height:
    clamp(42px,4vw,48px);
  margin-top:10px;
  border:0;
  border-radius:
    clamp(10px,1.3vw,13px);
  background:var(--white);
  color:var(--black);
  font-size:
    clamp(11px,1.2vw,13px);
  font-weight:700;
  text-decoration:none;
}

#installButton.disabled{
  opacity:.35;
  pointer-events:none;
}

.note{
  margin-top:
    clamp(16px,2vw,22px);
  color:var(--muted-2);
  font-size:
    clamp(9px,1vw,11px);
  line-height:1.5;
}

@media(max-width:600px){
  .container{
    width:100%;
    padding:
      22px
      0
      48px;
  }

  .settings-header{
    margin-bottom:28px;
  }

  .settings-title{
    font-size:30px;
    letter-spacing:-1.2px;
  }

  .section-title,
  .configuration-title{
    margin-bottom:5px;
    font-size:23px;
    letter-spacing:-.7px;
  }

  .section-description,
  .description{
    margin-bottom:11px;
    font-size:11px;
  }

  .file-size-card{
    padding:9px;
    border-radius:14px;
  }

  .file-size-heading{
    padding:
      3px
      6px
      8px;
    font-size:10px;
  }

  .file-size-heading svg{
    width:18px;
    height:18px;
  }

  .file-size-inner{
    padding:12px;
    padding-bottom:4px;
    border-radius:11px;
  }

  .file-size-inner-header{
    margin-bottom:12px;
    font-size:16px;
  }

  .file-size-fields{
    gap:8px;
  }

  .size-field label{
    margin-bottom:5px;
    font-size:10px;
  }

  .size-input{
    padding:
      8px
      10px;
    border-radius:9px;
    font-size:12px;
  }

  .filter-error{
    font-size:10px;
  }

  .quality-section,
  .filter-section{
    margin-top:25px;
  }

  .quality-list,
  .filter-setting-list{
    gap:6px;
    padding:9px;
    border-radius:14px;
  }

  .quality-row,
  .filter-setting-row{
    min-height:47px;
    padding:
      8px
      10px;
    border-radius:11px;
  }

  .quality-name,
  .filter-setting-name{
    gap:9px;
    font-size:13px;
  }

  .quality-checkbox,
  .filter-setting-checkbox{
    width:18px;
    height:18px;
  }

  .move-buttons{
    gap:5px;
  }

  .move-button{
    width:30px;
    height:30px;
    border-radius:9px;
    font-size:13px;
  }

  #saveConfiguration{
    height:44px;
    margin-top:18px;
    border-radius:12px;
    font-size:13px;
  }

  #result{
    margin-top:22px;
  }

  .result-row{
    gap:6px;
  }

  #manifestUrl{
    height:42px;
    padding:
      0 10px;
    border-radius:9px;
    font-size:10px;
  }

  #copyButton{
    flex-basis:58px;
    width:58px;
    height:42px;
    border-radius:9px;
    font-size:11px;
  }

  #installButton{
    height:42px;
    border-radius:10px;
    font-size:11px;
  }

  .note{
    font-size:10px;
  }
}

@media(max-width:380px){
  .container{
    padding-left:0;
    padding-right:0;
  }

  .settings-title{
    font-size:28px;
  }

  .section-title,
  .configuration-title{
    font-size:22px;
  }

  .file-size-card,
  .quality-list,
  .filter-setting-list{
    padding:8px;
  }

  .file-size-inner{
    padding:12px;
    padding-bottom:4px;
  }

  .quality-row,
  .filter-setting-row{
    padding-left:9px;
    padding-right:9px;
  }

  .move-button{
    width:28px;
    height:28px;
  }
}
</style>
</head>

<body>

<div class="container">

  <div id="configuration">

    <div class="settings-header">
      <h1 class="settings-title">
        Settings
      </h1>
    </div>

    <section class="file-size-section">

      <div class="section-title">
        File size
      </div>

      <div class="section-description">
        Keep streams between the selected minimum and maximum size.
      </div>

      <div class="file-size-card">

        <div class="file-size-heading">
          <span>
            FILE SIZE
          </span>

          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>
          </svg>
        </div>

        <div class="file-size-inner">

          <div class="file-size-inner-header">
            Keep streams between
          </div>

          <div class="file-size-fields">

            <div class="size-field">
              <label for="minSize">
                Min (GB)
              </label>

              <input
                id="minSize"
                class="size-input"
                type="number"
                min="0"
                max="200"
                step="0.1"
                placeholder="No minimum"
                value="${fileSize.minGb ?? ""}"
              >
            </div>

            <div class="size-field">
              <label for="maxSize">
                Max (GB)
              </label>

              <input
                id="maxSize"
                class="size-input"
                type="number"
                min="0"
                max="200"
                step="0.1"
                placeholder="No maximum"
                value="${fileSize.maxGb ?? ""}"
              >
            </div>

          </div>

          <div
            id="fileSizeStatus"
            class="filter-error"
          ></div>

        </div>
      </div>
    </section>

    <section class="quality-section">

      <div class="configuration-title">
        Quality settings
      </div>

      <div class="description">
        Enable the qualities you want. Move them up or down to set their priority.
      </div>

      <div
        id="qualityList"
        class="quality-list"
      >
        ${qualityRows(qualities)}
      </div>

    </section>

    <section class="filter-section">

      <div class="configuration-title">
        Stream filters
      </div>

      <div class="description">
        Enable the stream types you want to keep. These settings do not change quality priority.
      </div>

      <div
        id="filterList"
        class="filter-setting-list"
      >
        ${filterRows(filters)}
      </div>

    </section>

    <button
      id="saveConfiguration"
      type="button"
    >
      Save Configuration
    </button>

    <div id="result">

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

      <a
        id="installButton"
        class="disabled"
        href="#"
      >
        Install in Stremio
      </a>

      <div class="note">
        On iOS, if the Install button does not open Stremio,
        use Copy and paste the manifest URL into Stremio's Add Addon field.
      </div>

    </div>

  </div>

</div>

<script
  type="application/json"
  id="showbox-config-data"
>${configData}</script>

<script src="/configure-client.js"></script>

</body>
</html>
`;

    const headers = {
      "Content-Type":
        "text/html; charset=utf-8",

      "Cache-Control":
        "no-store",

      "X-Content-Type-Options":
        "nosniff",

      "Referrer-Policy":
        "no-referrer"
    };

    if(setCookie){
      headers["Set-Cookie"] =
        setCookie;
    }

    return new Response(
      html,
      {
        status:200,
        headers
      }
    );
  }

  return expiredResponse();
}
