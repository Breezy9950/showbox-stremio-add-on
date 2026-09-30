// netlify/functions/providers/moviebox.js

import CryptoJS from "crypto-js";

const API_BASE = "https://api3.aoneroom.com";
const PLAYER_BASE = "https://moviebox.ph";

const PLAYER_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36";

const HOST_POOL = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
];

const KEY_B64_DEFAULT =
  "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";

const KEY_B64_ALT =
  "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==";

const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const TMDB_BASE = "https://api.themoviedb.org/3";

const PACKAGE_INFO = {
  package_name: "com.community.mbox.in",
  version_name: "4.0.03.0920.03",
  version_code: 50020130,
};

const BRANDS = {
  Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
  Xiaomi: ["2201117TI", "M2012K11AI", "Redmi Note 11"],
  OnePlus: ["LE2111", "CPH2449", "IN2023"],
  Google: ["Pixel 6", "Pixel 7", "Pixel 8"],
  Realme: ["RMX3085", "RMX3360", "RMX3551"],
};

const TOKEN_URL =
  "https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1";

const SECRET_KEY_DEFAULT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_DEFAULT).toString(CryptoJS.enc.Utf8)
);

const SECRET_KEY_ALT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_ALT).toString(CryptoJS.enc.Utf8)
);

let deviceId = null;
let selectedBrand = null;
let selectedModel = null;
let bearerToken = null;

function initializeSession() {
  if (deviceId && selectedBrand && selectedModel) return;

  deviceId = CryptoJS.lib.WordArray.random(16).toString(
    CryptoJS.enc.Hex
  );

  const brands = Object.keys(BRANDS);
  selectedBrand = brands[Math.floor(Math.random() * brands.length)];

  const models = BRANDS[selectedBrand];
  selectedModel = models[Math.floor(Math.random() * models.length)];
}

