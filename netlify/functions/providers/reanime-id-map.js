import { getStore } from "@netlify/blobs";

// =========================================================
// REANIME IMDb → AniList MAPPING CACHE
// =========================================================
//
// Uses AniBridge v3 mappings.
// The upstream dataset is updated daily.
//
// We download it at most once every 24 hours and store a
// compact IMDb → AniList index in Netlify Blobs.
//
// If refreshing fails, an existing expired cache is still
// usable. If no cache exists, ReAnime's original resolver
// can be used as the fallback.
// =========================================================

const MAPPING_STORE =
  "showbox-reanime-mappings";

const MAPPING_KEY =
  "imdb-anilist-index-v1";

const MAPPING_TTL_MS =
  24 * 60 * 60 * 1000;

const MAPPING_URL =
  "https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";

function getMappingStore() {
  return getStore({
    name: MAPPING_STORE,
    consistency: "strong"
  });
}

// =========================================================
// Parse AniBridge descriptor
// =========================================================

function parseDescriptor(
  descriptor
) {
  const value =
    String(
      descriptor || ""
    );

  const match =
    value.match(
      /^([^:]+):([^:]+)(?::s(\d+))?$/
    );

  if (!match) {
    return null;
  }

  return {
    provider:
      match[1],

    id:
      match[2],

    season:
      match[3] === undefined
        ? null
        : Number(match[3])
  };
}

// =========================================================
// Parse episode range
// =========================================================

function parseRange(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

  const match =
    text.match(
      /^(\d+)(?:-(\d*))?$/
    );

  if (!match) {
    return null;
  }

  const start =
    Number(
      match[1]
    );

  const end =
    match[2] === "" ||
    match[2] === undefined
      ? Infinity
      : Number(
          match[2]
        );

  return {
    start,
    end
  };
}

// =========================================================
// Parse target segment
// =========================================================

function parseTargetSegment(
  value
) {
  let text =
    String(
      value || ""
    ).trim();

  let ratio =
    1;

  const ratioMatch =
    text.match(
      /\|(-?\d+(?:\.\d+)?)$/
    );

  if (ratioMatch) {
    ratio =
      Number(
        ratioMatch[1]
      );

    text =
      text.slice(
        0,
        ratioMatch.index
      );
  }

  const segments =
    text
      .split(",")
      .map(
        parseRange
      )
      .filter(
        Boolean
      );

  return {
    ratio,
    segments
  };
}

// =========================================================
// Build episode mapping
// =========================================================

function buildEpisodeMapping(
  sourceRange,
  targetValue
) {
  const source =
    parseRange(
      sourceRange
    );

  const target =
    parseTargetSegment(
      targetValue
    );

  if (
    !source ||
    !target.segments.length
  ) {
    return null;
  }

  return {
    sourceStart:
      source.start,

    sourceEnd:
      source.end,

    ratio:
      target.ratio,

    targets:
      target.segments.map(
        segment => ({
          start:
            segment.start,

          end:
            segment.end
        })
      )
  };
}

// =========================================================
// Build compact IMDb index
// =========================================================

