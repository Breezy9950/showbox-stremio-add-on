import CryptoJS from "crypto-js";

// =========================================================
// FEBBOX PROVIDER
// =========================================================
//
// Everything in this file exists specifically because of
// ShowBox / FebBox.
//
// Provider-specific limits, requests, parsing, metadata,
// stream construction, and URL handling all stay here.
//
// =========================================================

const UPSTREAM_TIMEOUT_MS =
  10000;

const MAX_FILES_PER_REQUEST =
  25;

const QUALITY_REQUEST_CONCURRENCY =
  5;

// ---------------------------------------------------------
// Upstream timeout
// ---------------------------------------------------------

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = UPSTREAM_TIMEOUT_MS
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );

  } finally {
    clearTimeout(
      timer
    );
  }
}

// ---------------------------------------------------------
// ShowBox web search
// ---------------------------------------------------------

const SHOWBOX_WEB_API =
  "https://showbox.media";

const SHOWBOX_SEARCH_HEADERS = {
  "Accept":
    "application/json, text/html, */*",

  "Accept-Language":
    "en",

  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
};

// ---------------------------------------------------------
// Parse ShowBox search result
// ---------------------------------------------------------

function parseShowBoxSearchHref(
  html
) {
  const patterns = [
    /class="film-name[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"/i,

    /<a[^>]+href="([^"]+)"[^>]*class="[^"]*film-name[^"]*"/i
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      html.match(
        pattern
      );

    if (
      match?.[1]
    ) {
      return new URL(
        match[1],
        SHOWBOX_WEB_API
      ).href;
    }
  }

  return null;
}

// ---------------------------------------------------------
// Parse ShowBox media ID
// ---------------------------------------------------------

function parseShowBoxHeadingId(
  html
) {
  const match =
    html.match(
      /class="heading-name[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/i
    );

  if (
    !match?.[1]
  ) {
    return null;
  }

  const id =
    match[1]
      .split("/")
      .filter(Boolean)
      .pop();

  return id || null;
}

// ---------------------------------------------------------
// Parse ShowBox display title
// ---------------------------------------------------------

