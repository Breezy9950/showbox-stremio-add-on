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

const MAX_CONFIG_BODY_BYTES = 16 * 1024;
const MAX_QUALITY_ITEMS = 7;
const MAX_FILE_SIZE_GB = 200;

function jsonResponse(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "Access-Control-Allow-Origin":"*",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer"
    }
  });
}

function decodeConfig(value){
  if(typeof value!=="string"||!value) return null;

  try{
    const json=Buffer.from(value,"base64url").toString("utf8");
    const parsed=JSON.parse(json);

    if(!parsed||typeof parsed!=="object") return null;

    return parsed;
  }catch{
    return null;
  }
}

function normalizeQualities(value){
  if(!Array.isArray(value)) return [...DEFAULT_QUALITIES];

  const allowed=new Set(DEFAULT_QUALITIES);

  const result=[
    ...new Set(
      value.filter(
        item=>typeof item==="string"&&allowed.has(item)
      )
    )
  ];

  return result.length?result:[...DEFAULT_QUALITIES];
}

function normalizeFilters(value){
  if(!value||typeof value!=="object"){
    return {
      cam:true
    };
  }

  return {
    cam:value.cam!==false
  };
}

function normalizeFileSize(value){
  if(value===null||value===undefined||value==="") return null;

  const number=Number(value);

  if(!Number.isFinite(number)||number<=0) return null;

  return Math.min(
    Math.round(number*100)/100,
    MAX_FILE_SIZE_GB
  );
}

function validateFileSize(value){
  if(value===null) return true;

  return Number.isFinite(value)&&value>0&&value<=MAX_FILE_SIZE_GB;
}

function getConfigIdFromRequest(request){
  const url=new URL(request.url);

  const match=
    url.pathname.match(/^\/configure\/([^/]+)(?:\/[a-f0-9]{32})?\/?$/i) ||
    url.pathname.match(/^\/([^/]+)\/configure(?:\/[a-f0-9]{32})?\/?$/i);

  return match?.[1]||null;
}

function getSessionIdFromRequest(request){
  const url=new URL(request.url);

  const match=
    url.pathname.match(/^\/configure\/[^/]+\/([a-f0-9]{32})\/?$/i) ||
    url.pathname.match(/^\/[^/]+\/configure\/([a-f0-9]{32})\/?$/i);

  return match?.[1]||null;
}

async function getConfigFromRequest(request){
  const configId=getConfigIdFromRequest(request);

  if(!configId) return null;

  const stored=await getConfig(configId);

  if(stored) return stored;

  return decodeConfig(configId);
}

function expiredResponse(){
  return new Response("Not Found",{
    status:404,
    headers:{
      "Content-Type":"text/plain; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer"
    }
  });
}

function invalidConfigResponse(){
  return new Response("Invalid configuration",{
    status:404,
    headers:{
      "Content-Type":"text/plain; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer"
    }
  });
}

