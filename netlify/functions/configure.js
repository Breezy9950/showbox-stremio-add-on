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

*{
  box-sizing:border-box;
}

body{
  margin:0;
  padding:32px 16px;
  background:#0d0e11;
  color:#f1f1f3;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  text-align:center;
}

.card{
  width:min(560px,100%);
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

<h2>
Invalid configuration
</h2>

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
        body.action==="check-session"
      ){
        return jsonResponse({
          ok:true,

          expiresAt:
            currentSession.expiresAt
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

      if(!uiToken){
        throw new Error(
          "The existing configuration does not contain a ShowBox UI token."
        );
      }

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

:root{
  --bg:#0d0e11;
  --surface:#15161b;
  --surface-2:#1d1f25;
  --input:#252831;
  --border:#292c34;
  --border-light:#30333b;
  --text:#f1f1f3;
  --muted:#858892;
  --muted-2:#696c75;
}

body{
  margin:0;

  padding:
    clamp(28px,4vw,52px)
    16px
    60px;

  background:var(--bg);

  color:var(--text);

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.container{
  width:
    min(
      clamp(700px,74vw,960px),
      100%
    );

  margin:auto;
}

.header{
  position:relative;

  margin-bottom:
    clamp(30px,4vw,44px);
}

h1{
  margin:0;

  font-size:
    clamp(40px,5.5vw,58px);

  line-height:.98;

  letter-spacing:-2.5px;

  font-weight:700;
}

.subtitle{
  margin:
    10px 0 0;

  color:var(--muted);

  font-size:
    clamp(14px,1.5vw,16px);

  line-height:1.45;
}

.back-button{
  position:absolute;

  top:
    clamp(4px,1vw,10px);

  right:0;

  display:inline-flex;

  align-items:center;

  gap:8px;

  min-height:
    clamp(40px,4vw,48px);

  padding:
    0
    clamp(13px,1.5vw,18px);

  border:
    1px solid #343740;

  border-radius:
    clamp(10px,1.2vw,13px);

  background:var(--input);

  color:#e7e7ea;

  font-size:
    clamp(12px,1.3vw,14px);

  font-weight:600;

  white-space:nowrap;
}

.section{
  margin-top:
    clamp(26px,3.5vw,38px);
}

.section-title{
  margin:0 0 6px;

  color:var(--text);

  font-size:
    clamp(25px,3vw,34px);

  line-height:1.1;

  letter-spacing:-1px;

  font-weight:700;
}

.section-description{
  margin:
    0
    0
    clamp(12px,1.5vw,18px);

  color:var(--muted);

  font-size:
    clamp(12px,1.4vw,14px);

  line-height:1.5;
}


/* FILE SIZE */

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

.file-size-inner{
  padding:
    clamp(15px,1.8vw,20px);
  padding-bottom: clamp(11px,1.2vw,14px);

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

.size-row{
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

.size-field input{
  width:100%;

  height:
    clamp(38px,3vw,46px);

  padding:
    0
    clamp(10px,1.3vw,14px);

  border:
    1px solid #343740;

  border-radius:
    clamp(10px,1.3vw,13px);

  background:var(--input);

  color:#fff;

  font-size:
    clamp(12px,1.3vw,14px);

  outline:0;
}

.size-field input:focus{
  border-color:#4b4f59;
}

.file-size-error{
  min-height:18px;

  margin-top:9px;

  color:#ff9b9b;

  font-size:11px;
}


/* QUALITY */

.quality-card{
  padding:
    clamp(10px,1.2vw,13px);

  border:
    1px solid var(--border);

  border-radius:
    clamp(15px,1.8vw,20px);

  background:var(--surface);
}

.quality-list{
  display:flex;

  flex-direction:column;

  gap:
    clamp(6px,.9vw,9px);
}

.quality-row{
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

.quality-row>input{
  width:
    clamp(18px,1.8vw,21px);

  height:
    clamp(18px,1.8vw,21px);

  margin:
    0
    clamp(10px,1.3vw,14px)
    0
    0;

  flex-shrink:0;
}

.quality-name{
  flex:1;

  color:#ededf0;

  font-size:
    clamp(14px,1.5vw,17px);

  font-weight:600;
}

.quality-controls{
  display:flex;

  gap:
    clamp(5px,.7vw,7px);
}

.quality-controls button{
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

.quality-controls button:disabled{
  opacity:.3;
}


/* FILTERS */

.filter-card{
  padding:
    clamp(10px,1.2vw,13px);

  border:
    1px solid var(--border);

  border-radius:
    clamp(15px,1.8vw,20px);

  background:var(--surface);
}

.filter-row{
  padding:
    clamp(13px,1.5vw,17px);

  border-radius:
    clamp(11px,1.3vw,14px);

  background:var(--surface-2);
}

.filter-label{
  display:flex;

  align-items:center;

  gap:
    clamp(9px,1.2vw,13px);

  color:#ededf0;

  font-size:
    clamp(14px,1.5vw,17px);

  font-weight:600;
}

.filter-label input{
  width:
    clamp(18px,1.8vw,21px);

  height:
    clamp(18px,1.8vw,21px);
}


/* SAVE */

.main{
  display:flex;

  align-items:center;

  justify-content:center;

  width:100%;

  height:
    clamp(46px,4.5vw,54px);

  margin-top:
    clamp(20px,2.5vw,28px);

  padding:
    0
    20px;

  border:0;

  border-radius:
    clamp(12px,1.5vw,15px);

  background:#f4f4f5;

  color:#101115;

  font-size:
    clamp(13px,1.4vw,15px);

  font-weight:700;

  line-height:1;
}

.main:disabled{
  opacity:.55;
}

.status{
  min-height:18px;

  margin-top:9px;

  color:var(--muted);

  font-size:11px;

  text-align:center;
}


/* RESULT */

.result{
  display:none;

  margin-top:
    clamp(24px,3vw,32px);
}

.result-card{
  padding:
    clamp(14px,1.6vw,18px);

  border:
    1px solid var(--border);

  border-radius:
    clamp(15px,1.8vw,20px);

  background:var(--surface);
}

.result-title{
  margin-bottom:10px;

  font-size:
    clamp(16px,1.7vw,19px);

  font-weight:700;
}

.manifest-url{
  overflow:auto;

  padding:
    clamp(11px,1.2vw,14px);

  border:
    1px solid #343740;

  border-radius:
    clamp(10px,1.3vw,13px);

  background:var(--surface-2);

  color:#c9cad0;

  font-size:
    clamp(11px,1.1vw,13px);

  line-height:1.45;

  word-break:break-all;
}

.result-buttons{
  display:flex;

  gap:9px;

  margin-top:10px;
}

.result-buttons button{
  flex:1;

  height:
    clamp(42px,4vw,48px);

  border:0;

  border-radius:
    clamp(10px,1.2vw,13px);

  font-size:
    clamp(11px,1.2vw,13px);

  font-weight:700;
}

.copy{
  background:var(--input);

  color:#fff;
}

.install{
  background:#f4f4f5;

  color:#101115;
}

.note{
  margin-top:
    clamp(16px,2vw,22px);

  color:var(--muted-2);

  font-size:
    clamp(9px,1vw,11px);

  line-height:1.5;
}


/* MOBILE */

@media(max-width:600px){

  body{
    padding:
      22px
      14px
      48px;
  }

  .container{
    width:100%;
  }

  .header{
    margin-bottom:28px;
  }

  h1{
    padding-right:70px;

    font-size:30px;

    letter-spacing:-1.2px;
  }

  .subtitle{
    margin-top:7px;

    font-size:12px;
  }

  .back-button{
    top:0;

    min-height:36px;

    padding:
      0
      11px;

    font-size:12px;

    gap:6px;
  }

  .section{
    margin-top:25px;
  }

  .section-title{
    margin-bottom:5px;

    font-size:23px;

    letter-spacing:-.7px;
  }

  .section-description{
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

  .file-size-inner{
    border-radius:11px;
  }

  .file-size-inner-header{
    margin-bottom:12px;

    font-size:16px;
  }

  .size-row{
    gap:8px;
  }

  .size-field label{
    margin-bottom:5px;

    font-size:10px;
  }

  .size-field input{
  height:36px;

  padding:
    0
    10px;

  border-radius:9px;

  font-size:12px;
}

  .quality-card,
  .filter-card{
    padding:9px;

    border-radius:14px;
  }

  .quality-list{
    gap:6px;
  }

  .quality-row{
    min-height:47px;

    padding:
      8px
      10px;

    border-radius:11px;
  }

  .quality-row>input{
    width:18px;

    height:18px;

    margin-right:9px;
  }

  .quality-name{
    font-size:13px;
  }

  .quality-controls{
    gap:5px;
  }

  .quality-controls button{
    width:30px;

    height:30px;

    border-radius:9px;

    font-size:13px;
  }

  .filter-row{
    padding:12px;

    border-radius:11px;
  }

  .filter-label{
    gap:9px;

    font-size:13px;
  }

  .filter-label input{
    width:18px;

    height:18px;
  }

  .main{
    height:44px;

    margin-top:18px;

    border-radius:12px;

    font-size:13px;
  }

  .result{
    margin-top:22px;
  }

  .result-card{
    padding:12px;

    border-radius:14px;
  }

  .result-buttons button{
    height:42px;

    font-size:11px;
  }

  .note{
    font-size:10px;
  }

}


/* VERY SMALL PHONES */

@media(max-width:380px){

  body{
    padding-left:12px;

    padding-right:12px;
  }

  h1{
    font-size:28px;
  }

  .back-button{
    min-height:34px;

    padding:
      0
      9px;

    font-size:11px;
  }

  .section-title{
    font-size:22px;
  }

  .file-size-card,
  .quality-card,
  .filter-card{
    padding:8px;
  }

  .file-size-inner{
    padding:12px;
  }

  .quality-row{
    padding-left:9px;

    padding-right:9px;
  }

  .quality-controls button{
    width:28px;

    height:28px;
  }

}

</style>

</head>

<body>

<div class="container">

<header class="header">

<h1>
ShowBox
</h1>

</header>


<section class="section">

<h2 class="section-title">
File size
</h2>

<p class="section-description">
Keep streams between the selected minimum and maximum size.
</p>

<div class="file-size-card">

<div class="file-size-heading">
  <span>FILE SIZE</span>

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

<div class="size-row">

<div class="size-field">

<label for="minSize">
Min (GB)
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
Max (GB)
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

</div>

</section>


<section class="section">

<h2 class="section-title">
Quality settings
</h2>

<p class="section-description">
Enable the qualities you want. Move them up or down to set their priority.
</p>

<div class="quality-card">

<div
  id="qualityList"
  class="quality-list"
></div>

</div>

</section>


<section class="section">

<h2 class="section-title">
Stream filters
</h2>

<p class="section-description">
Enable the stream types you want to keep. These settings do not change quality priority.
</p>

<div class="filter-card">

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

</section>


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

<div class="result-card">

<div class="result-title">
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
copy the manifest URL and add it manually through Stremio's Add-ons page.
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

window.addEventListener(
  "pageshow",
  async event=>{
    if(
      Date.now()>=expiresAt
    ){
      permanentlyExpire();

      return;
    }

    if(event.persisted){
      await verifySession();
    }
  }
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
              action:"save",

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
