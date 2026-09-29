import {
  createConfig,
  getConfig,
  saveConfig,
  createHomepageSession,
  getHomepageSession,
  setHomepageSessionToken
} from "./config-store.js";

const DEFAULT_QUALITIES=[
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];

const MAX_CONFIG_BODY_BYTES=
  16*1024;

const MAX_TOKEN_LENGTH=4096;

const MAX_QUALITY_ITEMS=
  DEFAULT_QUALITIES.length;

const MAX_FILE_SIZE_GB=200;

const CREATE_CONFIG_RATE_LIMIT=10;

const CREATE_CONFIG_RATE_WINDOW_MS=
  60*1000;

const MAX_RATE_LIMIT_ENTRIES=5000;

const createConfigRateLimits=
  new Map();

function qualityRows(){
  return DEFAULT_QUALITIES.map(
    (quality,index)=>`
      <div class="quality-row">
        <label class="quality-name">
          <input
            type="checkbox"
            class="quality-checkbox"
            data-quality="${quality}"
            checked
          >
          <span>${quality}</span>
        </label>

        <div class="move-buttons">
          <button
            type="button"
            class="move-button"
            data-action="up"
            ${index===0?"disabled":""}
          >↑</button>

          <button
            type="button"
            class="move-button"
            data-action="down"
            ${
              index===
              DEFAULT_QUALITIES.length-1
                ?"disabled"
                :""
            }
          >↓</button>
        </div>
      </div>
    `
  ).join("");
}

function filterRows(){
  return `
    <div class="filter-setting-row">
      <label class="filter-setting-name">
        <input
          type="checkbox"
          class="filter-setting-checkbox"
          id="camFilter"
          checked
        >
        <span>CAM</span>
      </label>
    </div>
  `;
}

function jsonResponse(
  body,
  status=200,
  extraHeaders={}
){
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:{
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",

        "Referrer-Policy":
          "no-referrer",

        ...extraHeaders
      }
    }
  );
}

function validateFileSize(
  fileSize
){
  if(
    fileSize.minGb!==null&&
    (
      !Number.isFinite(
        fileSize.minGb
      )||
      fileSize.minGb<0||
      fileSize.minGb>
        MAX_FILE_SIZE_GB
    )
  ){
    return "Minimum file size must be between 0 and 200 GB.";
  }

  if(
    fileSize.maxGb!==null&&
    (
      !Number.isFinite(
        fileSize.maxGb
      )||
      fileSize.maxGb<0||
      fileSize.maxGb>
        MAX_FILE_SIZE_GB
    )
  ){
    return "Maximum file size must be between 0 and 200 GB.";
  }

  if(
    fileSize.minGb!==null&&
    fileSize.maxGb!==null&&
    fileSize.minGb>
      fileSize.maxGb
  ){
    return "Minimum size cannot be greater than maximum size.";
  }

  return null;
}

function normalizeQualities(
  input
){
  if(!Array.isArray(input)){
    return [];
  }

  const allowed=
    new Set(
      DEFAULT_QUALITIES
    );

  const seen=new Set();
  const result=[];

  for(
    const item of input
  ){
    if(
      !item||
      typeof item!=="object"||
      typeof item.name!=="string"
    ){
      continue;
    }

    const name=
      item.name.trim();

    if(
      !allowed.has(name)||
      seen.has(name)
    ){
      continue;
    }

    seen.add(name);

    result.push({
      name,
      enabled:
        item.enabled!==false
    });

    if(
      result.length>=
      DEFAULT_QUALITIES.length
    ){
      break;
    }
  }

  return result;
}

function isRateLimited(ip){
  const now=Date.now();

  for(
    const [
      key,
      entry
    ] of createConfigRateLimits
  ){
    if(
      now-entry.windowStart>=
      CREATE_CONFIG_RATE_WINDOW_MS
    ){
      createConfigRateLimits.delete(
        key
      );
    }
  }

  if(
    createConfigRateLimits.size>=
      MAX_RATE_LIMIT_ENTRIES&&
    !createConfigRateLimits.has(
      ip
    )
  ){
    return true;
  }

  let entry=
    createConfigRateLimits.get(
      ip
    );

  if(
    !entry||
    now-entry.windowStart>=
      CREATE_CONFIG_RATE_WINDOW_MS
  ){
    entry={
      windowStart:now,
      count:0
    };

    createConfigRateLimits.set(
      ip,
      entry
    );
  }

  entry.count++;

  return (
    entry.count>
    CREATE_CONFIG_RATE_LIMIT
  );
}

