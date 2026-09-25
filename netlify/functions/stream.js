import CryptoJS from "crypto-js";

function parseSingleToken(token) {
  if (!token) return "";

  if (token.startsWith("eyJ")) {
    try {
      const decoded = CryptoJS.enc.Base64
        .parse(token)
        .toString(CryptoJS.enc.Utf8);

      const parsed = JSON.parse(decoded);

      if (parsed && parsed.encrypt_data) {
        const key = "123d6cedf626dy54233aa1w6";
        const iv = CryptoJS.enc.Utf8.parse("wEiphTn!");

        const decrypted = CryptoJS.TripleDES.decrypt(
          parsed.encrypt_data,
          CryptoJS.enc.Utf8.parse(key),
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
      // Match the original provider:
      // if decoding fails, use the original token.
    }
  }

  return token;
}

export default async (req, context) => {
  const { type, id, config } = context.params;

  let uiToken;

  try {
    const base64 = config
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = base64 + "=".repeat(
      (4 - (base64.length % 4)) % 4
    );

    const json = atob(padded);
    const parsed = JSON.parse(json);

    uiToken = parsed.uiToken;
  } catch {
    return new Response(
      JSON.stringify({
        error: "Invalid addon configuration"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  if (!uiToken) {
    return new Response(
      JSON.stringify({
        error: "No ShowBox UI token configured"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  const parsedToken = parseSingleToken(uiToken);
  const tokenWasTransformed = parsedToken !== uiToken;

  const apiBase =
    "https://id-mapping-api-showbox-proxy.hf.space/api/media";

  const url =
    type === "series"
      ? `${apiBase}/tv/${encodeURIComponent(id)}?cookie=${encodeURIComponent(parsedToken)}`
      : `${apiBase}/movie/${encodeURIComponent(id)}?cookie=${encodeURIComponent(parsedToken)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    return new Response(
      JSON.stringify({
        test: true,
        type,
        id,
        tokenStartsWithEyJ: uiToken.startsWith("eyJ"),
        tokenWasTransformed,
        apiStatus: response.status,
        success: data.success,
        showboxId: data.id || data.mid || null,
        versions: Array.isArray(data.versions)
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
    return new Response(
      JSON.stringify({
        error: "ShowBox API request failed",
        message: error.message
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};

export const config = {
  path: "/:config/stream/:type/:id.json"
};
