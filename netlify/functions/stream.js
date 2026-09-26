import CryptoJS from "crypto-js";

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

const SHOWBOX_API =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json"
};

function log(id, ...args) {
  console.log(`[ShowBox][${id}]`, ...args);
}

function error(id, ...args) {
  console.error(`[ShowBox][${id}]`, ...args);
}

/* -------------------------------------------------------
   CONFIG
------------------------------------------------------- */

function decodeBase64Url(value) {
  let str = value.replace(/-/g, "+").replace(/_/g, "/");

  while (str.length % 4 !== 0) {
    str += "=";
  }

  return atob(str);
}

function getConfig(rawConfig) {
  try {
    const decoded = decodeBase64Url(rawConfig);
    return JSON.parse(decoded);
  } catch (e) {
    return {};
  }
}

/* -------------------------------------------------------
   TOKEN
------------------------------------------------------- */

function parseSingleToken(token) {
  if (!token) return "";

  if (token.startsWith("eyJ")) {
    try {
      const decoded = CryptoJS.enc.Base64.parse(token);
      const text = decoded.toString(CryptoJS.enc.Utf8);
      const data = JSON.parse(text);

      if (data && data.encrypt_data) {
        const key = "123d6cedf626dy54233aa1w6";
        const iv = "wEiphTn!";

        const keyParsed = CryptoJS.enc.Utf8.parse(key);
        const ivParsed = CryptoJS.enc.Utf8.parse(iv);

        const decrypted = CryptoJS.TripleDES.decrypt(
          data.encrypt_data,
          keyParsed,
          {
            iv: ivParsed,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
          }
        );

        const decryptedText = decrypted.toString(
          CryptoJS.enc.Utf8
        );

        const decryptedJson = JSON.parse(decryptedText);

        if (decryptedJson && decryptedJson.uid) {
          return String(decryptedJson.uid);
        }
      }
    } catch (e) {
      console.log("[ShowBox] Token parsing failed:", e.message);
    }
  }

  return token;
}

/* -------------------------------------------------------
   TMDB
------------------------------------------------------- */

async function imdbToTmdb(imdbId, type, requestId) {
  log(requestId, "TMDB lookup:", imdbId);

  const url =
    `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}` +
    `?api_key=${TMDB_API_KEY}` +
    `&external_source=imdb_id`;

  const response = await fetch(url);

  log(requestId, "TMDB response:", response.status);

  if (!response.ok) {
    throw new Error(`TMDB HTTP ${response.status}`);
  }

  const data = await response.json();

  const movieResults = Array.isArray(data.movie_results)
    ? data.movie_results
    : [];

  const tvResults = Array.isArray(data.tv_results)
    ? data.tv_results
    : [];

  const result =
    type === "series"
      ? tvResults[0] || movieResults[0]
      : movieResults[0] || tvResults[0];

  if (!result || !result.id) {
    throw new Error(`No TMDB result for ${imdbId}`);
  }

  log(requestId, "TMDB result:", result.id);

  return String(result.id);
}

/* -------------------------------------------------------
   SHOWBOX
------------------------------------------------------- */

async function getShowBoxData(
  tmdbId,
  type,
  season,
  episode,
  parsedToken,
  requestId
) {
  let url;

  if (type === "series") {
    url =
      `${SHOWBOX_API}/tv/${encodeURIComponent(tmdbId)}` +
      `/${encodeURIComponent(season)}` +
      `/${encodeURIComponent(episode)}` +
      `?cookie=${encodeURIComponent(parsedToken)}`;
  } else {
    url =
      `${SHOWBOX_API}/movie/${encodeURIComponent(tmdbId)}` +
      `?cookie=${encodeURIComponent(parsedToken)}`;
  }

  log(requestId, "ShowBox request:", {
    type,
    tmdbId,
    season,
    episode
  });

  const response = await fetch(url, {
    headers: HEADERS
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `ShowBox returned non-JSON HTTP ${response.status}`
    );
  }

  log(requestId, "ShowBox response:", {
    status: response.status,
    success: data?.success,
    id: data?.id ?? null,
    mid: data?.mid ?? null,
    versions: Array.isArray(data?.versions)
      ? data.versions.length
      : 0
  });

  if (!response.ok || !data?.success) {
    throw new Error(
      `ShowBox API failed: HTTP ${response.status}`
    );
  }

  return data;
}

/* -------------------------------------------------------
   FEBBOX SHARE
------------------------------------------------------- */

