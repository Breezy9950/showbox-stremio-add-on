const CryptoJS = require("crypto-js");

const SHOWBOX_API =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

const WORKING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json"
};

const FEBBOX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.8",
  "Connection": "keep-alive",
  "Range": "bytes=0-"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

/*
 * Same token handling used by stream.js.
 */
function parseSingleToken(token) {
  if (!token) return "";

  if (token.startsWith("eyJ")) {
    try {
      const parsed = CryptoJS.enc.Base64.parse(token);
      const decoded = parsed.toString(CryptoJS.enc.Utf8);
      const outer = JSON.parse(decoded);

      if (outer && outer.encrypt_data) {
        const keyString = "123d6cedf626dy54233aa1w6";
        const ivString = "wEiphTn!";

        const key = CryptoJS.enc.Utf8.parse(keyString);
        const iv = CryptoJS.enc.Utf8.parse(ivString);

        const decrypted = CryptoJS.TripleDES.decrypt(
          outer.encrypt_data,
          key,
          {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
          }
        );

        const result = decrypted.toString(CryptoJS.enc.Utf8);
        const data = JSON.parse(result);

        if (data && data.uid) {
          return String(data.uid);
        }
      }
    } catch {
      // Same fallback behavior as stream.js.
    }
  }

  return token;
}

/*
 * Ask ShowBox for a known movie.
 *
 * Spider-Man: Brand New Day
 * TMDB ID: 969681
 *
 * This is one of the IDs already confirmed to produce
 * working ShowBox/FEBBox streams in the addon.
 */
async function getShowBoxId(token) {
  const parsedToken = parseSingleToken(token);

  const url =
    `${SHOWBOX_API}/movie/969681?cookie=${encodeURIComponent(parsedToken)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: WORKING_HEADERS
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (data?.id || data?.mid) {
    return data.id || data.mid;
  }

  if (data?.data?.id || data?.data?.mid) {
    return data.data.id || data.data.mid;
  }

  return null;
}

/*
 * Same FebBox share-page step used by stream.js.
 */
async function getShareKey(showBoxId) {
  const url =
    `https://www.febbox.com/mbp/to_share_page?box_type=1&mid=${showBoxId}&json=1`;

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (data?.code !== 1 || !data?.data) {
    return null;
  }

  const shareLink = data.data.share_link;

  if (!shareLink) {
    return null;
  }

  /*
   * Example:
   * https://www.febbox.com/share/zcegI2J7
   *
   * The final path component is the share key.
   */
  return shareLink.split("/").pop() || null;
}

/*
 * Get the files associated with the share.
 */
async function getFiles(shareKey) {
  const url =
    `https://www.febbox.com/file/file_share_list?share_key=${encodeURIComponent(shareKey)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "en"
    }
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  if (
    data?.code !== 1 ||
    !data?.data ||
    !Array.isArray(data.data.file_list)
  ) {
    return [];
  }

  return data.data.file_list;
}

/*
 * Same quality lookup used by stream.js.
 *
 * The important part is the Cookie header.
 *
 * We don't merely check whether ShowBox returned success.
 * We require an actual playable data-url from FebBox.
 */
async function hasWorkingStream(file, shareKey, token) {
  if (!file?.fid) {
    return false;
  }

  const parsedToken = parseSingleToken(token);

  const url =
    `https://www.febbox.com/console/video_quality_list?fid=${file.fid}&share_key=${encodeURIComponent(shareKey)}`;

  const response = await fetch(url, {
    headers: {
      Cookie: parsedToken
    }
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json().catch(() => null);

  if (!data?.html) {
    return false;
  }

  /*
   * stream.js parses:
   *
   * div.file_quality
   *
   * and reads:
   *
   * data-url
   *
   * We only need to know whether at least one
   * actual stream URL exists.
   */
  const qualityBlocks =
    data.html.match(/<div[^>]*class=["'][^"']*file_quality[^"']*["'][^>]*>/gi) || [];

  for (const block of qualityBlocks) {
    const match = block.match(
      /data-url=["']([^"']+)["']/i
    );

    if (match && match[1]) {
      return true;
    }
  }

  return false;
}

async function validateToken(token) {
  /*
   * Step 1:
   * ShowBox lookup.
   */
  const showBoxId = await getShowBoxId(token);

  if (!showBoxId) {
    return {
      status: "invalid",
      message: "The token could not retrieve a ShowBox media entry."
    };
  }

  /*
   * Step 2:
   * Get FebBox share key.
   */
  const shareKey = await getShareKey(showBoxId);

  if (!shareKey) {
    return {
      status: "invalid",
      message: "The token did not produce a usable FebBox share."
    };
  }

  /*
   * Step 3:
   * Get files.
   */
  const files = await getFiles(shareKey);

  if (!files.length) {
    return {
      status: "invalid",
      message: "No playable files were found."
    };
  }

  /*
   * Step 4:
   * Try the actual quality/stream endpoint using
   * the user's token as the FebBox Cookie.
   */
  for (const file of files) {
    try {
      const working = await hasWorkingStream(
        file,
        shareKey,
        token
      );

      if (working) {
        return {
          status: "usable",
          message: "Cookie is working."
        };
      }
    } catch {
      // Try the next file.
    }
  }

  /*
   * We reached the actual stream lookup but couldn't
   * obtain a playable URL.
   */
  return {
    status: "invalid",
    message: "The token could not retrieve a playable stream."
  };
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        status: "error",
        message: "Method not allowed."
      },
      405
    );
  }

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

  try {
    const result = await validateToken(token);

    return jsonResponse(result);

  } catch (error) {
    console.error(
      "[Token Check] Error:",
      error?.message || error
    );

    return jsonResponse({
      status: "unknown",
      message: "Could not complete the stream test."
    });
  }
};

export const config = {
  path: "/check-token"
};
