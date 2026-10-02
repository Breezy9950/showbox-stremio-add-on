import crypto from "node:crypto";
const UPSTREAM_TIMEOUT_MS=12000;
const CINEMETA_BASE="https://v3-cinemeta.strem.io";
const ANIKOTO_API="https://anikotoapi.site";
const ANIKOTO_RESOLVER_API="https://anikoto-api.onrender.com";
const ANIKOTO_SITE="https://anikototv.to";
const MEGAPLAY_BASE="https://megaplay.buzz";
const ANIBRIDGE_API="https://anibridge.eliasbenb.dev/api/mappings";
const ANIMAP_API="https://animap.id/api/map";
const USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const DEFAULT_HEADERS={"User-Agent":USER_AGENT,"Accept":"application/json,text/plain,*/*","Accept-Language":"en-US,en;q=0.9"};
const MEGAPLAY_SOURCE_ENC_KEY="i?LMTAx0Q6,:}50U";
const MEGAPLAY_SOURCE_ENC_IV="W0;27ToaUpl_P%'c";
const MEGAPLAY_CDN_TOKEN_SECRET="MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
const MEGAPLAY_CDN_TOKEN_TTL=90;
const ANIKOTO_PROXY_BASE=process.env.URL||process.env.DEPLOY_PRIME_URL||"";
function log(...args){console.log("[AniKoto]",...args);}
function warn(...args){console.warn("[AniKoto]",...args);}
function errorLog(...args){console.error("[AniKoto]",...args);}
async function fetchWithTimeout(url,options={},timeoutMs=UPSTREAM_TIMEOUT_MS){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fetch(url,{redirect:"follow",...options,signal:controller.signal});}
 catch(error){warn("HTTP failed",new URL(url).hostname,error?.name==="AbortError"?"TIMEOUT":error?.message||String(error));throw error;}
 finally{clearTimeout(timer);}
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
function normalizeTitle(value){return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/['’]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function titleTokens(value){return new Set(normalizeTitle(value).split(" ").filter(Boolean));}
function tokenOverlap(a,b){const aa=titleTokens(a),bb=titleTokens(b);if(aa.size===0||bb.size===0)return 0;let common=0;for(const token of aa)if(bb.has(token))common++;return common/Math.max(aa.size,bb.size);}
function extractYear(value){if(!value)return null;const match=String(value).match(/\b(19|20)\d{2}\b/);return match?Number(match[0]):null;}
function cleanId(value){if(value===null||value===undefined)return null;return String(value).trim().replace(/^https?:\/\/[^/]+\/(?:watch|series|anime)\//i,"").replace(/^\/(?:watch|series|anime)\//i,"").split("?")[0].split("#")[0].replace(/^\/+/,"").replace(/\/+$/,"");}
function isNumericId(value){return /^\d+$/.test(String(value||"").trim());}
function originOf(url){try{return new URL(url).origin;}catch{return null;}}
function hostnameOf(url){try{return new URL(url).hostname.toLowerCase();}catch{return "";}}
function isHost(url,domain){const hostname=hostnameOf(url);return hostname===domain||hostname.endsWith(`.${domain}`);}
async function getCinemetaMetadata(imdbId,type){
 const cleanImdbId=String(imdbId||"").split(":")[0].trim();
 if(!/^tt\d+$/i.test(cleanImdbId))throw new Error("Invalid IMDb ID");
 const metadataUrl=`${CINEMETA_BASE}/meta/${type}/${cleanImdbId}.json`;
 const json=await fetchJson(metadataUrl);
 if(!json||!json.meta)throw new Error("Cinemeta metadata not found");
 const meta=json.meta;
 return{id:cleanImdbId,title:meta.name||meta.title||"",year:extractYear(meta.year||meta.releaseInfo||meta.released),originalTitle:meta.originalName||meta.originalTitle||"",description:meta.description||""};
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
function removeSeasonSuffix(value){return normalizeTitle(value).replace(/\bseason\s*\d+\b/gi," ").replace(/\bs\d+\b/gi," ").replace(/\b\d+(?:st|nd|rd|th)\s+season\b/gi," ").replace(/\s+/g," ").trim();}
function descriptorParts(value){
 const text=String(value||"").trim();
 if(!text)return null;
 const parts=text.split(":");
 if(parts.length<2)return null;
 return{provider:parts[0],id:parts[1],scope:parts.slice(2).join(":")||null};
}
function parseRange(value){
 const text=String(value||"").trim();
 if(!text)return null;
 const range=text.split("|")[0].trim();
 const match=range.match(/^(\d+)(?:-(\d+))?$/);
 if(!match)return null;
 return{start:Number(match[1]),end:match[2]?Number(match[2]):null};
}
function parseRatio(value){
 const parts=String(value||"").split("|");
 if(parts.length<2)return 1;
 const ratio=Number(parts[parts.length-1]);
 return Number.isFinite(ratio)&&ratio!==0?ratio:1;
}
function episodeInRange(episode,range){
 const parsed=parseRange(range);
 if(!parsed)return false;
 return episode>=parsed.start&&(parsed.end===null||episode<=parsed.end);
}
function expandTargetRanges(targetRange){
 const text=String(targetRange||"").trim();
 if(!text)return[];
 const rangeText=text.split("|")[0];
 return rangeText.split(",").map(value=>parseRange(value)).filter(Boolean);
}
function mapEpisodeFromRange(sourceEpisode,sourceRange,targetRange){
 const source=parseRange(sourceRange);
 if(!source)return null;
 if(!episodeInRange(sourceEpisode,sourceRange))return null;
 const targetRanges=expandTargetRanges(targetRange);
 if(!targetRanges.length)return null;
 const ratio=parseRatio(targetRange);
 const offset=sourceEpisode-source.start;
 const flattened=[];
 for(const range of targetRanges){
  if(range.end===null)flattened.push({value:range.start,openEnded:true});
  else for(let episode=range.start;episode<=range.end;episode++)flattened.push({value:episode,openEnded:false});
 }
 if(!flattened.length)return null;
 if(ratio===1){
  const target=flattened[offset];
  if(target)return target.value;
  const last=flattened[flattened.length-1];
  if(last?.openEnded)return last.value+(offset-flattened.length+1);
  return null;
 }
 if(ratio>1){
  const index=Math.floor(offset*ratio);
  const target=flattened[index];
  if(target)return target.value;
  const last=flattened[flattened.length-1];
  if(last?.openEnded)return last.value+Math.floor(offset*ratio);
  return null;
 }
 const groupSize=Math.abs(ratio);
 const index=Math.floor(offset/groupSize);
 const target=flattened[index];
 return target?.value??null;
}
function mappingProviderRank(provider){
 const p=String(provider||"").toLowerCase();
 if(p==="anilist")return 100;
 if(p==="mal")return 95;
 if(p==="anidb")return 90;
 if(p==="kitsu")return 80;
 if(p==="tvdb_show")return 70;
 if(p==="tmdb_show")return 65;
 if(p==="imdb_show")return 60;
 return 10;
}
function addMappedId(result,node,targetEpisode=null){
 if(!node?.provider||!node?.id)return;
 const provider=String(node.provider).toLowerCase();
 if(provider==="anilist"||provider==="mal"||provider==="anidb"||provider==="kitsu"||provider==="tmdb_show"||provider==="tvdb_show"||provider==="imdb_show"){
  const current=result[provider];
  if(!current||(targetEpisode!==null&&current.episode===null))result[provider]={id:String(node.id),scope:node.scope||null,episode:targetEpisode,score:mappingProviderRank(provider)};
 }
}
function parseAniBridgeDescriptorMap(sourceDescriptor,targetMap,sourceImdbId,season,episode,mapped){
 const source=descriptorParts(sourceDescriptor);
 if(!source)return;
 const sourceProvider=String(source.provider||"").toLowerCase();
 const sourceId=String(source.id||"").toLowerCase();
 if(sourceProvider!=="imdb_show"||sourceId!==String(sourceImdbId).toLowerCase())return;
 const sourceSeason=source.scope?Number(String(source.scope).replace(/^s/i,"")):null;
 if(Number.isFinite(sourceSeason)&&sourceSeason!==Number(season))return;
 if(!targetMap||typeof targetMap!=="object")return;
 for(const [targetDescriptor,rangeMap] of Object.entries(targetMap)){
  const target=descriptorParts(targetDescriptor);
  if(!target)continue;
  if(!rangeMap||typeof rangeMap!=="object"||Array.isArray(rangeMap)){
   addMappedId(mapped,target,null);
   continue;
  }
  const ranges=Object.entries(rangeMap);
  if(!ranges.length){
   addMappedId(mapped,target,null);
   continue;
  }
  for(const [sourceRange,targetRange] of ranges){
   const sourceRangeParsed=parseRange(sourceRange);
   if(!sourceRangeParsed)continue;
   if(!episodeInRange(Number(episode),sourceRange))continue;
   const targetEpisode=mapEpisodeFromRange(Number(episode),sourceRange,targetRange);
   addMappedId(mapped,target,targetEpisode);
  }
 }
}
function parseAniBridgeMappings(json,sourceImdbId,season,episode){
 const mapped={source:{imdb:sourceImdbId,season:Number(season),episode:Number(episode)}};
 if(!json||typeof json!=="object")return mapped;
 if(!Array.isArray(json)){
  for(const [sourceDescriptor,targetMap] of Object.entries(json))parseAniBridgeDescriptorMap(sourceDescriptor,targetMap,sourceImdbId,season,episode,mapped);
 }
 const wrappedCandidates=[json?.data,json?.mappings,json?.results];
 for(const wrapped of wrappedCandidates){
  if(!wrapped||wrapped===json)continue;
  if(Array.isArray(wrapped)){
   for(const item of wrapped){
    if(!item||typeof item!=="object")continue;
    const sourceDescriptor=item?.source?.descriptor||item?.source_descriptor||item?.sourceDescriptor||item?.source;
    const targetMap=item?.targets||item?.target||item?.mapping||item?.mappings;
    if(typeof sourceDescriptor==="string")parseAniBridgeDescriptorMap(sourceDescriptor,targetMap,sourceImdbId,season,episode,mapped);
   }
  }else if(typeof wrapped==="object"){
   for(const [sourceDescriptor,targetMap] of Object.entries(wrapped))parseAniBridgeDescriptorMap(sourceDescriptor,targetMap,sourceImdbId,season,episode,mapped);
  }
 }
 return mapped;
}
function collectProviderIdsFromMapping(mapped){
 const ids=[];
 for(const key of["anilist","mal","anidb","kitsu","tmdb_show","tvdb_show","imdb_show"]){
  const value=mapped?.[key];
  if(!value?.id)continue;
  ids.push({provider:key,id:String(value.id),scope:value.scope||null,episode:value.episode??null,score:value.score||0});
 }
 return ids;
}
async function getAniBridgeMapping(imdbId,season,episode){
 const clean=String(imdbId||"").split(":")[0].trim();
 if(!/^tt\d+$/i.test(clean))return null;
 const seasonNumber=Number(season);
 const query=`source.provider:imdb_show source.id:${clean} source.scope:s${seasonNumber}`;
 try{
  const json=await fetchJson(`${ANIBRIDGE_API}?q=${encodeURIComponent(query)}`);
  const mapped=parseAniBridgeMappings(json,clean,seasonNumber,Number(episode));
  const ids=collectProviderIdsFromMapping(mapped);
  if(ids.length){
   log("AniBridge mapping",ids.map(item=>{const episodePart=item.episode!==null?`:E${item.episode}`:"";return`${item.provider}:${item.id}${episodePart}`;}).join(","));
   return mapped;
  }
 }catch(error){warn("AniBridge lookup failed",error?.message||String(error));}
 return null;
}
function parseAniMapEntry(entry){
 if(!entry||typeof entry!=="object")return null;
 const result={};
 const imdbIds=Array.isArray(entry.imdb_id)?entry.imdb_id:entry.imdb_id?[entry.imdb_id]:[];
 const tmdbIds=Array.isArray(entry.tmdb_id)?entry.tmdb_id:entry.tmdb_id?[entry.tmdb_id]:[];
 const tvdbIds=Array.isArray(entry.tvdb_id)?entry.tvdb_id:entry.tvdb_id?[entry.tvdb_id]:[];
 if(imdbIds.length)result.imdb=imdbIds;
 if(entry.anidb_id)result.anidb=Array.isArray(entry.anidb_id)?entry.anidb_id:[entry.anidb_id];
 if(entry.anilist_id)result.anilist=Array.isArray(entry.anilist_id)?entry.anilist_id:[entry.anilist_id];
 if(entry.mal_id)result.mal=Array.isArray(entry.mal_id)?entry.mal_id:[entry.mal_id];
 if(entry.kitsu_id)result.kitsu=Array.isArray(entry.kitsu_id)?entry.kitsu_id:[entry.kitsu_id];
 if(tvdbIds.length)result.tvdb=tvdbIds;
 if(tmdbIds.length)result.tmdb=tmdbIds;
 return result;
}
async function getAniMapMapping(imdbId){
 const clean=String(imdbId||"").split(":")[0].trim();
 if(!/^tt\d+$/i.test(clean))return null;
 try{
  const json=await fetchJson(`${ANIMAP_API}/imdb/${encodeURIComponent(clean)}`);
  const entry=Array.isArray(json)?json[0]:json;
  const mapped=parseAniMapEntry(entry);
  if(mapped){log("AniMap mapping found");return mapped;}
 }catch(error){warn("AniMap lookup failed",error?.message||String(error));}
 return null;
}
async function getCombinedAnimeMapping(imdbId,season,episode){
 const aniBridge=await getAniBridgeMapping(imdbId,season,episode);
 if(aniBridge)return{source:"anibridge",data:aniBridge};
 const aniMap=await getAniMapMapping(imdbId);
 if(aniMap)return{source:"animap",data:aniMap};
 return null;
}
function extractArray(json){
 if(Array.isArray(json))return json;
 const candidates=[json?.data,json?.results,json?.data?.results,json?.data?.anime,json?.anime,json?.items];
 for(const value of candidates)if(Array.isArray(value))return value;
 return[];
}
function getCandidateTitle(item){
 if(typeof item?.title==="string")return item.title;
 if(item?.title&&typeof item.title==="object")return item.title.english||item.title.romaji||item.title.native||item.title.default||"";
 return item?.name||item?.anime_name||item?.title||"";
}
function getCandidateTitles(item){
 const titles=[];
 const add=value=>{if(typeof value!=="string")return;const text=value.trim();if(text&&!titles.includes(text))titles.push(text);};
 add(item?.title);add(item?.name);add(item?.anime_name);
 if(item?.title&&typeof item.title==="object"){add(item.title.english);add(item.title.romaji);add(item.title.native);add(item.title.default);add(item.title.japanese);}
 if(item?.titles&&typeof item.titles==="object"){add(item.titles.english);add(item.titles.romaji);add(item.titles.native);add(item.titles.default);add(item.titles.japanese);}
 return titles;
}
function getCandidateYear(item){return extractYear(item?.year)||extractYear(item?.releaseDate)||extractYear(item?.release_date)||extractYear(item?.aired)||extractYear(item?.date);}
function getCandidateId(item){
 const value=item?.anime_id??item?.animeId??item?.series_id??item?.seriesId??item?.id??item?.slug??item?.url??item?.link;
 return cleanId(value);
}
function titleMatchStrength(targetTitle,candidateTitle){
 const target=normalizeTitle(targetTitle);
 const candidate=normalizeTitle(candidateTitle);
 if(!target||!candidate)return 0;
 if(target===candidate)return 1;
 const targetBase=removeSeasonSuffix(targetTitle);
 const candidateBase=removeSeasonSuffix(candidateTitle);
 if(targetBase&&candidateBase&&targetBase===candidateBase)return 1;
 if(candidate.startsWith(`${target} `)||candidate.startsWith(`${target}:`))return 0.95;
 if(target.startsWith(`${candidate} `)||target.startsWith(`${candidate}:`))return 0.9;
 const targetTokens=titleTokens(targetBase||target);
 const candidateTokens=titleTokens(candidateBase||candidate);
 if(targetTokens.size===0||candidateTokens.size===0)return 0;
 let common=0;
 for(const token of targetTokens)if(candidateTokens.has(token))common++;
 const targetCoverage=common/targetTokens.size;
 const candidateCoverage=common/candidateTokens.size;
 if(targetCoverage===1)return 0.9;
 if(targetCoverage>=0.75&&candidateCoverage>=0.5)return 0.8;
 if(targetCoverage>=0.5&&candidateCoverage>=0.5)return 0.65;
 return Math.max(targetCoverage*0.5,candidateCoverage*0.25);
}
function isValidTitleMatch(item,targetTitle){
 const titles=getCandidateTitles(item);
 if(!titles.length)return false;
 for(const title of titles)if(titleMatchStrength(targetTitle,title)>=0.65)return true;
 return false;
}
function scoreSearchCandidate(item,targetTitle,targetYear,targetSeason){
 const titles=getCandidateTitles(item);
 if(!titles.length)return-Infinity;
 let bestTitle=null;
 let bestMatch=0;
 for(const title of titles){
  const match=titleMatchStrength(targetTitle,title);
  if(match>bestMatch){bestMatch=match;bestTitle=title;}
 }
 if(bestMatch<0.65)return-Infinity;
 const target=normalizeTitle(targetTitle);
 const candidate=normalizeTitle(bestTitle);
 let score=0;
 if(candidate===target)score+=2000;
 else if(removeSeasonSuffix(bestTitle)===removeSeasonSuffix(targetTitle))score+=1700;
 else score+=bestMatch*1000;
 score+=tokenOverlap(targetTitle,bestTitle)*300;
 const candidateYear=getCandidateYear(item);
 if(targetYear&&candidateYear){
  if(candidateYear===targetYear)score+=250;
  else if(Math.abs(candidateYear-targetYear)===1)score+=50;
  else score-=150;
 }
 const candidateSeason=extractSeasonNumber(bestTitle);
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
function getCandidateExternalIds(item){
 const ids=[];
 const add=value=>{
  if(value===null||value===undefined)return;
  if(typeof value==="string"||typeof value==="number"){const text=String(value).trim();if(text)ids.push(text);return;}
  if(Array.isArray(value)){for(const entry of value)add(entry);return;}
  if(typeof value==="object"){
   for(const key of["id","value","anilist_id","anilistId","mal_id","malId","anidb_id","anidbId","kitsu_id","kitsuId","tmdb_id","tmdbId","tvdb_id","tvdbId","imdb_id","imdbId"])if(value[key]!==undefined)add(value[key]);
  }
 };
 for(const value of[item?.anilist_id,item?.anilistId,item?.mal_id,item?.malId,item?.anidb_id,item?.anidbId,item?.kitsu_id,item?.kitsuId,item?.tmdb_id,item?.tmdbId,item?.tvdb_id,item?.tvdbId,item?.imdb_id,item?.imdbId])add(value);
 for(const key of["ids","external_ids","externalIds","mapping","mappings","external"]){const external=item?.[key];if(external!==null&&external!==undefined)add(external);}
 return ids;
}
function getMappingCandidates(mapping){
 if(!mapping)return[];
 const values=[];
 for(const key of["anilist","mal","anidb","kitsu","tmdb_show","tvdb_show","imdb_show"]){
  const value=mapping?.[key];
  if(!value?.id)continue;
  values.push({provider:key,id:String(value.id).trim(),episode:value.episode===null||value.episode===undefined?null:Number(value.episode),scope:value.scope||null,score:value.score||0});
 }
 return values;
}
function candidateIdMatchesMapping(item,mapping){
 if(!mapping)return false;
 const candidateIds=getCandidateExternalIds(item);
 const mappedIds=getMappingCandidates(mapping).map(value=>value.id).filter(Boolean);
 if(!mappedIds.length)return false;
 return candidateIds.some(id=>mappedIds.includes(String(id).trim()));
}
function getMappedEpisodeForCandidate(item,mapping){
 if(!mapping)return null;
 const candidateIds=getCandidateExternalIds(item);
 const mappings=getMappingCandidates(mapping);
 for(const mapped of mappings){
  if(mapped.episode===null||!Number.isFinite(mapped.episode))continue;
  if(candidateIds.some(id=>String(id).trim()===String(mapped.id).trim()))return mapped.episode;
 }
 return null;
}
async function searchAniKotoCandidates(title,year,season=1,excludeId=null,mapping=null){
 const candidates=[];
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
    if(!id||String(id)===String(excludeId))continue;
    if(!isValidTitleMatch(item,title))continue;
    const score=scoreSearchCandidate(item,title,year,season);
    if(!Number.isFinite(score))continue;
    const mapped=mapping?candidateIdMatchesMapping(item,mapping):false;
    const mappedEpisode=mapped?getMappedEpisodeForCandidate(item,mapping):null;
    candidates.push({id,title:getCandidateTitle(item),year:getCandidateYear(item),season:extractSeasonNumber(getCandidateTitle(item)),score:score+(mapped?5000:0),raw:item,mapped,mappedEpisode});
   }
   const pagination=json?.pagination||json?.data?.pagination;
   if(pagination&&pagination.hasNext===false)break;
  }catch(error){warn("Candidate search page failed",page,error?.message||String(error));}
 }
 candidates.sort((a,b)=>b.score-a.score);
 const unique=[];
 const seen=new Set();
 for(const candidate of candidates){
  const key=String(candidate.id);
  if(seen.has(key))continue;
  seen.add(key);
  unique.push(candidate);
  if(unique.length>=12)break;
 }
 return unique;
}
async function searchAniKoto(title,year,season=1,episode=1,mapping=null){
 const candidates=await searchAniKotoCandidates(title,year,season,null,mapping);
 if(!candidates.length)throw new Error("AniKoto title match not found");
 const best=candidates[0];
 log("Search matched",best.id,"score=",Math.round(best.score),best.mappedEpisode!==null&&best.mappedEpisode!==undefined?`mappedE=${best.mappedEpisode}`:"");
 return{...best,candidates};
}
function extractNumericId(value){
 if(typeof value==="number"&&Number.isFinite(value))return String(value);
 if(typeof value==="string"&&/^\d+$/.test(value.trim()))return value.trim();
 if(!value||typeof value!=="object")return null;
 const candidates=[value.id,value.anime_id,value.animeId,value.series_id,value.seriesId,value.data_id,value.dataId,value.anime?.id,value.anime?.anime_id,value.anime?.animeId,value.data?.id,value.data?.anime_id,value.data?.animeId,value.data?.data_id,value.data?.dataId];
 for(const candidate of candidates){const id=extractNumericId(candidate);if(id)return id;}
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
 }catch(error){warn("Slug lookup failed",error?.message||String(error));}
 try{
  const json=await fetchJson(`${ANIKOTO_RESOLVER_API}/page?name=${encoded}`);
  const numericId=extractNumericId(json);
  if(numericId)return numericId;
 }catch(error){warn("ID resolver failed",error?.message||String(error));}
 throw new Error(`Unable to resolve AniKoto slug to numeric ID: ${clean}`);
}
function extractEpisodes(json){
 const candidates=[json?.episodes,json?.data?.episodes,json?.anime?.episodes,json?.data?.anime?.episodes,json?.data?.episodeList,json?.episodeList];
 for(const value of candidates)if(Array.isArray(value))return value;
 return[];
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
 try{
  const json=await fetchJson(endpoint);
  const episodes=extractEpisodes(json);
  if(episodes.length>0)return{json,episodes,id:resolvedId};
 }catch(error){lastError=error;warn("Series endpoint failed",error?.message||String(error));}
 throw lastError||new Error("AniKoto series data unavailable");
}
function findEpisode(episodes,episodeNumber){
 const target=Number(episodeNumber);
 if(!Number.isFinite(target))return null;
 for(const episode of episodes){const number=getEpisodeNumber(episode);if(number===target)return episode;}
 return null;
}
function collectSources(value,output=[]){
 if(!value)return output;
 if(typeof value==="string"){if(/^https?:\/\//i.test(value))output.push({url:value,quality:null});return output;}
 if(Array.isArray(value)){for(const item of value)collectSources(item,output);return output;}
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
  subtitles.push({url,lang:track.label||track.srclang||track.lang||"English"});
 }
 return subtitles;
}
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
 const response=await fetchWithTimeout(url,{headers:{...DEFAULT_HEADERS,"Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Referer":referer,"Origin":ANIKOTO_SITE,...(cookie?{Cookie:cookie}:{})}});
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
 for(const pattern of patterns){const match=html.match(pattern);if(match?.[1])return match[1];}
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
  const getAttr=name=>{const re=new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`,"i");return attrs.match(re)?.[2]||null;};
  rows.push({number:Number(getAttr("data-num")||getAttr("data-episode")||getAttr("data-ep")||rows.length+1),ids:getAttr("data-ids")||getAttr("data-id"),malId:getAttr("data-mal"),timestamp:getAttr("data-timestamp")});
 }
 return rows;
}
function stripHtml(value){return String(value||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();}
function parseServerRows(html){
 const servers=[];
 const seen=new Set();
 const typeBlocks=/<div\b([^>]*class=["'][^"']*\btype\b[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi;
 let blockMatch;
 while((blockMatch=typeBlocks.exec(html))){
  const attrs=blockMatch[1];
  const block=blockMatch[2];
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
  const linkId=match[1].match(/\bdata-link-id=["']([^"']+)["']/i)?.[1]||match[1].match(/\bdata-id=["']([^"']+)["']/i)?.[1];
  if(!linkId)continue;
  const type=(match[1].match(/\bdata-type=["']([^"']+)["']/i)?.[1]||"sub").toLowerCase();
  const name=stripHtml(match[2])||"Server";
  const key=`${type}:${linkId}`;
  if(!seen.has(key)){seen.add(key);servers.push({type,name,linkId});}
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
 const servers=parseServerRows(serverResponse.text).filter(server=>server.type===String(language).toLowerCase());
 const resolved=[];
 for(const server of servers){
  try{
   const endpoint=`${siteOrigin}/ajax/server?get=${encodeURIComponent(server.linkId)}`;
   const response=await fetchJson(endpoint,{headers:{Cookie:cookie,Referer:watchUrl,"X-Requested-With":"XMLHttpRequest"}});
   const embed=response?.result?.url||response?.url||response?.data?.url;
   if(embed)resolved.push({...server,embedUrl:embed,malId:target.malId,timestamp:target.timestamp,watchUrl,cookie});
  }catch(error){warn("Server link failed",server.name,error?.message||String(error));}
 }
 return resolved;
}
function createAniKotoProxyUrl(url){
 if(!ANIKOTO_PROXY_BASE)return url;
 const encoded=Buffer.from(String(url),"utf8").toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
 return`${ANIKOTO_PROXY_BASE}/.netlify/functions/anikoto-proxy?url=${encoded}`;
}
function streamObject(url,title,episodeNumber,language,provider,quality="Auto",referer=null,subtitles=[]){
 const isHls=/\.m3u8(?:$|\?)/i.test(url);
 const origin=originOf(referer||url);
 return{name:`AniKoto ${language.toUpperCase()} ${provider} ${quality}`,title:`${title} - Episode ${episodeNumber} (${language.toUpperCase()})`,url,quality,provider:`anikoto-${provider}`,type:isHls?"m3u8":"mp4",hls:isHls,subtitles,behaviorHints:{proxyHeaders:{request:{...(referer?{Referer:referer}:{}),...(origin?{Origin:origin}:{}),"User-Agent":USER_AGENT}}}};
}
function streamsFromResolved(sourceJson,title,episodeNumber,language,provider,referer){
 const sources=collectSources(sourceJson);
 const subtitles=extractSubtitles(sourceJson);
 const streams=[];
 const seen=new Set();
 for(const source of sources){
  if(!source?.url||seen.has(source.url))continue;
  seen.add(source.url);
  streams.push(streamObject(source.url,title,episodeNumber,language,provider,normalizeQuality(source.quality),referer,subtitles));
 }
 return streams;
}
function extractPlayerId(html){
 const patterns=[/id=["']megaplay-player["'][^>]*\bdata-id=["'](\d+)["']/i,/\bdata-id=["'](\d+)["'][^>]*id=["']megaplay-player["']/i,/\bdata-id=["'](\d+)["']/i,/\bdata-id\s*=\s*(\d+)/i];
 for(const pattern of patterns){const match=html.match(pattern);if(match?.[1])return match[1];}
 return null;
}
function padKeyBytes(value,length){
 const raw=Buffer.from(String(value),"utf8");
 if(raw.length>=length)return raw.subarray(0,length);
 return Buffer.concat([raw,Buffer.alloc(length-raw.length)]);
}
function base64UrlDecode(value){
 let text=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
 while(text.length%4)text+="=";
 return Buffer.from(text,"base64");
}
function base64UrlEncode(value){
 return Buffer.from(value).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function decryptMegaPlaySources(enc){
 const key=padKeyBytes(MEGAPLAY_SOURCE_ENC_KEY,32);
 const iv=padKeyBytes(MEGAPLAY_SOURCE_ENC_IV,16);
 const decipher=crypto.createDecipheriv("aes-256-cbc",key,iv);
 const decrypted=Buffer.concat([decipher.update(base64UrlDecode(enc)),decipher.final()]);
 const result=JSON.parse(decrypted.toString("utf8"));
 if(!result||typeof result.file!=="string"||!/^https?:\/\//i.test(result.file))throw new Error("MegaPlay decrypted source has no media URL");
 return result;
}
function addMegaPlayCdnToken(url){
 const match=String(url).match(/\/([a-f0-9]{32})\/([a-f0-9]{32})(?:\/|$)/i);
 if(!match)return url;
 const path=`${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
 const expiry=Math.floor(Date.now()/1000)+MEGAPLAY_CDN_TOKEN_TTL;
 const payload=`${expiry}|${path}`;
 const signature=crypto.createHmac("sha256",MEGAPLAY_CDN_TOKEN_SECRET).update(payload).digest();
 const token=`${base64UrlEncode(Buffer.from(payload))}.${base64UrlEncode(signature)}`;
 return`${url}${url.includes("?")?"&":"?"}token=${encodeURIComponent(token)}`;
}
async function resolveMegaPlaySource(embedUrl){
 if(!embedUrl)throw new Error("MegaPlay embed URL missing");
 if(!isHost(embedUrl,"megaplay.buzz"))throw new Error(`Not a MegaPlay URL: ${hostnameOf(embedUrl)}`);
 const sourcePageUrl=embedUrl.replace("/stream/","/videojs/stream/");
 const page=await fetchWithTimeout(sourcePageUrl,{headers:{...DEFAULT_HEADERS,"Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Referer":`${MEGAPLAY_BASE}/`,"Origin":MEGAPLAY_BASE}});
 const html=await page.text();
 if(!page.ok)throw new Error(`MegaPlay page HTTP ${page.status}`);
 const playerId=extractPlayerId(html);
 if(!playerId)throw new Error("MegaPlay player data-id not found");
 const sourceUrl=`${MEGAPLAY_BASE}/videojs/stream/getSources?id=${encodeURIComponent(playerId)}`;
 const sourceResponse=await fetchWithTimeout(sourceUrl,{headers:{...DEFAULT_HEADERS,"Accept":"application/json,text/plain,*/*","Origin":MEGAPLAY_BASE,"Referer":sourcePageUrl}});
 if(!sourceResponse.ok)throw new Error(`MegaPlay getSources HTTP ${sourceResponse.status}`);
 const sourceText=await sourceResponse.text();
 let sourceJson;
 try{sourceJson=JSON.parse(sourceText);}
 catch{throw new Error("MegaPlay source response was not JSON");}
 if(!sourceJson?.enc)throw new Error("MegaPlay source response has no enc");
 const decrypted=decryptMegaPlaySources(sourceJson.enc);
 const mediaUrl=addMegaPlayCdnToken(decrypted.file);
 const proxyUrl=createAniKotoProxyUrl(decrypted.file);
 const subtitles=extractSubtitles(sourceJson);
 log("MegaPlay resolved",mediaUrl);
 if(proxyUrl!==decrypted.file)log("MegaPlay proxy",proxyUrl);
 return{sourceJson,embedUrl:sourcePageUrl,mediaUrl:proxyUrl,subtitles};
}
function extractVidTubeId(html){
 const patterns=[/\bdata-id=["'](\d+)["']/i,/\bdata-id\s*=\s*(\d+)/i,/\bdata-ep-id=["'](\d+)["']/i,/\bdata-episode-id=["'](\d+)["']/i];
 for(const pattern of patterns){const match=html.match(pattern);if(match?.[1])return match[1];}
 return null;
}
function extractVidTubeType(html){
 return html.match(/\bdata-type=["']([^"']+)["']/i)?.[1]||html.match(/\btype\s*:\s*["']([^"']+)["']/i)?.[1]||"sub";
}
async function resolveVidTubeSource(embedUrl){
 const origin=originOf(embedUrl);
 if(!origin)throw new Error("Invalid VidTube embed URL");
 if(!isHost(embedUrl,"vidtube.site"))throw new Error(`Not a VidTube URL: ${hostnameOf(embedUrl)}`);
 const html=await fetchText(embedUrl,{headers:{"User-Agent":USER_AGENT,"Accept":"text/html,application/xhtml+xml,application/json,text/plain,*/*","Referer":`${origin}/`,"Origin":origin}});
 const id=extractVidTubeId(html);
 if(!id)throw new Error("VidTube player ID not found");
 const type=extractVidTubeType(html);
 const sourceUrl=`${origin}/stream/getSources?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`;
 const sourceJson=await fetchJson(sourceUrl,{headers:{"Accept":"application/json,text/plain,*/*","Origin":origin,"Referer":embedUrl,"User-Agent":USER_AGENT}});
 const sources=collectSources(sourceJson);
 if(!sources.length)throw new Error("VidTube source response contained no media URL");
 return{sourceJson,embedUrl};
}
async function resolveServer(server,title,episodeNumber,language){
 const embedUrl=server?.embedUrl;
 if(!embedUrl)throw new Error("Server has no embed URL");
 const hostname=hostnameOf(embedUrl);
 log("Resolving",server.name||hostname);
 if(isHost(embedUrl,"megaplay.buzz")){
  const resolved=await resolveMegaPlaySource(embedUrl);
  return[streamObject(resolved.mediaUrl,title,episodeNumber,language,server.name||"MegaPlay","Auto",resolved.embedUrl,resolved.subtitles)];
 }
 if(isHost(embedUrl,"vidtube.site")){
  const resolved=await resolveVidTubeSource(embedUrl);
  return streamsFromResolved(resolved.sourceJson,title,episodeNumber,language,server.name||"VidTube",embedUrl);
 }
 throw new Error(`Unsupported native server: ${hostname||"unknown"}`);
}
export async function getStreams({imdbId,type="series",season=1,episode=1}={}){
 try{
  if(type!=="series")return[];
  const cleanImdbId=String(imdbId||"").split(":")[0].trim();
  const seasonNumber=Number(season||1);
  const episodeNumber=Number(episode||1);
  if(!/^tt\d+$/i.test(cleanImdbId)||!Number.isFinite(seasonNumber)||!Number.isFinite(episodeNumber))return[];
  const metadata=await getCinemetaMetadata(cleanImdbId,"series");
  if(!metadata.title)return[];
  const mapping=await getCombinedAnimeMapping(cleanImdbId,seasonNumber,episodeNumber);
  const mappingData=mapping?.source==="anibridge"?mapping.data:null;
  let candidates=[];
  if(mappingData)candidates=await searchAniKotoCandidates(metadata.title,metadata.year,seasonNumber,null,mappingData);
  if(!candidates.length){
   const normal=await searchAniKoto(metadata.title,metadata.year,seasonNumber,episodeNumber,null);
   candidates=normal?.candidates||[normal];
  }
  let match=null;
  let episodeData=null;
  let resolvedEpisodeNumber=episodeNumber;
  for(const candidate of candidates){
   try{
    const candidateSeries=await getAniKotoSeries(candidate.id);
    const candidateEpisodeNumber=candidate.mappedEpisode!==null&&candidate.mappedEpisode!==undefined&&Number.isFinite(Number(candidate.mappedEpisode))?Number(candidate.mappedEpisode):episodeNumber;
    let candidateEpisode=findEpisode(candidateSeries.episodes,candidateEpisodeNumber);
    if(!candidateEpisode&&candidateEpisodeNumber!==episodeNumber)candidateEpisode=findEpisode(candidateSeries.episodes,episodeNumber);
    if(!candidateEpisode)continue;
    match=candidate;
    episodeData=candidateEpisode;
    resolvedEpisodeNumber=getEpisodeNumber(candidateEpisode)||candidateEpisodeNumber;
    log("Verified",candidate.id,`S${seasonNumber}E${episodeNumber}`,resolvedEpisodeNumber!==episodeNumber?`providerE${resolvedEpisodeNumber}`:"",candidate.mapped?"mapped":"title");
    break;
   }catch(error){warn("Candidate verification failed",candidate.id,error?.message||String(error));}
  }
  if(!episodeData){
   const alternate=await searchAniKotoCandidates(metadata.title,metadata.year,seasonNumber,null,null);
   for(const candidate of alternate){
    if(candidates.some(existing=>String(existing.id)===String(candidate.id)))continue;
    try{
     const candidateSeries=await getAniKotoSeries(candidate.id);
     const candidateEpisode=findEpisode(candidateSeries.episodes,episodeNumber);
     if(!candidateEpisode)continue;
     match=candidate;
     episodeData=candidateEpisode;
     resolvedEpisodeNumber=getEpisodeNumber(candidateEpisode)||episodeNumber;
     log("Alternate verified",candidate.id,`S${seasonNumber}E${episodeNumber}`);
     break;
    }catch(error){warn("Alternate candidate failed",candidate.id,error?.message||String(error));}
   }
  }
  if(!episodeData||!match){
   warn("Episode unavailable",`S${seasonNumber}E${episodeNumber}`);
   return[];
  }
  let slug=getCandidateSlug(match.raw)||getCandidateSlug(match);
  if(!slug&&!isNumericId(match.id))slug=cleanId(match.id);
  log("Matched",match.id,mapping?`mapping=${mapping.source}`:"mapping=none","season=",match.season||"base",resolvedEpisodeNumber!==episodeNumber?`episode=${resolvedEpisodeNumber}`:"");
  log("Episode found",resolvedEpisodeNumber);
  const streams=[];
  for(const language of["sub","dub"]){
   let servers=[];
   if(slug){
    try{servers=await getAniKotoWebsiteServers(slug,resolvedEpisodeNumber,language);}
    catch(error){warn("Website discovery failed",language,error?.message||String(error));}
   }
   if(!servers.length){
    const embed=getEmbedUrl(episodeData,language);
    if(embed){
     servers=[{type:language,name:isHost(embed,"megaplay.buzz")?"MegaPlay":isHost(embed,"vidtube.site")?"VidTube":"AniKoto",embedUrl:embed,malId:episodeData?.malId||episodeData?.mal_id,timestamp:episodeData?.timestamp,watchUrl:null,cookie:""}];
    }
   }
   if(!servers.length){warn("No servers",language);continue;}
   log("Servers",language,servers.length);
   for(const server of servers){
    try{
     const resolved=await resolveServer(server,metadata.title,episodeNumber,language);
     if(resolved.length){streams.push(...resolved);log("Resolved",server.name,resolved.length);}
     else warn("No streams",server.name);
    }catch(error){warn("Resolver failed",server.name,error?.message||String(error));}
   }
  }
  const unique=[];
  const seen=new Set();
  for(const stream of streams){
   if(!stream?.url||seen.has(stream.url))continue;
   if(/\/stream\/(?:s-2|ani|mal)\//i.test(stream.url)&&!/\.m3u8(?:$|\?)/i.test(stream.url)){warn("Rejected embed URL");continue;}
   seen.add(stream.url);
   unique.push(stream);
  }
  const qualityRank={"2160p":2160,"4k":2160,"1440p":1440,"1080p":1080,"720p":720,"480p":480,"360p":360,"auto":0};
  unique.sort((a,b)=>(qualityRank[String(b.quality||"Auto").toLowerCase()]||0)-(qualityRank[String(a.quality||"Auto").toLowerCase()]||0));
  log("Final streams",unique.length);
  return unique;
 }catch(error){
  errorLog("Request failed",error?.message||String(error));
  return[];
 }
}
export default{getStreams};
