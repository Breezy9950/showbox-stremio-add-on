// netlify/functions/providers/moviebox.js

console.log("[MovieBox PROVIDER] TUI-SPOOF-2026-10-01-B");

const API_BASE = "https://api3.aoneroom.com";
const PLAYER_BASE = "https://moviebox.ph";

const PLAYER_USER_AGENT =
  "com.community.oneroom/50020120 (Linux; U; Android 13; en_US; 2201117TY; Build/TQ2A.230405.003; Cronet/135.0.7012.3)";

const HOST_POOL = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api6sg.aoneroom.com",
  "https://api.inmoviebox.com"
];

const KEY_B64_DEFAULT =
  "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";

const KEY_B64_ALT =
  "WHFuMm5uTzQxL0w5Mm04bVNMQQ==";

const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const TMDB_BASE = "https://api.themoviedb.org/3";

const TOKEN_URL =
  "https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1";

const PACKAGE_INFO = {
  package_name: "com.community.oneroom",
  version_name: "4.0.01.0813.03",
  version_code: 50020120
};

const ANDROID_VERSION = "13";
const BUILD = "TQ2A.230405.003";
const DEVICE = "2201117TY";

const SYSTEM_LANGUAGE = "en";
const NETWORK = "NETWORK_WIFI";
const REGION = "US";
const TIMEZONE = "Asia/Kolkata";
const INSTALL_STORE = "ps";
const SP_CODE = "40401";
const PLAY_MODE = "2";

const BRAND_MODELS = {
  Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
  Xiaomi: ["2201117TI", "M2012K11AI", "Redmi Note 11"],
  OnePlus: ["LE2111", "CPH2449", "IN2023"],
  Google: ["Pixel 6", "Pixel 7", "Pixel 8"],
  Realme: ["RMX3085", "RMX3360", "RMX3551"]
};

const SPOOF_IP_PREFIXES = [
  "103.241",
  "49.36",
  "117.195",
  "106.198",
  "122.162",
  "157.32",
  "182.70",
  "103.58",
  "27.60",
  "59.90"
];

let deviceId = "";
let selectedBrand = "";
let selectedModel = "";
let bearerToken = null;

function randomHex(length = 32) {
  let out = "";

  while (out.length < length) {
    out += Math.random().toString(16).slice(2);
  }

  return out.slice(0, length);
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function initializeSession() {
  if (!deviceId) {
    deviceId = randomHex(32);

    const brands = Object.keys(BRAND_MODELS);
    selectedBrand = brands[randomInt(brands.length)];

    const models = BRAND_MODELS[selectedBrand];
    selectedModel = models[randomInt(models.length)];
  }

  return {
    deviceId,
    brand: selectedBrand,
    model: selectedModel
  };
}

function generateSpoofedIp() {
  const prefix =
    SPOOF_IP_PREFIXES[randomInt(SPOOF_IP_PREFIXES.length)];

  return `${prefix}.${randomInt(256)}.${randomInt(256)}`;
}

const SPOOFED_IP = generateSpoofedIp();

function base64Encode(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function base64Decode(value) {
  return Buffer.from(value, "base64").toString("utf8");
}

function md5(input) {
  const crypto = require("crypto");
  return crypto.createHash("md5").update(input).digest("hex");
}

function hmacMd5(key, data) {
  const crypto = require("crypto");

  return crypto
    .createHmac("md5", key)
    .update(data)
    .digest("base64");
}

function getSecretKey(useAltKey = false) {
  const encoded = useAltKey
    ? KEY_B64_ALT
    : KEY_B64_DEFAULT;

  return Buffer.from(
    Buffer.from(encoded, "base64").toString("utf8"),
    "utf8"
  );
}

function generateXClientToken(timestamp) {
  const ts = String(timestamp);
  const reversed = ts.split("").reverse().join("");
  const hash = md5(`${ts}${reversed}`);

  return `${ts},${hash}`;
}

function buildCanonicalString(
  method,
  accept,
  contentType,
  url,
  body,
  timestamp
) {
  const urlObj = new URL(url);

  const params = [];

  for (const key of Array.from(urlObj.searchParams.keys()).sort()) {
    const values = urlObj.searchParams.getAll(key);

    for (const value of values) {
      params.push(`${key}=${value}`);
    }
  }

  const canonicalUrl =
    urlObj.pathname +
    (params.length ? `?${params.join("&")}` : "");

  let bodyHash = "";
  let bodyLength = "";

  if (body) {
    const bodyBuffer = Buffer.from(body, "utf8");

    bodyLength = String(bodyBuffer.length);
    bodyHash = md5(bodyBuffer);
  }

  return [
    method.toUpperCase(),
    accept || "",
    contentType || "",
    bodyLength,
    timestamp,
    bodyHash,
    canonicalUrl
  ].join("\n");
}

function generateXTrSignature(
  method,
  accept,
  contentType,
  url,
  body,
  useAltKey = false,
  customTimestamp = null
) {
  const timestamp =
    customTimestamp || Date.now();

  const canonical = buildCanonicalString(
    method,
    accept,
    contentType,
    url,
    body,
    timestamp
  );

  const signature = hmacMd5(
    getSecretKey(useAltKey),
    canonical
  );

  return `${timestamp}|2|${signature}`;
}

function decodeJwtExpiry(token) {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return 0;
    }

    let payload = parts[1];

    while (payload.length % 4) {
      payload += "=";
    }

    const decoded = JSON.parse(
      base64Decode(
        payload
          .replace(/-/g, "+")
          .replace(/_/g, "/")
      )
    );

    return Number(decoded.exp || 0);
  } catch {
    return 0;
  }
}

