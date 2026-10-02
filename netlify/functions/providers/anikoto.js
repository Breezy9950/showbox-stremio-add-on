import crypto from "crypto";

// =========================================================
// ANIKOTO PROVIDER
// =========================================================

const UPSTREAM_TIMEOUT_MS=12000;
const CINEMETA_BASE="https://v3-cinemeta.strem.io";
const ANIKOTO_API="https://anikotoapi.site";
const ANIKOTO_RESOLVER_API="https://anikoto-api.onrender.com";
const ANIKOTO_SITE="https://anikototv.to";
const MEGAPLAY_BASE="https://megaplay.buzz";
const MEGAPLAY_VIDEOJS_BASE="https://megaplay.buzz/videojs";
const MEGAPLAY_SOURCE_ENC_KEY="i?LMTAx0Q6,:}50U";
const MEGAPLAY_SOURCE_ENC_IV="W0;27ToaUpl_P%'c";
const MEGAPLAY_CDN_TOKEN_SECRET="MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
const MEGAPLAY_CDN_TOKEN_TTL=90;
const USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

const DEFAULT_HEADERS={
  "User-Agent":USER_AGENT,
  "Accept":"application/json,text/plain,*/*",
  "Accept-Language":"en-US,en;q=0.9"
};

function log(...args){console.log("[AniKoto]",...args);}
function warn(...args){console.warn("[AniKoto]",...args);}
function errorLog(...args){console.error("[AniKoto]",...args);}

async function fetchWithTimeout(url,options={},timeoutMs=UPSTREAM_TIMEOUT_MS){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  log("HTTP →",url);
  try{
    const response=await fetch(url,{redirect:"follow",...options,signal:controller.signal});
    log("HTTP ←",response.status,response.statusText,`${Date.now()-started}ms`,new URL(url).hostname);
    return response;
  }catch(error){
    warn("HTTP ✕",url,error?.name==="AbortError"?"TIMEOUT":error?.message||String(error));
    throw error;
  }finally{clearTimeout(timer);}
}

async function fetchJson(url,options={}){
  const response=await fetchWithTimeout(url,{...options,headers:{...DEFAULT_HEADERS,...(options.headers||{})}});
  if(!response.ok)throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  const text=await response.text();
  log("JSON",new URL(url).hostname,"bytes=",text.length);
  try{return JSON.parse(text);}catch(error){throw new Error(`Invalid JSON from ${new URL(url).hostname}: ${error.message}`);}
}

async function fetchText(url,options={}){
  const response=await fetchWithTimeout(url,{...options,headers:{...DEFAULT_HEADERS,...(options.headers||{})}});
  if(!response.ok)throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  const text=await response.text();
  log("TEXT",new URL(url).hostname,"bytes=",text.length);
  return text;
}

// =========================================================
// HELPERS
// =========================================================