async function febboxShare(showboxId, type) {
  const boxType = type === "series" ? 2 : 1;

  const url =
    `https://www.febbox.com/mbp/to_share_page` +
    `?box_type=${boxType}` +
    `&mid=${encodeURIComponent(showboxId)}` +
    `&json=1`;

  console.log("[ShowBox] FebBox share request:", {
    boxType,
    showboxId
  });

  const response = await fetch(url);

  const text = await response.text();

  console.log("[ShowBox] FebBox share response:", {
    status: response.status,
    bodyLength: text.length
  });

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `FebBox share returned non-JSON HTTP ${response.status}`
    );
  }

  console.log("[ShowBox] FebBox share JSON:", {
    code: data?.code,
    hasData: !!data?.data
  });

  if (data?.code !== 1 || !data?.data) {
    throw new Error("FebBox share lookup failed");
  }

  const shareLink =
    data.data.shareLink ||
    data.data.share_link;

  if (!shareLink) {
    throw new Error("FebBox share link missing");
  }

  const shareKey = shareLink.split("/").pop();

  console.log("[ShowBox] FebBox share key:", {
    length: shareKey?.length
  });

  return shareKey;
}

/* -------------------------------------------------------
   FEBBOX FILE LIST
------------------------------------------------------- */

async function febboxFileList(shareKey, parentId = null) {
  let url =
    `https://www.febbox.com/file/file_share_list` +
    `?share_key=${encodeURIComponent(shareKey)}`;

  if (parentId !== null) {
    url +=
      `&parent_id=${encodeURIComponent(parentId)}` +
      `&page=1`;
  }

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "en"
    }
  });

  const text = await response.text();

  console.log("[ShowBox] FebBox file list:", {
    status: response.status,
    parentId,
    bodyLength: text.length
  });

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `FebBox file list returned non-JSON HTTP ${response.status}`
    );
  }

  if (
    data?.code !== 1 ||
    !data?.data ||
    !Array.isArray(data.data.file_list)
  ) {
    throw new Error("FebBox file list failed");
  }

  console.log("[ShowBox] FebBox file list result:", {
    code: data.code,
    count: data.data.file_list.length
  });

  return data.data.file_list;
}

/* -------------------------------------------------------
   FIND EPISODE
------------------------------------------------------- */

async function findEpisode(
  shareKey,
  season,
  episode
) {
  const rootFiles = await febboxFileList(shareKey);

  const seasonName = `season ${season}`;

  const seasonFolder = rootFiles.find(
    file =>
      file?.file_name &&
      file.file_name.toLowerCase() ===
        seasonName.toLowerCase()
  );

  if (!seasonFolder) {
    throw new Error(
      `Season folder not found: ${seasonName}`
    );
  }

  console.log("[ShowBox] Season folder:", {
    season,
    fid: seasonFolder.fid
  });

  const episodeFiles = await febboxFileList(
    shareKey,
    seasonFolder.fid
  );

  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");

  const target1 = `s${s}e${e}`;
  const target2 = `s${season}e${episode}`;

  const episodeFile = episodeFiles.find(file => {
    if (!file?.file_name) return false;

    const name = file.file_name.toLowerCase();

    return (
      name.includes(target1) ||
      name.includes(target2)
    );
  });

  if (!episodeFile) {
    throw new Error(
      `Episode not found: S${season}E${episode}`
    );
  }

  console.log("[ShowBox] Episode found:", {
    name: episodeFile.file_name,
    fid: episodeFile.fid
  });

  return episodeFile;
}

/* -------------------------------------------------------
   FEBBOX QUALITY
------------------------------------------------------- */

async function febboxQualityList(
  file,
  shareKey,
  parsedToken
) {
  const tokenString = String(parsedToken);

  const cookieHeader = tokenString.startsWith("ui=")
    ? tokenString
    : `ui=${tokenString}`;

  console.log("[ShowBox] Token diagnostics:", {
    length: tokenString.length,
    startsWithUi: tokenString.startsWith("ui="),
    startsWithJwt: tokenString.startsWith("eyJ"),
    cookieLength: cookieHeader.length
  });

  const url =
    `https://www.febbox.com/console/video_quality_list` +
    `?fid=${encodeURIComponent(file.fid)}` +
    `&share_key=${encodeURIComponent(shareKey)}`;

  console.log("[ShowBox] FebBox quality request:", {
    fid: file.fid
  });

  /*
   * IMPORTANT:
   *
   * This intentionally matches the original ShowBox
   * implementation exactly.
   *
   * No Accept header.
   * No User-Agent.
   * No additional headers.
   */
  const response = await fetch(url, {
    headers: {
      Cookie: cookieHeader
    }
  });

  const contentType =
    response.headers.get("content-type") || "";

  const finalUrl = response.url;

  const body = await response.text();

  console.log("[ShowBox] FebBox quality response:", {
    status: response.status,
    contentType,
    bodyLength: body.length,
    finalUrl
  });

  if (
    finalUrl.includes("/login") ||
    body.includes("<title>Login - FEB</title>")
  ) {
    console.log(
      "[ShowBox] FebBox returned LOGIN HTML"
    );

    throw new Error(
      "FebBox quality endpoint returned login page"
    );
  }

  let data;

  try {
    data = JSON.parse(body);
  } catch {
    console.log(
      "[ShowBox] FebBox quality returned non-JSON"
    );

    console.log(
      "[ShowBox] Quality body preview:",
      body.slice(0, 300)
    );

    throw new Error(
      `FebBox quality returned non-JSON: HTTP ${response.status}`
    );
  }

  if (
    data?.code !== 1 ||
    !data?.data ||
    !data.data.html
  ) {
    throw new Error(
      "FebBox quality response missing HTML"
    );
  }

  return data.data.html;
}