function md5(input) {
  return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function hmacMd5(key, data) {
  return CryptoJS.HmacMD5(data, key).toString(CryptoJS.enc.Base64);
}

function generateXClientToken(timestamp) {
  return `${timestamp},${md5(String(timestamp).split("").reverse().join(""))}`;
}

function buildCanonicalString(
  method,
  accept,
  contentType,
  url,
  body,
  timestamp
) {
  const parsed = new URL(url);

  const query = [...parsed.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const canonicalUrl =
    parsed.pathname + (query ? `?${query}` : "");

  const bodyText =
    body == null
      ? ""
      : typeof body === "string"
        ? body
        : JSON.stringify(body);

  const bodyHash = md5(bodyText);
  const bodyLength = new TextEncoder().encode(bodyText).length;

  return [
    method.toUpperCase(),
    accept,
    contentType,
    bodyLength,
    timestamp,
    bodyHash,
    canonicalUrl,
  ].join("\n");
}

function generateXTrSignature(
  method,
  accept,
  contentType,
  url,
  body,
  timestamp,
  secret
) {
  const canonical = buildCanonicalString(
    method,
    accept,
    contentType,
    url,
    body,
    timestamp
  );

  return `${timestamp}|2|${hmacMd5(secret, canonical)}`;
}

function decodeJwtExpiry(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return 0;

    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(
      Buffer.from(normalized, "base64").toString("utf8")
    );

    return Number(json.exp || 0);
  } catch {
    return 0;
  }
}

function isTokenValid(token) {
  if (!token) return false;

  const exp = decodeJwtExpiry(token);

  return exp > Math.floor(Date.now() / 1000) + 3600;
}

async function movieBoxRequest(
  method,
  url,
  body = null,
  customHeaders = {},
  isTokenFetch = false
) {
  initializeSession();

  const timestamp = Date.now().toString();

  const accept = customHeaders.Accept || "*/*";
  const contentType =
    customHeaders["Content-Type"] ||
    "application/json";

  const secret =
    customHeaders["x-secret-key"] === "alt"
      ? SECRET_KEY_ALT
      : SECRET_KEY_DEFAULT;

  const xClientToken = generateXClientToken(timestamp);

  const xTrSignature = generateXTrSignature(
    method,
    accept,
    contentType,
    url,
    body,
    timestamp,
    secret
  );

  const headers = {
    Accept: accept,
    "Content-Type": contentType,

    "x-client-token": xClientToken,
    "x-tr-signature": xTrSignature,

    "User-Agent":
      `${PACKAGE_INFO.package_name}/${PACKAGE_INFO.version_code} ` +
      `(Linux; U; Android 14; en_IN; ${selectedModel}; ` +
      `Build/UD1A.230803.041; Cronet/145.0.7582.0)`,

    "x-client-info": JSON.stringify({
      package_name: PACKAGE_INFO.package_name,
      version_name: PACKAGE_INFO.version_name,
      version_code: PACKAGE_INFO.version_code,
      os: "android",
      os_version: "14",
      device_id: deviceId,
      install_store: "official",
      gaid: "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d",
      brand: selectedBrand.toLowerCase(),
      model: selectedModel,
      system_language: "en",
      net: "NETWORK_WIFI",
      region: "IN",
      timezone: "Asia/Calcutta",
      sp_code: "",
    }),

    "x-client-status": "0",

    ...customHeaders,
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

  if (isTokenFetch) {
    // Exact behavior of the original MovieBox plugin:
    // token endpoint is NOT routed through the API host pool.
    hosts = [originalUrl.origin];
  } else if (apiHosts.has(originalUrl.host)) {
    hosts = [
      originalUrl.origin,
      ...HOST_POOL.filter(
        (host) => new URL(host).host !== originalUrl.host
      ),
    ];
  } else {
    hosts = [originalUrl.origin];
  }

  const maxAttempts = isTokenFetch
    ? 1
    : Math.min(3, hosts.length);

  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const origin = hosts[attempt];

    const requestUrl = new URL(url);
    requestUrl.protocol = new URL(origin).protocol;
    requestUrl.host = new URL(origin).host;

    try {
      const response = await fetch(requestUrl.toString(), {
        method,
        headers,
        body:
          body == null
            ? undefined
            : typeof body === "string"
              ? body
              : JSON.stringify(body),
      });

      const text = await response.text();

      if (!response.ok) {
        lastError = new Error(
          `${response.status} ${requestUrl.host}`
        );

        console.log(
          `[MovieBox] Request failed: ${response.status} ${requestUrl.host}`
        );

        if (
          response.status === 403 ||
          response.status === 429 ||
          response.status >= 500
        ) {
          continue;
        }

        throw lastError;
      }

      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      const responseToken =
        response.headers.get("x-user") ||
        response.headers.get("X-User");

      if (responseToken && isTokenValid(responseToken)) {
        bearerToken = responseToken;
      }

      return {
        data,
        headers: response.headers,
      };
    } catch (error) {
      lastError = error;

      console.log(
        `[MovieBox] Host ${requestUrl.host} failed: ${error.message}`
      );
    }
  }

  throw lastError || new Error("MovieBox request failed");
}

async function getCachedToken() {
  if (isTokenValid(bearerToken)) {
    return bearerToken;
  }

  console.log("[MovieBox] Fetching fresh anonymous token...");

  const result = await movieBoxRequest(
    "GET",
    TOKEN_URL,
    null,
    {},
    true
  );

  const token =
    result.headers.get("x-user") ||
    result.headers.get("X-User");

  if (!token) {
    throw new Error("MovieBox token was not returned");
  }

  bearerToken = token;

  return token;
}

async function fetchTmdbDetails(tmdbId, mediaType) {
  const response = await fetch(
    `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`
  );

  if (!response.ok) {
    throw new Error(
      `TMDB details failed: ${response.status}`
    );
  }

  const data = await response.json();

  return {
    title:
      data.title ||
      data.name ||
      data.original_title ||
      data.original_name ||
      "",
    year: (
      data.release_date ||
      data.first_air_date ||
      ""
    ).slice(0, 4),
    imdbId: data.imdb_id || "",
    originalTitle:
      data.original_title ||
      data.original_name ||
      data.title ||
      data.name ||
      "",
  };
}

async function resolveImdbToTmdb(imdbId, type) {
  const response = await fetch(
    `${TMDB_BASE}/find/${encodeURIComponent(imdbId)}` +
      `?api_key=${TMDB_API_KEY}&external_source=imdb_id`
  );

  if (!response.ok) {
    throw new Error(
      `TMDB IMDb lookup failed: ${response.status}`
    );
  }

  const data = await response.json();

  const results =
    type === "movie"
      ? data.movie_results || []
      : data.tv_results || [];

  if (!results.length) {
    return null;
  }

  return results[0];
}

async function searchMovieBox(query) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;

  const response = await movieBoxRequest(
    "POST",
    url,
    {
      page: 1,
      perPage: 20,
      keyword: query,
      restrictKid: 1,
    }
  );

  const groups = response.data?.data?.results || [];

  const subjects = [];

  for (const group of groups) {
    if (Array.isArray(group.subjects)) {
      subjects.push(...group.subjects);
    }
  }

  return subjects;
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’'":,!?()[\]{}]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSubjectType(subject) {
  const type = Number(
    subject?.subjectType ??
    subject?.subject_type ??
    subject?.type ??
    subject?.mediaType
  );

  if (type === 1) return "movie";
  if (type === 2) return "tv";

  return null;
}

