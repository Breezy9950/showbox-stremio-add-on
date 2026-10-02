import{getConfig}from"./config-store.js";
import{getStreams as getFebboxStreams}from"./providers/febbox.js";
import{getStreams as getAniKotoStreams}from"./providers/anikoto.js";
import{getStore}from"@netlify/blobs";

const STREAM_CACHE_STORE="showbox-stream-cache";
const STREAM_CACHE_TTL_MS=2*60*1000;

function getStreamCacheStore(){return getStore({name:STREAM_CACHE_STORE,consistency:"strong"});}

function getStreamCacheKey(rawConfig,type,imdbId,season,episode,config){
 const configSettings=JSON.stringify({qualities:config?.qualities??null,fileSize:config?.fileSize??null,filters:config?.filters??null});
 return[rawConfig,type,imdbId,season??"",episode??"",configSettings].join("|");
}

async function getCachedStreams(cacheKey){
 try{
  const store=getStreamCacheStore();
  const cached=await store.get(cacheKey,{type:"json",consistency:"strong"});
  if(!cached||typeof cached!=="object")return null;
  const createdAt=Number(cached.createdAt);
  if(!Number.isFinite(createdAt))return null;
  if(Date.now()-createdAt>=STREAM_CACHE_TTL_MS)return null;
  if(!Array.isArray(cached.streams))return null;
  return cached.streams;
 }catch{return null;}
}

async function cacheStreams(cacheKey,streams){
 try{
  const store=getStreamCacheStore();
  await store.setJSON(cacheKey,{createdAt:Date.now(),streams});
 }catch{}
}

function decodeBase64Url(value){
 let base64=value.replace(/-/g,"+").replace(/_/g,"/");
 while(base64.length%4)base64+="=";
 return Buffer.from(base64,"base64").toString("utf8");
}

function parseConfig(rawConfig){
 try{return JSON.parse(decodeBase64Url(rawConfig));}catch{return {};}
}

async function loadConfig(rawConfig){
 if(/^[a-f0-9]{32}$/i.test(rawConfig)){
  const storedConfig=await getConfig(rawConfig);
  if(storedConfig&&typeof storedConfig==="object"&&!Array.isArray(storedConfig))return storedConfig;
 }
 return parseConfig(rawConfig);
}

const DEFAULT_QUALITIES=["ORG","4K","1440p","1080p","720p","480p","360p"];

function getCanonicalQuality(value){
 const text=String(value||"").trim().toLowerCase();
 if(text==="org"||text==="original")return"ORG";
 if(text==="4k"||text==="2160p"||text==="2160")return"4K";
 if(text==="1440p"||text==="1440")return"1440p";
 if(text==="1080p"||text==="1080")return"1080p";
 if(text==="720p"||text==="720")return"720p";
 if(text==="480p"||text==="480")return"480p";
 if(text==="360p"||text==="360")return"360p";
 return null;
}

function normalizeQualityConfig(config){
 if(!Array.isArray(config?.qualities)){
  return{enabled:new Set(DEFAULT_QUALITIES),priority:DEFAULT_QUALITIES.slice(),configured:false};
 }
 const priority=[];
 const enabled=new Set();
 for(const item of config.qualities){
  if(!item||!item.name)continue;
  const name=getCanonicalQuality(item.name);
  if(!name)continue;
  if(!priority.includes(name))priority.push(name);
  if(item.enabled===true)enabled.add(name);
 }
 for(const quality of DEFAULT_QUALITIES){
  if(!priority.includes(quality))priority.push(quality);
 }
 return{enabled,priority,configured:true};
}

function getStreamQuality(stream){
 if(!stream)return"";
 const nameText=String(stream.name||"").trim();
 const nameQuality=getCanonicalQuality(nameText);
 if(nameQuality)return nameQuality;
 if(/\b(?:org|original)\b/i.test(nameText))return"ORG";
 if(/\b(?:4k|2160p|2160)\b/i.test(nameText))return"4K";
 const nameResolution=nameText.match(/\b(1440p|1440|1080p|1080|720p|720|480p|480|360p|360)\b/i);
 if(nameResolution)return getCanonicalQuality(nameResolution[1])||"";
 const title=String(stream.title||"");
 if(/\b(?:org|original)\b/i.test(title))return"ORG";
 if(/\b(?:4k|2160p|2160)\b/i.test(title))return"4K";
 const titleResolution=title.match(/\b(1440p|1440|1080p|1080|720p|720|480p|480|360p|360)\b/i);
 if(titleResolution)return getCanonicalQuality(titleResolution[1])||"";
 return"";
}

