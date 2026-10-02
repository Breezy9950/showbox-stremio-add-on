import crypto from "node:crypto";

const CDN_HOST="fetch.nexabloom.top";
const MEGAPLAY_BASE="https://megaplay.buzz";
const USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const CDN_TOKEN_SECRET="MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
const CDN_TOKEN_TTL=90;
const UPSTREAM_TIMEOUT_MS=12000;

function log(...args){console.log("[AniKoto Proxy]",...args);}
function base64UrlDecode(value){
 let text=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
 while(text.length%4)text+="=";
 return Buffer.from(text,"base64").toString("utf8");
}
function base64UrlEncode(value){
 return Buffer.from(value).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function addMegaPlayCdnToken(url){
 const target=new URL(url);
 target.searchParams.delete("token");
 const match=target.pathname.match(/\/([a-f0-9]{32})\/([a-f0-9]{32})(?:\/|$)/i);
 if(!match)return target.toString();
 const path=`${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
 const expiry=Math.floor(Date.now()/1000)+CDN_TOKEN_TTL;
 const payload=`${expiry}|${path}`;
 const signature=crypto.createHmac("sha256",CDN_TOKEN_SECRET).update(payload).digest();
 const token=`${base64UrlEncode(Buffer.from(payload))}.${base64UrlEncode(signature)}`;
 target.searchParams.set("token",token);
 return target.toString();
}
function decodeTarget(value){
 if(!value)throw new Error("Missing proxy URL");
 try{return base64UrlDecode(value);}
 catch{throw new Error("Invalid proxy URL");}
}
function encodeTarget(url){
 return base64UrlEncode(url);
}
function isAllowedUrl(value){
 try{
  const url=new URL(value);
  return url.protocol==="https:"&&url.hostname.toLowerCase()===CDN_HOST;
 }catch{
  return false;
 }
}
function resolveUpstreamUrl(base,value){
 try{return new URL(value,base).toString();}
 catch{return null;}
}
function isPlaylist(url,response){
 const contentType=String(response.headers.get("content-type")||"").toLowerCase();
 return /\.m3u8(?:$|\?)/i.test(new URL(url).pathname)||contentType.includes("mpegurl")||contentType.includes("vnd.apple.mpegurl");
}
function proxyUrl(requestUrl,targetUrl){
 const url=new URL(requestUrl);
 url.search="";
 url.searchParams.set("url",encodeTarget(targetUrl));
 return url.toString();
}
function rewriteUriAttributes(line,requestUrl,baseUrl){
 return line.replace(/URI=(["'])([^"']+)\1/gi,(match,quote,uri)=>{
  const absolute=resolveUpstreamUrl(baseUrl,uri);
  if(!absolute||!isAllowedUrl(absolute))return match;
  return`URI=${quote}${proxyUrl(requestUrl,absolute)}${quote}`;
 });
}
function rewritePlaylist(text,requestUrl,baseUrl){
 const lines=String(text).split(/\r?\n/);
 return lines.map(line=>{
  const trimmed=line.trim();
  if(!trimmed||trimmed.startsWith("#")){
   return line.includes("URI=")?rewriteUriAttributes(line,requestUrl,baseUrl):line;
  }
  const absolute=resolveUpstreamUrl(baseUrl,trimmed);
  if(!absolute||!isAllowedUrl(absolute))return line;
  return proxyUrl(requestUrl,absolute);
 }).join("\n");
}
async function fetchUpstream(url,request){
 const target=new URL(url);
 const headers={
  "User-Agent":USER_AGENT,
  "Accept":"*/*",
  "Accept-Encoding":"identity",
  "Referer":`${MEGAPLAY_BASE}/`,
  "Origin":MEGAPLAY_BASE
 };
 const range=request.headers.get("range");
 if(range)headers.Range=range;
 const ifRange=request.headers.get("if-range");
 if(ifRange)headers["If-Range"]=ifRange;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),UPSTREAM_TIMEOUT_MS);
 try{
  const signed=addMegaPlayCdnToken(target.toString());
  log("Upstream",request.method,signed.replace(/([?&])token=[^&]+/,"$1token=REDACTED"));
  return await fetch(signed,{method:request.method==="HEAD"?"HEAD":"GET",headers,redirect:"follow",signal:controller.signal});
 }finally{
  clearTimeout(timer);
 }
}
function responseHeaders(upstream,isPlaylistResponse){
 const headers=new Headers();
 const copy=["content-type","content-length","content-range","accept-ranges","etag","last-modified","cache-control"];
 for(const name of copy){
  const value=upstream.headers.get(name);
  if(value)headers.set(name,value);
 }
 headers.set("Access-Control-Allow-Origin","*");
 headers.set("Access-Control-Allow-Headers","Range,Origin,Referer,User-Agent,Content-Type");
 headers.set("Access-Control-Expose-Headers","Content-Length,Content-Range,Accept-Ranges,Content-Type,ETag,Last-Modified");
 headers.set("Cache-Control",isPlaylistResponse?"no-store":"public, max-age=60");
 if(isPlaylistResponse)headers.set("Content-Type","application/vnd.apple.mpegurl");
 return headers;
}
export default async function handler(request){
 const requestUrl=new URL(request.url);
 if(request.method==="OPTIONS"){
  return new Response(null,{status:204,headers:{
   "Access-Control-Allow-Origin":"*",
   "Access-Control-Allow-Methods":"GET,HEAD,OPTIONS",
   "Access-Control-Allow-Headers":"Range,Origin,Referer,User-Agent,Content-Type"
  }});
 }
 if(request.method!=="GET"&&request.method!=="HEAD"){
  return new Response("Method not allowed",{status:405,headers:{"Allow":"GET,HEAD,OPTIONS"}});
 }
 try{
  const encoded=requestUrl.searchParams.get("url");
  const target=decodeTarget(encoded);
  if(!isAllowedUrl(target))return new Response("Forbidden upstream",{status:403});
  const targetUrl=new URL(target);
  const upstream=await fetchUpstream(targetUrl.toString(),request);
  if(!upstream.ok){
   const body=await upstream.text().catch(()=>"");
   log("Upstream failed",upstream.status,targetUrl.pathname,body.slice(0,200));
   return new Response(body||`Upstream HTTP ${upstream.status}`,{
    status:upstream.status,
    headers:{"Access-Control-Allow-Origin":"*","Content-Type":"text/plain"}
   });
  }
  const playlist=isPlaylist(targetUrl.toString(),upstream);
  if(playlist){
   const text=await upstream.text();
   const rewritten=rewritePlaylist(text,request.url,targetUrl.toString());
   return new Response(rewritten,{
    status:upstream.status,
    headers:responseHeaders(upstream,true)
   });
  }
  return new Response(upstream.body,{
   status:upstream.status,
   headers:responseHeaders(upstream,false)
  });
 }catch(error){
  log("Proxy failed",error?.message||String(error));
  return new Response(`Proxy error: ${error?.message||String(error)}`,{
   status:502,
   headers:{
    "Access-Control-Allow-Origin":"*",
    "Content-Type":"text/plain"
   }
  });
 }
}
