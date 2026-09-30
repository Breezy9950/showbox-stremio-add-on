// netlify/functions/providers/moviebox.js
console.log("[MovieBox PROVIDER] TUI-SPOOF-2026-10-01-B");

import CryptoJS from "crypto-js";

// ============================================================
// MovieBox provider
//
// Based on the supplied Nuvio implementation, with the
// additional client behavior currently used by MovieBox-TUI.
//
// Changes from previous version:
//   - com.community.oneroom client identity
//   - current TUI-style client metadata
//   - X-Play-Mode: 2
//   - sp_code: 40401
//   - X-Forwarded-For spoofed IP
//   - additional MovieBox hosts
//
// IMPORTANT:
// X-Forwarded-For does NOT change Netlify's actual source IP.
// It only tests whether MovieBox trusts the forwarded IP header.
// ============================================================

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
  "https://api.inmoviebox.com",
];

const KEY_B64_DEFAULT =
  "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";

const KEY_B64_ALT =
  "WHFuMm5uTzQxL0w5Mm04bVNMQQ==";

const TMDB_API_KEY =
  "1865f43a0549ca50d341dd9ab8b29f49";

const TMDB_BASE_URL =
  "https://api.themoviedb.org/3";

// ============================================================
// CURRENT TUI CLIENT IDENTITY
// ============================================================

const PACKAGE_INFO = {
  package_name: "com.community.oneroom",
  version_name: "4.0.01.0813.03",
  version_code: 50020120,
};

const ANDROID_VERSION = "13";
const ANDROID_BUILD = "TQ2A.230405.003";
const DEVICE_BRAND = "Redmi";
const DEVICE_MODEL = "2201117TY";
const SYSTEM_LANGUAGE = "en";
const NETWORK_TYPE = "NETWORK_WIFI";
const REGION = "US";
const TIMEZONE = "Asia/Kolkata";
const INSTALL_STORE = "ps";
const INSTALL_CHANNEL = "ps";
const SP_CODE = "40401";
const PLAY_MODE = "2";

// ============================================================
// SPOOFED FORWARDED IP
// ============================================================

const SPOOFED_IP_PREFIXES = [
  "103.241",
  "49.36",
  "117.195",
  "106.198",
  "122.162",
  "157.32",
  "182.70",
  "103.58",
  "27.60",
  "59.90",
];

function randomSpoofedIp() {
  const prefix =
    SPOOFED_IP_PREFIXES[
      Math.floor(
        Math.random() *
          SPOOFED_IP_PREFIXES.length
      )
    ];

  const c =
    Math.floor(
      Math.random() * 253
    ) + 1;

  const d =
    Math.floor(
      Math.random() * 253
    ) + 1;

  return `${prefix}.${c}.${d}`;
}

const SPOOFED_IP =
  randomSpoofedIp();

// ============================================================
// DEVICE / SESSION
// ============================================================

function randomHex(length) {
  const chars =
    "0123456789abcdef";

  let result = "";

  for (let i = 0; i < length; i++) {
    result +=
      chars[
        Math.floor(
          Math.random() * 16
        )
      ];
  }

  return result;
}

function randomUuid() {
  return [
    randomHex(8),
    randomHex(4),
    randomHex(4),
    randomHex(4),
    randomHex(12),
  ].join("-");
}

const deviceId =
  randomHex(32);

const gaid =
  randomUuid();

let bearerToken = null;

// ============================================================
// CLIENT INFO
// ============================================================

function buildClientInfo() {
  return JSON.stringify({
    package_name:
      PACKAGE_INFO.package_name,

    version_name:
      PACKAGE_INFO.version_name,

    version_code:
      PACKAGE_INFO.version_code,

    os:
      "android",

    os_version:
      ANDROID_VERSION,

    install_ch:
      INSTALL_CHANNEL,

    device_id:
      deviceId,

    install_store:
      INSTALL_STORE,

    gaid,

    brand:
      DEVICE_BRAND,

    model:
      DEVICE_MODEL,

    system_language:
      SYSTEM_LANGUAGE,

    net:
      NETWORK_TYPE,

    region:
      REGION,

    timezone:
      TIMEZONE,

    sp_code:
      SP_CODE,

    "X-Play-Mode":
      PLAY_MODE,
  });
}

const CLIENT_INFO =
  buildClientInfo();

const CLIENT_USER_AGENT =
  `${PACKAGE_INFO.package_name}/${PACKAGE_INFO.version_code} ` +
  `(Linux; U; Android ${ANDROID_VERSION}; en_US; ${DEVICE_MODEL}; ` +
  `Build/${ANDROID_BUILD}; Cronet/135.0.7012.3)`;

// ============================================================
// AUTH
// ============================================================

const SECRET_KEY_DEFAULT =
  CryptoJS.enc.Base64.parse(
    CryptoJS.enc.Base64.parse(
      KEY_B64_DEFAULT
    ).toString(
      CryptoJS.enc.Utf8
    )
  );