function applyQualitySettings(streams,config){
 const qualityConfig=normalizeQualityConfig(config);
 if(!qualityConfig.configured)return streams;
 const filtered=streams.filter(stream=>{
  const quality=getStreamQuality(stream);
  if(!quality)return true;
  return qualityConfig.enabled.has(quality);
 });
 const priorityMap=new Map(qualityConfig.priority.map((quality,index)=>[quality,index]));
 filtered.sort((a,b)=>{
  const qa=getStreamQuality(a);
  const qb=getStreamQuality(b);
  const ia=qa&&priorityMap.has(qa)?priorityMap.get(qa):Infinity;
  const ib=qb&&priorityMap.has(qb)?priorityMap.get(qb):Infinity;
  return ia-ib;
 });
 return filtered;
}

const DEFAULT_STREAM_FILTERS={cam:false};

function normalizeStreamFilterConfig(config){
 const filters=config?.filters;
 if(!filters||typeof filters!=="object")return{...DEFAULT_STREAM_FILTERS};
 return{cam:filters.cam===true};
}

function isCamOrTelecine(fileName){
 const text=String(fileName||"").toUpperCase();
 return(/\bTELECINE\b/.test(text)||/(?:^|[._\-\s])TC(?:$|[._\-\s])/.test(text)||/\bTELESYNC\b/.test(text)||/(?:^|[._\-\s])TS(?:$|[._\-\s])/.test(text)||/\bCAMRIP\b/.test(text)||/\bCAM\b/.test(text));
}

function applyStreamFilters(streams,config){
 const filters=normalizeStreamFilterConfig(config);
 return streams.filter(stream=>{
  const title=String(stream.title||"");
  if(!filters.cam&&isCamOrTelecine(title))return false;
  return true;
 });
}

function parseSizeGb(value){
 if(value===null||value===undefined)return null;
 const text=String(value).trim().toUpperCase();
 const match=text.match(/^([\d.]+)\s*(TB|GB|MB|KB|B)$/);
 if(!match)return null;
 const number=Number(match[1]);
 if(!Number.isFinite(number))return null;
 const unit=match[2];
 if(unit==="TB")return number*1024;
 if(unit==="GB")return number;
 if(unit==="MB")return number/1024;
 if(unit==="KB")return number/(1024*1024);
 if(unit==="B")return number/(1024*1024*1024);
 return null;
}

function applyFileSizeSettings(streams,config){
 const fileSize=config?.fileSize;
 if(!fileSize||(fileSize.minGb===null&&fileSize.maxGb===null))return streams;
 const minGb=Number.isFinite(Number(fileSize.minGb))?Number(fileSize.minGb):null;
 const maxGb=Number.isFinite(Number(fileSize.maxGb))?Number(fileSize.maxGb):null;
 if(minGb===null&&maxGb===null)return streams;
 return streams.filter(stream=>{
  const sizeGb=parseSizeGb(stream.size);
  if(sizeGb===null)return true;
  if(minGb!==null&&sizeGb<minGb)return false;
  if(maxGb!==null&&sizeGb>maxGb)return false;
  return true;
 });
}

function dedupeStreams(streams){
 const seen=new Set();
 return streams.filter(stream=>{
  if(!stream||!stream.url)return false;
  if(seen.has(stream.url))return false;
  seen.add(stream.url);
  return true;
 });
}

function debugStreamSummary(label,streams){
 if(!Array.isArray(streams)){
  console.log(`[STREAM] ${label}: 0`);
  return;
 }
 console.log(`[STREAM] ${label}: ${streams.length}`);
 streams.forEach((stream,index)=>{
  try{
   const parsed=stream?.url?new URL(stream.url):null;
   console.log(`[STREAM] ${label}[${index}] name=${stream?.name||""} title=${stream?.title||""} type=${stream?.type||""} quality=${getStreamQuality(stream)||"unknown"} host=${parsed?.hostname||""} path=${parsed?.pathname||""}`);
  }catch{
   console.log(`[STREAM] ${label}[${index}] name=${stream?.name||""} title=${stream?.title||""} type=${stream?.type||""} quality=${getStreamQuality(stream)||"unknown"}`);
  }
 });
}