function parseShowBoxTitle(
  html
) {
  const match =
    html.match(
      /class="heading-name[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
    );

  if (
    !match?.[1]
  ) {
    return null;
  }

  const title =
    match[1]
      .replace(
        /<[^>]+>/g,
        ""
      )
      .replace(
        /&amp;/gi,
        "&"
      )
      .replace(
        /&quot;/gi,
        '"'
      )
      .replace(
        /&#39;/gi,
        "'"
      )
      .replace(
        /&apos;/gi,
        "'"
      )
      .replace(
        /&nbsp;/gi,
        " "
      )
      .replace(
        /&lt;/gi,
        "<"
      )
      .replace(
        /&gt;/gi,
        ">"
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return title || null;
}

// ---------------------------------------------------------
// IMDb -> ShowBox media ID + title
// ---------------------------------------------------------

async function searchShowBoxMedia(
  imdbId
) {
  const searchUrl =
    `${SHOWBOX_WEB_API}/search?keyword=${encodeURIComponent(imdbId)}`;

  const searchResponse =
    await fetchWithTimeout(
      searchUrl,
      {
        headers:
          SHOWBOX_SEARCH_HEADERS
      }
    );

  if (
    !searchResponse.ok
  ) {
    throw new Error(
      `ShowBox web search failed: HTTP ${searchResponse.status}`
    );
  }

  const searchHtml =
    await searchResponse.text();

  const detailUrl =
    parseShowBoxSearchHref(
      searchHtml
    );

  if (
    !detailUrl
  ) {
    throw new Error(
      "ShowBox web search result not found"
    );
  }

  const detailResponse =
    await fetchWithTimeout(
      detailUrl,
      {
        headers:
          SHOWBOX_SEARCH_HEADERS
      }
    );

  if (
    !detailResponse.ok
  ) {
    throw new Error(
      `ShowBox web detail failed: HTTP ${detailResponse.status}`
    );
  }

  const detailHtml =
    await detailResponse.text();

  const showboxId =
    parseShowBoxHeadingId(
      detailHtml
    );

  if (
    !showboxId
  ) {
    throw new Error(
      "ShowBox media ID not found"
    );
  }

  const showboxTitle =
    parseShowBoxTitle(
      detailHtml
    );

  return {
    showboxId,
    showboxTitle
  };
}

// ---------------------------------------------------------
// FebBox share
// ---------------------------------------------------------

async function febboxShare(
  showboxId,
  type
) {
  const boxType =
    type === "series"
      ? 2
      : 1;

  const url =
    `https://www.febbox.com/mbp/to_share_page?box_type=${boxType}&mid=${showboxId}&json=1`;

  const response =
    await fetchWithTimeout(
      url
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(
        text
      );

  } catch {
    throw new Error(
      "FebBox share response was not JSON"
    );
  }

  if (
    data.code !== 1 ||
    !data.data
  ) {
    throw new Error(
      "FebBox share request failed"
    );
  }

  const shareLink =
    data.data.shareLink ||
    data.data.share_link;

  if (
    !shareLink
  ) {
    throw new Error(
      "FebBox share link missing"
    );
  }

  const shareKey =
    shareLink
      .split("/")
      .filter(Boolean)
      .pop();

  if (
    !shareKey
  ) {
    throw new Error(
      "FebBox share key missing"
    );
  }

  return shareKey;
}

// ---------------------------------------------------------
// FebBox root file list
// ---------------------------------------------------------

async function febboxFileList(
  shareKey
) {
  const url =
    `https://www.febbox.com/file/file_share_list?share_key=${shareKey}`;

  const response =
    await fetchWithTimeout(
      url,
      {
        headers: {
          "Accept-Language":
            "en"
        }
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(
        text
      );

  } catch {
    throw new Error(
      "FebBox file list was not JSON"
    );
  }

  if (
    data.code !== 1 ||
    !data.data ||
    !Array.isArray(
      data.data.file_list
    )
  ) {
    throw new Error(
      "FebBox file list failed"
    );
  }

  return data.data.file_list;
}

// ---------------------------------------------------------
// FebBox season file list
// ---------------------------------------------------------

async function febboxSeasonFileList(
  shareKey,
  seasonFolder
) {
  const url =
    `https://www.febbox.com/file/file_share_list?share_key=${shareKey}&parent_id=${seasonFolder.fid}&page=1`;

  const response =
    await fetchWithTimeout(
      url,
      {
        headers: {
          "Accept-Language":
            "en"
        }
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(
        text
      );

  } catch {
    throw new Error(
      "FebBox episode list was not JSON"
    );
  }

  if (
    data.code !== 1 ||
    !data.data ||
    !Array.isArray(
      data.data.file_list
    )
  ) {
    throw new Error(
      "FebBox episode list failed"
    );
  }

  return data.data.file_list;
}

// ---------------------------------------------------------
// Find FebBox files
// ---------------------------------------------------------

async function findFebboxFiles(
  shareKey,
  type,
  season,
  episode
) {
  const rootFiles =
    await febboxFileList(
      shareKey
    );

  // -------------------------------------------------------
  // Movie
  // -------------------------------------------------------

  if (
    type === "movie"
  ) {
    const files =
      rootFiles.filter(
        item =>
          item &&
          item.fid &&
          item.file_name
      );

    if (
      !files.length
    ) {
      throw new Error(
        "Movie file not found"
      );
    }

    return files
      .slice(
        0,
        MAX_FILES_PER_REQUEST
      );
  }

  // -------------------------------------------------------
  // TV season
  // -------------------------------------------------------

  const expectedSeason =
    `season ${season}`
      .toLowerCase();

  const seasonFolder =
    rootFiles.find(
      item =>
        item &&
        item.file_name &&
        item.file_name
          .toLowerCase()
          .trim() ===
          expectedSeason
    );

  if (
    !seasonFolder
  ) {
    throw new Error(
      `Season folder not found: ${expectedSeason}`
    );
  }

  const files =
    await febboxSeasonFileList(
      shareKey,
      seasonFolder
    );

  const s2 =
    String(
      season
    ).padStart(
      2,
      "0"
    );

  const e2 =
    String(
      episode
    ).padStart(
      2,
      "0"
    );

  const lowerS =
    String(
      season
    );

  const lowerE =
    String(
      episode
    );

  const matchingFiles =
    files.filter(
      item => {
        if (
          !item ||
          !item.file_name
        ) {
          return false;
        }

        const name =
          item.file_name
            .toLowerCase();

        return (
          name.includes(
            `s${s2}e${e2}`
          ) ||
          name.includes(
            `s${lowerS}e${lowerE}`
          )
        );
      }
    );

  if (
    !matchingFiles.length
  ) {
    throw new Error(
      `Episode not found: S${season}E${episode}`
    );
  }

  return matchingFiles
    .slice(
      0,
      MAX_FILES_PER_REQUEST
    );
}

// ---------------------------------------------------------
// FebBox quality list
// ---------------------------------------------------------

async function febboxQualityList(
  file,
  shareKey,
  token
) {
  const cookieHeader =
    token.startsWith("ui=")
      ? token
      : `ui=${token}`;

  const qualityUrl =
    `https://www.febbox.com/console/video_quality_list?fid=${file.fid}&share_key=${shareKey}`;

  const response =
    await fetchWithTimeout(
      qualityUrl,
      {
        headers: {
          Cookie:
            cookieHeader
        }
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(
        text
      );

  } catch {
    data =
      null;
  }

  if (
    data &&
    data.html
  ) {
    return parseFebboxHtml(
      data.html,
      file
    );
  }

  if (
    text.includes(
      "file_quality"
    )
  ) {
    return parseFebboxHtml(
      text,
      file
    );
  }

  throw new Error(
    "FebBox quality response missing HTML"
  );
}

// ---------------------------------------------------------
// Parse FebBox quality HTML
// ---------------------------------------------------------

function parseFebboxHtml(
  html,
  file
) {
  const streams = [];

  const blocks =
    html.split(
      /(?=<div[^>]*class=["'][^"']*file_quality[^"']*["'][^>]*>)/i
    );

  for (
    const block of blocks
  ) {
    if (
      !block.includes(
        "file_quality"
      )
    ) {
      continue;
    }

    const urlMatch =
      block.match(
        /data-url=["']([^"']+)["']/i
      );

    if (
      !urlMatch
    ) {
      continue;
    }

    const qualityMatch =
      block.match(
        /data-quality=["']([^"']+)["']/i
      );

    const sizeMatch =
      block.match(
        /class=["'][^"']*\bsize\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
      );

    const streamUrl =
      urlMatch[1];

    const quality =
      qualityMatch
        ? qualityMatch[1]
        : "";

    const size =
      sizeMatch
        ? sizeMatch[1]
            .replace(
              /<[^>]+>/g,
              ""
            )
            .trim()
        : "";

    streams.push({
      url:
        streamUrl,

      quality,

      size,

      fileName:
        file.file_name ||
        "",

      sourceFile:
        file
    });
  }

  return streams;
}

// ---------------------------------------------------------
// Quality label
// ---------------------------------------------------------

function getQualityLabel(
  quality,
  fileName
) {
  const value =
    String(
      quality ||
      fileName ||
      ""
    ).toLowerCase();

  if (
    value.includes("2160") ||
    value.includes("4k")
  ) {
    return "4K";
  }

  if (
    value.includes("1440")
  ) {
    return "1440p";
  }

  if (
    value.includes("1080")
  ) {
    return "1080p";
  }

  if (
    value.includes("720")
  ) {
    return "720p";
  }

  if (
    value.includes("480")
  ) {
    return "480p";
  }

  if (
    value.includes("360")
  ) {
    return "360p";
  }

  if (
    String(
      quality
    ).toUpperCase() === "ORG"
  ) {
    return "ORG";
  }

  return quality || "";
}

// ---------------------------------------------------------
// Clean filename
// ---------------------------------------------------------

function cleanFilename(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /\.[a-z0-9]{2,5}$/i,
      ""
    )
    .replace(
      /[_]+/g,
      " "
    );
}

// ---------------------------------------------------------
// Technical metadata
// ---------------------------------------------------------

function getTechnicalMetadata(
  fileName,
  quality
) {
  const name =
    cleanFilename(
      fileName
    );

  const upper =
    name.toUpperCase();

  const result = [];

  // Source

  if (
    /\bWEB[- .]?DL\b/.test(
      upper
    ) ||
    /\bWEBDL\b/.test(
      upper
    )
  ) {
    result.push(
      "WEB-DL"
    );

  } else if (
    /\bWEB[- .]?RIP\b/.test(
      upper
    ) ||
    /\bWEBRIP\b/.test(
      upper
    )
  ) {
    result.push(
      "WEB-RIP"
    );

  } else if (
    /\bBLU[- .]?RAY\b/.test(
      upper
    ) ||
    /\bBLURAY\b/.test(
      upper
    )
  ) {
    result.push(
      "BluRay"
    );

  } else if (
    /\bBDRIP\b/.test(
      upper
    )
  ) {
    result.push(
      "BDRip"
    );

  } else if (
    /\bTELECINE\b/.test(
      upper
    ) ||
    /\bTC\b/.test(
      upper
    )
  ) {
    result.push(
      "TELECINE"
    );

  } else if (
    /\bCAM\b/.test(
      upper
    )
  ) {
    result.push(
      "CAM"
    );
  }

  // Dynamic range

  if (
    /\bDOLBY[ ._-]?VISION\b/.test(
      upper
    ) ||
    /\bDV\b/.test(
      upper
    )
  ) {
    result.push(
      "DV"
    );

  } else if (
    /\bHDR10\+\b/.test(
      upper
    ) ||
    /\bHDR10PLUS\b/.test(
      upper
    )
  ) {
    result.push(
      "HDR10+"
    );

  } else if (
    /\bHDR10\b/.test(
      upper
    )
  ) {
    result.push(
      "HDR10"
    );

  } else if (
    /\bHDR\b/.test(
      upper
    )
  ) {
    result.push(
      "HDR"
    );

  } else if (
    /\bHLG\b/.test(
      upper
    )
  ) {
    result.push(
      "HLG"
    );
  }

  // Audio codec

  if (
    /\bATMOS\b/.test(
      upper
    )
  ) {
    result.push(
      "Atmos"
    );
  }

  if (
    /\bDDP[ ._-]?7[ ._-]?1\b/.test(
      upper
    )
  ) {
    result.push(
      "DDP7.1"
    );

  } else if (
    /\bDDP[ ._-]?5[ ._-]?1\b/.test(
      upper
    )
  ) {
    result.push(
      "DDP5.1"
    );

  } else if (
    /\bDD[ ._-]?5[ ._-]?1\b/.test(
      upper
    )
  ) {
    result.push(
      "DD5.1"
    );

  } else if (
    /\bDTS[- .]?(HD|X)?\b/.test(
      upper
    )
  ) {
    result.push(
      "DTS"
    );

  } else if (
    /\bAAC\b/.test(
      upper
    )
  ) {
    result.push(
      "AAC"
    );
  }

  // Video codec

  if (
    /\bHEVC\b/.test(
      upper
    ) ||
    /\bH[ ._-]?265\b/.test(
      upper
    ) ||
    /\bX265\b/.test(
      upper
    )
  ) {
    result.push(
      "H.265"
    );

  } else if (
    /\bAVC\b/.test(
      upper
    ) ||
    /\bH[ ._-]?264\b/.test(
      upper
    ) ||
    /\bX264\b/.test(
      upper
    )
  ) {
    result.push(
      "H.264"
    );

  } else if (
    /\bAV1\b/.test(
      upper
    )
  ) {
    result.push(
      "AV1"
    );
  }

  return result;
}

// ---------------------------------------------------------
// Language helpers
// ---------------------------------------------------------

function normalizeLanguageValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.flatMap(
      item =>
        normalizeLanguageValue(
          item
        )
    );
  }

  if (
    typeof value === "object"
  ) {
    return [
      value.name,
      value.language,
      value.lang,
      value.iso_639_1
    ]
      .filter(Boolean)
      .flatMap(
        item =>
          normalizeLanguageValue(
            item
          )
      );
  }

  return String(
    value
  )
    .split(
      /[,|/]+/
    )
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);
}

function getLanguagesFromObject(
  object,
  keys
) {
  if (
    !object ||
    typeof object !== "object"
  ) {
    return [];
  }

  for (
    const key of keys
  ) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      const values =
        normalizeLanguageValue(
          object[key]
        );

      if (
        values.length
      ) {
        return values;
      }
    }
  }

  return [];
}

function getLanguagesFromFilename(
  fileName
) {
  const text =
    String(
      fileName || ""
    ).toLowerCase();

  const languages = [];

  const known = [
    ["english", "English"],
    ["eng", "English"],

    ["spanish", "Spanish"],
    ["spa", "Spanish"],
    ["español", "Spanish"],

    ["french", "French"],
    ["fra", "French"],
    ["fre", "French"],

    ["german", "German"],
    ["deu", "German"],
    ["ger", "German"],

    ["italian", "Italian"],
    ["ita", "Italian"],

    ["portuguese", "Portuguese"],
    ["por", "Portuguese"],

    ["japanese", "Japanese"],
    ["jpn", "Japanese"],

    ["korean", "Korean"],
    ["kor", "Korean"],

    ["hindi", "Hindi"],
    ["hin", "Hindi"],

    ["tamil", "Tamil"],
    ["telugu", "Telugu"],
    ["malayalam", "Malayalam"],
    ["marathi", "Marathi"],

    ["arabic", "Arabic"],

    ["russian", "Russian"],
    ["rus", "Russian"]
  ];

  for (
    const [
      token,
      label
    ] of known
  ) {
    const regex =
      new RegExp(
        `(?:^|[ ._\\-()])${token}(?:$|[ ._\\-()])`,
        "i"
      );

    if (
      regex.test(text) &&
      !languages.includes(label)
    ) {
      languages.push(
        label
      );
    }
  }

  return languages;
}

// ---------------------------------------------------------
// Audio / subtitle information
// ---------------------------------------------------------

function getAudioLanguages(
  item
) {
  const object =
    item.sourceFile ||
    item.link ||
    item;

  const explicit =
    getLanguagesFromObject(
      object,
      [
        "audio",
        "audio_language",
        "audioLanguage",
        "audio_languages",
        "audioLanguages",
        "language",
        "languages",
        "lang"
      ]
    );

  if (
    explicit.length
  ) {
    return explicit;
  }

  return getLanguagesFromFilename(
    item.fileName
  );
}

function getSubtitleLanguages(
  item
) {
  const object =
    item.sourceFile ||
    item.link ||
    item;

  const explicit =
    getLanguagesFromObject(
      object,
      [
        "subtitle",
        "subtitles",
        "subtitle_language",
        "subtitleLanguage",
        "subtitle_languages",
        "subtitleLanguages",
        "caption",
        "captions"
      ]
    );

  if (
    explicit.length
  ) {
    return explicit;
  }

  const text =
    String(
      item.fileName || ""
    ).toLowerCase();

  if (
    /\bno[\s._-]?subs?\b/.test(
      text
    ) ||
    /\bnosub\b/.test(
      text
    ) ||
    /\bwithout[\s._-]?subs?\b/.test(
      text
    )
  ) {
    return [
      "No included subtitles"
    ];
  }

  return getLanguagesFromFilename(
    item.fileName
  );
}

// ---------------------------------------------------------
// Extract title from FebBox filename
// ---------------------------------------------------------

function getTitleFromFilename(
  fileName,
  type,
  season,
  episode
) {
  let title =
    cleanFilename(
      fileName
    );

  title =
    title
      .replace(
        /\bS\d{1,2}E\d{1,3}\b/ig,
        ""
      )
      .replace(
        /\bSeason[ ._-]?\d+\b/ig,
        ""
      )
      .replace(
        /\bEpisode[ ._-]?\d+\b/ig,
        ""
      );

  title =
    title
      .replace(
        /\b2160p\b/ig,
        ""
      )
      .replace(
        /\b1440p\b/ig,
        ""
      )
      .replace(
        /\b1080p\b/ig,
        ""
      )
      .replace(
        /\b720p\b/ig,
        ""
      )
      .replace(
        /\b480p\b/ig,
        ""
      )
      .replace(
        /\b360p\b/ig,
        ""
      )
      .replace(
        /\b4K\b/ig,
        ""
      );

  title =
    title
      .replace(
        /\bWEB[- .]?DL\b/ig,
        ""
      )
      .replace(
        /\bWEB[- .]?RIP\b/ig,
        ""
      )
      .replace(
        /\bBLU[- .]?RAY\b/ig,
        ""
      )
      .replace(
        /\bBLURAY\b/ig,
        ""
      )
      .replace(
        /\bBDRIP\b/ig,
        ""
      )
      .replace(
        /\bHDR10\+?\b/ig,
        ""
      )
      .replace(
        /\bDOLBY[ ._-]?VISION\b/ig,
        ""
      )
      .replace(
        /\bDV\b/ig,
        ""
      )
      .replace(
        /\bHEVC\b/ig,
        ""
      )
      .replace(
        /\bH[ ._-]?265\b/ig,
        ""
      )
      .replace(
        /\bH[ ._-]?264\b/ig,
        ""
      )
      .replace(
        /\bX265\b/ig,
        ""
      )
      .replace(
        /\bX264\b/ig,
        ""
      )
      .replace(
        /\bATMOS\b/ig,
        ""
      );

  title =
    title
      .replace(
        /(\b(?:19|20)\d{2}\b).*$/i,
        "$1"
      );

  title =
    title
      .replace(
        /[._]+/g,
        " "
      )
      .replace(
        /\s{2,}/g,
        " "
      )
      .trim();

  if (
    type === "series" &&
    Number.isFinite(season) &&
    Number.isFinite(episode)
  ) {
    return `${title}\nS${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
  }

  return title;
}

// ---------------------------------------------------------
// Technical line
// ---------------------------------------------------------

function buildTechnicalLine(
  item
) {
  const quality =
    getQualityLabel(
      item.quality,
      item.fileName
    );

  const metadata =
    getTechnicalMetadata(
      item.fileName,
      item.quality
    );

  const parts = [];

  if (
    quality
  ) {
    parts.push(
      quality
    );
  }

  for (
    const value of metadata
  ) {
    if (
      !parts.includes(
        value
      )
    ) {
      parts.push(
        value
      );
    }
  }

  return parts.join(
    " • "
  );
}

// ---------------------------------------------------------
// Build FebBox stream title
// ---------------------------------------------------------

function buildStreamTitle(
  item,
  showboxTitle,
  type,
  season,
  episode
) {
  const lines = [];

  const title =
    showboxTitle ||
    getTitleFromFilename(
      item.fileName,
      type,
      season,
      episode
    );

  if (
    title
  ) {
    lines.push(
      type === "series" &&
      Number.isFinite(season) &&
      Number.isFinite(episode)
        ? `${title}\nS${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
        : title
    );
  }

  const technical =
    buildTechnicalLine(
      item
    );

  if (
    technical
  ) {
    lines.push(
      technical
    );
  }

  if (
    item.size
  ) {
    lines.push(
      item.size
    );
  }

  const audioLanguages =
    getAudioLanguages(
      item
    );

  if (
    audioLanguages.length
  ) {
    lines.push(
      `Audio: ${audioLanguages.join(", ")}`
    );
  }

  const subtitleLanguages =
    getSubtitleLanguages(
      item
    );

  if (
    subtitleLanguages.length
  ) {
    lines.push(
      `Subtitles: ${subtitleLanguages.join(", ")}`
    );
  }

  return lines.join(
    "\n"
  );
}

// ---------------------------------------------------------
// Build FebBox streams
// ---------------------------------------------------------

function buildFebboxStreams(
  qualityResults,
  showboxTitle,
  type,
  season,
  episode
) {
  return qualityResults.map(
    item => {
      const quality =
        getQualityLabel(
          item.quality,
          item.fileName
        ) || "ORG";

      return {
        name:
          `ShowBox ${quality}`,

        title:
          buildStreamTitle(
            item,
            showboxTitle,
            type,
            season,
            episode
          ),

        url:
          item.url,

        size:
          item.size,

        behaviorHints: {
          bingeGroup:
            "showbox"
        },

        headers: {
          Accept:
            "*/*",

          "Accept-Language":
            "en-US,en;q=0.8",

          Connection:
            "keep-alive",

          Range:
            "bytes=0-",

          Referer:
            "https://www.febbox.com/",

          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      };
    }
  );
}

// ---------------------------------------------------------
// Provider entry point
// ---------------------------------------------------------

export async function getStreams({
  imdbId,
  type,
  season,
  episode,
  token
}) {
  if (
    !imdbId
  ) {
    throw new Error(
      "IMDb ID is required"
    );
  }

  if (
    !token
  ) {
    throw new Error(
      "ShowBox UI token is required"
    );
  }

  // -------------------------------------------------------
  // ShowBox media ID + title
  // -------------------------------------------------------

  const {
    showboxId,
    showboxTitle
  } =
    await searchShowBoxMedia(
      imdbId
    );

  if (
    !showboxId
  ) {
    throw new Error(
      "ShowBox ID missing"
    );
  }

  // -------------------------------------------------------
  // FebBox share
  // -------------------------------------------------------

  const shareKey =
    await febboxShare(
      showboxId,
      type
    );

  // -------------------------------------------------------
  // Find matching files
  // -------------------------------------------------------

  const files =
    await findFebboxFiles(
      shareKey,
      type,
      season,
      episode
    );

  // -------------------------------------------------------
  // Quality requests
  //
  // Keep the existing 5-at-a-time behavior.
  // -------------------------------------------------------

  const allQualityResults =
    [];

  for (
    let index = 0;
    index < files.length;
    index += QUALITY_REQUEST_CONCURRENCY
  ) {
    const batch =
      files.slice(
        index,
        index +
          QUALITY_REQUEST_CONCURRENCY
      );

    const results =
      await Promise.allSettled(
        batch.map(
          file =>
            febboxQualityList(
              file,
              shareKey,
              token
            )
        )
      );

    for (
      const result of results
    ) {
      if (
        result.status !==
        "fulfilled"
      ) {
        continue;
      }

      for (
        const stream of result.value
      ) {
        allQualityResults.push(
          stream
        );
      }
    }
  }

  // -------------------------------------------------------
  // Build provider streams
  // -------------------------------------------------------

  return buildFebboxStreams(
    allQualityResults,
    showboxTitle,
    type,
    season,
    episode
  );
}
