import crypto from "crypto";

const API_BASE = "https://api3.aoneroom.com";
const PLAYER_BASE = "https://moviebox.ph";

const HOSTS = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com"
];

const KEY_B64_DEFAULT =
  "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";

const KEY_B64_ALT =
  "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==";

const TMDB_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const TMDB_BASE = "https://api.themoviedb.org/3";

const PACKAGE_NAME = "com.community.mbox.in";
const VERSION_NAME = "4.0.03.0920.03";
const VERSION_CODE = "50020130";

let bearerToken = null;
let bearerTokenTime = 0;

const TOKEN_TTL = 30 * 60 * 1000;

const BRANDS = [
  "Samsung",
  "Xiaomi",
  "OnePlus",
  "Google",
  "Realme"
];

const MODELS = [
  "SM-S918B",
  "SM-S928B",
  "23053RN02A",
  "2312DRA50G",
  "CPH2581",
  "Pixel 8",
  "RMX3820"
];

function randomHex(length = 32) {
  return crypto.randomBytes(length / 2).toString("hex");
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function md5(value) {
  return crypto
    .createHash("md5")
    .update(value)
    .digest("hex");
}

function hmacMd5(key, value) {
  return crypto
    .createHmac("md5", key)
    .update(value)
    .digest("hex");
}

function decodeKey(base64) {
  return Buffer.from(base64, "base64").toString("utf8");
}

function getClientInfo(deviceId) {
  const brand = randomItem(BRANDS);
  const model = randomItem(MODELS);

  return JSON.stringify({
    device_id: deviceId,
    brand,
    model,
    package_name: PACKAGE_NAME,
    version_name: VERSION_NAME,
    version_code: VERSION_CODE,
    os: "android",
    os_version: "14"
  });
}

function createSignature(path, body = "") {
  const timestamp = Date.now().toString();

  const key = decodeKey(KEY_B64_DEFAULT);

  const payload = `${timestamp}${path}${body}`;

  const signature = hmacMd5(key, payload);

  return {
    timestamp,
    signature
  };
}

async function initializeSession() {
  const deviceId = randomHex(32);

  const clientInfo = getClientInfo(deviceId);

  return {
    deviceId,
    clientInfo
  };
}

async function getCachedToken() {
  if (
    bearerToken &&
    Date.now() - bearerTokenTime < TOKEN_TTL
  ) {
    return bearerToken;
  }

  console.log("[MovieBox] Fetching fresh anonymous token...");

  const path =
    "/wefeed-mobile-bff/tab/ranking-list" +
    "?tabId=0&categoryType=4516404531735022304&page=1&perPage=1";

  const session = await initializeSession();

  const { timestamp, signature } =
    createSignature(path);

  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "x-client-info": session.clientInfo,
    "x-client-token": signature,
    "x-tr-signature": signature,
    "x-timestamp": timestamp,
    "user-agent":
      "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36"
  };

  let response = null;
  let data = null;

  for (const host of HOSTS.slice(0, 3)) {
    try {
      response = await fetch(`${host}${path}`, {
        method: "GET",
        headers
      });

      const text = await response.text();

      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (
        response.ok &&
        data
      ) {
        break;
      }

      console.log(
        `[MovieBox] Token host failed: ${host} (${response.status})`
      );
    } catch (error) {
      console.log(
        `[MovieBox] Token host error: ${host}`,
        error?.message || error
      );
    }
  }

  if (!response?.ok || !data) {
    throw new Error(
      `MovieBox token request failed (${response?.status || "unknown"})`
    );
  }

  const token =
    data?.data?.token ||
    data?.data?.accessToken ||
    data?.token ||
    data?.access_token;

  if (!token) {
    console.log(
      "[MovieBox] Token response did not contain a token:",
      JSON.stringify(data).slice(0, 1000)
    );

    throw new Error("MovieBox anonymous token missing");
  }

  bearerToken = token;
  bearerTokenTime = Date.now();

  return bearerToken;
}