function isTokenValid(token) {
  if (!token) {
    return false;
  }

  const exp = decodeJwtExpiry(token);

  return exp > Math.floor(Date.now() / 1000) + 3600;
}

function getClientInfo() {
  const session = initializeSession();

  return {
    package_name: PACKAGE_INFO.package_name,
    version_name: PACKAGE_INFO.version_name,
    version_code: PACKAGE_INFO.version_code,

    os: "android",
    os_version: ANDROID_VERSION,

    device_id: session.deviceId,

    install_store: INSTALL_STORE,

    gaid: "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d",

    brand: session.brand.toLowerCase(),
    model: session.model,

    system_language: SYSTEM_LANGUAGE,
    net: NETWORK,
    region: REGION,
    timezone: TIMEZONE,

    sp_code: SP_CODE,

    "X-Play-Mode": PLAY_MODE
  };
}

async function movieBoxRequest(
  method,
  url,
  body = null,
  customHeaders = {},
  isTokenFetch = false
) {
  initializeSession();

  const timestamp = Date.now();

  const contentType =
    customHeaders["Content-Type"] ||
    (body
      ? "application/json; charset=utf-8"
      : "application/json");

  const accept =
    customHeaders["Accept"] ||
    "application/json";

  const xClientToken =
    generateXClientToken(timestamp);

  const xTrSignature =
    generateXTrSignature(
      method,
      accept,
      contentType,
      url,
      body,
      false,
      timestamp
    );

  const xClientInfo =
    JSON.stringify(getClientInfo());

  const headers = {
    Accept: accept,
    "Content-Type": contentType,
    "Accept-Language": "en-US,en;q=0.9",
    Connection: "keep-alive",

    "x-client-token": xClientToken,
    "x-tr-signature": xTrSignature,

    "User-Agent": PLAYER_USER_AGENT,

    "x-client-info": xClientInfo,
    "x-client-status": "0",

    "x-forwarded-for": SPOOFED_IP,

    "X-Play-Mode": PLAY_MODE,

    ...customHeaders
  };

  if (!isTokenFetch) {
    const token = await getCachedToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const originalUrl = new URL(url);

  const apiHosts = new Set(
    HOST_POOL.map(host => new URL(host).host)
  );

  let hosts;

  if (apiHosts.has(originalUrl.host)) {
    const ordered = [
      originalUrl.host,
      ...HOST_POOL.map(
        host => new URL(host).host
      ).filter(
        host => host !== originalUrl.host
      )
    ];

    hosts = [...new Set(ordered)];
  } else {
    hosts = [originalUrl.host];
  }

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];

    const requestUrl = new URL(url);
    requestUrl.host = host;

    console.log(
      `[MovieBox] ${method} ${requestUrl.host}${requestUrl.pathname}`
    );

    console.log(
      `[MovieBox] X-Forwarded-For: ${SPOOFED_IP}`
    );

    try {
      const options = {
        method,
        headers
      };

      if (body) {
        options.body = body;
      }

      const response =
        await fetch(
          requestUrl.toString(),
          options
        );

      if (!response.ok) {
        let errorBody = "";

        try {
          errorBody = await response.text();
        } catch {}

        console.log(
          `[MovieBox] Request failed: ${response.status} ${requestUrl.host}`
        );

        if (errorBody) {
          console.log(
            `[MovieBox] Error body: ${errorBody.slice(0, 1000)}`
          );
        }

        if (
          (
            response.status === 403 ||
            response.status === 429 ||
            response.status >= 500
          ) &&
          i < hosts.length - 1
        ) {
          continue;
        }

        return null;
      }

      const text = await response.text();

      let parsed;

      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }

      const xUser =
        response.headers.get("x-user");

      if (xUser) {
        try {
          const xUserJson =
            JSON.parse(xUser);

          if (
            xUserJson &&
            xUserJson.token &&
            isTokenValid(xUserJson.token)
          ) {
            bearerToken = xUserJson.token;
          }
        } catch {}
      }

      return {
        data: parsed,
        headers: response.headers
      };
    } catch (error) {
      console.log(
        `[MovieBox] Request error ${requestUrl.host}: ${error.message}`
      );

      if (i === hosts.length - 1) {
        return null;
      }
    }
  }

  return null;
}

