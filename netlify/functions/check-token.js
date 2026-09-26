import CryptoJS from "crypto-js";

const SHOWBOX_API =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

const TEST_TMDB_ID = "603"; // The Matrix (1999)

const WORKING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/*
 * EXACT token parsing from stream.js
 */
function parseSingleToken(token) {
  if (!token) return null;

  if (!token.startsWith("eyJ")) {
    return token;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(
        token.split(".")[1] || "",
        "base64"
      ).toString("utf8")
    );

    if (!decoded || !decoded.encrypt_data) {
      return token;
    }

    const key = CryptoJS.enc.Utf8.parse(
      "123d6cedf626dy54233aa1w6"
    );

    const iv = CryptoJS.enc.Utf8.parse(
      "wEiphTn!"
    );

    const decrypted = CryptoJS.TripleDES.decrypt(
      decoded.encrypt_data,
      key,
      {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    ).toString(CryptoJS.enc.Utf8);

    const result = JSON.parse(decrypted);

    if (result && result.uid) {
      return String(result.uid);
    }

    return token;
  } catch {
    return token;
  }
}

/*
 * EXACT ShowBox movie request from stream.js
 */
async function getShowBoxData(tmdbId, token) {
  const requestUrl =
    `${SHOWBOX_API}/movie/${tmdbId}?cookie=${encodeURIComponent(token)}`;

  const response = await fetch(requestUrl, {
    headers: WORKING_HEADERS,
  });

  const text = await response.text();

  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return {
    response,
    data,
  };
}

/*
 * EXACT FebBox share lookup from stream.js
 */
async function febboxShare(showboxId) {
  const boxType = 1;

  const url =
    `https://www.febbox.com/mbp/to_share_page?box_type=${boxType}&mid=${showboxId}&json=1`;

  const response = await fetch(url);
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid FebBox share response");
  }

  if (data.code !== 1 || !data.data) {
    throw new Error("FebBox share lookup failed");
  }

  const shareLink =
    data.data.shareLink ||
    data.data.share_link;

  if (!shareLink) {
    throw new Error("FebBox share link missing");
  }

  const shareKey = shareLink.split("/").pop();

  if (!shareKey) {
    throw new Error("FebBox share key missing");
  }

  return shareKey;
}

/*
 * EXACT root file-list request from stream.js
 */
async function febboxFileList(shareKey) {
  const url =
    `https://www.febbox.com/file/file_share_list?share_key=${shareKey}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "en",
    },
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid FebBox file-list response");
  }

  return data;
}

/*
 * EXACT movie file discovery behavior from stream.js.
 *
 * Do NOT require .mp4/.mkv/etc.
 * stream.js considers entries with fid + file_name.
 */
function findMovieFiles(data) {
  const files = Array.isArray(data?.file_list)
    ? data.file_list
    : [];

  return files.filter(
    (file) =>
      file &&
      file.fid &&
      file.file_name
  );
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        status: "error",
        message: "Method not allowed.",
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
        status: "invalid",
        message: "Invalid request.",
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
        message: "No token was provided.",
      },
      400
    );
  }

  try {
    /*
     * Same token transformation as stream.js.
     */
    const parsedToken = parseSingleToken(token);

    if (!parsedToken) {
      return jsonResponse({
        status: "invalid",
        message: "The cookie could not be parsed.",
      });
    }

    /*
     * 1. ShowBox
     */
    const {
      response,
      data,
    } = await getShowBoxData(
      TEST_TMDB_ID,
      parsedToken
    );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      return jsonResponse({
        status: "invalid",
        message: "The cookie was rejected by ShowBox.",
      });
    }

    if (response.status === 429) {
      return jsonResponse({
        status: "rate_limited",
        message: "This cookie is currently rate limited.",
      });
    }

    if (!response.ok || !data) {
      return jsonResponse({
        status: "unknown",
        message: "ShowBox returned an unexpected response.",
      });
    }

    if (data.success === false) {
      return jsonResponse({
        status: "invalid",
        message: "ShowBox rejected the cookie.",
      });
    }

    /*
     * EXACT ShowBox ID extraction from stream.js.
     */
    const showboxId =
      data.id ||
      data.mid ||
      (
        data.data &&
        (
          data.data.id ||
          data.data.mid
        )
      );

    if (!showboxId) {
      return jsonResponse({
        status: "invalid",
        message: "The cookie did not resolve to a ShowBox movie.",
      });
    }

    /*
     * 2. FebBox share
     */
    const shareKey = await febboxShare(showboxId);

    /*
     * 3. FebBox root file list
     */
    const fileData = await febboxFileList(shareKey);

    /*
     * 4. EXACT same movie-file discovery behavior
     *    as stream.js.
     */
    const files = findMovieFiles(fileData);

    /*
     * If FebBox has files, validation succeeds.
     *
     * We deliberately do not call the quality endpoint.
     */
    if (files.length > 0) {
      return jsonResponse({
        status: "usable",
        message: "Cookie is working.",
      });
    }

    return jsonResponse({
      status: "invalid",
      message: "No video files were found for the test movie.",
    });
  } catch (error) {
    return jsonResponse({
      status: "unknown",
      message: "Could not verify the cookie.",
    });
  }
};

export const config = {
  path: "/check-token",
};
