import CryptoJS from "crypto-js";

const TMDB_API_KEY =
  process.env.TMDB_API_KEY ||
  "439c478a771f35c05022f9feabcca01c";

const TMDB_BASE_URL =
  "https://api.themoviedb.org/3";

const SHOWBOX_WEB_API =
  "https://showbox.media";

const WORKING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

  Accept:
    "application/json",

  "Accept-Language":
    "en-US,en;q=0.9",

  "Content-Type":
    "application/json"
};


// ---------------------------------------------------------
// Base64URL
// ---------------------------------------------------------

function decodeBase64Url(
  value
) {

  let base64 =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    base64.length % 4
  ) {

    base64 += "=";

  }

  return Buffer
    .from(
      base64,
      "base64"
    )
    .toString("utf8");
}


// ---------------------------------------------------------
// Parse configured Stremio config
// ---------------------------------------------------------

function parseConfig(
  rawConfig
) {

  try {

    const decoded =
      decodeBase64Url(
        rawConfig
      );

    return JSON.parse(
      decoded
    );

  } catch (error) {

    console.log(
      "[ShowBox] Config parsing failed:",
      error.message
    );

    return {};

  }

}


// ---------------------------------------------------------
// ShowBox token parser
// ---------------------------------------------------------

function parseSingleToken(
  token
) {

  if (!token) {

    return null;

  }

  if (
    !token.startsWith("eyJ")
  ) {

    return token;

  }

  try {

    const decoded =
      JSON.parse(
        Buffer
          .from(
            token.split(".")[1] || "",
            "base64"
          )
          .toString("utf8")
      );


    if (
      !decoded ||
      !decoded.encrypt_data
    ) {

      return token;

    }


    const key =
      CryptoJS.enc.Utf8.parse(
        "123d6cedf626dy54233aa1w6"
      );

    const iv =
      CryptoJS.enc.Utf8.parse(
        "wEiphTn!"
      );


    const decrypted =
      CryptoJS.TripleDES.decrypt(
        decoded.encrypt_data,
        key,
        {
          iv,

          mode:
            CryptoJS.mode.CBC,

          padding:
            CryptoJS.pad.Pkcs7
        }
      )
      .toString(
        CryptoJS.enc.Utf8
      );


    const result =
      JSON.parse(
        decrypted
      );


    if (
      result &&
      result.uid
    ) {

      return String(
        result.uid
      );

    }


    return token;

  } catch (error) {

    console.log(
      "[ShowBox] Token parsing failed:",
      error.message
    );

    return token;

  }

}


// ---------------------------------------------------------
// IMDb -> TMDB
// ---------------------------------------------------------

async function imdbToTmdb(
  imdbId
) {

  console.log(
    "[ShowBox] TMDB lookup:",
    imdbId
  );


  const response =
    await fetch(
      `${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`
    );


  console.log(
    "[ShowBox] TMDB response:",
    response.status
  );


  if (!response.ok) {

    throw new Error(
      `TMDB lookup failed: HTTP ${response.status}`
    );

  }


  const data =
    await response.json();


  const movieResults =
    Array.isArray(
      data.movie_results
    )
      ? data.movie_results
      : [];


  const tvResults =
    Array.isArray(
      data.tv_results
    )
      ? data.tv_results
      : [];


  const result =
    movieResults[0] ||
    tvResults[0];


  if (
    !result ||
    !result.id
  ) {

    throw new Error(
      `TMDB ID not found for ${imdbId}`
    );

  }


  console.log(
    "[ShowBox] TMDB result:",
    result.id
  );


  return String(
    result.id
  );

}


// ---------------------------------------------------------
// ShowBox web search
// ---------------------------------------------------------