async function getCachedToken() {
  if (isTokenValid(bearerToken)) {
    return bearerToken;
  }

  console.log(
    "[MovieBox] Fetching fresh anonymous token..."
  );

  const response =
    await movieBoxRequest(
      "GET",
      TOKEN_URL,
      null,
      {},
      true
    );

  if (!response) {
    return "";
  }

  const xUser =
    response.headers.get("x-user");

  if (xUser) {
    try {
      const xUserJson =
        JSON.parse(xUser);

      const token =
        xUserJson?.token;

      if (token && isTokenValid(token)) {
        bearerToken = token;

        console.log(
          "[MovieBox] Anonymous token accepted"
        );

        return token;
      }
    } catch {}
  }

  return bearerToken || "";
}

async function fetchTmdbDetails(
  tmdbId,
  mediaType
) {
  const url =
    `${TMDB_BASE}/${mediaType}/${tmdbId}` +
    `?api_key=${TMDB_API_KEY}` +
    `&append_to_response=external_ids`;

  const response =
    await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/154.0.0.0 Safari/537.36",
        Connection: "keep-alive"
      }
    });

  if (!response.ok) {
    throw new Error(
      `TMDB request failed: ${response.status}`
    );
  }

  const data = await response.json();

  return {
    title:
      data.title ||
      data.name ||
      "",

    year:
      (
        data.release_date ||
        data.first_air_date ||
        ""
      ).slice(0, 4),

    imdbId:
      data.external_ids?.imdb_id ||
      null,

    originalTitle:
      data.original_title ||
      data.original_name ||
      ""
  };
}

function normalizeTitle(title) {
  return String(title || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi,
      " "
    )
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchMovieBox(query) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;

  const body = JSON.stringify({
    page: 1,
    perPage: 20,
    keyword: query,
    restrictKid: 1
  });

  const response =
    await movieBoxRequest(
      "POST",
      url,
      body
    );

  if (!response?.data) {
    return [];
  }

  const results =
    response.data?.data?.results ||
    [];

  const subjects = [];

  for (const result of results) {
    if (Array.isArray(result?.subjects)) {
      subjects.push(...result.subjects);
    }
  }

  return subjects;
}

