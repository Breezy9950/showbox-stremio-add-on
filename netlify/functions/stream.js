import CryptoJS from "crypto-js";

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const SHOWBOX_API =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

const WORKING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

  Accept: "application/json",

  "Accept-Language":
    "en-US,en;q=0.9",

  "Content-Type":
    "application/json"
};


// ---------------------------------------------------------
// Base64URL
// ---------------------------------------------------------

function decodeBase64Url(value) {
  let base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (base64.length % 4) {
    base64 += "=";
  }

  return Buffer.from(base64, "base64").toString("utf8");
}


// ---------------------------------------------------------
// Parse configured Stremio config
// ---------------------------------------------------------

function parseConfig(rawConfig) {
  try {
    const decoded = decodeBase64Url(rawConfig);

    return JSON.parse(decoded);

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

function parseSingleToken(token) {
  if (!token) {
    return null;
  }

  /*
   * ShowBox sometimes supplies a JWT-like token.
   * Some tokens contain encrypted_data.
   *
   * If decryption fails, the original token is still
   * valid for the requests we are making, so return it.
   */

  if (!token.startsWith("eyJ")) {
    return token;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(
        token.split(".")[1] || "",
        "base64"
      ).toString("utf8")
    );

    if (!decoded || !decoded.encrypt_data) {
      return token;
    }

    const key = CryptoJS.enc.Utf8.parse(
      "123d6cedf626dy54233aa1w6"
    );

    const iv = CryptoJS.enc.Utf8.parse(
      "wEiphTn!"
    );

    const decrypted =
      CryptoJS.TripleDES.decrypt(
        decoded.encrypt_data,
        key,
        {
          iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }
      ).toString(CryptoJS.enc.Utf8);

    const result =
      JSON.parse(decrypted);

    if (result && result.uid) {
      return String(result.uid);
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

async function imdbToTmdb(imdbId) {
  console.log(
    "[ShowBox] TMDB lookup:",
    imdbId
  );

  const response = await fetch(
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

  const data = await response.json();

  const movieResults =
    Array.isArray(data.movie_results)
      ? data.movie_results
      : [];

  const tvResults =
    Array.isArray(data.tv_results)
      ? data.tv_results
      : [];

  const result =
    movieResults[0] ||
    tvResults[0];

  if (!result || !result.id) {
    throw new Error(
      `TMDB ID not found for ${imdbId}`
    );
  }

  console.log(
    "[ShowBox] TMDB result:",
    result.id
  );

  return String(result.id);
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

  if (type === "series") {
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

  const response = await fetch(
    requestUrl,
    {
      headers: WORKING_HEADERS
    }
  );

  console.log(
    "[ShowBox] ShowBox response:",
    {
      status: response.status
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

  const response = await fetch(url);

  const text =
    await response.text();

  console.log(
    "[ShowBox] FebBox share response:",
    {
      status: response.status,
      bodyLength: text.length
    }
  );

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "FebBox share response was not JSON"
    );
  }

  console.log(
    "[ShowBox] FebBox share JSON:",
    {
      code: data.code,
      hasData: !!data.data
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
    shareLink.split("/").pop();

  console.log(
    "[ShowBox] FebBox share key:",
    {
      length: shareKey
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

  const response = await fetch(
    url,
    {
      headers: {
        "Accept-Language": "en"
      }
    }
  );

  const text =
    await response.text();

  console.log(
    "[ShowBox] FebBox file list:",
    {
      status: response.status,
      parentId: null,
      bodyLength: text.length
    }
  );

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "FebBox file list was not JSON"
    );
  }

  const files =
    data &&
    data.data &&
    Array.isArray(data.data.file_list)
      ? data.data.file_list
      : [];

  console.log(
    "[ShowBox] FebBox file list result:",
    {
      code: data.code,
      count: files.length
    }
  );

  if (
    data.code !== 1 ||
    !data.data ||
    !Array.isArray(data.data.file_list)
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

  const response = await fetch(
    url,
    {
      headers: {
        "Accept-Language": "en"
      }
    }
  );

  const text =
    await response.text();

  console.log(
    "[ShowBox] FebBox episode list:",
    {
      status: response.status,
      countBodyLength: text.length
    }
  );

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "FebBox episode list was not JSON"
    );
  }

  if (
    data.code !== 1 ||
    !data.data ||
    !Array.isArray(data.data.file_list)
  ) {
    throw new Error(
      "FebBox episode list failed"
    );
  }

  return data.data.file_list;
}


// ---------------------------------------------------------
// Find movie / episode file
// ---------------------------------------------------------

async function findFebboxFile(
  shareKey,
  type,
  season,
  episode
) {
  const rootFiles =
    await febboxFileList(shareKey);

  if (type === "movie") {
    const file =
      rootFiles.find(
        item =>
          item &&
          item.fid &&
          item.file_name
      );

    if (!file) {
      throw new Error(
        "Movie file not found"
      );
    }

    console.log(
      "[ShowBox] Movie file found:",
      {
        name: file.file_name,
        fid: file.fid
      }
    );

    return file;
  }


  // -------------------------------------------------------
  // TV season
  // -------------------------------------------------------

  const expectedSeason =
    `season ${season}`.toLowerCase();

  const seasonFolder =
    rootFiles.find(
      item =>
        item &&
        item.file_name &&
        item.file_name
          .toLowerCase()
          .trim() === expectedSeason
    );

  if (!seasonFolder) {
    throw new Error(
      `Season folder not found: ${expectedSeason}`
    );
  }

  console.log(
    "[ShowBox] Season folder:",
    {
      name: seasonFolder.file_name,
      fid: seasonFolder.fid
    }
  );

  const files =
    await febboxSeasonFileList(
      shareKey,
      seasonFolder
    );

  const s2 =
    String(season).padStart(2, "0");

  const e2 =
    String(episode).padStart(2, "0");

  const lowerS =
    String(season);

  const lowerE =
    String(episode);

  const file =
    files.find(item => {
      if (!item || !item.file_name) {
        return false;
      }

      const name =
        item.file_name.toLowerCase();

      return (
        name.includes(`s${s2}e${e2}`) ||
        name.includes(`s${lowerS}e${lowerE}`)
      );
    });

  if (!file) {
    throw new Error(
      `Episode not found: S${season}E${episode}`
    );
  }

  console.log(
    "[ShowBox] Episode found:",
    {
      name: file.file_name,
      fid: file.fid
    }
  );

  return file;
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
      length: token.length,
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
      fid: file.fid
    }
  );

  const response =
    await fetch(
      qualityUrl,
      {
        headers: {
          Cookie: cookieHeader
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
      status: response.status,
      contentType,
      bodyLength: text.length,
      finalUrl
    }
  );


  // -------------------------------------------------------
  // NEW DIAGNOSTIC
  //
  // The endpoint is currently returning JSON rather than
  // the HTML structure our old parser expected.
  //
  // Log the JSON structure so we can adapt the parser.
  // -------------------------------------------------------

  let data;

  try {
    data = JSON.parse(text);

    console.log(
      "[ShowBox] FebBox quality JSON:",
      JSON.stringify(data)
    );

  } catch {
    data = null;
  }


  // -------------------------------------------------------
  // Existing HTML response support
  // -------------------------------------------------------

  if (
    data &&
    data.html
  ) {
    return parseFebboxHtml(
      data.html,
      file
    );
  }


  // -------------------------------------------------------
  // If the response is HTML itself
  // -------------------------------------------------------

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
// Parse old FebBox HTML quality response
// ---------------------------------------------------------

function parseFebboxHtml(
  html,
  file
) {
  const streams = [];

  /*
   * The original FebBox response uses:
   *
   * div.file_quality
   *
   * with:
   *
   * data-url
   * data-quality
   *
   * and a .size element.
   *
   * We keep the parser dependency-free here.
   */

  const qualityRegex =
    /<div[^>]*class=["'][^"']*file_quality[^"']*["'][^>]*>/gi;

  let match;

  while (
    (match = qualityRegex.exec(html))
  ) {
    const blockStart =
      match.index;

    const block =
      html.slice(
        blockStart,
        blockStart + 10000
      );

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
        /class=["'][^"']*size[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
      );

    const streamUrl =
      urlMatch[1];

    const quality =
      qualityMatch
        ? qualityMatch[1]
        : "Unknown";

    const size =
      sizeMatch
        ? sizeMatch[1]
            .replace(/<[^>]+>/g, "")
            .trim()
        : "";

    streams.push({
      url: streamUrl,
      quality,
      size,
      fileName:
        file.file_name || ""
    });
  }

  console.log(
    "[ShowBox] Parsed FebBox qualities:",
    streams.length
  );

  return streams;
}


// ---------------------------------------------------------
// Convert quality name
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

  return quality || "Unknown";
}


// ---------------------------------------------------------
// Build Stremio streams
// ---------------------------------------------------------

function buildStreams(
  qualityResults
) {
  return qualityResults.map(
    item => ({
      name: "ShowBox",

      title:
        getQualityLabel(
          item.quality,
          item.fileName
        ) +
        (
          item.size
            ? `\n${item.size}`
            : ""
        ),

      url: item.url,

      behaviorHints: {
        bingeGroup:
          "showbox"
      },

      headers: {
        Accept: "*/*",

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
      new URL(req.url);

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
      decodeURIComponent(match[3]);


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
      parseConfig(rawConfig);

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

    if (type === "series") {
      const parts =
        rawId.split(":");

      imdbId =
        parts[0];

      season =
        Number(parts[1]);

      episode =
        Number(parts[2]);

      if (
        !imdbId ||
        !Number.isFinite(season) ||
        !Number.isFinite(episode)
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
    // FebBox share
    // -----------------------------------------------------

    const shareKey =
      await febboxShare(
        showboxId,
        type
      );


    // -----------------------------------------------------
    // Find FebBox file
    // -----------------------------------------------------

    const file =
      await findFebboxFile(
        shareKey,
        type,
        season,
        episode
      );


    // -----------------------------------------------------
    // Get quality URLs
    // -----------------------------------------------------

    const qualityResults =
      await febboxQualityList(
        file,
        shareKey,
        parsedToken
      );


    if (
      !qualityResults.length
    ) {
      throw new Error(
        "No FebBox quality streams found"
      );
    }


    // -----------------------------------------------------
    // Build Stremio response
    // -----------------------------------------------------

    const streams =
      buildStreams(
        qualityResults
      );

    console.log(
      `[ShowBox][${requestId}] Streams:`,
      streams.length
    );


    console.log(
      `[ShowBox][${requestId}] ===== END =====`
    );


    return new Response(
      JSON.stringify({
        streams
      }),
      {
        status: 200,

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
        status: 200,

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
