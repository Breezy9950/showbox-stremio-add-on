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
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store",

        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Methods":
          "POST, OPTIONS",

        "Access-Control-Allow-Headers":
          "Content-Type"
      }
    }
  );

}


export default async (request) => {

  if (request.method === "OPTIONS") {

    return jsonResponse({
      ok: true
    });

  }


  if (request.method !== "POST") {

    return jsonResponse(
      {
        status:
          "error",

        message:
          "Method not allowed."
      },
      405
    );

  }


  let body;

  try {

    body =
      await request.json();

  }

  catch {

    return jsonResponse(
      {
        status:
          "error",

        message:
          "Invalid request."
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
        status:
          "invalid",

        message:
          "No token was provided."
      },
      400
    );

  }


  const testUrl =
    `${SHOWBOX_API}/movie/603?cookie=${encodeURIComponent(token)}`;


  try {

    const response =
      await fetch(
        testUrl,
        {
          method:
            "GET",

          headers:
            WORKING_HEADERS
        }
      );


    const responseText =
      await response.text();


    let data = null;

    try {

      data =
        JSON.parse(responseText);

    }

    catch {

      data =
        null;

    }


    return jsonResponse({

      status:
        "diagnostic",

      receivedTokenLength:
        token.length,

      showboxHttpStatus:
        response.status,

      showboxResponseIsJson:
        data !== null,

      showboxSuccess:
        data?.success ?? null,

      showboxId:
        data?.id ?? null,

      showboxMid:
        data?.mid ?? null

    });

  }

  catch {

    return jsonResponse({

      status:
        "diagnostic",

      receivedTokenLength:
        token.length,

      message:
        "Could not contact the ShowBox API."

    });

  }

};


export const config = {

  path:
    "/check-token"

};