/* -------------------------------------------------------
   PARSE QUALITY HTML
------------------------------------------------------- */

function parseQualityHtml(html, file) {
  const streams = [];

  const itemRegex =
    /<div[^>]*class=["'][^"']*file_quality[^"']*["'][^>]*>/gi;

  const matches = html.match(itemRegex);

  if (!matches) {
    return streams;
  }

  /*
   * Cheerio isn't needed for the diagnostic version.
   * Extract the data attributes from each quality element.
   */
  for (const match of matches) {
    const urlMatch =
      match.match(
        /data-url=["']([^"']+)["']/i
      );

    const qualityMatch =
      match.match(
        /data-quality=["']([^"']+)["']/i
      );

    if (!urlMatch) continue;

    streams.push({
      url: urlMatch[1],
      quality: qualityMatch
        ? qualityMatch[1]
        : "Unknown",
      fileName: file.file_name || ""
    });
  }

  return streams;
}

/* -------------------------------------------------------
   DIRECT HTML PARSER
------------------------------------------------------- */

function extractQualityItems(html) {
  const streams = [];

  /*
   * Match complete file_quality divs.
   */
  const regex =
    /<div\b[^>]*class=["'][^"']*\bfile_quality\b[^"']*["'][\s\S]*?<\/div>/gi;

  const blocks = html.match(regex) || [];

  for (const block of blocks) {
    const urlMatch =
      block.match(
        /data-url\s*=\s*["']([^"']+)["']/i
      );

    if (!urlMatch) continue;

    const qualityMatch =
      block.match(
        /data-quality\s*=\s*["']([^"']+)["']/i
      );

    const sizeMatch =
      block.match(
        /class=["'][^"']*\bsize\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
      );

    streams.push({
      url: urlMatch[1],
      quality: qualityMatch
        ? qualityMatch[1]
        : "Unknown",
      size: sizeMatch
        ? sizeMatch[1]
            .replace(/<[^>]+>/g, "")
            .trim()
        : ""
    });
  }

  return streams;
}

/* -------------------------------------------------------
   QUALITY LABEL
------------------------------------------------------- */

function normalizeQuality(value) {
  if (!value) return "Unknown";

  const q = String(value).toUpperCase();

  if (q === "ORIGINAL" || q === "ORIGINAL QUALITY") {
    return "Original";
  }

  if (
    q === "4K" ||
    q === "2160P" ||
    q.includes("2160")
  ) {
    return "4K";
  }

  if (
    q === "1440P" ||
    q === "2K"
  ) {
    return "1440p";
  }

  if (
    q === "1080P" ||
    q === "FHD"
  ) {
    return "1080p";
  }

  if (
    q === "720P" ||
    q === "HD"
  ) {
    return "720p";
  }

  if (
    q === "480P" ||
    q === "SD"
  ) {
    return "480p";
  }

  if (q === "360P") {
    return "360p";
  }

  if (q === "240P") {
    return "240p";
  }

  const match =
    q.match(/(\d{3,4})P?/);

  if (match) {
    const n = Number(match[1]);

    if (n >= 2160) return "4K";
    if (n >= 1440) return "1440p";
    if (n >= 1080) return "1080p";
    if (n >= 720) return "720p";
    if (n >= 480) return "480p";
    if (n >= 360) return "360p";
    return "240p";
  }

  return String(value);
}

/* -------------------------------------------------------
   FEBBOX EXTRACTION
------------------------------------------------------- */

async function extractFebBoxStreams(
  showboxId,
  type,
  season,
  episode,
  parsedToken
) {
  const shareKey = await febboxShare(
    showboxId,
    type
  );

  let file;

  if (type === "series") {
    file = await findEpisode(
      shareKey,
      season,
      episode
    );
  } else {
    const files =
      await febboxFileList(shareKey);

    if (!files.length) {
      throw new Error(
        "No movie files found"
      );
    }

    file = files[0];

    console.log("[ShowBox] Movie file found:", {
      name: file.file_name,
      fid: file.fid
    });
  }

  const html =
    await febboxQualityList(
      file,
      shareKey,
      parsedToken
    );

  const qualities =
    extractQualityItems(html);

  console.log(
    "[ShowBox] Quality items found:",
    qualities.length
  );

  return qualities.map(item => ({
    name:
      `FebBox | ${normalizeQuality(item.quality)}`,

    title:
      `${normalizeQuality(item.quality)}` +
      (item.size
        ? ` | ${item.size}`
        : ""),

    url: item.url,

    quality:
      normalizeQuality(item.quality),

    size:
      item.size || "",

    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.8",
      Connection: "keep-alive",
      Range: "bytes=0-",
      Referer: "https://www.febbox.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  }));
}

/* -------------------------------------------------------
   REQUEST PARSING
------------------------------------------------------- */

function parseRequestId(rawId, type) {
  const decoded =
    decodeURIComponent(rawId)
      .replace(/\.json$/, "");

  if (type === "series") {
    const parts = decoded.split(":");

    return {
      imdbId: parts[0],
      season: Number(parts[1]),
      episode: Number(parts[2])
    };
  }

  return {
    imdbId: decoded
  };
}

/* -------------------------------------------------------
   MAIN
------------------------------------------------------- */

export default async (req, context) => {
  const requestId =
    Math.random()
      .toString(36)
      .slice(2, 8);

  try {
    const url =
      new URL(req.url);

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    /*
     * Expected:
     *
     * /:config/stream/:type/:id.json
     */
    const streamIndex =
      parts.indexOf("stream");

    if (streamIndex === -1) {
      return new Response(
        JSON.stringify({
          streams: []
        }),
        {
          status: 404,
          headers: {
            "Content-Type":
              "application/json",
            "Access-Control-Allow-Origin":
              "*"
          }
        }
      );
    }

    const type =
      parts[streamIndex + 1];

    const rawId =
      parts[streamIndex + 2];

    log(requestId, "===== START =====");

    log(requestId, "Request:", {
      type,
      rawId
    });

    if (!rawId) {
      throw new Error(
        "Missing stream ID"
      );
    }

    /*
     * Config is the segment immediately
     * before /stream/.
     */
    const configSegment =
      parts[streamIndex - 1];

    const config =
      getConfig(configSegment);

    const rawToken =
      config.uiToken ||
      "";

    if (!rawToken) {
      throw new Error(
        "No ShowBox UI token configured"
      );
    }

    log(requestId, "Token loaded:", {
      present: true
    });

    const parsed =
      parseRequestId(
        rawId,
        type
      );

    log(requestId, "Parsed:", parsed);

    let tmdbId;

    if (type === "series") {
      tmdbId =
        await imdbToTmdb(
          parsed.imdbId,
          type,
          requestId
        );
    } else {
      tmdbId =
        await imdbToTmdb(
          parsed.imdbId,
          type,
          requestId
        );
    }

    log(requestId, "TMDB:", tmdbId);

    const parsedToken =
      parseSingleToken(rawToken);

    log(requestId, "Token ready:", {
      tokenParsed:
        parsedToken !== rawToken
    });

    const showbox =
      await getShowBoxData(
        tmdbId,
        type,
        parsed.season,
        parsed.episode,
        parsedToken,
        requestId
      );

    const showboxId =
      showbox.id ||
      showbox.mid ||
      showbox.data?.id ||
      showbox.data?.mid;

    if (!showboxId) {
      throw new Error(
        "ShowBox response contains no media ID"
      );
    }

    log(requestId, "ShowBox ID:", showboxId);

    /*
     * Try the FebBox extraction.
     */
    const streams =
      await extractFebBoxStreams(
        showboxId,
        type,
        parsed.season,
        parsed.episode,
        parsedToken
      );

    log(requestId, "Streams:", streams.length);

    log(requestId, "===== END =====");

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
            "*",
          "Cache-Control":
            "no-store"
        }
      }
    );
  } catch (e) {
    error(
      requestId,
      "===== ERROR ====="
    );

    error(
      requestId,
      e?.message || String(e)
    );

    error(
      requestId,
      "===== END ERROR ====="
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
            "*",
          "Cache-Control":
            "no-store"
        }
      }
    );
  }
};

export const config = {
  path: [
    "/:config/stream/:type/:id.json"
  ]
};
