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

const MAX_BODY=16*1024;
const MAX_GB=200;

function json(body,status=200){
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

function html(body,status=200){
  return new Response(
    body,
    {
      status,
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

function decode(value){
  try{
    let base64=
      value
        .replace(/-/g,"+")
        .replace(/_/g,"/");

    while(base64.length%4){
      base64+="=";
    }

    return JSON.parse(
      Buffer
        .from(
          base64,
          "base64"
        )
        .toString("utf8")
    );
  }catch{
    return {};
  }
}

function normalizeQualities(input){
  if(!Array.isArray(input)){
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

  const seen=new Set();
  const result=[];

  for(const item of input){
    if(
      !item||
      typeof item!=="object"||
      !allowed.has(item.name)||
      seen.has(item.name)
    ){
      continue;
    }

    seen.add(item.name);

    result.push({
      name:item.name,
      enabled:item.enabled===true
    });
  }

  for(
    const item of DEFAULT_QUALITIES
  ){
    if(!seen.has(item.name)){
      result.push({
        ...item
      });
    }
  }

  return result;
}

function normalizeSize(value){
  if(
    !value||
    typeof value!=="object"
  ){
    return {
      minGb:null,
      maxGb:null
    };
  }

  const min=
    value.minGb===null||
    value.minGb===undefined||
    value.minGb===""
      ?null
      :Number(value.minGb);

  const max=
    value.maxGb===null||
    value.maxGb===undefined||
    value.maxGb===""
      ?null
      :Number(value.maxGb);

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

function validateSize(value){
  const min=
    value?.minGb===null||
    value?.minGb===undefined||
    value?.minGb===""
      ?null
      :Number(value.minGb);

  const max=
    value?.maxGb===null||
    value?.maxGb===undefined||
    value?.maxGb===""
      ?null
      :Number(value.maxGb);

  if(
    min!==null&&
    !Number.isFinite(min)
  ){
    throw new Error(
      "Invalid minimum file size"
    );
  }

  if(
    max!==null&&
    !Number.isFinite(max)
  ){
    throw new Error(
      "Invalid maximum file size"
    );
  }

  if(
    min!==null&&
    (
      min<0||
      min>MAX_GB
    )
  ){
    throw new Error(
      "Minimum file size must be between 0 and 200 GB"
    );
  }

  if(
    max!==null&&
    (
      max<0||
      max>MAX_GB
    )
  ){
    throw new Error(
      "Maximum file size must be between 0 and 200 GB"
    );
  }

  if(
    min!==null&&
    max!==null&&
    min>max
  ){
    throw new Error(
      "Minimum size cannot be greater than maximum size"
    );
  }

  return {
    minGb:min,
    maxGb:max
  };
}

function normalizeFilters(value){
  return {
    cam:
      !value||
      typeof value!=="object"
        ?true
        :value.cam!==false
  };
}

async function getConfigFromRequest(
  request
){
  const path=
    new URL(request.url)
      .pathname
      .replace(
        /\/+$/,
        ""
      );

  const match=
    path.match(
      /^\/configure\/([^/]+)$/
    )||
    path.match(
      /^\/([^/]+)\/configure$/
    );

  if(!match){
    return null;
  }

  const id=match[1];

  const stored=
    await getConfig(id);

  if(
    stored&&
    typeof stored==="object"&&
    !Array.isArray(stored)
  ){
    return {
      id,
      config:stored
    };
  }

  const legacy=
    decode(id);

  if(
    !legacy||
    typeof legacy!=="object"||
    Array.isArray(legacy)||
    !Object.keys(legacy).length
  ){
    return null;
  }

  return {
    id:null,
    config:legacy
  };
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
  const data=
    await getConfigFromRequest(
      request
    );

  if(!data){
    return html(
`<!doctype html>
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
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
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
      400
    );
  }

  const configId=
    data.id;

  const existing=
    data.config;

  if(
    request.method==="POST"
  ){
    try{
      const bodyText=
        await request.text();

      if(
        new TextEncoder()
          .encode(bodyText)
          .byteLength>
        MAX_BODY
      ){
        return json(
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
          JSON.parse(bodyText);
      }catch{
        throw new Error(
          "Invalid JSON"
        );
      }

      if(
        !body||
        typeof body!=="object"||
        Array.isArray(body)
      ){
        throw new Error(
          "Invalid configuration"
        );
      }

      const session=
        await checkConfigureSession(
          body.sessionId
        );

      if(!session.ok){
        return json(
          {
            error:
              "Configure session has expired"
          },
          410
        );
      }

      if(
        Array.isArray(
          body.qualities
        )&&
        body.qualities.length>20
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
        validateSize(
          body.fileSize
        );

      const filters=
        normalizeFilters(
          body.filters
        );

      const newConfig={
        ...existing,
        uiToken:
          typeof existing.uiToken===
            "string"
            ?existing.uiToken
            :"",
        fileSize,
        qualities,
        filters
      };

      let finalId=
        configId;

      if(!finalId){
        finalId=
          await createConfig(
            newConfig
          );
      }else{
        await saveConfig(
          finalId,
          newConfig
        );
      }

      const origin=
        new URL(
          request.url
        ).origin;

      return json({
        manifestUrl:
          `${origin}/${finalId}/manifest.json`
      });
    }

    catch(error){
      return json(
        {
          error:
            error.message||
            "Invalid configuration"
        },
        error.message===
          "Configuration request is too large"
            ?413
            :400
      );
    }
  }

  const qualities=
    normalizeQualities(
      existing.qualities
    );

  const fileSize=
    normalizeSize(
      existing.fileSize
    );

  const filters=
    normalizeFilters(
      existing.filters
    );

  const session=
    await createConfigureSession();

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

  const page=
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
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
    clamp(28px,5vw,54px)
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
  padding:0 13px;
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
  padding:10px 12px;
  border-radius:13px;
  background:#1d1f25;
}

.quality-row>input{
  width:20px;
  height:20px;
  margin:
    0
    12px
    0
    0;
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
  width:100%;
  height:50px;
  margin-top:22px;
  border:0;
  border-radius:14px;
  background:#f4f4f5;
  color:#101115;
  font-size:14px;
  font-weight:700;
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
      calc(100% - 8px);
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
>
Copy
</button>

<button
  id="install"
  class="install"
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
  ${JSON.stringify(session.id)};

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

function expire(){
  if(expired){
    return;
  }

  expired=true;
  saveButton.disabled=true;

  location.href=
    "/__showbox_configure_expired__";
}

setTimeout(
  expire,
  Math.max(
    0,
    expiresAt-Date.now()
  )
);

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

          invalidate();
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

          [
            qualities[index-1],
            qualities[index]
          ]=[
            qualities[index],
            qualities[index-1]
          ];

          invalidate();
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

          [
            qualities[index+1],
            qualities[index]
          ]=[
            qualities[index],
            qualities[index+1]
          ];

          invalidate();
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

function valid(){
  const value=
    getFileSize();

  let error="";

  if(
    value.minGb!==null&&
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
    value.maxGb!==null&&
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

function invalidate(){
  manifestUrl.textContent="";
  result.style.display=
    "none";
}

async function saveConfiguration(){
  if(expired){
    return;
  }

  if(!valid()){
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

  saveButton.disabled=true;
  saveButton.textContent=
    "Saving...";

  status.textContent="";

  try{
    const response=
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
              sessionId,

              qualities,

              fileSize:
                getFileSize(),

              filters:{
                cam:
                  camFilter.checked
              }
            })
        }
      );

    const data=
      await response.json();

    if(
      response.status===
      410
    ){
      expire();
      return;
    }

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
    status.textContent=
      error.message||
      "Something went wrong.";
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
    invalidate();
    valid();
  }
);

maxSizeInput.addEventListener(
  "input",
  ()=>{
    invalidate();
    valid();
  }
);

camFilter.addEventListener(
  "change",
  invalidate
);

copyButton.addEventListener(
  "click",
  async()=>{
    if(!manifestUrl.textContent){
      return;
    }

    try{
      await navigator.clipboard.writeText(
        manifestUrl.textContent
      );

      copyButton.textContent=
        "Copied!";

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
      manifestUrl.textContent
        .replace(
          /^https?:\\/\\//,
          ""
        );
  }
);

if(fileSize.minGb!==null){
  minSizeInput.value=
    fileSize.minGb;
}

if(fileSize.maxGb!==null){
  maxSizeInput.value=
    fileSize.maxGb;
}

camFilter.checked=
  filters.cam!==false;

renderQualities();
valid();

saveButton.addEventListener(
  "click",
  saveConfiguration
);

</script>

</body>
</html>`;

  return html(page);
}
