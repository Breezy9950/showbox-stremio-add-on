import CryptoJS from "crypto-js";

// =========================================================
// MOVIEBOX CONSTANTS
// =========================================================

const API_BASE =
  "https://api3.aoneroom.com";

const PLAYER_BASE =
  "https://moviebox.ph";

const PLAYER_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36";

const HOST_POOL = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com"
];

const KEY_B64_DEFAULT =
  "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";

const KEY_B64_ALT =
  "WHFuMm5uTzQxL0w5Mm04bVNMQQ==";

const TMDB_API_KEY =
  "1865f43a0549ca50d341dd9ab8b29f49";

const TMDB_BASE_URL =
  "https://api.themoviedb.org/3";

const BRAND_MODELS = {
  Samsung: [
    "SM-S918B",
    "SM-A528B",
    "SM-M336B"
  ],

  Xiaomi: [
    "2201117TI",
    "M2012K11AI",
    "Redmi Note 11"
  ],

  OnePlus: [
    "LE2111",
    "CPH2449",
    "IN2023"
  ],

  Google: [
    "Pixel 6",
    "Pixel 7",
    "Pixel 8"
  ],

  Realme: [
    "RMX3085",
    "RMX3360",
    "RMX3551"
  ]
};

const TOKEN_URL =
  "https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1";

const PACKAGE_INFO = {
  package_name:
    "com.community.mbox.in",

  version_name:
    "4.0.03.0920.03",

  version_code:
    50020130
};

// =========================================================
// CRYPTO
// =========================================================

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

// =========================================================
// SESSION STATE
// =========================================================

let deviceId = "";
let selectedBrand = "";
let selectedModel = "";
let bearerToken = null;

// =========================================================
// TOKEN
// =========================================================

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
        .replace(
          /-/g,
          "+"
        )
        .replace(
          /_/g,
          "/"
        );

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
    Date.now() / 1000 + 3600
  );
}

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

  const response =
    await movieBoxRequest(
      "GET",
      TOKEN_URL,
      null,
      {},
      true
    );

  if (
    response?.headers
  ) {
    const xUser =
      response.headers.get(
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

          return token;
        }

      } catch (error) {
        console.error(
          "[MovieBox] Failed to parse x-user header:",
          error?.message ||
            error
        );
      }
    }
  }

  return bearerToken || "";
}

// =========================================================
// DEVICE
// =========================================================

function initializeSession() {
  if (deviceId) {
    return;
  }

  const chars =
    "0123456789abcdef";

  for (
    let i = 0;
    i < 32;
    i++
  ) {
    deviceId +=
      chars[
        Math.floor(
          Math.random() *
            chars.length
        )
      ];
  }

  const brands =
    Object.keys(
      BRAND_MODELS
    );

  selectedBrand =
    brands[
      Math.floor(
        Math.random() *
          brands.length
      )
    ];

  const models =
    BRAND_MODELS[
      selectedBrand
    ];

  selectedModel =
    models[
      Math.floor(
        Math.random() *
          models.length
      )
    ];
}

// =========================================================
// SIGNATURE HELPERS
// =========================================================

