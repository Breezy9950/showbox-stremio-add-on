import CryptoJS from "crypto-js";

const API_BASE="https://api3.aoneroom.com";
const PLAYER_BASE="https://moviebox.ph";
const PLAYER_USER_AGENT="Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36";
const HOST_POOL=["https://api6.aoneroom.com","https://api5.aoneroom.com","https://api4.aoneroom.com","https://api4sg.aoneroom.com","https://api3.aoneroom.com"];
const KEY_B64_DEFAULT="NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
const KEY_B64_ALT="WHFuMm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==";
const TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
const TMDB_BASE_URL="https://api.themoviedb.org/3";
const TOKEN_URL="https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1";

const BRAND_MODELS={
  Samsung:["SM-S918B","SM-A528B","SM-M336B"],
  Xiaomi:["2201117TI","M2012K11AI","Redmi Note 11"],
  OnePlus:["LE2111","CPH2449","IN2023"],
  Google:["Pixel 6","Pixel 7","Pixel 8"],
  Realme:["RMX3085","RMX3360","RMX3551"]
};

const PACKAGE_INFO={
  package_name:"com.community.mbox.in",
  version_name:"4.0.03.0920.03",
  version_code:50020130
};

const SECRET_KEY_DEFAULT=CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_DEFAULT).toString(CryptoJS.enc.Utf8)
);

const SECRET_KEY_ALT=CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_ALT).toString(CryptoJS.enc.Utf8)
);

let deviceId="";
let selectedBrand="";
let selectedModel="";
let bearerToken=null;

function initializeSession(){
  if(deviceId)return;

  const chars="0123456789abcdef";

  for(let i=0;i<32;i++){
    deviceId+=chars[Math.floor(Math.random()*16)];
  }

  const brands=Object.keys(BRAND_MODELS);
  selectedBrand=brands[Math.floor(Math.random()*brands.length)];

  const models=BRAND_MODELS[selectedBrand];
  selectedModel=models[Math.floor(Math.random()*models.length)];
}