async function movieBoxRequest(
  path,
  options = {},
  isTokenFetch = false
) {
  const method = options.method || "GET";
  const body = options.body || "";

  if (!isTokenFetch) {
    await getCachedToken();
  }

  const session = await initializeSession();

  const { timestamp, signature } =
    createSignature(path, body);

  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "x-client-info": session.clientInfo,
    "x-client-token": signature,
    "x-tr-signature": signature,
    "x-timestamp": timestamp,
    "user-agent":
      "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36"
  };

  if (!isTokenFetch && bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const host =
      HOSTS[attempt] || HOSTS[HOSTS.length - 1];

    try {
      const response = await fetch(`${host}${path}`, {
        method,
        headers,
        body: method === "GET" ? undefined : body
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        bearerToken = null;
        bearerTokenTime = 0;

        if (!isTokenFetch) {
          await getCachedToken();
        }

        lastError = new Error(
          `MovieBox authorization failed (${response.status})`
        );

        continue;
      }

      if (
        response.status === 429 ||
        response.status >= 500
      ) {
        lastError = new Error(
          `MovieBox server error (${response.status})`
        );

        continue;
      }

      if (!response.ok) {
        throw new Error(
          `MovieBox request failed (${response.status})`
        );
      }

      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("MovieBox request failed");
}

function normalizeTitle(title = "") {
  return String(title)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title = "") {
  return normalizeTitle(title)
    .split(" ")
    .filter(Boolean);
}

function calculateTokenSimilarity(a, b) {
  const aTokens = new Set(titleTokens(a));
  const bTokens = new Set(titleTokens(b));

  if (!aTokens.size || !bTokens.size) {
    return 0;
  }

  let common = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      common++;
    }
  }

  return common / Math.max(aTokens.size, bTokens.size);
}

function extractYear(value) {
  if (!value) return null;

  const match = String(value).match(/\b(19|20)\d{2}\b/);

  return match ? Number(match[0]) : null;
}

function getSubjectTitle(subject) {
  return (
    subject?.title ||
    subject?.name ||
    subject?.subjectName ||
    subject?.originalTitle ||
    subject?.original_title ||
    ""
  );
}

function getSubjectOriginalTitle(subject) {
  return (
    subject?.originalTitle ||
    subject?.original_title ||
    subject?.title ||
    subject?.name ||
    ""
  );
}

function getSubjectYear(subject) {
  return (
    subject?.releaseDate?.slice?.(0, 4) ||
    subject?.release_date?.slice?.(0, 4) ||
    subject?.year ||
    extractYear(subject?.releaseDate) ||
    extractYear(subject?.release_date) ||
    null
  );
}

function getSubjectType(subject) {
  const value =
    subject?.subjectType ??
    subject?.subject_type ??
    subject?.type;

  if (
    value === 1 ||
    value === "1" ||
    value === "movie"
  ) {
    return "movie";
  }

  if (
    value === 2 ||
    value === "2" ||
    value === "tv" ||
    value === "series"
  ) {
    return "tv";
  }

  return null;
}

