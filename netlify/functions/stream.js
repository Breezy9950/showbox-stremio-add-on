import CryptoJS from "crypto-js";

const SHOWBOX_WEB_API =
  "https://showbox.media";

const SHOWBOX_SEARCH_HEADERS = {
  Accept:
    "application/json, text/html, */*",

  "Accept-Language":
    "en",

  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
};

const FEBBOX_BASE_URL =
  "https://www.febbox.com";

const FEBBOX_HEADERS = {
  "Accept-Language":
    "en",

  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};


// =========================================================
// Base64URL
// =========================================================

function decodeBase64Url(
  value
) {

  if (!value) {
    return "";
  }

  let base64 =
    String(value)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    base64.length % 4
  ) {
    base64 += "=";
  }

  return Buffer
    .from(
      base64,
      "base64"
    )
    .toString("utf8");
}


// =========================================================
// Parse configured Stremio config
// =========================================================

function parseConfig(
  rawConfig
) {

  try {

    const decoded =
      decodeBase64Url(
        rawConfig
      );

    if (!decoded) {
      return {};
    }

    const config =
      JSON.parse(
        decoded
      );

    return (
      config &&
      typeof config === "object"
    )
      ? config
      : {};

  } catch (error) {

    console.log(
      "[ShowBox] Config parsing failed:",
      error.message
    );

    return {};
  }
}


// =========================================================
// ShowBox / FebBox token handling
// =========================================================

function parseSingleToken(
  token
) {

  if (!token) {
    return null;
  }

  /*
   * Some configs may already contain the raw
   * FebBox ui cookie value.
   */

  if (
    !String(token).startsWith("eyJ")
  ) {

    return String(token);
  }

  /*
   * Some newer config formats wrap token data
   * inside a JWT-like object.
   *
   * We do not cryptographically verify the JWT
   * here. We only decode its payload to look for
   * the embedded token.
   */

  try {

    const parts =
      String(token).split(".");

    if (
      parts.length < 2
    ) {

      return token;
    }

    const payload =
      JSON.parse(
        decodeBase64Url(
          parts[1]
        )
      );

    /*
     * Current config format observed:
     *
     * {
     *   data: {
     *     uid: ...,
     *     token: "..."
     *   }
     * }
     */

    if (
      payload?.data?.token
    ) {

      return String(
        payload.data.token
      );
    }

    /*
     * Older encrypted format.
     *
     * Kept for compatibility if an older
     * config is supplied.
     */

    if (
      payload?.encrypt_data
    ) {

      try {

        const key =
          CryptoJS.enc.Utf8.parse(
            "123d6cedf626dy54233aa1w6"
          );

        const iv =
          CryptoJS.enc.Utf8.parse(
            "wEiphTn!"
          );

        const decrypted =
          CryptoJS.TripleDES.decrypt(
            payload.encrypt_data,
            key,
            {
              iv,

              mode:
                CryptoJS.mode.CBC,

              padding:
                CryptoJS.pad.Pkcs7
            }
          )
          .toString(
            CryptoJS.enc.Utf8
          );

        const result =
          JSON.parse(
            decrypted
          );

        if (
          result?.uid
        ) {

          return String(
            result.uid
          );
        }

      } catch (legacyError) {

        console.log(
          "[ShowBox] Legacy token parsing failed:",
          legacyError.message
        );

      }
    }

    return token;

  } catch (error) {

    console.log(
      "[ShowBox] Token parsing failed:",
      error.message
    );

    return token;
  }
}


// =========================================================
// ShowBox HTML helpers
// =========================================================

function decodeHtmlEntities(
  value
) {

  if (!value) {
    return "";
  }

  return String(value)
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&#x2F;/gi,
      "/"
    )
    .replace(
      /&#47;/gi,
      "/"
    );
}


