import {
  getStore
} from "@netlify/blobs";

// =========================================================
// ANIBRIDGE IMDb → AniList MAPPING
// =========================================================

const MAPPING_STORE =
  "showbox-reanime-mappings";

const MAPPING_KEY =
  "imdb-anilist-index-v1";

const MAPPING_TTL_MS =
  24 * 60 * 60 * 1000;

// AniBridge v3 mapping release.
//
// Keep this URL in one place so it can be changed easily
// if AniBridge changes its release structure.
const MAPPING_URL =
  "https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";

// =========================================================
// STORE
// =========================================================

function getMappingStore() {
  return getStore({
    name:
      MAPPING_STORE,

    consistency:
      "strong"
  });
}

// =========================================================
// DESCRIPTOR PARSER
//
// Examples:
//
// imdb_movie:tt1234567
// imdb_show:tt1234567:s1
// anilist:12345
// tmdb_show:12345:s2
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

  if (
    !match
  ) {
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
        : Number(
            match[3]
          )
  };
}

// =========================================================
// RANGE PARSER
//
// Supported:
//
// 1
// 1-12
// 13-
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

  if (
    !match
  ) {
    return null;
  }

  const start =
    Number(
      match[1]
    );

  const end =
    match[2] === undefined ||
    match[2] === ""
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
// TARGET RANGE PARSER
//
// AniBridge can describe multiple target ranges.
//
// Example:
//
// "1-12"
// "1-12,13-24"
// =========================================================

function parseTargetRanges(
  value
) {
  let text =
    String(
      value || ""
    ).trim();

  let ratio =
    1;

  // Some AniBridge mappings can contain a ratio suffix.
  //
  // Example:
  //
  // 1-12|0.5
  //
  // Keep it supported so the index does not lose
  // information from the upstream mapping.
  const ratioMatch =
    text.match(
      /\|(-?\d+(?:\.\d+)?)$/
    );

  if (
    ratioMatch
  ) {
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

  const ranges =
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
    ranges
  };
}

// =========================================================
// BUILD RANGE MAPPING
// =========================================================

function buildEpisodeMapping(
  sourceRange,
  targetRange
) {
  const source =
    parseRange(
      sourceRange
    );

  const target =
    parseTargetRanges(
      targetRange
    );

  if (
    !source ||
    !target.ranges.length
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
      target.ranges
  };
}

// =========================================================
// BUILD COMPACT INDEX
// =========================================================
//
// Instead of keeping the complete AniBridge database in
// memory for every request, turn it into:
//
// {
//   movies: {
//      "tt123": "12345"
//   },
//
//   shows: {
//      "tt123|1": [
//         {
//           anilistId: "12345",
//           ranges: [...]
//         }
//      ]
//   }
// }
//
// This is much smaller and faster to query.
// =========================================================

function buildIndex(
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
      typeof targets !==
        "object"
    ) {
      continue;
    }

    // =====================================================
    // MOVIE
    // =====================================================

    if (
      source.provider ===
      "imdb_movie"
    ) {
      for (
        const targetDescriptor of
        Object.keys(
          targets
        )
      ) {
        const target =
          parseDescriptor(
            targetDescriptor
          );

        if (
          !target ||
          target.provider !==
            "anilist"
        ) {
          continue;
        }

        movies[
          source.id
        ] =
          String(
            target.id
          );

        break;
      }

      continue;
    }

    // =====================================================
    // SERIES / SEASON
    // =====================================================

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
        !target ||
        target.provider !==
          "anilist"
      ) {
        continue;
      }

      const mappings =
        [];

      // ---------------------------------------------------
      // AniBridge may have episode range information.
      // ---------------------------------------------------

      if (
        ranges &&
        typeof ranges ===
          "object"
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
            mappings.push(
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
          mappings
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
// SOURCE EPISODE → ANILIST EPISODE
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

  // No range information.
  //
  // In this case the mapping is already an AniList
  // season mapping, so preserve the requested episode.
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
        range.sourceStart
    ) {
      continue;
    }

    if (
      Number.isFinite(
        range.sourceEnd
      ) &&
      sourceEpisode >
        range.sourceEnd
    ) {
      continue;
    }

    const offset =
      sourceEpisode -
      range.sourceStart;

    // =====================================================
    // NORMAL 1:1
    // =====================================================

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

    // =====================================================
    // SOURCE → TARGET RATIO
    // =====================================================

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

    // =====================================================
    // MULTIPLE SOURCE → ONE TARGET
    // =====================================================

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
  }

  return null;
}

// =========================================================
// CACHE READ
// =========================================================

async function readFreshCache() {
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

    if (
      !cached.index ||
      typeof cached.index !==
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

    return cached;

  } catch {
    return null;
  }
}

// =========================================================
// EXPIRED CACHE
// =========================================================
//
// Used if AniBridge is temporarily unavailable.
// =========================================================

async function readAnyCache() {
  try {
    const store =
      getMappingStore();

    return await store.get(
      MAPPING_KEY,
      {
        type:
          "json",

        consistency:
          "strong"
      }
    );

  } catch {
    return null;
  }
}

// =========================================================
// REFRESH
// =========================================================

async function refreshMapping() {
  console.log(
    "[Reanime] Downloading AniBridge mapping..."
  );

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
      `AniBridge returned HTTP ${response.status}`
    );
  }

  const raw =
    await response.json();

  const index =
    buildIndex(
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
    movieCount === 0 &&
    showCount === 0
  ) {
    throw new Error(
      "AniBridge mapping produced an empty index"
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
    `[Reanime] AniBridge mapping refreshed: ${movieCount} movies, ${showCount} show seasons`
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
    await readFreshCache();

  // -------------------------------------------------------
  // Refresh every 24 hours.
  // -------------------------------------------------------

  if (
    !cached
  ) {
    try {
      cached =
        await refreshMapping();

    } catch (
      error
    ) {
      console.error(
        "[Reanime] AniBridge refresh failed:",
        error?.message ||
          error
      );

      // ---------------------------------------------------
      // Keep using old cache if available.
      // ---------------------------------------------------

      cached =
        await readAnyCache();
    }
  }

  if (
    !cached?.index
  ) {
    return null;
  }

  const normalizedId =
    String(
      imdbId
    ).trim();

  // =====================================================
  // MOVIE
  // =====================================================

  if (
    type === "movie"
  ) {
    const anilistId =
      cached.index.movies?.[
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

  // =====================================================
  // SERIES
  // =====================================================

  const seasonNumber =
    Number(
      season
    );

  const episodeNumber =
    Number(
      episode
    );

  if (
    !Number.isFinite(
      seasonNumber
    ) ||
    !Number.isFinite(
      episodeNumber
    )
  ) {
    return null;
  }

  const key =
    `${normalizedId}|${seasonNumber}`;

  const candidates =
    cached.index.shows?.[
      key
    ];

  if (
    !Array.isArray(
      candidates
    )
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
        episodeNumber
      );

    if (
      targetEpisode !==
      null
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