function findBestMatch(
  subjects,
  tmdbTitle,
  tmdbOriginalTitle,
  tmdbYear,
  targetType
) {
  if (!Array.isArray(subjects) || !subjects.length) {
    return null;
  }

  const targetTitles = [
    tmdbTitle,
    tmdbOriginalTitle
  ].filter(Boolean);

  const normalizedTargets =
    targetTitles.map(normalizeTitle);

  let best = null;

  for (const subject of subjects) {
    const title = getSubjectTitle(subject);
    const originalTitle =
      getSubjectOriginalTitle(subject);

    const subjectType =
      getSubjectType(subject);

    if (
      targetType &&
      subjectType &&
      subjectType !== targetType
    ) {
      continue;
    }

    const subjectTitles = [
      title,
      originalTitle
    ].filter(Boolean);

    let titleScore = 0;

    for (const candidateTitle of subjectTitles) {
      const normalizedCandidate =
        normalizeTitle(candidateTitle);

      for (const target of normalizedTargets) {
        if (!target || !normalizedCandidate) {
          continue;
        }

        if (normalizedCandidate === target) {
          titleScore = Math.max(titleScore, 100);
        } else if (
          normalizedCandidate.includes(target) ||
          target.includes(normalizedCandidate)
        ) {
          titleScore = Math.max(titleScore, 75);
        } else {
          const similarity =
            calculateTokenSimilarity(
              candidateTitle,
              target
            );

          titleScore = Math.max(
            titleScore,
            similarity * 70
          );
        }
      }
    }

    const subjectYear =
      Number(getSubjectYear(subject)) || null;

    let yearScore = 0;

    if (
      tmdbYear &&
      subjectYear &&
      Number(tmdbYear) === subjectYear
    ) {
      yearScore = 25;
    }

    const score = titleScore + yearScore;

    console.log(
      `[MovieBox] Candidate: "${title}" | type=${subjectType} | year=${subjectYear || "?"} | score=${score.toFixed(1)}`
    );

    if (
      !best ||
      score > best.score
    ) {
      best = {
        subject,
        score,
        title,
        subjectYear,
        subjectType
      };
    }
  }

  if (!best) {
    return null;
  }

  /*
   * The old matcher required >= 40.
   *
   * This matcher is intentionally more tolerant because MovieBox
   * frequently changes titles, adds "The Movie", subtitles, etc.
   *
   * A reasonable title similarity is still required.
   */
  if (best.score < 45) {
    console.log(
      `[MovieBox] Best candidate rejected: "${best.title}" (${best.score.toFixed(1)})`
    );

    return null;
  }

  console.log(
    `[MovieBox] Selected: "${best.title}" (${best.score.toFixed(1)})`
  );

  return best.subject;
}

async function findTmdbByImdb(imdbId, type) {
  const endpoint =
    type === "series"
      ? `${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_KEY}&external_source=imdb_id`
      : `${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_KEY}&external_source=imdb_id`;

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(
      `TMDB IMDb lookup failed (${response.status})`
    );
  }

  const data = await response.json();

  if (type === "movie") {
    return data?.movie_results?.[0] || null;
  }

  return data?.tv_results?.[0] || null;
}

async function fetchTmdbDetails(tmdbId, type) {
  const endpoint =
    type === "movie"
      ? `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}`
      : `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}`;

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(
      `TMDB details failed (${response.status})`
    );
  }

  return response.json();
}

async function searchMovieBox(query) {
  const path =
    "/wefeed-mobile-bff/subject-api/search/v2";

  const body = JSON.stringify({
    page: 1,
    perPage: 20,
    keyword: query,
    restrictKid: 1
  });

  const data = await movieBoxRequest(
    path,
    {
      method: "POST",
      body
    }
  );

  return (
    data?.data?.results ||
    data?.data?.subjects ||
    data?.results ||
    data?.subjects ||
    []
  );
}

