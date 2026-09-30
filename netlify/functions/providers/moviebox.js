console.log("[MovieBox PROVIDER] TUI-SPOOF-2026-10-01-B");

import CryptoJS from "crypto-js";

/* =========================================================
   CONFIG
========================================================= */

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
  "WHFuMm5uTzQxL0w5Mm04bVNMQQ==".replace(
    "Mm04bVNMQQ==",
    "Mm04bVNMQQ=="
  );

const SECRET_KEY_DEFAULT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_DEFAULT).toString(CryptoJS.enc.Utf8)
);

const SECRET_KEY_ALT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_ALT).toString(CryptoJS.enc.Utf8)
);

const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const TOKEN_URL =
  "https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1";

const PACKAGE_NAME = "com.community.oneroom";
const VERSION_NAME = "4.0.01.0813.03";
const VERSION_CODE = "50020120";

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

const BRAND_MODELS = {
  Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
  Xiaomi: ["2201117TI", "M2012K11AI", "Redmi Note 11"],
  OnePlus: ["LE2111", "CPH2449", "IN2023"],
  Google: ["Pixel 6", "Pixel 7", "Pixel 8"],
  Realme: ["RMX3085", "RMX3360", "RMX3551"]
};

/* =========================================================
   RANDOM CLIENT IDENTITY
========================================================= */

function randomHex(length) {
  let out = "";

  while (out.length < length) {
    out += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0");
  }

  return out.slice(0, length);
}

function randomUuid() {
  return crypto.randomUUID();
}

function randomSpoofedIp() {
  const prefix =
    SPOOF_IP_PREFIXES[
      Math.floor(Math.random() * SPOOF_IP_PREFIXES.length)
    ];

  const a = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);

  return `${prefix}.${a}.${b}`;
}

let deviceId = "";
let gaid = "";
let selectedBrand = "";
let selectedModel = "";
let bearerToken = null;
let SPOOFED_IP = "";

function initializeSession() {
  if (deviceId) return;

  deviceId = randomHex(32);
  gaid = randomUuid();

  const brands = Object.keys(BRAND_MODELS);

  selectedBrand =
    brands[Math.floor(Math.random() * brands.length)];

  const models = BRAND_MODELS[selectedBrand];

  selectedModel =
    models[Math.floor(Math.random() * models.length)];

  SPOOFED_IP = randomSpoofedIp();
}

/* =========================================================
   JWT
========================================================= */

function decodeJwtExpiry(token) {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) return 0;

    const payload = JSON.parse(
      CryptoJS.enc.Base64.parse(parts[1]).toString(
        CryptoJS.enc.Utf8
      )
    );

    return Number(payload.exp || 0);
  } catch {
    return 0;
  }
}

function isTokenValid(token) {
  if (!token) return false;

  const exp = decodeJwtExpiry(token);

  return exp > Math.floor(Date.now() / 1000) + 3600;
}

/* =========================================================
   CRYPTO
========================================================= */