function stripHtml(
  value
) {

  if (!value) {
    return "";
  }

  return decodeHtmlEntities(
    String(value)
      .replace(
        /<[^>]*>/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
  );
}


// =========================================================
// ShowBox search
// IMDb -> FIRST ShowBox result
// =========================================================

function parseShowBoxSearchHref(
  html
) {

  if (!html) {
    return null;
  }

  /*
   * This is intentionally based on the
   * ShowBox search-result "film-name"
   * element.
   *
   * We return ONLY the first match.
   */

  const patterns = [

    /class=["'][^"']*film-name[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i,

    /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*film-name[^"']*["']/i,

    /<a[^>]+class=["'][^"']*film-name[^"']*["'][^>]*href=["']([^"']+)["']/i

  ];


  for (
    const pattern of patterns
  ) {

    const match =
      html.match(
        pattern
      );

    if (
      match?.[1]
    ) {

      try {

        return new URL(
          decodeHtmlEntities(
            match[1]
          ),
          SHOWBOX_WEB_API
        ).href;

      } catch {

        continue;
      }
    }
  }


  /*
   * Fallback for markup variations where
   * the film-name class isn't on the exact
   * element we expected.
   *
   * Still stops at the FIRST matching
   * movie/TV result.
   */

  const fallbackPattern =
    /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;

  let match;

  while (
    (match =
      fallbackPattern.exec(html)) !== null
  ) {

    const href =
      decodeHtmlEntities(
        match[1] || ""
      );

    if (
      /\/(?:movie|tv|series|film-name)\//i
        .test(href)
    ) {

      try {

        return new URL(
          href,
          SHOWBOX_WEB_API
        ).href;

      } catch {

        continue;
      }
    }
  }

  return null;
}


// =========================================================
// Extract ShowBox media ID
// =========================================================

function parseShowBoxHeadingId(
  html
) {

  if (!html) {
    return null;
  }

  /*
   * The important part here is that the
   * numeric ID is NOT extracted from the
   * search URL.
   *
   * For example:
   *
   * /movie/m-ufc-329-...
   *
   * must NOT result in ID 329.
   *
   * We first inspect the detail page's
   * heading-name link.
   */

  const patterns = [

    /class=["'][^"']*heading-name[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i,

    /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*heading-name[^"']*["']/i,

    /<a[^>]+class=["'][^"']*heading-name[^"']*["'][^>]*href=["']([^"']+)["']/i

  ];


  for (
    const pattern of patterns
  ) {

    const match =
      html.match(
        pattern
      );

    if (
      !match?.[1]
    ) {

      continue;
    }

    const href =
      decodeHtmlEntities(
        match[1]
      );


    /*
     * ShowBox detail links may contain
     * the media ID as the final path
     * component.
     *
     * Do not accept a random number from
     * somewhere in the slug.
     */

    const parts =
      href
        .split("/")
        .filter(Boolean);


    const last =
      parts.at(-1);


    if (
      last &&
      /^\d+$/.test(last)
    ) {

      return last;
    }


    /*
     * Some formats put the ID after a
     * media-specific prefix.
     */

    const idMatch =
      href.match(
        /(?:movie|tv|series)[^0-9]*?(\d+)(?:[/?#]|$)/i
      );


    if (
      idMatch?.[1]
    ) {

      return idMatch[1];
    }
  }


  /*
   * Some pages expose the media ID
   * directly through a data attribute.
   */

  const dataId =
    html.match(
      /(?:data-id|data-mid|data-media-id)=["'](\d+)["']/i
    );


  if (
    dataId?.[1]
  ) {

    return dataId[1];
  }


  return null;
}


// =========================================================
// Search ShowBox using IMDb ID
// =========================================================

async function searchShowBoxMediaId(
  imdbId
) {

  console.log(
    "[ShowBox] Web search:",
    imdbId
  );


  const searchUrl =
    `${SHOWBOX_WEB_API}/search?keyword=${encodeURIComponent(imdbId)}`;


  const searchResponse =
    await fetch(
      searchUrl,
      {
        headers:
          SHOWBOX_SEARCH_HEADERS
      }
    );


  console.log(
    "[ShowBox] Web search response:",
    searchResponse.status
  );


  if (
    !searchResponse.ok
  ) {

    throw new Error(
      `ShowBox web search failed: HTTP ${searchResponse.status}`
    );
  }


  const searchHtml =
    await searchResponse.text();


  const detailUrl =
    parseShowBoxSearchHref(
      searchHtml
    );


  if (
    !detailUrl
  ) {

    throw new Error(
      "ShowBox web search result not found"
    );
  }


  /*
   * FIRST result only.
   */

  console.log(
    "[ShowBox] First search result:",
    detailUrl
  );


  const detailResponse =
    await fetch(
      detailUrl,
      {
        headers:
          SHOWBOX_SEARCH_HEADERS
      }
    );


  console.log(
    "[ShowBox] Web detail response:",
    detailResponse.status
  );


  if (
    !detailResponse.ok
  ) {

    throw new Error(
      `ShowBox web detail failed: HTTP ${detailResponse.status}`
    );
  }


  const detailHtml =
    await detailResponse.text();


  const showboxId =
    parseShowBoxHeadingId(
      detailHtml
    );


  if (
    !showboxId
  ) {

    throw new Error(
      "ShowBox media ID not found"
    );
  }


  console.log(
    "[ShowBox] Verified media ID:",
    showboxId
  );


  return showboxId;
}


// =========================================================
// FebBox share
// =========================================================

async function febboxShare(
  showboxId,
  type
) {

  const boxType =
    type === "series"
      ? 2
      : 1;


  const url =
    `${FEBBOX_BASE_URL}/mbp/to_share_page` +
    `?box_type=${boxType}` +
    `&mid=${encodeURIComponent(showboxId)}` +
    `&json=1`;


  console.log(
    "[ShowBox] FebBox share request:",
    {
      boxType,
      showboxId
    }
  );


  const response =
    await fetch(
      url,
      {
        headers:
          FEBBOX_HEADERS
      }
    );


  const text =
    await response.text();


  console.log(
    "[ShowBox] FebBox share response:",
    {
      status:
        response.status,

      bodyLength:
        text.length
    }
  );


  if (
    !response.ok
  ) {

    throw new Error(
      `FebBox share failed: HTTP ${response.status}`
    );
  }


  let data;


  try {

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      "FebBox share response was not JSON"
    );
  }


  console.log(
    "[ShowBox] FebBox share JSON:",
    {
      code:
        data.code,

      hasData:
        !!data.data
    }
  );


  if (
    data.code !== 1 ||
    !data.data
  ) {

    throw new Error(
      "FebBox share request failed"
    );
  }


  /*
   * Some responses may provide the
   * share key directly.
   */

  const directShareKey =
    data.data.share_key ||
    data.data.shareKey ||
    data.data.key;


  if (
    directShareKey
  ) {

    const shareKey =
      String(
        directShareKey
      ).trim();


    if (!shareKey) {

      throw new Error(
        "FebBox share key missing"
      );
    }


    console.log(
      "[ShowBox] FebBox share key:",
      {
        length:
          shareKey.length
      }
    );


    return shareKey;
  }


  /*
   * Normal response:
   * extract the key from the share URL.
   */

  const shareLink =
    data.data.shareLink ||
    data.data.share_link;


  if (!shareLink) {

    throw new Error(
      "FebBox share link missing"
    );
  }


  const shareKey =
    String(
      shareLink
    )
      .replace(
        /\/+$/,
        ""
      )
      .split("/")
      .pop();


  if (!shareKey) {

    throw new Error(
      "FebBox share key missing"
    );
  }


  console.log(
    "[ShowBox] FebBox share key:",
    {
      length:
        shareKey.length
    }
  );


  return shareKey;
}


// =========================================================
// FebBox root file list
// =========================================================

async function febboxFileList(
  shareKey
) {

  const url =
    `${FEBBOX_BASE_URL}/file/file_share_list` +
    `?share_key=${encodeURIComponent(shareKey)}`;


  const response =
    await fetch(
      url,
      {
        headers:
          FEBBOX_HEADERS
      }
    );


  const text =
    await response.text();


  console.log(
    "[ShowBox] FebBox file list:",
    {
      status:
        response.status,

      parentId:
        null,

      bodyLength:
        text.length
    }
  );


  if (
    !response.ok
  ) {

    throw new Error(
      `FebBox file list failed: HTTP ${response.status}`
    );
  }


  let data;


  try {

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      "FebBox file list was not JSON"
    );
  }


  const files =
    data?.data?.file_list;


  console.log(
    "[ShowBox] FebBox file list result:",
    {
      code:
        data.code,

      count:
        Array.isArray(files)
          ? files.length
          : 0
    }
  );


  if (
    data.code !== 1 ||
    !Array.isArray(files)
  ) {

    throw new Error(
      "FebBox file list failed"
    );
  }


  return files;
}


// =========================================================
// FebBox season file list
// =========================================================

async function febboxSeasonFileList(
  shareKey,
  seasonFolder
) {

  const url =
    `${FEBBOX_BASE_URL}/file/file_share_list` +
    `?share_key=${encodeURIComponent(shareKey)}` +
    `&parent_id=${encodeURIComponent(seasonFolder.fid)}` +
    `&page=1`;


  const response =
    await fetch(
      url,
      {
        headers:
          FEBBOX_HEADERS
      }
    );


  const text =
    await response.text();


  console.log(
    "[ShowBox] FebBox episode list:",
    {
      status:
        response.status,

      bodyLength:
        text.length
    }
  );


  if (
    !response.ok
  ) {

    throw new Error(
      `FebBox episode list failed: HTTP ${response.status}`
    );
  }


  let data;


  try {

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      "FebBox episode list was not JSON"
    );
  }


  if (
    data.code !== 1 ||
    !data.data ||
    !Array.isArray(
      data.data.file_list
    )
  ) {

    throw new Error(
      "FebBox episode list failed"
    );
  }


  return data.data.file_list;
}


// =========================================================
// Find FebBox files
// =========================================================

async function findFebboxFiles(
  shareKey,
  type,
  season,
  episode
) {

  const rootFiles =
    await febboxFileList(
      shareKey
    );


  // -------------------------------------------------------
  // Movie
  // -------------------------------------------------------

  if (
    type === "movie"
  ) {

    const files =
      rootFiles.filter(
        item =>
          item &&
          item.fid &&
          item.file_name
      );


    console.log(
      "[ShowBox] Movie files found:",
      files.map(
        file => ({
          name:
            file.file_name,

          fid:
            file.fid
        })
      )
    );


    if (!files.length) {

      throw new Error(
        "Movie file not found"
      );
    }


    return files;
  }


  // -------------------------------------------------------
  // Series season
  // -------------------------------------------------------

  const seasonFolder =
    rootFiles.find(
      item => {

        if (
          !item?.file_name ||
          !item?.fid
        ) {
          return false;
        }

        const name =
          String(item.file_name)
            .trim()
            .toLowerCase();

        return (
          new RegExp(
            `^season[ ._-]*0*${season}$`,
            "i"
          ).test(name) ||
          new RegExp(
            `^s0*${season}$`,
            "i"
          ).test(name)
        );
      }
    );


  if (!seasonFolder) {

    throw new Error(
      `Season folder not found: Season ${season}`
    );
  }


  console.log(
    "[ShowBox] FebBox season folder:",
    {
      name:
        seasonFolder.file_name,

      fid:
        seasonFolder.fid
    }
  );


  const files =
    await febboxSeasonFileList(
      shareKey,
      seasonFolder
    );


  const s =
    String(season);

  const e =
    String(episode);


  /*
   * Matches:
   *
   * S01E02
   * S1E2
   * S01.E02
   * S01-E02
   * S01_E02
   * 1x02
   * 1x2
   * Season 1 Episode 2
   * Season 01 Episode 02
   */

  const episodePattern =
    new RegExp(
      [
        `\\bs0*${s}[ ._-]*e0*${e}\\b`,
        `\\b${s}[ ._-]*x0*${e}\\b`,
        `\\bseason[ ._-]*0*${s}[ ._-]*episode[ ._-]*0*${e}\\b`
      ].join("|"),
      "i"
    );


  const matchingFiles =
    files.filter(
      item => {

        if (
          !item?.file_name ||
          !item?.fid
        ) {
          return false;
        }


        return episodePattern.test(
          String(item.file_name)
        );
      }
    );


  console.log(
    "[ShowBox] Episode files found:",
    matchingFiles.map(
      file => ({
        name:
          file.file_name,

        fid:
          file.fid
      })
    )
  );


  if (
    !matchingFiles.length
  ) {

    throw new Error(
      `Episode not found: S${season}E${episode}`
    );
  }


  return matchingFiles;


// =========================================================
// FebBox quality / playback links
// =========================================================

async function febboxQualityList(
  file,
  shareKey,
  token
) {

  if (
    !file?.fid
  ) {

    throw new Error(
      "FebBox file ID missing"
    );
  }


  if (!token) {

    throw new Error(
      "FebBox UI token missing"
    );
  }


  /*
   * The config normally supplies the value
   * used as the FebBox "ui" cookie.
   */

  const cookieHeader =
    String(token)
      .startsWith("ui=")
      ? String(token)
      : `ui=${token}`;


  console.log(
    "[ShowBox] Token diagnostics:",
    {
      length:
        String(token).length,

      startsWithUi:
        String(token).startsWith("ui="),

      startsWithJwt:
        String(token).startsWith("eyJ"),

      cookieLength:
        cookieHeader.length
    }
  );


  /*
   * IMPORTANT:
   *
   * Keep the original FebBox endpoint from
   * your backup.
   *
   * This is NOT the /mbp/file/detail endpoint
   * that returned 404 in the newer version.
   */

  const qualityUrl =
    `${FEBBOX_BASE_URL}/console/video_quality_list` +
    `?fid=${encodeURIComponent(file.fid)}` +
    `&share_key=${encodeURIComponent(shareKey)}`;


  console.log(
    "[ShowBox] FebBox quality request:",
    {
      fid:
        file.fid
    }
  );


  const response =
    await fetch(
      qualityUrl,
      {
        headers: {

          ...FEBBOX_HEADERS,

          Cookie:
            cookieHeader,

          Referer:
            `${FEBBOX_BASE_URL}/`

        }
      }
    );


  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  const finalUrl =
    response.url;


  const text =
    await response.text();


  console.log(
    "[ShowBox] FebBox quality response:",
    {
      status:
        response.status,

      contentType,

      bodyLength:
        text.length,

      finalUrl
    }
  );


  let data = null;


  try {

    data =
      JSON.parse(text);


    console.log(
      "[ShowBox] FebBox quality JSON:",
      JSON.stringify(
        data
      )
    );

  } catch {

    data = null;
  }


  /*
   * Handle JSON responses containing HTML.
   */

  if (
    data?.html
  ) {

    return parseFebboxHtml(
      data.html,
      file
    );
  }


  if (
    data?.data?.html
  ) {

    return parseFebboxHtml(
      data.data.html,
      file
    );
  }


  if (
    data?.data?.content
  ) {

    return parseFebboxHtml(
      data.data.content,
      file
    );
  }


  /*
   * Some responses return the HTML directly.
   */

  if (
    /file_quality/i.test(
      text
    )
  ) {

    return parseFebboxHtml(
      text,
      file
    );
  }


  throw new Error(
    "FebBox quality response missing HTML"
  );
}


// =========================================================
// Parse FebBox quality HTML
// =========================================================

function parseFebboxHtml(
  html,
  file
) {

  if (!html) {
    return [];
  }


  const streams = [];


  /*
   * The quality list uses file_quality
   * blocks with data-url attributes.
   */

  const blocks =
    html.split(
      /(?=<div[^>]*class=["'][^"']*file_quality[^"']*["'][^>]*>)/i
    );


  for (
    const block of blocks
  ) {

    if (
      !/file_quality/i.test(
        block
      )
    ) {

      continue;
    }


    const urlMatch =
      block.match(
        /data-url=["']([^"']+)["']/i
      );


    if (
      !urlMatch?.[1]
    ) {

      continue;
    }


    const qualityMatch =
      block.match(
        /data-quality=["']([^"']+)["']/i
      );


    const sizeMatch =
      block.match(
        /class=["'][^"']*\bsize\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
      );


    const streamUrl =
      decodeHtmlEntities(
        urlMatch[1]
      );


    const rawQuality =
      qualityMatch?.[1] ||
      "";


    const quality =
      getQualityLabel(
        rawQuality,
        file.file_name
      );


    const size =
      sizeMatch
        ? stripHtml(
            sizeMatch[1]
          )
        : "";


    streams.push({

      url:
        streamUrl,

      quality,

      rawQuality,

      size,

      fileName:
        file.file_name ||
        "",

      sourceFile:
        file

    });
  }


  /*
   * Fallback for a slightly different
   * FebBox HTML representation.
   */

  if (
    !streams.length
  ) {

    const dataUrlPattern =
      /data-url=["']([^"']+)["']/gi;


    let match;


    while (
      (match =
        dataUrlPattern.exec(
          html
        )) !== null
    ) {

      const streamUrl =
        decodeHtmlEntities(
          match[1]
        );


      if (
        !/^https?:\/\//i.test(
          streamUrl
        )
      ) {

        continue;
      }


      streams.push({

        url:
          streamUrl,

        quality:
          getQualityLabel(
            "",
            file.file_name
          ),

        rawQuality:
          "",

        size:
          "",

        fileName:
          file.file_name ||
          "",

        sourceFile:
          file

      });
    }
  }


  console.log(
    "[ShowBox] Parsed FebBox qualities:",
    streams.length
  );


  return streams;
}


// =========================================================
// Quality helpers
// =========================================================

const DEFAULT_QUALITIES = [
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];


function getQualityLabel(
  quality,
  fileName
) {

  const value =
    String(
      quality ||
      fileName ||
      ""
    )
      .toLowerCase();


  if (
    /\b2160p?\b/.test(value) ||
    /\b4k\b/.test(value)
  ) {

    return "4K";
  }


  if (
    /\b1440p?\b/.test(value)
  ) {

    return "1440p";
  }


  if (
    /\b1080p?\b/.test(value)
  ) {

    return "1080p";
  }


  if (
    /\b720p?\b/.test(value)
  ) {

    return "720p";
  }


  if (
    /\b480p?\b/.test(value)
  ) {

    return "480p";
  }


  if (
    /\b360p?\b/.test(value)
  ) {

    return "360p";
  }


  if (
    String(quality)
      .toUpperCase()
      === "ORG"
  ) {

    return "ORG";
  }


  return quality || "ORG";
}


function getCanonicalQuality(
  value
) {

  const text =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    text === "org" ||
    text === "original"
  ) {

    return "ORG";
  }


  if (
    text === "4k" ||
    text === "2160" ||
    text === "2160p"
  ) {

    return "4K";
  }


  if (
    text === "1440" ||
    text === "1440p"
  ) {

    return "1440p";
  }


  if (
    text === "1080" ||
    text === "1080p"
  ) {

    return "1080p";
  }


  if (
    text === "720" ||
    text === "720p"
  ) {

    return "720p";
  }


  if (
    text === "480" ||
    text === "480p"
  ) {

    return "480p";
  }


  if (
    text === "360" ||
    text === "360p"
  ) {

    return "360p";
  }


  return null;
}


function getStreamQuality(
  stream
) {

  if (!stream) {
    return "";
  }


  const direct =
    getCanonicalQuality(
      stream.quality
    );


  if (direct) {
    return direct;
  }


  return getCanonicalQuality(
    stream.name
  ) || "";
}


// =========================================================
// Quality configuration
// =========================================================

function normalizeQualityConfig(
  config
) {

  if (
    !Array.isArray(
      config?.qualities
    )
  ) {

    return {

      enabled:
        new Set(
          DEFAULT_QUALITIES
        ),

      priority:
        DEFAULT_QUALITIES.slice(),

      configured:
        false
    };
  }


  const enabled =
    new Set();


  const priority = [];


  for (
    const item of config.qualities
  ) {

    if (
      !item ||
      !item.name
    ) {

      continue;
    }


    const quality =
      getCanonicalQuality(
        item.name
      );


    if (!quality) {
      continue;
    }


    if (
      !priority.includes(
        quality
      )
    ) {

      priority.push(
        quality
      );
    }


    if (
      item.enabled === true
    ) {

      enabled.add(
        quality
      );
    }
  }


  /*
   * Preserve the normal quality ordering
   * for anything omitted from priority.
   */

  for (
    const quality of DEFAULT_QUALITIES
  ) {

    if (
      !priority.includes(
        quality
      )
    ) {

      priority.push(
        quality
      );
    }
  }


  return {

    enabled,

    priority,

    configured:
      true
  };
}


function applyQualitySettings(
  streams,
  config
) {

  if (
    !Array.isArray(
      streams
    )
  ) {

    return [];
  }


  const settings =
    normalizeQualityConfig(
      config
    );


  /*
   * Old configs without a quality array
   * keep every stream.
   */

  if (
    !settings.configured
  ) {

    return streams;
  }


  const filtered =
    streams.filter(
      stream => {

        const quality =
          getStreamQuality(
            stream
          );


        /*
         * Unknown quality is retained.
         */

        if (!quality) {
          return true;
        }


        return settings.enabled.has(
          quality
        );
      }
    );


  filtered.sort(
    (a, b) => {

      const qa =
        getStreamQuality(a);


      const qb =
        getStreamQuality(b);


      const ia =
        qa
          ? settings.priority.indexOf(
              qa
            )
          : Infinity;


      const ib =
        qb
          ? settings.priority.indexOf(
              qb
            )
          : Infinity;


      return ia - ib;
    }
  );


  console.log(
    "[ShowBox] Quality settings:",
    {

      enabled:
        Array.from(
          settings.enabled
        ),

      before:
        streams.length,

      after:
        filtered.length
    }
  );


  return filtered;
}


// =========================================================
// Stream filter configuration
// =========================================================

const DEFAULT_STREAM_FILTERS = {
  cam: true
};


function normalizeStreamFilterConfig(
  config
) {

  const filters =
    config?.filters;


  if (
    !filters ||
    typeof filters !== "object"
  ) {

    return {
      ...DEFAULT_STREAM_FILTERS
    };
  }


  return {

    cam:
      filters.cam !== false

  };
}


function isCamOrTelecine(fileName) {
  const text = String(fileName || "").toUpperCase();

  return (
    /\bTELECINE\b/.test(text) ||
    /\bTELESYNC\b/.test(text) ||
    /\bCAMRIP\b/.test(text) ||
    /\bCAM\b/.test(text)
  );
}


function applyStreamFilters(
  qualityResults,
  config
) {

  const filters =
    normalizeStreamFilterConfig(
      config
    );


  const filtered =
    qualityResults.filter(
      item => {

        const fileName =
          item.fileName ||
          item.sourceFile?.file_name ||
          "";


        if (
          !filters.cam &&
          isCamOrTelecine(
            fileName
          )
        ) {

          return false;
        }


        return true;
      }
    );


  console.log(
    "[ShowBox] Stream filters:",
    {

      cam:
        filters.cam,

      before:
        qualityResults.length,

      after:
        filtered.length
    }
  );


  return filtered;
}


// =========================================================
// File-size configuration
// =========================================================

function parseSizeGb(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;
  }


  const text =
    String(value)
      .trim()
      .replace(
        /,/g,
        ""
      )
      .toUpperCase();


  if (!text) {
    return null;
  }


  const match =
    text.match(
      /([\d.]+)\s*(TB|GB|MB|KB|B)\b/
    );


  if (!match) {
    return null;
  }


  const number =
    Number(
      match[1]
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return null;
  }


  switch (
    match[2]
  ) {

    case "TB":
      return number * 1024;

    case "GB":
      return number;

    case "MB":
      return number / 1024;

    case "KB":
      return number /
        (1024 * 1024);

    case "B":
      return number /
        (1024 * 1024 * 1024);

    default:
      return null;
  }
}


function applyFileSizeSettings(
  streams,
  config
) {

  const fileSize =
    config?.fileSize;


  if (
    !fileSize ||
    (
      fileSize.minGb === null &&
      fileSize.maxGb === null
    )
  ) {

    return streams;
  }


  const minGb =
    Number.isFinite(
      Number(
        fileSize.minGb
      )
    )
      ? Number(
          fileSize.minGb
        )
      : null;


  const maxGb =
    Number.isFinite(
      Number(
        fileSize.maxGb
      )
    )
      ? Number(
          fileSize.maxGb
        )
      : null;


  if (
    minGb === null &&
    maxGb === null
  ) {

    return streams;
  }


  const filtered =
    streams.filter(
      stream => {

        const sizeGb =
          parseSizeGb(
            stream.size
          );


        /*
         * Keep streams if FebBox did not
         * provide a parseable size.
         */

        if (
          sizeGb === null
        ) {

          return true;
        }


        if (
          minGb !== null &&
          sizeGb < minGb
        ) {

          return false;
        }


        if (
          maxGb !== null &&
          sizeGb > maxGb
        ) {

          return false;
        }


        return true;
      }
    );


  console.log(
    "[ShowBox] File-size settings:",
    {

      minGb,

      maxGb,

      before:
        streams.length,

      after:
        filtered.length
    }
  );


  return filtered;
}


// =========================================================
// Technical metadata
// =========================================================

function cleanFilename(
  value
) {

  return String(
    value || ""
  )
    .replace(
      /\.[a-z0-9]{2,5}$/i,
      ""
    )
    .replace(
      /[_]+/g,
      " "
    );
}


function getTechnicalMetadata(
  fileName
) {

  const upper =
    cleanFilename(
      fileName
    )
      .toUpperCase();


  const result = [];


  // -------------------------------------------------------
  // Source
  // -------------------------------------------------------

  if (
    /\bWEB[- .]?DL\b/.test(
      upper
    ) ||
    /\bWEBDL\b/.test(
      upper
    )
  ) {

    result.push(
      "WEB-DL"
    );

  } else if (
    /\bWEB[- .]?RIP\b/.test(
      upper
    ) ||
    /\bWEBRIP\b/.test(
      upper
    )
  ) {

    result.push(
      "WEB-RIP"
    );

  } else if (
    /\bBLU[- .]?RAY\b/.test(
      upper
    ) ||
    /\bBLURAY\b/.test(
      upper
    )
  ) {

    result.push(
      "BluRay"
    );

  } else if (
    /\bBDRIP\b/.test(
      upper
    )
  ) {

    result.push(
      "BDRip"
    );

  } else if (
    /\bTELECINE\b/.test(
      upper
    )
  ) {

    result.push(
      "TELECINE"
    );

  } else if (
    /\bTELESYNC\b/.test(
      upper
    )
  ) {

    result.push(
      "TELESYNC"
    );

  } else if (
    /\bCAMRIP\b/.test(
      upper
    ) ||
    /\bCAM\b/.test(
      upper
    )
  ) {

    result.push(
      "CAM"
    );
  }


  // -------------------------------------------------------
  // HDR
  // -------------------------------------------------------

  if (
    /\bDOLBY[ ._-]?VISION\b/.test(
      upper
    ) ||
    /\bDV\b/.test(
      upper
    )
  ) {

    result.push(
      "DV"
    );
  }


  if (
    /\bHDR10\+\b/.test(
      upper
    ) ||
    /\bHDR10PLUS\b/.test(
      upper
    )
  ) {

    result.push(
      "HDR10+"
    );
  }


  if (
    /\bHDR10\b/.test(
      upper
    )
  ) {

    result.push(
      "HDR10"
    );
  }


  if (
    /\bHDR\b/.test(
      upper
    ) &&
    !result.includes(
      "HDR10"
    ) &&
    !result.includes(
      "HDR10+"
    ) &&
    !result.includes(
      "DV"
    )
  ) {

    result.push(
      "HDR"
    );
  }


  if (
    /\bHLG\b/.test(
      upper
    )
  ) {

    result.push(
      "HLG"
    );
  }


  // -------------------------------------------------------
  // Audio
  // -------------------------------------------------------

  if (
    /\bATMOS\b/.test(
      upper
    )
  ) {

    result.push(
      "Atmos"
    );
  }


  if (
    /\bDDP[ ._-]?7[ ._-]?1\b/.test(
      upper
    )
  ) {

    result.push(
      "DDP7.1"
    );

  } else if (
    /\bDDP[ ._-]?5[ ._-]?1\b/.test(
      upper
    )
  ) {

    result.push(
      "DDP5.1"
    );

  } else if (
    /\bDD[ ._-]?5[ ._-]?1\b/.test(
      upper
    )
  ) {

    result.push(
      "DD5.1"
    );

  } else if (
    /\bDTS(?:[- .]?(?:HD|X))?\b/.test(
      upper
    )
  ) {

    result.push(
      "DTS"
    );

  } else if (
    /\bAAC\b/.test(
      upper
    )
  ) {

    result.push(
      "AAC"
    );
  }


  // -------------------------------------------------------
  // Codec
  // -------------------------------------------------------

  if (
    /\bHEVC\b/.test(
      upper
    ) ||
    /\bH[ ._-]?265\b/.test(
      upper
    ) ||
    /\bX265\b/.test(
      upper
    )
  ) {

    result.push(
      "H.265"
    );

  } else if (
    /\bAVC\b/.test(
      upper
    ) ||
    /\bH[ ._-]?264\b/.test(
      upper
    ) ||
    /\bX264\b/.test(
      upper
    )
  ) {

    result.push(
      "H.264"
    );

  } else if (
    /\bAV1\b/.test(
      upper
    )
  ) {

    result.push(
      "AV1"
    );
  }


  return result;
}


// =========================================================
// Language metadata
// =========================================================

function normalizeLanguageValue(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return [];
  }


  if (
    Array.isArray(value)
  ) {

    return value.flatMap(
      item =>
        normalizeLanguageValue(
          item
        )
    );
  }


  if (
    typeof value === "object"
  ) {

    return [
      value.name,
      value.language,
      value.lang,
      value.iso_639_1
    ]
      .filter(Boolean)
      .flatMap(
        item =>
          normalizeLanguageValue(
            item
          )
      );
  }


  return String(value)
    .split(
      /[,|/]+/
    )
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);
}


function getLanguagesFromObject(
  object,
  keys
) {

  if (
    !object ||
    typeof object !== "object"
  ) {

    return [];
  }


  for (
    const key of keys
  ) {

    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {

      const values =
        normalizeLanguageValue(
          object[key]
        );


      if (
        values.length
      ) {

        return values;
      }
    }
  }


  return [];
}


function getLanguagesFromFilename(
  fileName
) {

  const text =
    String(
      fileName || ""
    )
      .toLowerCase();


  const languages = [];


  const known = [

    ["english", "English"],
    ["eng", "English"],

    ["spanish", "Spanish"],
    ["spa", "Spanish"],
    ["español", "Spanish"],

    ["french", "French"],
    ["fra", "French"],
    ["fre", "French"],

    ["german", "German"],
    ["deu", "German"],
    ["ger", "German"],

    ["italian", "Italian"],
    ["ita", "Italian"],

    ["portuguese", "Portuguese"],
    ["por", "Portuguese"],

    ["japanese", "Japanese"],
    ["jpn", "Japanese"],

    ["korean", "Korean"],
    ["kor", "Korean"],

    ["hindi", "Hindi"],
    ["hin", "Hindi"],

    ["tamil", "Tamil"],
    ["telugu", "Telugu"],
    ["malayalam", "Malayalam"],
    ["marathi", "Marathi"],

    ["arabic", "Arabic"],

    ["russian", "Russian"],
    ["rus", "Russian"]
  ];


  for (
    const [
      token,
      label
    ] of known
  ) {

    const regex =
      new RegExp(
        `(?:^|[ ._\\-()])${token}(?:$|[ ._\\-()])`,
        "i"
      );


    if (
      regex.test(text) &&
      !languages.includes(
        label
      )
    ) {

      languages.push(
        label
      );
    }
  }


  return languages;
}


function getAudioLanguages(
  item
) {

  const object =
    item?.sourceFile ||
    item;


  const explicit =
    getLanguagesFromObject(
      object,
      [
        "audio",
        "audio_language",
        "audioLanguage",
        "audio_languages",
        "audioLanguages",
        "language",
        "languages",
        "lang"
      ]
    );


  if (
    explicit.length
  ) {

    return explicit;
  }


  return getLanguagesFromFilename(
    item?.fileName
  );
}


function getSubtitleLanguages(
  item
) {

  const object =
    item?.sourceFile ||
    item;


  const explicit =
    getLanguagesFromObject(
      object,
      [
        "subtitle",
        "subtitles",
        "subtitle_language",
        "subtitleLanguage",
        "subtitle_languages",
        "subtitleLanguages",
        "caption",
        "captions"
      ]
    );


  if (
    explicit.length
  ) {

    return explicit;
  }


  const text =
    String(
      item?.fileName || ""
    )
      .toLowerCase();


  if (
    /\bno[\s._-]?subs?\b/.test(
      text
    ) ||
    /\bnosub\b/.test(
      text
    ) ||
    /\bwithout[\s._-]?subs?\b/.test(
      text
    )
  ) {

    return [
      "No included subtitles"
    ];
  }


  return getLanguagesFromFilename(
    item?.fileName
  );
}

// =========================================================
// Stream title
// =========================================================

function buildStreamTitle(
  item,
  type,
  season,
  episode
) {

  const lines = [];


  if (
    type === "series" &&
    Number.isFinite(season) &&
    Number.isFinite(episode)
  ) {

    lines.push(
      `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
    );
  }


  const technical =
    [
      getQualityLabel(
        item.quality,
        item.fileName
      ),

      ...getTechnicalMetadata(
        item.fileName
      )
    ]
      .filter(Boolean)
      .filter(
        (value, index, array) =>
          array.indexOf(value) === index
      );


  if (
    technical.length
  ) {

    lines.push(
      technical.join(
        " • "
      )
    );
  }


  if (
    item.size
  ) {

    lines.push(
      item.size
    );
  }


  const audioLanguages =
    getAudioLanguages(
      item
    );


  if (
    audioLanguages.length
  ) {

    lines.push(
      `Audio: ${audioLanguages.join(", ")}`
    );
  }


  const subtitleLanguages =
    getSubtitleLanguages(
      item
    );


  if (
    subtitleLanguages.length
  ) {

    lines.push(
      `Subtitles: ${subtitleLanguages.join(", ")}`
    );
  }


  return lines.join(
    "\n"
  );
}


// =========================================================
// Build Stremio streams
// =========================================================

function buildFebboxStreams(
  qualityResults,
  type,
  season,
  episode
) {

  return qualityResults
    .filter(
      item =>
        item &&
        item.url
    )
    .map(
      item => {

        const quality =
          getQualityLabel(
            item.quality,
            item.fileName
          ) ||
          "ShowBox";


        return {

          name:
            quality,

          title:
            buildStreamTitle(
              item,
              type,
              season,
              episode
            ),

          url:
            item.url,

          size:
            item.size,

          behaviorHints: {

            bingeGroup:
              "showbox",

            filename:
              item.fileName ||
              undefined

          },

          headers: {

            Accept:
              "*/*",

            "Accept-Language":
              "en-US,en;q=0.8",

            Connection:
              "keep-alive",

            Range:
              "bytes=0-",

            Referer:
              `${FEBBOX_BASE_URL}/`,

            "User-Agent":
              FEBBOX_HEADERS["User-Agent"]
          }
        };
      }
    );
}


// =========================================================
// Remove duplicate streams
// =========================================================

function dedupeStreams(
  streams
) {

  const seen =
    new Set();


  return streams.filter(
    stream => {

      if (
        !stream ||
        !stream.url
      ) {

        return false;
      }


      if (
        seen.has(
          stream.url
        )
      ) {

        return false;
      }


      seen.add(
        stream.url
      );


      return true;
    }
  );
}


// =========================================================
// Main handler
// =========================================================

export default async (
  req,
  context
) => {

  const requestId =
    Math.random()
      .toString(36)
      .slice(2, 8);


  console.log(
    `[ShowBox][${requestId}] ===== START =====`
  );


  try {

    const url =
      new URL(
        req.url
      );


    const pathname =
      url.pathname;


    // -----------------------------------------------------
    // Extract config + stream request
    // -----------------------------------------------------

    const match =
      pathname.match(
        /^\/([^/]+)\/stream\/([^/]+)\/(.+)$/
      );


    if (!match) {

      throw new Error(
        "Invalid stream request path"
      );
    }


    const rawConfig =
      match[1];


    const type =
      match[2].toLowerCase();


    let rawId =
      decodeURIComponent(
        match[3]
      );


    rawId =
      rawId.replace(
        /\.json$/,
        ""
      );


    console.log(
      `[ShowBox][${requestId}] Request:`,
      {
        type,
        rawId
      }
    );


    // -----------------------------------------------------
    // Validate stream type
    // -----------------------------------------------------

    if (
      type !== "movie" &&
      type !== "series"
    ) {

      throw new Error(
        `Unsupported stream type: ${type}`
      );
    }


    // -----------------------------------------------------
    // Parse config
    // -----------------------------------------------------

    const config =
      parseConfig(
        rawConfig
      );


    console.log(
      `[ShowBox][${requestId}] Parsed config:`,
      {
        hasUiToken:
          !!config.uiToken,

        qualities:
          Array.isArray(
            config.qualities
          )
            ? config.qualities.length
            : 0,

        fileSize:
          config.fileSize ||
          null,

        filters:
          config.filters ||
          null
      }
    );


    const rawToken =
      config.uiToken ||
      config.token ||
      "";


    if (!rawToken) {

      throw new Error(
        "No ShowBox/FebBox UI token configured"
      );
    }


    const parsedToken =
      parseSingleToken(
        rawToken
      );


    if (!parsedToken) {

      throw new Error(
        "ShowBox/FebBox UI token could not be parsed"
      );
    }


    console.log(
      `[ShowBox][${requestId}] Token ready:`,
      {
        length:
          String(parsedToken).length,

        extracted:
          String(parsedToken) !==
          String(rawToken)
      }
    );


    // -----------------------------------------------------
    // Parse IMDb / season / episode
    // -----------------------------------------------------

    let imdbId;

    let season;

    let episode;


    if (
      type === "series"
    ) {

      const parts =
        rawId.split(":");


      if (
        parts.length !== 3
      ) {

        throw new Error(
          `Invalid series ID: ${rawId}`
        );
      }


      imdbId =
        parts[0];


      season =
        Number(
          parts[1]
        );


      episode =
        Number(
          parts[2]
        );


      if (
        !/^tt\d+$/i.test(
          imdbId
        ) ||
        !Number.isInteger(
          season
        ) ||
        season < 1 ||
        !Number.isInteger(
          episode
        ) ||
        episode < 1
      ) {

        throw new Error(
          `Invalid series ID: ${rawId}`
        );
      }


      console.log(
        `[ShowBox][${requestId}] Parsed series:`,
        {
          imdbId,
          season,
          episode
        }
      );

    } else {

      imdbId =
        rawId;


      if (
        !/^tt\d+$/i.test(
          imdbId
        )
      ) {

        throw new Error(
          `Invalid IMDb ID: ${imdbId}`
        );
      }


      console.log(
        `[ShowBox][${requestId}] Parsed movie:`,
        {
          imdbId
        }
      );
    }


    // -----------------------------------------------------
    // IMDb -> ShowBox
    // -----------------------------------------------------

    /*
     * IMPORTANT:
     *
     * No TMDB conversion.
     *
     * The lookup chain is:
     *
     * IMDb ID
     *   ↓
     * ShowBox search
     *   ↓
     * FIRST result
     *   ↓
     * ShowBox detail page
     *   ↓
     * ShowBox media ID
     */

    console.log(
      `[ShowBox][${requestId}] IMDb:`,
      imdbId
    );


    const showboxId =
      await searchShowBoxMediaId(
        imdbId
      );


    if (!showboxId) {

      throw new Error(
        "ShowBox media ID missing"
      );
    }


    console.log(
      `[ShowBox][${requestId}] ShowBox ID:`,
      showboxId
    );


    // -----------------------------------------------------
    // ShowBox -> FebBox share
    // -----------------------------------------------------

    const shareKey =
      await febboxShare(
        showboxId,
        type
      );


    if (!shareKey) {

      throw new Error(
        "FebBox share key missing"
      );
    }


    // -----------------------------------------------------
    // Find matching FebBox files
    // -----------------------------------------------------

    const files =
      await findFebboxFiles(
        shareKey,
        type,
        season,
        episode
      );


    if (
      !Array.isArray(files) ||
      !files.length
    ) {

      throw new Error(
        "No matching FebBox files found"
      );
    }


    console.log(
      `[ShowBox][${requestId}] Matching files:`,
      files.map(
        file => ({
          name:
            file.file_name,

          fid:
            file.fid
        })
      )
    );


    // -----------------------------------------------------
    // Get quality/playback links
    // -----------------------------------------------------

    const allQualityResults =
      [];


    for (
      const file of files
    ) {

      try {

        const results =
          await febboxQualityList(
            file,
            shareKey,
            parsedToken
          );


        if (
          Array.isArray(
            results
          )
        ) {

          allQualityResults.push(
            ...results
          );
        }


      } catch (error) {

        console.log(
          `[ShowBox][${requestId}] FebBox file failed:`,
          {
            file:
              file.file_name,

            fid:
              file.fid,

            error:
              error.message
          }
        );
      }
    }


    console.log(
      `[ShowBox][${requestId}] Quality results before filters:`,
      allQualityResults.length
    );


    // -----------------------------------------------------
    // Apply CAM / Telecine filter
    // -----------------------------------------------------

    const filteredQualityResults =
      applyStreamFilters(
        allQualityResults,
        config
      );


    // -----------------------------------------------------
    // Build FebBox streams
    // -----------------------------------------------------

    const febboxStreams =
      buildFebboxStreams(
        filteredQualityResults,
        type,
        season,
        episode
      );


    // -----------------------------------------------------
    // Deduplicate
    // -----------------------------------------------------

    const streams =
      dedupeStreams(
        febboxStreams
      );


    // -----------------------------------------------------
    // Quality filtering
    // -----------------------------------------------------

    const qualityFilteredStreams =
      applyQualitySettings(
        streams,
        config
      );


    // -----------------------------------------------------
    // File-size filtering
    // -----------------------------------------------------

    const finalStreams =
      applyFileSizeSettings(
        qualityFilteredStreams,
        config
      );


    console.log(
      `[ShowBox][${requestId}] Stream breakdown:`,
      {

        qualityResults:
          allQualityResults.length,

        afterStreamFilters:
          filteredQualityResults.length,

        febboxStreams:
          febboxStreams.length,

        deduped:
          streams.length,

        afterQuality:
          qualityFilteredStreams.length,

        final:
          finalStreams.length
      }
    );


    console.log(
      `[ShowBox][${requestId}] Final streams:`,
      finalStreams.map(
        stream => ({
          name:
            stream.name,

          title:
            stream.title,

          quality:
            getStreamQuality(
              stream
            ),

          size:
            stream.size
        })
      )
    );


    console.log(
      `[ShowBox][${requestId}] ===== END =====`
    );


    return new Response(
      JSON.stringify({
        streams:
          finalStreams
      }),
      {
        status:
          200,

        headers: {

          "Content-Type":
            "application/json",

          "Access-Control-Allow-Origin":
            "*",

          "Cache-Control":
            "no-store"
        }
      }
    );


  } catch (error) {

    console.error(
      `[ShowBox][${requestId}] ===== ERROR =====`
    );


    console.error(
      `[ShowBox][${requestId}]`,
      error.message
    );


    console.error(
      `[ShowBox][${requestId}] ===== END ERROR =====`
    );


    return new Response(
      JSON.stringify({
        streams: []
      }),
      {
        status:
          200,

        headers: {

          "Content-Type":
            "application/json",

          "Access-Control-Allow-Origin":
            "*",

          "Cache-Control":
            "no-store"
        }
      }
    );
  }
};


// =========================================================
// Netlify route
// =========================================================

export const config = {

  path:
    "/:config/stream/:type/:id.json"
};
