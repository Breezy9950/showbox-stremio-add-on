export const config = {
  path: "/:config/stream/:type/:id.json"
};

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const SHOWBOX_API_BASE =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";


function decodeBase64Url(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");

  while (s.length % 4) {
    s += "=";
  }

  return Buffer.from(s, "base64").toString("utf8");
}


function parseSingleToken(token) {
  if (!token) return "";

  if (token.startsWith("eyJ")) {
    try {
      const CryptoJS = require("crypto-js");

      const parsed = CryptoJS.enc.Base64.parse(token);
      const decoded = parsed.toString(CryptoJS.enc.Utf8);
      const json = JSON.parse(decoded);

      if (json && json.encrypt_data) {
        const key = CryptoJS.enc.Utf8.parse(
          "123d6cedf626dy54233aa1w6"
        );

        const iv = CryptoJS.enc.Utf8.parse(
          "wEiphTn!"
        );

        const decrypted = CryptoJS.TripleDES.decrypt(
          json.encrypt_data,
          key,
          {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
          }
        );

        const result = JSON.parse(
          decrypted.toString(CryptoJS.enc.Utf8)
        );

        if (result && result.uid) {
          console.log(
            "[ShowBox] Token decrypted successfully"
          );

          return String(result.uid);
        }
      }
    } catch (error) {
      console.log(
        "[ShowBox] Token decryption failed:",
        error.message
      );
    }
  }

  return token;
}


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

  const result =
    type === "series"
      ? data.tv_results?.[0]
      : data.movie_results?.[0];

  console.log("[ShowBox] TMDB lookup result:", {
    movieResults: data.movie_results?.length || 0,
    tvResults: data.tv_results?.length || 0,
    tmdbId: result?.id ?? null
  });

  if (!result?.id) {
    throw new Error(
      `TMDB ID not found for ${imdbId}`
    );
  }

  return result.id;
}


/*
 * Step 1:
 * Ask the FebBox share API for the share information
 * associated with the ShowBox media ID.
 */
