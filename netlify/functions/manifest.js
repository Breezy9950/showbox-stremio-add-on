import { createConfig } from "./config-store.js";

const DEFAULT_QUALITIES = [
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];

const MAX_CONFIG_BODY_BYTES = 16 * 1024;
const MAX_TOKEN_LENGTH = 4096;
const MAX_FILE_SIZE_GB = 200;
const MAX_QUALITY_ITEMS = DEFAULT_QUALITIES.length;

const CREATE_CONFIG_RATE_LIMIT = 10;
const CREATE_CONFIG_RATE_WINDOW_MS = 60 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 5000;

const createConfigRateLimits = new Map();

function qualityRows() {
  return DEFAULT_QUALITIES.map((quality,index) => `
      <div class="quality-row">
        <label class="quality-name">
          <input type="checkbox" class="quality-checkbox" data-quality="${quality}" checked>
          <span>${quality}</span>
        </label>
        <div class="move-buttons">
          <button type="button" class="move-button" data-action="up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="move-button" data-action="down" ${index === DEFAULT_QUALITIES.length - 1 ? "disabled" : ""}>↓</button>
        </div>
      </div>
    `).join("");
}

function filterRows() {
  return `
    <div class="filter-setting-row">
      <label class="filter-setting-name">
        <input type="checkbox" class="filter-setting-checkbox" id="camFilter" checked>
        <span>CAM</span>
      </label>
    </div>
  `;
}

function jsonResponse(body,status=200,extraHeaders={}) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      ...extraHeaders
    }
  });
}

function validateFileSize(fileSize) {
  if (
    fileSize.minGb !== null &&
    (
      !Number.isFinite(fileSize.minGb) ||
      fileSize.minGb < 0 ||
      fileSize.minGb > MAX_FILE_SIZE_GB
    )
  ) {
    return "Minimum file size must be between 0 and 200 GB.";
  }

  if (
    fileSize.maxGb !== null &&
    (
      !Number.isFinite(fileSize.maxGb) ||
      fileSize.maxGb < 0 ||
      fileSize.maxGb > MAX_FILE_SIZE_GB
    )
  ) {
    return "Maximum file size must be between 0 and 200 GB.";
  }

  if (
    fileSize.minGb !== null &&
    fileSize.maxGb !== null &&
    fileSize.minGb > fileSize.maxGb
  ) {
    return "Minimum size cannot be greater than maximum size.";
  }

  return null;
}

function normalizeQualities(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const allowed = new Set(DEFAULT_QUALITIES);
  const seen = new Set();
  const result = [];

  for (const item of input) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string"
    ) {
      continue;
    }

    const name = item.name.trim();

    if (!allowed.has(name) || seen.has(name)) {
      continue;
    }

    seen.add(name);

    result.push({
      name,
      enabled:item.enabled !== false
    });

    if (result.length >= MAX_QUALITY_ITEMS) {
      break;
    }
  }

  return result;
}

function isRateLimited(ip) {
  const now = Date.now();

  for (const [key,entry] of createConfigRateLimits) {
    if (
      now - entry.windowStart >=
      CREATE_CONFIG_RATE_WINDOW_MS
    ) {
      createConfigRateLimits.delete(key);
    }
  }

  if (
    createConfigRateLimits.size >= MAX_RATE_LIMIT_ENTRIES &&
    !createConfigRateLimits.has(ip)
  ) {
    return true;
  }

  let entry = createConfigRateLimits.get(ip);

  if (
    !entry ||
    now - entry.windowStart >= CREATE_CONFIG_RATE_WINDOW_MS
  ) {
    entry = {
      windowStart:now,
      count:0
    };

    createConfigRateLimits.set(ip,entry);
  }

  entry.count += 1;

  return entry.count > CREATE_CONFIG_RATE_LIMIT;
}