function findBestMatch(
  subjects,
  tmdbTitle,
  tmdbYear,
  mediaType
) {
  const targetType =
    mediaType === "movie" ? 1 : 2;

  const target =
    normalizeTitle(tmdbTitle);

  let best = null;
  let bestScore = 0;

  for (const subject of subjects) {
    if (
      subject?.subjectType != null &&
      Number(subject.subjectType) !== targetType
    ) {
      continue;
    }

    const candidate =
      normalizeTitle(
        subject.title ||
        subject.name ||
        ""
      );

    let score = 0;

    if (candidate === target) {
      score += 50;
    } else if (
      candidate.includes(target) ||
      target.includes(candidate)
    ) {
      score += 15;
    }

    const year = String(
      subject.releaseDate ||
      subject.releaseYear ||
      subject.year ||
      ""
    ).slice(0, 4);

    if (
      tmdbYear &&
      year &&
      String(tmdbYear) === year
    ) {
      score += 35;
    }

    if (score >= 40 && score > bestScore) {
      best = subject;
      bestScore = score;
    }
  }

  return best;
}

function getPlaybackPage(
  subjectData,
  subjectId
) {
  const detailPath =
    subjectData?.detailPath ||
    subjectData?.path ||
    subjectData?.slug ||
    "";

  const webBase =
    subjectData?.domains?.[0] ||
    PLAYER_BASE;

  const cleanBase =
    String(webBase).replace(/\/+$/, "");

  const pagePath =
    `/movies/${detailPath}`;

  const url =
    `${cleanBase}${pagePath}` +
    `?id=${encodeURIComponent(subjectId)}` +
    `&type=/movie/detail` +
    `&detailSe=` +
    `&detailEp=` +
    `&lang=en`;

  return {
    webBase: cleanBase,
    referer: url,
    url
  };
}

function getAudioLabel(language) {
  if (!language) {
    return "Unknown Audio";
  }

  const code =
    String(language).toLowerCase();

  const map = {
    en: "English",
    eng: "English",
    hi: "Hindi",
    hin: "Hindi",
    ta: "Tamil",
    tam: "Tamil",
    te: "Telugu",
    tel: "Telugu",
    ml: "Malayalam",
    mal: "Malayalam",
    kn: "Kannada",
    kan: "Kannada",
    bn: "Bengali",
    ben: "Bengali",
    ja: "Japanese",
    jpn: "Japanese",
    ko: "Korean",
    kor: "Korean",
    zh: "Chinese",
    zho: "Chinese",
    es: "Spanish",
    spa: "Spanish",
    fr: "French",
    fra: "French",
    de: "German",
    deu: "German",
    pt: "Portuguese",
    por: "Portuguese",
    ru: "Russian",
    rus: "Russian",
    it: "Italian",
    ita: "Italian"
  };

  return `${map[code] || language} Audio`;
}

function getStreamQuality(stream) {
  const value = [
    stream?.name,
    stream?.title,
    stream?.quality,
    stream?.resolution
  ]
    .filter(Boolean)
    .join(" ");

  const match =
    value.match(
      /\b(2160|1440|1080|720|576|540|480|360|240)p?\b/i
    );

  if (match) {
    return `${match[1]}p`;
  }

  if (
    /\b4k\b/i.test(value)
  ) {
    return "2160p";
  }

  if (
    /\borg\b/i.test(value) ||
    /\boriginal\b/i.test(value)
  ) {
    return "ORG";
  }

  return "Auto";
}

function detectFormat(url, stream = {}) {
  const text = [
    url,
    stream?.format,
    stream?.type,
    stream?.mimeType
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    text.includes(".mpd") ||
    text.includes("dash")
  ) {
    return "DASH";
  }

  if (
    text.includes(".m3u8") ||
    text.includes("hls")
  ) {
    return "HLS";
  }

  if (text.includes(".mp4")) {
    return "MP4";
  }

  if (text.includes(".mkv")) {
    return "MKV";
  }

  if (
    text.includes("video/")
  ) {
    return "VIDEO";
  }

  return "VIDEO";
}