function normalizeTitle(value){
  return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/['’]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}

function titleTokens(value){
  return new Set(normalizeTitle(value).split(" ").filter(Boolean));
}

function tokenOverlap(a,b){
  const aa=titleTokens(a),bb=titleTokens(b);
  if(aa.size===0||bb.size===0)return 0;
  let common=0;
  for(const token of aa)if(bb.has(token))common++;
  return common/Math.max(aa.size,bb.size);
}

function extractYear(value){
  if(!value)return null;
  const match=String(value).match(/\b(19|20)\d{2}\b/);
  return match?Number(match[0]):null;
}

function cleanId(value){
  if(value===null||value===undefined)return null;
  return String(value).trim().replace(/^https?:\/\/[^/]+\/(?:watch|series|anime)\//i,"").replace(/^\/(?:watch|series|anime)\//i,"").split("?")[0].split("#")[0].replace(/^\/+/,"").replace(/\/+$/,"");
}

function isNumericId(value){return /^\d+$/.test(String(value||"").trim());}

function originOf(url){
  try{return new URL(url).origin;}catch{return null;}
}

function hostnameOf(url){
  try{return new URL(url).hostname.toLowerCase();}catch{return "";}
}

function isHost(url,domain){
  const hostname=hostnameOf(url);
  return hostname===domain||hostname.endsWith(`.${domain}`);
}

// =========================================================
// CINEMETA
// =========================================================

async function getCinemetaMetadata(imdbId,type){
  const cleanImdbId=String(imdbId||"").split(":")[0].trim();
  log("Cinemeta: resolving",cleanImdbId,"type=",type);
  if(!/^tt\d+$/i.test(cleanImdbId))throw new Error("Invalid IMDb ID");
  const metadataUrl=`${CINEMETA_BASE}/meta/${type}/${cleanImdbId}.json`;
  const json=await fetchJson(metadataUrl);
  if(!json||!json.meta)throw new Error("Cinemeta metadata not found");
  const meta=json.meta;
  const result={
    id:cleanImdbId,
    title:meta.name||meta.title||"",
    year:extractYear(meta.year||meta.releaseInfo||meta.released),
    originalTitle:meta.originalName||meta.originalTitle||"",
    description:meta.description||""
  };
  log("Cinemeta: title=",result.title,"year=",result.year,"original=",result.originalTitle||"N/A");
  return result;
}

// =========================================================
// ANIKOTO SEARCH
// =========================================================

function extractArray(json){
  if(Array.isArray(json))return json;
  const candidates=[json?.data,json?.results,json?.data?.results,json?.data?.anime,json?.anime,json?.items];
  for(const value of candidates)if(Array.isArray(value))return value;
  return [];
}

function getCandidateTitle(item){
  if(typeof item?.title==="string")return item.title;
  if(item?.title&&typeof item.title==="object")return item.title.english||item.title.romaji||item.title.native||item.title.default||"";
  return item?.name||item?.anime_name||item?.title||"";
}

function getCandidateYear(item){
  return extractYear(item?.year)||extractYear(item?.releaseDate)||extractYear(item?.release_date)||extractYear(item?.aired)||extractYear(item?.date);
}

function getCandidateId(item){
  const value=item?.anime_id??item?.animeId??item?.series_id??item?.seriesId??item?.id??item?.slug??item?.url??item?.link;
  return cleanId(value);
}

function scoreSearchCandidate(item,targetTitle,targetYear){
  const title=getCandidateTitle(item);
  if(!title)return-Infinity;
  const target=normalizeTitle(targetTitle),candidate=normalizeTitle(title);
  if(!target||!candidate)return-Infinity;
  let score=0;
  if(candidate===target)score+=1000;
  if(candidate.includes(target)||target.includes(candidate))score+=350;
  score+=tokenOverlap(targetTitle,title)*300;
  const candidateYear=getCandidateYear(item);
  if(targetYear&&candidateYear){
    if(candidateYear===targetYear)score+=250;
    else if(Math.abs(candidateYear-targetYear)===1)score+=50;
    else score-=150;
  }
  return score;
}

async function searchAniKoto(title,year){
  log("Search: title=",title,"year=",year);
  let best=null;
  const MAX_PAGES=5,PER_PAGE=100;
  for(let page=1;page<=MAX_PAGES;page++){
    const endpoint=`${ANIKOTO_API}/recent-anime?page=${page}&per_page=${PER_PAGE}`;
    try{
      log("Search catalog page:",page,endpoint);
      const json=await fetchJson(endpoint);
      const results=extractArray(json);
      log("Search catalog results:",results.length,"page=",page);
      if(results.length===0)break;
      for(const item of results){
        const id=getCandidateId(item),candidateTitle=getCandidateTitle(item),candidateYear=getCandidateYear(item);
        if(!id)continue;
        const score=scoreSearchCandidate(item,title,year);
        log("Candidate:",candidateTitle||"N/A","year=",candidateYear||"N/A","id=",id,"score=",score);
        if(!best||score>best.score){
          best={id,title:candidateTitle,year:candidateYear,score,raw:item};
          log("★ New best candidate:",best.title,"score=",best.score,"id=",best.id);
        }
        if(best.score>=1000)break;
      }
      if(best&&best.score>=1000)break;
      const pagination=json?.pagination||json?.data?.pagination;
      if(pagination&&pagination.hasNext===false)break;
    }catch(error){
      warn("Search catalog page failed:",page,error?.message||String(error));
    }
  }
  if(!best)throw new Error("AniKoto catalog returned no matching anime");
  log("Search FINAL:",JSON.stringify({id:best.id,title:best.title,year:best.year,score:best.score}));
  return best;
}

// =========================================================
// SLUG → NUMERIC ANIKOTO ID
// =========================================================

function extractNumericId(value){
  if(typeof value==="number"&&Number.isFinite(value))return String(value);
  if(typeof value==="string"&&/^\d+$/.test(value.trim()))return value.trim();
  if(!value||typeof value!=="object")return null;
  const candidates=[
    value.id,value.anime_id,value.animeId,value.series_id,value.seriesId,value.data_id,value.dataId,
    value.anime?.id,value.anime?.anime_id,value.anime?.animeId,
    value.data?.id,value.data?.anime_id,value.data?.animeId,value.data?.data_id,value.data?.dataId
  ];
  for(const candidate of candidates){
    const id=extractNumericId(candidate);
    if(id)return id;
  }
  return null;
}

async function resolveAniKotoId(id){
  const clean=cleanId(id);
  if(!clean)throw new Error("Invalid AniKoto series ID");
  if(isNumericId(clean))return clean;
  log("Series ID is slug:",clean);
  const encoded=encodeURIComponent(clean);
  try{
    const directEndpoint=`${ANIKOTO_API}/series/${encoded}`;
    const directJson=await fetchJson(directEndpoint);
    const directAnime=directJson?.anime||directJson?.data?.anime||directJson?.data||directJson;
    const directId=extractNumericId(directAnime)||extractNumericId(directJson);
    if(directId)return directId;
    const directEpisodes=extractEpisodes(directJson);
    if(directEpisodes.length>0)return clean;
  }catch(error){
    log("ID resolver: direct slug lookup failed:",error?.message||String(error));
  }
  try{
    const resolverEndpoint=`${ANIKOTO_RESOLVER_API}/page?name=${encoded}`;
    const json=await fetchJson(resolverEndpoint);
    const numericId=extractNumericId(json);
    if(numericId){
      log("ID resolver: SUCCESS",clean,"→",numericId);
      return numericId;
    }
  }catch(error){
    warn("ID resolver failed:",error?.message||String(error));
  }
  throw new Error(`Unable to resolve AniKoto slug to numeric ID: ${clean}`);
}

// =========================================================
// SERIES DATA
// =========================================================

function extractEpisodes(json){
  const candidates=[json?.episodes,json?.data?.episodes,json?.anime?.episodes,json?.data?.anime?.episodes,json?.data?.episodeList,json?.episodeList];
  for(const value of candidates)if(Array.isArray(value))return value;
  return [];
}

function getEpisodeNumber(episode){
  const value=episode?.number??episode?.episode??episode?.episodeNumber??episode?.episode_number??episode?.ep??episode?.num;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function getEpisodeEmbedId(episode){
  const value=episode?.episode_embed_id||episode?.episodeEmbedId||episode?.embed_id||episode?.embedId||episode?.data_id||episode?.dataId||episode?.id||null;
  return value===null||value===undefined||value===""?null:String(value);
}

function getEmbedUrl(episode,language){
  const embed=episode?.embed_url||episode?.embedUrl||episode?.embeds||episode?.embed;
  if(typeof embed==="string")return embed;
  if(embed&&typeof embed==="object")return embed[language]||embed[language==="sub"?"subtitle":"dub"]||embed.sub||embed.dub||embed.default||null;
  return null;
}

async function getAniKotoSeries(id){
  const resolvedId=await resolveAniKotoId(id);
  const encoded=encodeURIComponent(resolvedId);
  const endpoint=`${ANIKOTO_API}/series/${encoded}`;
  let lastError=null;
  log("Series: resolved ID=",resolvedId);
  try{
    const json=await fetchJson(endpoint);
    const episodes=extractEpisodes(json);
    log("Series endpoint returned",episodes.length,"episodes");
    if(episodes.length>0)return{json,episodes,id:resolvedId};
  }catch(error){
    lastError=error;
    warn("Series endpoint failed:",error?.message||String(error));
  }
  throw lastError||new Error("AniKoto series data unavailable");
}

function findEpisode(episodes,episodeNumber){
  const target=Number(episodeNumber);
  if(!Number.isFinite(target))return null;
  for(const episode of episodes){
    const number=getEpisodeNumber(episode);
    if(number===target)return episode;
  }
  return null;
}

// =========================================================
// SOURCE PARSING
// =========================================================

function collectSources(value,output=[]){
  if(!value)return output;
  if(typeof value==="string"){
    if(/^https?:\/\//i.test(value))output.push({url:value,quality:null});
    return output;
  }
  if(Array.isArray(value)){
    for(const item of value)collectSources(item,output);
    return output;
  }
  if(typeof value!=="object")return output;
  const url=value.file||value.url||value.src||value.source||value.link;
  if(typeof url==="string"&&/^https?:\/\//i.test(url))output.push({url,quality:value.label||value.quality||value.resolution||value.name||null});
  for(const key of["sources","source","links","files"])if(value[key])collectSources(value[key],output);
  return output;
}

function normalizeQuality(value){
  if(!value)return"Auto";
  const text=String(value).toLowerCase().replace(/\s+/g,"");
  if(text.includes("2160")||text.includes("4k"))return"2160p";
  if(text.includes("1440"))return"1440p";
  if(text.includes("1080"))return"1080p";
  if(text.includes("720"))return"720p";
  if(text.includes("480"))return"480p";
  if(text.includes("360"))return"360p";
  return String(value);
}

function extractSubtitles(json){
  const tracks=json?.tracks||json?.captions||json?.subtitles||[];
  if(!Array.isArray(tracks))return[];
  const subtitles=[],seen=new Set();
  for(const track of tracks){
    if(!track||typeof track!=="object")continue;
    const url=track.file||track.url||track.src;
    if(!url||!/^https?:\/\//i.test(url))continue;
    const kind=String(track.kind||track.type||"captions").toLowerCase();
    if(!kind.includes("caption")&&!kind.includes("subtitle")&&!kind.includes("sub"))continue;
    if(seen.has(url))continue;
    seen.add(url);
    subtitles.push({url,lang:track.label||track.srclang||track.lang||"English"});
  }
  return subtitles;
}

// =========================================================
// ANIKOTO WEBSITE SERVER DISCOVERY
// =========================================================

function getCandidateSlug(item){
  const value=item?.slug||item?.anime_slug||item?.animeSlug||item?.watchSlug||item?.url||item?.link||item?.episodeUrl;
  if(!value)return null;
  const text=String(value).trim();
  const match=text.match(/\/watch\/([^/?#]+)/i);
  return cleanId(match?.[1]||text);
}

function cookieHeader(response){
  const values=typeof response.headers.getSetCookie==="function"?response.headers.getSetCookie():[];
  if(values.length)return values.map(value=>value.split(";",1)[0]).join("; ");
  const value=response.headers.get("set-cookie");
  return value?value.split(/,(?=[^;]+=[^;]+)/).map(item=>item.split(";",1)[0]).join("; "):"";
}

async function fetchSiteText(url,cookie="",referer=ANIKOTO_SITE+"/"){
  const response=await fetchWithTimeout(url,{
    headers:{
      ...DEFAULT_HEADERS,
      "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer":referer,
      "Origin":ANIKOTO_SITE,
      ...(cookie?{Cookie:cookie}:{})
    }
  });
  if(!response.ok)throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return{url:response.url,text:await response.text(),cookie:cookieHeader(response)};
}

function mergeCookies(...values){
  const map=new Map();
  for(const value of values.flatMap(value=>String(value||"").split(/;\s*/))){
    const index=value.indexOf("=");
    if(index>0)map.set(value.slice(0,index),value.slice(index+1));
  }
  return[...map].map(([key,value])=>`${key}=${value}`).join("; ");
}

function parseWatchVideoId(html){
  const patterns=[/\/anime\/getinfo\/(\d+)/i,/data-anime-id=["'](\d+)["']/i,/anime\/getinfo["'`\s:/]+(\d+)/i];
  for(const pattern of patterns){
    const match=html.match(pattern);
    if(match?.[1])return match[1];
  }
  return null;
}

function parseEpisodeRows(html){
  const rows=[];
  const pattern=/<li\b[^>]*data-html=["']true["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while((match=pattern.exec(html))){
    const block=match[1];
    const anchor=block.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if(!anchor)continue;
    const attrs=anchor[1];
    const getAttr=name=>{
      const re=new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`,"i");
      return attrs.match(re)?.[2]||null;
    };
    rows.push({
      number:Number(getAttr("data-num")||getAttr("data-episode")||getAttr("data-ep")||rows.length+1),
      ids:getAttr("data-ids")||getAttr("data-id"),
      malId:getAttr("data-mal"),
      timestamp:getAttr("data-timestamp")
    });
  }
  return rows;
}

function stripHtml(value){
  return String(value||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
}

function parseServerRows(html){
  const servers=[],seen=new Set();
  const typeBlocks=/<div\b([^>]*class=["'][^"']*\btype\b[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi;
  let blockMatch;
  while((blockMatch=typeBlocks.exec(html))){
    const attrs=blockMatch[1],block=blockMatch[2];
    const type=(attrs.match(/\bdata-type=["']([^"']+)["']/i)?.[1]||"sub").toLowerCase();
    const liPattern=/<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while((liMatch=liPattern.exec(block))){
      const liAttrs=liMatch[1];
      const linkId=liAttrs.match(/\bdata-link-id=["']([^"']+)["']/i)?.[1]||liAttrs.match(/\bdata-id=["']([^"']+)["']/i)?.[1];
      if(!linkId)continue;
      const name=stripHtml(liMatch[2])||"Server";
      const key=`${type}:${linkId}`;
      if(seen.has(key))continue;
      seen.add(key);
      servers.push({type,name,linkId});
    }
  }
  if(servers.length)return servers;
  const generic=/<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
  let match;
  while((match=generic.exec(html))){
    const linkId=match[1].match(/\bdata-link-id=["']([^"']+)["']/i)?.[1];
    if(!linkId)continue;
    const type=(match[1].match(/\bdata-type=["']([^"']+)["']/i)?.[1]||"sub").toLowerCase();
    const name=stripHtml(match[2])||"Server";
    const key=`${type}:${linkId}`;
    if(!seen.has(key)){
      seen.add(key);
      servers.push({type,name,linkId});
    }
  }
  return servers;
}

async function getAniKotoWebsiteServers(slug,episodeNumber,language){
  if(!slug)throw new Error("AniKoto slug unavailable");
  const watchUrl=`${ANIKOTO_SITE}/watch/${encodeURIComponent(slug)}/ep-${episodeNumber}`;
  log("Website: opening",watchUrl);
  const page=await fetchSiteText(watchUrl);
  let cookie=mergeCookies(page.cookie,"country_code=US");
  const videoId=parseWatchVideoId(page.text);
  if(!videoId)throw new Error("AniKoto watch-page video ID not found");
  const siteOrigin=new URL(page.url).origin;
  const episodeUrl=`${siteOrigin}/ajax/episode/list/${videoId}?vrf=`;
  const episodeResponse=await fetchSiteText(episodeUrl,cookie,siteOrigin+"/");
  cookie=mergeCookies(cookie,episodeResponse.cookie);
  const episodes=parseEpisodeRows(episodeResponse.text);
  const target=episodes.find(item=>item.number===Number(episodeNumber));
  if(!target?.ids)throw new Error(`AniKoto website episode ${episodeNumber} data ID not found`);
  const serverUrl=`${siteOrigin}/ajax/server/list?servers=${encodeURIComponent(target.ids)}`;
  const serverResponse=await fetchSiteText(serverUrl,cookie,siteOrigin+"/");
  cookie=mergeCookies(cookie,serverResponse.cookie);
  const servers=parseServerRows(serverResponse.text).filter(server=>server.type===String(language).toLowerCase());
  log("Website servers:",servers.length,language.toUpperCase());
  const resolved=[];
  for(const server of servers){
    try{
      const endpoint=`${siteOrigin}/ajax/server?get=${encodeURIComponent(server.linkId)}`;
      const response=await fetchJson(endpoint,{headers:{Cookie:cookie,Referer:watchUrl,"X-Requested-With":"XMLHttpRequest"}});
      const embed=response?.result?.url||response?.url||response?.data?.url;
      if(embed)resolved.push({...server,embedUrl:embed,malId:target.malId,timestamp:target.timestamp,watchUrl,cookie});
    }catch(error){
      warn("Server link failed",server.name,error?.message||String(error));
    }
  }
  return resolved;
}

// =========================================================
// STREMIO STREAM OBJECT
// =========================================================

function streamObject(url,title,episodeNumber,language,provider,quality="Auto",referer=null,subtitles=[]){
  const isHls=/\.m3u8(?:$|\?)/i.test(url);
  const origin=originOf(referer||url);
  return{
    name:`AniKoto ${language.toUpperCase()} ${provider} ${quality}`,
    title:`${title} - Episode ${episodeNumber} (${language.toUpperCase()})`,
    url,
    quality,
    provider:`anikoto-${provider}`,
    type:isHls?"m3u8":"mp4",
    hls:isHls,
    subtitles,
    behaviorHints:{
      proxyHeaders:{
        request:{
          ...(referer?{Referer:referer}:{}),
          ...(origin?{Origin:origin}:{}),
          "User-Agent":USER_AGENT
        }
      }
    }
  };
}

// =========================================================
// RESOLVED SOURCES → STREAMS
// =========================================================

function streamsFromResolved(sourceJson,title,episodeNumber,language,provider,referer){
  const sources=collectSources(sourceJson);
  const subtitles=extractSubtitles(sourceJson);
  const streams=[],seen=new Set();
  for(const source of sources){
    if(!source?.url||seen.has(source.url))continue;
    seen.add(source.url);
    streams.push(streamObject(source.url,title,episodeNumber,language,provider,normalizeQuality(source.quality),referer,subtitles));
  }
  log("Parsed native sources:",streams.length,"provider=",provider);
  return streams;
}

function streamFromMediaUrl(mediaUrl,title,episodeNumber,language,provider,referer,subtitles=[]){
  if(!mediaUrl)return[];
  return[streamObject(mediaUrl,title,episodeNumber,language,provider,"Auto",referer,subtitles)];
}

// =========================================================
// MEGAPLAY VIDEOJS
// =========================================================

function extractPlayerId(html){
  const patterns=[
    /\bdata-id=["'](\d+)["']/i,
    /\bdata-id\s*=\s*(\d+)/i,
    /id=["']megaplay-player["'][^>]*data-id=["'](\d+)["']/i,
    /data-id=["'](\d+)["'][^>]*id=["']megaplay-player["']/i
  ];
  for(const pattern of patterns){
    const match=html.match(pattern);
    if(match?.[1])return match[1];
  }
  return null;
}

function b64UrlDecode(value){
  let text=String(value).replace(/-/g,"+").replace(/_/g,"/");
  while(text.length%4)text+="=";
  return Buffer.from(text,"base64");
}

function b64UrlEncode(value){
  return Buffer.from(value).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

function padKeyBytes(value,length){
  const raw=Buffer.from(String(value),"utf8");
  return raw.length>=length?raw.subarray(0,length):Buffer.concat([raw,Buffer.alloc(length-raw.length)]);
}

function decryptMegaPlaySources(enc){
  try{
    const decipher=crypto.createDecipheriv("aes-256-cbc",padKeyBytes(MEGAPLAY_SOURCE_ENC_KEY,32),padKeyBytes(MEGAPLAY_SOURCE_ENC_IV,16));
    const output=Buffer.concat([decipher.update(b64UrlDecode(enc)),decipher.final()]);
    const json=JSON.parse(output.toString("utf8"));
    return json&&typeof json.file==="string"?json:null;
  }catch(error){
    warn("MegaPlay source decrypt failed:",error?.message||String(error));
    return null;
  }
}

function extractCdnPathKey(url){
  const match=String(url).match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i);
  return match?`${match[1].toLowerCase()}/${match[2].toLowerCase()}`:null;
}

function buildCdnToken(url){
  const pathKey=extractCdnPathKey(url);
  if(!pathKey)return null;
  const exp=Math.floor(Date.now()/1000)+MEGAPLAY_CDN_TOKEN_TTL;
  const payload=`${exp}|${pathKey}`;
  const signature=crypto.createHmac("sha256",MEGAPLAY_CDN_TOKEN_SECRET).update(payload).digest();
  return`${b64UrlEncode(Buffer.from(payload))}.${b64UrlEncode(signature)}`;
}

function withCdnToken(url){
  if(!url||!extractCdnPathKey(url))return url;
  const token=buildCdnToken(url);
  return token?`${url}${url.includes("?")?"&":"?"}token=${encodeURIComponent(token)}`:url;
}

async function resolveMegaPlaySource(embedUrl){
  if(!embedUrl)throw new Error("MegaPlay embed URL missing");
  if(!isHost(embedUrl,"megaplay.buzz"))throw new Error(`Not a MegaPlay URL: ${hostnameOf(embedUrl)}`);
  const videojsUrl=embedUrl.replace("/stream/","/videojs/stream/");
  log("MegaPlay: resolving VideoJS embed",videojsUrl);
  const html=await fetchText(videojsUrl,{
    headers:{
      "User-Agent":USER_AGENT,
      "Accept":"text/html,application/xhtml+xml,application/json,text/plain,*/*",
      "Referer":`${MEGAPLAY_BASE}/`,
      "Origin":MEGAPLAY_BASE
    }
  });
  const playerId=extractPlayerId(html);
  if(!playerId){
    warn("MegaPlay: player ID not found","html bytes=",html.length);
    throw new Error("MegaPlay videojs player ID not found");
  }
  log("MegaPlay: videojs player ID=",playerId);
  const sourceUrl=`${MEGAPLAY_VIDEOJS_BASE}/stream/getSources?id=${encodeURIComponent(playerId)}`;
  const sourceJson=await fetchJson(sourceUrl,{
    headers:{
      "Accept":"application/json,text/plain,*/*",
      "Origin":MEGAPLAY_BASE,
      "Referer":videojsUrl,
      "User-Agent":USER_AGENT
    }
  });
  log("MegaPlay: source response received","enc=",typeof sourceJson?.enc,"bytes=",JSON.stringify(sourceJson).length);
  let mediaUrl=null;
  let resolvedJson=sourceJson;
  if(typeof sourceJson?.sources?.file==="string")mediaUrl=sourceJson.sources.file;
  if(!mediaUrl&&typeof sourceJson?.file==="string")mediaUrl=sourceJson.file;
  if(!mediaUrl&&typeof sourceJson?.enc==="string"){
    const decrypted=decryptMegaPlaySources(sourceJson.enc);
    if(decrypted?.file){
      mediaUrl=decrypted.file;
      resolvedJson={...sourceJson,...decrypted};
    }
  }
  if(!mediaUrl)throw new Error("MegaPlay videojs source contained no media URL");
  const originalMediaUrl=mediaUrl;
  mediaUrl=withCdnToken(mediaUrl);
  log("MegaPlay: source URL=",originalMediaUrl);
  log("MegaPlay: final media URL=",mediaUrl.replace(/([?&](?:token|KEY\d+)=)[^&]+/gi,"$1REDACTED"));
  return{sourceJson:resolvedJson,embedUrl:videojsUrl,mediaUrl};
}

// =========================================================
// VIDTUBE
// =========================================================

function extractVidTubeId(html){
  const patterns=[/\bdata-id=["'](\d+)["']/i,/\bdata-id\s*=\s*(\d+)/i,/\bdata-ep-id=["'](\d+)["']/i,/\bdata-episode-id=["'](\d+)["']/i];
  for(const pattern of patterns){
    const match=html.match(pattern);
    if(match?.[1])return match[1];
  }
  return null;
}

function extractVidTubeType(html){
  return html.match(/\bdata-type=["']([^"']+)["']/i)?.[1]||html.match(/\btype\s*:\s*["']([^"']+)["']/i)?.[1]||"sub";
}

async function resolveVidTubeSource(embedUrl){
  const origin=originOf(embedUrl);
  if(!origin)throw new Error("Invalid VidTube embed URL");
  if(!isHost(embedUrl,"vidtube.site"))throw new Error(`Not a VidTube URL: ${hostnameOf(embedUrl)}`);
  const html=await fetchText(embedUrl,{
    headers:{
      "User-Agent":USER_AGENT,
      "Accept":"text/html,application/xhtml+xml,application/json,text/plain,*/*",
      "Referer":`${origin}/`,
      "Origin":origin
    }
  });
  const id=extractVidTubeId(html);
  if(!id)throw new Error("VidTube player ID not found");
  const type=extractVidTubeType(html);
  const sourceUrl=`${origin}/stream/getSources?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`;
  log("VidTube: requesting source metadata",sourceUrl);
  const sourceJson=await fetchJson(sourceUrl,{
    headers:{
      "Accept":"application/json,text/plain,*/*",
      "Origin":origin,
      "Referer":embedUrl,
      "User-Agent":USER_AGENT
    }
  });
  const sources=collectSources(sourceJson);
  if(!sources.length)throw new Error("VidTube source response contained no media URL");
  return{sourceJson,embedUrl};
}

// =========================================================
// SERVER RESOLUTION
// =========================================================

async function resolveServer(server,title,episodeNumber,language){
  const embedUrl=server?.embedUrl;
  if(!embedUrl)throw new Error("Server has no embed URL");
  const hostname=hostnameOf(embedUrl);
  log("Resolving server:",server.name,hostname);

  if(isHost(embedUrl,"megaplay.buzz")){
    const resolved=await resolveMegaPlaySource(embedUrl);
    const subtitles=extractSubtitles(resolved.sourceJson);
    return streamFromMediaUrl(
      resolved.mediaUrl,
      title,
      episodeNumber,
      language,
      server.name||"MegaPlay",
      resolved.embedUrl,
      subtitles
    );
  }

  if(isHost(embedUrl,"vidtube.site")){
    const resolved=await resolveVidTubeSource(embedUrl);
    return streamsFromResolved(
      resolved.sourceJson,
      title,
      episodeNumber,
      language,
      server.name||"VidTube",
      embedUrl
    );
  }

  throw new Error(`Unsupported native server: ${hostname||"unknown"}`);
}

// =========================================================
// MAIN STREAM RESOLUTION
// =========================================================

export async function getStreams({imdbId,type="series",season=1,episode=1}={}){
  const started=Date.now();
  log("REQUEST START",JSON.stringify({imdbId,type,season,episode}));

  try{
    if(type!=="series")return[];

    const cleanImdbId=String(imdbId||"").split(":")[0].trim();
    const seasonNumber=Number(season||1);
    const episodeNumber=Number(episode||1);

    if(!/^tt\d+$/i.test(cleanImdbId)||!Number.isFinite(seasonNumber)||!Number.isFinite(episodeNumber))return[];

    const metadata=await getCinemetaMetadata(cleanImdbId,"series");
    if(!metadata.title)return[];

    log("AniKoto matching:",metadata.title,metadata.year);

    const match=await searchAniKoto(metadata.title,metadata.year);
    if(!match?.id)return[];

    let slug=getCandidateSlug(match.raw)||getCandidateSlug(match);

    if(!slug&&!isNumericId(match.id))slug=cleanId(match.id);

    log("AniKoto matched:",match.title,"id=",match.id,"slug=",slug||"N/A");

    const series=await getAniKotoSeries(match.id);
    const episodeData=findEpisode(series.episodes,episodeNumber);

    if(!episodeData){
      warn("Episode not found:",episodeNumber);
      return[];
    }

    log("Episode found:",episodeNumber,"embedId=",getEpisodeEmbedId(episodeData));

    const streams=[];

    for(const language of["sub","dub"]){
      let servers=[];

      if(slug){
        try{
          servers=await getAniKotoWebsiteServers(slug,episodeNumber,language);
        }catch(error){
          warn("Website server discovery failed",language,error?.message||String(error));
        }
      }

      if(!servers.length){
        const embed=getEmbedUrl(episodeData,language);
        if(embed){
          servers=[{
            type:language,
            name:isHost(embed,"megaplay.buzz")?"MegaPlay":"AniKoto",
            embedUrl:embed,
            malId:episodeData?.malId||episodeData?.mal_id,
            timestamp:episodeData?.timestamp,
            watchUrl:null,
            cookie:""
          }];
        }
      }

      log("Language:",language,"servers:",servers.length);

      for(const server of servers){
        try{
          const resolved=await resolveServer(server,metadata.title,episodeNumber,language);

          if(resolved.length){
            streams.push(...resolved);
            log("Server resolved:",server.name,"streams=",resolved.length);
          }else{
            warn("Server returned no native streams:",server.name);
          }
        }catch(error){
          warn("Server resolver failed",server.name,error?.message||String(error));
        }
      }
    }

    const unique=[],seen=new Set();

    for(const stream of streams){
      if(!stream?.url||seen.has(stream.url))continue;

      if(/\/stream\/(?:s-2|ani|mal)\//i.test(stream.url)&&!/\.m3u8(?:$|\?)/i.test(stream.url)){
        warn("Rejected embed URL:",stream.url);
        continue;
      }

      seen.add(stream.url);
      unique.push(stream);
    }

    const qualityRank={
      "2160p":2160,
      "4k":2160,
      "1440p":1440,
      "1080p":1080,
      "720p":720,
      "480p":480,
      "360p":360,
      "auto":0
    };

    unique.sort((a,b)=>
      (qualityRank[String(b.quality||"Auto").toLowerCase()]||0)-
      (qualityRank[String(a.quality||"Auto").toLowerCase()]||0)
    );

    log("FINAL streams:",unique.length,`in ${Date.now()-started}ms`);

    for(const stream of unique){
      log("STREAM:",stream.provider,stream.quality,stream.type,stream.hls?"HLS":"DIRECT");
    }

    return unique;

  }catch(error){
    errorLog("REQUEST FAILED:",error?.message||String(error));
    if(error?.stack)errorLog(error.stack);
    return[];
  }
}

export default{getStreams};