function md5(input){
  return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function hmacMd5(key,data){
  return CryptoJS.HmacMD5(data,key).toString(CryptoJS.enc.Base64);
}

function decodeJwtExpiry(token){
  try{
    const parts=token.split(".");
    if(parts.length<2)return 0;

    let base64=parts[1].replace(/-/g,"+").replace(/_/g,"/");
    while(base64.length%4)base64+="=";

    const parsed=CryptoJS.enc.Base64.parse(base64)
      .toString(CryptoJS.enc.Utf8);

    return JSON.parse(parsed).exp||0;
  }catch{
    return 0;
  }
}

function isTokenValid(token){
  if(!token)return false;
  return decodeJwtExpiry(token)>Date.now()/1000+3600;
}

function generateXClientToken(timestamp){
  const ts=String(timestamp||Date.now());
  const reversed=ts.split("").reverse().join("");
  return `${ts},${md5(reversed)}`;
}

function buildCanonicalString(
  method,
  accept,
  contentType,
  url,
  body,
  timestamp
){
  let path="";
  let query="";

  try{
    const urlObj=new URL(url);
    path=urlObj.pathname;

    const params=Array.from(urlObj.searchParams.keys()).sort();

    if(params.length){
      query=params.map(key=>{
        const values=urlObj.searchParams.getAll(key);
        return values.map(val=>`${key}=${val}`).join("&");
      }).join("&");
    }
  }catch{
    if(url.includes("?")){
      const parts=url.split("?");
      path=parts[0].replace(/https?:\/\/[^\/]+/,"");
      query=parts[1].split("&").sort().join("&");
    }else{
      path=url.replace(/https?:\/\/[^\/]+/,"");
    }
  }

  const canonicalUrl=query?`${path}?${query}`:path;

  let bodyHash="";
  let bodyLength="";

  if(body){
    const bodyWords=CryptoJS.enc.Utf8.parse(body);
    bodyLength=bodyWords.sigBytes.toString();
    bodyHash=md5(bodyWords);
  }

  return `${method.toUpperCase()}
${accept||""}
${contentType||""}
${bodyLength}
${timestamp}
${bodyHash}
${canonicalUrl}`;
}

function generateXTrSignature(
  method,
  accept,
  contentType,
  url,
  body,
  useAltKey=false,
  customTimestamp=null
){
  const timestamp=customTimestamp||Date.now();

  const canonical=buildCanonicalString(
    method,
    accept,
    contentType,
    url,
    body,
    timestamp
  );

  const secret=useAltKey
    ?SECRET_KEY_ALT
    :SECRET_KEY_DEFAULT;

  return `${timestamp}|2|${hmacMd5(secret,canonical)}`;
}

async function getCachedToken(){
  if(isTokenValid(bearerToken)){
    return bearerToken;
  }

  console.log("[MovieBox] Fetching fresh anonymous token...");

  const res=await movieBoxRequest(
    "GET",
    TOKEN_URL,
    null,
    {},
    true
  );

  if(res?.headers){
    const xUser=res.headers.get("x-user");

    if(xUser){
      try{
        const token=JSON.parse(xUser).token;

        if(token&&isTokenValid(token)){
          bearerToken=token;
          return token;
        }
      }catch(e){
        console.error(
          "[MovieBox] Failed to parse x-user header",
          e?.message||e
        );
      }
    }
  }

  return bearerToken||"";
}

async function movieBoxRequest(
  method,
  url,
  body=null,
  customHeaders={},
  isTokenFetch=false
){
  initializeSession();

  const timestamp=Date.now();

  const accept=
    customHeaders["Accept"]||
    "application/json";

  const contentType=
    customHeaders["Content-Type"]||
    (body
      ?"application/json; charset=utf-8"
      :"application/json");

  const xClientToken=
    generateXClientToken(timestamp);

  const xTrSignature=
    generateXTrSignature(
      method,
      accept,
      contentType,
      url,
      body,
      false,
      timestamp
    );

  const xClientInfo=JSON.stringify({
    ...PACKAGE_INFO,
    os:"android",
    os_version:"14",
    device_id:deviceId,
    install_store:"official",
    gaid:"1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d",
    brand:selectedBrand.toLowerCase(),
    model:selectedModel,
    system_language:"en",
    net:"NETWORK_WIFI",
    region:"IN",
    timezone:"Asia/Calcutta",
    sp_code:""
  });

  const headers={
    Accept:accept,
    "Content-Type":contentType,
    "x-client-token":xClientToken,
    "x-tr-signature":xTrSignature,
    "User-Agent":
      `${PACKAGE_INFO.package_name}/${PACKAGE_INFO.version_code} (Linux; U; Android 14; en_IN; ${selectedModel}; Build/UD1A.230803.041; Cronet/145.0.7582.0)`,
    "x-client-info":xClientInfo,
    "x-client-status":"0",
    ...customHeaders
  };

  if(!isTokenFetch){
    const token=await getCachedToken();

    if(token){
      headers.Authorization=`Bearer ${token}`;
    }
  }

  const options={
    method,
    headers
  };

  if(body){
    options.body=body;
  }

  let originalUrl;

  try{
    originalUrl=new URL(url);
  }catch{
    return null;
  }

  /*
   * TOKEN REQUEST:
   * Only apig.inmoviebox.com.
   *
   * NORMAL REQUEST:
   * Original MovieBox API host pool.
   */
  let hosts;

  if(isTokenFetch){
    hosts=[originalUrl.host];
  }else{
    const apiHosts=new Set(
      HOST_POOL.map(
        host=>new URL(host).host
      )
    );

    hosts=apiHosts.has(originalUrl.host)
      ?[
          originalUrl.host,
          ...HOST_POOL
            .map(host=>new URL(host).host)
            .filter(host=>host!==originalUrl.host)
        ]
      :[originalUrl.host];
  }

  const maxAttempts=isTokenFetch
    ?1
    :Math.min(3,hosts.length);

  for(let attempt=0;attempt<maxAttempts;attempt++){
    try{
      const requestUrl=new URL(
        originalUrl.toString()
      );

      requestUrl.host=hosts[attempt];

      const res=await fetch(
        requestUrl.toString(),
        options
      );

      if(!res.ok){
        console.log(
          `[MovieBox] Request failed: ${res.status} ${requestUrl.host}`
        );

        if(
          !isTokenFetch&&
          (
            res.status===403||
            res.status===429||
            res.status>=500
          )&&
          attempt+1<maxAttempts
        ){
          console.log(
            `[MovieBox] Host ${requestUrl.host} failed (${res.status}), trying next host...`
          );
          continue;
        }

        return null;
      }

      const text=await res.text();

      let parsed;

      try{
        parsed=JSON.parse(text);
      }catch{
        parsed=text;
      }

      const xUser=res.headers.get("x-user");

      if(xUser){
        try{
          const token=JSON.parse(xUser).token;

          if(token&&isTokenValid(token)){
            bearerToken=token;
          }
        }catch{}
      }

      return{
        data:parsed,
        headers:res.headers
      };
    }catch(err){
      console.error(
        "[MovieBox Request Error]",
        err?.message||err
      );

      if(
        !isTokenFetch&&
        attempt+1<maxAttempts
      ){
        continue;
      }

      return null;
    }
  }

  return null;
}

/* ---------------- TMDB ---------------- */

async function findTmdbByImdb(imdbId,type){
  try{
    const url=
      `${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;

    const res=await fetch(url);

    if(!res.ok){
      console.log(
        `[MovieBox] TMDB IMDb lookup failed: ${res.status}`
      );
      return null;
    }

    const data=await res.json();

    return type==="movie"
      ?data?.movie_results?.[0]||null
      :data?.tv_results?.[0]||null;
  }catch(e){
    console.error(
      "[MovieBox TMDB IMDb Error]",
      e?.message||e
    );
    return null;
  }
}

async function fetchTmdbDetails(tmdbId,mediaType){
  try{
    const url=
      `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

    const res=await fetch(url);

    if(!res.ok)return null;

    const data=await res.json();

    return{
      title:
        mediaType==="movie"
          ?data.title||data.original_title
          :data.name||data.original_name,

      year:
        (
          data.release_date||
          data.first_air_date||
          ""
        ).substring(0,4),

      originalTitle:
        data.original_title||
        data.original_name
    };
  }catch(e){
    console.error(
      "[MovieBox TMDB Error]",
      e?.message||e
    );
    return null;
  }
}

/* ---------------- SEARCH ---------------- */

function normalizeTitle(s){
  if(!s)return "";

  return String(s)
    .replace(/\[[^\]]*\]/g," ")
    .replace(/\([^)]*\)/g," ")
    .replace(
      /\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi,
      " "
    )
    .trim()
    .toLowerCase()
    .replace(/:/g," ")
    .replace(/[^\w\s]/g," ")
    .replace(/\s+/g," ");
}