function homepageScript() {
  return `
(function(){
  "use strict";

  const tokenInput=document.getElementById("tokenInput");
  const generateButton=document.getElementById("generateButton");
  const backButton=document.getElementById("backButton");
  const checkStatus=document.getElementById("checkStatus");
  const tokenPage=document.getElementById("tokenPage");
  const configuration=document.getElementById("configuration");
  const qualityList=document.getElementById("qualityList");
  const filterList=document.getElementById("filterList");
  const minSizeInput=document.getElementById("minSize");
  const maxSizeInput=document.getElementById("maxSize");
  const fileSizeStatus=document.getElementById("fileSizeStatus");
  const result=document.getElementById("result");
  const saveConfiguration=document.getElementById("saveConfiguration");
  const manifestUrl=document.getElementById("manifestUrl");
  const copyButton=document.getElementById("copyButton");
  const installButton=document.getElementById("installButton");

  let currentToken="";
  let hasGenerated=false;

  function getRows(){
    return Array.from(
      qualityList.querySelectorAll(".quality-row")
    );
  }

  function getQualityConfig(){
    return getRows().map(row=>{
      const checkbox=row.querySelector(".quality-checkbox");

      return {
        name:checkbox.dataset.quality,
        enabled:checkbox.checked
      };
    });
  }

  function getFilterConfig(){
    return {
      cam:document.getElementById("camFilter").checked
    };
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
    const fileSize=getFileSizeConfig();
    let error="";

    if (
      fileSize.minGb!==null &&
      (
        !Number.isFinite(fileSize.minGb) ||
        fileSize.minGb<0 ||
        fileSize.minGb>200
      )
    ) {
      error="Minimum file size must be between 0 and 200 GB.";
    } else if (
      fileSize.maxGb!==null &&
      (
        !Number.isFinite(fileSize.maxGb) ||
        fileSize.maxGb<0 ||
        fileSize.maxGb>200
      )
    ) {
      error="Maximum file size must be between 0 and 200 GB.";
    } else if (
      fileSize.minGb!==null &&
      fileSize.maxGb!==null &&
      fileSize.minGb>fileSize.maxGb
    ) {
      error="Minimum size cannot be greater than maximum size.";
    }

    if(error){
      fileSizeStatus.textContent=error;
      fileSizeStatus.className="filter-error";
      return false;
    }

    fileSizeStatus.textContent="";
    fileSizeStatus.className="";
    return true;
  }

  function clearManifest(){
    manifestUrl.value="";
    installButton.classList.add("disabled");
    installButton.href="#";
  }

  function showManifest(){
    result.style.display="block";
    saveConfiguration.style.display="none";
  }

  function showSaveButton(){
    result.style.display="none";
    saveConfiguration.style.display="flex";
  }

  function settingsChanged(){
    if(!hasGenerated){
      return;
    }

    showSaveButton();

    checkStatus.textContent=
      "Settings changed. Save the configuration to update the addon.";

    checkStatus.className="";
  }

  function showConfigurationPage(){
    tokenPage.style.display="none";
    configuration.style.display="block";
    window.scrollTo(0,0);
  }

  function showTokenPage(){
    configuration.style.display="none";
    tokenPage.style.display="block";
    checkStatus.textContent="";
    checkStatus.className="";
    window.scrollTo(0,0);
  }

  async function createManifest(button){
    if(!currentToken){
      return false;
    }

    const qualities=getQualityConfig();

    if(!qualities.some(item=>item.enabled)){
      checkStatus.textContent="Enable at least one quality.";
      checkStatus.className="error";
      return false;
    }

    if(!validateFileSizeInputs()){
      return false;
    }

    const config={
      uiToken:currentToken,
      fileSize:getFileSizeConfig(),
      qualities,
      filters:getFilterConfig()
    };

    button.disabled=true;
    button.textContent=button===generateButton?"Generating...":"Saving...";
    checkStatus.textContent="";
    checkStatus.className="";

    try{
      const response=await fetch("/create-config",{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify(config)
      });

      const data=await response.json();

      if(!response.ok){
        throw new Error(
          data.error||"Failed to create configuration"
        );
      }

      manifestUrl.value=data.manifestUrl;
      installButton.href=data.stremioUrl;
      installButton.classList.remove("disabled");

      hasGenerated=true;
      showManifest();

      checkStatus.textContent=
        button===generateButton
          ?"Configuration generated."
          :"Configuration saved.";

      checkStatus.className="success";

      return true;
    } catch(error){
      console.error(
        "[ShowBox] Configuration save failed:",
        error?.message
      );

      checkStatus.textContent=
        error.message||
        "Failed to save configuration.";

      checkStatus.className="error";

      if(hasGenerated){
        showSaveButton();
      } else {
        clearManifest();
      }

      return false;
    } finally{
      button.disabled=false;
      button.textContent=
        button===generateButton
          ?"Generate"
          :"Save Configuration";
    }
  }

  qualityList.addEventListener("change",function(){
    settingsChanged();
  });

  filterList.addEventListener("change",function(){
    settingsChanged();
  });

  qualityList.addEventListener("click",function(event){
    const button=event.target.closest(".move-button");

    if(!button){
      return;
    }

    const row=button.closest(".quality-row");
    const rows=getRows();
    const index=rows.indexOf(row);

    if(
      button.dataset.action==="up" &&
      index>0
    ){
      qualityList.insertBefore(
        row,
        rows[index-1]
      );
    }

    if(
      button.dataset.action==="down" &&
      index<rows.length-1
    ){
      qualityList.insertBefore(
        rows[index+1],
        row
      );
    }

    settingsChanged();
  });

  minSizeInput.addEventListener("input",function(){
    validateFileSizeInputs();
    settingsChanged();
  });

  maxSizeInput.addEventListener("input",function(){
    validateFileSizeInputs();
    settingsChanged();
  });

  tokenInput.addEventListener("input",function(){
    currentToken="";
    hasGenerated=false;
    configuration.style.display="none";
    tokenPage.style.display="block";
    result.style.display="none";
    saveConfiguration.style.display="none";
    clearManifest();
    checkStatus.textContent="";
    checkStatus.className="";
  });

  generateButton.addEventListener("click",async function(){
    const token=tokenInput.value.trim();

    if(!token){
      checkStatus.textContent=
        "Enter your ShowBox UI token first.";
      checkStatus.className="error";
      return;
    }

    if(
      token.length<=100 ||
      token.length>4096
    ){
      checkStatus.textContent="Invalid Cookie";
      checkStatus.className="error";
      return;
    }

    currentToken=token;

    await createManifest(generateButton);

    if(hasGenerated){
      showConfigurationPage();
    }
  });

  backButton.addEventListener("click",function(){
    showTokenPage();
  });

  saveConfiguration.addEventListener("click",async function(){
    await createManifest(saveConfiguration);
  });

  copyButton.addEventListener("click",async function(){
    if(!manifestUrl.value){
      return;
    }

    try{
      await navigator.clipboard.writeText(
        manifestUrl.value
      );
    } catch {
      manifestUrl.focus();
      manifestUrl.select();
      document.execCommand("copy");
    }

    copyButton.textContent="Copied";

    setTimeout(function(){
      copyButton.textContent="Copy";
    },1500);
  });
})();
`;
}