async function getFebBoxShareKey(
  showboxId,
  type
) {
  console.log(
    "[ShowBox] FebBox share lookup starting:",
    {
      showboxId,
      type
    }
  );

  const mediaType =
    type === "series" ? 2 : 1;

  const url =
    `https://www.febbox.com/share/1${mediaType}/${showboxId}&json=1`;

  console.log("[ShowBox] FebBox share request:", {
    mediaType,
    showboxId
  });

  const response = await fetch(url);

  console.log(
    "[ShowBox] FebBox share response:",
    {
      status: response.status,
      ok: response.ok
    }
  );

  if (!response.ok) {
    throw new Error(
      `FebBox share lookup failed: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  console.log(
    "[ShowBox] FebBox share data:",
    {
      code: data?.code,
      hasData: Boolean(data?.data),
      hasShare: Boolean(data?.data?.share)
    }
  );

  if (
    !data ||
    data.code !== 1 ||
    !data.data
  ) {
    return null;
  }

  const share =
    data.data.share ||
    data.data.url;

  if (!share) {
    return null;
  }

  const parts = String(share)
    .split("/")
    .filter(Boolean);

  const shareKey =
    parts.length > 0
      ? parts[parts.length - 1]
      : null;

  console.log(
    "[ShowBox] FebBox share key:",
    {
      found: Boolean(shareKey)
    }
  );

  return shareKey;
}


/*
 * Step 2:
 * Retrieve the files belonging to the share.
 */
async function getFebBoxFiles(
  shareKey,
  type,
  season,
  episode
) {
  console.log(
    "[ShowBox] FebBox file lookup starting:",
    {
      shareKeyPresent: Boolean(shareKey),
      type,
      season,
      episode
    }
  );

  if (!shareKey) {
    return [];
  }

  const baseUrl =
    `https://www.febbox.com/file/file_share_list?share_key=${encodeURIComponent(
      shareKey
    )}`;

  const response = await fetch(baseUrl, {
    headers: {
      "Accept-Language": "en"
    }
  });

  console.log(
    "[ShowBox] FebBox file response:",
    {
      status: response.status,
      ok: response.ok
    }
  );

  if (!response.ok) {
    throw new Error(
      `FebBox file lookup failed: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (
    !data ||
    data.code !== 1 ||
    !data.data
  ) {
    console.log(
      "[ShowBox] FebBox returned no file data"
    );

    return [];
  }

  let files = [];

  if (type === "movie") {
    files =
      data.data.file_list ||
      data.data.list ||
      [];
  } else {
    /*
     * For TV, the original addon first finds
     * the season directory and then queries
     * that directory's files.
     */

    const folders =
      data.data.file_list ||
      data.data.list ||
      [];

    const seasonText =
      `season ${season}`;

    const seasonFolder =
      folders.find(file => {
        const name =
          String(
            file?.file_name ||
            file?.name ||
            ""
          ).toLowerCase();

        return (
          name.includes(
            `season ${season}`
          ) ||
          name.includes(
            `s${String(season).padStart(2, "0")}`
          )
        );
      });

    if (!seasonFolder) {
      console.log(
        "[ShowBox] FebBox season folder not found"
      );

      return [];
    }

    const fid =
      seasonFolder.fid ||
      seasonFolder.id;

    if (!fid) {
      return [];
    }

    const seasonUrl =
      `${baseUrl}&fid=${encodeURIComponent(fid)}&page=1`;

    const seasonResponse =
      await fetch(seasonUrl, {
        headers: {
          "Accept-Language": "en"
        }
      });

    console.log(
      "[ShowBox] FebBox season response:",
      {
        status: seasonResponse.status,
        ok: seasonResponse.ok
      }
    );

    if (!seasonResponse.ok) {
      return [];
    }

    const seasonData =
      await seasonResponse.json();

    files =
      seasonData?.data?.file_list ||
      [];
  }

  console.log(
    "[ShowBox] FebBox files found:",
    files.length
  );

  /*
   * For TV, only keep the requested episode.
   */
  if (
    type === "series" &&
    season != null &&
    episode != null
  ) {
    const s =
      String(season).padStart(2, "0");

    const e =
      String(episode).padStart(2, "0");

    files = files.filter(file => {
      const name =
        String(
          file?.file_name ||
          file?.name ||
          ""
        ).toLowerCase();

      return (
        name.includes(`s${s}e${e}`) ||
        name.includes(
          `s${season}e${episode}`
        )
      );
    });

    console.log(
      "[ShowBox] Episode files found:",
      files.length
    );
  }

  return files;
}


/*
 * Step 3:
 * Ask FebBox for the available video qualities.
 *
 * This is intentionally only diagnostic for now.
 */
async function getFebBoxQualities(
  files,
  shareKey
) {
  console.log(
    "[ShowBox] FebBox quality lookup starting:",
    {
      files: files.length,
      shareKeyPresent: Boolean(shareKey)
    }
  );

  const results = [];

  for (const file of files) {
    const fid =
      file?.fid ||
      file?.id;

    if (!fid) {
      continue;
    }

    const url =
      `https://www.febbox.com/console/video_quality_list` +
      `?fid=${encodeURIComponent(fid)}` +
      `&share_key=${encodeURIComponent(shareKey)}`;

    try {
      const response =
        await fetch(url);

      console.log(
        "[ShowBox] FebBox quality response:",
        {
          fid,
          status: response.status
        }
      );

      const html =
        await response.text();

      results.push({
        fid,
        fileName:
          file?.file_name ||
          file?.name ||
          null,
        status: response.status,
        htmlLength: html.length,
        hasDataUrl:
          html.includes("data-url")
      });

    } catch (error) {
      console.log(
        "[ShowBox] FebBox quality request failed:",
        {
          fid,
          error: error.message
        }
      );
    }
  }

  console.log(
    "[ShowBox] FebBox quality results:",
    results.map(item => ({
      fid: item.fid,
      fileName: item.fileName,
      status: item.status,
      htmlLength: item.htmlLength,
      hasDataUrl: item.hasDataUrl
    }))
  );

  return results;
}