function tokenSimilarity(a,b){
  const aTokens=new Set(
    normalizeTitle(a)
      .split(" ")
      .filter(Boolean)
  );

  const bTokens=new Set(
    normalizeTitle(b)
      .split(" ")
      .filter(Boolean)
  );

  if(!aTokens.size||!bTokens.size)return 0;

  let common=0;

  for(const token of aTokens){
    if(bTokens.has(token))common++;
  }

  return common/
    Math.max(
      aTokens.size,
      bTokens.size
    );
}

function findBestMatch(
  subjects,
  tmdbTitle,
  tmdbYear,
  mediaType,
  originalTitle=""
){
  const normTitle=
    normalizeTitle(tmdbTitle);

  const normOriginal=
    normalizeTitle(originalTitle);

  const targetType=
    mediaType==="movie"
      ?1
      :2;

  let best=null;
  let bestScore=0;

  for(const subject of subjects){
    if(
      subject.subjectType!==
      targetType
    ){
      continue;
    }

    const title=
      subject.title||"";

    const normSubject=
      normalizeTitle(title);

    const year=
      subject.year||
      (
        subject.releaseDate
          ?subject.releaseDate.substring(0,4)
          :null
      );

    let titleScore=0;

    if(
      normSubject===normTitle
    ){
      titleScore=100;
    }

    if(
      normOriginal&&
      normSubject===normOriginal
    ){
      titleScore=Math.max(
        titleScore,
        100
      );
    }

    if(
      normSubject.includes(normTitle)||
      normTitle.includes(normSubject)
    ){
      titleScore=Math.max(
        titleScore,
        75
      );
    }

    if(
      normOriginal&&
      (
        normSubject.includes(normOriginal)||
        normOriginal.includes(normSubject)
      )
    ){
      titleScore=Math.max(
        titleScore,
        75
      );
    }

    titleScore=Math.max(
      titleScore,
      tokenSimilarity(
        tmdbTitle,
        title
      )*80
    );

    if(originalTitle){
      titleScore=Math.max(
        titleScore,
        tokenSimilarity(
          originalTitle,
          title
        )*80
      );
    }

    let score=titleScore;

    if(
      tmdbYear&&
      year&&
      String(tmdbYear)===String(year)
    ){
      score+=35;
    }

    console.log(
      `[MovieBox] Candidate: "${title}" | type=${subject.subjectType} | year=${year||"?"} | score=${score.toFixed(1)}`
    );

    if(score>bestScore){
      bestScore=score;
      best=subject;
    }
  }

  if(best&&bestScore>=45){
    console.log(
      `[MovieBox] Selected: "${best.title}" (${bestScore.toFixed(1)})`
    );
    return best;
  }

  return null;
}

