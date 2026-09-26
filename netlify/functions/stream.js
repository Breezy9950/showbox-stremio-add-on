import CryptoJS from "crypto-js";

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const SHOWBOX_API_BASE =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json"
};


// --------------------------------------------------
// Base64 helpers
// --------------------------------------------------

function decodeBase64Url(str) {
  try {
    let s = str.replace(/-/g, "+").replace(/_/g, "/");

    while (s.length % 4) {
      s += "=";
    }

    return Buffer.from(s, "base64").toString("utf8");
  } catch (e) {
    console.log("[ShowBox] Base64 decode failed:", e.message);
    return null;
  }
}


// --------------------------------------------------
// Config
// --------------------------------------------------

function getConfig(req) {
  const url = new URL(req.url);

  const parts = url.pathname.split("/").filter(Boolean);

  // /:config/stream/:type/:id.json
  const config = parts[0] || "";

  return decodeBase64Url(config);
}


// --------------------------------------------------
// Original ShowBox token parser
// --------------------------------------------------

function parseSingleToken(token) {
  try {
    if (!token) {
      return token;
    }

    if (!token.startsWith("eyJ")) {
      return token;
    }

    const jsonString = decodeBase64Url(token);

    if (!jsonString) {
      return token;
    }

    const decoded = JSON.parse(jsonString);

    if (!decoded.encrypt_data) {
      return token;
    }

    const key = CryptoJS.enc.Utf8.parse(
      "123d6cedf626dy54233aa1w6"
    );

    const iv = CryptoJS.enc.Utf8.parse("wEiphTn!");

    const decrypted = CryptoJS.TripleDES.decrypt(
      decoded.encrypt_data,
      key,
      {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    ).toString(CryptoJS.enc.Utf8);

    const parsed = JSON.parse(decrypted);

    if (parsed.uid !== undefined && parsed.uid !== null) {
      return String(parsed.uid);
    }

    return token;
  } catch (e) {
    console.log(
      "[ShowBox] Token parse/decrypt failed, using original token"
    );

    return token;
  }
}


function getUiToken(config) {
  if (!config) {
    return null;
  }

  try {
    const parsed = JSON.parse(config);

    if (!parsed.uiToken) {
      return null;
    }

    const tokens = String(parsed.uiToken)
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    if (!tokens.length) {
      return null;
    }

    return parseSingleToken(tokens[0]);
  } catch (e) {
    console.log("[ShowBox] Config JSON parse failed:", e.message);
    return null;
  }
}


// --------------------------------------------------
// IMDb → TMDB
// --------------------------------------------------

async function imdbToTmdb(imdbId, type) {
  console.log("[ShowBox] TMDB lookup starting:", {
    imdbId,
    type
  });

  const url =
    `${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}` +
    `?api_key=${encodeURIComponent(TMDB_API_KEY)}` +
    `&external_source=imdb_id`;

  const response = await fetch(url);

  console.log("[ShowBox] TMDB response:", {
    status: response.status,
    ok: response.ok
  });

  if (!response.ok) {
    throw new Error(
      `TMDB lookup failed: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const movieResults = Array.isArray(data.movie_results)
    ? data.movie_results
    : [];

  const tvResults = Array.isArray(data.tv_results)
    ? data.tv_results
    : [];

  const result =
    type === "movie"
      ? movieResults[0]
      : tvResults[0];

  console.log("[ShowBox] TMDB lookup result:", {
    movieResults: movieResults.length,
    tvResults: tvResults.length,
    tmdbId: result?.id ?? null
  });

  if (!result?.id) {
    throw new Error(
      `No TMDB result found for ${imdbId}`
    );
  }

  return String(result.id);
}


// --------------------------------------------------
// ShowBox API
// --------------------------------------------------

async function getShowBoxMedia({
  tmdbId,
  type,
  season,
  episode,
  token
}) {
  let url;

  if (type === "movie") {
    url =
      `${SHOWBOX_API_BASE}/movie/${encodeURIComponent(tmdbId)}` +
      `?cookie=${encodeURIComponent(token)}`;
  } else {
    url =
      `${SHOWBOX_API_BASE}/tv/${encodeURIComponent(tmdbId)}` +
      `/${season}/${episode}` +
      `?cookie=${encodeURIComponent(token)}`;
  }

  console.log("[ShowBox] ShowBox request:", {
    type,
    tmdbId,
    season,
    episode
  });

  const response = await fetch(url, {
    headers: HEADERS
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    console.log("[ShowBox] ShowBox returned non-JSON:", {
      status: response.status,
      bodyLength: text.length
    });

    throw new Error(
      `ShowBox returned invalid JSON: HTTP ${response.status}`
    );
  }

  console.log("[ShowBox] API response:", {
    status: response.status,
    success: data?.success,
    id: data?.id ?? null,
    mid: data?.mid ?? null,
    versions: Array.isArray(data?.versions)
      ? data.versions.length
      : 0
  });

  if (!response.ok || data?.success === false) {
    throw new Error(
      `ShowBox API failed: HTTP ${response.status}`
    );
  }

  return data;
}


// --------------------------------------------------
// FebBox helper
// --------------------------------------------------

function decodeHtmlEntities(str) {
  if (!str) {
    return str;
  }

  return String(str)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}


// --------------------------------------------------
// FebBox Stage 1
//
// EXACT original endpoint:
// /mbp/to_share_page?box_type=...&mid=...&json=1
// --------------------------------------------------

async function febboxGetShareKey(showboxId, type) {
  const boxType = type === "series" ? 2 : 1;

  const url =
    `https://www.febbox.com/mbp/to_share_page` +
    `?box_type=${boxType}` +
    `&mid=${encodeURIComponent(showboxId)}` +
    `&json=1`;

  console.log("[ShowBox] FebBox share lookup starting:", {
    showboxId,
    type
  });

  console.log("[ShowBox] FebBox share request:", {
    boxType,
    showboxId
  });

  const response = await fetch(url, {
    headers: {
      "User-Agent": HEADERS["User-Agent"],
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const text = await response.text();

  console.log("[ShowBox] FebBox share response:", {
    status: response.status,
    ok: response.ok,
    bodyLength: text.length
  });

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    console.log(
      "[ShowBox] FebBox share response was not JSON:",
      text.slice(0, 300)
    );

    throw new Error(
      `FebBox share returned non-JSON: HTTP ${response.status}`
    );
  }

  console.log("[ShowBox] FebBox share JSON:", {
    code: data?.code ?? null,
    hasData: !!data?.data
  });

  if (!response.ok) {
    throw new Error(
      `FebBox share lookup failed: HTTP ${response.status}`
    );
  }

  if (data?.code !== 1 || !data?.data) {
    throw new Error(
      `FebBox share lookup returned code ${data?.code}`
    );
  }

  const shareLink =
    data.data.shareLink ||
    data.data.share_link;

  console.log("[ShowBox] FebBox share link:", {
    found: !!shareLink
  });

  if (!shareLink) {
    throw new Error(
      "FebBox response did not contain shareLink"
    );
  }

  const shareKey =
    String(shareLink)
      .split("/")
      .filter(Boolean)
      .pop();

  if (!shareKey) {
    throw new Error(
      "Could not extract FebBox share key"
    );
  }

  console.log("[ShowBox] FebBox share key extracted:", {
    shareKeyLength: String(shareKey).length
  });

  return shareKey;
}


// --------------------------------------------------
// FebBox Stage 2
//
// file_share_list
// --------------------------------------------------

async function febboxFileList(shareKey, parentId = null) {
  let url =
    `https://www.febbox.com/file/file_share_list` +
    `?share_key=${encodeURIComponent(shareKey)}`;

  if (parentId !== null) {
    url +=
      `&parent_id=${encodeURIComponent(parentId)}` +
      `&page=1`;
  }

  console.log("[ShowBox] FebBox file list request:", {
    hasParent: parentId !== null,
    parentId: parentId !== null ? parentId : null
  });

  const response = await fetch(url, {
    headers: {
      "User-Agent": HEADERS["User-Agent"],
      Accept: "application/json",
      "Accept-Language": "en"
    }
  });

  const text = await response.text();

  console.log("[ShowBox] FebBox file list response:", {
    status: response.status,
    ok: response.ok,
    bodyLength: text.length
  });

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    console.log(
      "[ShowBox] FebBox file list was not JSON:",
      text.slice(0, 300)
    );

    throw new Error(
      `FebBox file list returned non-JSON: HTTP ${response.status}`
    );
  }

  console.log("[ShowBox] FebBox file list JSON:", {
    code: data?.code ?? null,
    hasData: !!data?.data,
    fileCount: Array.isArray(data?.data?.file_list)
      ? data.data.file_list.length
      : 0
  });

  if (!response.ok) {
    throw new Error(
      `FebBox file list failed: HTTP ${response.status}`
    );
  }

  if (data?.code !== 1 || !data?.data) {
    throw new Error(
      `FebBox file list returned code ${data?.code}`
    );
  }

  return data.data.file_list || [];
}


// --------------------------------------------------
// Find TV episode
// --------------------------------------------------

async function findEpisodeFile(
  shareKey,
  season,
  episode
) {
  console.log("[ShowBox] Looking for FebBox season folder:", {
    season,
    expectedName: `season ${season}`
  });

  const rootFiles = await febboxFileList(shareKey);

  console.log("[ShowBox] FebBox root files:", {
    count: rootFiles.length
  });

  for (const file of rootFiles.slice(0, 20)) {
    console.log("[ShowBox] Root item:", {
      name: file?.file_name ?? null,
      fid: file?.fid ?? null
    });
  }

  const seasonName =
    `season ${season}`.toLowerCase();

  const seasonFolder = rootFiles.find(
    file =>
      String(file?.file_name || "")
        .toLowerCase() === seasonName
  );

  if (!seasonFolder) {
    throw new Error(
      `FebBox season folder not found: season ${season}`
    );
  }

  console.log("[ShowBox] Season folder found:", {
    name: seasonFolder.file_name,
    fid: seasonFolder.fid
  });

  const episodeFiles = await febboxFileList(
    shareKey,
    seasonFolder.fid
  );

  console.log("[ShowBox] Episode folder contents:", {
    count: episodeFiles.length
  });

  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");

  const shortPattern =
    `s${s}e${e}`.toLowerCase();

  const normalPattern =
    `s${season}e${episode}`.toLowerCase();

  console.log("[ShowBox] Episode matching:", {
    shortPattern,
    normalPattern
  });

  const episodeFile = episodeFiles.find(file => {
    const name =
      String(file?.file_name || "")
        .toLowerCase();

    return (
      name.includes(shortPattern) ||
      name.includes(normalPattern)
    );
  });

  if (!episodeFile) {
    console.log(
      "[ShowBox] No matching episode. Available files:"
    );

    for (const file of episodeFiles.slice(0, 30)) {
      console.log("[ShowBox] Episode item:", {
        name: file?.file_name ?? null,
        fid: file?.fid ?? null
      });
    }

    throw new Error(
      `FebBox episode not found: S${season}E${episode}`
    );
  }

  console.log("[ShowBox] Episode file found:", {
    name: episodeFile.file_name,
    fid: episodeFile.fid
  });

  return episodeFile;
}


// --------------------------------------------------
// FebBox Stage 3
//
// EXACT original quality endpoint:
// /console/video_quality_list?fid=...&share_key=...
//
// IMPORTANT:
// original source sends Cookie: ui=<parsedToken>
// --------------------------------------------------

async function febboxQualityList(
  file,
  shareKey,
  parsedToken
) {
  const cookieHeader =
    String(parsedToken).startsWith("ui=")
      ? String(parsedToken)
      : `ui=${parsedToken}`;

  const url =
    `https://www.febbox.com/console/video_quality_list` +
    `?fid=${encodeURIComponent(file.fid)}` +
    `&share_key=${encodeURIComponent(shareKey)}`;

  console.log("[ShowBox] FebBox quality request:", {
    fid: file.fid,
    fileName: file.file_name,
    hasCookie: !!cookieHeader
  });

  const response = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      Accept: "application/json",
      "User-Agent": HEADERS["User-Agent"]
    }
  });

  const text = await response.text();

  console.log("[ShowBox] FebBox quality response:", {
    status: response.status,
    ok: response.ok,
    bodyLength: text.length
  });

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    console.log(
      "[ShowBox] FebBox quality response was not JSON."
    );

    console.log(
      "[ShowBox] Quality response preview:",
      text.slice(0, 500)
    );

    throw new Error(
      `FebBox quality returned non-JSON: HTTP ${response.status}`
    );
  }

  console.log("[ShowBox] FebBox quality JSON:", {
    code: data?.code ?? null,
    hasData: !!data?.data,
    hasHtml: !!data?.data?.html
  });

  if (!response.ok) {
    throw new Error(
      `FebBox quality request failed: HTTP ${response.status}`
    );
  }

  if (data?.code !== 1 || !data?.data?.html) {
    throw new Error(
      `FebBox quality returned code ${data?.code}`
    );
  }

  return data.data.html;
}


