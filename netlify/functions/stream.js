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

  console.log("[ShowBox] TMDB lookup:", {
    endpoint: `/find/${imdbId}`,
    externalSource: "imdb_id"
  });

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


export default async (req, context) => {
  console.log("[ShowBox] STREAM TEST v4");

  try {
    const {
      type,
      id,
      config
    } = context.params;


    // Decode addon configuration
    let configData = {};

    if (config) {
      try {
        configData = JSON.parse(
          decodeBase64Url(config)
        );

        console.log("[ShowBox] Config decoded:", {
          hasUiToken: Boolean(configData.uiToken)
        });

      } catch {
        throw new Error(
          "Invalid addon configuration"
        );
      }
    }


    const token = configData.uiToken;

    if (!token) {
      throw new Error(
        "No ShowBox UI token configured"
      );
    }


    // Decode incoming ID
    const decodedId = decodeURIComponent(id);

    console.log("[ShowBox] Incoming request:", {
      type,
      id: decodedId
    });


    let showboxId = decodedId;
    let season = null;
    let episode = null;
    let imdbId = decodedId;


    // Parse series ID
    //
    // Example:
    // tt0434665:1:1

    if (type === "series") {
      const parts = decodedId.split(":");

      imdbId = parts[0];
      season = Number(parts[1]);
      episode = Number(parts[2]);

      console.log("[ShowBox] Series parsed:", {
        imdbId,
        season,
        episode
      });
    }


    // Convert IMDb → TMDB

    showboxId = await imdbToTmdb(
      imdbId,
      type
    );


    console.log(
      "[ShowBox] IMDb → TMDB conversion:",
      {
        imdbId,
        tmdbId: showboxId,
        type,
        season,
        episode
      }
    );


    // Parse ShowBox token

    const parsedToken =
      parseSingleToken(token);


    console.log("[ShowBox] Token ready:", {
      tokenParsed: parsedToken !== token
    });


    // Build ShowBox API URL

    let apiUrl;

    if (type === "series") {
      apiUrl =
        `${SHOWBOX_API_BASE}/tv/${showboxId}/${season}/${episode}` +
        `?cookie=${encodeURIComponent(parsedToken)}`;
    } else {
      apiUrl =
        `${SHOWBOX_API_BASE}/movie/${showboxId}` +
        `?cookie=${encodeURIComponent(parsedToken)}`;
    }


    console.log("[ShowBox] Request:", {
      type,
      imdbId,
      tmdbId: showboxId,
      season,
      episode
    });


    // Request ShowBox API

    const response = await fetch(
      apiUrl,
      {
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
      }
    );


    const data = await response.json();


    console.log("[ShowBox] API response:", {
      status: response.status,
      success: data?.success,
      id: data?.id ?? null,
      mid: data?.mid ?? null,
      versions: Array.isArray(data?.versions)
        ? data.versions.length
        : 0
    });


    // Diagnostic response

    return new Response(
      JSON.stringify({
        test: true,
        type,
        receivedId: decodedId,
        imdbId,
        tmdbId: showboxId,
        season,
        episode,
        apiStatus: response.status,
        success: data?.success ?? false,
        showboxIdReturned:
          data?.id ??
          data?.mid ??
          null,
        versions:
          Array.isArray(data?.versions)
            ? data.versions.length
            : 0
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