function md5(input) {
  return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function hmacMd5(key, data) {
  return CryptoJS.HmacMD5(data, key).toString(
    CryptoJS.enc.Base64
  );
}

function generateXClientToken(timestamp) {
  const ts = String(timestamp);

  const reversed = ts
    .split("")
    .reverse()
    .join("");

  const hash = md5(reversed);

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

  const keys = [...urlObj.searchParams.keys()].sort();

  for (const key of keys) {
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
    const bodyWordArray = CryptoJS.enc.Utf8.parse(body);

    bodyLength = bodyWordArray.sigBytes;

    bodyHash = CryptoJS.MD5(bodyWordArray).toString(
      CryptoJS.enc.Hex
    );
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
  const timestamp = customTimestamp || Date.now();

  const canonical = buildCanonicalString(
    method,
    accept,
    contentType,
    url,
    body,
    timestamp
  );

  const secret = useAltKey
    ? SECRET_KEY_ALT
    : SECRET_KEY_DEFAULT;

  const signature = hmacMd5(secret, canonical);

  return `${timestamp}|2|${signature}`;
}

/* =========================================================
   CLIENT INFO
========================================================= */

function buildClientInfo() {
  initializeSession();

  return JSON.stringify({
    package_name: PACKAGE_NAME,
    version_name: VERSION_NAME,
    version_code: VERSION_CODE,
    os: "android",
    os_version: "13",
    build: "TQ2A.230405.003",
    device_id: deviceId,
    install_store: "ps",
    install_ch: "ps",
    gaid,
    brand: selectedBrand.toLowerCase(),
    model: selectedModel,
    system_language: "en",
    net: "NETWORK_WIFI",
    region: "US",
    timezone: "Asia/Kolkata",
    sp_code: "40401"
  });
}

/* =========================================================
   HTTP REQUEST
========================================================= */

async function movieBoxRequest(
  method,
  url,
  body = null,
  customHeaders = {},
  isTokenFetch = false
) {
  initializeSession();

  const timestamp = Date.now();

  const headerContentType =
    customHeaders["Content-Type"] ||
    (body
      ? "application/json; charset=utf-8"
      : "application/json");

  const accept =
    customHeaders["Accept"] ||
    "application/json";

  const xClientToken =
    generateXClientToken(timestamp);

  const xTrSignature = generateXTrSignature(
    method,
    accept,
    headerContentType,
    url,
    body,
    false,
    timestamp
  );

  const headers = {
    Accept: accept,
    "Content-Type": headerContentType,
    "User-Agent": PLAYER_USER_AGENT,
    "x-client-token": xClientToken,
    "x-tr-signature": xTrSignature,
    "x-client-info": buildClientInfo(),
    "x-forwarded-for": SPOOFED_IP,
    "X-Play-Mode": "2",
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
    HOST_POOL.map((host) => new URL(host).host)
  );

  let hosts;

  if (apiHosts.has(originalUrl.host)) {
    hosts = [
      originalUrl.host,
      ...HOST_POOL
        .map((host) => new URL(host).host)
        .filter((host) => host !== originalUrl.host)
    ];
  } else {
    hosts = [originalUrl.host];
  }

  for (let attempt = 0; attempt < hosts.length; attempt++) {
    const requestUrl = new URL(url);

    requestUrl.host = hosts[attempt];

    console.log(
      `[MovieBox] ${method.toUpperCase()} ${requestUrl.host}${requestUrl.pathname}`
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

      const res = await fetch(
        requestUrl.toString(),
        options
      );

      if (!res.ok) {
        let errorBody = "";

        try {
          errorBody = await res.text();
        } catch {}

        console.log(
          `[MovieBox] Request failed: ${res.status} ${requestUrl.host}`
        );

        if (errorBody) {
          console.log(
            `[MovieBox] Error body: ${errorBody.slice(
              0,
              500
            )}`
          );
        }

        if (
          attempt < hosts.length - 1 &&
          (
            res.status === 403 ||
            res.status === 429 ||
            res.status >= 500
          )
        ) {
          continue;
        }

        return null;
      }

      const text = await res.text();

      let parsed = null;

      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }

      const xUser = res.headers.get("x-user");

      if (xUser) {
        try {
          const xUserJson = JSON.parse(xUser);

          if (
            xUserJson?.token &&
            isTokenValid(xUserJson.token)
          ) {
            bearerToken = xUserJson.token;
          }
        } catch {}
      }

      return {
        data: parsed,
        headers: res.headers
      };
    } catch (error) {
      console.log(
        `[MovieBox] Request error: ${
          error?.message || error
        }`
      );

      if (attempt === hosts.length - 1) {
        return null;
      }
    }
  }

  return null;
}

/* =========================================================
   TOKEN
========================================================= */

async function getCachedToken() {
  initializeSession();

  if (isTokenValid(bearerToken)) {
    return bearerToken;
  }

  console.log(
    "[MovieBox] Fetching fresh anonymous token..."
  );

  const response = await movieBoxRequest(
    "GET",
    TOKEN_URL,
    null,
    {},
    true
  );

  if (!response) {
    return bearerToken || "";
  }

  const xUser =
    response.headers?.get("x-user");

  if (xUser) {
    try {
      const xUserJson = JSON.parse(xUser);

      if (
        xUserJson?.token &&
        isTokenValid(xUserJson.token)
      ) {
        bearerToken = xUserJson.token;

        console.log(
          "[MovieBox] Anonymous token accepted"
        );

        return bearerToken;
      }
    } catch {}
  }

  return bearerToken || "";
}

/* =========================================================
   TMDB
========================================================= */

async function resolveImdbToTmdb(
  imdbId,
  mediaType
) {
  const url =
    `${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}` +
    `?api_key=${TMDB_API_KEY}` +
    `&external_source=imdb_id`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/131.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      console.log(
        `[MovieBox] TMDB find failed: ${response.status}`
      );

      return null;
    }

    const data = await response.json();

    const results =
      mediaType === "tv"
        ? data.tv_results || []
        : data.movie_results || [];

    if (!results.length) return null;

    return results[0].id;
  } catch (error) {
    console.log(
      `[MovieBox] TMDB resolve error: ${
        error?.message || error
      }`
    );

    return null;
  }
}

