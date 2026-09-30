import { getConfig } from "./config-store.js";
import { getStreams as getFebboxStreams } from "./providers/febbox.js";
import { getStore } from "@netlify/blobs";

const STREAM_CACHE_STORE = "showbox-stream-cache";
const STREAM_CACHE_TTL_MS = 2 * 60 * 1000;

function getStreamCacheStore() {
  return getStore({
    name: STREAM_CACHE_STORE,
    consistency: "strong"
  });
}

function getConfigCacheKey(config) {
  return JSON.stringify({
    qualities: config?.qualities ?? null,
    fileSize: config?.fileSize ?? null,
    filters: config?.filters ?? null
  });
}

function getStreamCacheKey(
  rawConfig,
  type,
  imdbId,
  season,
  episode,
  config
) {
  return [
    rawConfig,
    type,
    imdbId,
    season ?? "",
    episode ?? "",
    getConfigCacheKey(config)
  ].join("|");
}

async function getCachedStreams(key) {
  const store = getStreamCacheStore();

  const cached = await store.get(key, {
    type: "json",
    consistency: "strong"
  });

  if (!cached || typeof cached !== "object") {
    return null;
  }

  const createdAt = Number(cached.createdAt);

  if (!Number.isFinite(createdAt)) {
    return null;
  }

  if (Date.now() - createdAt >= STREAM_CACHE_TTL_MS) {
    return null;
  }

  if (!Array.isArray(cached.streams)) {
    return null;
  }

  return cached.streams;
}

async function cacheStreams(key, streams) {
  const store = getStreamCacheStore();

  await store.setJSON(key, {
    createdAt: Date.now(),
    streams
  });
}

function decodeBase64Config(value) {
  try {
    const normalized = value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded =
      normalized +
      "=".repeat((4 - (normalized.length % 4)) % 4);

    const decoded = Buffer.from(padded, "base64").toString("utf8");

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function loadConfig(rawConfig) {
  if (
    typeof rawConfig === "string" &&
    /^[a-f0-9]{32}$/i.test(rawConfig)
  ) {
    return await getConfig(rawConfig);
  }

  return decodeBase64Config(rawConfig);
}

const DEFAULT_QUALITIES = [
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];

function getCanonicalQuality(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  if (!text) {
    return "";
  }

  if (
    text === "org" ||
    text === "original"
  ) {
    return "ORG";
  }

  if (
    text === "4k" ||
    text === "2160p" ||
    text === "2160"
  ) {
    return "4K";
  }

  if (
    text === "1440p" ||
    text === "1440"
  ) {
    return "1440p";
  }

  if (
    text === "1080p" ||
    text === "1080"
  ) {
    return "1080p";
  }

  if (
    text === "720p" ||
    text === "720"
  ) {
    return "720p";
  }

  if (
    text === "480p" ||
    text === "480"
  ) {
    return "480p";
  }

  if (
    text === "360p" ||
    text === "360"
  ) {
    return "360p";
  }

  return "";
}

function normalizeQualityConfig(config) {
  if (!Array.isArray(config?.qualities)) {
    return {
      priority: [...DEFAULT_QUALITIES],
      enabled: new Set(DEFAULT_QUALITIES),
      configured: false
    };
  }

  const priority = [];
  const enabled = new Set();

  for (const item of config.qualities) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const quality = getCanonicalQuality(
      item.name
    );

    if (!quality) {
      continue;
    }

    if (!priority.includes(quality)) {
      priority.push(quality);
    }

    if (item.enabled === true) {
      enabled.add(quality);
    }
  }

  for (const quality of DEFAULT_QUALITIES) {
    if (!priority.includes(quality)) {
      priority.push(quality);
    }
  }

  return {
    priority,
    enabled,
    configured: true
  };
}

function getStreamQuality(stream) {
  if (!stream) {
    return "";
  }

  /*
   * Current FebBox provider format:
   *
   * name:
   *   "ShowBox"
   *
   * title:
   *   "Movie Title\n4K • WEB-RIP • H.265"
   *
   * Extract the quality from the first part of the
   * technical metadata line.
   */

  const title = String(stream.title || "");

  const lines = title.split("\n");

  const technicalLine = lines[1] || "";

  const qualityPart =
    technicalLine
      .split("•")[0]
      .trim();

  const quality =
    getCanonicalQuality(qualityPart);

  if (quality) {
    return quality;
  }

  /*
   * Keep compatibility with streams where the quality
   * may already be represented by the stream name.
   */
  const name = String(stream.name || "").trim();

  const nameQuality =
    getCanonicalQuality(name);

  if (nameQuality) {
    return nameQuality;
  }

  return "";
}

function applyQualitySettings(streams, config) {
  const {
    priority,
    enabled
  } = normalizeQualityConfig(config);

  const priorityIndex = new Map(
    priority.map((quality, index) => [
      quality,
      index
    ])
  );

  const filtered = [];

  for (const stream of streams) {
    const quality = getStreamQuality(stream);

    /*
     * Preserve the existing behavior for streams whose
     * quality cannot be detected.
     */
    if (!quality) {
      filtered.push({
        stream,
        order: priority.length
      });

      continue;
    }

    if (!enabled.has(quality)) {
      continue;
    }

    filtered.push({
      stream,
      order:
        priorityIndex.get(quality) ??
        priority.length
    });
  }

  /*
   * Stable grouping:
   *
   * ORG
   * ORG
   * ORG
   * 4K
   * 4K
   * 1080p
   * 1080p
   *
   * The original order of streams inside each quality
   * group is preserved.
   */
  return filtered
    .map((entry, index) => ({
      ...entry,
      originalIndex: index
    }))
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }

      return a.originalIndex - b.originalIndex;
    })
    .map(entry => entry.stream);
}