function homepageScript(
  session
){
  return `
(function(){
"use strict";

const tokenInput=
  document.getElementById(
    "tokenInput"
  );

const generateButton=
  document.getElementById(
    "generateButton"
  );

const backButton=
  document.getElementById(
    "backButton"
  );

const checkStatus=
  document.getElementById(
    "checkStatus"
  );

const tokenPage=
  document.getElementById(
    "tokenPage"
  );

const configuration=
  document.getElementById(
    "configuration"
  );

const qualityList=
  document.getElementById(
    "qualityList"
  );

const filterList=
  document.getElementById(
    "filterList"
  );

const minSizeInput=
  document.getElementById(
    "minSize"
  );

const maxSizeInput=
  document.getElementById(
    "maxSize"
  );

const fileSizeStatus=
  document.getElementById(
    "fileSizeStatus"
  );

const saveConfiguration=
  document.getElementById(
    "saveConfiguration"
  );

const result=
  document.getElementById(
    "result"
  );

const manifestUrl=
  document.getElementById(
    "manifestUrl"
  );

const copyButton=
  document.getElementById(
    "copyButton"
  );

const installButton=
  document.getElementById(
    "installButton"
  );

const sessionId=
  ${JSON.stringify(session.id)};

const expiresAt=
  ${session.expiresAt};

let currentToken="";
let hasGenerated=false;
let configId="";

function expire(){
  location.reload();
}

setTimeout(
  expire,
  Math.max(
    0,
    expiresAt-Date.now()
  )
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
    row=>{
      const checkbox=
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
  return {
    cam:
      document.getElementById(
        "camFilter"
      ).checked
  };
}

function getFileSizeConfig(){
  const minValue=
    minSizeInput.value.trim();

  const maxValue=
    maxSizeInput.value.trim();

  return {
    minGb:
      minValue===""
        ?null
        :Number(minValue),

    maxGb:
      maxValue===""
        ?null
        :Number(maxValue)
  };
}

function validateFileSizeInputs(){
  const fileSize=
    getFileSizeConfig();

  let error="";

  if(
    fileSize.minGb!==null&&
    (
      !Number.isFinite(
        fileSize.minGb
      )||
      fileSize.minGb<0||
      fileSize.minGb>200
    )
  ){
    error=
      "Minimum file size must be between 0 and 200 GB.";
  }

  else if(
    fileSize.maxGb!==null&&
    (
      !Number.isFinite(
        fileSize.maxGb
      )||
      fileSize.maxGb<0||
      fileSize.maxGb>200
    )
  ){
    error=
      "Maximum file size must be between 0 and 200 GB.";
  }

  else if(
    fileSize.minGb!==null&&
    fileSize.maxGb!==null&&
    fileSize.minGb>
      fileSize.maxGb
  ){
    error=
      "Minimum size cannot be greater than maximum size.";
  }

  fileSizeStatus.textContent=
    error;

  fileSizeStatus.className=
    error
      ?"filter-error"
      :"";

  return !error;
}

function clearManifest(){
  manifestUrl.value="";

  installButton.classList.add(
    "disabled"
  );

  installButton.href="#";

  result.style.display=
    "none";
}

function showConfigurationPage(){
  tokenPage.style.display=
    "none";

  configuration.style.display=
    "block";

  window.scrollTo(
    0,
    0
  );
}

function showTokenPage(){
  configuration.style.display=
    "none";

  tokenPage.style.display=
    "block";

  checkStatus.textContent="";
  checkStatus.className="";

  window.scrollTo(
    0,
    0
  );
}

function settingsChanged(){
  if(!hasGenerated){
    return;
  }

  clearManifest();

  checkStatus.textContent=
    "Settings changed. Save the configuration to update the addon.";

  checkStatus.className="";
}

async function generate(){
  const token=
    tokenInput.value.trim();

  if(!token){
    checkStatus.textContent=
      "Enter your ShowBox UI token first.";

    checkStatus.className=
      "error";

    return;
  }

  if(
    token.length<=100||
    token.length>4096
  ){
    checkStatus.textContent=
      "Invalid Cookie";

    checkStatus.className=
      "error";

    return;
  }

  generateButton.disabled=true;

  generateButton.textContent=
    "Generating...";

  try{
    const response=
      await fetch(
        "/create-config",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              action:
                "prepare",

              sessionId,

              uiToken:
                token
            }),

          cache:"no-store"
        }
      );

    const data=
      await response.json();

    if(
      response.status===410||
      response.status===403
    ){
      expire();
      return;
    }

    if(!response.ok){
      throw new Error(
        data.error||
        "Failed to start configuration"
      );
    }

    currentToken=token;
    hasGenerated=true;

    saveConfiguration.style.display=
      "flex";

    clearManifest();

    checkStatus.textContent="";
    checkStatus.className="";

    showConfigurationPage();
  }

  catch(error){
    checkStatus.textContent=
      error.message||
      "Failed to start configuration.";

    checkStatus.className=
      "error";
  }

  finally{
    generateButton.disabled=
      false;

    generateButton.textContent=
      "Generate";
  }
}

async function save(){
  if(
    !hasGenerated||
    !currentToken
  ){
    return;
  }

  const qualities=
    getQualityConfig();

  if(
    !qualities.some(
      item=>item.enabled
    )
  ){
    checkStatus.textContent=
      "Enable at least one quality.";

    checkStatus.className=
      "error";

    return;
  }

  if(
    !validateFileSizeInputs()
  ){
    return;
  }

  saveConfiguration.disabled=
    true;

  saveConfiguration.textContent=
    "Saving...";

  try{
    const response=
      await fetch(
        "/create-config",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              action:
                "save",

              sessionId,

              configId,

              fileSize:
                getFileSizeConfig(),

              qualities,

              filters:
                getFilterConfig()
            }),

          cache:"no-store"
        }
      );

    const data=
      await response.json();

    if(
      response.status===410||
      response.status===403
    ){
      expire();
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

    configId=
      data.configId||
      configId;

    manifestUrl.value=
      data.manifestUrl;

    installButton.href=
      data.stremioUrl;

    installButton.classList.remove(
      "disabled"
    );

    result.style.display=
      "block";

    checkStatus.textContent=
      "Configuration saved.";

    checkStatus.className=
      "success";

    window.scrollTo({
      top:
        document.body.scrollHeight,
      behavior:
        "smooth"
    });
  }

  catch(error){
    checkStatus.textContent=
      error.message||
      "Failed to save configuration.";

    checkStatus.className=
      "error";
  }

  finally{
    if(
      document.visibilityState!=="hidden"
    ){
      saveConfiguration.disabled=
        false;

      saveConfiguration.textContent=
        "Save Configuration";
    }
  }
}

qualityList.addEventListener(
  "change",
  settingsChanged
);

filterList.addEventListener(
  "change",
  settingsChanged
);

qualityList.addEventListener(
  "click",
  event=>{
    const button=
      event.target.closest(
        ".move-button"
      );

    if(!button){
      return;
    }

    const row=
      button.closest(
        ".quality-row"
      );

    const rows=
      getRows();

    const index=
      rows.indexOf(row);

    if(
      button.dataset.action===
        "up"&&
      index>0
    ){
      qualityList.insertBefore(
        row,
        rows[index-1]
      );
    }

    if(
      button.dataset.action===
        "down"&&
      index<
        rows.length-1
    ){
      qualityList.insertBefore(
        rows[index+1],
        row
      );
    }

    settingsChanged();
  }
);

minSizeInput.addEventListener(
  "input",
  ()=>{
    validateFileSizeInputs();
    settingsChanged();
  }
);

maxSizeInput.addEventListener(
  "input",
  ()=>{
    validateFileSizeInputs();
    settingsChanged();
  }
);

tokenInput.addEventListener(
  "input",
  ()=>{
    currentToken="";
    hasGenerated=false;
    configId="";

    configuration.style.display=
      "none";

    tokenPage.style.display=
      "block";

    clearManifest();

    saveConfiguration.style.display=
      "none";

    checkStatus.textContent="";
    checkStatus.className="";
  }
);

generateButton.addEventListener(
  "click",
  generate
);

backButton.addEventListener(
  "click",
  showTokenPage
);

saveConfiguration.addEventListener(
  "click",
  save
);

copyButton.addEventListener(
  "click",
  async()=>{
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

    copyButton.textContent=
      "Copied";

    setTimeout(
      ()=>{
        copyButton.textContent=
          "Copy";
      },
      1500
    );
  }
);

})();
`;
}