export default async (request,context)=>{
  const url=new URL(request.url);
  const pathname=url.pathname;

  if(pathname==="/create-config"){
    if(request.method!=="POST"){
      return jsonResponse(
        {error:"Method not allowed"},
        405,
        {Allow:"POST"}
      );
    }

    const clientIp=context?.ip||"unknown";

    if(isRateLimited(clientIp)){
      return jsonResponse(
        {
          error:
            "Too many configuration requests. Please try again later."
        },
        429,
        {"Retry-After":"60"}
      );
    }

    try{
      const contentLength=request.headers.get("content-length");

      if(
        contentLength &&
        Number.isFinite(Number(contentLength)) &&
        Number(contentLength)>MAX_CONFIG_BODY_BYTES
      ){
        return jsonResponse(
          {error:"Configuration request is too large"},
          413
        );
      }

      const requestBody=await request.text();

      const bodySize=new TextEncoder()
        .encode(requestBody)
        .byteLength;

      if(bodySize>MAX_CONFIG_BODY_BYTES){
        return jsonResponse(
          {error:"Configuration request is too large"},
          413
        );
      }

      let body;

      try{
        body=JSON.parse(requestBody);
      } catch {
        return jsonResponse(
          {error:"Invalid JSON"},
          400
        );
      }

      if(
        !body ||
        typeof body!=="object" ||
        Array.isArray(body)
      ){
        return jsonResponse(
          {error:"Invalid configuration"},
          400
        );
      }

      const uiToken=
        typeof body.uiToken==="string"
          ?body.uiToken.trim()
          :"";

      if(!uiToken){
        return jsonResponse(
          {error:"ShowBox UI token is required"},
          400
        );
      }

      if(uiToken.length>MAX_TOKEN_LENGTH){
        return jsonResponse(
          {error:"ShowBox UI token is too long"},
          400
        );
      }

      let minGb=null;
      let maxGb=null;

      if(
        body.fileSize &&
        typeof body.fileSize==="object" &&
        !Array.isArray(body.fileSize)
      ){
        if(
          body.fileSize.minGb!==null &&
          body.fileSize.minGb!==undefined &&
          body.fileSize.minGb!==""
        ){
          minGb=Number(body.fileSize.minGb);
        }

        if(
          body.fileSize.maxGb!==null &&
          body.fileSize.maxGb!==undefined &&
          body.fileSize.maxGb!==""
        ){
          maxGb=Number(body.fileSize.maxGb);
        }
      }

      const fileSize={
        minGb,
        maxGb
      };

      const fileSizeError=validateFileSize(fileSize);

      if(fileSizeError){
        return jsonResponse(
          {error:fileSizeError},
          400
        );
      }

      if(
        Array.isArray(body.qualities) &&
        body.qualities.length>MAX_QUALITY_ITEMS
      ){
        return jsonResponse(
          {error:"Too many quality entries"},
          400
        );
      }

      const qualities=normalizeQualities(
        body.qualities
      );

      const filters=
        body.filters &&
        typeof body.filters==="object" &&
        !Array.isArray(body.filters)
          ?{
              cam:body.filters.cam!==false
            }
          :{
              cam:true
            };

      const config={
        uiToken,
        fileSize,
        qualities,
        filters
      };

      const configId=await createConfig(config);

      const manifestUrl=
        `${url.origin}/${configId}/manifest.json`;

      const stremioUrl=
        `stremio://${url.host}/${configId}/manifest.json`;

      return jsonResponse({
        configId,
        manifestUrl,
        stremioUrl
      });
    } catch(error){
      console.error(
        "[ShowBox] Config creation failed:",
        error?.message
      );

      return jsonResponse(
        {error:"Failed to create configuration"},
        500
      );
    }
  }

  if(
    pathname==="/manifest.json" ||
    pathname.match(/^\/[^/]+\/manifest\.json$/)
  ){
    if(request.method!=="GET"){
      return new Response(
        "Method Not Allowed",
        {
          status:405,
          headers:{
            Allow:"GET",
            "Content-Type":"text/plain; charset=utf-8",
            "Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff",
            "Referrer-Policy":"no-referrer"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        id:"com.showbox.stremio",
        version:"1.0.0",
        name:"ShowBox",
        description:"ShowBox Stremio addon",
        resources:["stream"],
        types:["movie","series"],
        catalogs:[],
        behaviorHints:{
          configurable:true,
          configurationRequired:false
        },
        config:[
          {
            key:"uiToken",
            type:"password",
            title:"ShowBox UI Token",
            required:true
          }
        ]
      }),
      {
        headers:{
          "Content-Type":"application/json; charset=utf-8",
          "Cache-Control":"no-store",
          "Access-Control-Allow-Origin":"*",
          "X-Content-Type-Options":"nosniff",
          "Referrer-Policy":"no-referrer"
        }
      }
    );
  }

  if(request.method!=="GET"){
    return new Response(
      "Method Not Allowed",
      {
        status:405,
        headers:{
          Allow:"GET",
          "Content-Type":"text/plain; charset=utf-8",
          "Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff",
          "Referrer-Policy":"no-referrer"
        }
      }
    );
  }

  const html=`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0d0e11">
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
      width:min(680px,calc(100% - 28px));
      margin:auto;
      padding:48px 0 70px;
    }

    h1{
      margin:0;
      font-size:clamp(36px,8vw,48px);
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
      color:var(--muted-2);
      font-size:11px;
      font-weight:700;
      letter-spacing:.12em;
      text-transform:uppercase;
    }

    #tokenPage{
      display:block;
    }

    #tokenInput{
      width:100%;
      height:54px;
      padding:0 16px;
      border:1px solid var(--border-light);
      border-radius:var(--radius-sm);
      outline:none;
      background:var(--surface-2);
      color:var(--text);
      font-size:14px;
      transition:
        border-color .15s ease,
        background .15s ease;
    }

    #tokenInput::placeholder{
      color:var(--muted-2);
    }

    #tokenInput:focus{
      border-color:#50545f;
      background:var(--surface-3);
    }

    #generateButton{
      width:100%;
      height:50px;
      margin-top:12px;
      padding:0 20px;
      border:0;
      border-radius:14px;
      background:var(--white);
      color:var(--black);
      font-size:14px;
      font-weight:700;
      cursor:pointer;
      transition:
        opacity .15s ease,
        transform .12s ease;
    }

    #generateButton:hover{
      opacity:.9;
    }

    #generateButton:active{
      transform:scale(.985);
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
      color:var(--success)!important;
    }

    .error{
      color:var(--error)!important;
    }

    #configuration{
      display:none;
      margin-top:24px;
    }

    .settings-header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin-bottom:28px;
    }

    .back-button{
      height:40px;
      padding:0 15px;
      border:1px solid var(--border-light);
      border-radius:11px;
      background:var(--surface-3);
      color:var(--text);
      font-size:13px;
      font-weight:650;
      cursor:pointer;
    }

    .back-button:hover{
      background:#2b2e36;
    }

    .settings-title{
      margin:0;
      color:var(--text);
      font-size:29px;
      line-height:1.15;
      font-weight:700;
      letter-spacing:-.7px;
    }

    .settings-description{
      margin:6px 0 28px;
      color:var(--muted-2);
      font-size:12px;
      line-height:1.45;
    }

    .section-title,
    .configuration-title{
      margin:0;
      color:var(--text);
      font-size:29px;
      line-height:1.15;
      font-weight:700;
      letter-spacing:-.7px;
    }

    .section-description,
    .description{
      margin:6px 0 14px;
      color:var(--muted-2);
      font-size:12px;
      line-height:1.45;
    }

    .filter-card{
      padding:14px;
      border:1px solid var(--border);
      border-radius:var(--radius-lg);
      background:var(--surface);
    }

    .filter-heading{
      padding:5px 7px 12px;
      color:var(--muted-2);
      font-size:11px;
      font-weight:700;
      letter-spacing:.12em;
      text-transform:uppercase;
    }

    .filter-option{
      padding:17px;
      border:1px solid var(--border-light);
      border-radius:var(--radius-md);
      background:var(--surface-2);
    }

    .filter-option-title{
      display:flex;
      align-items:center;
      gap:9px;
      margin:0 0 5px;
      color:var(--text);
      font-size:17px;
      font-weight:650;
      letter-spacing:-.2px;
    }

    .help-button{
      width:24px;
      height:24px;
      padding:0;
      border:0;
      border-radius:50%;
      background:#30333b;
      color:var(--muted);
      font-size:12px;
      font-weight:700;
      cursor:pointer;
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
      color:var(--muted-2);
      font-size:11px;
      font-weight:600;
      letter-spacing:.03em;
    }

    .size-input{
      width:100%;
      height:52px;
      padding:0 14px;
      border:1px solid var(--border-light);
      border-radius:var(--radius-sm);
      outline:none;
      background:var(--surface-3);
      color:var(--text);
      font-size:14px;
    }

    .size-input::placeholder{
      color:var(--muted-2);
    }

    .size-input:focus{
      border-color:#50545f;
    }

    .filter-error{
      min-height:18px;
      margin-top:10px;
      padding:0 7px;
      color:var(--error);
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
      border:1px solid var(--border);
      border-radius:var(--radius-lg);
      background:var(--surface);
    }

    .quality-row,
    .filter-setting-row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      min-height:62px;
      padding:11px 14px;
      border:1px solid transparent;
      border-radius:var(--radius-md);
      background:var(--surface-2);
    }

    .quality-row:hover,
    .filter-setting-row:hover{
      border-color:var(--border-light);
    }

    .quality-name,
    .filter-setting-name{
      display:flex;
      align-items:center;
      gap:12px;
      color:var(--text);
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
      border:1px solid var(--border-light);
      border-radius:10px;
      background:var(--surface-3);
      color:var(--text-soft);
      font-size:16px;
      cursor:pointer;
    }

    .move-button:hover{
      background:#2b2e36;
    }

    .move-button:active{
      transform:scale(.95);
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
      padding:0 20px;
      border:0;
      border-radius:14px;
      background:var(--white);
      color:var(--black);
      font-size:14px;
      font-weight:700;
      cursor:pointer;
      transition:
        opacity .15s ease,
        transform .12s ease;
    }

    #saveConfiguration:hover{
      opacity:.9;
    }

    #saveConfiguration:active{
      transform:scale(.985);
    }

    #saveConfiguration:disabled{
      opacity:.55;
      cursor:default;
    }

    #result{
      margin-top:40px;
    }

    .result-label{
      display:block;
      margin-bottom:9px;
      color:var(--muted-2);
      font-size:11px;
      font-weight:700;
      letter-spacing:.12em;
      text-transform:uppercase;
    }

    .result-row{
      display:flex;
      flex-direction:row;
      align-items:stretch;
      gap:8px;
      width:100%;
    }

    #manifestUrl{
      flex:1 1 auto;
      min-width:0;
      width:0;
      height:50px;
      padding:0 12px;
      border:1px solid var(--border-light);
      border-radius:var(--radius-sm);
      outline:none;
      background:var(--surface-2);
      color:var(--text-soft);
      font-size:11px;
    }

    #copyButton{
      flex:0 0 72px;
      width:72px;
      height:50px;
      padding:0;
      border:0;
      border-radius:var(--radius-sm);
      background:var(--surface-3);
      color:var(--text);
      font-size:12px;
      font-weight:650;
      cursor:pointer;
    }

    #copyButton:hover{
      background:#2b2e36;
    }

    #installButton{
      display:flex;
      align-items:center;
      justify-content:center;
      width:100%;
      height:50px;
      margin-top:10px;
      border:1px solid var(--border-light);
      border-radius:var(--radius-sm);
      background:var(--white);
      color:var(--black);
      font-size:13px;
      font-weight:700;
      text-decoration:none;
      cursor:pointer;
      transition:opacity .15s ease;
    }

    #installButton:hover{
      opacity:.9;
    }

    #installButton.disabled{
      opacity:.35;
      pointer-events:none;
    }

    .note{
      margin-top:12px;
      color:var(--muted-2);
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
        letter-spacing:-1.5px;
      }

      .subtitle{
        font-size:13px;
      }

      .settings-title,
      .section-title,
      .configuration-title{
        font-size:clamp(32px, 1.5rem + 2.5vw, 56px)⁠;
      }

      .size-fields{
        gap:9px;
      }

      .size-input{
        font-size:14px;
      }

      .result-row{
        flex-direction:row;
        gap:8px;
      }

      #manifestUrl{
        flex:1 1 auto;
        width:0;
        min-width:0;
      }

      #copyButton{
        flex:0 0 72px;
        width:72px;
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

      <label class="title" for="tokenInput">
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

      <button id="generateButton" type="button">
        Generate
      </button>

      <div id="checkStatus"></div>
    </div>

    <div id="configuration">
      <div class="settings-header">
        <div>
          <h1 class="settings-title">Settings</h1>
          <div class="settings-description">
            Configure the streams you want in Stremio.
          </div>
        </div>

        <button id="backButton" class="back-button" type="button">
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
              <span>Keep streams between</span>

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
                <label for="minSize">Min (GB)</label>
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
                <label for="maxSize">Max (GB)</label>
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

        <div id="qualityList" class="quality-list">
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

        <div id="filterList" class="filter-setting-list">
          ${filterRows()}
        </div>
      </section>

      <button id="saveConfiguration" type="button">
        Save Configuration
      </button>

      <div id="result">
        <span class="result-label">
          Manifest URL
        </span>

        <div class="result-row">
          <input id="manifestUrl" type="text" readonly>

          <button id="copyButton" type="button">
            Copy
          </button>
        </div>

        <a id="installButton" class="disabled" href="#">
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
    ${homepageScript()}
  </script>
</body>
</html>`;

  return new Response(html,{
    headers:{
      "Content-Type":"text/html; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer"
    }
  });
};

export const config={
  path:[
    "/",
    "/create-config",
    "/manifest.json",
    "/:config/manifest.json"
  ]
};