const SECRET_KEY_ALT =
  CryptoJS.enc.Base64.parse(
    CryptoJS.enc.Base64.parse(
      KEY_B64_ALT
    ).toString(
      CryptoJS.enc.Utf8
    )
  );

function decodeJwtExpiry(token) {
  try {
    const parts =
      token.split(".");

    if (
      parts.length < 2
    ) {
      return 0;
    }

    let base64 =
      parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (
      base64.length % 4
    ) {
      base64 += "=";
    }

    const parsed =
      CryptoJS.enc.Base64
        .parse(base64)
        .toString(
          CryptoJS.enc.Utf8
        );

    const json =
      JSON.parse(parsed);

    return json.exp || 0;
  } catch {
    return 0;
  }
}

function isTokenValid(token) {
  if (!token) {
    return false;
  }

  const exp =
    decodeJwtExpiry(token);

  return (
    exp >
    Date.now() / 1000 +
      3600
  );
}

function md5(input) {
  return CryptoJS.MD5(input)
    .toString(
      CryptoJS.enc.Hex
    );
}

function hmacMd5(
  key,
  data
) {
  return CryptoJS.HmacMD5(
    data,
    key
  ).toString(
    CryptoJS.enc.Base64
  );
}

function generateXClientToken(
  timestamp
) {
  const ts =
    (
      timestamp ||
      Date.now()
    ).toString();

  const reversed =
    ts
      .split("")
      .reverse()
      .join("");

  const hash =
    md5(reversed);

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
  let path = "";
  let query = "";

  try {
    const urlObj =
      new URL(url);

    path =
      urlObj.pathname;

    const params =
      Array.from(
        urlObj.searchParams.keys()
      ).sort();

    if (params.length) {
      query =
        params
          .map((key) => {
            const values =
              urlObj.searchParams
                .getAll(key);

            return values
              .map(
                (val) =>
                  `${key}=${val}`
              )
              .join("&");
          })
          .join("&");
    }
  } catch {
    if (
      url.includes("?")
    ) {
      const parts =
        url.split("?");

      path =
        parts[0].replace(
          /https?:\/\/[^\/]+/,
          ""
        );

      query =
        parts[1]
          .split("&")
          .sort()
          .join("&");
    } else {
      path =
        url.replace(
          /https?:\/\/[^\/]+/,
          ""
        );
    }
  }

  const canonicalUrl =
    query
      ? `${path}?${query}`
      : path;

  let bodyHash = "";
  let bodyLength = "";

  if (body) {
    const bodyWords =
      CryptoJS.enc.Utf8.parse(
        body
      );

    bodyLength =
      bodyWords.sigBytes.toString();

    bodyHash =
      md5(bodyWords);
  }

  return (
    `${method.toUpperCase()}\n` +
    `${accept || ""}\n` +
    `${contentType || ""}\n` +
    `${bodyLength}\n` +
    `${timestamp}\n` +
    `${bodyHash}\n` +
    canonicalUrl
  );
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
    customTimestamp ||
    Date.now();

  const canonical =
    buildCanonicalString(
      method,
      accept,
      contentType,
      url,
      body,
      timestamp
    );

  const secret =
    useAltKey
      ? SECRET_KEY_ALT
      : SECRET_KEY_DEFAULT;

  const signatureB64 =
    hmacMd5(
      secret,
      canonical
    );

  return (
    `${timestamp}|2|${signatureB64}`
  );
}

// ============================================================
// TOKEN
// ============================================================

const TOKEN_URL =
  "https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1";

async function getCachedToken() {
  if (
    isTokenValid(
      bearerToken
    )
  ) {
    return bearerToken;
  }

  console.log(
    "[MovieBox] Fetching fresh anonymous token..."
  );

  const res =
    await movieBoxRequest(
      "GET",
      TOKEN_URL,
      null,
      {},
      true
    );

  if (
    res &&
    res.headers
  ) {
    const xUser =
      res.headers.get(
        "x-user"
      );

    if (xUser) {
      try {
        const xUserJson =
          JSON.parse(xUser);

        const token =
          xUserJson.token;

        if (
          token &&
          isTokenValid(token)
        ) {
          bearerToken =
            token;

          console.log(
            "[MovieBox] Anonymous token accepted"
          );

          return token;
        }
      } catch (e) {
        console.error(
          "[MovieBox] Failed to parse x-user header",
          e.message
        );
      }
    }
  }

  return bearerToken || "";
}

// ============================================================
// MOVIEBOX REQUEST
// ============================================================

