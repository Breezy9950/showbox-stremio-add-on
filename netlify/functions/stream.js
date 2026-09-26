export const config = {
  path: "/:config/stream/:type/:id.json"
};

function decodeBase64Url(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
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

        const iv = CryptoJS.enc.Utf8.parse("wEiphTn!");

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
          return String(result.uid);
        }
      }
    } catch {
      // Fall through and use the original token
    }
  }

  return token;
}

export default async (req, context) => {
  console.log("[ShowBox] STREAM TEST v3");

  try {
    const { type, id, config } = context.params;

    // Decode addon configuration
    let configData = {};

    if (config) {
      try {
        configData = JSON.parse(decodeBase64Url(config));
      } catch {
        throw new Error("Invalid addon configuration");
      }
    }

    const token = configData.uiToken;

    if (!token) {
      throw new Error("No ShowBox UI token configured");
    }

    // Decode the incoming stream ID.
    //
    // Movie:
    // tt22084616
    //
    // Series:
    // tt0434665:1:1
    const decodedId = decodeURIComponent(id);

    let showboxId = decodedId;
    let season = null;
    let episode = null;

    if (type === "series") {
      const parts = decodedId.split(":");

      showboxId = parts[0];
      season = Number(parts[1]);
      episode = Number(parts[2]);
    }

    const parsedToken = parseSingleToken(token);

    const apiBase =
      "https://id-mapping-api-showbox-proxy.hf.space/api/media";

    let apiUrl;

    if (type === "series") {
      apiUrl =
        `${apiBase}/tv/${showboxId}/${season}/${episode}` +
        `?cookie=${encodeURIComponent(parsedToken)}`;
    } else {
      apiUrl =
        `${apiBase}/movie/${showboxId}` +
        `?cookie=${encodeURIComponent(parsedToken)}`;
    }

    console.log("[ShowBox] Request:", {
      type,
      id: decodedId,
      showboxId,
      season,
      episode
    });

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json"
      }
    });

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

    return new Response(
      JSON.stringify({
        test: true,
        type,
        receivedId: decodedId,
        showboxId,
        season,
        episode,
        apiStatus: response.status,
        success: data?.success ?? false,
        showboxIdReturned: data?.id ?? data?.mid ?? null,
        versions: Array.isArray(data?.versions)
          ? data.versions.length
          : 0
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );

  } catch (error) {
    console.log("[ShowBox] ERROR:", error.message);

    return new Response(
      JSON.stringify({
        test: true,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