function collectStreams(
  playData,
  output = []
) {
  const candidates = [];

  const add = value => {
    if (Array.isArray(value)) {
      for (const item of value) {
        add(item);
      }

      return;
    }

    if (value) {
      candidates.push(value);
    }
  };

  add(playData?.streams);
  add(playData?.netDash);
  add(playData?.netHls);

  for (const stream of candidates) {
    if (typeof stream === "string") {
      output.push({
        url: stream,
        raw: {
          url: stream
        }
      });

      continue;
    }

    if (
      typeof stream !== "object"
    ) {
      continue;
    }

    const url =
      stream.url ||
      stream.playUrl ||
      stream.resourceLink ||
      stream.streamUrl;

    if (!url) {
      continue;
    }

    output.push({
      url,
      raw: stream
    });
  }

  return output;
}

function signCookie(
  streamData
) {
  const cookie =
    streamData?.headers?.["Edge-Cache-Cookie"] ||
    streamData?.headers?.["edge-cache-cookie"] ||
    streamData?.headers?.["CloudFront-Policy"] ||
    streamData?.headers?.["cloudfront-policy"] ||
    streamData?.signCookie ||
    streamData?.cookie ||
    "";

  return cookie;
}

function extractPolicyResource(
  streamData
) {
  return (
    streamData?.resource ||
    streamData?.resourceUrl ||
    streamData?.url ||
    ""
  );
}

function getCookieHeader(
  streamData
) {
  const cookie =
    signCookie(streamData);

  if (!cookie) {
    return null;
  }

  if (
    cookie.includes("=")
  ) {
    return cookie;
  }

  return null;
}

async function fetchSubject(
  subjectId
) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/get` +
    `?subjectId=${encodeURIComponent(subjectId)}`;

  return movieBoxRequest(
    "GET",
    url
  );
}

async function fetchPlayInfo(
  subjectId,
  season = 0,
  episode = 0,
  detailPath = ""
) {
  let url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/play-info` +
    `?subjectId=${encodeURIComponent(subjectId)}` +
    `&se=${encodeURIComponent(season)}` +
    `&ep=${encodeURIComponent(episode)}` +
    `&streamSignType=1`;

  if (detailPath) {
    url +=
      `&detailPath=${encodeURIComponent(detailPath)}`;
  }

  url +=
    `&supportCodecs[hevc]=1` +
    `&supportCodecs[h264]=1`;

  const playbackHeaders = {
    Origin: PLAYER_BASE,
    Referer: PLAYER_BASE + "/",
    "User-Agent": PLAYER_USER_AGENT,
    "x-request-lang": "en",
    "x-vip-restrict": "0",
    "x-no-high-risk-restrict": "0"
  };

  return movieBoxRequest(
    "GET",
    url,
    null,
    playbackHeaders
  );
}

async function fetchCaptions(
  subjectId,
  streamId
) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions` +
    `?subjectId=${encodeURIComponent(subjectId)}` +
    `&streamId=${encodeURIComponent(streamId)}`;

  return movieBoxRequest(
    "GET",
    url
  );
}

async function fetchExternalCaptions(
  subjectId,
  resourceId
) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions` +
    `?subjectId=${encodeURIComponent(subjectId)}` +
    `&resourceId=${encodeURIComponent(resourceId)}` +
    `&episode=0`;

  return movieBoxRequest(
    "GET",
    url
  );
}

function normalizeCaption(
  caption
) {
  if (!caption) {
    return null;
  }

  const url =
    caption.url ||
    caption.webvttUrl ||
    caption.fileUrl ||
    caption.resourceUrl;

  if (!url) {
    return null;
  }

  return {
    url,
    lang:
      caption.language ||
      caption.lang ||
      caption.name ||
      "Unknown",
    name:
      caption.name ||
      caption.language ||
      "Subtitle",
    headers: {
      Referer: API_BASE + "/"
    }
  };
}