async function searchMovieBox(query){
  const url=
    `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;

  const body=JSON.stringify({
    page:1,
    perPage:20,
    keyword:query,
    restrictKid:1
  });

  const response=
    await movieBoxRequest(
      "POST",
      url,
      body
    );

  if(
    response?.data?.data?.results
  ){
    let subjects=[];

    for(
      const group of response.data.data.results
    ){
      if(group.subjects){
        subjects.push(
          ...group.subjects
        );
      }
    }

    return subjects;
  }

  return [];
}

async function findMovieBoxSubject(
  title,
  originalTitle,
  year,
  mediaType
){
  const queries=[title];

  if(
    originalTitle&&
    normalizeTitle(originalTitle)!==
      normalizeTitle(title)
  ){
    queries.push(originalTitle);
  }

  const simplified=title
    ?.replace(/[:\-–—]/g," ")
    .replace(/\s+/g," ")
    .trim();

  if(
    simplified&&
    normalizeTitle(simplified)!==
      normalizeTitle(title)
  ){
    queries.push(simplified);
  }

  for(
    const query of [...new Set(queries.filter(Boolean))]
  ){
    console.log(
      `[MovieBox] Searching: "${query}"`
    );

    const subjects=
      await searchMovieBox(query);

    console.log(
      `[MovieBox] Search returned ${subjects.length} candidates`
    );

    const match=
      findBestMatch(
        subjects,
        title,
        year,
        mediaType,
        originalTitle
      );

    if(match){
      return match;
    }
  }

  return null;
}

/* ---------------- PLAYBACK ---------------- */

function getPlaybackPage(
  subjectData,
  subjectId
){
  const candidates=[
    subjectData.detailPath,
    subjectData.detail_path,
    subjectData.path,
    subjectData.slug
  ];

  let detailPath=
    candidates.find(
      value=>
        typeof value==="string"&&
        value.trim()
    );

  let webBase=PLAYER_BASE;

  for(
    const value of[
      subjectData.detailDomain,
      subjectData.webDomain,
      subjectData.webUrl,
      subjectData.detailUrl,
      subjectData.shareUrl
    ]
  ){
    if(typeof value!=="string")continue;

    try{
      const parsed=new URL(
        value.startsWith("http")
          ?value
          :`https://${value}`
      );

      if(
        !parsed.hostname.endsWith(
          "aoneroom.com"
        )
      ){
        webBase=parsed.origin;
      }

      if(
        !detailPath&&
        parsed.pathname&&
        parsed.pathname!=="/"
      ){
        detailPath=parsed.pathname;
      }

      break;
    }catch{}
  }

  if(!detailPath){
    return{
      webBase,
      referer:`${webBase}/`
    };
  }

  detailPath=detailPath
    .replace(/^\/+/,"")
    .replace(/^movies\//,"");

  const pageUrl=
    new URL(
      `/movies/${detailPath}`,
      `${webBase}/`
    );

  pageUrl.searchParams.set(
    "id",
    subjectId
  );

  pageUrl.searchParams.set(
    "type",
    "/movie/detail"
  );

  pageUrl.searchParams.set(
    "detailSe",
    ""
  );

  pageUrl.searchParams.set(
    "detailEp",
    ""
  );

  pageUrl.searchParams.set(
    "lang",
    "en"
  );

  return{
    webBase,
    detailPath,
    referer:pageUrl.toString()
  };
}

