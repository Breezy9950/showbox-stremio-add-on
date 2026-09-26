const SHOWBOX_API =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

const WORKING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

  "Accept": "application/json",

  "Accept-Language":
    "en-US,en;q=0.9",

  "Content-Type":
    "application/json"
};

function jsonResponse(body, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    }
  );
}

export default async (request) => {

  // ------------------------------------------------------------
  // CORS PREFLIGHT
  // ------------------------------------------------------------

  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  // ------------------------------------------------------------
  // ONLY POST
  // ------------------------------------------------------------

  if (request.method !== "POST") {
    return jsonResponse(
      {
        status: "error",
        message: "Method not allowed."
      },
      405
    );
  }

  // ------------------------------------------------------------
  // READ TOKEN
  // ------------------------------------------------------------

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        status: "error",
        message: "Invalid request."
      },
      400
    );
  }

  const token =
    typeof body?.token === "string"
      ? body.token.trim()
      : "";

  if (!token) {
    return jsonResponse(
      {
        status: "invalid",
        message: "No token was provided."
      },
      400
    );
  }

  // ------------------------------------------------------------
  // TEST THE SAME SHOWBOX AUTHENTICATION USED BY THE ADDON
  //
  // The Matrix TMDB ID = 603.
  //
  // We intentionally make only ONE request so that checking
  // the token does not itself create unnecessary API traffic.
  // ------------------------------------------------------------

  const testUrl =
    `${SHOWBOX_API}/movie/603?cookie=${encodeURIComponent(token)}`;

  try {

    const response = await fetch(
      testUrl,
      {
        method: "GET",
        headers: WORKING_HEADERS
      }
    );

    const responseText =
      await response.text();

    // ----------------------------------------------------------
    // RATE LIMIT
    // ----------------------------------------------------------

    const lowerText =
      responseText.toLowerCase();

    const looksRateLimited =
      response.status === 429 ||
      lowerText.includes("rate limit") ||
      lowerText.includes("rate-limit") ||
      lowerText.includes("too many requests");

    if (looksRateLimited) {

      return jsonResponse({
        status: "rate_limited",
        message:
          "This token is currently rate limited."
      });
    }

    // ----------------------------------------------------------
    // AUTHENTICATION REJECTED
    // ----------------------------------------------------------

    if (
      response.status === 401 ||
      response.status === 403
    ) {

      return jsonResponse({
        status: "invalid",
        message:
          "The token was rejected by ShowBox."
      });
    }

    // ----------------------------------------------------------
    // PARSE SHOWBOX RESPONSE
    // ----------------------------------------------------------

    let data = null;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }

    // ----------------------------------------------------------
    // SUCCESS
    //
    // This is the same success condition the addon relies on:
    // success === true
    // ----------------------------------------------------------

    if (
      response.ok &&
      data &&
      data.success === true
    ) {

      return jsonResponse({
        status: "usable",
        message:
          "Token is usable."
      });
    }

    // ----------------------------------------------------------
    // EXPLICIT SHOWBOX FAILURE
    // ----------------------------------------------------------

    if (
      data &&
      data.success === false
    ) {

      return jsonResponse({
        status: "invalid",
        message:
          "ShowBox rejected the token or could not validate it."
      });
    }

    // ----------------------------------------------------------
    // OTHER HTTP ERRORS
    // ----------------------------------------------------------

    if (!response.ok) {

      return jsonResponse({
        status: "unknown",
        message:
          `ShowBox returned HTTP ${response.status}.`
      });
    }

    // ----------------------------------------------------------
    // UNKNOWN RESPONSE
    // ----------------------------------------------------------

    return jsonResponse({
      status: "unknown",
      message:
        "ShowBox returned an unexpected response."
    });

  } catch (error) {

    // IMPORTANT:
    // Do not return or log the token.
    return jsonResponse({
      status: "unknown",
      message:
        "Could not contact the ShowBox API."
    });
  }
};

export const config = {
  path: "/check-token"
};