export default async function handler(
  request,
  context
){
  const url=
    new URL(request.url);

  const pathname=
    url.pathname;

  if(
    pathname==="/create-config"
  ){
    if(
      request.method!=="POST"
    ){
      return jsonResponse(
        {
          error:
            "Method not allowed"
        },
        405,
        {
          Allow:"POST"
        }
      );
    }

    const clientIp=
      context?.ip||
      "unknown";

    if(
      isRateLimited(
        clientIp
      )
    ){
      return jsonResponse(
        {
          error:
            "Too many configuration requests. Please try again later."
        },
        429,
        {
          "Retry-After":
            "60"
        }
      );
    }

    try{
      const contentLength=
        request.headers.get(
          "content-length"
        );

      if(
        contentLength&&
        Number.isFinite(
          Number(contentLength)
        )&&
        Number(contentLength)>
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

      const requestBody=
        await request.text();

      if(
        new TextEncoder()
          .encode(
            requestBody
          )
          .byteLength>
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
        body=
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
        !body||
        typeof body!=="object"||
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

      const sessionId=
        typeof body.sessionId===
          "string"
          ?body.sessionId
          :"";

      const session=
        await getHomepageSession(
          sessionId
        );

      if(!session){
        return jsonResponse(
          {
            error:
              "Configuration session has expired"
          },
          410
        );
      }

      if(
        body.action==="prepare"
      ){
        const token=
          typeof body.uiToken===
            "string"
            ?body.uiToken.trim()
            :"";

        if(!token){
          return jsonResponse(
            {
              error:
                "ShowBox UI token is required"
            },
            400
          );
        }

        if(
          token.length>
          MAX_TOKEN_LENGTH
        ){
          return jsonResponse(
            {
              error:
                "ShowBox UI token is too long"
            },
            400
          );
        }

        await setHomepageSessionToken(
          sessionId,
          token
        );

        return jsonResponse({
          ok:true
        });
      }

      if(
        body.action!=="save"
      ){
        return jsonResponse(
          {
            error:
              "Invalid configuration action"
          },
          400
        );
      }

      const currentSession=
        await getHomepageSession(
          sessionId
        );

      if(
        !currentSession||
        typeof currentSession.uiToken!==
          "string"||
        !currentSession.uiToken
      ){
        return jsonResponse(
          {
            error:
              "Configuration session is invalid or expired"
          },
          410
        );
      }

      let minGb=null;
      let maxGb=null;

      if(
        body.fileSize&&
        typeof body.fileSize==="object"&&
        !Array.isArray(
          body.fileSize
        )
      ){
        if(
          body.fileSize.minGb!==null&&
          body.fileSize.minGb!==undefined&&
          body.fileSize.minGb!==""
        ){
          minGb=
            Number(
              body.fileSize.minGb
            );
        }

        if(
          body.fileSize.maxGb!==null&&
          body.fileSize.maxGb!==undefined&&
          body.fileSize.maxGb!==""
        ){
          maxGb=
            Number(
              body.fileSize.maxGb
            );
        }
      }

      const fileSize={
        minGb,
        maxGb
      };

      const fileSizeError=
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

      if(
        Array.isArray(
          body.qualities
        )&&
        body.qualities.length>
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

      const qualities=
        normalizeQualities(
          body.qualities
        );

      if(
        !qualities.some(
          item=>item.enabled
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

      const filters=
        body.filters&&
        typeof body.filters==="object"&&
        !Array.isArray(
          body.filters
        )
          ?{
              cam:
                body.filters.cam!==false
            }
          :{
              cam:true
            };

      const config={
        uiToken:
          currentSession.uiToken,

        fileSize,

        qualities,

        filters
      };

      let finalConfigId=
        /^[a-f0-9]{32}$/i.test(
          body.configId||""
        )
          ?body.configId
          :null;

      if(finalConfigId){
        const existing=
          await getConfig(
            finalConfigId
          );

        if(existing){
          await saveConfig(
            finalConfigId,
            config
          );
        }

        else{
          finalConfigId=
            await createConfig(
              config
            );
        }
      }

      else{
        finalConfigId=
          await createConfig(
            config
          );
      }

      return jsonResponse({
        configId:
          finalConfigId,

        manifestUrl:
          `${url.origin}/${finalConfigId}/manifest.json`,

        stremioUrl:
          `stremio://${url.host}/${finalConfigId}/manifest.json`
      });
    }

    catch(error){
      console.error(
        "[ShowBox] Config creation failed:",
        error?.message
      );

      return jsonResponse(
        {
          error:
            "Failed to create configuration"
        },
        500
      );
    }
  }

  if(
    pathname==="/manifest.json"||
    /^\/[^/]+\/manifest\.json$/.test(
      pathname
    )
  ){
    if(
      request.method!=="GET"
    ){
      return new Response(
        "Method Not Allowed",
        {
          status:405,
          headers:{
            Allow:"GET",
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

    return new Response(
      JSON.stringify({
        id:
          "com.showbox.stremio",

        version:
          "1.0.0",

        name:
          "ShowBox",

        description:
          "ShowBox Stremio addon",

        resources:
          ["stream"],

        types:
          ["movie","series"],

        catalogs:[],

        behaviorHints:{
          configurable:true,
          configurationRequired:false
        },

        config:[
          {
            key:"uiToken",

            type:"password",

            title:
              "ShowBox UI Token",

            required:true
          }
        ]
      }),
      {
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

  if(
    request.method!=="GET"
  ){
    return new Response(
      "Method Not Allowed",
      {
        status:405,
        headers:{
          Allow:"GET",

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

  const session=
    await createHomepageSession();

  const html=`
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

<title>ShowBox Stremio Addon</title>

<style>

:root{
  color-scheme:dark;

  --bg:#0d0e11;
  --surface:#15161b;
  --surface-2:#1d1f25;
  --surface-3:#252831;

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

  --radius-lg:22px;
  --radius-md:16px;
  --radius-sm:13px;
}

*{
  box-sizing:border-box;
}

html{
  background:var(--bg);
}

body{
  margin:0;
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
}

.container{
  width:
    min(
      clamp(500px,68vw,760px),
      calc(100% - 28px)
    );

  margin:auto;

  padding:
    20px
    0
    clamp(50px,6vw,80px);
}

h1{
  margin:25px 0 0 0;

  font-size:
    clamp(34px,5vw,44px);

  line-height:1;

  font-weight:750;

  letter-spacing:-1.8px;
}

.subtitle{
  max-width:520px;

  margin:
    14px 0 0;

  color:var(--muted);

  font-size:14px;

  line-height:1.55;
}

.title{
  display:block;

  margin:
    30px 0 9px;

  color:var(--muted-2);

  font-size:11px;

  font-weight:700;

  letter-spacing:.12em;

  text-transform:uppercase;
}

#tokenInput{
  width:100%;

  height:54px;

  padding:
    0 16px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  outline:none;

  background:
    var(--surface-2);

  color:var(--text);

  font-size:14px;
}

#tokenInput::placeholder{
  color:var(--muted-2);
}

#generateButton{
  display:flex;

  align-items:center;

  justify-content:center;

  width:100%;

  height:50px;

  margin-top:12px;

  padding:
    0 20px;

  border:0;

  border-radius:14px;

  background:
    var(--white);

  color:
    var(--black);

  font-size:14px;

  font-weight:700;

  cursor:pointer;
}

#generateButton:disabled{
  opacity:.55;

  cursor:default;
}

#checkStatus{
  min-height:18px;

  margin-top:10px;

  color:var(--muted-2);

  font-size:12px;
}

.success{
  color:
    var(--success)!important;
}

.error{
  color:
    var(--error)!important;
}

#configuration{
  display:none;
}

.settings-header{
  display:flex;

  align-items:center;

  justify-content:space-between;

  gap:12px;

  margin-bottom:28px;
}

.settings-title{
  margin:0;

  color:var(--text);

  font-size:
    clamp(40px, 1.5rem + 3.5vw, 64px);

  line-height:1.15;

  font-weight:700;

  letter-spacing:-.7px;
}

.settings-description{
  margin:
    6px 0 0;

  color:var(--muted-2);

  font-size:12px;

  line-height:1.45;
}

.back-button{
  display:inline-flex;

  align-items:center;

  justify-content:center;

  white-space:nowrap;

  flex-shrink:0;

  height:40px;

  padding:
    0 15px;

  border:
    1px solid var(--border-light);

  border-radius:11px;

  background:
    var(--surface-3);

  color:var(--text);

  font-size:13px;

  font-weight:650;

  cursor:pointer;
}

.section-title,
.configuration-title{
  margin:0;

  color:var(--text);

  font-size:
    clamp(27px,4vw,34px);

  line-height:1.15;

  font-weight:700;

  letter-spacing:-.7px;
}

.section-description,
.description{
  margin:
    6px 0 14px;

  color:var(--muted-2);

  font-size:12px;

  line-height:1.45;
}

.file-size-section{
  margin-top:0;
}

.file-size-card{
  padding:14px;

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-lg);

  background:
    var(--surface);
}

.file-size-inner{
  padding:
    20px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-md);

  background:
    var(--surface-2);
}

.file-size-inner-header{
  display:flex;

  align-items:center;

  gap:10px;

  margin-bottom:18px;

  color:var(--text);

  font-size:18px;

  font-weight:700;
}

.file-size-help{
  display:flex;

  align-items:center;

  justify-content:center;

  width:28px;

  height:28px;

  flex-shrink:0;

  border-radius:50%;

  background:
    var(--surface-3);

  color:var(--muted);

  font-size:14px;

  font-weight:700;
}

.file-size-fields{
  display:grid;

  grid-template-columns:
    1fr 1fr;

  gap:10px;
}

.size-field label{
  display:block;

  margin:
    0 0 7px;

  color:
    var(--muted-2);

  font-size:11px;

  font-weight:600;

  letter-spacing:.03em;
}

.size-input{
  width:100%;

  height:52px;

  padding:
    0 14px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  outline:none;

  background:
    var(--surface-3);

  color:
    var(--text);

  font-size:14px;
}

.size-input::placeholder{
  color:
    var(--muted-2);
}

.filter-error{
  min-height:18px;

  margin-top:10px;

  padding:
    0 7px;

  color:
    var(--error);

  font-size:12px;

  line-height:1.45;
}

.quality-section,
.filter-section{
  margin-top:38px;
}

.quality-list,
.filter-setting-list{
  display:flex;

  flex-direction:column;

  gap:8px;

  padding:8px;

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-lg);

  background:
    var(--surface);
}

.quality-row,
.filter-setting-row{
  display:flex;

  align-items:center;

  justify-content:space-between;

  min-height:62px;

  padding:
    11px 14px;

  border:
    1px solid transparent;

  border-radius:
    var(--radius-md);

  background:
    var(--surface-2);
}

.quality-name,
.filter-setting-name{
  display:flex;

  align-items:center;

  gap:12px;

  color:
    var(--text);

  font-size:15px;

  font-weight:600;

  cursor:pointer;
}

.quality-checkbox,
.filter-setting-checkbox{
  width:20px;

  height:20px;

  margin:0;

  accent-color:#f1f1f2;
}

.move-buttons{
  display:flex;

  gap:6px;
}

.move-button{
  width:36px;

  height:36px;

  padding:0;

  border:
    1px solid var(--border-light);

  border-radius:10px;

  background:
    var(--surface-3);

  color:
    var(--text-soft);

  font-size:16px;

  cursor:pointer;
}

.move-button:disabled{
  opacity:.3;

  cursor:default;
}

#saveConfiguration{
  display:none;

  align-items:center;

  justify-content:center;

  width:100%;

  height:50px;

  margin-top:40px;

  padding:
    0 20px;

  border:0;

  border-radius:14px;

  background:
    var(--white);

  color:
    var(--black);

  font-size:14px;

  font-weight:700;

  line-height:1;

  text-align:center;

  cursor:pointer;
}

#saveConfiguration:disabled{
  opacity:.55;

  cursor:default;
}

#result{
  display:none;

  margin-top:40px;
}

.result-label{
  display:block;

  margin-bottom:9px;

  color:
    var(--muted-2);

  font-size:11px;

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
  flex:1 1 auto;

  min-width:0;

  width:0;

  height:50px;

  padding:
    0 12px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  outline:none;

  background:
    var(--surface-2);

  color:
    var(--text-soft);

  font-size:11px;
}

#copyButton{
  flex:
    0 0 72px;

  width:72px;

  height:50px;

  padding:0;

  border:0;

  border-radius:
    var(--radius-sm);

  background:
    var(--surface-3);

  color:
    var(--text);

  font-size:12px;

  font-weight:650;

  cursor:pointer;
}

#installButton{
  display:flex;

  align-items:center;

  justify-content:center;

  width:100%;

  height:50px;

  margin-top:10px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  background:
    var(--white);

  color:
    var(--black);

  font-size:13px;

  font-weight:700;

  text-decoration:none;
}

#installButton.disabled{
  opacity:.35;

  pointer-events:none;
}

.note{
  margin-top:12px;

  color:
    var(--muted-2);

  font-size:11px;

  line-height:1.5;
}

@media(max-width:600px){

  .container{
    width:
      calc(100% - 24px);

    padding:
      35px 0 60px;
  }

  .settings-title{
    font-size:40px;
  }

  .section-title,
  .configuration-title{
    font-size:27px;
  }

  .file-size-inner{
    padding:18px;
  }

  .file-size-inner-header{
    font-size:17px;
  }

  .file-size-fields{
    gap:9px;
  }

  .result-row{
    flex-direction:row;
  }

}

</style>

</head>

<body>

<div class="container">

<div id="tokenPage">

<h1>
ShowBox
</h1>

<div class="subtitle">
Enter your FebBox UI token to generate your addon.
</div>

<label
  class="title"
  for="tokenInput"
>
ShowBox UI Token
</label>

<input
  id="tokenInput"
  type="text"
  autocomplete="off"
  autocapitalize="none"
  spellcheck="false"
  placeholder="Enter your ShowBox UI token"
>

<button
  id="generateButton"
  type="button"
>
Generate
</button>

<div id="checkStatus"></div>

</div>

<div id="configuration">

<div class="settings-header">

<div>

<h1 class="settings-title">
Settings
</h1>

<div class="settings-description">
Fine-tune your stream quality and filtering preferences.
</div>

</div>

<button
  id="backButton"
  class="back-button"
  type="button"
>
← Back
</button>

</div>

<section class="file-size-section">

<div class="section-title">
File size
</div>

<div class="section-description">
Keep streams between the selected minimum and maximum size.
</div>

<div class="file-size-card">

<div class="file-size-inner">

<div class="file-size-inner-header">

<span>
Keep streams between
</span>

<span
  class="file-size-help"
  aria-label="File size filter help"
>
?
</span>

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
>

</div>

</div>

<div
  id="fileSizeStatus"
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
${qualityRows()}
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
${filterRows()}
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

<script>

${homepageScript(session)}

</script>

</body>

</html>
`;

  return new Response(
    html,
    {
      headers:{
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

export const config={
  path:[
    "/",
    "/create-config",
    "/manifest.json",
    "/:config/manifest.json"
  ]
};
