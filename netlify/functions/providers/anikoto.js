// =========================================================
// ANIKOTO PROVIDER
// =========================================================

const UPSTREAM_TIMEOUT_MS=12000;
const CINEMETA_BASE="https://v3-cinemeta.strem.io";
const ANIKOTO_API="https://anikotoapi.site";
const ANIKOTO_RESOLVER_API="https://anikoto-api.onrender.com";
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
  const started=Date.now();

  log("HTTP →",url);

  try{
    const response=await fetch(url,{
      redirect:"follow",
      ...options,
      signal:controller.signal
    });

    log(
      "HTTP ←",
      response.status,
      response.statusText,
      `${Date.now()-started}ms`,
      new URL(url).hostname
    );

    return response;
  }catch(error){
    warn(
      "HTTP ✕",
      url,
      error?.name==="AbortError"
        ?"TIMEOUT"
        :error?.message||String(error)
    );

    throw error;
  }finally{
    clearTimeout(timer);
  }
}

async function fetchJson(url,options={}){
  const response=await fetchWithTimeout(
    url,
    {
      ...options,
      headers:{
        ...DEFAULT_HEADERS,
        ...(options.headers||{})
      }
    }
  );

  if(!response.ok){
    throw new Error(
      `HTTP ${response.status} from ${new URL(url).hostname}`
    );
  }

  const text=await response.text();

  log(
    "JSON",
    new URL(url).hostname,
    "bytes=",
    text.length
  );

  try{
    return JSON.parse(text);
  }catch(error){
    throw new Error(
      `Invalid JSON from ${new URL(url).hostname}: ${error.message}`
    );
  }
}

async function fetchText(url,options={}){
  const response=await fetchWithTimeout(
    url,
    {
      ...options,
      headers:{
        ...DEFAULT_HEADERS,
        ...(options.headers||{})
      }
    }
  );

  if(!response.ok){
    throw new Error(
      `HTTP ${response.status} from ${new URL(url).hostname}`
    );
  }

  const text=await response.text();

  log(
    "TEXT",
    new URL(url).hostname,
    "bytes=",
    text.length
  );

  return text;
}

// =========================================================
// HELPERS
// =========================================================

