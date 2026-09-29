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

const MAX_BODY=16*1024;
const MAX_TOKEN=4096;
const MAX_GB=200;
const RATE_LIMIT=10;
const RATE_WINDOW=60*1000;

const rateLimits=new Map();

function json(body,status=200,headers={}){
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
        ...headers
      }
    }
  );
}

function rateLimited(ip){
  const now=Date.now();

  for(const [key,item] of rateLimits){
    if(
      now-item.started>=
      RATE_WINDOW
    ){
      rateLimits.delete(key);
    }
  }

  let item=rateLimits.get(ip);

  if(!item){
    if(rateLimits.size>=5000){
      return true;
    }

    item={
      started:now,
      count:0
    };

    rateLimits.set(ip,item);
  }

  item.count++;

  return item.count>RATE_LIMIT;
}

function validateSize(size){
  if(
    size.minGb!==null&&
    (
      !Number.isFinite(size.minGb)||
      size.minGb<0||
      size.minGb>MAX_GB
    )
  ){
    return "Minimum file size must be between 0 and 200 GB.";
  }

  if(
    size.maxGb!==null&&
    (
      !Number.isFinite(size.maxGb)||
      size.maxGb<0||
      size.maxGb>MAX_GB
    )
  ){
    return "Maximum file size must be between 0 and 200 GB.";
  }

  if(
    size.minGb!==null&&
    size.maxGb!==null&&
    size.minGb>size.maxGb
  ){
    return "Minimum size cannot be greater than maximum size.";
  }

  return null;
}

function normalizeQualities(input){
  if(!Array.isArray(input)){
    return [];
  }

  const allowed=new Set(
    DEFAULT_QUALITIES
  );

  const seen=new Set();
  const out=[];

  for(const item of input){
    if(
      !item||
      typeof item!=="object"||
      typeof item.name!=="string"
    ){
      continue;
    }

    const name=item.name.trim();

    if(
      !allowed.has(name)||
      seen.has(name)
    ){
      continue;
    }

    seen.add(name);

    out.push({
      name,
      enabled:item.enabled!==false
    });

    if(
      out.length===
      DEFAULT_QUALITIES.length
    ){
      break;
    }
  }

  return out;
}

function qualityRows(){
  return DEFAULT_QUALITIES
    .map(
      (q,i)=>`
<div class="quality-row">
<label class="quality-name">
<input
  type="checkbox"
  class="quality-checkbox"
  data-quality="${q}"
  checked
>
<span>${q}</span>
</label>

<div class="move-buttons">
<button
  type="button"
  class="move-button"
  data-action="up"
  ${i===0?"disabled":""}
>↑</button>

<button
  type="button"
  class="move-button"
  data-action="down"
  ${i===DEFAULT_QUALITIES.length-1?"disabled":""}
>↓</button>
</div>
</div>
`
    )
    .join("");
}