async function movieBoxRequest(
  method,
  url,
  body = null,
  customHeaders = {},
  isTokenFetch = false
) {
  const timestamp =
    Date.now();

  const xClientToken =
    generateXClientToken(
      timestamp
    );

  const headerContentType =
    customHeaders[
      "Content-Type"
    ] ||
    (
      body
        ? "application/json; charset=utf-8"
        : "application/json"
    );

  const accept =
    customHeaders[
      "Accept"
    ] ||
    "application/json";

  const xTrSignature =
    generateXTrSignature(
      method,
      accept,
      headerContentType,
      url,
      body,
      false,
      timestamp
    );

  const headers = {
    Accept:
      accept,

    "Content-Type":
      headerContentType,

    "Accept-Language":
      "en-US,en;q=0.9",

    Connection:
      "keep-alive",

    "x-client-token":
      xClientToken,

    "x-tr-signature":
      xTrSignature,

    "User-Agent":
      CLIENT_USER_AGENT,

    "x-client-info":
      CLIENT_INFO,

    "x-client-status":
      "0",

    "x-forwarded-for":
      SPOOFED_IP,

    "X-Play-Mode":
      PLAY_MODE,

    ...customHeaders,
  };

  if (!isTokenFetch) {
    const token =
      await getCachedToken();

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body =
      body;
  }

  let originalUrl;

  try {
    originalUrl =
      new URL(url);
  } catch {
    return null;
  }

  const apiHosts =
    new Set(
      HOST_POOL.map(
        (host) =>
          new URL(host).host
      )
    );

  const hosts =
    apiHosts.has(
      originalUrl.host
    )
      ? [
          originalUrl.host,

          ...HOST_POOL
            .map(
              (host) =>
                new URL(
                  host
                ).host
            )
            .filter(
              (host) =>
                host !==
                originalUrl.host
            ),
        ]
      : [
          originalUrl.host,
        ];

  const maxAttempts =
    hosts.length;

  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt++
  ) {
    try {
      const requestUrl =
        new URL(
          originalUrl.toString()
        );

      requestUrl.host =
        hosts[attempt];

      console.log(
        `[MovieBox] ${method} ${requestUrl.host}${requestUrl.pathname}`
      );

      console.log(
        `[MovieBox] X-Forwarded-For: ${SPOOFED_IP}`
      );

      const res =
        await fetch(
          requestUrl.toString(),
          options
        );

      if (!res.ok) {
        let errorBody =
          "";

        try {
          errorBody =
            await res.text();
        } catch {}

        console.log(
          `[MovieBox] Request failed: ${res.status} ${requestUrl.host}`
        );

        if (errorBody) {
          console.log(
            `[MovieBox] Error body: ${errorBody.slice(
              0,
              1000
            )}`
          );
        }

        if (
          res.status === 403 ||
          res.status === 406 ||
          res.status === 407 ||
          res.status === 429 ||
          res.status >= 500
        ) {
          continue;
        }

        return null;
      }

      const text =
        await res.text();

      let parsed = null;

      try {
        parsed =
          JSON.parse(text);
      } catch {
        parsed =
          text;
      }

      const xUser =
        res.headers.get(
          "x-user"
        );

      if (xUser) {
        try {
          const xUserJson =
            JSON.parse(xUser);

          const token =
            xUserJson.token;

          if (
            token &&
            isTokenValid(token)
          ) {
            bearerToken =
              token;
          }
        } catch {}
      }

      return {
        data: parsed,
        headers:
          res.headers,
      };
    } catch (err) {
      console.error(
        `[MovieBox] Request error on ${hosts[attempt]}:`,
        err.message
      );

      continue;
    }
  }

  return null;
}

// ============================================================
// TMDB
// ============================================================

async function resolveImdbToTmdb(
  imdbId,
  mediaType
) {
  try {
    const url =
      `${TMDB_BASE_URL}/find/${encodeURIComponent(
        imdbId
      )}?api_key=${TMDB_API_KEY}` +
      `&external_source=imdb_id`;

    const res =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json",
          },
        }
      );

    if (!res.ok) {
      console.error(
        "[MovieBox TMDB Find Error]",
        res.status
      );

      return null;
    }

    const data =
      await res.json();

    const results =
      mediaType === "movie"
        ? data.movie_results ||
          []
        : data.tv_results ||
          [];

    return (
      results[0] ||
      null
    );
  } catch (e) {
    console.error(
      "[MovieBox TMDB Find Error]",
      e.message
    );

    return null;
  }
}

async function fetchTmdbDetails(
  tmdbId,
  mediaType
) {
  try {
    const url =
      `${TMDB_BASE_URL}/${mediaType}/${tmdbId}` +
      `?api_key=${TMDB_API_KEY}` +
      `&append_to_response=external_ids`;

    const res =
      await fetch(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 " +
              "(KHTML, like Gecko) " +
              "Chrome/121.0.0.0 Safari/537.36",

            Accept:
              "application/json",

            Connection:
              "keep-alive",
          },
        }
      );

    if (!res.ok) {
      return null;
    }

    const data =
      await res.json();

    return {
      title:
        mediaType === "movie"
          ? (
              data.title ||
              data.original_title
            )
          : (
              data.name ||
              data.original_name
            ),

      year: (
        data.release_date ||
        data.first_air_date ||
        ""
      ).substring(0, 4),

      imdbId:
        data.external_ids?.imdb_id,

      originalTitle:
        data.original_title ||
        data.original_name,
    };
  } catch (e) {
    console.error(
      "[MovieBox TMDB Error]",
      e.message
    );

    return null;
  }
}

