import CryptoJS from "crypto-js";

import {
  getConfig
} from "./config-store.js";


const TMDB_API_KEY =
  "439c478a771f35c05022f9feabcca01c";

const TMDB_BASE_URL =
  "https://api.themoviedb.org/3";

const FETCH_TIMEOUT_MS =
  30_000;

const MAX_FILE_SIZE_GB =
  200;


// ---------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = FETCH_TIMEOUT_MS
) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
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

  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {

      throw new Error(
        `Upstream request timed out after ${timeoutMs / 1000} seconds`
      );

    }

    throw error;

  } finally {

    clearTimeout(
      timeout
    );

  }
}


// ---------------------------------------------------------
// Base64URL
// ---------------------------------------------------------

function decodeBase64Url(
  value
) {

  let base64 =
    value
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

  return Buffer
    .from(
      base64,
      "base64"
    )
    .toString(
      "utf8"
    );
}


// ---------------------------------------------------------
// Parse legacy Base64 config
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
// Load configured Stremio config
// ---------------------------------------------------------

async function loadConfig(
  rawConfig
) {

  /*
   * New configuration IDs are 32-character
   * hexadecimal values stored in Netlify Blobs.
   */

  if (
    /^[a-f0-9]{32}$/i.test(
      rawConfig
    )
  ) {

    const storedConfig =
      await getConfig(
        rawConfig
      );


    if (
      storedConfig &&
      typeof storedConfig === "object" &&
      !Array.isArray(storedConfig)
    ) {

      console.log(
        "[ShowBox] Loaded persistent configuration:",
        {
          id:
            rawConfig
        }
      );


      return storedConfig;

    }


    console.log(
      "[ShowBox] Persistent configuration not found:",
      rawConfig
    );

  }


  /*
   * Legacy Base64 configuration.
   *
   * Existing installations generated before
   * the persistent configuration system continue
   * to work.
   */

  const legacyConfig =
    parseConfig(
      rawConfig
    );


  return legacyConfig;

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
          .toString(
            "utf8"
          )
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


  const tmdbUrl =
    new URL(
      `${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}`
    );


  tmdbUrl.searchParams.set(
    "api_key",
    TMDB_API_KEY
  );

  tmdbUrl.searchParams.set(
    "external_source",
    "imdb_id"
  );


  const response =
    await fetchWithTimeout(
      tmdbUrl
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
      await fetchWithTimeout(
        `${TMDB_BASE_URL}${endpoint}?api_key=${encodeURIComponent(TMDB_API_KEY)}`
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
// ShowBox web search: IMDb -> ShowBox media ID
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
// Validate ShowBox URL
// ---------------------------------------------------------

function isAllowedShowBoxUrl(
  value
) {

  try {

    const url =
      new URL(
        value
      );


    if (
      url.protocol !== "https:"
    ) {

      return false;

    }


    const hostname =
      url.hostname.toLowerCase();


    return (
      hostname ===
        "showbox.media" ||
      hostname.endsWith(
        ".showbox.media"
      )
    );

  } catch {

    return false;

  }
}


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

      const detailUrl =
        new URL(
          match[1],
          SHOWBOX_WEB_API
        ).href;


      if (
        !isAllowedShowBoxUrl(
          detailUrl
        )
      ) {

        console.log(
          "[ShowBox] Rejected unexpected detail URL:",
          detailUrl
        );

        return null;

      }


      return detailUrl;

    }

  }


  return null;
}


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


