import {
  createConfig,
  getConfig,
  saveConfig,
  createConfigureSession,
  checkConfigureSession
} from "./config-store.js";

const DEFAULT_QUALITIES=[
  {
    name:"ORG",
    enabled:true
  },
  {
    name:"4K",
    enabled:true
  },
  {
    name:"1440p",
    enabled:true
  },
  {
    name:"1080p",
    enabled:true
  },
  {
    name:"720p",
    enabled:true
  },
  {
    name:"480p",
    enabled:true
  },
  {
    name:"360p",
    enabled:true
  }
];

const MAX_CONFIG_BODY_BYTES=
  16*1024;

const MAX_QUALITY_ITEMS=
  DEFAULT_QUALITIES.length;

const MAX_FILE_SIZE_GB=200;

function jsonResponse(
  body,
  status=200
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
          "no-referrer"
      }
    }
  );
}

function decodeConfig(
  value
){
  try{
    if(!value){
      return {};
    }

    let base64=
      value
        .replace(
          /-/g,
          "+"
        )
        .replace(
          /_/g,
          "/"
        );

    while(
      base64.length%4
    ){
      base64+="=";
    }

    return JSON.parse(
      Buffer
        .from(
          base64,
          "base64"
        )
        .toString(
          "utf8"
        )
    );
  }

  catch{
    return {};
  }
}

function normalizeQualities(
  qualities
){
  if(!Array.isArray(qualities)){
    return DEFAULT_QUALITIES.map(
      item=>({...item})
    );
  }

  const allowed=
    new Map(
      DEFAULT_QUALITIES.map(
        item=>[
          item.name,
          item
        ]
      )
    );

  const result=[];
  const used=new Set();

  for(
    const item of qualities
  ){
    if(
      !item||
      typeof item!=="object"||
      !allowed.has(item.name)||
      used.has(item.name)
    ){
      continue;
    }

    result.push({
      name:item.name,
      enabled:
        item.enabled===true
    });

    used.add(
      item.name
    );
  }

  for(
    const item of DEFAULT_QUALITIES
  ){
    if(
      !used.has(item.name)
    ){
      result.push({
        ...item
      });
    }
  }

  return result;
}

function normalizeFilters(
  filters
){
  if(
    !filters||
    typeof filters!=="object"
  ){
    return {
      cam:true
    };
  }

  return {
    cam:
      filters.cam!==false
  };
}

function normalizeFileSize(
  fileSize
){
  if(
    !fileSize||
    typeof fileSize!=="object"
  ){
    return {
      minGb:null,
      maxGb:null
    };
  }

  const min=
    fileSize.minGb===null||
    fileSize.minGb===undefined||
    fileSize.minGb===""
      ?null
      :Number(
        fileSize.minGb
      );

  const max=
    fileSize.maxGb===null||
    fileSize.maxGb===undefined||
    fileSize.maxGb===""
      ?null
      :Number(
        fileSize.maxGb
      );

  return {
    minGb:
      Number.isFinite(min)
        ?min
        :null,

    maxGb:
      Number.isFinite(max)
        ?max
        :null
  };
}

function validateFileSize(
  fileSize
){
  const normalized=
    normalizeFileSize(
      fileSize
    );

  if(
    normalized.minGb!==null&&
    (
      normalized.minGb<0||
      normalized.minGb>
        MAX_FILE_SIZE_GB
    )
  ){
    throw new Error(
      "Minimum size must be between 0 and 200 GB."
    );
  }

  if(
    normalized.maxGb!==null&&
    (
      normalized.maxGb<0||
      normalized.maxGb>
        MAX_FILE_SIZE_GB
    )
  ){
    throw new Error(
      "Maximum size must be between 0 and 200 GB."
    );
  }

  if(
    normalized.minGb!==null&&
    normalized.maxGb!==null&&
    normalized.minGb>
      normalized.maxGb
  ){
    throw new Error(
      "Minimum size cannot be greater than maximum size."
    );
  }

  return normalized;
}