export default async (req, context) => {
  console.log("[ShowBox] STREAM TEST v5");

  try {
    const {
      type,
      id,
      config
    } = context.params;

    /*
     * Decode addon configuration.
     */
    let configData = {};

    if (config) {
      try {
        configData = JSON.parse(
          decodeBase64Url(config)
        );

        console.log(
          "[ShowBox] Config decoded:",
          {
            hasUiToken:
              Boolean(configData.uiToken)
          }
        );

      } catch {
        throw new Error(
          "Invalid addon configuration"
        );
      }
    }

    const token =
      configData.uiToken;

    if (!token) {
      throw new Error(
        "No ShowBox UI token configured"
      );
    }

    /*
     * Decode incoming Stremio ID.
     */
    const decodedId =
      decodeURIComponent(id);

    console.log(
      "[ShowBox] Incoming request:",
      {
        type,
        id: decodedId
      }
    );

    let season = null;
    let episode = null;
    let imdbId = decodedId;

    if (type === "series") {
      const parts =
        decodedId.split(":");

      imdbId = parts[0];
      season = Number(parts[1]);
      episode = Number(parts[2]);

      console.log(
        "[ShowBox] Series parsed:",
        {
          imdbId,
          season,
          episode
        }
      );
    }

    /*
     * IMDb → TMDB.
     */
    const tmdbId =
      await imdbToTmdb(
        imdbId,
        type
      );

    console.log(
      "[ShowBox] IMDb → TMDB conversion:",
      {
        imdbId,
        tmdbId,
        type,
        season,
        episode
      }
    );

    /*
     * Parse ShowBox token.
     */
    const parsedToken =
      parseSingleToken(token);

    console.log(
      "[ShowBox] Token ready:",
      {
        tokenParsed:
          parsedToken !== token
      }
    );

    /*
     * Build ShowBox request.
     */
    let apiUrl;

    if (type === "series") {
      apiUrl =
        `${SHOWBOX_API_BASE}/tv/${tmdbId}/${season}/${episode}` +
        `?cookie=${encodeURIComponent(parsedToken)}`;
    } else {
      apiUrl =
        `${SHOWBOX_API_BASE}/movie/${tmdbId}` +
        `?cookie=${encodeURIComponent(parsedToken)}`;
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
      await fetch(apiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

          "Accept":
            "application/json",

          "Accept-Language":
            "en-US,en;q=0.9",

          "Content-Type":
            "application/json"
        }
      });

    const data =
      await response.json();

    console.log(
      "[ShowBox] API response:",
      {
        status: response.status,
        success: data?.success,
        id: data?.id ?? null,
        mid: data?.mid ?? null,
        versions:
          Array.isArray(data?.versions)
            ? data.versions.length
            : 0
      }
    );

    /*
     * ShowBox gives us the media ID.
     */
    const showboxId =
      data?.id ??
      data?.mid ??
      null;

    if (!showboxId) {
      throw new Error(
        "ShowBox returned no media ID"
      );
    }

    /*
     * FebBox share lookup.
     */
    const shareKey =
      await getFebBoxShareKey(
        showboxId,
        type
      );

    if (!shareKey) {
      console.log(
        "[ShowBox] No FebBox share key found"
      );

      return new Response(
        JSON.stringify({
          test: true,
          stage: "febbox-share",
          type,
          imdbId,
          tmdbId,
          showboxId,
          shareKeyFound: false
        }),
        {
          headers: {
            "Content-Type":
              "application/json",
            "Access-Control-Allow-Origin":
              "*"
          }
        }
      );
    }

    /*
     * FebBox file lookup.
     */
    const files =
      await getFebBoxFiles(
        shareKey,
        type,
        season,
        episode
      );

    /*
     * FebBox quality lookup.
     */
    const qualities =
      await getFebBoxQualities(
        files,
        shareKey
      );

    /*
     * Diagnostic response only.
     */
    return new Response(
      JSON.stringify({
        test: true,
        stage: "febbox-quality",
        type,
        receivedId: decodedId,
        imdbId,
        tmdbId,
        season,
        episode,
        showboxId,
        apiStatus: response.status,
        success:
          data?.success ?? false,
        versions:
          Array.isArray(data?.versions)
            ? data.versions.length
            : 0,
        shareKeyFound: true,
        filesFound: files.length,
        qualities
      }),
      {
        headers: {
          "Content-Type":
            "application/json",
          "Access-Control-Allow-Origin":
            "*"
        }
      }
    );

  } catch (error) {

    console.log(
      "[ShowBox] ERROR:",
      error.message
    );

    return new Response(
      JSON.stringify({
        test: true,
        error: error.message
      }),
      {
        status: 500,
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