async function searchShowBoxMediaId(
  imdbId
) {

  console.log(
    "[ShowBox] Web search:",
    imdbId
  );


  const searchUrl =
    new URL(
      `${SHOWBOX_WEB_API}/search`
    );


  searchUrl.searchParams.set(
    "keyword",
    imdbId
  );


  const searchResponse =
    await fetchWithTimeout(
      searchUrl,
      {
        headers:
          SHOWBOX_SEARCH_HEADERS
      }
    );


  console.log(
    "[ShowBox] Web search response:",
    searchResponse.status
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


  console.log(
    "[ShowBox] Web search detail URL:",
    detailUrl
  );


  const detailResponse =
    await fetchWithTimeout(
      detailUrl,
      {
        headers:
          SHOWBOX_SEARCH_HEADERS
      }
    );


  console.log(
    "[ShowBox] Web detail response:",
    detailResponse.status
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


  console.log(
    "[ShowBox] Verified media ID:",
    showboxId
  );


  return showboxId;
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


  const febboxUrl =
    new URL(
      "https://www.febbox.com/mbp/to_share_page"
    );


  febboxUrl.searchParams.set(
    "box_type",
    String(
      boxType
    )
  );

  febboxUrl.searchParams.set(
    "mid",
    String(
      showboxId
    )
  );

  febboxUrl.searchParams.set(
    "json",
    "1"
  );


  console.log(
    "[ShowBox] FebBox share request:",
    {
      boxType,
      showboxId
    }
  );


  const response =
    await fetchWithTimeout(
      febboxUrl
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


  if (!shareLink) {

    throw new Error(
      "FebBox share link missing"
    );

  }


  let shareKey = "";


  try {

    const shareUrl =
      new URL(
        shareLink
      );


    shareKey =
      shareUrl.pathname
        .split("/")
        .filter(Boolean)
        .pop() ||
      "";

  } catch {

    shareKey =
      shareLink
        .split("/")
        .filter(Boolean)
        .pop() ||
      "";

  }


  if (!shareKey) {

    throw new Error(
      "FebBox share key missing"
    );

  }


  console.log(
    "[ShowBox] FebBox share key:",
    {
      length:
        shareKey.length
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

  const febboxUrl =
    new URL(
      "https://www.febbox.com/file/file_share_list"
    );


  febboxUrl.searchParams.set(
    "share_key",
    String(
      shareKey
    )
  );


  const response =
    await fetchWithTimeout(
      febboxUrl,
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

  const febboxUrl =
    new URL(
      "https://www.febbox.com/file/file_share_list"
    );


  febboxUrl.searchParams.set(
    "share_key",
    String(
      shareKey
    )
  );


  febboxUrl.searchParams.set(
    "parent_id",
    String(
      seasonFolder.fid
    )
  );


  febboxUrl.searchParams.set(
    "page",
    "1"
  );


  const response =
    await fetchWithTimeout(
      febboxUrl,
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
    "[ShowBox] FebBox season folder:",
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
    String(
      season
    )
      .padStart(
        2,
        "0"
      );


  const e2 =
    String(
      episode
    )
      .padStart(
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


  const febboxUrl =
    new URL(
      "https://www.febbox.com/console/video_quality_list"
    );


  febboxUrl.searchParams.set(
    "fid",
    String(
      file.fid
    )
  );


  febboxUrl.searchParams.set(
    "share_key",
    String(
      shareKey
    )
  );


  console.log(
    "[ShowBox] FebBox quality request:",
    {
      fid:
        file.fid
    }
  );


  const response =
    await fetchWithTimeout(
      febboxUrl,
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
      JSON.parse(
        text
      );


    /*
     * Kept intentionally for current testing.
     * Remove detailed upstream response logging
     * before production if it contains sensitive data.
     */

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
// Validate stream URL
// ---------------------------------------------------------

function isValidStreamUrl(
  value
) {

  try {

    const url =
      new URL(
        String(
          value
        )
      );


    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );

  } catch {

    return false;

  }
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


    const streamUrl =
      urlMatch[1];


    if (
      !isValidStreamUrl(
        streamUrl
      )
    ) {

      console.log(
        "[ShowBox] Rejected invalid stream URL"
      );

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


  if (
    String(quality)
      .toUpperCase()
      === "ORG"
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
// Normalize language value
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
// Detect explicit languages in filenames
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
      ? releaseDate.slice(
          0,
          4
        )
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


  if (
    type === "series" &&
    Number.isFinite(season) &&
    Number.isFinite(episode)
  ) {

    lines.push(
      `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
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

    })
  );
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


// =========================================================
// QUALITY CONFIGURATION
// =========================================================

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
   * Old configured addon URLs don't have
   * a qualities property.
   *
   * Preserve their previous behavior.
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
      !priority.includes(
        name
      )
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
   * Append any default qualities missing
   * from the configuration.
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
// Get quality from stream
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


  const title =
    String(
      stream.title || ""
    );


  /*
   * The quality is normally the first part
   * of the technical line.
   */

  const firstLine =
    title.split(
      "\n"
    )[2] || "";


  const qualityFromTitle =
    getCanonicalQuality(
      firstLine
    );


  if (
    qualityFromTitle
  ) {

    return qualityFromTitle;

  }


  return "";
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
   * Old configuration URLs don't have
   * quality settings.
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
         * Keep streams whose quality cannot
         * be identified.
         */

        if (!quality) {
          return true;
        }


        return qualityConfig.enabled.has(
          quality
        );

      }
    );


  /*
   * Keep the existing stable quality ordering.
   */

  filtered.sort(
    (a, b) => {

      const qa =
        getStreamQuality(
          a
        );


      const qb =
        getStreamQuality(
          b
        );


      const ia =
        qa
          ? qualityConfig.priority.indexOf(
              qa
            )
          : Infinity;


      const ib =
        qb
          ? qualityConfig.priority.indexOf(
              qb
            )
          : Infinity;


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


// =========================================================
// STREAM FILTER CONFIGURATION
// =========================================================

const DEFAULT_STREAM_FILTERS = {
  cam: false
};


// ---------------------------------------------------------
// Normalize stream filter configuration
// ---------------------------------------------------------

function normalizeStreamFilterConfig(
  config
) {

  const filters =
    config?.filters;


  /*
   * Old addon configurations don't have
   * stream filters.
   *
   * Default: block CAM / Telecine streams.
   */

  if (
    !filters ||
    typeof filters !== "object"
  ) {

    return {
      ...DEFAULT_STREAM_FILTERS
    };

  }


  return {

    cam:
      filters.cam === true

  };
}


// ---------------------------------------------------------
// Detect CAM / Telecine
// ---------------------------------------------------------

function isCamOrTelecine(
  fileName
) {

  const text =
    String(
      fileName || ""
    ).toUpperCase();


  return (
    /\bTELECINE\b/.test(text) ||
    /(?:^|[._\-\s])TC(?:$|[._\-\s])/.test(text) ||
    /\bTELESYNC\b/.test(text) ||
    /(?:^|[._\-\s])TS(?:$|[._\-\s])/.test(text) ||
    /\bCAMRIP\b/.test(text) ||
    /\bCAM\b/.test(text)
  );
}


// ---------------------------------------------------------
// Apply stream filters
// ---------------------------------------------------------

function applyStreamFilters(
  qualityResults,
  config
) {

  const filters =
    normalizeStreamFilterConfig(
      config
    );


  /*
   * Filter the original FebBox file
   * metadata before streams are built.
   */

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


// =========================================================
// FILE SIZE CONFIGURATION
// =========================================================


// ---------------------------------------------------------
// Parse file size into GB
// ---------------------------------------------------------

function parseSizeGb(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  const text =
    String(
      value
    )
      .trim()
      .replace(
        /,/g,
        ""
      )
      .toUpperCase();


  if (!text) {
    return null;
  }


  const match =
    text.match(
      /([\d.]+)\s*(TB|GB|MB|KB|B)\b/
    );


  if (!match) {
    return null;
  }


  const number =
    Number(
      match[1]
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return null;

  }


  const unit =
    match[2];


  if (
    unit === "TB"
  ) {

    return number * 1024;

  }


  if (
    unit === "GB"
  ) {

    return number;

  }


  if (
    unit === "MB"
  ) {

    return number / 1024;

  }


  if (
    unit === "KB"
  ) {

    return number /
      (1024 * 1024);

  }


  if (
    unit === "B"
  ) {

    return number /
      (1024 * 1024 * 1024);

  }


  return null;
}


// ---------------------------------------------------------
// Apply file-size settings
// ---------------------------------------------------------

function applyFileSizeSettings(
  streams,
  config
) {

  const fileSize =
    config?.fileSize;


  /*
   * No file-size configuration means
   * preserve the existing behavior.
   */

  if (
    !fileSize ||
    (
      fileSize.minGb === null &&
      fileSize.maxGb === null
    )
  ) {

    return streams;

  }


  let minGb =
    Number.isFinite(
      Number(
        fileSize.minGb
      )
    )
      ? Number(
          fileSize.minGb
        )
      : null;


  let maxGb =
    Number.isFinite(
      Number(
        fileSize.maxGb
      )
    )
      ? Number(
          fileSize.maxGb
        )
      : null;


  /*
   * Defense-in-depth for legacy Base64
   * configurations.
   *
   * New configurations are already validated
   * before being stored, but old configuration
   * URLs can bypass that validation.
   */

  if (
    minGb !== null
  ) {

    minGb =
      Math.max(
        0,
        Math.min(
          MAX_FILE_SIZE_GB,
          minGb
        )
      );

  }


  if (
    maxGb !== null
  ) {

    maxGb =
      Math.max(
        0,
        Math.min(
          MAX_FILE_SIZE_GB,
          maxGb
        )
      );

  }


  /*
   * An invalid min > max configuration is
   * ignored rather than accidentally filtering
   * every stream.
   */

  if (
    minGb !== null &&
    maxGb !== null &&
    minGb > maxGb
  ) {

    console.log(
      "[ShowBox] Invalid file-size configuration:",
      {
        minGb,
        maxGb
      }
    );

    return streams;

  }


  if (
    minGb === null &&
    maxGb === null
  ) {

    return streams;

  }


  const filtered =
    streams.filter(
      stream => {

        const sizeGb =
          parseSizeGb(
            stream.size
          );


        /*
         * If the size is unavailable or
         * cannot be parsed, keep the stream.
         */

        if (
          sizeGb === null
        ) {

          return true;

        }


        if (
          minGb !== null &&
          sizeGb < minGb
        ) {

          return false;

        }


        if (
          maxGb !== null &&
          sizeGb > maxGb
        ) {

          return false;

        }


        return true;

      }
    );


  console.log(
    "[ShowBox] File-size settings:",
    {

      minGb,

      maxGb,

      before:
        streams.length,

      after:
        filtered.length

    }
  );


  return filtered;
}


// =========================================================
// Main handler
// =========================================================

export default async (
  req,
  context
) {

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


    /*
     * Explicitly allow only the two Stremio
     * content types this addon supports.
     */

    if (
      type !== "movie" &&
      type !== "series"
    ) {

      throw new Error(
        `Unsupported stream type: ${type}`
      );

    }


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
      await loadConfig(
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


      /*
       * Keep season / episode unrestricted.
       * Some metadata providers can expose very
       * large episode numbers.
       */

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

    /*
     * Keep this lookup because its resulting
     * TMDB ID is used to obtain title metadata.
     */

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

    const showboxId =
      await searchShowBoxMediaId(
        imdbId
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

    /*
     * No artificial file-count limit is applied.
     *
     * Movie requests may legitimately contain
     * multiple source files, and series requests
     * may contain multiple matching releases.
     */

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
    // Apply CAM / Telecine filter
    // BEFORE building Stremio streams
    // -----------------------------------------------------

    const filteredQualityResults =
      applyStreamFilters(
        allQualityResults,
        config
      );


    // -----------------------------------------------------
    // FebBox streams
    // -----------------------------------------------------

    const febboxStreams =
      buildFebboxStreams(
        filteredQualityResults,
        tmdbDetails,
        type,
        season,
        episode
      );


    // -----------------------------------------------------
    // Combine both sources
    // -----------------------------------------------------

    const streams =
      dedupeStreams([
        ...febboxStreams
      ]);


    // -----------------------------------------------------
    // Apply quality settings
    // -----------------------------------------------------

    const qualityFilteredStreams =
      applyQualitySettings(
        streams,
        config
      );


    // -----------------------------------------------------
    // Apply file-size settings
    // -----------------------------------------------------

    const configuredStreams =
      applyFileSizeSettings(
        qualityFilteredStreams,
        config
      );


    if (
      !configuredStreams.length
    ) {

      throw new Error(
        "No streams remain after filtering"
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
            "application/json; charset=utf-8",

          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",

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
            "application/json; charset=utf-8",

          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",

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