function clientScript(){
  return `
(() => {
  const dataElement=document.getElementById("showbox-config-data");

  if(!dataElement) return;

  let data;

  try{
    data=JSON.parse(dataElement.textContent);
  }catch{
    return;
  }

  const {
    qualities:initialQualities,
    fileSize:initialFileSize,
    filters:initialFilters,
    sessionId,
    remainingMs
  }=data;

  const qualityContainer=document.getElementById("qualities");
  const fileSizeInput=document.getElementById("file-size");
  const camInput=document.getElementById("cam-filter");
  const saveButton=document.getElementById("save-button");
  const statusElement=document.getElementById("status");
  const resultElement=document.getElementById("result");
  const manifestInput=document.getElementById("manifest-url");
  const copyButton=document.getElementById("copy-button");
  const installButton=document.getElementById("install-button");

  function expire(){
    window.location.replace(
      "/__showbox_configure_expired__"
    );
  }

  const duration=Number(remainingMs);

  if(
    !sessionId ||
    !Number.isFinite(duration) ||
    duration<=0
  ){
    expire();
    return;
  }

  const clientDeadline=
    performance.now()+duration;

  setTimeout(
    expire,
    duration
  );

  window.addEventListener("pageshow",event=>{
    if(
      event.persisted ||
      performance.now()>=clientDeadline
    ){
      expire();
    }
  });

  const qualities=[
    "ORG",
    "4K",
    "1440p",
    "1080p",
    "720p",
    "480p",
    "360p"
  ];

  const selectedQualities=
    Array.isArray(initialQualities)&&initialQualities.length
      ?initialQualities
      :qualities;

  for(const quality of qualities){
    const label=document.createElement("label");
    label.className="quality";

    const input=document.createElement("input");
    input.type="checkbox";
    input.value=quality;
    input.checked=selectedQualities.includes(quality);

    const text=document.createElement("span");
    text.textContent=quality;

    label.append(
      input,
      text
    );

    qualityContainer.appendChild(label);
  }

  if(initialFileSize!==null&&initialFileSize!==undefined){
    fileSizeInput.value=initialFileSize;
  }

  camInput.checked=
    !initialFilters ||
    initialFilters.cam!==false;

  function setStatus(message,error=false){
    statusElement.textContent=message;
    statusElement.className=
      error
        ?"status error"
        :"status";
  }

  function getSelectedQualities(){
    return [
      ...qualityContainer.querySelectorAll(
        'input[type="checkbox"]:checked'
      )
    ].map(
      input=>input.value
    );
  }

  async function saveConfiguration(){
    if(performance.now()>=clientDeadline){
      expire();
      return;
    }

    const selected=getSelectedQualities();

    if(!selected.length){
      setStatus(
        "Select at least one quality.",
        true
      );
      return;
    }

    if(selected.length>7){
      setStatus(
        "Too many qualities selected.",
        true
      );
      return;
    }

    const rawFileSize=fileSizeInput.value.trim();

    let fileSize=null;

    if(rawFileSize!==""){
      fileSize=Number(rawFileSize);

      if(
        !Number.isFinite(fileSize)||
        fileSize<=0||
        fileSize>200
      ){
        setStatus(
          "File size must be between 0 and 200 GB.",
          true
        );
        return;
      }

      fileSize=
        Math.round(fileSize*100)/100;
    }

    saveButton.disabled=true;
    setStatus("Saving...");

    try{
      const response=await fetch(
        window.location.pathname,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            action:"save",
            sessionId,
            qualities:selected,
            fileSize,
            filters:{
              cam:camInput.checked
            }
          })
        }
      );

      if(response.status===404){
        expire();
        return;
      }

      const result=await response.json();

      if(!response.ok){
        throw new Error(
          result?.error||
          "Unable to save configuration."
        );
      }

      manifestInput.value=result.manifestUrl;
      resultElement.hidden=false;

      setStatus(
        "Configuration saved."
      );
    }catch(error){
      setStatus(
        error?.message||
        "Unable to save configuration.",
        true
      );
    }finally{
      saveButton.disabled=false;
    }
  }

  async function copyManifest(){
    const value=manifestInput.value;

    if(!value) return;

    try{
      await navigator.clipboard.writeText(value);
      setStatus("Manifest URL copied.");
    }catch{
      manifestInput.select();
      document.execCommand("copy");
      setStatus("Manifest URL copied.");
    }
  }

  function installManifest(){
    const value=manifestInput.value;

    if(!value) return;

    window.location.href=value;
  }

  saveButton.addEventListener(
    "click",
    saveConfiguration
  );

  copyButton.addEventListener(
    "click",
    copyManifest
  );

  installButton.addEventListener(
    "click",
    installManifest
  );
})();
`;
}

export const config={
  method:["GET","POST"],
  path:[
    "/configure/:config",
    "/configure/:config/:session",
    "/:config/configure",
    "/:config/configure/:session",
    "/configure-client.js"
  ]
};