function makeIndex(
  raw
) {
  const movies =
    Object.create(
      null
    );

  const shows =
    Object.create(
      null
    );

  for (
    const [
      sourceDescriptor,
      targets
    ] of Object.entries(
      raw || {}
    )
  ) {
    const source =
      parseDescriptor(
        sourceDescriptor
      );

    if (
      !source ||
      !targets ||
      typeof targets !== "object"
    ) {
      continue;
    }

    // -----------------------------------------------------
    // IMDb movie
    // -----------------------------------------------------

    if (
      source.provider ===
      "imdb_movie"
    ) {
      for (
        const targetDescriptor of
        Object.keys(targets)
      ) {
        const target =
          parseDescriptor(
            targetDescriptor
          );

        if (
          target?.provider !==
          "anilist"
        ) {
          continue;
        }

        if (
          !movies[source.id]
        ) {
          movies[source.id] =
            String(
              target.id
            );
        }

        break;
      }

      continue;
    }

    // -----------------------------------------------------
    // IMDb series season
    // -----------------------------------------------------

    if (
      source.provider !==
        "imdb_show" ||
      source.season === null
    ) {
      continue;
    }

    const key =
      `${source.id}|${source.season}`;

    const entries =
      [];

    for (
      const [
        targetDescriptor,
        ranges
      ] of Object.entries(
        targets
      )
    ) {
      const target =
        parseDescriptor(
          targetDescriptor
        );

      if (
        target?.provider !==
        "anilist"
      ) {
        continue;
      }

      const mappingRanges =
        [];

      if (
        ranges &&
        typeof ranges === "object" &&
        Object.keys(ranges).length
      ) {
        for (
          const [
            sourceRange,
            targetRange
          ] of Object.entries(
            ranges
          )
        ) {
          const mapping =
            buildEpisodeMapping(
              sourceRange,
              targetRange
            );

          if (
            mapping
          ) {
            mappingRanges.push(
              mapping
            );
          }
        }
      }

      entries.push({
        anilistId:
          String(
            target.id
          ),

        ranges:
          mappingRanges
      });
    }

    if (
      entries.length
    ) {
      shows[key] =
        entries;
    }
  }

  return {
    movies,
    shows
  };
}

// =========================================================
// Convert source episode → AniList episode
// =========================================================

function findTargetEpisode(
  mapping,
  episode
) {
  const sourceEpisode =
    Number(
      episode
    );

  if (
    !Number.isFinite(
      sourceEpisode
    ) ||
    sourceEpisode < 1
  ) {
    return null;
  }

  // No range means direct episode mapping.
  if (
    !mapping.ranges.length
  ) {
    return sourceEpisode;
  }

  for (
    const range of
    mapping.ranges
  ) {
    if (
      sourceEpisode <
        range.sourceStart ||
      (
        Number.isFinite(
          range.sourceEnd
        ) &&
        sourceEpisode >
          range.sourceEnd
      )
    ) {
      continue;
    }

    const offset =
      sourceEpisode -
      range.sourceStart;

    // -----------------------------------------------------
    // Normal 1:1 mapping
    // -----------------------------------------------------

    if (
      range.ratio === 1
    ) {
      let remaining =
        offset;

      for (
        const target of
        range.targets
      ) {
        const length =
          Number.isFinite(
            target.end
          )
            ? target.end -
              target.start +
              1
            : Infinity;

        if (
          remaining <
          length
        ) {
          return (
            target.start +
            remaining
          );
        }

        remaining -=
          length;
      }

      return null;
    }

    // -----------------------------------------------------
    // One source episode → multiple target episodes
    // -----------------------------------------------------

    if (
      range.ratio > 0
    ) {
      const targetOffset =
        Math.floor(
          offset *
          range.ratio
        );

      let remaining =
        targetOffset;

      for (
        const target of
        range.targets
      ) {
        const length =
          Number.isFinite(
            target.end
          )
            ? target.end -
              target.start +
              1
            : Infinity;

        if (
          remaining <
          length
        ) {
          return (
            target.start +
            remaining
          );
        }

        remaining -=
          length;
      }

      return null;
    }

    // -----------------------------------------------------
    // Multiple source episodes → one target episode
    // -----------------------------------------------------

    const divisor =
      Math.abs(
        range.ratio
      );

    const targetOffset =
      Math.floor(
        offset /
        divisor
      );

    let remaining =
      targetOffset;

    for (
      const target of
      range.targets
    ) {
      const length =
        Number.isFinite(
          target.end
        )
          ? target.end -
            target.start +
            1
          : Infinity;

      if (
        remaining <
        length
      ) {
        return (
          target.start +
          remaining
        );
      }

      remaining -=
        length;
    }

    return null;
  }

  return null;
}

// =========================================================
// Lookup IMDb ID
// =========================================================