// ============================================================
// SEARCH
// ============================================================

function normalizeTitle(s) {
  if (!s) {
    return "";
  }

  return String(s)
    .replace(
      /\[[^\]]*\]/g,
      " "
    )
    .replace(
      /\([^)]*\)/g,
      " "
    )
    .replace(
      /\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi,
      " "
    )
    .trim()
    .toLowerCase()
    .replace(
      /:/g,
      " "
    )
    .replace(
      /[^\w\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    );
}

async function searchMovieBox(
  query
) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;

  const body =
    JSON.stringify({
      page: 1,
      perPage: 20,
      keyword: query,
      restrictKid: 1,
    });

  const response =
    await movieBoxRequest(
      "POST",
      url,
      body
    );

  if (
    response &&
    response.data &&
    response.data.data &&
    response.data.data.results
  ) {
    let allSubjects =
      [];

    response.data.data.results
      .forEach(
        (group) => {
          if (
            group.subjects
          ) {
            allSubjects =
              allSubjects.concat(
                group.subjects
              );
          }
        }
      );

    return allSubjects;
  }

  return [];
}

function findBestMatch(
  subjects,
  tmdbTitle,
  tmdbYear,
  mediaType
) {
  const normTmdbTitle =
    normalizeTitle(
      tmdbTitle
    );

  const targetType =
    mediaType === "movie"
      ? 1
      : 2;

  let bestMatch =
    null;

  let bestScore =
    0;

  for (
    const subject of subjects
  ) {
    if (
      subject.subjectType !==
      targetType
    ) {
      continue;
    }

    const normTitle =
      normalizeTitle(
        subject.title
      );

    const year =
      subject.year ||
      (
        subject.releaseDate
          ? subject.releaseDate.substring(
              0,
              4
            )
          : null
      );

    let score = 0;

    if (
      normTitle ===
      normTmdbTitle
    ) {
      score += 50;
    } else if (
      normTitle.includes(
        normTmdbTitle
      ) ||
      normTmdbTitle.includes(
        normTitle
      )
    ) {
      score += 15;
    }

    if (
      tmdbYear &&
      year &&
      tmdbYear == year
    ) {
      score += 35;
    }

    if (
      score > bestScore
    ) {
      bestScore =
        score;

      bestMatch =
        subject;
    }
  }

  return bestScore >= 40
    ? bestMatch
    : null;
}

// ============================================================
// PLAYBACK PAGE
// ============================================================

function getPlaybackPage(
  subjectData,
  subjectId
) {
  const candidates = [
    subjectData.detailPath,
    subjectData.detail_path,
    subjectData.path,
    subjectData.slug,
  ];

  let detailPath =
    candidates.find(
      (value) =>
        typeof value ===
          "string" &&
        value.trim()
    );

  let webBase =
    PLAYER_BASE;

  for (
    const value of [
      subjectData.detailDomain,
      subjectData.webDomain,
      subjectData.webUrl,
      subjectData.detailUrl,
      subjectData.shareUrl,
    ]
  ) {
    if (
      typeof value !==
      "string"
    ) {
      continue;
    }

    try {
      const parsed =
        new URL(
          value.startsWith(
            "http"
          )
            ? value
            : `https://${value}`
        );

      if (
        !parsed.hostname.endsWith(
          "aoneroom.com"
        )
      ) {
        webBase =
          parsed.origin;
      }

      if (
        !detailPath &&
        parsed.pathname &&
        parsed.pathname !== "/"
      ) {
        detailPath =
          parsed.pathname;
      }

      break;
    } catch {}
  }

  if (!detailPath) {
    return {
      webBase,
      referer:
        `${webBase}/`,
    };
  }

  detailPath =
    detailPath
      .replace(
        /^\/+/,
        ""
      )
      .replace(
        /^movies\//,
        ""
      );

  const pageUrl =
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

  return {
    webBase,
    detailPath,
    referer:
      pageUrl.toString(),
  };
}

// ============================================================
// STREAM COLLECTION
// ============================================================