function getSubjectTitle(subject) {
  return (
    subject?.title ||
    subject?.name ||
    subject?.subjectName ||
    subject?.subject_name ||
    subject?.originalTitle ||
    subject?.original_title ||
    ""
  );
}

function getSubjectYear(subject) {
  const value =
    subject?.releaseDate ||
    subject?.release_date ||
    subject?.year ||
    subject?.releaseYear ||
    "";

  return String(value).slice(0, 4);
}

function findBestMatch(subjects, details, type) {
  const targetType = type === "movie" ? "movie" : "tv";

  const targetTitle = normalizeTitle(details.title);
  const targetOriginal = normalizeTitle(details.originalTitle);
  const targetYear = String(details.year || "");

  let best = null;
  let bestScore = 0;

  for (const subject of subjects) {
    const subjectType = getSubjectType(subject);

    if (subjectType && subjectType !== targetType) {
      continue;
    }

    const title = normalizeTitle(getSubjectTitle(subject));

    if (!title) continue;

    let score = 0;

    if (title === targetTitle) {
      score += 50;
    } else if (
      targetTitle &&
      (title.includes(targetTitle) ||
        targetTitle.includes(title))
    ) {
      score += 15;
    }

    if (
      targetOriginal &&
      title === targetOriginal
    ) {
      score += 50;
    }

    const year = getSubjectYear(subject);

    if (targetYear && year && year === targetYear) {
      score += 35;
    }

    if (score >= 40 && score > bestScore) {
      best = subject;
      bestScore = score;
    }
  }

  return best;
}

function getPlaybackPage(subject) {
  return (
    subject?.detailPath ||
    subject?.detail_path ||
    subject?.path ||
    subject?.url ||
    ""
  );
}

function getSubjectId(subject) {
  return (
    subject?.subjectId ||
    subject?.subject_id ||
    subject?.id ||
    ""
  );
}

async function fetchSubjectDetails(subjectId) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/get` +
    `?subjectId=${encodeURIComponent(subjectId)}`;

  const result = await movieBoxRequest("GET", url);

  return result.data?.data || result.data || {};
}

function collectStreams(playData) {
  const streams = [];

  const add = (items) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item) continue;

      if (typeof item === "string") {
        streams.push({
          url: item,
          raw: item,
        });
        continue;
      }

      const url =
        item.url ||
        item.playUrl ||
        item.play_url ||
        item.src ||
        item.fileUrl ||
        item.file_url;

      if (!url) continue;

      streams.push({
        ...item,
        url,
      });
    }
  };

  add(playData?.streams);
  add(playData?.netDash);
  add(playData?.netHls);

  const seen = new Set();

  return streams.filter((stream) => {
    if (!stream.url || seen.has(stream.url)) {
      return false;
    }

    seen.add(stream.url);
    return true;
  });
}

function getQualityNumber(stream) {
  const text = JSON.stringify(stream).toLowerCase();

  const match = text.match(
    /(?:2160|1440|1080|720|576|540|480|360|240)p?/
  );

  return match
    ? Number(match[0].replace("p", ""))
    : 0;
}

function getStreamLabel(stream) {
  const quality = getQualityNumber(stream);

  if (quality >= 2160) return "4K";
  if (quality > 0) return `${quality}p`;

  return "Unknown";
}

async function fetchCaptions(
  subjectId,
  stream
) {
  const captions = [];

  try {
    const streamId =
      stream?.streamId ||
      stream?.stream_id ||
      stream?.id ||
      "";

    const url =
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions` +
      `?subjectId=${encodeURIComponent(subjectId)}` +
      `&streamId=${encodeURIComponent(streamId)}`;

    const result = await movieBoxRequest("GET", url);

    const data =
      result.data?.data ||
      result.data ||
      {};

    const items =
      data.captions ||
      data.subtitles ||
      data.items ||
      [];

    if (Array.isArray(items)) {
      captions.push(...items);
    }
  } catch (error) {
    console.log(
      `[MovieBox] Stream captions failed: ${error.message}`
    );
  }

  try {
    const url =
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions` +
      `?subjectId=${encodeURIComponent(subjectId)}`;

    const result = await movieBoxRequest("GET", url);

    const data =
      result.data?.data ||
      result.data ||
      {};

    const items =
      data.captions ||
      data.subtitles ||
      data.items ||
      [];

    if (Array.isArray(items)) {
      captions.push(...items);
    }
  } catch (error) {
    console.log(
      `[MovieBox] External captions failed: ${error.message}`
    );
  }

  return captions;
}

function normalizeSubtitle(item) {
  const url =
    item?.url ||
    item?.subtitleUrl ||
    item?.subtitle_url ||
    item?.src ||
    item?.fileUrl ||
    item?.file_url;

  if (!url) return null;

  return {
    url,
    lang:
      item?.lang ||
      item?.language ||
      item?.languageName ||
      item?.name ||
      "Unknown",
    label:
      item?.label ||
      item?.languageName ||
      item?.language ||
      item?.name ||
      "Unknown",
  };
}

async function getPlaybackStreams(
  subject,
  season,
  episode
) {
  const subjectId = getSubjectId(subject);

  if (!subjectId) {
    throw new Error("MovieBox subject ID missing");
  }

  const detailPath = getPlaybackPage(subject);

  const detail = await fetchSubjectDetails(subjectId);

  const resolvedDetailPath =
    detailPath ||
    getPlaybackPage(detail);

  const se = Number(season) || 0;
  const ep = Number(episode) || 0;

  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/play-info` +
    `?subjectId=${encodeURIComponent(subjectId)}` +
    `&se=${encodeURIComponent(se)}` +
    `&ep=${encodeURIComponent(ep)}` +
    `&streamSignType=1` +
    `&detailPath=${encodeURIComponent(resolvedDetailPath)}` +
    `&supportCodecs[hevc]=1` +
    `&supportCodecs[h264]=1`;

  const result = await movieBoxRequest(
    "GET",
    url,
    null,
    {
      Origin: PLAYER_BASE,
      Referer: `${PLAYER_BASE}/`,
      "User-Agent": PLAYER_USER_AGENT,
      "x-request-lang": "en",
      "x-vip-restrict": "0",
      "x-no-high-risk-restrict": "0",
    }
  );

  const data =
    result.data?.data ||
    result.data ||
    {};

  return collectStreams(data);
}