function collectStreams(playData){
  const streams=
    Array.isArray(playData?.streams)
      ?[...playData.streams]
      :[];

  for(
    const[key,format]of[
      ["netDash","DASH"],
      ["netHls","HLS"]
    ]
  ){
    const value=
      playData?.[key]||
      playData?.data?.[key];

    const values=
      Array.isArray(value)
        ?value
        :value
          ?[value]
          :[];

    for(const item of values){
      if(typeof item==="string"){
        streams.push({
          url:item,
          format
        });
      }else if(
        item&&
        typeof item==="object"
      ){
        if(
          item.url||
          item.playUrl||
          item.resourceLink||
          item.streamUrl
        ){
          streams.push({
            ...item,
            format:
              item.format||format
          });
        }else{
          for(
            const[
              resolution,
              url
            ]of Object.entries(item)
          ){
            if(
              typeof url==="string"&&
              /^https?:\/\//i.test(url)
            ){
              streams.push({
                url,
                resolution,
                format
              });
            }else if(
              url&&
              typeof url==="object"
            ){
              streams.push({
                ...url,
                resolution:
                  url.resolution||
                  resolution,
                format:
                  url.format||format
              });
            }
          }
        }
      }
    }
  }

  const seen=new Set();

  return streams.filter(stream=>{
    const key=
      stream?.url||
      stream?.playUrl||
      stream?.resourceLink||
      stream?.streamUrl;

    if(!key||seen.has(key))return false;

    seen.add(key);
    return true;
  });
}

function getAudioLabel(
  stream,
  fallbackLanguage
){
  const raw=
    [
      stream.languageName,
      stream.lanName,
      stream.language,
      stream.lan,
      fallbackLanguage
    ].find(
      value=>
        typeof value==="string"&&
        value.trim()
    )||"Unknown";

  let language=raw
    .replace(/\bdub\b/gi," ")
    .replace(/\baudio\b/gi," ")
    .replace(/[_-]+/g," ")
    .replace(/\s+/g," ")
    .trim();

  const names={
    ar:"Arabic",
    bn:"Bengali",
    de:"German",
    en:"English",
    es:"Spanish",
    fr:"French",
    hi:"Hindi",
    id:"Indonesian",
    it:"Italian",
    ja:"Japanese",
    ko:"Korean",
    ml:"Malayalam",
    mr:"Marathi",
    pt:"Portuguese",
    ru:"Russian",
    ta:"Tamil",
    te:"Telugu",
    th:"Thai",
    tr:"Turkish",
    ur:"Urdu",
    vi:"Vietnamese",
    zh:"Chinese"
  };

  const code=
    language.match(
      /^([a-z]{2,3})(?:\s|$)/i
    )?.[1]
      ?.toLowerCase();

  if(code&&names[code]){
    language=names[code];
  }else if(language){
    language=
      language.charAt(0).toUpperCase()+
      language.slice(1);
  }else{
    language="Unknown";
  }

  return `${language} Audio`;
}