async function findMovieBoxSubject(
  title,
  originalTitle,
  year,
  type
) {
  const targetType =
    type === "movie"
      ? "movie"
      : "tv";

  const queries = [];

  if (title) {
    queries.push(title);
  }

  if (
    originalTitle &&
    normalizeTitle(originalTitle) !==
      normalizeTitle(title)
  ) {
    queries.push(originalTitle);
  }

  /*
   * Additional fallback queries.
   *
   * This helps with titles such as:
   * "Demon Slayer: Kimetsu no Yaiba Infinity Castle"
   * where MovieBox may index the title differently.
   */
  if (title) {
    const simplified = title
      .replace(/[:\-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (
      simplified &&
      normalizeTitle(simplified) !==
        normalizeTitle(title)
    ) {
      queries.push(simplified);
    }
  }

  const uniqueQueries = [
    ...new Set(
      queries
        .map(q => String(q).trim())
        .filter(Boolean)
    )
  ];

  let globalBest = null;

  for (const query of uniqueQueries) {
    console.log(
      `[MovieBox] Searching: "${query}"`
    );

    let subjects;

    try {
      subjects = await searchMovieBox(query);
    } catch (error) {
      console.log(
        `[MovieBox] Search failed for "${query}":`,
        error?.message || error
      );

      continue;
    }

    console.log(
      `[MovieBox] Search returned ${subjects.length} candidates`
    );

    const match = findBestMatch(
      subjects,
      title,
      originalTitle,
      year,
      targetType
    );

    if (match) {
      const matchTitle = getSubjectTitle(match);

      const score =
        calculateTokenSimilarity(
          matchTitle,
          title
        ) * 100;

      if (
        !globalBest ||
        score > globalBest.score
      ) {
        globalBest = {
          subject: match,
          score
        };
      }
    }
  }

  return globalBest?.subject || null;
}

function getSubjectId(subject) {
  return (
    subject?.subjectId ||
    subject?.subject_id ||
    subject?.id
  );
}

function getSubjectDetailPath(subject) {
  return (
    subject?.detailPath ||
    subject?.detail_path ||
    subject?.path ||
    ""
  );
}

async function getPlayInfo(
  subject,
  season,
  episode
) {
  const subjectId = getSubjectId(subject);

  if (!subjectId) {
    throw new Error(
      "MovieBox subject ID missing"
    );
  }

  const detailPath =
    getSubjectDetailPath(subject);

  const params = new URLSearchParams({
    subjectId: String(subjectId),
    se: String(season || 0),
    ep: String(episode || 0),
    streamSignType: "1",
    detailPath,
    "supportCodecs[hevc]": "1",
    "supportCodecs[h264]": "1"
  });

  const path =
    `/wefeed-mobile-bff/subject-api/play-info?${params.toString()}`;

  return movieBoxRequest(path);
}

function findObjects(value, output = []) {
  if (!value || typeof value !== "object") {
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      findObjects(item, output);
    }

    return output;
  }

  output.push(value);

  for (const child of Object.values(value)) {
    if (
      child &&
      typeof child === "object"
    ) {
      findObjects(child, output);
    }
  }

  return output;
}

function getUrlFromObject(object) {
  if (!object || typeof object !== "object") {
    return null;
  }

  const candidates = [
    object.url,
    object.playUrl,
    object.play_url,
    object.streamUrl,
    object.stream_url,
    object.downloadUrl,
    object.download_url,
    object.fileUrl,
    object.file_url,
    object.src
  ];

  for (const value of candidates) {
    if (
      typeof value === "string" &&
      /^https?:\/\//i.test(value)
    ) {
      return value;
    }
  }

  return null;
}

function detectQuality(object, url = "") {
  const values = [
    object?.resolution,
    object?.resolutions,
    object?.quality,
    object?.qualityName,
    object?.name,
    object?.title,
    object?.label,
    url
  ]
    .filter(Boolean)
    .join(" ");

  if (
    /2160p|2160|4k|uhd/i.test(values)
  ) {
    return "4K";
  }

  if (/1440p|1440/i.test(values)) {
    return "1440p";
  }

  if (/1080p|1080/i.test(values)) {
    return "1080p";
  }

  if (/720p|720/i.test(values)) {
    return "720p";
  }

  if (/480p|480/i.test(values)) {
    return "480p";
  }

  if (/360p|360/i.test(values)) {
    return "360p";
  }

  return "Auto";
}

function detectFormat(object, url = "") {
  const value = [
    object?.format,
    object?.formatType,
    object?.codec,
    object?.mimeType,
    object?.mime_type,
    url
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    value.includes("hevc") ||
    value.includes("h265") ||
    value.includes("x265")
  ) {
    return "HEVC";
  }

  if (
    value.includes("h264") ||
    value.includes("avc") ||
    value.includes("x264")
  ) {
    return "H264";
  }

  return "";
}

function collectStreams(playInfo) {
  const objects = findObjects(playInfo);

  const streams = [];

  for (const object of objects) {
    const url = getUrlFromObject(object);

    if (!url) {
      continue;
    }

    const quality =
      detectQuality(object, url);

    const format =
      detectFormat(object, url);

    streams.push({
      url,
      quality,
      format,
      source: object
    });
  }

  /*
   * Remove exact duplicate URLs.
   */
  const seen = new Set();

  return streams.filter(stream => {
    if (seen.has(stream.url)) {
      return false;
    }

    seen.add(stream.url);
    return true;
  });
}

function displayQuality(quality) {
  const value =
    String(quality || "")
      .toLowerCase();

  if (
    value.includes("2160") ||
    value.includes("4k")
  ) {
    return "4K";
  }

  if (value.includes("1440")) {
    return "1440p";
  }

  if (value.includes("1080")) {
    return "1080p";
  }

  if (value.includes("720")) {
    return "720p";
  }

  if (value.includes("480")) {
    return "480p";
  }

  if (value.includes("360")) {
    return "360p";
  }

  return "Auto";
}

function buildStream(
  stream,
  mediaTitle
) {
  const quality =
    displayQuality(stream.quality);

  /*
   * Important:
   *
   * MovieBox streams intentionally use:
   *
   * MovieBox 4K
   * MovieBox 1080p
   * MovieBox 720p
   *
   * No ORG and no extra title/audio/format text.
   */
  return {
    name: `MovieBox ${quality}`,
    title: `MovieBox ${quality}`,
    url: stream.url,
    quality,
    provider: "moviebox"
  };
}

export async function getStreams({
  imdbId,
  type,
  season = 0,
  episode = 0
}) {
  console.log(
    `[MovieBox] Querying IMDb: ${imdbId}, Type: ${type}, S${season}E${episode}`
  );

  try {
    if (!imdbId) {
      console.log(
        "[MovieBox] Missing IMDb ID"
      );

      return [];
    }

    /*
     * IMDb -> TMDB
     */
    const tmdbItem =
      await findTmdbByImdb(
        imdbId,
        type
      );

    if (!tmdbItem) {
      console.log(
        `[MovieBox] TMDB could not resolve IMDb: ${imdbId}`
      );

      return [];
    }

    const tmdbId =
      tmdbItem.id;

    /*
     * TMDB details gives us the canonical title,
     * original title and release year.
     */
    const details =
      await fetchTmdbDetails(
        tmdbId,
        type
      );

    const mediaTitle =
      details?.title ||
      details?.name ||
      tmdbItem?.title ||
      tmdbItem?.name ||
      "";

    const originalTitle =
      details?.original_title ||
      details?.original_name ||
      tmdbItem?.original_title ||
      tmdbItem?.original_name ||
      "";

    const releaseDate =
      details?.release_date ||
      details?.first_air_date ||
      tmdbItem?.release_date ||
      tmdbItem?.first_air_date ||
      "";

    const year =
      extractYear(releaseDate);

    console.log(
      `[MovieBox] TMDB: ${tmdbId} | "${mediaTitle}" | Original: "${originalTitle}" | Year: ${year || "?"}`
    );

    /*
     * Search MovieBox.
     */
    const subject =
      await findMovieBoxSubject(
        mediaTitle,
        originalTitle,
        year,
        type
      );

    if (!subject) {
      console.log(
        `[MovieBox] No matching content found for: ${mediaTitle}`
      );

      return [];
    }

    const subjectTitle =
      getSubjectTitle(subject);

    const subjectId =
      getSubjectId(subject);

    console.log(
      `[MovieBox] Matched "${subjectTitle}" (${subjectId})`
    );

    /*
     * Fetch playback information.
     */
    const playInfo =
      await getPlayInfo(
        subject,
        season,
        episode
      );

    const rawStreams =
      collectStreams(playInfo);

    console.log(
      `[MovieBox] Found ${rawStreams.length} raw streams`
    );

    if (!rawStreams.length) {
      console.log(
        "[MovieBox] Play-info contained no playable URLs"
      );

      return [];
    }

    /*
     * Build clean Stremio streams.
     */
    const streams =
      rawStreams.map(stream =>
        buildStream(
          stream,
          mediaTitle
        )
      );

    console.log(
      `[MovieBox] Returning ${streams.length} streams`
    );

    return streams;
  } catch (error) {
    console.error(
      "[MovieBox] Error:",
      error?.stack ||
        error?.message ||
        error
    );

    return [];
  }
}
