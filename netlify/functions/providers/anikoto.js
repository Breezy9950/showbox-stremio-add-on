// =========================================================
// ANIKOTO PROVIDER
// =========================================================

const UPSTREAM_TIMEOUT_MS=12000;
const CINEMETA_BASE="https://v3-cinemeta.strem.io";
const ANIKOTO_API="https://anikotoapi.site";
const ANIKOTO_RESOLVER_API="https://anikoto-api.onrender.com";
const ANIKOTO_SITE="https://anikototv.to";
const MEGAPLAY_BASE="https://megaplay.buzz";
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
  try{
    return await fetch(url,{redirect:"follow",...options,signal:controller.signal});
  }catch(error){
    warn("HTTP failed",new URL(url).hostname,error?.name==="AbortError"?"TIMEOUT":error?.message||String(error));
    throw error;
  }finally{clearTimeout(timer);}
}

async function fetchJson(url,options={}){
  const response=await fetchWithTimeout(url,{...options,headers:{...DEFAULT_HEADERS,...(options.headers||{})}});
  if(!response.ok)throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  const text=await response.text();
  try{return JSON.parse(text);}
  catch(error){throw new Error(`Invalid JSON from ${new URL(url).hostname}: ${error.message}`);}
}

async function fetchText(url,options={}){
  const response=await fetchWithTimeout(url,{...options,headers:{...DEFAULT_HEADERS,...(options.headers||{})}});
  if(!response.ok)throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return await response.text();
}

// =========================================================
// HELPERS
// =========================================================