function addCaption(
  captions,
  caption
) {
  const normalized =
    normalizeCaption(caption);

  if (!normalized) {
    return;
  }

  const exists =
    captions.some(
      item =>
        item.url === normalized.url
    );

  if (!exists) {
    captions.push(normalized);
  }
}

function extractSubjectIds(
  subjectData,
  mainSubjectId
) {
  const ids = [mainSubjectId];

  const dubs =
    subjectData?.dubs ||
    subjectData?.dubList ||
    subjectData?.dubSubjects ||
    [];

  if (Array.isArray(dubs)) {
    for (const dub of dubs) {
      const id =
        dub?.subjectId ||
        dub?.id;

      if (
        id &&
        !ids.includes(String(id))
      ) {
        ids.push(String(id));
      }
    }
  }

  return ids;
}

function getSubjectMediaTitle(
  subjectData,
  fallback
) {
  return (
    subjectData?.title ||
    subjectData?.name ||
    fallback
  );
}

function extractEpisodeStreams(
  playResponse
) {
  const data =
    playResponse?.data;

  if (!data) {
    return [];
  }

  return collectStreams(
    data,
    []
  );
}

function streamUrlLooksBlocked(
  url
) {
  if (!url) {
    return true;
  }

  if (
    url.includes(
      "b164fbfb4347792950bdfbfb563d39d9"
    )
  ) {
    return true;
  }

  if (
    url.includes(
      "/other/2026/09/"
    )
  ) {
    return true;
  }

  return false;
}