function collectStreams(
  playData
) {
  const streams =
    Array.isArray(
      playData?.streams
    )
      ? [
          ...playData.streams,
        ]
      : [];

  for (
    const [key, format]
    of [
      [
        "netDash",
        "DASH",
      ],
      [
        "netHls",
        "HLS",
      ],
    ]
  ) {
    const value =
      playData?.[key] ??
      playData?.data?.[key];

    const values =
      Array.isArray(value)
        ? value
        : value
          ? [value]
          : [];

    for (
      const item of values
    ) {
      if (
        typeof item ===
        "string"
      ) {
        streams.push({
          url: item,
          format,
        });
      } else if (
        item &&
        typeof item ===
          "object"
      ) {
        if (
          item.url ||
          item.playUrl ||
          item.resourceLink ||
          item.streamUrl
        ) {
          streams.push({
            ...item,
            format:
              item.format ||
              format,
          });
        } else {
          for (
            const [
              resolution,
              url,
            ] of Object.entries(
              item
            )
          ) {
            if (
              typeof url ===
                "string" &&
              /^https?:\/\//i.test(
                url
              )
            ) {
              streams.push({
                url,
                resolution,
                format,
              });
            } else if (
              url &&
              typeof url ===
                "object"
            ) {
              streams.push({
                ...url,
                resolution:
                  url.resolution ||
                  resolution,
                format:
                  url.format ||
                  format,
              });
            }
          }
        }
      }
    }
  }

  const seen =
    new Set();

  return streams.filter(
    (stream) => {
      const key =
        stream?.url ||
        stream?.playUrl ||
        stream?.resourceLink ||
        stream?.streamUrl;

      if (
        !key ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

// ============================================================
// AUDIO
// ============================================================

function getAudioLabel(
  stream,
  fallbackLanguage
) {
  const rawLanguage =
    [
      stream.languageName,
      stream.lanName,
      stream.language,
      stream.lan,
      fallbackLanguage,
    ].find(
      (value) =>
        typeof value ===
          "string" &&
        value.trim()
    ) ||
    "Unknown";

  let language =
    rawLanguage
      .replace(
        /\bdub\b/gi,
        " "
      )
      .replace(
        /\baudio\b/gi,
        " "
      )
      .replace(
        /[_-]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const languageNames = {
    ar: "Arabic",
    bn: "Bengali",
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    hi: "Hindi",
    id: "Indonesian",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    ml: "Malayalam",
    mr: "Marathi",
    pt: "Portuguese",
    ru: "Russian",
    ta: "Tamil",
    te: "Telugu",
    th: "Thai",
    tr: "Turkish",
    ur: "Urdu",
    vi: "Vietnamese",
    zh: "Chinese",
  };

  const languageCode =
    language.match(
      /^([a-z]{2,3})(?:\s|$)/i
    )?.[1]
      ?.toLowerCase();

  if (
    languageCode &&
    languageNames[
      languageCode
    ]
  ) {
    language =
      languageNames[
        languageCode
      ];
  } else if (
    language
  ) {
    language =
      language.charAt(0).toUpperCase() +
      language.slice(1);
  } else {
    language =
      "Unknown";
  }

  return `${language} Audio`;
}

// ============================================================
// SIGNED RESOURCE / POLICY
// ============================================================

function extractPolicyResource(
  signCookie
) {
  if (
    !signCookie ||
    typeof signCookie !==
      "string"
  ) {
    return null;
  }

  const edgeMatch =
    signCookie.match(
      /Edge-Cache-Cookie=urlprefix=([^:;\s]+)/
    );

  if (edgeMatch) {
    try {
      let std =
        edgeMatch[1]
          .replace(
            /_/g,
            "/"
          )
          .replace(
            /-/g,
            "+"
          );

      const rem =
        (
          4 -
          (
            std.length %
            4
          )
        ) % 4;

      if (rem > 0) {
        std +=
          "=".repeat(rem);
      }

      const decoded =
        CryptoJS.enc.Base64
          .parse(std)
          .toString(
            CryptoJS.enc.Utf8
          )
          .replace(
            /\/+$/,
            ""
          );

      if (decoded) {
        return `${decoded}/index.mpd`;
      }
    } catch {}
  }

  const cfMatch =
    signCookie.match(
      /CloudFront-Policy=([^;]+)/
    );

  if (cfMatch) {
    try {
      const policyRaw =
        cfMatch[1];

      let cfB64 =
        policyRaw
          .replace(
            /-/g,
            "+"
          )
          .replace(
            /~/g,
            "/"
          )
          .replace(
            /_/g,
            "="
          );

      const rem =
        cfB64.length % 4;

      if (rem > 0) {
        cfB64 +=
          "=".repeat(
            4 - rem
          );
      }

      let decodedJson =
        null;

      try {
        decodedJson =
          CryptoJS.enc.Base64
            .parse(cfB64)
            .toString(
              CryptoJS.enc.Utf8
            );
      } catch {
        let stdB64 =
          policyRaw
            .replace(
              /-/g,
              "+"
            )
            .replace(
              /_/g,
              "/"
            );

        const rem2 =
          stdB64.length % 4;

        if (rem2 > 0) {
          stdB64 +=
            "=".repeat(
              4 - rem2
            );
        }

        decodedJson =
          CryptoJS.enc.Base64
            .parse(stdB64)
            .toString(
              CryptoJS.enc.Utf8
            );
      }

      if (decodedJson) {
        const root =
          JSON.parse(
            decodedJson
          );

        const resource =
          root
            ?.Statement?.[0]
            ?.Resource;

        if (
          resource &&
          typeof resource ===
            "string"
        ) {
          const trimmed =
            resource.replace(
              /[\*\/]+$/,
              ""
            );

          return trimmed
            .toLowerCase()
            .endsWith(".mpd")
            ? trimmed
            : `${trimmed}/index.mpd`;
        }
      }
    } catch {}
  }

  return null;
}

// ============================================================
// STREAM LINKS
// ============================================================

async function getStreamLinks(
  subjectId,
  season = 0,
  episode = 0,
  mediaTitle = "",
  mediaType = "movie"
) {
  const subjectUrl =
    `${API_BASE}/wefeed-mobile-bff/subject-api/get` +
    `?subjectId=${subjectId}`;

  const detailRes =
    await movieBoxRequest(
      "GET",
      subjectUrl
    );

  if (
    !detailRes ||
    !detailRes.data ||
    !detailRes.data.data
  ) {
    return [];
  }

  const subjectData =
    detailRes.data.data;

  const playbackPage =
    getPlaybackPage(
      subjectData,
      subjectId
    );

  const subjectIds = [];

  let originalLang =
    "Original";

  const dubs =
    subjectData.dubs;

  if (
    Array.isArray(dubs)
  ) {
    dubs.forEach(
      (dub) => {
        if (
          dub.subjectId ==
          subjectId
        ) {
          originalLang =
            dub.lanName ||
            "Original";
        } else {
          subjectIds.push({
            id:
              dub.subjectId,
            lang:
              dub.lanName,
          });
        }
      }
    );
  }

  subjectIds.unshift({
    id: subjectId,
    lang: originalLang,
  });

  const allStreams = [];

  const playbackHeaders = {
    Origin:
      playbackPage.webBase,

    Referer:
      playbackPage.referer,

    "User-Agent":
      PLAYER_USER_AGENT,

    "Accept-Language":
      "en-US,en;q=0.9",

    "x-request-lang":
      "en",

    "x-vip-restrict":
      "0",

    "x-no-high-risk-restrict":
      "0",

    "X-Play-Mode":
      PLAY_MODE,
  };

  for (
    const item of subjectIds
  ) {
    try {
      const playParams =
        new URLSearchParams({
          subjectId:
            item.id,

          se:
            season,

          ep:
            episode,

          streamSignType:
            "1",
        });

      if (
        playbackPage.detailPath
      ) {
        playParams.set(
          "detailPath",
          playbackPage.detailPath
        );
      }

      playParams.set(
        "supportCodecs[hevc]",
        "1"
      );

      playParams.set(
        "supportCodecs[h264]",
        "1"
      );

      const playUrl =
        `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?` +
        playParams.toString();

      const playRes =
        await movieBoxRequest(
          "GET",
          playUrl,
          null,
          playbackHeaders
        );

      let hasValidStream =
        false;

      if (
        playRes &&
        playRes.data &&
        playRes.data.data
      ) {
        const playData =
          playRes.data.data;

        const streamsList =
          collectStreams(
            playData
          );

        if (
          streamsList.length
        ) {
          for (
            const stream of streamsList
          ) {
            const rawStreamUrl =
              stream.url ||
              stream.playUrl ||
              stream.resourceLink ||
              stream.streamUrl ||
              "";

            const signCookie =
              stream.signCookie ||
              null;

            const policyUrl =
              extractPolicyResource(
                signCookie
              );

            const finalStreamUrl =
              policyUrl ||
              rawStreamUrl;

            if (!finalStreamUrl) {
              continue;
            }

            if (
              finalStreamUrl.includes(
                "b164fbfb4347792950bdfbfb563d39d9"
              )
            ) {
              continue;
            }

            if (
              finalStreamUrl ===
                rawStreamUrl &&
              rawStreamUrl.includes(
                "/other/2026/09/"
              )
            ) {
              continue;
            }

            let formatType =
              getFormatType(
                finalStreamUrl
              );

            if (
              stream.format
            ) {
              const declaredFormat =
                String(
                  stream.format
                ).toUpperCase();

              formatType =
                [
                  "DASH",
                  "HLS",
                  "MP4",
                  "MKV",
                ].includes(
                  declaredFormat
                )
                  ? declaredFormat
                  : getFormatType(
                      finalStreamUrl
                    );
            }

            const qualLabel =
              stream.resolutions ||
              stream.resolution ||
              stream.quality ||
              "Auto";

            const qualNum =
              parseQualityNumber(
                qualLabel
              );

            const quality =
              qualNum
                ? `${qualNum}p`
                : "Auto";

            const audioLabel =
              getAudioLabel(
                stream,
                item.lang
              );

            const streamId =
              stream.id ||
              `${item.id}|${season}|${episode}`;

            const subtitles =
              await fetchSubtitles(
                item.id,
                streamId,
                item.lang
              );

            const signHeaderKey =
              stream.signHeaderKey ||
              stream.sign_header_key ||
              "Cookie";

            const finalHeaders = {
              ...playbackHeaders,

              ...(signCookie
                ? {
                    [signHeaderKey]:
                      signCookie,
                  }
                : {}),
            };

            // ==================================================
            // STREAM DEBUG
            //
            // Do NOT print the complete signed URL/cookie.
            // We only need enough information to diagnose
            // playback without dumping credentials/tokens.
            // ==================================================

            let hostname = null;
            let pathname = null;

            try {
              const parsedUrl =
                new URL(
                  finalStreamUrl
                );

              hostname =
                parsedUrl.hostname;

              pathname =
                parsedUrl.pathname;
            } catch {}

            console.log(
              "[MovieBox STREAM DEBUG]",
              JSON.stringify({
                urlPreview:
                  finalStreamUrl.slice(
                    0,
                    300
                  ),

                urlLength:
                  finalStreamUrl.length,

                hostname,

                pathname,

                quality,

                format:
                  formatType,

                audio:
                  audioLabel,

                streamId:
                  streamId || null,

                rawStreamUrl:
                  rawStreamUrl.slice(
                    0,
                    200
                  ),

                hasSignCookie:
                  Boolean(
                    signCookie
                  ),

                signHeaderKey:
                  signCookie
                    ? signHeaderKey
                    : null,

                headers: {
                  ...finalHeaders,

                  // Never log the complete cookie.
                  ...(signCookie
                    ? {
                        [signHeaderKey]:
                          "[REDACTED]",
                      }
                    : {}),
                },
              })
            );

            allStreams.push({
              name:
                "MovieBox",

              title:
                `${mediaTitle}` +
                `${
                  season > 0
                    ? ` S${season}E${episode}`
                    : ""
                }` +
                ` - ${quality}` +
                ` (${audioLabel})` +
                ` [${formatType}]`,

              url:
                finalStreamUrl,

              quality,

              headers:
                finalHeaders,

              subtitles,

              provider:
                "moviebox",
            });

            hasValidStream =
              true;
          }
        }

        // ======================================================
        // RESOURCE DETECTOR FALLBACK
        // ======================================================

        if (
          !hasValidStream
        ) {
          let detectors =
            playData.resourceDetectors;

          if (
            !Array.isArray(
              detectors
            )
          ) {
            detectors =
              subjectData.resourceDetectors;
          }

          if (
            Array.isArray(
              detectors
            )
          ) {
            for (
              const detector of detectors
            ) {
              if (
                !Array.isArray(
                  detector.resolutionList
                )
              ) {
                continue;
              }

              for (
                const video of detector.resolutionList
              ) {
                if (
                  !video.resourceLink
                ) {
                  continue;
                }

                const videoSe =
                  video.se != null
                    ? video.se
                    : 0;

                const videoEp =
                  video.ep != null
                    ? video.ep
                    : 0;

                if (
                  (
                    season > 0 ||
                    episode > 0
                  ) &&
                  (
                    videoSe !==
                      season ||
                    videoEp !==
                      episode
                  )
                ) {
                  continue;
                }

                const quality =
                  video.resolution
                    ? `${video.resolution}p`
                    : "Auto";

                const audioLabel =
                  getAudioLabel(
                    {},
                    item.lang
                  );

                console.log(
                  "[MovieBox STREAM DEBUG]",
                  JSON.stringify({
                    urlPreview:
                      String(
                        video.resourceLink
                      ).slice(
                        0,
                        300
                      ),

                    urlLength:
                      String(
                        video.resourceLink
                      ).length,

                    quality,

                    format:
                      getFormatType(
                        video.resourceLink
                      ),

                    audio:
                      audioLabel,

                    fallback:
                      true,

                    headers:
                      playbackHeaders,
                  })
                );

                allStreams.push({
                  name:
                    "MovieBox",

                  title:
                    `${mediaTitle}` +
                    `${
                      season > 0
                        ? ` S${season}E${episode}`
                        : ""
                    }` +
                    ` - ${quality}` +
                    ` (${audioLabel})` +
                    ` [Fallback]`,

                  url:
                    video.resourceLink,

                  quality,

                  headers: {
                    ...playbackHeaders,
                  },

                  provider:
                    "moviebox",
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(
        `[MovieBox Stream Fetch Error] ID: ${item.id}`,
        err.message
      );
    }
  }

  const qualityRank = {
    "2160p": 2160,
    "4k": 2160,
    "1440p": 1440,
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
    "240p": 240,
    "auto": 1,
  };

  allStreams.sort(
    (a, b) => {
      const qa =
        qualityRank[
          a.quality?.toLowerCase()
        ] || 0;

      const qb =
        qualityRank[
          b.quality?.toLowerCase()
        ] || 0;

      return qb - qa;
    }
  );

  return allStreams;
}

// ============================================================
// QUALITY
// ============================================================

function parseQualityNumber(
  value
) {
  const match =
    String(value || "")
      .match(
        /(\d{3,4})/
      );

  return match
    ? parseInt(
        match[1],
        10
      )
    : 0;
}

function getFormatType(
  url
) {
  const u =
    String(url || "")
      .toLowerCase();

  if (
    u.includes(".mpd")
  ) {
    return "DASH";
  }

  if (
    u.includes(".m3u8")
  ) {
    return "HLS";
  }

  if (
    u.includes(".mp4")
  ) {
    return "MP4";
  }

  if (
    u.includes(".mkv")
  ) {
    return "MKV";
  }

  return "VIDEO";
}

// ============================================================
// SUBTITLES
// ============================================================

async function fetchSubtitles(
  subjectId,
  streamId,
  langLabel
) {
  const subtitles = [];

  try {
    const streamCapUrl =
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions` +
      `?subjectId=${subjectId}` +
      `&streamId=${streamId}`;

    const capRes =
      await movieBoxRequest(
        "GET",
        streamCapUrl,
        null
      );

    if (
      capRes &&
      capRes.data &&
      capRes.data.data &&
      Array.isArray(
        capRes.data.data.extCaptions
      )
    ) {
      capRes.data.data.extCaptions
        .forEach(
          (cap) => {
            if (!cap.url) {
              return;
            }

            subtitles.push({
              url:
                cap.url,

              language:
                cap.language ||
                cap.lanName ||
                cap.lan ||
                "en",

              name:
                `${
                  cap.lanName ||
                  cap.language ||
                  "Subtitle"
                } (${langLabel})`,

              headers: {
                Referer:
                  API_BASE,
              },
            });
          }
        );
    }
  } catch {}

  try {
    const extCapUrl =
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions` +
      `?subjectId=${subjectId}` +
      `&resourceId=${streamId}` +
      `&episode=0`;

    const extRes =
      await movieBoxRequest(
        "GET",
        extCapUrl,
        null
      );

    if (
      extRes &&
      extRes.data &&
      extRes.data.data &&
      Array.isArray(
        extRes.data.data.extCaptions
      )
    ) {
      extRes.data.data.extCaptions
        .forEach(
          (cap) => {
            if (!cap.url) {
              return;
            }

            subtitles.push({
              url:
                cap.url,

              language:
                cap.lan ||
                cap.lanName ||
                cap.language ||
                "en",

              name:
                `${
                  cap.lanName ||
                  cap.lan ||
                  "Subtitle"
                } (${langLabel})`,

              headers: {
                Referer:
                  API_BASE,
              },
            });
          }
        );
    }
  } catch {}

  return subtitles;
}

// ============================================================
// PUBLIC STREMIO ADAPTER
// ============================================================

export async function getStreams({
  imdbId,
  type,
  season = 0,
  episode = 0,
}) {
  if (!imdbId) {
    return [];
  }

  const mediaType =
    type === "movie"
      ? "movie"
      : "tv";

  console.log(
    `[MovieBox] Resolving IMDb ${imdbId} -> TMDB`
  );

  console.log(
    `[MovieBox] Client: ${PACKAGE_INFO.package_name}/${PACKAGE_INFO.version_code}`
  );

  console.log(
    `[MovieBox] Device: ${DEVICE_BRAND} ${DEVICE_MODEL} Android ${ANDROID_VERSION}`
  );

  console.log(
    `[MovieBox] Region: ${REGION} | Timezone: ${TIMEZONE}`
  );

  console.log(
    `[MovieBox] X-Forwarded-For: ${SPOOFED_IP}`
  );

  const tmdbResult =
    await resolveImdbToTmdb(
      imdbId,
      mediaType
    );

  if (
    !tmdbResult ||
    !tmdbResult.id
  ) {
    console.log(
      `[MovieBox] No TMDB result for IMDb: ${imdbId}`
    );

    return [];
  }

  const tmdbId =
    tmdbResult.id;

  const details =
    await fetchTmdbDetails(
      tmdbId,
      mediaType
    );

  if (!details) {
    return [];
  }

  console.log(
    `[MovieBox] Searching: ${details.title}`
  );

  let subjects =
    await searchMovieBox(
      details.title
    );

  let bestMatch =
    findBestMatch(
      subjects,
      details.title,
      details.year,
      mediaType
    );

  if (
    !bestMatch &&
    details.originalTitle &&
    details.originalTitle !==
      details.title
  ) {
    subjects =
      await searchMovieBox(
        details.originalTitle
      );

    bestMatch =
      findBestMatch(
        subjects,
        details.originalTitle,
        details.year,
        mediaType
      );
  }

  if (!bestMatch) {
    console.log(
      `[MovieBox] No matching content found for: ${details.title}`
    );

    return [];
  }

  console.log(
    `[MovieBox] Matched: ${bestMatch.title}`
  );

  const s =
    mediaType === "tv"
      ? Number(season) || 0
      : 0;

  const e =
    mediaType === "tv"
      ? Number(episode) || 0
      : 0;

  return getStreamLinks(
    bestMatch.subjectId,
    s,
    e,
    details.title,
    mediaType
  );
}