// --------------------------------------------------
// Parse original div.file_quality elements
//
// We avoid adding another npm dependency for this test.
// --------------------------------------------------

function parseQualityHtml(html) {
  const streams = [];

  if (!html) {
    return streams;
  }

  /*
    Original source looks for:

      div.file_quality

    and reads:

      data-url
      data-quality
      .size
  */

  const divRegex =
    /<div\b[^>]*class\s*=\s*["'][^"']*\bfile_quality\b[^"']*["'][^>]*>/gi;

  let match;

  while ((match = divRegex.exec(html)) !== null) {
    const tag = match[0];

    const urlMatch =
      tag.match(
        /\bdata-url\s*=\s*["']([^"']+)["']/i
      );

    const qualityMatch =
      tag.match(
        /\bdata-quality\s*=\s*["']([^"']+)["']/i
      );

    if (!urlMatch) {
      continue;
    }

    const streamUrl =
      decodeHtmlEntities(urlMatch[1]);

    const quality =
      qualityMatch
        ? decodeHtmlEntities(qualityMatch[1])
        : "Unknown";

    streams.push({
      url: streamUrl,
      quality
    });
  }

  return streams;
}


// --------------------------------------------------
// Main
// --------------------------------------------------

export default async (req, context) => {
  try {
    console.log("");
    console.log("========================================");
    console.log("[ShowBox] STREAM TEST v6");
    console.log("========================================");

    const url = new URL(req.url);

    const parts =
      url.pathname.split("/").filter(Boolean);

    const configEncoded = parts[0] || "";
    const type = parts[2] || "";
    const rawId =
      parts.slice(3).join("/") || "";

    console.log("[ShowBox] Request path:", {
      type,
      rawId
    });

    const config =
      decodeBase64Url(configEncoded);

    if (!config) {
      throw new Error(
        "Could not decode addon config"
      );
    }

    const parsedToken =
      getUiToken(config);

    console.log("[ShowBox] Config decoded:", {
      hasUiToken: !!parsedToken
    });

    if (!parsedToken) {
      throw new Error(
        "No ShowBox UI token configured"
      );
    }

    // ----------------------------------------------
    // Parse Stremio ID
    // ----------------------------------------------

    let imdbId = rawId;
    let season = null;
    let episode = null;

    if (type === "series") {
      const decodedId =
        decodeURIComponent(rawId);

      const pieces =
        decodedId.split(":");

      imdbId = pieces[0];
      season = Number(pieces[1]);
      episode = Number(pieces[2]);

      console.log("[ShowBox] Series parsed:", {
        imdbId,
        season,
        episode
      });
    } else {
      imdbId =
        decodeURIComponent(rawId);

      console.log("[ShowBox] Movie parsed:", {
        imdbId
      });
    }

    if (!imdbId) {
      throw new Error("Missing IMDb ID");
    }

    // ----------------------------------------------
    // IMDb → TMDB
    // ----------------------------------------------

    const tmdbId =
      await imdbToTmdb(
        imdbId,
        type
      );

    console.log("[ShowBox] IMDb → TMDB conversion:", {
      imdbId,
      tmdbId,
      type,
      season,
      episode
    });

    // ----------------------------------------------
    // ShowBox
    // ----------------------------------------------

    const showboxData =
      await getShowBoxMedia({
        tmdbId,
        type,
        season,
        episode,
        token: parsedToken
      });

    const showboxId =
      showboxData.id ??
      showboxData.mid;

    if (!showboxId) {
      throw new Error(
        "ShowBox response did not contain id/mid"
      );
    }

    console.log("[ShowBox] ShowBox media ID:", {
      showboxId
    });

    // ----------------------------------------------
    // FebBox share
    // ----------------------------------------------

    const shareKey =
      await febboxGetShareKey(
        showboxId,
        type
      );

    console.log("[ShowBox] FebBox share key ready.");

    // ----------------------------------------------
    // Find actual file
    // ----------------------------------------------

    let file;

    if (type === "series") {
      file =
        await findEpisodeFile(
          shareKey,
          season,
          episode
        );
    } else {
      const files =
        await febboxFileList(
          shareKey
        );

      console.log("[ShowBox] Movie file count:", {
        count: files.length
      });

      file = files[0];

      if (!file) {
        throw new Error(
          "No FebBox movie file found"
        );
      }

      console.log("[ShowBox] Movie file selected:", {
        name: file.file_name,
        fid: file.fid
      });
    }

    // ----------------------------------------------
    // Quality list
    // ----------------------------------------------

    const qualityHtml =
      await febboxQualityList(
        file,
        shareKey,
        parsedToken
      );

    console.log("[ShowBox] Quality HTML received:", {
      length: qualityHtml.length
    });

    const streams =
      parseQualityHtml(
        qualityHtml
      );

    console.log("[ShowBox] Quality streams found:", {
      count: streams.length
    });

    for (const stream of streams) {
      console.log("[ShowBox] Quality:", {
        quality: stream.quality,
        hasUrl: !!stream.url
      });
    }

    // ----------------------------------------------
    // Stremio response
    // ----------------------------------------------

    const stremioStreams =
      streams.map(stream => ({
        name: "ShowBox",
        title: stream.quality,
        url: stream.url,
        behaviorHints: {
          notWebReady: true
        },
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

    console.log("[ShowBox] Final Stremio streams:", {
      count: stremioStreams.length
    });

    console.log("========================================");
    console.log("[ShowBox] STREAM TEST v6 COMPLETE");
    console.log("========================================");
    console.log("");

    return new Response(
      JSON.stringify({
        streams: stremioStreams
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*"
        }
      }
    );

  } catch (error) {
    console.log("");
    console.log("========================================");
    console.log("[ShowBox] ERROR");
    console.log("========================================");

    console.log("[ShowBox] ERROR:", error.message);

    console.log("========================================");
    console.log("");

    return new Response(
      JSON.stringify({
        streams: [],
        error: error.message
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*"
        }
      }
    );
  }
};


export const config = {
  path: "/:config/stream/:type/:id.json"
};