function normalizeTitle(value){
  return String(value||"")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/&/g," and ")
    .replace(/['’]/g,"")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function titleTokens(value){
  return new Set(
    normalizeTitle(value)
      .split(" ")
      .filter(Boolean)
  );
}

function tokenOverlap(a,b){
  const aa=titleTokens(a);
  const bb=titleTokens(b);

  if(aa.size===0||bb.size===0)return 0;

  let common=0;

  for(const token of aa){
    if(bb.has(token))common++;
  }

  return common/Math.max(aa.size,bb.size);
}

function extractYear(value){
  if(!value)return null;

  const match=String(value).match(/\b(19|20)\d{2}\b/);

  return match?Number(match[0]):null;
}

function cleanId(value){
  if(value===null||value===undefined)return null;

  return String(value)
    .trim()
    .replace(/^https?:\/\/[^/]+\/(?:watch|series|anime)\//i,"")
    .replace(/^\/(?:watch|series|anime)\//i,"")
    .split("?")[0]
    .split("#")[0]
    .replace(/^\/+/,"")
    .replace(/\/+$/,"");
}

function isNumericId(value){
  return /^\d+$/.test(String(value||"").trim());
}

// =========================================================
// CINEMETA
// =========================================================

async function getCinemetaMetadata(imdbId,type){
  const cleanImdbId=String(imdbId||"")
    .split(":")[0]
    .trim();

  log(
    "Cinemeta: resolving",
    cleanImdbId,
    "type=",
    type
  );

  if(!/^tt\d+$/i.test(cleanImdbId)){
    throw new Error("Invalid IMDb ID");
  }

  const metadataUrl=
    `${CINEMETA_BASE}/meta/${type}/${cleanImdbId}.json`;

  const json=await fetchJson(metadataUrl);

  if(!json||!json.meta){
    throw new Error("Cinemeta metadata not found");
  }

  const meta=json.meta;

  const result={
    id:cleanImdbId,
    title:meta.name||meta.title||"",
    year:extractYear(
      meta.year||
      meta.releaseInfo||
      meta.released
    ),
    originalTitle:
      meta.originalName||
      meta.originalTitle||
      "",
    description:meta.description||""
  };

  log(
    "Cinemeta: title=",
    result.title,
    "year=",
    result.year,
    "original=",
    result.originalTitle||"N/A"
  );

  return result;
}

// =========================================================
// ANIKOTO SEARCH
// =========================================================

function extractArray(json){
  if(Array.isArray(json))return json;

  const candidates=[
    json?.data,
    json?.results,
    json?.data?.results,
    json?.data?.anime,
    json?.anime,
    json?.items
  ];

  for(const value of candidates){
    if(Array.isArray(value))return value;
  }

  return [];
}

function getCandidateTitle(item){
  if(typeof item?.title==="string"){
    return item.title;
  }

  if(item?.title&&typeof item.title==="object"){
    return(
      item.title.english||
      item.title.romaji||
      item.title.native||
      item.title.default||
      ""
    );
  }

  return(
    item?.name||
    item?.anime_name||
    item?.title||
    ""
  );
}

function getCandidateYear(item){
  return(
    extractYear(item?.year)||
    extractYear(item?.releaseDate)||
    extractYear(item?.release_date)||
    extractYear(item?.aired)||
    extractYear(item?.date)
  );
}

function getCandidateId(item){
  const value=
    item?.anime_id??
    item?.animeId??
    item?.series_id??
    item?.seriesId??
    item?.id??
    item?.slug??
    item?.url??
    item?.link;

  return cleanId(value);
}

function scoreSearchCandidate(
  item,
  targetTitle,
  targetYear
){
  const title=getCandidateTitle(item);

  if(!title)return -Infinity;

  const target=normalizeTitle(targetTitle);
  const candidate=normalizeTitle(title);

  if(!target||!candidate)return -Infinity;

  let score=0;

  if(candidate===target){
    score+=1000;
  }

  if(
    candidate.includes(target)||
    target.includes(candidate)
  ){
    score+=350;
  }

  score+=tokenOverlap(
    targetTitle,
    title
  )*300;

  const candidateYear=getCandidateYear(item);

  if(targetYear&&candidateYear){
    if(candidateYear===targetYear){
      score+=250;
    }else if(
      Math.abs(candidateYear-targetYear)===1
    ){
      score+=50;
    }else{
      score-=150;
    }
  }

  return score;
}

async function searchAniKoto(title,year){
  log(
    "Search: title=",
    title,
    "year=",
    year
  );

  let best=null;

  const MAX_PAGES=5;
  const PER_PAGE=100;

  log(
    "Search: using AniKoto /recent-anime",
    `pages=${MAX_PAGES}`,
    `per_page=${PER_PAGE}`
  );

  for(
    let page=1;
    page<=MAX_PAGES;
    page++
  ){
    const endpoint=
      `${ANIKOTO_API}/recent-anime?page=${page}&per_page=${PER_PAGE}`;

    try{
      log(
        "Search catalog page:",
        page,
        endpoint
      );

      const json=await fetchJson(endpoint);
      const results=extractArray(json);

      log(
        "Search catalog results:",
        results.length,
        "page=",
        page
      );

      if(results.length===0){
        log(
          "Search: empty catalog page, stopping"
        );
        break;
      }

      for(const item of results){
        const id=getCandidateId(item);
        const candidateTitle=getCandidateTitle(item);
        const candidateYear=getCandidateYear(item);

        if(!id){
          warn(
            "Search candidate skipped: no ID",
            candidateTitle
          );
          continue;
        }

        const score=scoreSearchCandidate(
          item,
          title,
          year
        );

        log(
          "Candidate:",
          candidateTitle||"N/A",
          "year=",
          candidateYear||"N/A",
          "id=",
          id,
          "score=",
          score
        );

        if(!best||score>best.score){
          best={
            id,
            title:candidateTitle,
            year:candidateYear,
            score,
            raw:item
          };

          log(
            "★ New best candidate:",
            best.title,
            "score=",
            best.score,
            "id=",
            best.id
          );
        }

        if(best.score>=1000){
          log(
            "Search: exact title match found"
          );
          break;
        }
      }

      if(best&&best.score>=1000)break;

      const pagination=
        json?.pagination||
        json?.data?.pagination;

      if(
        pagination&&
        pagination.hasNext===false
      ){
        log(
          "Search: API reports no more pages"
        );
        break;
      }

    }catch(error){
      warn(
        "Search catalog page failed:",
        page,
        error?.message||String(error)
      );
    }
  }

  if(!best){
    throw new Error(
      "AniKoto catalog returned no matching anime"
    );
  }

  log(
    "Search FINAL:",
    JSON.stringify({
      id:best.id,
      title:best.title,
      year:best.year,
      score:best.score
    })
  );

  return best;
}

// =========================================================
// SLUG → NUMERIC ANIKOTO ID
// =========================================================

function extractNumericId(value){
  if(
    typeof value==="number"&&
    Number.isFinite(value)
  ){
    return String(value);
  }

  if(
    typeof value==="string"&&
    /^\d+$/.test(value.trim())
  ){
    return value.trim();
  }

  if(!value||typeof value!=="object"){
    return null;
  }

  const candidates=[
    value.id,
    value.anime_id,
    value.animeId,
    value.series_id,
    value.seriesId,
    value.data_id,
    value.dataId,
    value.anime?.id,
    value.anime?.anime_id,
    value.anime?.animeId,
    value.data?.id,
    value.data?.anime_id,
    value.data?.animeId,
    value.data?.data_id,
    value.data?.dataId
  ];

  for(const candidate of candidates){
    const id=extractNumericId(candidate);

    if(id)return id;
  }

  return null;
}

async function resolveAniKotoId(id){
  const clean=cleanId(id);

  if(!clean){
    throw new Error(
      "Invalid AniKoto series ID"
    );
  }

  if(isNumericId(clean)){
    log(
      "Series ID already numeric:",
      clean
    );

    return clean;
  }

  log(
    "Series ID is slug:",
    clean,
    "resolving numeric AniKoto ID"
  );

  const encoded=encodeURIComponent(clean);

  // First try the official series endpoint directly.
  // Some catalog entries may already be accepted as IDs.
  try{
    const directEndpoint=
      `${ANIKOTO_API}/series/${encoded}`;

    log(
      "ID resolver: testing direct series endpoint:",
      directEndpoint
    );

    const directJson=
      await fetchJson(directEndpoint);

    const directAnime=
      directJson?.anime||
      directJson?.data?.anime||
      directJson?.data||
      directJson;

    const directId=
      extractNumericId(directAnime)||
      extractNumericId(directJson);

    if(directId){
      log(
        "ID resolver: direct endpoint returned numeric ID=",
        directId
      );

      return directId;
    }

    const directEpisodes=
      extractEpisodes(directJson);

    if(directEpisodes.length>0){
      log(
        "ID resolver: direct slug worked; retaining slug"
      );

      return clean;
    }

  }catch(error){
    log(
      "ID resolver: direct slug lookup failed:",
      error?.message||String(error)
    );
  }

  // The public AniKoto ecosystem exposes a resolver that
  // extracts the numeric data-id from the watch-page slug.
  try{
    const resolverEndpoint=
      `${ANIKOTO_RESOLVER_API}/page?name=${encoded}`;

    log(
      "ID resolver: requesting numeric ID:",
      resolverEndpoint
    );

    const json=
      await fetchJson(resolverEndpoint);

    const numericId=
      extractNumericId(json);

    if(numericId){
      log(
        "ID resolver: SUCCESS",
        clean,
        "→",
        numericId
      );

      return numericId;
    }

    warn(
      "ID resolver: response contained no numeric ID"
    );

  }catch(error){
    warn(
      "ID resolver failed:",
      error?.message||String(error)
    );
  }

  throw new Error(
    `Unable to resolve AniKoto slug to numeric ID: ${clean}`
  );
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
    if(Array.isArray(value)){
      return value;
    }
  }

  return [];
}

function getEpisodeNumber(episode){
  const value=
    episode?.number??
    episode?.episode??
    episode?.episodeNumber??
    episode?.episode_number??
    episode?.ep??
    episode?.num;

  const number=Number(value);

  return Number.isFinite(number)
    ?number
    :null;
}

function getEpisodeEmbedId(episode){
  const value=
    episode?.episode_embed_id||
    episode?.episodeEmbedId||
    episode?.embed_id||
    episode?.embedId||
    episode?.data_id||
    episode?.dataId||
    episode?.id||
    null;

  return value===null||
    value===undefined||
    value===""
    ?null
    :String(value);
}

function getEmbedUrl(episode,language){
  const embed=
    episode?.embed_url||
    episode?.embedUrl||
    episode?.embeds||
    episode?.embed;

  if(typeof embed==="string"){
    return embed;
  }

  if(embed&&typeof embed==="object"){
    return(
      embed[language]||
      embed[language==="sub"?"subtitle":"dub"]||
      embed.sub||
      embed.dub||
      embed.default||
      null
    );
  }

  return null;
}

async function getAniKotoSeries(id){
  const resolvedId=
    await resolveAniKotoId(id);

  const encoded=
    encodeURIComponent(resolvedId);

  const endpoint=
    `${ANIKOTO_API}/series/${encoded}`;

  let lastError=null;

  log(
    "Series: resolved ID=",
    resolvedId
  );

  log(
    "Series endpoint:",
    endpoint
  );

  try{
    const json=
      await fetchJson(endpoint);

    const episodes=
      extractEpisodes(json);

    log(
      "Series endpoint returned",
      episodes.length,
      "episodes"
    );

    if(episodes.length>0){
      log(
        "Series: SUCCESS via",
        endpoint
      );

      return{
        json,
        episodes,
        id:resolvedId
      };
    }

    warn(
      "Series endpoint returned no episodes"
    );

  }catch(error){
    lastError=error;

    warn(
      "Series endpoint failed:",
      error?.message||String(error)
    );
  }

  throw(
    lastError||
    new Error(
      "AniKoto series data unavailable"
    )
  );
}

// =========================================================
// EPISODE RESOLUTION
// =========================================================

function findEpisode(
  episodes,
 episodeNumber
){
  const target=Number(episodeNumber);

  log(
    "Episode: looking for",
    target,
    "among",
    episodes.length,
    "episodes"
  );

  if(!Number.isFinite(target)){
    return null;
  }

  for(const episode of episodes){
    const number=
      getEpisodeNumber(episode);

    if(number===target){
      log(
        "Episode: FOUND",
        JSON.stringify({
          number,
          embedId:getEpisodeEmbedId(episode),
          subEmbed:getEmbedUrl(episode,"sub")
            ?"yes"
            :"no",
          dubEmbed:getEmbedUrl(episode,"dub")
            ?"yes"
            :"no"
        })
      );

      return episode;
    }
  }

  warn(
    "Episode: NOT FOUND",
    target
  );

  if(episodes.length<=50){
    log(
      "Available episodes:",
      episodes
        .map(getEpisodeNumber)
        .filter(Number.isFinite)
    );
  }

  return null;
}

// =========================================================
// MEGAPLAY
// =========================================================

function buildMegaPlayCandidates(
  episode,
  episodeNumber,
  language
){
  const candidates=[];

  const explicit=
    getEmbedUrl(
      episode,
      language
    );

  if(explicit){
    log(
      "MegaPlay:",
      language,
      "explicit embed found"
    );

    candidates.push(explicit);
  }

  const embedId=
    getEpisodeEmbedId(episode);

  if(embedId){
    const url=
      `${MEGAPLAY_BASE}/stream/s-2/${encodeURIComponent(String(embedId))}/${language}`;

    log(
      "MegaPlay:",
      language,
      "episode ID candidate",
      url
    );

    candidates.push(url);
  }

  const anilistId=
    episode?.anilistId||
    episode?.anilist_id||
    episode?.aniListId||
    episode?.aniList_id;

  if(anilistId){
    const url=
      `${MEGAPLAY_BASE}/stream/ani/${encodeURIComponent(String(anilistId))}/${episodeNumber}/${language}`;

    log(
      "MegaPlay:",
      language,
      "AniList candidate",
      url
    );

    candidates.push(url);
  }

  const malId=
    episode?.malId||
    episode?.mal_id||
    episode?.malID;

  if(malId){
    const url=
      `${MEGAPLAY_BASE}/stream/mal/${encodeURIComponent(String(malId))}/${episodeNumber}/${language}`;

    log(
      "MegaPlay:",
      language,
      "MAL candidate",
      url
    );

    candidates.push(url);
  }

  const unique=[
    ...new Set(candidates.filter(Boolean))
  ];

  log(
    "MegaPlay:",
    language,
    "candidate count=",
    unique.length
  );

  return unique;
}

function extractPlayerId(html){
  const patterns=[
    /\bdata-id=["'](\d+)["']/i,
    /\bdata-id\s*=\s*(\d+)/i,
    /id=["']megaplay-player["'][^>]*data-id=["'](\d+)["']/i,
    /data-id=["'](\d+)["'][^>]*id=["']megaplay-player["']/i
  ];

  for(const pattern of patterns){
    const match=
      html.match(pattern);

    if(match?.[1]){
      return match[1];
    }
  }

  return null;
}

async function resolveMegaPlaySource(
  embedUrl
){
  log(
    "MegaPlay: resolving embed",
    embedUrl
  );

  const html=
    await fetchText(
      embedUrl,
      {
        headers:{
          "User-Agent":USER_AGENT,
          "Accept":
            "text/html,application/xhtml+xml,application/json,text/plain,*/*",
          "Referer":
            `${MEGAPLAY_BASE}/`
        }
      }
    );

  const playerId=
    extractPlayerId(html);

  if(!playerId){
    warn(
      "MegaPlay: player ID NOT FOUND",
      "html bytes=",
      html.length
    );

    for(
      const marker of [
        "data-id",
        "megaplay-player",
        "player",
        "getSources"
      ]
    ){
      log(
        "MegaPlay marker",
        marker,
        "present=",
        html.includes(marker)
      );
    }

    throw new Error(
      "MegaPlay player ID not found"
    );
  }

  log(
    "MegaPlay: player ID=",
    playerId
  );

  const sourceUrl=
    `${MEGAPLAY_BASE}/stream/getSources?id=${encodeURIComponent(playerId)}`;

  log(
    "MegaPlay: requesting sources"
  );

  const sourceJson=
    await fetchJson(
      sourceUrl,
      {
        headers:{
          "User-Agent":USER_AGENT,
          "Accept":
            "application/json,text/plain,*/*",
          "Origin":MEGAPLAY_BASE,
          "Referer":embedUrl
        }
      }
    );

  log(
    "MegaPlay: source response received"
  );

  return{
    sourceJson,
    embedUrl
  };
}

// =========================================================
// SOURCE PARSING
// =========================================================

function collectSources(
  value,
  output=[]
){
  if(!value){
    return output;
  }

  if(typeof value==="string"){
    if(
      /^https?:\/\//i.test(value)
    ){
      output.push({
        url:value,
        quality:null
      });
    }

    return output;
  }

  if(Array.isArray(value)){
    for(const item of value){
      collectSources(
        item,
        output
      );
    }

    return output;
  }

  if(typeof value!=="object"){
    return output;
  }

  const url=
    value.file||
    value.url||
    value.src||
    value.source||
    value.link;

  if(
    typeof url==="string"&&
    /^https?:\/\//i.test(url)
  ){
    output.push({
      url,
      quality:
        value.label||
        value.quality||
        value.resolution||
        value.name||
        null
    });
  }

  for(
    const key of [
      "sources",
      "source",
      "links",
      "files"
    ]
  ){
    if(value[key]){
      collectSources(
        value[key],
        output
      );
    }
  }

  return output;
}

function normalizeQuality(value){
  if(!value){
    return "Auto";
  }

  const text=
    String(value)
      .toLowerCase()
      .replace(/\s+/g,"");

  if(
    text.includes("2160")||
    text.includes("4k")
  ){
    return "2160p";
  }

  if(text.includes("1440")){
    return "1440p";
  }

  if(text.includes("1080")){
    return "1080p";
  }

  if(text.includes("720")){
    return "720p";
  }

  if(text.includes("480")){
    return "480p";
  }

  if(text.includes("360")){
    return "360p";
  }

  return String(value);
}

function extractSubtitles(json){
  const tracks=
    json?.tracks||
    json?.captions||
    json?.subtitles||
    [];

  if(!Array.isArray(tracks)){
    return [];
  }

  const subtitles=[];
  const seen=new Set();

  for(const track of tracks){
    if(
      !track||
      typeof track!=="object"
    ){
      continue;
    }

    const url=
      track.file||
      track.url||
      track.src;

    if(
      !url||
      !/^https?:\/\//i.test(url)
    ){
      continue;
    }

    const kind=
      String(
        track.kind||
        track.type||
        "captions"
      ).toLowerCase();

    if(
      !kind.includes("caption")&&
      !kind.includes("subtitle")&&
      !kind.includes("sub")
    ){
      continue;
    }

    if(seen.has(url)){
      continue;
    }

    seen.add(url);

    subtitles.push({
      url,
      lang:
        track.label||
        track.srclang||
        track.lang||
        "English"
    });
  }

  return subtitles;
}

// =========================================================
// STREAM BUILDING
// =========================================================

function buildStreamsFromSource(
  sourceJson,
  embedUrl,
  title,
  episodeNumber,
  language
){
  const rawSources=
    collectSources(sourceJson);

  const subtitles=
    extractSubtitles(sourceJson);

  log(
    "Source parser:",
    rawSources.length,
    "raw source(s)",
    subtitles.length,
    "subtitle track(s)"
  );

  const streams=[];
  const seen=new Set();

  for(const source of rawSources){
    if(
      !source?.url||
      seen.has(source.url)
    ){
      continue;
    }

    seen.add(source.url);

    const isHls=
      /\.m3u8(?:$|\?)/i.test(
        source.url
      );

    const quality=
      normalizeQuality(
        source.quality
      );

    log(
      "Native stream:",
      language,
      quality,
      isHls?"HLS":"MP4",
      source.url
    );

    streams.push({
      name:
        `AniKoto ${language.toUpperCase()} ${quality}`,
      title:
        `${title} - Episode ${episodeNumber} (${language.toUpperCase()})`,
      url:source.url,
      quality,
      provider:"anikoto",
      type:isHls?"m3u8":"mp4",
      hls:isHls,
      subtitles,
      behaviorHints:{
  proxyHeaders:{
    request:{
      Referer:embedUrl,
      Origin:MEGAPLAY_BASE,
      "User-Agent":USER_AGENT
    }
  }
}
    });
  }

  if(
    embedUrl&&
    !streams.some(
      stream=>stream.url===embedUrl
    )
  ){
    log(
      "Adding embed fallback:",
      language,
      embedUrl
    );

    streams.push({
      name:
        `AniKoto ${language.toUpperCase()} Embed`,
      title:
        `${title} - Episode ${episodeNumber} (${language.toUpperCase()})`,
      url:embedUrl,
      provider:"anikoto",
      quality:"Auto",
      type:"embed",
      behaviorHints:{
        notWebReady:true
      }
    });
  }

  return streams;
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
  const started=Date.now();

  log(
    "=================================================="
  );

  log(
    "REQUEST START",
    JSON.stringify({
      imdbId,
      type,
      season,
      episode
    })
  );

  try{
    if(type!=="series"){
      log(
        "SKIP: provider only handles series"
      );

      return [];
    }

    const cleanImdbId=
      String(imdbId||"")
        .split(":")[0]
        .trim();

    const seasonNumber=
      Number(season||1);

    const episodeNumber=
      Number(episode||1);

    log(
      "Normalized:",
      JSON.stringify({
        imdbId:cleanImdbId,
        season:seasonNumber,
        episode:episodeNumber
      })
    );

    if(
      !/^tt\d+$/i.test(
        cleanImdbId
      )
    ){
      warn(
        "SKIP: invalid IMDb ID",
        cleanImdbId
      );

      return [];
    }

    if(
      !Number.isFinite(seasonNumber)||
      !Number.isFinite(episodeNumber)
    ){
      warn(
        "SKIP: invalid season/episode"
      );

      return [];
    }

    log(
      "STEP 1/6: Cinemeta metadata"
    );

    const metadata=
      await getCinemetaMetadata(
        cleanImdbId,
        "series"
      );

    if(!metadata.title){
      warn(
        "STOP: Cinemeta returned no title"
      );

      return [];
    }

    log(
      "STEP 2/6: AniKoto search"
    );

    const match=
      await searchAniKoto(
        metadata.title,
        metadata.year
      );

    if(!match?.id){
      warn(
        "STOP: no AniKoto match"
      );

      return [];
    }

    log(
      "STEP 3/6: AniKoto series"
    );

    const series=
      await getAniKotoSeries(
        match.id
      );

    if(
      !series?.episodes?.length
    ){
      warn(
        "STOP: AniKoto returned no episodes"
      );

      return [];
    }

    log(
      "STEP 4/6: Episode resolution"
    );

    const episodeData=
      findEpisode(
        series.episodes,
        episodeNumber
      );

    if(!episodeData){
      warn(
        "STOP: requested episode unavailable"
      );

      return [];
    }

    log(
      "STEP 5/6: MegaPlay SUB/DUB resolution"
    );

    const streams=[];

    for(
      const language of [
        "sub",
        "dub"
      ]
    ){
      log(
        "--------------------------------------------------"
      );

      log(
        "LANGUAGE:",
        language.toUpperCase()
      );

      const candidates=
        buildMegaPlayCandidates(
          episodeData,
          episodeNumber,
          language
        );

      let nativeWorked=false;

      for(
        let i=0;
        i<candidates.length;
        i++
      ){
        const embedUrl=
          candidates[i];

        log(
          `Candidate ${i+1}/${candidates.length}:`,
          embedUrl
        );

        try{
          const resolved=
            await resolveMegaPlaySource(
              embedUrl
            );

          const nativeStreams=
            buildStreamsFromSource(
              resolved.sourceJson,
              embedUrl,
              metadata.title,
              episodeNumber,
              language
            );

          log(
            "Candidate result:",
            nativeStreams.length,
            "stream(s)"
          );

          if(
            nativeStreams.length>0
          ){
            streams.push(
              ...nativeStreams
            );

            nativeWorked=true;

            log(
              "Native source SUCCESS for",
              language.toUpperCase()
            );

            break;
          }

        }catch(error){
          warn(
            "Candidate FAILED:",
            error?.message||
            String(error)
          );
        }
      }

      if(!nativeWorked){
        const fallback=
          candidates[0];

        if(fallback){
          log(
            "No native source for",
            language.toUpperCase(),
            "- retaining embed fallback"
          );

          streams.push({
            name:
              `AniKoto ${language.toUpperCase()} Embed`,
            title:
              `${metadata.title} - Episode ${episodeNumber} (${language.toUpperCase()})`,
            url:fallback,
            provider:"anikoto",
            quality:"Auto",
            type:"embed",
            behaviorHints:{
              notWebReady:true
            }
          });

        }else{
          log(
            "No usable MegaPlay candidate for",
            language.toUpperCase()
          );
        }
      }
    }

    log(
      "STEP 6/6: Deduplication + quality sorting"
    );

    const unique=[];
    const seen=new Set();

    for(const stream of streams){
      if(
        !stream?.url||
        seen.has(stream.url)
      ){
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

    unique.sort(
      (a,b)=>
        (
          qualityRank[
            String(
              b.quality||"Auto"
            ).toLowerCase()
          ]||0
        )-
        (
          qualityRank[
            String(
              a.quality||"Auto"
            ).toLowerCase()
          ]||0
        )
    );

    log(
      "FINAL streams:",
      unique.length
    );

    for(const stream of unique){
      log(
        "FINAL:",
        JSON.stringify({
          name:stream.name,
          quality:stream.quality,
          type:stream.type,
          url:stream.url
        })
      );
    }

    log(
      "REQUEST SUCCESS in",
      `${Date.now()-started}ms`
    );

    log(
      "=================================================="
    );

    return unique;

  }catch(error){
    errorLog(
      "REQUEST FAILED:",
      error?.message||
      String(error)
    );

    if(error?.stack){
      errorLog(error.stack);
    }

    log(
      "REQUEST FAILED after",
      `${Date.now()-started}ms`
    );

    log(
      "=================================================="
    );

    return [];
  }
}

export default{
  getStreams
};
