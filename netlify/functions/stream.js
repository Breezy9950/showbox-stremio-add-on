import CryptoJS from "crypto-js";

const TMDB_API_KEY =
  "439c478a771f35c05022f9feabcca01c";

const TMDB_BASE_URL =
  "https://api.themoviedb.org/3";

const SHOWBOX_API =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

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

function decodeBase64Url(value) {

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

function parseConfig(rawConfig) {

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
// TMDB title information
// ---------------------------------------------------------

async function getTMDBDetails(
  tmdbId,
  type
) {

  try {

    const endpoint =
      type === "series"
        ? `/tv/${tmdbId}`
        : `/movie/${tmdbId}`;


    const response =
      await fetch(
        `${TMDB_BASE_URL}${endpoint}?api_key=${TMDB_API_KEY}`
      );


    if (!response.ok) {
      return null;
    }


    return await response.json();

  } catch {

    return null;

  }
}


// ---------------------------------------------------------
// ShowBox API
// ---------------------------------------------------------

async function getShowBoxData(
  tmdbId,
  type,
  season,
  episode,
  token
) {

  let requestUrl;


  if (
    type === "series"
  ) {

    requestUrl =
      `${SHOWBOX_API}/tv/${tmdbId}/${season}/${episode}?cookie=${encodeURIComponent(token)}`;

  } else {

    requestUrl =
      `${SHOWBOX_API}/movie/${tmdbId}?cookie=${encodeURIComponent(token)}`;

  }


  console.log(
    "[ShowBox] ShowBox request:",
    {
      type,
      tmdbId,
      season,
      episode
    }
  );


  const response =
    await fetch(
      requestUrl,
      {
        headers:
          WORKING_HEADERS
      }
    );


  console.log(
    "[ShowBox] ShowBox response:",
    {
      status:
        response.status
    }
  );


  if (!response.ok) {

    throw new Error(
      `ShowBox API HTTP ${response.status}`
    );

  }


  return await response.json();
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
    await fetch(url);


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
      JSON.parse(text);

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


  if (!shareLink) {

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
      JSON.parse(text);

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
      JSON.parse(text);

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
// Find ALL matching FebBox files
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


    if (!files.length) {

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
        item.file_name &&
        item.file_name
          .toLowerCase()
          .trim() ===
          expectedSeason
    );


  if (!seasonFolder) {

    throw new Error(
      `Season folder not found: ${expectedSeason}`
    );

  }


  console.log(
    "[ShowBox] Season folder:",
    {
      name:
        seasonFolder.file_name,

      fid:
        seasonFolder.fid
    }
  );


  const files =
    await febboxSeasonFileList(
      shareKey,
      seasonFolder
    );


  const s2 =
    String(season)
      .padStart(2, "0");


  const e2 =
    String(episode)
      .padStart(2, "0");


  const lowerS =
    String(season);

  const lowerE =
    String(episode);


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


  console.log(
    "[ShowBox] Episode files found:",
    matchingFiles.map(
      file => ({
        name:
          file.file_name,

        fid:
          file.fid
      })
    )
  );


  return matchingFiles;
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


  console.log(
    "[ShowBox] Token diagnostics:",
    {
      length:
        token.length,

      startsWithUi:
        token.startsWith("ui="),

      startsWithJwt:
        token.startsWith("eyJ"),

      cookieLength:
        cookieHeader.length
    }
  );


  const qualityUrl =
    `https://www.febbox.com/console/video_quality_list?fid=${file.fid}&share_key=${shareKey}`;


  console.log(
    "[ShowBox] FebBox quality request:",
    {
      fid:
        file.fid
    }
  );


  const response =
    await fetch(
      qualityUrl,
      {
        headers: {
          Cookie:
            cookieHeader
        }
      }
    );


  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  const finalUrl =
    response.url;


  const text =
    await response.text();


  console.log(
    "[ShowBox] FebBox quality response:",
    {
      status:
        response.status,

      contentType,

      bodyLength:
        text.length,

      finalUrl
    }
  );


  let data;


  try {

    data =
      JSON.parse(text);


    console.log(
      "[ShowBox] FebBox quality JSON:",
      JSON.stringify(data)
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


    if (!urlMatch) {
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


  console.log(
    "[ShowBox] Parsed FebBox qualities:",
    streams.length
  );


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


  // -------------------------------------------------------
  // Source / release type
  // -------------------------------------------------------

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
    /\bTELESYNC\b/.test(
      upper
    ) ||
    /\bTS\b/.test(
      upper
    )
  ) {

    result.push(
      "TELESYNC"
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


  // -------------------------------------------------------
  // Dynamic range
  // -------------------------------------------------------

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


  // -------------------------------------------------------
  // Audio codec
  // -------------------------------------------------------

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


  // -------------------------------------------------------
  // Video codec
  // -------------------------------------------------------

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
// Extract explicit language information
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
    Array.isArray(value)
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


  return String(value)
    .split(
      /[,|/]+/
    )
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);
}


// ---------------------------------------------------------
// Detect explicit languages from an object
// ---------------------------------------------------------

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


// ---------------------------------------------------------
// Detect explicitly written language names in filenames
// ---------------------------------------------------------

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
// Title
// ---------------------------------------------------------

function buildTitle(
  tmdbDetails,
  type
) {

  if (!tmdbDetails) {
    return "";
  }


  if (
    type === "series"
  ) {

    return (
      tmdbDetails.name ||
      tmdbDetails.original_name ||
      ""
    );

  }


  const title =
    tmdbDetails.title ||
    tmdbDetails.original_title ||
    "";


  const releaseDate =
    tmdbDetails.release_date ||
    "";


  const year =
    releaseDate
      ? releaseDate.slice(0, 4)
      : "";


  if (
    title &&
    year
  ) {

    return `${title} (${year})`;

  }


  return title;
}


// ---------------------------------------------------------
// Stream technical line
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
      !parts.includes(value)
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
// Build stream title
// ---------------------------------------------------------

function buildStreamTitle(
  item,
  tmdbDetails,
  type,
  season,
  episode
) {

  const lines = [];


  const title =
    buildTitle(
      tmdbDetails,
      type
    );


  if (
    title
  ) {

    lines.push(
      title
    );

  }


  // -------------------------------------------------------
  // Episode number
  // -------------------------------------------------------

  if (
    type === "series" &&
    Number.isFinite(season) &&
    Number.isFinite(episode)
  ) {

    lines.push(
      `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
    );

  }


  // -------------------------------------------------------
  // Technical metadata
  // -------------------------------------------------------

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


  // -------------------------------------------------------
  // Size
  // -------------------------------------------------------

  if (
    item.size
  ) {

    lines.push(
      item.size
    );

  }


  // -------------------------------------------------------
  // Audio
  // -------------------------------------------------------

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


  // -------------------------------------------------------
  // Subtitles
  // -------------------------------------------------------

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
  tmdbDetails,
  type,
  season,
  episode
) {

  return qualityResults.map(
    item => ({

      name:
        getQualityLabel(
          item.quality,
          item.fileName
        ) ||
        "ShowBox",


      title:
        buildStreamTitle(
          item,
          tmdbDetails,
          type,
          season,
          episode
        ),


      url:
        item.url,


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

    })
  );
}


// ---------------------------------------------------------
// Extract ShowBox versions
// ---------------------------------------------------------

function getShowBoxVersions(
  showboxData
) {

  if (
    Array.isArray(
      showboxData?.versions
    )
  ) {

    return showboxData.versions;

  }


  if (
    Array.isArray(
      showboxData?.data?.versions
    )
  ) {

    return showboxData.data.versions;

  }


  return [];
}


// ---------------------------------------------------------
// Extract ShowBox version/link streams
// ---------------------------------------------------------

function extractShowBoxStreams(
  showboxData,
  tmdbDetails,
  type,
  season,
  episode
) {

  const versions =
    getShowBoxVersions(
      showboxData
    );


  const streams = [];


  for (
    const version of versions
  ) {

    if (
      !version ||
      !Array.isArray(
        version.links
      )
    ) {

      continue;

    }


    for (
      const link of version.links
    ) {

      if (
        !link ||
        !link.url
      ) {

        continue;

      }


      const fileName =
        link.file_name ||
        link.filename ||
        link.fileName ||
        link.name ||
        version.file_name ||
        version.filename ||
        version.fileName ||
        version.name ||
        "";


      const quality =
        link.quality ||
        version.quality ||
        "";


      const size =
        link.size ||
        version.size ||
        "";


      const item = {

        url:
          link.url,

        quality,

        size,

        fileName,

        link,

        sourceFile:
          link

      };


      streams.push({

        name:
          getQualityLabel(
            quality,
            fileName
          ) ||
          "ShowBox",


        title:
          buildStreamTitle(
            item,
            tmdbDetails,
            type,
            season,
            episode
          ),


        url:
          link.url,


        behaviorHints: {
          bingeGroup:
            "showbox"
        }

      });

    }

  }


  console.log(
    "[ShowBox] ShowBox version streams:",
    streams.length
  );


  return streams;
}


// ---------------------------------------------------------
// Remove duplicate URLs
// ---------------------------------------------------------

function dedupeStreams(
  streams
) {

  const seen =
    new Set();


  return streams.filter(
    stream => {

      if (
        !stream ||
        !stream.url
      ) {

        return false;

      }


      if (
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
}


// ---------------------------------------------------------
// QUALITY CONFIGURATION
// ---------------------------------------------------------

const DEFAULT_QUALITIES = [
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];


// ---------------------------------------------------------
// Normalize quality configuration
// ---------------------------------------------------------

function normalizeQualityConfig(
  config
) {

  /*
   * Old configured addon URLs do not have
   * a qualities property.
   *
   * In that case, preserve the old behavior
   * and allow every quality.
   */

  if (
    !Array.isArray(
      config?.qualities
    )
  ) {

    return {
      enabled:
        new Set(
          DEFAULT_QUALITIES
        ),

      priority:
        DEFAULT_QUALITIES.slice(),

      configured:
        false
    };

  }


  const priority = [];

  const enabled =
    new Set();


  for (
    const item of config.qualities
  ) {

    if (
      !item ||
      !item.name
    ) {

      continue;

    }


    const name =
      getCanonicalQuality(
        item.name
      );


    if (!name) {
      continue;
    }


    if (
      !priority.includes(name)
    ) {

      priority.push(
        name
      );

    }


    if (
      item.enabled === true
    ) {

      enabled.add(
        name
      );

    }

  }


  /*
   * Make sure qualities that may appear in a
   * stream but weren't present in the config
   * aren't accidentally lost because of an
   * incomplete configuration.
   *
   * They are appended after configured qualities.
   */

  for (
    const quality of DEFAULT_QUALITIES
  ) {

    if (
      !priority.includes(
        quality
      )
    ) {

      priority.push(
        quality
      );

    }

  }


  return {
    enabled,
    priority,
    configured:
      true
  };
}


// ---------------------------------------------------------
// Canonical quality name
// ---------------------------------------------------------

function getCanonicalQuality(
  value
) {

  const text =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    text === "org" ||
    text === "original"
  ) {

    return "ORG";

  }


  if (
    text === "4k" ||
    text === "2160p" ||
    text === "2160"
  ) {

    return "4K";

  }


  if (
    text === "1440p" ||
    text === "1440"
  ) {

    return "1440p";

  }


  if (
    text === "1080p" ||
    text === "1080"
  ) {

    return "1080p";

  }


  if (
    text === "720p" ||
    text === "720"
  ) {

    return "720p";

  }


  if (
    text === "480p" ||
    text === "480"
  ) {

    return "480p";

  }


  if (
    text === "360p" ||
    text === "360"
  ) {

    return "360p";

  }


  return null;
}


// ---------------------------------------------------------
// Get quality from a stream
// ---------------------------------------------------------

function getStreamQuality(
  stream
) {

  if (!stream) {
    return "";
  }


  const name =
    getCanonicalQuality(
      stream.name
    );


  if (name) {
    return name;
  }


  /*
   * Some ShowBox streams may have a less
   * normalized name. Check the title too.
   */

  const title =
    String(
      stream.title || ""
    );


  return (
    getCanonicalQuality(
      title
    ) ||
    ""
  );
}


// ---------------------------------------------------------
// Apply configured quality settings
// ---------------------------------------------------------

function applyQualitySettings(
  streams,
  config
) {

  const qualityConfig =
    normalizeQualityConfig(
      config
    );


  /*
   * If this is an old configuration URL,
   * don't change its behavior.
   */

  if (
    !qualityConfig.configured
  ) {

    return streams;

  }


  const filtered =
    streams.filter(
      stream => {

        const quality =
          getStreamQuality(
            stream
          );


        /*
         * If we cannot identify the quality,
         * keep the stream rather than silently
         * deleting an otherwise playable stream.
         */

        if (!quality) {
          return true;
        }


        return qualityConfig.enabled
          .has(
            quality
          );

      }
    );


  /*
   * Sort only recognized quality streams.
   *
   * Unknown-quality streams are placed
   * after configured qualities.
   */

  filtered.sort(
    (a, b) => {

      const qa =
        getStreamQuality(a);

      const qb =
        getStreamQuality(b);


      const ia =
        qa
          ? qualityConfig.priority.indexOf(qa)
          : Infinity;


      const ib =
        qb
          ? qualityConfig.priority.indexOf(qb)
          : Infinity;


      /*
       * Preserve original order when both
       * streams have the same priority or
       * are unknown.
       */

      return ia - ib;

    }
  );


  console.log(
    "[ShowBox] Quality settings:",
    {
      enabled:
        Array.from(
          qualityConfig.enabled
        ),

      priority:
        qualityConfig.priority,

      before:
        streams.length,

      after:
        filtered.length
    }
  );


  return filtered;
}


// ---------------------------------------------------------
// Main handler
// ---------------------------------------------------------

export default async (
  req,
  context
) => {

  const requestId =
    Math.random()
      .toString(36)
      .slice(2, 8);


  console.log(
    `[ShowBox][${requestId}] ===== START =====`
  );


  try {

    const url =
      new URL(
        req.url
      );


    const pathname =
      url.pathname;


    // -----------------------------------------------------
    // Extract config + request
    // -----------------------------------------------------

    const match =
      pathname.match(
        /^\/([^/]+)\/stream\/([^/]+)\/(.+)$/
      );


    if (!match) {

      throw new Error(
        "Invalid stream request path"
      );

    }


    const rawConfig =
      match[1];


    const type =
      match[2];


    let rawId =
      decodeURIComponent(
        match[3]
      );


    console.log(
      `[ShowBox][${requestId}] Request:`,
      {
        type,
        rawId
      }
    );


    // -----------------------------------------------------
    // Remove .json
    // -----------------------------------------------------

    rawId =
      rawId.replace(
        /\.json$/,
        ""
      );


    // -----------------------------------------------------
    // Parse configuration
    // -----------------------------------------------------

    const config =
      parseConfig(
        rawConfig
      );


    const token =
      config.uiToken ||
      "";


    console.log(
      `[ShowBox][${requestId}] Token loaded:`,
      {
        present:
          !!token
      }
    );


    if (!token) {

      throw new Error(
        "No ShowBox UI token configured"
      );

    }


    // -----------------------------------------------------
    // Parse IMDb / season / episode
    // -----------------------------------------------------

    let imdbId;

    let season;

    let episode;


    if (
      type === "series"
    ) {

      const parts =
        rawId.split(":");


      imdbId =
        parts[0];


      season =
        Number(
          parts[1]
        );


      episode =
        Number(
          parts[2]
        );


      if (
        !imdbId ||
        !Number.isFinite(
          season
        ) ||
        !Number.isFinite(
          episode
        )
      ) {

        throw new Error(
          `Invalid series ID: ${rawId}`
        );

      }


      console.log(
        `[ShowBox][${requestId}] Parsed:`,
        {
          imdbId,
          season,
          episode
        }
      );

    } else {

      imdbId =
        rawId;


      console.log(
        `[ShowBox][${requestId}] Parsed:`,
        {
          imdbId
        }
      );

    }


    // -----------------------------------------------------
    // IMDb -> TMDB
    // -----------------------------------------------------

    const tmdbId =
      await imdbToTmdb(
        imdbId
      );


    console.log(
      `[ShowBox][${requestId}] TMDB:`,
      tmdbId
    );


    // -----------------------------------------------------
    // Get title metadata
    // -----------------------------------------------------

    const tmdbDetails =
      await getTMDBDetails(
        tmdbId,
        type
      );


    console.log(
      `[ShowBox][${requestId}] TMDB details:`,
      {
        found:
          !!tmdbDetails,

        title:
          tmdbDetails?.title ||
          tmdbDetails?.name ||
          null
      }
    );


    // -----------------------------------------------------
    // Parse ShowBox token
    // -----------------------------------------------------

    const parsedToken =
      parseSingleToken(
        token
      );


    console.log(
      `[ShowBox][${requestId}] Token ready:`,
      {
        tokenParsed:
          parsedToken !== token
      }
    );


    // -----------------------------------------------------
    // ShowBox
    // -----------------------------------------------------

    const showboxData =
      await getShowBoxData(
        tmdbId,
        type,
        season,
        episode,
        parsedToken
      );


    if (
      !showboxData ||
      showboxData.success === false
    ) {

      throw new Error(
        "ShowBox API returned failure"
      );

    }


    const showboxId =
      showboxData.id ||
      showboxData.mid ||
      (
        showboxData.data &&
        (
          showboxData.data.id ||
          showboxData.data.mid
        )
      );


    console.log(
      `[ShowBox][${requestId}] ShowBox ID:`,
      showboxId
    );


    if (!showboxId) {

      throw new Error(
        "ShowBox ID missing"
      );

    }


    // -----------------------------------------------------
    // FIRST: Restore ShowBox version/link streams
    // -----------------------------------------------------

    const showboxStreams =
      extractShowBoxStreams(
        showboxData,
        tmdbDetails,
        type,
        season,
        episode
      );


    // -----------------------------------------------------
    // FebBox share
    // -----------------------------------------------------

    const shareKey =
      await febboxShare(
        showboxId,
        type
      );


    // -----------------------------------------------------
    // Find ALL matching FebBox files
    // -----------------------------------------------------

    const files =
      await findFebboxFiles(
        shareKey,
        type,
        season,
        episode
      );


    // -----------------------------------------------------
    // Get qualities from ALL matching files
    // -----------------------------------------------------

    const allQualityResults =
      [];


    for (
      const file of files
    ) {

      try {

        const results =
          await febboxQualityList(
            file,
            shareKey,
            parsedToken
          );


        for (
          const result of results
        ) {

          allQualityResults.push(
            result
          );

        }

      } catch (error) {

        console.log(
          "[ShowBox] FebBox file failed:",
          {
            file:
              file.file_name,

            fid:
              file.fid,

            error:
              error.message
          }
        );

      }

    }


    // -----------------------------------------------------
    // FebBox streams
    // -----------------------------------------------------

    const febboxStreams =
      buildFebboxStreams(
        allQualityResults,
        tmdbDetails,
        type,
        season,
        episode
      );


    // -----------------------------------------------------
    // Combine both sources
    //
    // Keep FebBox first because that is the path we
    // have already verified as working on iPad.
    // -----------------------------------------------------

    const streams =
      dedupeStreams([
        ...febboxStreams,
        ...showboxStreams
      ]);


    // -----------------------------------------------------
    // Apply quality configuration
    //
    // IMPORTANT:
    //
    // Nothing above this point has been changed.
    //
    // ShowBox and FebBox streams are generated exactly
    // as before. Quality filtering happens only here.
    // -----------------------------------------------------

    const configuredStreams =
      applyQualitySettings(
        streams,
        config
      );


    if (
      !configuredStreams.length
    ) {

      throw new Error(
        "No streams remain after quality filtering"
      );

    }


    // -----------------------------------------------------
    // Final diagnostics
    // -----------------------------------------------------

    console.log(
      `[ShowBox][${requestId}] Stream breakdown:`,
      {
        febbox:
          febboxStreams.length,

        showbox:
          showboxStreams.length,

        combined:
          streams.length,

        final:
          configuredStreams.length
      }
    );


    console.log(
      `[ShowBox][${requestId}] ===== END =====`
    );


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

          "Access-Control-Allow-Origin":
            "*"
        }
      }
    );


  } catch (error) {

    console.error(
      `[ShowBox][${requestId}] ===== ERROR =====`
    );


    console.error(
      `[ShowBox][${requestId}]`,
      error.message
    );


    console.error(
      `[ShowBox][${requestId}] ===== END ERROR =====`
    );


    return new Response(
      JSON.stringify({
        streams: []
      }),
      {
        status:
          200,

        headers: {
          "Content-Type":
            "application/json",

          "Access-Control-Allow-Origin":
            "*"
        }
      }
    );

  }

};


// ---------------------------------------------------------
// Netlify route
// ---------------------------------------------------------

export const config = {

  path:
    "/:config/stream/:type/:id.json"

};