export default async function handler(request){
  const url=new URL(request.url);

  if(
    request.method==="GET" &&
    url.pathname==="/configure-client.js"
  ){
    return new Response(
      clientScript(),
      {
        status:200,
        headers:{
          "Content-Type":"application/javascript; charset=utf-8",
          "Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff",
          "Referrer-Policy":"no-referrer"
        }
      }
    );
  }

  if(request.method==="POST"){
    const contentLength=request.headers.get("content-length");

    if(
      contentLength &&
      Number(contentLength)>MAX_CONFIG_BODY_BYTES
    ){
      return jsonResponse(
        {error:"Request body too large"},
        413
      );
    }

    let rawBody;

    try{
      rawBody=await request.text();
    }catch{
      return jsonResponse(
        {error:"Unable to read request body"},
        400
      );
    }

    if(
      new TextEncoder().encode(rawBody).length>
      MAX_CONFIG_BODY_BYTES
    ){
      return jsonResponse(
        {error:"Request body too large"},
        413
      );
    }

    let body;

    try{
      body=JSON.parse(rawBody);
    }catch{
      return jsonResponse(
        {error:"Invalid JSON"},
        400
      );
    }

    if(body?.action!=="save"){
      return jsonResponse(
        {error:"Invalid action"},
        400
      );
    }

    const pathSessionId=
      getSessionIdFromRequest(request);

    const sessionId=body?.sessionId;

    if(
      typeof sessionId!=="string"||
      !sessionId
    ){
      return jsonResponse(
        {error:"Configuration session is required"},
        400
      );
    }

    if(
      !pathSessionId||
      pathSessionId!==sessionId
    ){
      return expiredResponse();
    }

    const session=
      await getConfigureSession(sessionId);

    if(!session){
      return expiredResponse();
    }

    const existingConfig=
      await getConfigFromRequest(request);

    if(!existingConfig){
      return invalidConfigResponse();
    }

    const qualities=normalizeQualities(
      body.qualities
    );

    if(
      !Array.isArray(body.qualities)||
      qualities.length>MAX_QUALITY_ITEMS
    ){
      return jsonResponse(
        {error:"Invalid quality selection"},
        400
      );
    }

    const fileSize=
      normalizeFileSize(body.fileSize);

    if(!validateFileSize(fileSize)){
      return jsonResponse(
        {error:"Invalid file size"},
        400
      );
    }

    const filters=
      normalizeFilters(body.filters);

    const uiToken=existingConfig.uiToken;

    if(
      typeof uiToken!=="string"||
      !uiToken
    ){
      return jsonResponse(
        {error:"ShowBox UI token is missing"},
        400
      );
    }

    const newConfig={
      ...existingConfig,
      uiToken,
      qualities,
      fileSize,
      filters
    };

    const configId=
      getConfigIdFromRequest(request);

    let finalConfigId;

    if(
      typeof configId==="string" &&
      /^[a-f0-9]{32}$/i.test(configId)
    ){
      await saveConfig(
        configId,
        newConfig
      );

      finalConfigId=configId;
    }else{
      finalConfigId=
        await createConfig(newConfig);
    }

    const manifestUrl=
      `${url.origin}/${finalConfigId}/manifest.json`;

    return jsonResponse({
      success:true,
      manifestUrl
    });
  }

  if(request.method==="GET"){
    const configId=
      getConfigIdFromRequest(request);

    const existingConfig=
      await getConfigFromRequest(request);

    if(!existingConfig){
      return invalidConfigResponse();
    }

    const sessionId=
      getSessionIdFromRequest(request);

    let session;

    /*
     * First visit:
     *   /configure/:config
     *
     * Create the temporary session and bind it to the URL:
     *   /configure/:config/:session
     *
     * Once this session expires, the session-bound URL
     * can never create another session.
     */
    if(!sessionId){
      session=
        await createConfigureSession();

      const redirectUrl=
        new URL(request.url);

      redirectUrl.pathname=
        `${url.pathname.replace(/\\/$/,"")}/${session.id}`;

      return new Response(null,{
        status:302,
        headers:{
          "Location":redirectUrl.toString(),
          "Cache-Control":"no-store",
          "Referrer-Policy":"no-referrer"
        }
      });
    }

    session=
      await getConfigureSession(
        sessionId
      );

    if(!session){
      return expiredResponse();
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

    const remainingMs=
      Math.max(
        0,
        Number(session.expiresAt)-Date.now()
      );

    if(remainingMs<=0){
      return expiredResponse();
    }

    const configData=JSON.stringify({
      qualities,
      fileSize,
      filters,
      sessionId:session.id,
      remainingMs
    }).replace(
      /</g,
      "\\u003c"
    );

    const html=`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <meta
    name="robots"
    content="noindex,nofollow"
  >

  <title>ShowBox Configure</title>

  <style>
    *{
      box-sizing:border-box;
    }

    body{
      margin:0;
      min-height:100vh;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:#111;
      color:#fff;
      display:flex;
      justify-content:center;
      padding:32px 16px;
    }

    .container{
      width:100%;
      max-width:560px;
    }

    h1{
      margin:0 0 8px;
      font-size:28px;
    }

    .subtitle{
      margin:0 0 28px;
      color:#aaa;
      line-height:1.5;
    }

    .section{
      margin-bottom:24px;
    }

    .section-title{
      font-size:16px;
      font-weight:700;
      margin-bottom:10px;
    }

    .qualities{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
    }

    .quality{
      display:flex;
      align-items:center;
      gap:9px;
      padding:12px;
      border:1px solid #333;
      border-radius:10px;
      background:#191919;
      cursor:pointer;
    }

    .quality input{
      width:18px;
      height:18px;
      margin:0;
    }

    input[type="number"]{
      width:100%;
      padding:12px;
      border:1px solid #333;
      border-radius:10px;
      background:#191919;
      color:#fff;
      font-size:15px;
      outline:none;
    }

    .hint{
      margin-top:7px;
      color:#888;
      font-size:13px;
    }

    .toggle{
      display:flex;
      align-items:center;
      gap:10px;
      cursor:pointer;
    }

    .toggle input{
      width:18px;
      height:18px;
    }

    button{
      width:100%;
      border:0;
      border-radius:10px;
      padding:13px 16px;
      font-size:15px;
      font-weight:700;
      cursor:pointer;
      background:#fff;
      color:#000;
    }

    button:disabled{
      opacity:.5;
      cursor:not-allowed;
    }

    .status{
      min-height:22px;
      margin-top:14px;
      color:#aaa;
      font-size:14px;
    }

    .status.error{
      color:#ff6b6b;
    }

    .result{
      margin-top:24px;
      padding-top:24px;
      border-top:1px solid #333;
    }

    .manifest{
      display:flex;
      gap:8px;
    }

    .manifest input{
      min-width:0;
      flex:1;
      padding:11px;
      border:1px solid #333;
      border-radius:9px;
      background:#191919;
      color:#fff;
    }

    .manifest button{
      width:auto;
      white-space:nowrap;
    }

    .install{
      margin-top:10px;
    }
  </style>
</head>

<body>
  <main class="container">
    <h1>ShowBox</h1>

    <p class="subtitle">
      Configure your stream preferences.
    </p>

    <section class="section">
      <div class="section-title">
        Qualities
      </div>

      <div
        id="qualities"
        class="qualities"
      ></div>
    </section>

    <section class="section">
      <div class="section-title">
        Maximum file size
      </div>

      <input
        id="file-size"
        type="number"
        min="0"
        max="200"
        step="0.01"
        placeholder="No limit"
      >

      <div class="hint">
        Leave empty for no file-size limit.
        Maximum 200 GB.
      </div>
    </section>

    <section class="section">
      <label class="toggle">
        <input
          id="cam-filter"
          type="checkbox"
        >

        <span>
          Filter CAM / Telecine releases
        </span>
      </label>
    </section>

    <button id="save-button">
      Save configuration
    </button>

    <div
      id="status"
      class="status"
    ></div>

    <section
      id="result"
      class="result"
      hidden
    >
      <div class="section-title">
        Manifest URL
      </div>

      <div class="manifest">
        <input
          id="manifest-url"
          type="text"
          readonly
        >

        <button id="copy-button">
          Copy
        </button>
      </div>

      <button
        id="install-button"
        class="install"
      >
        Install in Stremio
      </button>
    </section>
  </main>

  <script
    type="application/json"
    id="showbox-config-data"
  >${configData}</script>

  <script
    src="/configure-client.js"
  ></script>
</body>
</html>
`;

    return new Response(
      html,
      {
        status:200,
        headers:{
          "Content-Type":"text/html; charset=utf-8",
          "Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff",
          "Referrer-Policy":"no-referrer"
        }
      }
    );
  }

  return expiredResponse();
}
