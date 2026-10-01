import crypto from "node:crypto";

const FLIXCLOUD_BASE = "https://flixcloud.cc";

const REANIME_REFERER = "https://reanime.to/";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const FLIX_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "*/*",
  "Referer": REANIME_REFERER
};

// ---------------------------------------------------------
// SHA256
// ---------------------------------------------------------

function sha256hex(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

// ---------------------------------------------------------
// Base64
// ---------------------------------------------------------

function fromBase64(value) {
  return Buffer.from(value, "base64");
}

// ---------------------------------------------------------
// Generate obfuscated field names
// ---------------------------------------------------------

function generateFields(seed) {
  let e = seed;

  for (let i = 0; i < 3; i++) {
    e = sha256hex(e + i);
  }

  let l = e;

  for (let i = 0; i < 3; i++) {
    l = sha256hex(l + i);
  }

  return {
    keyField:
      "kf_" + e.substring(8, 16),

    ivField:
      "ivf_" + e.substring(16, 24),

    containerName:
      "cd_" + e.substring(24, 32),

    arrayName:
      "ad_" + e.substring(32, 40),

    objectName:
      "od_" + e.substring(40, 48),

    tokenField:
      e.substring(48, 64) +
      "_" +
      e.substring(56, 64),

    keyFrag2Field:
      l.substring(0, 16) +
      "_" +
      l.substring(16, 24)
  };
}

// ---------------------------------------------------------
// Execute embedded WASM
// ---------------------------------------------------------

async function runWasm(
  wasmB64,
  frag1,
  kf2,
  TBytes,
  seedInt
) {
  const wasmBytes = fromBase64(wasmB64);

  const { instance } =
    await WebAssembly.instantiate(wasmBytes);

  const {
    _s,
    _r,
    memory
  } = instance.exports;

  if (
    typeof _s !== "function" ||
    typeof _r !== "function" ||
    !memory
  ) {
    throw new Error(
      "Invalid FlixCloud WASM exports"
    );
  }

  const heap =
    new Uint8Array(memory.buffer);

  const len = frag1.length;

  const y = 1000;
  const v = 1000 + len;
  const T = 1000 + 2 * len;
  const out = 1000 + 3 * len;

  heap.set(frag1, y);
  heap.set(kf2, v);
  heap.set(TBytes, T);

  _s(seedInt);

  _r(
    y,
    v,
    T,
    out,
    len
  );

  return Buffer.from(
    heap.subarray(
      out,
      out + len
    )
  );
}

// ---------------------------------------------------------
// Extract the SSR data object from FlixCloud HTML
// ---------------------------------------------------------

function extractSsrObject(html) {
  const marker =
    html.match(
      /\{type:"data",data:(\{)/
    );

  if (!marker) {
    throw new Error(
      "FlixCloud SSR data block not found"
    );
  }

  const start =
    html.indexOf(
      "{",
      marker.index +
        marker[0].length -
        1
    );

  let depth = 0;

  for (
    let i = start;
    i < html.length;
    i++
  ) {
    if (html[i] === "{") {
      depth++;
    } else if (html[i] === "}") {
      depth--;

      if (depth === 0) {
        return html.slice(
          start,
          i + 1
        );
      }
    }
  }

  throw new Error(
    "FlixCloud SSR brace matching failed"
  );
}

// ---------------------------------------------------------
// Parse the JavaScript object embedded in SSR HTML
// ---------------------------------------------------------

function parseSsrData(html) {
  const objectText =
    extractSsrObject(html);

  /*
   * FlixCloud's SSR object is JavaScript
   * rather than strict JSON.
   *
   * It is obtained directly from the FlixCloud
   * embed response, so evaluate only this extracted
   * object and not the entire HTML document.
   */

  try {
    return Function(
      `"use strict"; return (${objectText});`
    )();
  } catch (error) {
    throw new Error(
      `Failed to parse FlixCloud SSR data: ${error.message}`
    );
  }
}

// ---------------------------------------------------------
// Fetch JSON from FlixCloud
// ---------------------------------------------------------

async function fetchFlixJson(
  url,
  headers = {}
) {
  const response = await fetch(
    url,
    {
      headers: {
        "User-Agent":
          USER_AGENT,
        ...headers
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `FlixCloud HTTP ${response.status}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------
// Decrypt a FlixCloud embed page
// ---------------------------------------------------------

export async function resolveFlixCloud(
  embedUrl
) {
  console.log(
    `[FlixCloud] Resolving: ${embedUrl}`
  );

  const match =
    String(embedUrl).match(
      /\/e\/([^?#\s]+)(?:\?v=(\d+))?/i
    );

  if (!match) {
    throw new Error(
      "Invalid FlixCloud embed URL"
    );
  }

  const accessId = match[1];

  // IMPORTANT:
  // Preserve ?v=1 / ?v=2.
  const version =
    Number(match[2]) || 2;

  console.log(
    `[FlixCloud] Access ID: ${accessId}, version: ${version}`
  );

  const embedUrlWithVersion =
    `${FLIXCLOUD_BASE}/e/${accessId}?v=${version}`;

  // -------------------------------------------------------
  // Fetch embed page
  // -------------------------------------------------------

  const embedResponse =
    await fetch(
      embedUrlWithVersion,
      {
        headers: {
          ...FLIX_HEADERS,
          "Accept": "text/html,application/xhtml+xml"
        }
      }
    );

  if (!embedResponse.ok) {
    throw new Error(
      `FlixCloud embed HTTP ${embedResponse.status}`
    );
  }

  const html =
    await embedResponse.text();

  console.log(
    `[FlixCloud] Embed received: ${html.length} bytes`
  );

  // -------------------------------------------------------
  // Parse obfuscated data
  // -------------------------------------------------------

  const data =
    parseSsrData(html);

  const seed =
    data.obfuscation_seed;

  if (!seed) {
    throw new Error(
      "FlixCloud obfuscation seed missing"
    );
  }

  const fields =
    generateFields(seed);

  const cryptoData =
    data.obfuscated_crypto_data;

  if (!cryptoData) {
    throw new Error(
      "FlixCloud obfuscated crypto data missing"
    );
  }

  const container =
    cryptoData[
      fields.containerName
    ];

  if (!container) {
    throw new Error(
      "FlixCloud crypto container missing"
    );
  }

  const array =
    container[
      fields.arrayName
    ];

  if (!array || !array[0]) {
    throw new Error(
      "FlixCloud crypto array missing"
    );
  }

  const object =
    array[0][
      fields.objectName
    ];

  if (!object) {
    throw new Error(
      "FlixCloud crypto object missing"
    );
  }

  const frag1 =
    fromBase64(
      object[
        fields.keyField
      ]
    );

  const iv =
    fromBase64(
      object[
        fields.ivField
      ]
    );

  const kf2 =
    fromBase64(
      data[
        fields.keyFrag2Field
      ]
    );

  const token =
    data[
      fields.tokenField
    ];

  if (!token) {
    throw new Error(
      "FlixCloud token field missing"
    );
  }

  console.log(
    `[FlixCloud] Token obtained successfully`
  );

  // -------------------------------------------------------
  // Get encrypted video/key data
  // -------------------------------------------------------

  const tokenData =
    await fetchFlixJson(
      `${FLIXCLOUD_BASE}/api/m3u8/${token}`,
      {
        Referer:
          REANIME_REFERER
      }
    );

  const videoField =
    sha256hex(
      token + "vid"
    ).substring(0, 10);

  const keyField =
    sha256hex(
      token + "key"
    ).substring(0, 10);

  const videoBytes =
    fromBase64(
      tokenData[videoField]
    );

  const TBytes =
    fromBase64(
      tokenData[keyField]
    );

  if (
    !videoBytes.length ||
    !TBytes.length
  ) {
    throw new Error(
      "FlixCloud token response missing encrypted fields"
    );
  }

  // -------------------------------------------------------
  // WASM key derivation
  // -------------------------------------------------------

  const seedInt =
    parseInt(
      seed.substring(0, 8),
      16
    );

  const wasmOutput =
    await runWasm(
      data.w_payload,
      frag1,
      kf2,
      TBytes,
      seedInt
    );

  // -------------------------------------------------------
  // PBKDF2
  // -------------------------------------------------------

  const pbk =
    crypto.pbkdf2Sync(
      wasmOutput,
      seed,
      1000,
      32,
      "sha256"
    );

  // -------------------------------------------------------
  // XOR with seed
  // -------------------------------------------------------

  const r =
    Buffer.from(pbk);

  for (
    let i = 0;
    i < 32;
    i++
  ) {
    r[i] ^=
      seed.charCodeAt(
        i % seed.length
      );
  }

  // -------------------------------------------------------
  // AES-256-CBC
  // -------------------------------------------------------

  const aesKey =
    crypto
      .createHash("sha256")
      .update(r)
      .digest();

  const decipher =
    crypto.createDecipheriv(
      "aes-256-cbc",
      aesKey,
      iv
    );

  const decrypted =
    Buffer.concat([
      decipher.update(
        videoBytes
      ),
      decipher.final()
    ]);

  const streamUrl =
    decrypted
      .toString("utf8")
      .trim();

  if (
    !streamUrl.startsWith("http")
  ) {
    throw new Error(
      `Invalid decrypted stream URL`
    );
  }

  console.log(
    `[FlixCloud] Successfully decrypted HLS stream`
  );

  return {
    url: streamUrl,

    subtitles:
      data.subtitles || [],

    thumbnailsVtt:
      data.thumbnails_vtt || null,

    videoTitle:
      data.video_title || null,

    introChapter:
      data.intro_chapter || null,

    outroChapter:
      data.outro_chapter || null,

    videoId:
      data.video_id || null,

    version
  };
}