async function getStreams({
  imdbId,
  type,
  season,
  episode,
  token
}) {
  console.log(
    `[MovieBox] Resolving IMDb ${imdbId} -> TMDB`
  );

  console.log(
    `[MovieBox] Client: ${PACKAGE_INFO.package_name}/${PACKAGE_INFO.version_code}`
  );

  console.log(
    `[MovieBox] Device: ${DEVICE} Android ${ANDROID_VERSION}`
  );

  console.log(
    `[MovieBox] Region: ${REGION} | Timezone: ${TIMEZONE}`
  );

  console.log(
    `[MovieBox] X-Forwarded-For: ${SPOOFED_IP}`
  );

  const mediaType =
    type === "movie"
      ? "movie"
      : "tv";

  const tmdb =
    await fetchTmdbDetails(
      imdbId,
      mediaType
    );

  const query =
    tmdb.title ||
    tmdb.originalTitle ||
    "";

  console.log(
    `[MovieBox] Searching: ${query}`
  );

  const subjects =
    await searchMovieBox(query);

  const matched =
    findBestMatch(
      subjects,
      tmdb.title ||
        tmdb.originalTitle,
      tmdb.year,
      mediaType
    );

  if (!matched) {
    console.log(
      `[MovieBox] No match found for ${query}`
    );

    return [];
  }

  console.log(
    `[MovieBox] Matched: ${matched.title || matched.name || query}`
  );

  const mainSubjectId =
    String(
      matched.subjectId ||
      matched.id
    );

  if (!mainSubjectId) {
    return [];
  }

  const subjectResponse =
    await fetchSubject(
      mainSubjectId
    );

  const subjectData =
    subjectResponse?.data ||
    {};

  const playbackPage =
    getPlaybackPage(
      subjectData,
      mainSubjectId
    );

  const subjectIds =
    extractSubjectIds(
      subjectData,
      mainSubjectId
    );

  const captions = [];

  const finalStreams = [];
  const seenUrls = new Set();

  const currentSeason =
    Number(season || 0);

  const currentEpisode =
    Number(episode || 0);

  for (const subjectId of subjectIds) {
    const playResponse =
      await fetchPlayInfo(
        subjectId,
        currentSeason,
        currentEpisode,
        subjectData?.detailPath ||
          subjectData?.path ||
          subjectData?.slug ||
          ""
      );

    if (!playResponse) {
      continue;
    }

    const streamItems =
      extractEpisodeStreams(
        playResponse
      );

    for (const item of streamItems) {
      const raw = item.raw || {};

      let finalStreamUrl =
        extractPolicyResource(raw) ||
        item.url;

      if (
        !finalStreamUrl ||
        streamUrlLooksBlocked(
          finalStreamUrl
        )
      ) {
        continue;
      }

      /*
       * Signed-resource handling.
       */
      if (
        raw?.url &&
        raw.url.endsWith("/index.mpd") &&
        raw?.resource
      ) {
        finalStreamUrl =
          raw.resource;
      }

      const quality =
        getStreamQuality(raw);

      const formatType =
        detectFormat(
          finalStreamUrl,
          raw
        );

      const language =
        raw.language ||
        raw.audioLanguage ||
        raw.lang ||
        raw.dubLanguage ||
        subjectData?.language ||
        "";

      const audioLabel =
        getAudioLabel(language);

      const streamId =
        raw.streamId ||
        raw.id ||
        raw.resourceId ||
        "";

      /*
       * Stream captions.
       */
      if (streamId) {
        try {
          const captionResponse =
            await fetchCaptions(
              subjectId,
              streamId
            );

          const captionData =
            captionResponse?.data;

          const captionList =
            Array.isArray(captionData)
              ? captionData
              : (
                captionData?.captions ||
                captionData?.data ||
                []
              );

          if (Array.isArray(captionList)) {
            for (const caption of captionList) {
              addCaption(
                captions,
                caption
              );
            }
          }
        } catch {}
      }

      /*
       * External captions.
       */
      const resourceId =
        raw.resourceId ||
        raw.id ||
        streamId;

      if (resourceId) {
        try {
          const externalResponse =
            await fetchExternalCaptions(
              subjectId,
              resourceId
            );

          const externalData =
            externalResponse?.data;

          const externalList =
            Array.isArray(externalData)
              ? externalData
              : (
                externalData?.captions ||
                externalData?.data ||
                []
              );

          if (
            Array.isArray(externalList)
          ) {
            for (
              const caption of externalList
            ) {
              addCaption(
                captions,
                caption
              );
            }
          }
        } catch {}
      }

      const cookie =
        getCookieHeader(raw);

      const streamHeaders = {
        Origin: playbackPage.webBase,
        Referer: playbackPage.referer,
        "User-Agent": PLAYER_USER_AGENT,
        "x-request-lang": "en",
        "x-vip-restrict": "0",
        "x-no-high-risk-restrict": "0"
      };

      if (cookie) {
        streamHeaders.Cookie = cookie;
      }

      const dedupeKey =
        `${finalStreamUrl}|${audioLabel}`;

      if (seenUrls.has(dedupeKey)) {
        continue;
      }

      seenUrls.add(dedupeKey);

      /*
       * FINAL STREAM DIAGNOSTIC
       *
       * Deliberately logs only the beginning of the URL
       * because signed URLs can contain very long tokens.
       */
      console.log(
        "[MovieBox STREAM DEBUG]",
        JSON.stringify({
          url:
            finalStreamUrl.slice(0, 300),
          urlLength:
            finalStreamUrl.length,
          quality,
          format: formatType,
          audio: audioLabel,
          streamId:
            streamId || null,
          resourceId:
            resourceId || null,
          hasCookie:
            Boolean(cookie),
          headers: streamHeaders
        })
      );

      const mediaTitle =
        getSubjectMediaTitle(
          subjectData,
          tmdb.title || query
        );

      const title =
        `${mediaTitle}` +
        (
          currentSeason > 0
            ? ` S${currentSeason}E${currentEpisode}`
            : ""
        ) +
        ` - ${quality}` +
        ` (${audioLabel})` +
        ` [${formatType}]`;

      finalStreams.push({
        name: "MovieBox",
        title,
        url: finalStreamUrl,
        quality,
        headers: streamHeaders,
        subtitles: captions,
        provider: "moviebox"
      });
    }
  }

  console.log(
    `[MovieBox] Returning ${finalStreams.length} streams`
  );

  return finalStreams;
}

module.exports = {
  getStreams
};