function parseShowBoxSearchHrefs(
  html
) {

  const hrefs = [];


  const patterns = [

    /class="film-name[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"/gi,

    /<a[^>]+href="([^"]+)"[^>]*class="[^"]*film-name[^"]*"/gi

  ];


  for (
    const pattern
    of patterns
  ) {

    let match;


    while (
      (match =
        pattern.exec(
          html
        )) !== null
    ) {

      if (
        !match[1]
      ) {

        continue;

      }


      try {

        const href =
          new URL(
            match[1],
            SHOWBOX_WEB_API
          ).href;


        if (
          !hrefs.includes(
            href
          )
        ) {

          hrefs.push(
            href
          );

        }

      } catch {

        // Ignore malformed result links.

      }

    }

  }


  return hrefs;

}


// ---------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------

function decodeHtmlEntities(
  value
) {

  return String(
    value || ""
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
      /&#39;|&apos;/gi,
      "'"
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
      /&#(\d+);/g,
      (_, code) => {

        try {

          return String.fromCodePoint(
            Number(code)
          );

        } catch {

          return "";

        }

      }
    );

}


function stripHtml(
  value
) {

  return decodeHtmlEntities(
    String(
      value || ""
    )
      .replace(
        /<[^>]*>/g,
        " "
      )
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


// ---------------------------------------------------------
// ShowBox detail parser
// ---------------------------------------------------------

function parseShowBoxHeadingInfo(
  html
) {

  const match =
    html.match(
      /class="heading-name[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );


  if (!match) {

    return null;

  }


  const id =
    match[1]
      .split("?")[0]
      .split("#")[0]
      .split("/")
      .filter(Boolean)
      .pop();


  if (
    !/^\d+$/.test(
      id || ""
    )
  ) {

    return null;

  }


  return {

    id,

    title:
      stripHtml(
        match[2]
      )

  };

}


// ---------------------------------------------------------
// Search ShowBox media ID
// ---------------------------------------------------------

async function searchShowBoxMediaId(
  tmdbId
) {

  console.log(
    "[ShowBox] Web search for TMDB:",
    tmdbId
  );


  const searchResponse =
    await fetch(
      `${SHOWBOX_WEB_API}/search?keyword=${encodeURIComponent(tmdbId)}`,
      {
        headers: {

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          "Accept-Language":
            "en",

          "User-Agent":
            WORKING_HEADERS[
              "User-Agent"
            ]

        }
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


  const detailUrls =
    parseShowBoxSearchHrefs(
      searchHtml
    );


  if (
    !detailUrls.length
  ) {

    throw new Error(
      `ShowBox search returned no result for TMDB ID ${tmdbId}`
    );

  }


  // Only use the first ShowBox search result.
  const detailUrl =
    detailUrls[0];


  console.log(
    "[ShowBox] First search result:",
    detailUrl
  );


  const detailResponse =
    await fetch(
      detailUrl,
      {
        headers: {

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          "Accept-Language":
            "en",

          "User-Agent":
            WORKING_HEADERS[
              "User-Agent"
            ]

        }
      }
    );


  if (
    !detailResponse.ok
  ) {

    throw new Error(
      `ShowBox detail request failed: HTTP ${detailResponse.status}`
    );

  }


  const detailHtml =
    await detailResponse.text();


  const info =
    parseShowBoxHeadingInfo(
      detailHtml
    );


  if (!info) {

    throw new Error(
      "ShowBox media ID not found on first result detail page"
    );

  }


  console.log(
    "[ShowBox] Direct ShowBox media result:",
    {
      id:
        info.id,

      title:
        info.title
    }
  );


  return info.id;

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


  console.log(
    "[ShowBox] FebBox share request:",
    {
      boxType,

      showboxId
    }
  );


  const response =
    await fetch(
      url
    );


  const text =
    await response.text();


  console.log(
    "[ShowBox] FebBox share response:",
    {
      status:
        response.status,

      bodyLength:
        text.length
    }
  );


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


  console.log(
    "[ShowBox] FebBox share JSON:",
    {
      code:
        data.code,

      hasData:
        !!data.data
    }
  );


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
      .pop();


  console.log(
    "[ShowBox] FebBox share key:",
    {
      length:
        shareKey
          ? shareKey.length
          : 0
    }
  );


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
    await fetch(
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


  console.log(
    "[ShowBox] FebBox file list:",
    {
      status:
        response.status,

      parentId:
        null,

      bodyLength:
        text.length
    }
  );


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


  const files =
    data &&
    data.data &&
    Array.isArray(
      data.data.file_list
    )

      ? data.data.file_list

      : [];


  console.log(
    "[ShowBox] FebBox file list result:",
    {
      code:
        data.code,

      count:
        files.length
    }
  );


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


  return files;

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
    await fetch(
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


  console.log(
    "[ShowBox] FebBox episode list:",
    {
      status:
        response.status,

      countBodyLength:
        text.length
    }
  );


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
// Find all matching FebBox files
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


    console.log(
      "[ShowBox] Movie files found:",
      files.map(
        file => ({

          name:
            file.file_name,

          fid:
            file.fid

        })
      )
    );


    return files;

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
        item.fid &&
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


  console.log(
    "[ShowBox] Season folder found:",
    {
      name:
        seasonFolder.file_name,

      fid:
        seasonFolder.fid
    }
  );


  const episodeFiles =
    await febboxSeasonFileList(
      shareKey,
      seasonFolder
    );


  const normalizedEpisode =
    String(
      episode
    ).padStart(
      2,
      "0"
    );


  const episodePattern =
    new RegExp(
      `(?:^|[^0-9])${normalizedEpisode}(?:[^0-9]|$)|episode\\s*${episode}\\b`,
      "i"
    );


  const files =
    episodeFiles.filter(
      item =>
        item &&
        item.fid &&
        item.file_name &&
        episodePattern.test(
          item.file_name
        )
    );


  if (
    !files.length
  ) {

    throw new Error(
      `Episode file not found: S${season}E${episode}`
    );

  }


  console.log(
    "[ShowBox] Episode files found:",
    files.map(
      file => ({

        name:
          file.file_name,

        fid:
          file.fid

      })
    )
  );


  return files;

}


// ---------------------------------------------------------
// FebBox quality list
// ---------------------------------------------------------

async function febboxQualityList(
  file,
  shareKey
) {

  const url =
    `https://www.febbox.com/mbp/file/detail?fid=${file.fid}&share_key=${shareKey}`;


  const response =
    await fetch(
      url,
      {
        headers: {

          "Accept-Language":
            "en",

          "User-Agent":
            WORKING_HEADERS[
              "User-Agent"
            ]

        }
      }
    );


  const text =
    await response.text();


  console.log(
    "[ShowBox] FebBox quality request:",
    {
      fid:
        file.fid,

      status:
        response.status,

      bodyLength:
        text.length
    }
  );


  let data;


  try {

    data =
      JSON.parse(
        text
      );

  } catch {

    throw new Error(
      "FebBox quality response was not JSON"
    );

  }


  if (
    data.code !== 1 ||
    !data.data
  ) {

    throw new Error(
      "FebBox quality request failed"
    );

  }


  const qualityHtml =
    data.data.html ||
    data.data.content ||
    data.data.url ||
    "";


  if (
    !qualityHtml
  ) {

    throw new Error(
      "FebBox quality HTML missing"
    );

  }


  return parseFebboxQualityHtml(
    qualityHtml,
    file
  );

}


// ---------------------------------------------------------
// Parse FebBox quality HTML
// ---------------------------------------------------------

function parseFebboxQualityHtml(
  html,
  file
) {

  const results = [];


  const sourceText =
    String(
      html || ""
    );


  const linkPattern =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;


  let match;


  while (
    (match =
      linkPattern.exec(
        sourceText
      )) !== null
  ) {

    const url =
      decodeHtmlEntities(
        match[1]
      );


    const label =
      stripHtml(
        match[2]
      );


    if (
      !url ||
      !/^https?:\/\//i.test(
        url
      )
    ) {

      continue;

    }


    if (
      !label
    ) {

      continue;

    }


    results.push({

      fileName:
        file.file_name,

      fileId:
        file.fid,

      quality:
        label,

      url,

      sourceFile:
        file

    });

  }


  // -------------------------------------------------------
  // Also support direct URL attributes used by FebBox.
  // -------------------------------------------------------

  const urlPattern =
    /(?:url|play_url|download_url|file_url|src)=["']([^"']+)["']/gi;


  while (
    (match =
      urlPattern.exec(
        sourceText
      )) !== null
  ) {

    const url =
      decodeHtmlEntities(
        match[1]
      );


    if (
      !url ||
      !/^https?:\/\//i.test(
        url
      )
    ) {

      continue;

    }


    if (
      results.some(
        item =>
          item.url ===
          url
      )
    ) {

      continue;

    }


    results.push({

      fileName:
        file.file_name,

      fileId:
        file.fid,

      quality:
        "ORG",

      url,

      sourceFile:
        file

    });

  }


  return results;

}


// ---------------------------------------------------------
// Quality helpers
// ---------------------------------------------------------

const QUALITY_ORDER = [

  "ORG",

  "4K",

  "1440p",

  "1080p",

  "720p",

  "480p",

  "360p"

];


function normalizeQualityConfig(
  config
) {

  const quality =
    config?.quality;


  if (
    !quality ||
    typeof quality !==
      "object"
  ) {

    return {

      enabled: [
        ...QUALITY_ORDER
      ],

      priority: [
        ...QUALITY_ORDER
      ]

    };

  }


  const enabled =
    Array.isArray(
      quality.enabled
    )

      ? quality.enabled.filter(
          value =>
            QUALITY_ORDER.includes(
              value
            )
        )

      : [
          ...QUALITY_ORDER
        ];


  const priority =
    Array.isArray(
      quality.priority
    )

      ? quality.priority.filter(
          value =>
            QUALITY_ORDER.includes(
              value
            )
        )

      : [
          ...QUALITY_ORDER
        ];


  const finalPriority = [

    ...priority,

    ...QUALITY_ORDER.filter(
      value =>
        !priority.includes(
          value
        )
    )

  ];


  return {

    enabled,

    priority:
      finalPriority

  };

}


function getQualityLabel(
  fileName,
  quality
) {

  const text =
    `${fileName || ""} ${quality || ""}`
      .toUpperCase();


  if (
    /\b4K\b/.test(text) ||
    /\b2160P\b/.test(text) ||
    /\bUHD\b/.test(text)
  ) {

    return "4K";

  }


  if (
    /\b1440P\b/.test(text) ||
    /\b2K\b/.test(text)
  ) {

    return "1440p";

  }


  if (
    /\b1080P\b/.test(text) ||
    /\bFHD\b/.test(text)
  ) {

    return "1080p";

  }


  if (
    /\b720P\b/.test(text) ||
    /\bHD\b/.test(text)
  ) {

    return "720p";

  }


  if (
    /\b480P\b/.test(text)
  ) {

    return "480p";

  }


  if (
    /\b360P\b/.test(text)
  ) {

    return "360p";

  }


  return "ORG";

}


function applyQualitySettings(
  streams,
  config
) {

  const settings =
    normalizeQualityConfig(
      config
    );


  const enabled =
    new Set(
      settings.enabled
    );


  const priorityMap =
    new Map(
      settings.priority.map(
        (
          quality,
          index
        ) => [

          quality,

          index

        ]
      )
    );


  const filtered =
    streams.filter(
      stream =>
        enabled.has(
          stream.quality
        )
    );


  filtered.sort(
    (a, b) => {

      const aRank =
        priorityMap.has(
          a.quality
        )

          ? priorityMap.get(
              a.quality
            )

          : 999;


      const bRank =
        priorityMap.has(
          b.quality
        )

          ? priorityMap.get(
              b.quality
            )

          : 999;


      return (
        aRank -
        bRank
      );

    }
  );


  return filtered;

}

// ---------------------------------------------------------
// File size settings
// ---------------------------------------------------------

function normalizeFileSizeConfig(
  config
) {

  const fileSize =
    config?.fileSize;


  if (
    !fileSize ||
    typeof fileSize !==
      "object"
  ) {

    return {

      enabled:
        false,

      maxGb:
        0

    };

  }


  const maxGb =
    Number(
      fileSize.maxGb
    );


  return {

    enabled:
      fileSize.enabled === true,

    maxGb:
      Number.isFinite(
        maxGb
      ) &&
      maxGb > 0

        ? maxGb

        : 0

  };

}


function parseFileSizeBytes(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {

    return value;

  }


  const text =
    String(
      value
    )
      .trim()
      .toUpperCase();


  const match =
    text.match(
      /([\d.]+)\s*(TB|GB|MB|KB|B)?/
    );


  if (
    !match
  ) {

    return null;

  }


  const amount =
    Number(
      match[1]
    );


  if (
    !Number.isFinite(
      amount
    )
  ) {

    return null;

  }


  const unit =
    match[2] ||
    "B";


  const multipliers = {

    B:
      1,

    KB:
      1024,

    MB:
      1024 ** 2,

    GB:
      1024 ** 3,

    TB:
      1024 ** 4

  };


  return (
    amount *
    multipliers[
      unit
    ]
  );

}


function applyFileSizeSettings(
  streams,
  config
) {

  const settings =
    normalizeFileSizeConfig(
      config
    );


  if (
    !settings.enabled ||
    !settings.maxGb
  ) {

    return streams;

  }


  const maxBytes =
    settings.maxGb *
    1024 *
    1024 *
    1024;


  return streams.filter(
    stream => {

      const size =
        parseFileSizeBytes(
          stream.fileSize ||
          stream.size ||
          stream.sourceFile?.file_size
        );


      if (
        size === null
      ) {

        return true;

      }


      return (
        size <=
        maxBytes
      );

    }
  );

}


// ---------------------------------------------------------
// Stream filters
// ---------------------------------------------------------

const DEFAULT_STREAM_FILTERS = {

  cam:
    true

};


function normalizeStreamFilterConfig(
  config
) {

  const filters =
    config?.filters;


  if (
    !filters ||
    typeof filters !==
      "object"
  ) {

    return {

      ...DEFAULT_STREAM_FILTERS

    };

  }


  return {

    cam:
      filters.cam !==
      false

  };

}


function isCamOrTelecine(
  fileName
) {

  const text =
    String(
      fileName || ""
    ).toUpperCase();


  return (

    /\bTELESYNC\b/.test(
      text
    ) ||

    /\bTELECINE\b/.test(
      text
    ) ||

    /\bCAM\b/.test(
      text
    )

  );

}


function applyStreamFilters(
  qualityResults,
  config
) {

  const filters =
    normalizeStreamFilterConfig(
      config
    );


  const filtered =
    qualityResults.filter(
      item => {

        const fileName =
          item.fileName ||
          item.sourceFile?.file_name ||
          "";


        if (
          !filters.cam &&
          isCamOrTelecine(
            fileName
          )
        ) {

          return false;

        }


        return true;

      }
    );


  console.log(
    "[ShowBox] Stream filters:",
    {

      cam:
        filters.cam,

      before:
        qualityResults.length,

      after:
        filtered.length

    }
  );


  return filtered;

}


// ---------------------------------------------------------
// Technical metadata
// ---------------------------------------------------------

function getTechnicalMetadata(
  fileName
) {

  const text =
    String(
      fileName || ""
    ).toUpperCase();


  const tags = [];


  if (
    /\bWEB[- .]?DL\b/.test(
      text
    )
  ) {

    tags.push(
      "WEB-DL"
    );

  } else if (
    /\bWEB[- .]?RIP\b/.test(
      text
    )
  ) {

    tags.push(
      "WEB-RIP"
    );

  } else if (
    /\bBLU[- .]?RAY\b/.test(
      text
    )
  ) {

    tags.push(
      "BluRay"
    );

  } else if (
    /\bBDRIP\b/.test(
      text
    )
  ) {

    tags.push(
      "BDRip"
    );

  } else if (
    /\bTELECINE\b/.test(
      text
    ) ||
    /\bTC\b/.test(
      text
    )
  ) {

    tags.push(
      "Telecine"
    );

  } else if (
    /\bCAM\b/.test(
      text
    )
  ) {

    tags.push(
      "CAM"
    );

  }


  if (
    /\bDOLBY[ ._-]?VISION\b/.test(
      text
    ) ||
    /\bDV\b/.test(
      text
    )
  ) {

    tags.push(
      "DV"
    );

  } else if (
    /\bHDR10\+\b/.test(
      text
    )
  ) {

    tags.push(
      "HDR10+"
    );

  } else if (
    /\bHDR10\b/.test(
      text
    )
  ) {

    tags.push(
      "HDR10"
    );

  } else if (
    /\bHDR\b/.test(
      text
    )
  ) {

    tags.push(
      "HDR"
    );

  } else if (
    /\bHLG\b/.test(
      text
    )
  ) {

    tags.push(
      "HLG"
    );

  }


  if (
    /\bATMOS\b/.test(
      text
    )
  ) {

    tags.push(
      "Atmos"
    );

  } else if (
    /\bDDP[ ._-]?7[ ._-]?1\b/.test(
      text
    )
  ) {

    tags.push(
      "DDP7.1"
    );

  } else if (
    /\bDDP[ ._-]?5[ ._-]?1\b/.test(
      text
    )
  ) {

    tags.push(
      "DDP5.1"
    );

  } else if (
    /\bDD[ ._-]?5[ ._-]?1\b/.test(
      text
    )
  ) {

    tags.push(
      "DD5.1"
    );

  } else if (
    /\bDTS\b/.test(
      text
    )
  ) {

    tags.push(
      "DTS"
    );

  } else if (
    /\bAAC\b/.test(
      text
    )
  ) {

    tags.push(
      "AAC"
    );

  }


  if (
    /\bH\.?265\b/.test(
      text
    ) ||
    /\bX265\b/.test(
      text
    ) ||
    /\bHEVC\b/.test(
      text
    )
  ) {

    tags.push(
      "H.265"
    );

  } else if (
    /\bH\.?264\b/.test(
      text
    ) ||
    /\bX264\b/.test(
      text
    ) ||
    /\bAVC\b/.test(
      text
    )
  ) {

    tags.push(
      "H.264"
    );

  } else if (
    /\bAV1\b/.test(
      text
    )
  ) {

    tags.push(
      "AV1"
    );

  }


  return tags;

}


// ---------------------------------------------------------
// Language detection
// ---------------------------------------------------------

function getLanguageTags(
  fileName
) {

  const text =
    String(
      fileName || ""
    ).toUpperCase();


  const languages = [];


  const checks = [

    [
      /\bMULTI\b/,
      "Multi"
    ],

    [
      /\bDUAL[ ._-]?AUDIO\b/,
      "Dual Audio"
    ],

    [
      /\bHINDI\b/,
      "Hindi"
    ],

    [
      /\bTAMIL\b/,
      "Tamil"
    ],

    [
      /\bTELUGU\b/,
      "Telugu"
    ],

    [
      /\bMALAYALAM\b/,
      "Malayalam"
    ],

    [
      /\bKANNADA\b/,
      "Kannada"
    ],

    [
      /\bBENGALI\b/,
      "Bengali"
    ],

    [
      /\bFRENCH\b/,
      "French"
    ],

    [
      /\bGERMAN\b/,
      "German"
    ],

    [
      /\bSPANISH\b/,
      "Spanish"
    ],

    [
      /\bJAPANESE\b/,
      "Japanese"
    ],

    [
      /\bKOREAN\b/,
      "Korean"
    ],

    [
      /\bCHINESE\b/,
      "Chinese"
    ]

  ];


  for (
    const [
      pattern,
      label
    ]
    of checks
  ) {

    if (
      pattern.test(
        text
      )
    ) {

      languages.push(
        label
      );

    }

  }


  return languages;

}


// ---------------------------------------------------------
// Stream title
// ---------------------------------------------------------

function buildStreamTitle(
  result
) {

  const fileName =
    result.fileName ||
    result.sourceFile?.file_name ||
    "Unknown";


  const quality =
    getQualityLabel(
      fileName,
      result.quality
    );


  const technical =
    getTechnicalMetadata(
      fileName
    );


  const languages =
    getLanguageTags(
      fileName
    );


  const parts = [

    quality

  ];


  if (
    technical.length
  ) {

    parts.push(
      ...technical
    );

  }


  if (
    languages.length
  ) {

    parts.push(
      ...languages
    );

  }


  return parts.join(
    " • "
  );

}


// ---------------------------------------------------------
// Build FebBox streams
// ---------------------------------------------------------

function buildFebboxStreams(
  qualityResults
) {

  return qualityResults

    .map(
      result => {

        const fileName =
          result.fileName ||
          result.sourceFile?.file_name ||
          "Unknown";


        const quality =
          getQualityLabel(
            fileName,
            result.quality
          );


        return {

          name:
            "FebBox",

          title:
            buildStreamTitle(
              result
            ),

          url:
            result.url,

          quality,

          fileName,

          fileSize:
            result.sourceFile?.file_size ||
            result.sourceFile?.size ||
            null,

          sourceFile:
            result.sourceFile,

          headers: {

            "User-Agent":
              WORKING_HEADERS[
                "User-Agent"
              ]

          }

        };

      }
    )

    .filter(
      stream =>
        stream.url
    );

}


// ---------------------------------------------------------
// Stream dedupe
// ---------------------------------------------------------

function dedupeStreams(
  streams
) {

  const seen =
    new Set();


  const result = [];


  for (
    const stream
    of streams
  ) {

    const key =
      [

        stream.url,

        stream.quality,

        stream.fileName

      ]
      .join(
        "|"
      );


    if (
      seen.has(
        key
      )
    ) {

      continue;

    }


    seen.add(
      key
    );


    result.push(
      stream
    );

  }


  return result;

}


// ---------------------------------------------------------
// Main handler
// ---------------------------------------------------------

export default async function handler(
  request,
  context
) {

  const requestId =
    Math.random()
      .toString(36)
      .slice(
        2,
        10
      );


  console.log(
    `[ShowBox][${requestId}] Request:`,
    request.url
  );


  try {

    const url =
      new URL(
        request.url
      );


    const pathParts =
      url.pathname
        .split("/")
        .filter(
          Boolean
        );


    /*
      Expected:

      /:config/stream/:type/:id.json

      Example:

      /eyJ.../stream/movie/tt1234567.json
    */


    if (
      pathParts.length <
      4
    ) {

      return new Response(
        JSON.stringify({

          streams:
            []

        }),
        {

          status:
            200,

          headers: {

            "Content-Type":
              "application/json"

          }

        }
      );

    }


    const rawConfig =
      pathParts[0];


    const type =
      pathParts[2];


    const rawId =
      pathParts[3];


    const id =
      rawId.replace(
        /\.json$/i,
        ""
      );


    const config =
      parseConfig(
        rawConfig
      );


    console.log(
      `[ShowBox][${requestId}] Parsed request:`,
      {

        type,

        id,

        config

      }
    );


    // -----------------------------------------------------
    // IMDb ID
    // -----------------------------------------------------

    const imdbId =
      id.startsWith(
        "tt"
      )

        ? id

        : `tt${id}`;


    let season =
      null;


    let episode =
      null;


    // -----------------------------------------------------
    // Series season / episode
    // -----------------------------------------------------

    if (
      type ===
      "series"
    ) {

      const match =
        imdbId.match(
          /tt\d+:(\d+):(\d+)/
        );


      if (
        match
      ) {

        season =
          Number(
            match[1]
          );


        episode =
          Number(
            match[2]
          );

      }

    }


    const cleanImdbId =
      imdbId.split(
        ":"
      )[0];


    console.log(
      `[ShowBox][${requestId}] IMDb:`,
      cleanImdbId
    );


    // -----------------------------------------------------
    // Validate series request
    // -----------------------------------------------------

    if (
      type ===
        "series" &&
      (
        season ===
          null ||
        episode ===
          null
      )
    ) {

      throw new Error(
        "Series request missing season or episode"
      );

    }


    // -----------------------------------------------------
    // IMDb -> TMDB
    // -----------------------------------------------------

    const tmdbId =
      await imdbToTmdb(
        cleanImdbId
      );


    console.log(
      `[ShowBox][${requestId}] TMDB ID:`,
      tmdbId
    );


    // -----------------------------------------------------
    // ShowBox search -> media ID
    // -----------------------------------------------------

    const showboxId =
      await searchShowBoxMediaId(
        tmdbId
      );


    console.log(
      `[ShowBox][${requestId}] ShowBox ID:`,
      showboxId
    );


    if (
      !showboxId
    ) {

      throw new Error(
        "ShowBox ID missing"
      );

    }


    // -----------------------------------------------------
    // FebBox share
    // -----------------------------------------------------

    const shareKey =
      await febboxShare(
        showboxId,
        type
      );


    // -----------------------------------------------------
    // Find movie / episode files
    // -----------------------------------------------------

    const files =
      await findFebboxFiles(
        shareKey,
        type,
        season,
        episode
      );


    const allQualityResults =
      [];


    // -----------------------------------------------------
    // Parse configured token
    //
    // Kept here because the Stremio config still supports
    // the ShowBox token. The current FebBox endpoint does
    // not require it directly.
    // -----------------------------------------------------

    const parsedToken =
      parseSingleToken(
        config?.token
      );


    console.log(
      `[ShowBox][${requestId}] Token configured:`,
      !!parsedToken
    );


    // -----------------------------------------------------
    // Get quality URLs from every matching file
    // -----------------------------------------------------

    for (
      const file
      of files
    ) {

      try {

        const results =
          await febboxQualityList(
            file,
            shareKey
          );


        for (
          const result
          of results
        ) {

          allQualityResults.push(
            result
          );

        }

      } catch (
        error
      ) {

        console.log(
          "[ShowBox] FebBox file failed:",
          {

            file:
              file.file_name,

            error:
              error.message

          }
        );

      }

    }


    console.log(
      `[ShowBox][${requestId}] Quality results before filters:`,
      allQualityResults.length
    );


    // -----------------------------------------------------
    // CAM / Telecine / Telesync filtering
    //
    // IMPORTANT:
    // This was previously defined but never called.
    // It now runs BEFORE stream construction.
    // -----------------------------------------------------

    const filteredQualityResults =
      applyStreamFilters(
        allQualityResults,
        config
      );


    // -----------------------------------------------------
    // Build FebBox streams
    // -----------------------------------------------------

    const febboxStreams =
      buildFebboxStreams(
        filteredQualityResults
      );


    // -----------------------------------------------------
    // Dedupe streams
    // -----------------------------------------------------

    const streams =
      dedupeStreams([
        ...febboxStreams
      ]);


    // -----------------------------------------------------
    // Quality settings
    // -----------------------------------------------------

    const qualityFilteredStreams =
      applyQualitySettings(
        streams,
        config
      );


    // -----------------------------------------------------
    // File-size settings
    // -----------------------------------------------------

    const configuredStreams =
      applyFileSizeSettings(
        qualityFilteredStreams,
        config
      );


    console.log(
      `[ShowBox][${requestId}] Final streams:`,
      configuredStreams.length
    );


    // -----------------------------------------------------
    // Stremio response
    // -----------------------------------------------------

    return new Response(
      JSON.stringify({

        streams:
          configuredStreams

      }),
      {

        status:
          200,

        headers: {

          "Content-Type":
            "application/json",

          "Cache-Control":
            "no-store"

        }

      }
    );


  } catch (
    error
  ) {

    console.error(
      `[ShowBox][${requestId}] Error:`,
      error
    );


    return new Response(
      JSON.stringify({

        streams:
          []

      }),
      {

        status:
          200,

        headers: {

          "Content-Type":
            "application/json",

          "Cache-Control":
            "no-store"

        }

      }
    );

  }

}


// ---------------------------------------------------------
// Netlify route
// ---------------------------------------------------------

export const config = {

  path:
    "/:config/stream/:type/:id.json"

};