async function fetchTmdbDetails(
  tmdbId,
  mediaType
) {
  const url =
    `${TMDB_BASE_URL}/${mediaType}/${tmdbId}` +
    `?api_key=${TMDB_API_KEY}` +
    `&append_to_response=external_ids`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/131.0.0.0 Safari/537.36",
        Connection: "keep-alive"
      }
    });

    if (!response.ok) {
      console.log(
        `[MovieBox] TMDB details failed: ${response.status}`
      );

      return null;
    }

    const data = await response.json();

    const title =
      mediaType === "tv"
        ? data.name
        : data.title;

    const originalTitle =
      mediaType === "tv"
        ? data.original_name
        : data.original_title;

    const releaseDate =
      mediaType === "tv"
        ? data.first_air_date
        : data.release_date;

    const year =
      releaseDate
        ? Number(String(releaseDate).slice(0, 4))
        : 0;

    const imdbId =
      data.external_ids?.imdb_id || null;

    return {
      title,
      originalTitle,
      year,
      imdbId
    };
  } catch (error) {
    console.log(
      `[MovieBox] TMDB details error: ${
        error?.message || error
      }`
    );

    return null;
  }
}

/* =========================================================
   SEARCH
========================================================= */

function normalizeTitle(title) {
  return String(title || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi,
      " "
    )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
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

  const response = await movieBoxRequest(
    "POST",
    url,
    body
  );

  if (!response?.data) {
    return [];
  }

  const results =
    response.data?.data?.results || [];

  const subjects = [];

  for (const result of results) {
    for (const subject of result?.subjects || []) {
      subjects.push(subject);
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

  const target = normalizeTitle(tmdbTitle);

  let best = null;
  let bestScore = 0;

  for (const subject of subjects) {
    const subjectType = Number(
      subject.subjectType ??
      subject.type ??
      subject.subject_type
    );

    if (
      subjectType &&
      subjectType !== targetType
    ) {
      continue;
    }

    const subjectTitle =
      subject.title ||
      subject.name ||
      subject.subjectName ||
      "";

    const normalized =
      normalizeTitle(subjectTitle);

    let score = 0;

    if (normalized === target) {
      score += 50;
    } else if (
      normalized.includes(target) ||
      target.includes(normalized)
    ) {
      score += 15;
    }

    const subjectYear = Number(
      subject.releaseYear ||
      subject.release_year ||
      subject.year ||
      String(
        subject.releaseDate ||
        subject.release_date ||
        ""
      ).slice(0, 4)
    );

    if (
      tmdbYear &&
      subjectYear &&
      tmdbYear === subjectYear
    ) {
      score += 35;
    }

    if (score >= 40 && score > bestScore) {
      bestScore = score;
      best = subject;
    }
  }

  return best;
}

/* =========================================================
   PLAYBACK PAGE
========================================================= */

function getPlaybackPage(
  subjectData,
  subjectId
) {
  const detailPath =
    subjectData?.detailPath ||
    subjectData?.detail_path ||
    subjectData?.path ||
    subjectData?.slug;

  let webBase = PLAYER_BASE;

  const domain =
    subjectData?.detailDomain ||
    subjectData?.webDomain ||
    subjectData?.webUrl;

  if (domain) {
    try {
      webBase = new URL(domain).origin;
    } catch {}
  }

  if (
    subjectData?.detailUrl ||
    subjectData?.shareUrl
  ) {
    try {
      webBase = new URL(
        subjectData.detailUrl ||
          subjectData.shareUrl
      ).origin;
    } catch {}
  }

  const safePath =
    detailPath
      ? String(detailPath).replace(/^\/+/, "")
      : `movies/detail/${subjectId}`;

  const referer =
    `${webBase}/${safePath}` +
    `?id=${encodeURIComponent(subjectId)}` +
    `&type=%2Fmovie%2Fdetail` +
    `&detailSe=` +
    `&detailEp=` +
    `&lang=en`;

  return {
    webBase,
    referer
  };
}

/* =========================================================
   STREAM COLLECTION
========================================================= */

function collectStreams(playData) {
  const output = [];

  function add(value, extra = {}) {
    if (!value) return;

    if (typeof value === "string") {
      output.push({
        url: value,
        ...extra
      });

      return;
    }

    if (typeof value !== "object") return;

    const url =
      value.url ||
      value.playUrl ||
      value.resourceLink ||
      value.streamUrl ||
      value.play_url ||
      value.resource_link ||
      value.stream_url;

    if (url) {
      output.push({
        ...value,
        url,
        ...extra
      });
    }
  }

  for (const stream of playData?.streams || []) {
    add(stream);
  }

  for (const stream of playData?.netDash || []) {
    add(stream, {
      sourceType: "dash"
    });
  }

  for (const stream of playData?.netHls || []) {
    add(stream, {
      sourceType: "hls"
    });
  }

  if (
    playData?.netDash &&
    !Array.isArray(playData.netDash)
  ) {
    for (const [key, value] of Object.entries(
      playData.netDash
    )) {
      add(value, {
        sourceType: "dash",
        mapKey: key
      });
    }
  }

  if (
    playData?.netHls &&
    !Array.isArray(playData.netHls)
  ) {
    for (const [key, value] of Object.entries(
      playData.netHls
    )) {
      add(value, {
        sourceType: "hls",
        mapKey: key
      });
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const stream of output) {
    if (!stream.url) continue;

    const key = stream.url;

    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(stream);
  }

  return deduped;
}

/* =========================================================
   AUDIO
========================================================= */

function getAudioLabel(stream) {
  const code =
    stream?.language ||
    stream?.lang ||
    stream?.audioLanguage ||
    stream?.audio_language ||
    stream?.languageCode ||
    stream?.language_code;

  if (!code) {
    return "Original Audio";
  }

  const normalized =
    String(code).toLowerCase();

  const languages = {
    en: "English",
    eng: "English",
    hi: "Hindi",
    hin: "Hindi",
    ta: "Tamil",
    tam: "Tamil",
    te: "Telugu",
    tel: "Telugu",
    kn: "Kannada",
    kan: "Kannada",
    ml: "Malayalam",
    mal: "Malayalam",
    pt: "Portuguese",
    "pt-br": "Ptbr",
    ptbr: "Ptbr",
    es: "Spanish",
    spa: "Spanish",
    fr: "French",
    fra: "French",
    de: "German",
    deu: "German",
    ja: "Japanese",
    jpn: "Japanese",
    ko: "Korean",
    kor: "Korean",
    zh: "Chinese",
    zho: "Chinese"
  };

  const name =
    languages[normalized] ||
    String(code);

  return `${name} Audio`;
}

/* =========================================================
   SIGNED RESOURCE
========================================================= */

function extractPolicyResource(signCookie) {
  if (!signCookie) return null;

  try {
    const match =
      String(signCookie).match(
        /urlprefix=([^;]+)/i
      );

    if (match?.[1]) {
      const prefix = decodeURIComponent(
        match[1]
      );

      if (
        prefix.startsWith("http://") ||
        prefix.startsWith("https://")
      ) {
        return prefix.endsWith("/")
          ? `${prefix}index.mpd`
          : `${prefix}/index.mpd`;
      }
    }

    const cloudFrontMatch =
      String(signCookie).match(
        /CloudFront-Policy=([^;]+)/i
      );

    if (cloudFrontMatch) {
      return null;
    }
  } catch {}

  return null;
}

/* =========================================================
   NEW DIAGNOSTIC:
   TEST SIGNED DASH MPD FROM NETLIFY
========================================================= */

async function testDashAccess(
  url,
  signCookie,
  playbackHeaders
) {
  if (!url || !url.includes(".mpd")) {
    return;
  }

  console.log(
    `[MovieBox DASH TEST] Testing MPD from Netlify: ${url.slice(
      0,
      300
    )}`
  );

  const headers = {
    Accept:
      "application/dash+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      playbackHeaders?.["User-Agent"] ||
      PLAYER_USER_AGENT,
    Origin:
      playbackHeaders?.Origin ||
      "https://moviebox.ph",
    Referer:
      playbackHeaders?.Referer ||
      "https://moviebox.ph/",
    "X-Play-Mode": "2"
  };

  if (signCookie) {
    headers.Cookie = signCookie;
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 8000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    const contentType =
      response.headers.get("content-type") || "";

    const contentLength =
      response.headers.get("content-length") || "";

    const text =
      response.ok
        ? await response.text()
        : "";

    console.log(
      `[MovieBox DASH TEST] status=${response.status} content-type=${contentType} content-length=${contentLength} bodyLength=${text.length} hasMPD=${text.includes("<MPD")}`
    );

    if (!response.ok) {
      try {
        const errorText =
          await response.text();

        console.log(
          `[MovieBox DASH TEST] Error body: ${errorText.slice(
            0,
            300
          )}`
        );
      } catch {}
    }
  } catch (error) {
    console.log(
      `[MovieBox DASH TEST] FAILED: ${
        error?.name || "Error"
      } ${error?.message || error}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   CAPTIONS
========================================================= */

async function getCaptions(
  subjectId,
  stream
) {
  const subtitles = [];

  try {
    const streamId =
      stream?.streamId ||
      stream?.stream_id ||
      stream?.id;

    if (streamId) {
      const url =
        `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions` +
        `?subjectId=${encodeURIComponent(subjectId)}` +
        `&streamId=${encodeURIComponent(streamId)}`;

      const response =
        await movieBoxRequest("GET", url);

      const captions =
        response?.data?.data ||
        response?.data?.captions ||
        response?.data ||
        [];

      if (Array.isArray(captions)) {
        for (const caption of captions) {
          const captionUrl =
            caption?.url ||
            caption?.captionUrl ||
            caption?.caption_url;

          if (!captionUrl) continue;

          subtitles.push({
            url: captionUrl,
            language:
              caption?.language ||
              caption?.lang ||
              "Unknown",
            name:
              caption?.name ||
              caption?.language ||
              "Subtitle",
            headers: {
              Referer: API_BASE
            }
          });
        }
      }
    }
  } catch {}

  try {
    const resourceId =
      stream?.resourceId ||
      stream?.resource_id;

    if (resourceId) {
      const url =
        `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions` +
        `?subjectId=${encodeURIComponent(subjectId)}` +
        `&resourceId=${encodeURIComponent(resourceId)}` +
        `&episode=0`;

      const response =
        await movieBoxRequest("GET", url);

      const captions =
        response?.data?.data ||
        response?.data?.captions ||
        response?.data ||
        [];

      if (Array.isArray(captions)) {
        for (const caption of captions) {
          const captionUrl =
            caption?.url ||
            caption?.captionUrl ||
            caption?.caption_url;

          if (!captionUrl) continue;

          subtitles.push({
            url: captionUrl,
            language:
              caption?.language ||
              caption?.lang ||
              "Unknown",
            name:
              caption?.name ||
              caption?.language ||
              "Subtitle",
            headers: {
              Referer: API_BASE
            }
          });
        }
      }
    }
  } catch {}

  const seen = new Set();

  return subtitles.filter((subtitle) => {
    if (!subtitle.url) return false;

    if (seen.has(subtitle.url)) {
      return false;
    }

    seen.add(subtitle.url);

    return true;
  });
}

/* =========================================================
   QUALITY / FORMAT
========================================================= */

function detectQuality(stream, url) {
  const text = [
    stream?.quality,
    stream?.resolution,
    stream?.name,
    stream?.title,
    url
  ]
    .filter(Boolean)
    .join(" ");

  const match = text.match(
    /(?:^|[^0-9])(2160|1440|1080|720|576|480|360)p?(?:[^0-9]|$)/i
  );

  if (match) {
    return `${match[1]}p`;
  }

  if (/4k|uhd/i.test(text)) {
    return "2160p";
  }

  return "Auto";
}

function detectFormat(url) {
  const value =
    String(url || "").toLowerCase();

  if (
    value.includes(".mpd") ||
    value.includes("/dash/")
  ) {
    return "DASH";
  }

  if (
    value.includes(".m3u8") ||
    value.includes("/hls/")
  ) {
    return "HLS";
  }

  if (value.includes(".mp4")) {
    return "MP4";
  }

  if (value.includes(".mkv")) {
    return "MKV";
  }

  return "VIDEO";
}

/* =========================================================
   PLAYBACK
========================================================= */

async function getStreamLinks(
  subjectData,
  subjectId,
  mediaTitle,
  season,
  episode
) {
  const playbackPage =
    getPlaybackPage(
      subjectData,
      subjectId
    );

  const detailUrl =
    `${API_BASE}/wefeed-mobile-bff/subject-api/get` +
    `?subjectId=${encodeURIComponent(subjectId)}`;

  const detailResponse =
    await movieBoxRequest(
      "GET",
      detailUrl
    );

  const detailData =
    detailResponse?.data?.data ||
    detailResponse?.data ||
    subjectData ||
    {};

  const dubs =
    detailData?.dubs ||
    detailData?.dubList ||
    [];

  const subjectIds = [subjectId];

  if (Array.isArray(dubs)) {
    for (const dub of dubs) {
      const dubSubjectId =
        dub?.subjectId ||
        dub?.subject_id;

      if (
        dubSubjectId &&
        !subjectIds.includes(dubSubjectId)
      ) {
        subjectIds.push(dubSubjectId);
      }
    }
  }

  const playbackHeaders = {
    Origin: playbackPage.webBase,
    Referer: playbackPage.referer,
    "User-Agent": PLAYER_USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
    "x-request-lang": "en",
    "x-vip-restrict": "0",
    "x-no-high-risk-restrict": "0",
    "X-Play-Mode": "2"
  };

  const allStreams = [];

  for (const currentSubjectId of subjectIds) {
    const playInfoUrl =
      `${API_BASE}/wefeed-mobile-bff/subject-api/play-info` +
      `?subjectId=${encodeURIComponent(
        currentSubjectId
      )}` +
      `&se=${encodeURIComponent(
        season || 0
      )}` +
      `&ep=${encodeURIComponent(
        episode || 0
      )}` +
      `&streamSignType=1` +
      (
        playbackPage
          ? `&detailPath=${encodeURIComponent(
              String(
                subjectData?.detailPath ||
                subjectData?.detail_path ||
                subjectData?.path ||
                subjectData?.slug ||
                ""
              )
            )}`
          : ""
      ) +
      `&supportCodecs[hevc]=1` +
      `&supportCodecs[h264]=1`;

    const response =
      await movieBoxRequest(
        "GET",
        playInfoUrl,
        null,
        playbackHeaders
      );

    const playData =
      response?.data?.data ||
      response?.data ||
      {};

    const streamsList =
      collectStreams(playData);

    for (const stream of streamsList) {
      const rawStreamUrl =
        stream?.url ||
        stream?.playUrl ||
        stream?.resourceLink ||
        stream?.streamUrl;

      if (!rawStreamUrl) continue;

      const signCookie =
        stream?.signCookie ||
        stream?.sign_cookie ||
        null;

      const policyUrl =
        extractPolicyResource(
          signCookie
        );

      const finalStreamUrl =
        policyUrl ||
        rawStreamUrl;

      if (
        finalStreamUrl.includes(
          "b164fbfb4347792950bdfbfb563d39d9"
        )
      ) {
        continue;
      }

      if (
        finalStreamUrl.includes(
          "/other/2026/09/"
        )
      ) {
        continue;
      }

      const quality =
        detectQuality(
          stream,
          finalStreamUrl
        );

      const formatType =
        detectFormat(
          finalStreamUrl
        );

      const audioLabel =
        getAudioLabel(stream);

      const subtitles =
        await getCaptions(
          currentSubjectId,
          stream
        );

      const signHeaderKey =
        stream?.signHeaderKey ||
        stream?.sign_header_key ||
        "Cookie";

      const finalHeaders = {
        ...playbackHeaders,
        ...(signCookie
          ? {
              [signHeaderKey]:
                signCookie
            }
          : {})
      };

      /*
       * NEW DIAGNOSTIC:
       * Only test actual signed DASH streams.
       *
       * This does NOT change the stream.
       * It simply asks Netlify whether the MPD can be
       * fetched with the same Cookie that we return
       * to Stremio.
       */
      if (
        finalStreamUrl.includes(".mpd") &&
        signCookie
      ) {
        await testDashAccess(
          finalStreamUrl,
          signCookie,
          playbackHeaders
        );
      }

      console.log(
        "[MovieBox STREAM DEBUG]",
        JSON.stringify({
          urlPreview:
            finalStreamUrl.slice(0, 300),
          urlLength:
            finalStreamUrl.length,
          hostname:
            (() => {
              try {
                return new URL(
                  finalStreamUrl
                ).hostname;
              } catch {
                return "";
              }
            })(),
          pathname:
            (() => {
              try {
                return new URL(
                  finalStreamUrl
                ).pathname;
              } catch {
                return "";
              }
            })(),
          quality,
          format: formatType,
          audio: audioLabel,
          streamId:
            stream?.streamId ||
            stream?.stream_id ||
            stream?.id ||
            null,
          rawStreamUrl,
          hasSignCookie:
            !!signCookie,
          signHeaderKey,
          headers: {
            ...finalHeaders,
            ...(signCookie
              ? {
                  [signHeaderKey]:
                    "[REDACTED]"
                }
              : {})
          }
        })
      );

      allStreams.push({
        name: "MovieBox",

        title:
          `${mediaTitle}` +
          (
            season > 0
              ? ` S${season}E${episode}`
              : ""
          ) +
          ` - ${quality} (${audioLabel}) [${formatType}]`,

        url: finalStreamUrl,

        quality,

        headers: finalHeaders,

        subtitles,

        provider: "moviebox"
      });
    }

    /*
     * Resource detector fallback.
     *
     * These are the direct signed MP4 streams that
     * have already been observed to work.
     */
    const resources =
      playData?.resourceList ||
      playData?.resources ||
      playData?.resource_list ||
      [];

    if (Array.isArray(resources)) {
      for (const resource of resources) {
        const resourceUrl =
          resource?.url ||
          resource?.playUrl ||
          resource?.resourceLink ||
          resource?.streamUrl;

        if (!resourceUrl) continue;

        const quality =
          detectQuality(
            resource,
            resourceUrl
          );

        const formatType =
          detectFormat(resourceUrl);

        const audioLabel =
          getAudioLabel(resource);

        const subtitles =
          await getCaptions(
            currentSubjectId,
            resource
          );

        console.log(
          "[MovieBox STREAM DEBUG]",
          JSON.stringify({
            urlPreview:
              resourceUrl.slice(0, 300),
            urlLength:
              resourceUrl.length,
            quality,
            format: formatType,
            audio: audioLabel,
            fallback: true,
            headers: playbackHeaders
          })
        );

        allStreams.push({
          name: "MovieBox",

          title:
            `${mediaTitle}` +
            (
              season > 0
                ? ` S${season}E${episode}`
                : ""
            ) +
            ` - ${quality} (${audioLabel}) [${formatType}]`,

          url: resourceUrl,

          quality,

          headers: playbackHeaders,

          subtitles,

          provider: "moviebox"
        });
      }
    }
  }

  /* =======================================================
     DEDUPE
  ======================================================= */

  const deduped = [];
  const seen = new Set();

  for (const stream of allStreams) {
    const key =
      `${stream.url}|${stream.title}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(stream);
  }

  /* =======================================================
     QUALITY SORT
  ======================================================= */

  const qualityRank = {
    "2160p": 2160,
    "1440p": 1440,
    "1080p": 1080,
    "720p": 720,
    "576p": 576,
    "480p": 480,
    "360p": 360,
    Auto: 0
  };

  deduped.sort(
    (a, b) =>
      (qualityRank[b.quality] || 0) -
      (qualityRank[a.quality] || 0)
  );

  return deduped;
}

/* =========================================================
   MAIN
========================================================= */

export async function getStreams({
  imdbId,
  type,
  season = 0,
  episode = 0
}) {
  initializeSession();

  const mediaType =
    type === "series" ||
    type === "tv"
      ? "tv"
      : "movie";

  console.log(
    `[MovieBox] Resolving IMDb ${imdbId} -> TMDB`
  );

  console.log(
    `[MovieBox] Client: ${PACKAGE_NAME}/${VERSION_CODE}`
  );

  console.log(
    `[MovieBox] Device: Redmi 2201117TY Android 13`
  );

  console.log(
    `[MovieBox] Region: US | Timezone: Asia/Kolkata`
  );

  console.log(
    `[MovieBox] X-Forwarded-For: ${SPOOFED_IP}`
  );

  const tmdbId =
    await resolveImdbToTmdb(
      imdbId,
      mediaType
    );

  if (!tmdbId) {
    console.log(
      "[MovieBox] Could not resolve IMDb ID to TMDB"
    );

    return [];
  }

  const tmdbDetails =
    await fetchTmdbDetails(
      tmdbId,
      mediaType
    );

  if (!tmdbDetails) {
    console.log(
      "[MovieBox] Could not fetch TMDB details"
    );

    return [];
  }

  const searchTitle =
    tmdbDetails.title ||
    tmdbDetails.originalTitle;

  console.log(
    `[MovieBox] Searching: ${searchTitle}`
  );

  const subjects =
    await searchMovieBox(
      searchTitle
    );

  if (!subjects.length) {
    console.log(
      "[MovieBox] No MovieBox search results"
    );

    return [];
  }

  const match =
    findBestMatch(
      subjects,
      tmdbDetails.title ||
        tmdbDetails.originalTitle,
      tmdbDetails.year,
      mediaType
    );

  if (!match) {
    console.log(
      "[MovieBox] No suitable MovieBox match"
    );

    return [];
  }

  const subjectId =
    match.subjectId ||
    match.subject_id ||
    match.id;

  if (!subjectId) {
    console.log(
      "[MovieBox] Matched subject has no ID"
    );

    return [];
  }

  console.log(
    `[MovieBox] Matched: ${
      match.title ||
      match.name ||
      searchTitle
    }`
  );

  const streams =
    await getStreamLinks(
      match,
      subjectId,
      tmdbDetails.title ||
        tmdbDetails.originalTitle ||
        searchTitle,
      season,
      episode
    );

  console.log(
    `[MovieBox] Returning ${streams.length} streams`
  );

  return streams;
}