export async function getStreams({
  imdbId,
  type,
  season = 0,
  episode = 0,
}) {
  if (!imdbId) {
    return [];
  }

  try {
    const mediaType =
      type === "movie"
        ? "movie"
        : "tv";

    console.log(
      `[MovieBox] Resolving IMDb ${imdbId} -> TMDB`
    );

    const tmdbResult = await resolveImdbToTmdb(
      imdbId,
      mediaType
    );

    if (!tmdbResult?.id) {
      console.log(
        `[MovieBox] No TMDB result for ${imdbId}`
      );
      return [];
    }

    const details = await fetchTmdbDetails(
      tmdbResult.id,
      mediaType
    );

    if (!details.title) {
      return [];
    }

    console.log(
      `[MovieBox] Searching: ${details.title}`
    );

    let subjects = await searchMovieBox(
      details.title
    );

    if (!subjects.length && details.originalTitle) {
      subjects = await searchMovieBox(
        details.originalTitle
      );
    }

    const match = findBestMatch(
      subjects,
      details,
      type
    );

    if (!match) {
      console.log(
        `[MovieBox] No matching content found for ${details.title}`
      );
      return [];
    }

    console.log(
      `[MovieBox] Matched: ${getSubjectTitle(match)}`
    );

    const rawStreams = await getPlaybackStreams(
      match,
      season,
      episode
    );

    const results = [];

    for (const stream of rawStreams) {
      if (!stream?.url) continue;

      let subtitles = [];

      try {
        const captions = await fetchCaptions(
          getSubjectId(match),
          stream
        );

        subtitles = captions
          .map(normalizeSubtitle)
          .filter(Boolean);
      } catch {}

      // IMPORTANT:
      // Do not restrict, filter, sort, rename, or otherwise
      // alter MovieBox's stream selection logic here.
      //
      // The stream URL and metadata are passed through as-is.
      results.push({
        ...stream,
        name:
          stream.name ||
          stream.title ||
          "MovieBox",
        title:
          stream.title ||
          stream.name ||
          "MovieBox",
        url: stream.url,
        subtitles,
        provider: "moviebox",
      });
    }

    return results;
  } catch (error) {
    console.error(
      `[MovieBox] ${error?.stack || error?.message || error}`
    );

    return [];
  }
}