function md5(input) {
  return CryptoJS.MD5(
    input
  ).toString(
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
    String(
      timestamp ||
        Date.now()
    );

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

    if (
      params.length > 0
    ) {
      query =
        params
          .map(key => {
            const values =
              urlObj.searchParams
                .getAll(key);

            return values
              .map(
                value =>
                  `${key}=${value}`
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
          /https?:\/\/[^/]+/,
          ""
        );

      const qParts =
        parts[1]
          .split("&")
          .sort();

      query =
        qParts.join("&");

    } else {
      path =
        url.replace(
          /https?:\/\/[^/]+/,
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

    const totalBytes =
      bodyWords.sigBytes;

    bodyHash =
      md5(bodyWords);

    bodyLength =
      totalBytes.toString();
  }

  return `${method.toUpperCase()}
${accept || ""}
${contentType || ""}
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

  return `${timestamp}|2|${signatureB64}`;
}

// =========================================================
// MOVIEBOX REQUEST
// =========================================================

async function movieBoxRequest(
  method,
  url,
  body = null,
  customHeaders = {},
  isTokenFetch = false
) {
  initializeSession();

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

  const xClientInfo =
    JSON.stringify({
      ...PACKAGE_INFO,

      os:
        "android",

      os_version:
        "14",

      device_id:
        deviceId,

      install_store:
        "official",

      gaid:
        "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d",

      brand:
        selectedBrand.toLowerCase(),

      model:
        selectedModel,

      system_language:
        "en",

      net:
        "NETWORK_WIFI",

      region:
        "IN",

      timezone:
        "Asia/Calcutta",

      sp_code:
        ""
    });

  const headers = {
    Accept:
      accept,

    "Content-Type":
      headerContentType,

    "x-client-token":
      xClientToken,

    "x-tr-signature":
      xTrSignature,

    "User-Agent":
      `${PACKAGE_INFO.package_name}/${PACKAGE_INFO.version_code} (Linux; U; Android 14; en_IN; ${selectedModel}; Build/UD1A.230803.041; Cronet/145.0.7582.0)`,

    "x-client-info":
      xClientInfo,

    "x-client-status":
      "0",

    ...customHeaders
  };

  if (
    !isTokenFetch
  ) {
    const token =
      await getCachedToken();

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }
  }

  const options = {
    method,
    headers
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
        host =>
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
              host =>
                new URL(host).host
            )
            .filter(
              host =>
                host !==
                originalUrl.host
            )
        ]
      : [
          originalUrl.host
        ];

  const maxAttempts =
    Math.min(
      3,
      hosts.length
    );

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

      const response =
        await fetch(
          requestUrl.toString(),
          options
        );

      if (
        !response.ok
      ) {
        if (
          (
            response.status ===
              403 ||
            response.status ===
              429 ||
            response.status >=
              500
          ) &&
          attempt + 1 <
            maxAttempts
        ) {
          continue;
        }

        return null;
      }

      const text =
        await response.text();

      let parsed;

      try {
        parsed =
          JSON.parse(text);

      } catch {
        parsed =
          text;
      }

      const xUser =
        response.headers.get(
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

        } catch {
          // Ignore malformed x-user.
        }
      }

      return {
        data:
          parsed,

        headers:
          response.headers
      };

    } catch (error) {
      if (
        attempt + 1 ===
        maxAttempts
      ) {
        console.error(
          "[MovieBox Request Error]",
          error?.message ||
            error
        );
      }
    }
  }

  return null;
}

// =========================================================
// TMDB
// =========================================================

async function findTmdbByImdb(
  imdbId,
  mediaType
) {
  try {
    const url =
      `${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;

    const response =
      await fetch(url, {
        headers: {
          Accept:
            "application/json"
        }
      });

    if (
      !response.ok
    ) {
      console.error(
        "[MovieBox TMDB] Find failed:",
        response.status
      );

      return null;
    }

    const data =
      await response.json();

    const results =
      mediaType ===
      "series"
        ? data.tv_results
        : data.movie_results;

    if (
      !Array.isArray(
        results
      ) ||
      !results.length
    ) {
      return null;
    }

    return results[0]?.id ||
      null;

  } catch (error) {
    console.error(
      "[MovieBox TMDB] IMDb lookup failed:",
      error?.message ||
        error
    );

    return null;
  }
}

async function fetchTmdbDetails(
  tmdbId,
  mediaType
) {
  try {
    const tmdbType =
      mediaType ===
      "series"
        ? "tv"
        : "movie";

    const url =
      `${TMDB_BASE_URL}/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

    const response =
      await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0",

          Accept:
            "application/json"
        }
      });

    if (
      !response.ok
    ) {
      return null;
    }

    const data =
      await response.json();

    return {
      title:
        tmdbType ===
        "movie"
          ? data.title ||
            data.original_title
          : data.name ||
            data.original_name,

      year:
        (
          data.release_date ||
          data.first_air_date ||
          ""
        ).substring(0, 4),

      imdbId:
        data.external_ids
          ?.imdb_id,

      originalTitle:
        data.original_title ||
        data.original_name
    };

  } catch (error) {
    console.error(
      "[MovieBox TMDB Error]",
      error?.message ||
        error
    );

    return null;
  }
}

// =========================================================
// TITLE MATCHING
// =========================================================

function normalizeTitle(
  value
) {
  if (!value) {
    return "";
  }

  return String(value)
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

function findBestMatch(
  subjects,
  tmdbTitle,
  tmdbYear,
  mediaType
) {
  const normalizedTmdbTitle =
    normalizeTitle(
      tmdbTitle
    );

  const targetType =
    mediaType ===
    "movie"
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

    const title =
      subject.title;

    const normalizedTitle =
      normalizeTitle(
        title
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

    let score =
      0;

    if (
      normalizedTitle ===
      normalizedTmdbTitle
    ) {
      score += 50;

    } else if (
      normalizedTitle.includes(
        normalizedTmdbTitle
      ) ||
      normalizedTmdbTitle.includes(
        normalizedTitle
      )
    ) {
      score += 15;
    }

    if (
      tmdbYear &&
      year &&
      tmdbYear ==
        year
    ) {
      score += 35;
    }

    if (
      score >
      bestScore
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

// =========================================================
// MOVIEBOX SEARCH
// =========================================================

async function searchMovieBox(
  query
) {
  const url =
    `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;

  const body =
    JSON.stringify({
      page:
        1,

      perPage:
        20,

      keyword:
        query,

      restrictKid:
        1
    });

  const response =
    await movieBoxRequest(
      "POST",
      url,
      body
    );

  if (
    response?.data?.data
      ?.results
  ) {
    let subjects =
      [];

    for (
      const group of
        response.data.data
          .results
    ) {
      if (
        Array.isArray(
          group.subjects
        )
      ) {
        subjects =
          subjects.concat(
            group.subjects
          );
      }
    }

    return subjects;
  }

  return [];
}

// =========================================================
// PLAYBACK PAGE
// =========================================================

function getPlaybackPage(
  subjectData,
  subjectId
) {
  const candidates = [
    subjectData.detailPath,
    subjectData.detail_path,
    subjectData.path,
    subjectData.slug
  ];

  let detailPath =
    candidates.find(
      value =>
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
      subjectData.shareUrl
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
        parsed.pathname !==
          "/"
      ) {
        detailPath =
          parsed.pathname;
      }

      break;

    } catch {
      // Ignore invalid URL.
    }
  }

  if (
    !detailPath
  ) {
    return {
      webBase,

      referer:
        `${webBase}/`
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
      pageUrl.toString()
  };
}

// =========================================================
// STREAM HELPERS
// =========================================================

function collectStreams(
  playData
) {
  const streams =
    Array.isArray(
      playData?.streams
    )
      ? [
          ...playData.streams
        ]
      : [];

  for (
    const [key, format] of [
      ["netDash", "DASH"],
      ["netHls", "HLS"]
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
          url:
            item,

          format
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
              format
          });

        } else {
          for (
            const [
              resolution,
              url
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

                format
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
                  format
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
    stream => {
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

function parseQualityNumber(
  value
) {
  const match =
    String(
      value || ""
    ).match(
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
  const value =
    String(
      url || ""
    ).toLowerCase();

  if (
    value.includes(
      ".mpd"
    )
  ) {
    return "DASH";
  }

  if (
    value.includes(
      ".m3u8"
    )
  ) {
    return "HLS";
  }

  if (
    value.includes(
      ".mp4"
    )
  ) {
    return "MP4";
  }

  if (
    value.includes(
      ".mkv"
    )
  ) {
    return "MKV";
  }

  return "VIDEO";
}

// =========================================================
// SIGNED RESOURCE
// =========================================================

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
      let standard =
        edgeMatch[1]
          .replace(
            /_/g,
            "/"
          )
          .replace(
            /-/g,
            "+"
          );

      const remainder =
        (
          4 -
          (
            standard.length %
            4
          )
        ) %
        4;

      if (
        remainder > 0
      ) {
        standard +=
          "=".repeat(
            remainder
          );
      }

      const decoded =
        CryptoJS.enc.Base64
          .parse(
            standard
          )
          .toString(
            CryptoJS.enc.Utf8
          )
          .replace(
            /\/+$/,
            ""
          );

      if (
        decoded
      ) {
        return `${decoded}/index.mpd`;
      }

    } catch {
      // Continue to CloudFront parsing.
    }
  }

  const cfMatch =
    signCookie.match(
      /CloudFront-Policy=([^;]+)/
    );

  if (
    cfMatch
  ) {
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

      const remainder =
        cfB64.length % 4;

      if (
        remainder > 0
      ) {
        cfB64 +=
          "=".repeat(
            4 - remainder
          );
      }

      const decodedJson =
        CryptoJS.enc.Base64
          .parse(
            cfB64
          )
          .toString(
            CryptoJS.enc.Utf8
          );

      if (
        !decodedJson
      ) {
        return null;
      }

      const root =
        JSON.parse(
          decodedJson
        );

      const resource =
        root?.Statement?.[0]
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

    } catch {
      // Ignore malformed policy.
    }
  }

  return null;
}

// =========================================================
// AUDIO
// =========================================================

function getAudioLabel(
  stream,
  fallbackLanguage
) {
  const rawLanguage =
    [
      stream?.languageName,
      stream?.lanName,
      stream?.language,
      stream?.lan,
      fallbackLanguage
    ].find(
      value =>
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
    ar:
      "Arabic",

    bn:
      "Bengali",

    de:
      "German",

    en:
      "English",

    es:
      "Spanish",

    fr:
      "French",

    hi:
      "Hindi",

    id:
      "Indonesian",

    it:
      "Italian",

    ja:
      "Japanese",

    ko:
      "Korean",

    ml:
      "Malayalam",

    mr:
      "Marathi",

    pt:
      "Portuguese",

    ru:
      "Russian",

    ta:
      "Tamil",

    te:
      "Telugu",

    th:
      "Thai",

    tr:
      "Turkish",

    ur:
      "Urdu",

    vi:
      "Vietnamese",

    zh:
      "Chinese"
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
      language.charAt(0)
        .toUpperCase() +
      language.slice(1);

  } else {
    language =
      "Unknown";
  }

  return `${language} Audio`;
}

// =========================================================
// SUBTITLES
// =========================================================

async function fetchSubtitles(
  subjectId,
  streamId,
  langLabel
) {
  const subtitles =
    [];

  try {
    const url =
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${encodeURIComponent(subjectId)}&streamId=${encodeURIComponent(streamId)}`;

    const response =
      await movieBoxRequest(
        "GET",
        url,
        null
      );

    const captions =
      response?.data?.data
        ?.extCaptions;

    if (
      Array.isArray(
        captions
      )
    ) {
      for (
        const caption of captions
      ) {
        if (
          caption?.url
        ) {
          subtitles.push({
            url:
              caption.url,

            language:
              caption.language ||
              caption.lanName ||
              caption.lan ||
              "en",

            name:
              `${caption.lanName || caption.language || "Subtitle"} (${langLabel})`,

            headers: {
              Referer:
                API_BASE
            }
          });
        }
      }
    }

  } catch {
    // Subtitle failure must not remove the stream.
  }

  try {
    const url =
      `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${encodeURIComponent(subjectId)}&resourceId=${encodeURIComponent(streamId)}&episode=0`;

    const response =
      await movieBoxRequest(
        "GET",
        url,
        null
      );

    const captions =
      response?.data?.data
        ?.extCaptions;

    if (
      Array.isArray(
        captions
      )
    ) {
      for (
        const caption of captions
      ) {
        if (
          caption?.url
        ) {
          subtitles.push({
            url:
              caption.url,

            language:
              caption.lan ||
              caption.lanName ||
              caption.language ||
              "en",

            name:
              `${caption.lanName || caption.lan || "Subtitle"} (${langLabel})`,

            headers: {
              Referer:
                API_BASE
            }
          });
        }
      }
    }

  } catch {
    // Subtitle failure must not remove the stream.
  }

  return subtitles;
}

// =========================================================
// BUILD ONE MOVIEBOX STREAM
// =========================================================

async function buildStream(
  stream,
  item,
  season,
  episode,
  mediaTitle,
  playbackHeaders
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

  if (
    !finalStreamUrl
  ) {
    return null;
  }

  /*
   * Preserve the exclusions from
   * the supplied working plugin.
   */

  if (
    finalStreamUrl.includes(
      "b164fbfb4347792950bdfbfb563d39d9"
    )
  ) {
    return null;
  }

  if (
    finalStreamUrl ===
      rawStreamUrl &&
    rawStreamUrl.includes(
      "/other/2026/09/"
    )
  ) {
    return null;
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

    if (
      [
        "DASH",
        "HLS",
        "MP4",
        "MKV"
      ].includes(
        declaredFormat
      )
    ) {
      formatType =
        declaredFormat;
    }
  }

  const qualityValue =
    stream.resolutions ||
    stream.resolution ||
    stream.quality ||
    "Auto";

  const qualityNumber =
    parseQualityNumber(
      qualityValue
    );

  const quality =
    qualityNumber
      ? `${qualityNumber}p`
      : "Auto";

  /*
   * MovieBox does not have the ShowBox
   * ORG quality. 2160p is displayed as 4K.
   */

  const displayQuality =
    quality === "2160p"
      ? "4K"
      : quality;

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

  const headers = {
    ...playbackHeaders
  };

  if (
    signCookie
  ) {
    headers[
      signHeaderKey
    ] =
      signCookie;
  }

  return {
    name:
      displayQuality ===
      "Auto"
        ? "MovieBox"
        : `MovieBox ${displayQuality}`,

    title:
      `${mediaTitle}${season > 0 ? ` S${season}E${episode}` : ""}`,

    url:
      finalStreamUrl,

    quality,

    headers,

    subtitles,

    provider:
      "moviebox"
  };
}

// =========================================================
// STREAM LINKS
// =========================================================

async function getStreamLinks(
  subjectId,
  season = 0,
  episode = 0,
  mediaTitle = "",
  mediaType = "movie"
) {
  const subjectUrl =
    `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(subjectId)}`;

  const detailResponse =
    await movieBoxRequest(
      "GET",
      subjectUrl
    );

  if (
    !detailResponse?.data?.data
  ) {
    return [];
  }

  const subjectData =
    detailResponse.data.data;

  const playbackPage =
    getPlaybackPage(
      subjectData,
      subjectId
    );

  const subjectIds =
    [];

  let originalLang =
    "Original";

  const dubs =
    subjectData.dubs;

  if (
    Array.isArray(dubs)
  ) {
    for (
      const dub of dubs
    ) {
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
            dub.lanName
        });
      }
    }
  }

  subjectIds.unshift({
    id:
      subjectId,

    lang:
      originalLang
  });

  const playbackHeaders = {
    Origin:
      playbackPage.webBase,

    Referer:
      playbackPage.referer,

    "User-Agent":
      PLAYER_USER_AGENT,

    "x-request-lang":
      "en",

    "x-vip-restrict":
      "0",

    "x-no-high-risk-restrict":
      "0"
  };

  /*
   * Fetch every language/dub concurrently.
   *
   * The old plugin did:
   *
   *   dub 1 -> wait
   *   dub 2 -> wait
   *   dub 3 -> wait
   *
   * This version does all of them together.
   */

  const subjectResults =
    await Promise.all(
      subjectIds.map(
        async item => {
          try {
            const playParams =
              new URLSearchParams({
                subjectId:
                  item.id,

                se:
                  String(season),

                ep:
                  String(episode),

                streamSignType:
                  "1"
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
              `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?${playParams.toString()}`;

            const playResponse =
              await movieBoxRequest(
                "GET",
                playUrl,
                null,
                playbackHeaders
              );

            if (
              !playResponse?.data?.data
            ) {
              return [];
            }

            const playData =
              playResponse.data.data;

            const streamsList =
              collectStreams(
                playData
              );

            if (
              streamsList.length
            ) {
              /*
               * Build every stream concurrently too,
               * including subtitle lookups.
               */

              const streamResults =
                await Promise.all(
                  streamsList.map(
                    stream =>
                      buildStream(
                        stream,
                        item,
                        season,
                        episode,
                        mediaTitle,
                        playbackHeaders
                      )
                  )
                );

              return streamResults.filter(
                Boolean
              );
            }

            // ------------------------------------------------
            // Resource detector fallback
            // ------------------------------------------------

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
              !Array.isArray(
                detectors
              )
            ) {
              return [];
            }

            const fallbackStreams =
              [];

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

                const videoSeason =
                  video.se != null
                    ? video.se
                    : 0;

                const videoEpisode =
                  video.ep != null
                    ? video.ep
                    : 0;

                if (
                  (
                    season > 0 ||
                    episode > 0
                  ) &&
                  (
                    videoSeason !==
                      season ||
                    videoEpisode !==
                      episode
                  )
                ) {
                  continue;
                }

                const quality =
                  video.resolution
                    ? `${video.resolution}p`
                    : "Auto";

                const displayQuality =
                  quality ===
                  "2160p"
                    ? "4K"
                    : quality;

                fallbackStreams.push({
                  name:
                    displayQuality ===
                    "Auto"
                      ? "MovieBox"
                      : `MovieBox ${displayQuality}`,

                  title:
                    `${mediaTitle}${season > 0 ? ` S${season}E${episode}` : ""}`,

                  url:
                    video.resourceLink,

                  quality,

                  headers: {
                    ...playbackHeaders
                  },

                  subtitles: [],

                  provider:
                    "moviebox"
                });
              }
            }

            return fallbackStreams;

          } catch (error) {
            console.error(
              `[MovieBox Stream Fetch Error] ID: ${item.id}`,
              error?.message ||
                error
            );

            return [];
          }
        }
      )
    );

  /*
   * Flatten only after every MovieBox request has
   * completed. This means stream.js receives the
   * complete MovieBox collection at once.
   */

  const allStreams =
    subjectResults.flat();

  /*
   * Remove duplicate URLs while preserving
   * MovieBox's own stream order.
   */

  const seen =
    new Set();

  const uniqueStreams =
    allStreams.filter(
      stream => {
        if (
          !stream?.url ||
          seen.has(
            stream.url
          )
        ) {
          return false;
        }

        seen.add(
          stream.url
        );

        return true;
      }
    );

  const qualityRank = {
    "2160p":
      2160,

    "4k":
      2160,

    "1440p":
      1440,

    "1080p":
      1080,

    "720p":
      720,

    "480p":
      480,

    "360p":
      360,

    "240p":
      240,

    "auto":
      1
  };

  /*
   * Sort MovieBox streams internally only.
   * stream.js will later handle the provider
   * grouping together with FebBox.
   */

  uniqueStreams.sort(
    (a, b) => {
      const qa =
        qualityRank[
          String(
            a.quality || ""
          ).toLowerCase()
        ] || 0;

      const qb =
        qualityRank[
          String(
            b.quality || ""
          ).toLowerCase()
        ] || 0;

      return qb - qa;
    }
  );

  return uniqueStreams;
}

// =========================================================
// PUBLIC PROVIDER
// =========================================================

export async function getStreams({
  imdbId,
  type,
  season,
  episode
}) {
  try {
    console.log(
      `[MovieBox] Querying IMDb: ${imdbId}, Type: ${type}, S${season || 0}E${episode || 0}`
    );

    /*
     * The supplied working plugin accepts TMDB IDs.
     * Your Stremio addon receives IMDb IDs.
     *
     * Resolve IMDb -> TMDB here.
     */

    const tmdbId =
      await findTmdbByImdb(
        imdbId,
        type
      );

    if (
      !tmdbId
    ) {
      console.log(
        `[MovieBox] Could not resolve IMDb ID: ${imdbId}`
      );

      return [];
    }

    const mediaType =
      type === "series"
        ? "tv"
        : "movie";

    const details =
      await fetchTmdbDetails(
        tmdbId,
        type
      );

    if (
      !details
    ) {
      return [];
    }

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

    if (
      !bestMatch
    ) {
      console.log(
        `[MovieBox] No matching content found for: ${details.title}`
      );

      return [];
    }

    const movieSeason =
      type === "series"
        ? season
        : 0;

    const movieEpisode =
      type === "series"
        ? episode
        : 0;

    return await getStreamLinks(
      bestMatch.subjectId,
      movieSeason,
      movieEpisode,
      details.title,
      mediaType
    );

  } catch (error) {
    console.error(
      "[MovieBox] Provider failed:",
      error?.stack ||
        error?.message ||
        error
    );

    return [];
  }
}