function homepageScript(session){
  return `<script>
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

const status=
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

const minInput=
  document.getElementById(
    "minSize"
  );

const maxInput=
  document.getElementById(
    "maxSize"
  );

const sizeStatus=
  document.getElementById(
    "fileSizeStatus"
  );

const saveButton=
  document.getElementById(
    "saveConfiguration"
  );

const result=
  document.getElementById(
    "result"
  );

const manifest=
  document.getElementById(
    "manifestUrl"
  );

const copy=
  document.getElementById(
    "copyButton"
  );

const install=
  document.getElementById(
    "installButton"
  );

const sessionId=
  ${JSON.stringify(session.id)};

const expiresAt=
  ${session.expiresAt};

let generated=false;
let configId="";
let currentToken="";

setTimeout(
  ()=>{
    location.reload();
  },
  Math.max(
    0,
    expiresAt-Date.now()
  )
);

const rows=()=>{
  return Array.from(
    qualityList.querySelectorAll(
      ".quality-row"
    )
  );
};

const qualities=()=>{
  return rows().map(row=>{
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
  });
};

const filters=()=>{
  return {
    cam:
      document.getElementById(
        "camFilter"
      ).checked
  };
};

const fileSize=()=>{
  return {
    minGb:
      minInput.value.trim()===""
        ?null
        :Number(minInput.value),

    maxGb:
      maxInput.value.trim()===""
        ?null
        :Number(maxInput.value)
  };
};

function validSize(){
  const size=fileSize();
  let error="";

  if(
    size.minGb!==null&&
    (
      !Number.isFinite(size.minGb)||
      size.minGb<0||
      size.minGb>200
    )
  ){
    error=
      "Minimum file size must be between 0 and 200 GB.";
  }

  else if(
    size.maxGb!==null&&
    (
      !Number.isFinite(size.maxGb)||
      size.maxGb<0||
      size.maxGb>200
    )
  ){
    error=
      "Maximum file size must be between 0 and 200 GB.";
  }

  else if(
    size.minGb!==null&&
    size.maxGb!==null&&
    size.minGb>size.maxGb
  ){
    error=
      "Minimum size cannot be greater than maximum size.";
  }

  sizeStatus.textContent=
    error;

  sizeStatus.className=
    error
      ?"filter-error"
      :"";

  return !error;
}

function clearResult(){
  manifest.value="";
  install.classList.add(
    "disabled"
  );
  install.href="#";
  result.style.display=
    "none";
}

function showSettings(){
  tokenPage.style.display=
    "none";

  configuration.style.display=
    "block";

  window.scrollTo(0,0);
}

function showToken(){
  configuration.style.display=
    "none";

  tokenPage.style.display=
    "block";

  status.textContent="";
  status.className="";

  window.scrollTo(0,0);
}

function changed(){
  if(!generated){
    return;
  }

  clearResult();

  saveButton.style.display=
    "flex";

  status.textContent=
    "Settings changed. Save the configuration to update the addon.";

  status.className="";
}

async function generate(){
  const token=
    tokenInput.value.trim();

  if(!token){
    status.textContent=
      "Enter your ShowBox UI token first.";

    status.className=
      "error";

    return;
  }

  if(
    token.length<=100||
    token.length>4096
  ){
    status.textContent=
      "Invalid Cookie";

    status.className=
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
            })
        }
      );

    const data=
      await response.json();

    if(!response.ok){
      throw new Error(
        data.error||
        "Failed to start configuration"
      );
    }

    currentToken=token;
    generated=true;

    saveButton.style.display=
      "flex";

    clearResult();

    status.textContent="";
    status.className="";

    showSettings();
  }

  catch(error){
    status.textContent=
      error.message||
      "Failed to start configuration.";

    status.className=
      "error";
  }

  finally{
    generateButton.disabled=false;
    generateButton.textContent=
      "Generate";
  }
}

async function save(){
  if(
    !generated||
    !currentToken
  ){
    return;
  }

  const qualityConfig=
    qualities();

  if(
    !qualityConfig.some(
      item=>item.enabled
    )
  ){
    status.textContent=
      "Enable at least one quality.";

    status.className=
      "error";

    return;
  }

  if(!validSize()){
    return;
  }

  saveButton.disabled=true;
  saveButton.textContent=
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
                fileSize(),

              qualities:
                qualityConfig,

              filters:
                filters()
            })
        }
      );

    const data=
      await response.json();

    if(!response.ok){
      throw new Error(
        data.error||
        "Failed to save configuration"
      );
    }

    configId=
      data.configId||
      configId;

    manifest.value=
      data.manifestUrl;

    install.href=
      data.stremioUrl;

    install.classList.remove(
      "disabled"
    );

    result.style.display=
      "block";

    status.textContent=
      "Configuration saved.";

    status.className=
      "success";
  }

  catch(error){
    status.textContent=
      error.message||
      "Failed to save configuration.";

    status.className=
      "error";
  }

  finally{
    saveButton.disabled=false;
    saveButton.textContent=
      "Save Configuration";
  }
}

qualityList.addEventListener(
  "change",
  changed
);

filterList.addEventListener(
  "change",
  changed
);

minInput.addEventListener(
  "input",
  ()=>{
    validSize();
    changed();
  }
);

maxInput.addEventListener(
  "input",
  ()=>{
    validSize();
    changed();
  }
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

    const all=rows();
    const index=
      all.indexOf(row);

    if(
      button.dataset.action===
        "up"&&
      index>0
    ){
      qualityList.insertBefore(
        row,
        all[index-1]
      );
    }

    if(
      button.dataset.action===
        "down"&&
      index<all.length-1
    ){
      qualityList.insertBefore(
        all[index+1],
        row
      );
    }

    changed();
  }
);

tokenInput.addEventListener(
  "input",
  ()=>{
    currentToken="";
    generated=false;
    configId="";

    showToken();
    clearResult();

    saveButton.style.display=
      "none";
  }
);

generateButton.addEventListener(
  "click",
  generate
);

backButton.addEventListener(
  "click",
  showToken
);

saveButton.addEventListener(
  "click",
  save
);

copy.addEventListener(
  "click",
  async()=>{
    if(!manifest.value){
      return;
    }

    try{
      await navigator.clipboard.writeText(
        manifest.value
      );
    }

    catch{
      manifest.focus();
      manifest.select();
      document.execCommand(
        "copy"
      );
    }

    copy.textContent=
      "Copied";

    setTimeout(
      ()=>{
        copy.textContent=
          "Copy";
      },
      1500
    );
  }
);

})();
</script>`;
}