function normalizeQuality(value){
  const raw=
    String(value||"").toLowerCase();

  if(
    raw.includes("2160")||
    raw.includes("4k")
  )return"4K";

  if(raw.includes("1440"))return"1440p";
  if(raw.includes("1080"))return"1080p";
  if(raw.includes("720"))return"720p";
  if(raw.includes("480"))return"480p";
  if(raw.includes("360"))return"360p";
  if(raw.includes("240"))return"240p";

  return"Auto";
}

function getFormatType(url){
  const u=
    String(url||"").toLowerCase();

  if(u.includes(".mpd"))return"DASH";
  if(u.includes(".m3u8"))return"HLS";
  if(u.includes(".mp4"))return"MP4";
  if(u.includes(".mkv"))return"MKV";

  return"VIDEO";
}

function extractPolicyResource(signCookie){
  if(
    !signCookie||
    typeof signCookie!=="string"
  )return null;

  const edgeMatch=
    signCookie.match(
      /Edge-Cache-Cookie=urlprefix=([^:;\s]+)/
    );

  if(edgeMatch){
    try{
      let std=edgeMatch[1]
        .replace(/_/g,"/")
        .replace(/-/g,"+");

      const rem=
        (4-std.length%4)%4;

      if(rem>0){
        std+="=".repeat(rem);
      }

      const decoded=
        CryptoJS.enc.Base64
          .parse(std)
          .toString(
            CryptoJS.enc.Utf8
          )
          .replace(/\/+$/,"");

      if(decoded){
        return`${decoded}/index.mpd`;
      }
    }catch{}
  }

  const cfMatch=
    signCookie.match(
      /CloudFront-Policy=([^;]+)/
    );

  if(cfMatch){
    try{
      const raw=cfMatch[1];

      let b64=raw
        .replace(/-/g,"+")
        .replace(/~/g,"/")
        .replace(/_/g,"=");

      const rem=b64.length%4;

      if(rem>0){
        b64+="=".repeat(4-rem);
      }

      const json=
        CryptoJS.enc.Base64
          .parse(b64)
          .toString(
            CryptoJS.enc.Utf8
          );

      if(json){
        const root=JSON.parse(json);
        const resource=
          root?.Statement?.[0]?.Resource;

        if(
          resource&&
          typeof resource==="string"
        ){
          const trimmed=
            resource.replace(
              /[\*\/]+$/,
              ""
            );

          return trimmed
            .toLowerCase()
            .endsWith(".mpd")
            ?trimmed
            :`${trimmed}/index.mpd`;
        }
      }
    }catch{}
  }

  return null;
}

/* ---------------- SUBTITLES ---------------- */

async function fetchSubtitles(
  subjectId,
  streamId,
  langLabel
){
  const subtitles=[];

  try{
    const url=
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${subjectId}&streamId=${streamId}`;

    const res=
      await movieBoxRequest(
        "GET",
        url,
        null
      );

    const captions=
      res?.data?.data?.extCaptions;

    if(Array.isArray(captions)){
      captions.forEach(cap=>{
        if(!cap.url)return;

        subtitles.push({
          url:cap.url,
          language:
            cap.language||
            cap.lanName||
            cap.lan||
            "en",
          name:
            `${cap.lanName||cap.language||"Subtitle"} (${langLabel})`,
          headers:{
            Referer:API_BASE
          }
        });
      });
    }
  }catch{}

  try{
    const url=
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${subjectId}&resourceId=${streamId}&episode=0`;

    const res=
      await movieBoxRequest(
        "GET",
        url,
        null
      );

    const captions=
      res?.data?.data?.extCaptions;

    if(Array.isArray(captions)){
      captions.forEach(cap=>{
        if(!cap.url)return;

        subtitles.push({
          url:cap.url,
          language:
            cap.lan||
            cap.lanName||
            cap.language||
            "en",
          name:
            `${cap.lanName||cap.lan||"Subtitle"} (${langLabel})`,
          headers:{
            Referer:API_BASE
          }
        });
      });
    }
  }catch{}

  return subtitles;
}