function normalizeStreamFilters(config) {
  const filters = config?.filters;

  return {
    cam:
      filters &&
      typeof filters === "object" &&
      filters.cam === true
  };
}

function isCamOrTelecine(stream) {
  const text = String(stream?.title || "");

  return /\b(?:TELECINE|TC|TELESYNC|TS|CAMRIP|CAM)\b/i.test(
    text
  );
}

function applyStreamFilters(streams, config) {
  const filters =
    normalizeStreamFilters(config);

  if (filters.cam) {
    return streams;
  }

  return streams.filter(
    stream => !isCamOrTelecine(stream)
  );
}

function parseSizeToGB(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const match = text.match(
    /([\d.]+)\s*(TB|GB|MB|KB|B)\b/i
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = match[2].toUpperCase();

  if (unit === "TB") {
    return amount * 1024;
  }

  if (unit === "GB") {
    return amount;
  }

  if (unit === "MB") {
    return amount / 1024;
  }

  if (unit === "KB") {
    return amount / (1024 * 1024);
  }

  if (unit === "B") {
    return amount / (1024 * 1024 * 1024);
  }

  return null;
}

function applyFileSizeSettings(streams, config) {
  const fileSize = config?.fileSize;

  if (
    !fileSize ||
    typeof fileSize !== "object"
  ) {
    return streams;
  }

  const min =
    fileSize.min !== undefined &&
    fileSize.min !== null &&
    fileSize.min !== ""
      ? Number(fileSize.min)
      : null;

  const max =
    fileSize.max !== undefined &&
    fileSize.max !== null &&
    fileSize.max !== ""
      ? Number(fileSize.max)
      : null;

  if (
    (min === null || !Number.isFinite(min)) &&
    (max === null || !Number.isFinite(max))
  ) {
    return streams;
  }

  return streams.filter(stream => {
    const size = parseSizeToGB(
      stream?.behaviorHints?.filename ||
      stream?.title ||
      stream?.name
    );

    if (size === null) {
      return true;
    }

    if (
      min !== null &&
      Number.isFinite(min) &&
      size < min
    ) {
      return false;
    }

    if (
      max !== null &&
      Number.isFinite(max) &&
      size > max
    ) {
      return false;
    }

    return true;
  });
}

function dedupeStreams(streams) {
  const seen = new Set();
  const result = [];

  for (const stream of streams) {
    const url = String(stream?.url || "");

    if (!url) {
      continue;
    }

    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    result.push(stream);
  }

  return result;
}

function parseRequestPath(request) {
  const url = new URL(request.url);

  const match = url.pathname.match(
    /^\/([^/]+)\/stream\/([^/]+)\/(.+?)(?:\.json)?$/
  );

  if (!match) {
    return null;
  }

  const rawConfig = decodeURIComponent(match[1]);
  const type = decodeURIComponent(match[2]);
  const rawId = decodeURIComponent(match[3]);

  if (!rawConfig || !type || !rawId) {
    return null;
  }

  let imdbId = rawId;
  let season = null;
  let episode = null;

  if (type === "series") {
    const parts = rawId.split(":");

    imdbId = parts[0];

    if (parts.length >= 2) {
      season = Number(parts[1]);
    }

    if (parts.length >= 3) {
      episode = Number(parts[2]);
    }

    if (
      !imdbId ||
      !Number.isInteger(season) ||
      !Number.isInteger(episode)
    ) {
      return null;
    }
  }

  return {
    rawConfig,
    type,
    imdbId,
    season,
    episode
  };
}

export async function handler(request) {
  try {
    const parsed =
      parseRequestPath(request);

    if (!parsed) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        },
        body: JSON.stringify({
          streams: []
        })
      };
    }

    const {
      rawConfig,
      type,
      imdbId,
      season,
      episode
    } = parsed;

    const config =
      await loadConfig(rawConfig);

    if (
      !config ||
      typeof config !== "object" ||
      typeof config.uiToken !== "string" ||
      !config.uiToken
    ) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        },
        body: JSON.stringify({
          streams: []
        })
      };
    }

    const cacheKey =
      getStreamCacheKey(
        rawConfig,
        type,
        imdbId,
        season,
        episode,
        config
      );

    const cached =
      await getCachedStreams(cacheKey);

    if (cached) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer"
        },
        body: JSON.stringify({
          streams: cached
        })
      };
    }

    const providerStreams =
      await getFebboxStreams({
        imdbId,
        type,
        season,
        episode,
        token: config.uiToken,
        config
      });

    let streams = Array.isArray(providerStreams)
      ? providerStreams
      : [];

    streams = dedupeStreams(streams);

    streams = applyStreamFilters(
      streams,
      config
    );

    streams = applyQualitySettings(
      streams,
      config
    );

    streams = applyFileSizeSettings(
      streams,
      config
    );

    streams = dedupeStreams(streams);

    await cacheStreams(
      cacheKey,
      streams
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      },
      body: JSON.stringify({
        streams
      })
    };
  } catch {
    return {
      statusCode: 200,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      },
      body: JSON.stringify({
        streams: []
      })
    };
  }
}

export const config = {
  path: "/:config/stream/:type/:id.json",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: [
      "ip",
      "domain"
    ]
  }
};