async function getConfigFromRequest(
  request
){
  const url=
    new URL(
      request.url
    );

  const pathname=
    url.pathname.replace(
      /\/+$/,
      ""
    );

  const match=
    pathname.match(
      /^\/configure\/([^/]+)$/
    )||
    pathname.match(
      /^\/([^/]+)\/configure$/
    );

  if(!match){
    return null;
  }

  const configValue=
    match[1];

  const stored=
    await getConfig(
      configValue
    );

  if(
    stored&&
    typeof stored==="object"&&
    !Array.isArray(stored)
  ){
    return {
      id:configValue,
      config:stored
    };
  }

  const legacy=
    decodeConfig(
      configValue
    );

  if(
    !legacy||
    typeof legacy!=="object"||
    Array.isArray(legacy)||
    !Object.keys(
      legacy
    ).length
  ){
    return null;
  }

  return {
    id:null,
    config:legacy
  };
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

export const config={
  path:[
    "/configure/:config",
    "/:config/configure"
  ]
};

export default async function handler(
  request
){
  const url=
    new URL(
      request.url
    );

  const configData=
    await getConfigFromRequest(
      request
    );

  if(!configData){
    return new Response(
      `
<!doctype html>
<html>
<head>
<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>
<title>ShowBox</title>
<style>
body{
  margin:0;
  padding:40px 20px;
  background:#111;
  color:#fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  text-align:center;
}
.card{
  max-width:560px;
  margin:auto;
  padding:28px;
  border-radius:18px;
  background:#17181d;
}
p{
  color:#aaa;
  line-height:1.5;
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
</html>
`,
      {
        status:400,
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

  const configId=
    configData.id;

  const existingConfig=
    configData.config;

  const sessionId=
    url.searchParams.get(
      "session"
    );

  /*
   * A Configure page must always have
   * an explicit temporary session.
   *
   * The first request creates one and
   * redirects to the session-bound URL.
   */
  if(
    request.method==="GET"&&
    !sessionId
  ){
    const session=
      await createConfigureSession();

    const redirectUrl=
      new URL(
        request.url
      );

    redirectUrl.searchParams.set(
      "session",
      session.id
    );

    return new Response(
      null,
      {
        status:302,
        headers:{
          Location:
            redirectUrl.toString(),

          "Cache-Control":
            "no-store"
        }
      }
    );
  }

  /*
   * Every request after the first one
   * must use the same temporary session.
   */
  const session=
    await checkConfigureSession(
      sessionId
    );

  if(!session.ok){
    return expiredResponse();
  }

  if(
    request.method==="POST"
  ){
    try{
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

      if(
        body.sessionId!==
        sessionId
      ){
        return jsonResponse(
          {
            error:
              "Configure session is invalid"
          },
          403
        );
      }

      const currentSession=
        await checkConfigureSession(
          sessionId
        );

      if(!currentSession.ok){
        return expiredResponse();
      }

      if(
        Array.isArray(
          body.qualities
        )&&
        body.qualities.length>
          MAX_QUALITY_ITEMS
      ){
        throw new Error(
          "Too many quality entries"
        );
      }

      const qualities=
        normalizeQualities(
          body.qualities
        );

      const fileSize=
        validateFileSize(
          body.fileSize
        );

      const filters=
        normalizeFilters(
          body.filters
        );

      const uiToken=
        typeof existingConfig.uiToken===
          "string"
          ?existingConfig.uiToken
          :"";

      const newConfig={
        ...existingConfig,

        uiToken,

        fileSize,

        qualities:
          qualities.map(
            item=>({
              name:item.name,
              enabled:item.enabled
            })
          ),

        filters
      };

      let finalConfigId=
        configId;

      if(!finalConfigId){
        finalConfigId=
          await createConfig(
            newConfig
          );
      }

      else{
        await saveConfig(
          finalConfigId,
          newConfig
        );
      }

      return jsonResponse({
        manifestUrl:
          `${url.origin}/${finalConfigId}/manifest.json`
      });
    }

    catch(error){
      console.error(
        "[Configure] Save error:",
        error?.message
      );

      const message=
        error?.message||
        "Invalid configuration";

      return jsonResponse(
        {
          error:message
        },
        message===
          "Configuration request is too large"
          ?413
          :400
      );
    }
  }

  const qualities=
    normalizeQualities(
      existingConfig.qualities
    );

  const fileSize=
    normalizeFileSize(
      existingConfig.fileSize
    );

  const filters=
    normalizeFilters(
      existingConfig.filters
    );

  const qualitiesJson=
    JSON.stringify(
      qualities
    )
      .replace(
        /</g,
        "\\u003c"
      )
      .replace(
        />/g,
        "\\u003e"
      )
      .replace(
        /&/g,
        "\\u0026"
      );

  const fileSizeJson=
    JSON.stringify(
      fileSize
    );

  const filtersJson=
    JSON.stringify(
      filters
    );

  const html=`
<!doctype html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,viewport-fit=cover"
>

<title>ShowBox</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;

  padding:
    clamp(32px,5vw,54px)
    16px
    60px;

  background:#0d0e11;

  color:#f1f1f3;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.container{
  width:
    min(
      clamp(560px,72vw,760px),
      100%
    );

  margin:auto;
}

h1{
  margin:0;

  font-size:
    clamp(30px,5vw,42px);

  line-height:1;

  letter-spacing:-1.4px;
}

.subtitle{
  margin:
    8px 0 28px;

  color:#858892;

  font-size:13px;
}

.card{
  padding:18px;

  margin-top:16px;

  border:
    1px solid #292c34;

  border-radius:20px;

  background:#15161b;
}

.card-title{
  font-size:18px;

  font-weight:700;
}

.card-description{
  margin:
    6px 0 18px;

  color:#858892;

  font-size:12px;

  line-height:1.5;
}

.size-row{
  display:grid;

  grid-template-columns:
    1fr 1fr;

  gap:10px;
}

.size-field label{
  display:block;

  margin-bottom:7px;

  color:#696c75;

  font-size:11px;
}

.size-field input{
  width:100%;

  height:50px;

  padding:
    0 13px;

  border:
    1px solid #343740;

  border-radius:12px;

  background:#252831;

  color:#fff;

  font-size:14px;

  outline:0;
}

.file-size-error{
  min-height:18px;

  margin-top:9px;

  color:#ff9b9b;

  font-size:12px;
}

.quality-list{
  display:flex;

  flex-direction:column;

  gap:8px;
}

.quality-row{
  display:flex;

  align-items:center;

  justify-content:space-between;

  min-height:58px;

  padding:
    10px 12px;

  border-radius:13px;

  background:#1d1f25;
}

.quality-row>input{
  width:20px;

  height:20px;

  margin:
    0 12px 0 0;
}

.quality-name{
  flex:1;

  font-size:14px;

  font-weight:600;
}

.quality-controls{
  display:flex;

  gap:6px;
}

.quality-controls button{
  width:36px;

  height:36px;

  border:
    1px solid #343740;

  border-radius:10px;

  background:#252831;

  color:#c9cad0;
}

.quality-controls button:disabled{
  opacity:.3;
}

.filter-row{
  padding:15px;

  border-radius:13px;

  background:#1d1f25;
}

.filter-label{
  display:flex;

  align-items:center;

  gap:12px;

  font-size:14px;

  font-weight:600;
}

.filter-label input{
  width:20px;

  height:20px;
}

.main{
  display:flex;

  align-items:center;

  justify-content:center;

  width:100%;

  height:50px;

  margin-top:22px;

  padding:0 20px;

  border:0;

  border-radius:14px;

  background:#f4f4f5;

  color:#101115;

  font-size:14px;

  font-weight:700;

  line-height:1;

  text-align:center;
}

.main:disabled{
  opacity:.55;
}

.status{
  min-height:18px;

  margin-top:10px;

  color:#858892;

  font-size:12px;
}

.result{
  display:none;

  margin-top:28px;
}

.manifest-url{
  overflow:auto;

  padding:13px;

  border:
    1px solid #343740;

  border-radius:12px;

  background:#1d1f25;

  color:#c9cad0;

  font-size:12px;

  word-break:break-all;
}

.result-buttons{
  display:flex;

  gap:8px;

  margin-top:10px;
}

.result-buttons button{
  flex:1;

  height:46px;

  border:0;

  border-radius:12px;

  font-weight:700;
}

.copy{
  background:#252831;

  color:#fff;
}

.install{
  background:#f4f4f5;

  color:#101115;
}

.note{
  margin-top:14px;

  color:#696c75;

  font-size:11px;

  line-height:1.5;
}

@media(max-width:600px){

  .container{
    width:
      calc(100% - 24px);
  }

  .size-row{
    gap:8px;
  }

}

</style>

</head>

<body>

<div class="container">

<h1>
ShowBox
</h1>

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

<div class="filter-row">

<label class="filter-label">

<input
  id="camFilter"
  type="checkbox"
>

<span>
CAM
</span>

</label>

</div>

</div>

<button
  id="save"
  class="main"
  type="button"
>
Save Configuration
</button>

<div
  id="status"
  class="status"
></div>

<div
  id="result"
  class="result"
>

<div class="card">

<div class="card-title">
Manifest URL
</div>

<div
  id="manifestUrl"
  class="manifest-url"
></div>

<div class="result-buttons">

<button
  id="copy"
  class="copy"
  type="button"
>
Copy
</button>

<button
  id="install"
  class="install"
  type="button"
>
Install in Stremio
</button>

</div>

</div>

</div>

<div class="note">
On iOS/iPadOS, if Stremio does not open automatically,
copy the manifest URL and add it manually through
Stremio's Add-ons page.
</div>

</div>

<script>

const qualities=
  ${qualitiesJson};

const fileSize=
  ${fileSizeJson};

const filters=
  ${filtersJson};

const sessionId=
  ${JSON.stringify(sessionId)};

const expiresAt=
  ${session.expiresAt};

const qualityList=
  document.getElementById(
    "qualityList"
  );

const minSizeInput=
  document.getElementById(
    "minSize"
  );

const maxSizeInput=
  document.getElementById(
    "maxSize"
  );

const fileSizeError=
  document.getElementById(
    "fileSizeError"
  );

const camFilter=
  document.getElementById(
    "camFilter"
  );

const saveButton=
  document.getElementById(
    "save"
  );

const status=
  document.getElementById(
    "status"
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
    "copy"
  );

const installButton=
  document.getElementById(
    "install"
  );

let expired=false;

function permanentlyExpire(){
  if(expired){
    return;
  }

  expired=true;

  saveButton.disabled=
    true;

  /*
   * Replace the current history entry
   * instead of pushing another one.
   *
   * This prevents Back from returning
   * to the expired Configure page.
   */
  history.replaceState(
    null,
    "",
    "/__showbox_configure_expired__"
  );

  location.replace(
    "/__showbox_configure_expired__"
  );
}

function checkLocalExpiry(){
  if(
    Date.now()>=expiresAt
  ){
    permanentlyExpire();

    return true;
  }

  return false;
}

setTimeout(
  permanentlyExpire,
  Math.max(
    0,
    expiresAt-Date.now()
  )
);

/*
 * Handles Safari/iOS restoring the page
 * from its back-forward cache.
 */
window.addEventListener(
  "pageshow",
  event=>{
    if(
      event.persisted||
      Date.now()>=expiresAt
    ){
      permanentlyExpire();
    }
  }
);

async function verifySession(){
  if(
    expired||
    checkLocalExpiry()
  ){
    return false;
  }

  try{
    const response=
      await fetch(
        window.location.pathname+
          window.location.search,
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              action:
                "check-session",

              sessionId
            }),

          cache:"no-store"
        }
      );

    if(
      response.status===404||
      response.status===410
    ){
      permanentlyExpire();

      return false;
    }

    if(!response.ok){
      return false;
    }

    const data=
      await response.json();

    if(
      !data.ok
    ){
      permanentlyExpire();

      return false;
    }

    return true;
  }

  catch{
    return true;
  }
}

function renderQualities(){
  qualityList.innerHTML="";

  qualities.forEach(
    (quality,index)=>{
      const row=
        document.createElement(
          "div"
        );

      row.className=
        "quality-row";

      const checkbox=
        document.createElement(
          "input"
        );

      checkbox.type=
        "checkbox";

      checkbox.checked=
        quality.enabled;

      checkbox.addEventListener(
        "change",
        ()=>{
          quality.enabled=
            checkbox.checked;

          invalidateResult();
        }
      );

      const name=
        document.createElement(
          "div"
        );

      name.className=
        "quality-name";

      name.textContent=
        quality.name;

      const controls=
        document.createElement(
          "div"
        );

      controls.className=
        "quality-controls";

      const up=
        document.createElement(
          "button"
        );

      up.type=
        "button";

      up.textContent=
        "↑";

      up.disabled=
        index===0;

      up.addEventListener(
        "click",
        ()=>{
          if(index===0){
            return;
          }

          const temp=
            qualities[index-1];

          qualities[index-1]=
            qualities[index];

          qualities[index]=
            temp;

          invalidateResult();

          renderQualities();
        }
      );

      const down=
        document.createElement(
          "button"
        );

      down.type=
        "button";

      down.textContent=
        "↓";

      down.disabled=
        index===
        qualities.length-1;

      down.addEventListener(
        "click",
        ()=>{
          if(
            index===
            qualities.length-1
          ){
            return;
          }

          const temp=
            qualities[index+1];

          qualities[index+1]=
            qualities[index];

          qualities[index]=
            temp;

          invalidateResult();

          renderQualities();
        }
      );

      controls.append(
        up,
        down
      );

      row.append(
        checkbox,
        name,
        controls
      );

      qualityList.appendChild(
        row
      );
    }
  );
}

function getFileSize(){
  return {
    minGb:
      minSizeInput.value.trim()===""
        ?null
        :Number(
          minSizeInput.value
        ),

    maxGb:
      maxSizeInput.value.trim()===""
        ?null
        :Number(
          maxSizeInput.value
        )
  };
}

function validate(){
  const value=
    getFileSize();

  let error="";

  if(
    minSizeInput.value.trim()!==""&&
    (
      !Number.isFinite(
        value.minGb
      )||
      value.minGb<0||
      value.minGb>200
    )
  ){
    error=
      "Minimum size must be between 0 and 200 GB.";
  }

  else if(
    maxSizeInput.value.trim()!==""&&
    (
      !Number.isFinite(
        value.maxGb
      )||
      value.maxGb<0||
      value.maxGb>200
    )
  ){
    error=
      "Maximum size must be between 0 and 200 GB.";
  }

  else if(
    value.minGb!==null&&
    value.maxGb!==null&&
    value.minGb>value.maxGb
  ){
    error=
      "Minimum size cannot be greater than maximum size.";
  }

  fileSizeError.textContent=
    error;

  return !error;
}

function invalidateResult(){
  manifestUrl.textContent="";

  result.style.display=
    "none";
}

async function saveConfiguration(){
  if(
    expired||
    !(await verifySession())
  ){
    return;
  }

  if(!validate()){
    return;
  }

  if(
    !qualities.some(
      quality=>quality.enabled
    )
  ){
    status.textContent=
      "Enable at least one quality.";

    return;
  }

  saveButton.disabled=
    true;

  saveButton.textContent=
    "Saving...";

  status.textContent="";

  try{
    const response=
      await fetch(
        window.location.pathname+
          window.location.search,
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              sessionId,

              qualities,

              fileSize:
                getFileSize(),

              filters:{
                cam:
                  camFilter.checked
              }
            }),

          cache:"no-store"
        }
      );

    if(
      response.status===404||
      response.status===410
    ){
      permanentlyExpire();

      return;
    }

    const data=
      await response.json();

    if(!response.ok){
      throw new Error(
        data.error||
        "Failed to save configuration"
      );
    }

    manifestUrl.textContent=
      data.manifestUrl;

    result.style.display=
      "block";

    status.textContent=
      "Configuration saved.";

    window.scrollTo({
      top:
        document.body.scrollHeight,
      behavior:
        "smooth"
    });
  }

  catch(error){
    if(!expired){
      status.textContent=
        error.message||
        "Something went wrong.";
    }
  }

  finally{
    if(!expired){
      saveButton.disabled=
        false;

      saveButton.textContent=
        "Save Configuration";
    }
  }
}

minSizeInput.addEventListener(
  "input",
  ()=>{
    invalidateResult();
    validate();
  }
);

maxSizeInput.addEventListener(
  "input",
  ()=>{
    invalidateResult();
    validate();
  }
);

camFilter.addEventListener(
  "change",
  invalidateResult
);

copyButton.addEventListener(
  "click",
  async()=>{
    if(
      !manifestUrl.textContent||
      expired
    ){
      return;
    }

    try{
      await navigator.clipboard.writeText(
        manifestUrl.textContent
      );

      copyButton.textContent=
        "Copied";

      setTimeout(
        ()=>{
          if(!expired){
            copyButton.textContent=
              "Copy";
          }
        },
        1500
      );
    }

    catch{
      status.textContent=
        "Copy failed. Select the URL manually.";
    }
  }
);

installButton.addEventListener(
  "click",
  ()=>{
    if(
      !manifestUrl.textContent||
      expired
    ){
      return;
    }

    location.href=
      "stremio://"+
      manifestUrl.textContent.replace(
        /^https?:\\/\\//,
        ""
      );
  }
);

if(
  fileSize.minGb!==null
){
  minSizeInput.value=
    fileSize.minGb;
}

if(
  fileSize.maxGb!==null
){
  maxSizeInput.value=
    fileSize.maxGb;
}

camFilter.checked=
  filters.cam!==false;

renderQualities();
validate();

saveButton.addEventListener(
  "click",
  saveConfiguration
);

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
