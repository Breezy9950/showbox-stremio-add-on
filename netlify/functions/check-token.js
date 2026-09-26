import CryptoJS from "crypto-js";

const TEST_TMDB_ID = "603"; // The Matrix (1999)

const SHOWBOX_API =
  "https://id-mapping-api-showbox-proxy.hf.space/api/media";

const WORKING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
};

function parseSingleToken(token) {
  if (!token) return null;

  if (!token.startsWith("eyJ")) {
    return token;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(token.split(".")[1] || "", "base64").toString("utf8")
    );

    if (!decoded || !decoded.encrypt_data) {
      return token;
    }

    const key = CryptoJS.enc.Utf8.parse("123d6cedf626dy54233aa1w6");
    const iv = CryptoJS.enc.Utf8.parse("wEiphTn!");

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

async function getShowBoxData(tmdbId, token) {
  const url =
    `${SHOWBOX_API}/movie/${tmdbId}` +
    `?cookie=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    headers: WORKING_HEADERS,
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!response.ok) {
    throw new Error(`ShowBox HTTP ${response.status}`);
  }

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid ShowBox response");
  }

  if (!data) {
    throw new Error("Empty ShowBox response");
  }

  return data;
}

async function febboxShare(showboxId) {
  const url =
    `https://www.febbox.com/mbp/to_share_page` +
    `?box_type=1&mid=${showboxId}&json=1`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`FebBox share HTTP ${response.status}`);
  }

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid FebBox share response");
  }

  if (data.code !== 1 || !data.data) {
    throw new Error("FebBox share failed");
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

async function febboxFileList(shareKey) {
  const url =
    `https://www.febbox.com/file/file_share_list` +
    `?share_key=${encodeURIComponent(shareKey)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "en",
    },
  });

  if (!response.ok) {
    throw new Error(`FebBox file list HTTP ${response.status}`);
  }

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid FebBox file list response");
  }

  const files =
    data &&
    data.data &&
    Array.isArray(data.data.file_list)
      ? data.data.file_list
      : [];

  if (
    data.code !== 1 ||
    !data.data ||
    !Array.isArray(data.data.file_list)
  ) {
    throw new Error("FebBox file list missing");
  }

  return files;
}

function findMovieFiles(rootFiles) {
  const files = rootFiles.filter(
    (item) =>
      item &&
      item.fid &&
      item.file_name
  );

  if (!files.length) {
    throw new Error("No movie files found");
  }

  return files;
}

function parseFebboxHtml(html, file) {
  const streams = [];

  const blocks = html.split(
    /(?=<div[^>]*class=["'][^"']*file_quality[^"']*["'][^>]*>)/i
  );

  for (const block of blocks) {
    if (!block.includes("file_quality")) {
      continue;
    }

    const urlMatch = block.match(
      /data-url=["']([^"']+)["']/i
    );

    if (!urlMatch) {
      continue;
    }

    const qualityMatch = block.match(
      /data-quality=["']([^"']+)["']/i
    );

    const sizeMatch = block.match(
      /class=["'][^"']*\bsize\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    );

    streams.push({
      url: urlMatch[1],
      quality: qualityMatch
        ? qualityMatch[1]
        : "",
      size: sizeMatch
        ? sizeMatch[1]
            .replace(/<[^>]+>/g, "")
            .trim()
        : "",
      fileName: file.file_name || "",
    });
  }

  return streams;
}

async function febboxQualityList(
  file,
  shareKey,
  token
) {
  const cookieHeader =
    token.startsWith("ui=")
      ? token
      : `ui=${token}`;

  const qualityUrl =
    `https://www.febbox.com/console/video_quality_list` +
    `?fid=${file.fid}` +
    `&share_key=${encodeURIComponent(shareKey)}`;

  const response = await fetch(qualityUrl, {
    headers: {
      Cookie: cookieHeader,
    },
  });

  if (!response.ok) {
    throw new Error(
      `FebBox quality HTTP ${response.status}`
    );
  }

  const text = await response.text();

  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (data && data.html) {
    return parseFebboxHtml(
      data.html,
      file
    );
  }

  if (text.includes("file_quality")) {
    return parseFebboxHtml(
      text,
      file
    );
  }

  throw new Error(
    "FebBox quality response missing HTML"
  );
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const originalToken =
      typeof body.token === "string"
        ? body.token.trim()
        : "";

    if (!originalToken) {
      return new Response(
        JSON.stringify({
          status: "invalid",
          message: "Token is required.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const parsedToken =
      parseSingleToken(originalToken);

    if (!parsedToken) {
      return new Response(
        JSON.stringify({
          status: "invalid",
          message: "Invalid token.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const showboxData =
      await getShowBoxData(
        TEST_TMDB_ID,
        parsedToken
      );

    const showboxId =
      showboxData?.id ??
      showboxData?.data?.id ??
      showboxData?.data?.movie?.id;

    if (!showboxId) {
      return new Response(
        JSON.stringify({
          status: "invalid",
          message:
            "Token was not accepted by ShowBox.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const shareKey =
      await febboxShare(showboxId);

    const rootFiles =
      await febboxFileList(shareKey);

    const files =
      findMovieFiles(rootFiles);

    let usableStreams = 0;

    for (const file of files) {
      try {
        const streams =
          await febboxQualityList(
            file,
            shareKey,
            parsedToken
          );

        for (const stream of streams) {
          if (
            stream &&
            typeof stream.url === "string" &&
            stream.url.trim()
          ) {
            usableStreams++;
          }
        }

        if (usableStreams > 0) {
          break;
        }
      } catch {
        // Try the next file.
      }
    }

    if (usableStreams === 0) {
      return new Response(
        JSON.stringify({
          status: "invalid",
          message:
            "Token could not access a usable stream.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "usable",
        message: "Token is working.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    if (
      error &&
      error.message === "RATE_LIMITED"
    ) {
      return new Response(
        JSON.stringify({
          status: "rate_limited",
          message:
            "ShowBox is rate limiting the request. Try again later.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "invalid",
        message:
          "The token could not be verified.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export const config = {
  path: "/check-token",
};