function resolveFromIndex(
  index,
  imdbId,
  type,
  season,
  episode
) {
  if (
    !index ||
    !imdbId
  ) {
    return null;
  }

  const normalizedId =
    String(
      imdbId
    ).trim();

  // -----------------------------------------------------
  // Movie
  // -----------------------------------------------------

  if (
    type === "movie"
  ) {
    const anilistId =
      index.movies?.[
        normalizedId
      ];

    if (
      !anilistId
    ) {
      return null;
    }

    return {
      anilistId:
        String(
          anilistId
        ),

      episode:
        1,

      source:
        "anibridge"
    };
  }

  // -----------------------------------------------------
  // Series
  // -----------------------------------------------------

  const key =
    `${normalizedId}|${Number(
      season
    )}`;

  const candidates =
    index.shows?.[
      key
    ];

  if (
    !Array.isArray(
      candidates
    ) ||
    !candidates.length
  ) {
    return null;
  }

  for (
    const candidate of
    candidates
  ) {
    const targetEpisode =
      findTargetEpisode(
        candidate,
        episode
      );

    if (
      targetEpisode
    ) {
      return {
        anilistId:
          String(
            candidate.anilistId
          ),

        episode:
          targetEpisode,

        source:
          "anibridge"
      };
    }
  }

  return null;
}

// =========================================================
// Read valid cache
// =========================================================

async function readCachedIndex() {
  try {
    const store =
      getMappingStore();

    const cached =
      await store.get(
        MAPPING_KEY,
        {
          type:
            "json",

          consistency:
            "strong"
        }
      );

    if (
      !cached ||
      typeof cached !==
        "object"
    ) {
      return null;
    }

    const updatedAt =
      Number(
        cached.updatedAt
      );

    if (
      !Number.isFinite(
        updatedAt
      )
    ) {
      return null;
    }

    if (
      Date.now() -
        updatedAt >=
      MAPPING_TTL_MS
    ) {
      return null;
    }

    if (
      !cached.index ||
      typeof cached.index !==
        "object"
    ) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

// =========================================================
// Download + rebuild index
// =========================================================

async function refreshIndex() {
  const response =
    await fetch(
      MAPPING_URL,
      {
        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "ShowBox-Stremio-Addon/1.0"
        }
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `AniBridge mapping download failed: HTTP ${response.status}`
    );
  }

  const raw =
    await response.json();

  const index =
    makeIndex(
      raw
    );

  const movieCount =
    Object.keys(
      index.movies
    ).length;

  const showCount =
    Object.keys(
      index.shows
    ).length;

  if (
    !movieCount &&
    !showCount
  ) {
    throw new Error(
      "AniBridge mapping contained no IMDb mappings"
    );
  }

  const cached = {
    updatedAt:
      Date.now(),

    source:
      "anibridge-v3",

    index
  };

  const store =
    getMappingStore();

  await store.setJSON(
    MAPPING_KEY,
    cached
  );

  console.log(
    `[Reanime] AniBridge mapping refreshed: ${movieCount} movies, ${showCount} show-season mappings`
  );

  return cached;
}

// =========================================================
// PUBLIC LOOKUP
// =========================================================

export async function resolveImdbToAnilist({
  imdbId,
  type,
  season,
  episode
}) {
  if (
    !imdbId ||
    !/^tt\d+$/i.test(
      String(
        imdbId
      )
    )
  ) {
    return null;
  }

  let cached =
    await readCachedIndex();

  // -------------------------------------------------------
  // Cache expired/missing → refresh
  // -------------------------------------------------------

  if (
    !cached
  ) {
    try {
      cached =
        await refreshIndex();
    } catch (
      error
    ) {
      console.error(
        "[Reanime] AniBridge mapping refresh failed:",
        error?.message ||
          error
      );

      // ---------------------------------------------------
      // Use expired cache if refresh failed.
      // ---------------------------------------------------

      try {
        const store =
          getMappingStore();

        cached =
          await store.get(
            MAPPING_KEY,
            {
              type:
                "json",

              consistency:
                "strong"
            }
          );
      } catch {
        cached =
          null;
      }
    }
  }

  return resolveFromIndex(
    cached?.index,
    String(
      imdbId
    ),
    type,
    season,
    episode
  );
}