/* ---------------- STREAMS ---------------- */

async function getStreamLinks(
  subjectId,
  season=0,
  episode=0,
  mediaTitle="",
  mediaType="movie"
){
  const subjectUrl=
    `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;

  const detailRes=
    await movieBoxRequest(
      "GET",
      subjectUrl
    );

  if(
    !detailRes?.data?.data
  ){
    return[];
  }

  const subjectData=
    detailRes.data.data;

  const playbackPage=
    getPlaybackPage(
      subjectData,
      subjectId
    );

  const subjectIds=[];

  let originalLang="Original";

  if(Array.isArray(subjectData.dubs)){
    subjectData.dubs.forEach(dub=>{
      if(dub.subjectId==subjectId){
        originalLang=
          dub.lanName||
          "Original";
      }else{
        subjectIds.push({
          id:dub.subjectId,
          lang:dub.lanName
        });
      }
    });
  }

  subjectIds.unshift({
    id:subjectId,
    lang:originalLang
  });

  const allStreams=[];

  const playbackHeaders={
    Origin:playbackPage.webBase,
    Referer:playbackPage.referer,
    "User-Agent":PLAYER_USER_AGENT,
    "x-request-lang":"en",
    "x-vip-restrict":"0",
    "x-no-high-risk-restrict":"0"
  };

  for(const item of subjectIds){
    try{
      const params=new URLSearchParams({
        subjectId:String(item.id),
        se:String(season),
        ep:String(episode),
        streamSignType:"1"
      });

      if(playbackPage.detailPath){
        params.set(
          "detailPath",
          playbackPage.detailPath
        );
      }

      params.set(
        "supportCodecs[hevc]",
        "1"
      );

      params.set(
        "supportCodecs[h264]",
        "1"
      );

      const playUrl=
        `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?${params.toString()}`;

      const playRes=
        await movieBoxRequest(
          "GET",
          playUrl,
          null,
          playbackHeaders
        );

      if(!playRes?.data?.data){
        continue;
      }

      const playData=
        playRes.data.data;

      const streams=
        collectStreams(playData);

      let hasValid=false;

      for(const stream of streams){
        const rawUrl=
          stream.url||
          stream.playUrl||
          stream.resourceLink||
          stream.streamUrl||
          "";

        const signCookie=
          stream.signCookie||null;

        const policyUrl=
          extractPolicyResource(
            signCookie
          );

        const finalUrl=
          policyUrl||rawUrl;

        if(!finalUrl)continue;

        if(
          finalUrl.includes(
            "b164fbfb4347792950bdfbfb563d39d9"
          )
        )continue;

        if(
          finalUrl===rawUrl&&
          rawUrl.includes(
            "/other/2026/09/"
          )
        )continue;

        let format=
          getFormatType(
            finalUrl
          );

        if(stream.format){
          const declared=
            String(
              stream.format
            ).toUpperCase();

          if(
            ["DASH","HLS","MP4","MKV"]
              .includes(declared)
          ){
            format=declared;
          }
        }

        const quality=
          normalizeQuality(
            stream.resolutions||
            stream.resolution||
            stream.quality||
            "Auto"
          );

        const audio=
          getAudioLabel(
            stream,
            item.lang
          );

        const streamId=
          stream.id||
          `${item.id}|${season}|${episode}`;

        const subtitles=
          await fetchSubtitles(
            item.id,
            streamId,
            item.lang
          );

        const signHeaderKey=
          stream.signHeaderKey||
          stream.sign_header_key||
          "Cookie";

        allStreams.push({
          name:`MovieBox ${quality}`,
          title:`MovieBox ${quality}`,
          url:finalUrl,
          quality,
          headers:{
            ...playbackHeaders,
            ...(signCookie
              ?{[signHeaderKey]:signCookie}
              :{})
          },
          subtitles,
          provider:"moviebox"
        });

        hasValid=true;
      }

      if(!hasValid){
        let detectors=
          playData.resourceDetectors;

        if(!Array.isArray(detectors)){
          detectors=
            subjectData.resourceDetectors;
        }

        if(Array.isArray(detectors)){
          for(const detector of detectors){
            if(
              !Array.isArray(
                detector.resolutionList
              )
            )continue;

            for(
              const video of detector.resolutionList
            ){
              if(!video.resourceLink)continue;

              const se=
                video.se!=null
                  ?video.se
                  :0;

              const ep=
                video.ep!=null
                  ?video.ep
                  :0;

              if(
                (
                  season>0||
                  episode>0
                )&&
                (
                  se!==season||
                  ep!==episode
                )
              ){
                continue;
              }

              const quality=
                video.resolution
                  ?normalizeQuality(
                      video.resolution
                    )
                  :"Auto";

              allStreams.push({
                name:`MovieBox ${quality}`,
                title:`MovieBox ${quality}`,
                url:video.resourceLink,
                quality,
                headers:{
                  ...playbackHeaders
                },
                subtitles:[],
                provider:"moviebox"
              });
            }
          }
        }
      }
    }catch(err){
      console.error(
        `[MovieBox Stream Fetch Error] ID: ${item.id}`,
        err?.message||err
      );
    }
  }

  const rank={
    "4K":2160,
    "1440p":1440,
    "1080p":1080,
    "720p":720,
    "480p":480,
    "360p":360,
    "240p":240,
    Auto:1
  };

  allStreams.sort(
    (a,b)=>
      (rank[b.quality]||0)-
      (rank[a.quality]||0)
  );

  return allStreams;
}

/* ---------------- PUBLIC API ---------------- */

export async function getStreams({
  imdbId,
  type,
  season=0,
  episode=0
}){
  console.log(
    `[MovieBox] Querying IMDb: ${imdbId}, Type: ${type}, S${season}E${episode}`
  );

  if(!imdbId){
    return[];
  }

  const mediaType=
    type==="movie"
      ?"movie"
      :"tv";

  const tmdbItem=
    await findTmdbByImdb(
      imdbId,
      type
    );

  if(!tmdbItem){
    console.log(
      `[MovieBox] Could not resolve IMDb ${imdbId}`
    );
    return[];
  }

  const details=
    await fetchTmdbDetails(
      tmdbItem.id,
      mediaType
    );

  if(!details){
    return[];
  }

  console.log(
    `[MovieBox] TMDB: ${tmdbItem.id} | "${details.title}" | Original: "${details.originalTitle}" | Year: ${details.year||"?"}`
  );

  const subject=
    await findMovieBoxSubject(
      details.title,
      details.originalTitle,
      details.year,
      mediaType
    );

  if(!subject){
    console.log(
      `[MovieBox] No matching content found for: ${details.title}`
    );
    return[];
  }

  console.log(
    `[MovieBox] Matched: "${subject.title}" (${subject.subjectId})`
  );

  const finalSeason=
    mediaType==="tv"
      ?season
      :0;

  const finalEpisode=
    mediaType==="tv"
      ?episode
      :0;

  const streams=
    await getStreamLinks(
      subject.subjectId,
      finalSeason,
      finalEpisode,
      details.title,
      mediaType
    );

  console.log(
    `[MovieBox] Returning ${streams.length} streams`
  );

  return streams;
}