export default async(req,context)=>{
 try{
  const url=new URL(req.url);
  const pathname=url.pathname;
  const debugMode=url.searchParams.get("debug")==="1";

  const match=pathname.match(/^\/([^/]+)\/stream\/([^/]+)\/(.+)$/);
  if(!match)throw new Error("Invalid stream request path");

  const rawConfig=match[1];
  const type=match[2];
  let rawId=decodeURIComponent(match[3]);
  rawId=rawId.replace(/\.json$/,"");

  let imdbId;
  let season;
  let episode;

  if(type==="series"){
   const parts=rawId.split(":");
   imdbId=parts[0];
   season=Number(parts[1]);
   episode=Number(parts[2]);
   if(!imdbId||!Number.isFinite(season)||!Number.isFinite(episode))throw new Error(`Invalid series ID: ${rawId}`);
  }else{
   imdbId=rawId;
  }

  console.log(`[STREAM] Request type=${type} imdb=${imdbId} season=${season??""} episode=${episode??""} debug=${debugMode}`);

  const config=await loadConfig(rawConfig);
  const token=config.uiToken||"";

  if(!token)throw new Error("No ShowBox UI token configured");

  const cacheKey=getStreamCacheKey(rawConfig,type,imdbId,season,episode,config);

  if(debugMode){
   console.log("[STREAM] Debug mode enabled: bypassing stream cache");
  }else{
   const cachedStreams=await getCachedStreams(cacheKey);
   if(cachedStreams){
    console.log(`[STREAM] Cache HIT: ${cachedStreams.length} streams`);
    debugStreamSummary("Cached stream",cachedStreams);
    return new Response(JSON.stringify({streams:cachedStreams}),{status:200,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
   }
   console.log("[STREAM] Cache MISS");
  }

  const febboxStreams=await getFebboxStreams({imdbId,type,season,episode,token}).catch(error=>{
   console.error("[STREAM] FebBox provider failed:",error?.stack||error?.message||error);
   return[];
  });

  const aniKotoStreams=type==="series"?await getAniKotoStreams({imdbId,type,season,episode}).catch(error=>{
   console.error("[STREAM] AniKoto provider failed:",error?.stack||error?.message||error);
   return[];
  }):[];

  debugStreamSummary("FebBox streams",febboxStreams);
  debugStreamSummary("AniKoto streams",aniKotoStreams);

  const streams=[
   ...(Array.isArray(febboxStreams)?febboxStreams:[]),
   ...(Array.isArray(aniKotoStreams)?aniKotoStreams:[])
  ];

  debugStreamSummary("Combined streams",streams);

  const uniqueStreams=dedupeStreams(streams);
  console.log(`[STREAM] After dedupe: ${uniqueStreams.length}`);

  const filteredStreams=applyStreamFilters(uniqueStreams,config);
  console.log(`[STREAM] After filters: ${filteredStreams.length}`);

  const qualityStreams=applyQualitySettings(filteredStreams,config);
  console.log(`[STREAM] After quality: ${qualityStreams.length}`);

  const configuredStreams=applyFileSizeSettings(qualityStreams,config);
  console.log(`[STREAM] After file size: ${configuredStreams.length}`);
  debugStreamSummary("FINAL streams",configuredStreams);

  if(!configuredStreams.length)throw new Error("No streams remain after filtering");

  if(!debugMode)await cacheStreams(cacheKey,configuredStreams);
  else console.log("[STREAM] Debug mode: final streams NOT cached");

  return new Response(JSON.stringify({streams:configuredStreams}),{status:200,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
 }catch(error){
  console.error("[STREAM] Fatal error:",error?.stack||error?.message||error);
  return new Response(JSON.stringify({streams:[]}),{status:200,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
 }
};

export const config={
 path:"/:config/stream/:type/:id.json",
 rateLimit:{windowLimit:60,windowSize:60,aggregateBy:["ip","domain"]}
};