function normalizeTitle(value){
  return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/['’]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}

function titleTokens(value){return new Set(normalizeTitle(value).split(" ").filter(Boolean));}

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
  if(!/^tt\d+$/i.test(cleanImdbId))throw new Error("Invalid IMDb ID");
  const metadataUrl=`${CINEMETA_BASE}/meta/${type}/${cleanImdbId}.json`;
  const json=await fetchJson(metadataUrl);
  if(!json||!json.meta)throw new Error("Cinemeta metadata not found");
  const meta=json.meta;
  return{
    id:cleanImdbId,
    title:meta.name||meta.title||"",
    year:extractYear(meta.year||meta.releaseInfo||meta.released),
    originalTitle:meta.originalName||meta.originalTitle||"",
    description:meta.description||""
  };
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

function extractSeasonNumber(value){
  const text=String(value||"");
  let match=text.match(/\bseason[\s._-]*(\d+)\b/i);
  if(match)return Number(match[1]);
  match=text.match(/\b(\d+)(?:st|nd|rd|th)[\s._-]+season\b/i);
  if(match)return Number(match[1]);
  match=text.match(/\bs(\d+)\b/i);
  if(match)return Number(match[1]);
  return null;
}

function isBaseSeasonTitle(value){return extractSeasonNumber(value)===null;}

function scoreSearchCandidate(item,targetTitle,targetYear,targetSeason){
  const title=getCandidateTitle(item);
  if(!title)return-Infinity;
  const target=normalizeTitle(targetTitle);
  const candidate=normalizeTitle(title);
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

  const candidateSeason=extractSeasonNumber(title);

  if(targetSeason>1){
    if(candidateSeason===targetSeason)score+=1800;
    else if(candidateSeason!==null)score-=1200;
    else score-=350;
  }else if(targetSeason===1){
    if(candidateSeason===1)score+=1200;
    else if(candidateSeason!==null)score-=1200;
    else score+=500;
  }

  return score;
}

async function searchAniKoto(title,year,season=1){
  let best=null;
  const MAX_PAGES=10;
  const PER_PAGE=100;

  for(let page=1;page<=MAX_PAGES;page++){
    const endpoint=`${ANIKOTO_API}/recent-anime?page=${page}&per_page=${PER_PAGE}`;

    try{
      const json=await fetchJson(endpoint);
      const results=extractArray(json);

      if(results.length===0)break;

      for(const item of results){
        const id=getCandidateId(item);
        if(!id)continue;

        const candidateTitle=getCandidateTitle(item);
        const candidateYear=getCandidateYear(item);
        const candidateSeason=extractSeasonNumber(candidateTitle);
        const score=scoreSearchCandidate(item,title,year,season);

        if(!best||score>best.score){
          best={
            id,
            title:candidateTitle,
            year:candidateYear,
            season:candidateSeason,
            score,
            raw:item
          };
        }
      }

      const pagination=json?.pagination||json?.data?.pagination;
      if(pagination&&pagination.hasNext===false)break;

    }catch(error){
      warn("Search page failed",page,error?.message||String(error));
    }
  }

  if(!best)throw new Error("AniKoto catalog returned no matching anime");

  log("Search matched",best.id,"score=",best.score);
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
    value.id,value.anime_id,value.animeId,value.series_id,value.seriesId,
    value.data_id,value.dataId,value.anime?.id,value.anime?.anime_id,
    value.anime?.animeId,value.data?.id,value.data?.anime_id,
    value.data?.animeId,value.data?.data_id,value.data?.dataId
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

  const encoded=encodeURIComponent(clean);

  try{
    const directJson=await fetchJson(`${ANIKOTO_API}/series/${encoded}`);
    const directAnime=directJson?.anime||directJson?.data?.anime||directJson?.data||directJson;
    const directId=extractNumericId(directAnime)||extractNumericId(directJson);
    if(directId)return directId;
    const directEpisodes=extractEpisodes(directJson);
    if(directEpisodes.length>0)return clean;
  }catch(error){
    warn("Slug lookup failed",error?.message||String(error));
  }

  try{
    const json=await fetchJson(`${ANIKOTO_RESOLVER_API}/page?name=${encoded}`);
    const numericId=extractNumericId(json);
    if(numericId)return numericId;
  }catch(error){
    warn("ID resolver failed",error?.message||String(error));
  }

  throw new Error(`Unable to resolve AniKoto slug to numeric ID: ${clean}`);
}

// =========================================================
// SERIES DATA
// =========================================================

function extractEpisodes(json){
  const candidates=[
    json?.episodes,
    json?.data?.episodes,
    json?.anime?.episodes,
    json?.data?.anime?.episodes,
    json?.data?.episodeList,
    json?.episodeList
  ];

  for(const value of candidates){
    if(Array.isArray(value))return value;
  }

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

  if(embed&&typeof embed==="object"){
    return embed[language]||
      embed[language==="sub"?"subtitle":"dub"]||
      embed.sub||
      embed.dub||
      embed.default||
      null;
  }

  return null;
}

async function getAniKotoSeries(id){
  const resolvedId=await resolveAniKotoId(id);
  const encoded=encodeURIComponent(resolvedId);
  const endpoint=`${ANIKOTO_API}/series/${encoded}`;
  let lastError=null;

  try{
    const json=await fetchJson(endpoint);
    const episodes=extractEpisodes(json);

    if(episodes.length>0)return{json,episodes,id:resolvedId};

  }catch(error){
    lastError=error;
    warn("Series endpoint failed",error?.message||String(error));
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

  if(typeof url==="string"&&/^https?:\/\//i.test(url)){
    output.push({
      url,
      quality:value.label||value.quality||value.resolution||value.name||null
    });
  }

  for(const key of["sources","source","links","files"]){
    if(value[key])collectSources(value[key],output);
  }

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

  const subtitles=[];
  const seen=new Set();

  for(const track of tracks){
    if(!track||typeof track!=="object")continue;

    const url=track.file||track.url||track.src;
    if(!url||!/^https?:\/\//i.test(url))continue;

    const kind=String(track.kind||track.type||"captions").toLowerCase();

    if(!kind.includes("caption")&&!kind.includes("subtitle")&&!kind.includes("sub"))continue;
    if(seen.has(url))continue;

    seen.add(url);

    subtitles.push({
      url,
      lang:track.label||track.srclang||track.lang||"English"
    });
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

  return value?
    value.split(/,(?=[^;]+=[^;]+)/).map(item=>item.split(";",1)[0]).join("; "):
    "";
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

  return{
    url:response.url,
    text:await response.text(),
    cookie:cookieHeader(response)
  };
}

function mergeCookies(...values){
  const map=new Map();

  for(const value of values.flatMap(value=>String(value||"").split(/;\s*/))){
    const index=value.indexOf("=");

    if(index>0){
      map.set(value.slice(0,index),value.slice(index+1));
    }
  }

  return[...map].map(([key,value])=>`${key}=${value}`).join("; ");
}

function parseWatchVideoId(html){
  const patterns=[
    /\/anime\/getinfo\/(\d+)/i,
    /data-anime-id=["'](\d+)["']/i,
    /anime\/getinfo["'`\s:/]+(\d+)/i
  ];

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
  const servers=[];
  const seen=new Set();
  const typeBlocks=/<div\b([^>]*class=["'][^"']*\btype\b[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi;
  let blockMatch;

  while((blockMatch=typeBlocks.exec(html))){
    const attrs=blockMatch[1];
    const block=blockMatch[2];

    const type=(attrs.match(/\bdata-type=["']([^"']+)["']/i)?.[1]||"sub").toLowerCase();
    const liPattern=/<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let liMatch;

    while((liMatch=liPattern.exec(block))){
      const liAttrs=liMatch[1];

      const linkId=
        liAttrs.match(/\bdata-link-id=["']([^"']+)["']/i)?.[1]||
        liAttrs.match(/\bdata-id=["']([^"']+)["']/i)?.[1];

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
    const linkId=
      match[1].match(/\bdata-link-id=["']([^"']+)["']/i)?.[1]||
      match[1].match(/\bdata-id=["']([^"']+)["']/i)?.[1];

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

  const servers=parseServerRows(serverResponse.text).filter(
    server=>server.type===String(language).toLowerCase()
  );

  const resolved=[];

  for(const server of servers){
    try{
      const endpoint=`${siteOrigin}/ajax/server?get=${encodeURIComponent(server.linkId)}`;

      const response=await fetchJson(endpoint,{
        headers:{
          Cookie:cookie,
          Referer:watchUrl,
          "X-Requested-With":"XMLHttpRequest"
        }
      });

      const embed=response?.result?.url||response?.url||response?.data?.url;

      if(embed){
        resolved.push({
          ...server,
          embedUrl:embed,
          malId:target.malId,
          timestamp:target.timestamp,
          watchUrl,
          cookie
        });
      }

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
  const streams=[];
  const seen=new Set();

  for(const source of sources){
    if(!source?.url||seen.has(source.url))continue;

    seen.add(source.url);

    streams.push(
      streamObject(
        source.url,
        title,
        episodeNumber,
        language,
        provider,
        normalizeQuality(source.quality),
        referer,
        subtitles
      )
    );
  }

  return streams;
}

function streamFromMediaUrl(mediaUrl,title,episodeNumber,language,provider,referer,subtitles=[]){
  if(!mediaUrl)return[];

  return[
    streamObject(
      mediaUrl,
      title,
      episodeNumber,
      language,
      provider,
      "Auto",
      referer,
      subtitles
    )
  ];
}

// =========================================================
// MEGAPLAY NATIVE SOURCE RESOLUTION
// =========================================================

function extractPlayerId(html){
  const patterns=[
    /id=["']megaplay-player["'][^>]*\bdata-id=["'](\d+)["']/i,
    /\bdata-id=["'](\d+)["'][^>]*id=["']megaplay-player["']/i,
    /\bdata-id=["'](\d+)["']/i,
    /\bdata-id\s*=\s*(\d+)/i
  ];

  for(const pattern of patterns){
    const match=html.match(pattern);
    if(match?.[1])return match[1];
  }

  return null;
}

async function resolveMegaPlaySource(embedUrl){
  if(!embedUrl)throw new Error("MegaPlay embed URL missing");

  if(!isHost(embedUrl,"megaplay.buzz")){
    throw new Error(`Not a MegaPlay URL: ${hostnameOf(embedUrl)}`);
  }

  const sourcePageUrl=embedUrl;

  const html=await fetchText(sourcePageUrl,{
    headers:{
      "User-Agent":USER_AGENT,
      "Accept":"text/html,application/json,text/plain,*/*",
      "Referer":`${MEGAPLAY_BASE}/`,
      "Origin":MEGAPLAY_BASE
    }
  });

  const playerId=extractPlayerId(html);

  if(!playerId)throw new Error("MegaPlay player data-id not found");

  const sourceUrl=`${MEGAPLAY_BASE}/stream/getSources?id=${encodeURIComponent(playerId)}`;

  const sourceJson=await fetchJson(sourceUrl,{
    headers:{
      "Accept":"application/json,text/plain,*/*",
      "Origin":MEGAPLAY_BASE,
      "Referer":sourcePageUrl,
      "User-Agent":USER_AGENT
    }
  });

  const sources=collectSources(sourceJson);

  if(!sources.length)throw new Error("MegaPlay source response contained no media URL");

  return{
    sourceJson,
    embedUrl:sourcePageUrl
  };
}

// =========================================================
// VIDTUBE
// =========================================================

function extractVidTubeId(html){
  const patterns=[
    /\bdata-id=["'](\d+)["']/i,
    /\bdata-id\s*=\s*(\d+)/i,
    /\bdata-ep-id=["'](\d+)["']/i,
    /\bdata-episode-id=["'](\d+)["']/i
  ];

  for(const pattern of patterns){
    const match=html.match(pattern);
    if(match?.[1])return match[1];
  }

  return null;
}

function extractVidTubeType(html){
  return(
    html.match(/\bdata-type=["']([^"']+)["']/i)?.[1]||
    html.match(/\btype\s*:\s*["']([^"']+)["']/i)?.[1]||
    "sub"
  );
}

async function resolveVidTubeSource(embedUrl){
  const origin=originOf(embedUrl);

  if(!origin)throw new Error("Invalid VidTube embed URL");

  if(!isHost(embedUrl,"vidtube.site")){
    throw new Error(`Not a VidTube URL: ${hostnameOf(embedUrl)}`);
  }

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

  return{
    sourceJson,
    embedUrl
  };
}

// =========================================================
// SERVER RESOLUTION
// =========================================================

async function resolveServer(server,title,episodeNumber,language){
  const embedUrl=server?.embedUrl;

  if(!embedUrl)throw new Error("Server has no embed URL");

  const hostname=hostnameOf(embedUrl);

  log("Resolving",server.name||hostname);

  if(isHost(embedUrl,"megaplay.buzz")){
    const resolved=await resolveMegaPlaySource(embedUrl);

    return streamsFromResolved(
      resolved.sourceJson,
      title,
      episodeNumber,
      language,
      server.name||"MegaPlay",
      resolved.embedUrl
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

export async function getStreams({
  imdbId,
  type="series",
  season=1,
  episode=1
}={}){
  try{
    if(type!=="series")return[];

    const cleanImdbId=String(imdbId||"").split(":")[0].trim();
    const seasonNumber=Number(season||1);
    const episodeNumber=Number(episode||1);

    if(
      !/^tt\d+$/i.test(cleanImdbId)||
      !Number.isFinite(seasonNumber)||
      !Number.isFinite(episodeNumber)
    )return[];

    const metadata=await getCinemetaMetadata(cleanImdbId,"series");

    if(!metadata.title)return[];

    const match=await searchAniKoto(
      metadata.title,
      metadata.year,
      seasonNumber
    );

    if(!match?.id)return[];

    let slug=getCandidateSlug(match.raw)||getCandidateSlug(match);

    if(!slug&&!isNumericId(match.id))slug=cleanId(match.id);

    log("Matched",match.id,"season=",match.season||"base");

    const series=await getAniKotoSeries(match.id);

    const episodeData=findEpisode(series.episodes,episodeNumber);

    if(!episodeData){
      warn("Episode not found",`S${seasonNumber}E${episodeNumber}`);
      return[];
    }

    log("Episode found",episodeNumber);

    const streams=[];

    for(const language of["sub","dub"]){
      let servers=[];

      if(slug){
        try{
          servers=await getAniKotoWebsiteServers(
            slug,
            episodeNumber,
            language
          );
        }catch(error){
          warn("Website discovery failed",language,error?.message||String(error));
        }
      }

      if(!servers.length){
        const embed=getEmbedUrl(episodeData,language);

        if(embed){
          servers=[{
            type:language,
            name:
              isHost(embed,"megaplay.buzz")?
                "MegaPlay":
                isHost(embed,"vidtube.site")?
                  "VidTube":
                  "AniKoto",
            embedUrl:embed,
            malId:episodeData?.malId||episodeData?.mal_id,
            timestamp:episodeData?.timestamp,
            watchUrl:null,
            cookie:""
          }];
        }
      }

      if(!servers.length){
        warn("No servers",language);
        continue;
      }

      log("Servers",language,servers.length);

      for(const server of servers){
        try{
          const resolved=await resolveServer(
            server,
            metadata.title,
            episodeNumber,
            language
          );

          if(resolved.length){
            streams.push(...resolved);
            log("Resolved",server.name,resolved.length);
          }else{
            warn("No streams",server.name);
          }

        }catch(error){
          warn("Resolver failed",server.name,error?.message||String(error));
        }
      }
    }

    const unique=[];
    const seen=new Set();

    for(const stream of streams){
      if(!stream?.url||seen.has(stream.url))continue;

      if(
        /\/stream\/(?:s-2|ani|mal)\//i.test(stream.url)&&
        !/\.m3u8(?:$|\?)/i.test(stream.url)
      ){
        warn("Rejected embed URL");
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

    log("Final streams",unique.length);

    return unique;

  }catch(error){
    errorLog("Request failed",error?.message||String(error));
    return[];
  }
}

export default{getStreams};
