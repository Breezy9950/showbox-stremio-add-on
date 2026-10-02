const MEGAPLAY_VIDEOJS_BASE="https://megaplay.buzz/videojs";
const MEGAPLAY_SOURCE_ENC_KEY="i?LMTAx0Q6,:}50U";
const MEGAPLAY_SOURCE_ENC_IV="W0;27ToaUpl_P%'c";
const MEGAPLAY_CDN_TOKEN_SECRET="MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
const MEGAPLAY_CDN_TOKEN_TTL=90;

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
    const crypto=(await import("crypto")).default;
    const decipher=crypto.createDecipheriv("aes-256-cbc",padKeyBytes(MEGAPLAY_SOURCE_ENC_KEY,32),padKeyBytes(MEGAPLAY_SOURCE_ENC_IV,16));
    const output=Buffer.concat([decipher.update(b64UrlDecode(enc)),decipher.final()]);
    const json=JSON.parse(output.toString("utf8"));
    return json&&typeof json.file==="string"?json:null;
  }catch{
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
  const crypto=require("crypto");
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

  const parsed=new URL(embedUrl);
  const language=parsed.pathname.split("/").pop()||"sub";

  const videojsUrl=embedUrl.replace("/stream/","/videojs/stream/");

  log("MegaPlay videojs:",videojsUrl);

  const html=await fetchText(videojsUrl,{
    headers:{
      "User-Agent":USER_AGENT,
      "Accept":"text/html,application/xhtml+xml,application/json,text/plain,*/*",
      "Referer":`${MEGAPLAY_BASE}/`,
      "Origin":MEGAPLAY_BASE
    }
  });

  const playerId=extractPlayerId(html);

  if(!playerId)throw new Error("MegaPlay videojs player ID not found");

  log("MegaPlay videojs player ID:",playerId);

  const sourceUrl=`${MEGAPLAY_VIDEOJS_BASE}/stream/getSources?id=${encodeURIComponent(playerId)}`;

  const sourceJson=await fetchJson(sourceUrl,{
    headers:{
      "Accept":"application/json,text/plain,*/*",
      "Origin":MEGAPLAY_BASE,
      "Referer":videojsUrl,
      "User-Agent":USER_AGENT
    }
  });

  let mediaUrl=null;

  if(typeof sourceJson?.sources?.file==="string")mediaUrl=sourceJson.sources.file;

  if(!mediaUrl&&typeof sourceJson?.file==="string")mediaUrl=sourceJson.file;

  if(!mediaUrl&&typeof sourceJson?.enc==="string"){
    const decrypted=await decryptMegaPlaySources(sourceJson.enc);
    if(decrypted?.file)mediaUrl=decrypted.file;
  }

  if(!mediaUrl)throw new Error("MegaPlay videojs source contained no media URL");

  mediaUrl=withCdnToken(mediaUrl);

  log("MegaPlay final HLS:",mediaUrl.replace(/token=[^&]+/,"token=REDACTED"));

  return{
    sourceJson,
    embedUrl:videojsUrl,
    mediaUrl
  };
}