export default async function handler(
  request,
  context
){
  const url=
    new URL(request.url);

  const path=
    url.pathname;

  if(path==="/create-config"){
    if(request.method!=="POST"){
      return json(
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

    if(
      rateLimited(
        context?.ip||
        "unknown"
      )
    ){
      return json(
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
      }

      catch{
        return json(
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
        return json(
          {
            error:
              "Invalid configuration"
          },
          400
        );
      }

      const sessionId=
        typeof body.sessionId==="string"
          ?body.sessionId
          :"";

      const session=
        await getHomepageSession(
          sessionId
        );

      if(!session){
        return json(
          {
            error:
              "Configuration session is invalid or expired"
          },
          403
        );
      }

      if(
        body.action===
        "prepare"
      ){
        const token=
          typeof body.uiToken==="string"
            ?body.uiToken.trim()
            :"";

        if(!token){
          return json(
            {
              error:
                "ShowBox UI token is required"
            },
            400
          );
        }

        if(
          token.length>
          MAX_TOKEN
        ){
          return json(
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

        return json({
          ok:true
        });
      }

      if(
        body.action!=="save"
      ){
        return json(
          {
            error:
              "Invalid configuration action"
          },
          400
        );
      }

      const current=
        await getHomepageSession(
          sessionId
        );

      if(
        !current||
        !current.uiToken
      ){
        return json(
          {
            error:
              "Configuration session is invalid or expired"
          },
          403
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

      const sizeError=
        validateSize(
          fileSize
        );

      if(sizeError){
        return json(
          {
            error:
              sizeError
          },
          400
        );
      }

      if(
        Array.isArray(
          body.qualities
        )&&
        body.qualities.length>
          DEFAULT_QUALITIES.length
      ){
        return json(
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
        return json(
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
          current.uiToken,
        fileSize,
        qualities,
        filters
      };

      let id=
        /^[a-f0-9]{32}$/i.test(
          body.configId||""
        )
          ?body.configId
          :null;

      if(id){
        if(
          await getConfig(id)
        ){
          await saveConfig(
            id,
            config
          );
        }

        else{
          id=
            await createConfig(
              config
            );
        }
      }

      else{
        id=
          await createConfig(
            config
          );
      }

      return json({
        configId:id,
        manifestUrl:
          `${url.origin}/${id}/manifest.json`,
        stremioUrl:
          `stremio://${url.host}/${id}/manifest.json`
      });
    }

    catch(error){
      console.error(
        "[ShowBox] Config creation failed:",
        error?.message
      );

      return json(
        {
          error:
            "Failed to create configuration"
        },
        500
      );
    }
  }

  if(
    path==="/manifest.json"||
    /^\/[^/]+\/manifest\.json$/.test(
      path
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
              "no-store"
          }
        }
      );
    }

    return json(
      {
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
      },
      200,
      {
        "Access-Control-Allow-Origin":
          "*"
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
            "no-store"
        }
      }
    );
  }

  const session=
    await createHomepageSession();

  const html=`<!doctype html>
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
  --surface2:#1d1f25;
  --surface3:#252831;
  --border:#292c34;
  --border2:#343740;
  --text:#f1f1f3;
  --soft:#c9cad0;
  --muted:#858892;
  --muted2:#696c75;
  --white:#f4f4f5;
  --black:#101115;
  --success:#a7e3b1;
  --error:#ff9b9b;
  --lg:22px;
  --md:16px;
  --sm:13px;
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
      clamp(560px,72vw,760px),
      calc(100% - 28px)
    );
  margin:auto;
  padding:
    clamp(32px,5vw,56px)
    0
    clamp(50px,6vw,80px);
}

h1{
  margin:0;
  font-size:
    clamp(34px,5vw,44px);
  line-height:1;
  font-weight:750;
  letter-spacing:-1.8px;
}

.subtitle{
  max-width:520px;
  margin:14px 0 0;
  color:var(--muted);
  font-size:14px;
  line-height:1.55;
}

.title{
  display:block;
  margin:38px 0 9px;
  color:var(--muted2);
  font-size:11px;
  font-weight:700;
  letter-spacing:.12em;
  text-transform:uppercase;
}

#tokenInput{
  width:100%;
  height:54px;
  padding:0 16px;
  border:1px solid var(--border2);
  border-radius:var(--sm);
  outline:none;
  background:var(--surface2);
  color:var(--text);
  font-size:14px;
}

#tokenInput::placeholder{
  color:var(--muted2);
}

#generateButton,
#saveConfiguration{
  width:100%;
  height:50px;
  margin-top:12px;
  border:0;
  border-radius:14px;
  background:var(--white);
  color:var(--black);
  font-size:14px;
  font-weight:700;
  cursor:pointer;
}

#generateButton:disabled,
#saveConfiguration:disabled{
  opacity:.55;
  cursor:default;
}

#checkStatus{
  min-height:18px;
  margin-top:10px;
  color:var(--muted2);
  font-size:12px;
}

.success{
  color:var(--success)!important;
}

.error{
  color:var(--error)!important;
}

#configuration{
  display:none;
  margin-top:18px;
}

.settings-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:28px;
}

.back-button{
  white-space:nowrap;
  display:inline-flex;
  align-items:center;
  height:40px;
  padding:0 15px;
  border:1px solid var(--border2);
  border-radius:11px;
  background:var(--surface3);
  color:var(--text);
  font-size:13px;
  font-weight:650;
  cursor:pointer;
}

.settings-title{
  margin:0;
  font-size:
    clamp(27px,4vw,34px);
  line-height:1.15;
  font-weight:700;
  letter-spacing:-.7px;
}

.settings-description,
.description,
.section-description{
  margin:6px 0 14px;
  color:var(--muted2);
  font-size:12px;
  line-height:1.45;
}

.section-title,
.configuration-title{
  margin:0;
  color:var(--text);
  font-size:
    clamp(27px,4vw,34px);
  line-height:1.15;
  font-weight:700;
}

.filter-card,
.quality-list,
.filter-setting-list{
  border:1px solid var(--border);
  border-radius:var(--lg);
  background:var(--surface);
}

.filter-card{
  padding:14px;
}

.filter-heading{
  padding:5px 7px 12px;
  color:var(--muted2);
  font-size:11px;
  font-weight:700;
  letter-spacing:.12em;
}

.filter-option{
  padding:17px;
  border:1px solid var(--border2);
  border-radius:var(--md);
  background:var(--surface2);
}

.filter-option-title{
  display:flex;
  align-items:center;
  gap:9px;
  color:var(--text);
  font-size:17px;
  font-weight:650;
}

.help-button{
  width:24px;
  height:24px;
  padding:0;
  border:0;
  border-radius:50%;
  background:#30333b;
  color:var(--muted);
  font-weight:700;
}

.size-fields{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin-top:14px;
}

.size-field label{
  display:block;
  margin:0 0 7px;
  color:var(--muted2);
  font-size:11px;
}

.size-input{
  width:100%;
  height:52px;
  padding:0 14px;
  border:1px solid var(--border2);
  border-radius:var(--sm);
  outline:none;
  background:var(--surface3);
  color:var(--text);
  font-size:14px;
}

.filter-error{
  margin-top:10px;
  padding:0 7px;
  color:var(--error);
  font-size:12px;
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
}

.quality-row,
.filter-setting-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  min-height:62px;
  padding:11px 14px;
  border-radius:var(--md);
  background:var(--surface2);
}

.quality-name,
.filter-setting-name{
  display:flex;
  align-items:center;
  gap:12px;
  color:var(--text);
  font-size:15px;
  font-weight:600;
}

.quality-checkbox,
.filter-setting-checkbox{
  width:20px;
  height:20px;
  margin:0;
}

.move-buttons{
  display:flex;
  gap:6px;
}

.move-button{
  width:36px;
  height:36px;
  padding:0;
  border:1px solid var(--border2);
  border-radius:10px;
  background:var(--surface3);
  color:var(--soft);
  font-size:16px;
}

.move-button:disabled{
  opacity:.3;
}

#saveConfiguration{
  display:none;
  margin-top:40px;
}

#result{
  margin-top:40px;
}

.result-label{
  display:block;
  margin-bottom:9px;
  color:var(--muted2);
  font-size:11px;
  font-weight:700;
  letter-spacing:.12em;
  text-transform:uppercase;
}

.result-row{
  display:flex;
  gap:8px;
}

#manifestUrl{
  flex:1;
  min-width:0;
  height:50px;
  padding:0 12px;
  border:1px solid var(--border2);
  border-radius:var(--sm);
  outline:none;
  background:var(--surface2);
  color:var(--soft);
  font-size:11px;
}

#copyButton{
  width:72px;
  flex:0 0 72px;
  height:50px;
  border:0;
  border-radius:var(--sm);
  background:var(--surface3);
  color:var(--text);
  font-weight:650;
}

#installButton{
  display:flex;
  align-items:center;
  justify-content:center;
  width:100%;
  height:50px;
  margin-top:10px;
  border:1px solid var(--border2);
  border-radius:var(--sm);
  background:var(--white);
  color:var(--black);
  font-size:13px;
  font-weight:700;
  text-decoration:none;
}

.disabled{
  opacity:.35;
  pointer-events:none;
}

.note{
  margin-top:12px;
  color:var(--muted2);
  font-size:11px;
  line-height:1.5;
}

@media(max-width:600px){
  .container{
    width:calc(100% - 24px);
    padding:38px 0 60px;
  }

  h1{
    font-size:38px;
  }

  .settings-title,
  .section-title,
  .configuration-title{
    font-size:27px;
  }

  .size-fields{
    gap:9px;
  }
}
</style>
</head>

<body>
<div class="container">

<div id="tokenPage">
<h1>ShowBox</h1>

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

<section>

<div class="section-title">
File size
</div>

<div class="section-description">
Keep streams between the selected minimum and maximum size.
</div>

<div class="filter-card">

<div class="filter-heading">
FILE SIZE
</div>

<div class="filter-option">

<div class="filter-option-title">
<span>
Keep streams between
</span>

<button
  type="button"
  class="help-button"
  title="Leave either field empty for no limit."
>
?
</button>
</div>

<div class="size-fields">

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
</div>

<div id="fileSizeStatus"></div>
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
<div class="filter-setting-row">
<label class="filter-setting-name">
<input
  type="checkbox"
  class="filter-setting-checkbox"
  id="camFilter"
  checked
>
<span>
CAM
</span>
</label>
</div>
</div>
</section>

<button
  id="saveConfiguration"
  type="button"
>
Save Configuration
</button>

<div
  id="result"
  style="display:none"
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

${homepageScript(session)}

</body>
</html>`;

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
