export default async (req, context) => {
  const { type, id, config } = context.params;

  let uiToken;

  try {
    const base64 = config
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const json = atob(base64);
    const parsed = JSON.parse(json);

    uiToken = parsed.uiToken;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid addon configuration" }),
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
      JSON.stringify({ error: "No ShowBox UI token configured" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  const apiBase =
    "https://id-mapping-api-showbox-proxy.hf.space/api/media";

  const url =
    `${apiBase}/movie/${encodeURIComponent(id)}` +
    `?cookie=${encodeURIComponent(uiToken)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Accept-Language": "en",
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    return new Response(
      JSON.stringify({
        test: true,
        type,
        id,
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
