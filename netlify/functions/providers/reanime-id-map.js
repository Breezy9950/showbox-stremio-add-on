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

function buildIndex(
  raw
) {
  console.log(
    "[Reanime Map] Building compact index..."
  );

  const movies =
    Object.create(
      null
    );

  const shows =
    Object.create(
      null
    );

  let sourceCount =
    0;

  let skippedCount =
    0;

  for (
    const [
      sourceDescriptor,
      targets
    ] of Object.entries(
      raw || {}
    )
  ) {
    sourceCount++;

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
      skippedCount++;
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

  console.log(
    `[Reanime Map] Index build complete. Sources=${sourceCount}, skipped=${skippedCount}`
  );

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
    console.log(
      "[Reanime Map] Checking fresh cache..."
    );

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
      !cached
    ) {
      console.log(
        "[Reanime Map] No cache found"
      );

      return null;
    }

    console.log(
      `[Reanime Map] Cache found. updatedAt=${cached.updatedAt}`
    );

    if (
      !cached.index
    ) {
      console.log(
        "[Reanime Map] Cache has no index"
      );

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
      console.log(
        "[Reanime Map] Invalid cache timestamp"
      );

      return null;
    }

    const age =
      Date.now() -
      updatedAt;

    console.log(
      `[Reanime Map] Cache age: ${Math.round(
        age / 1000 / 60
      )} minutes`
    );

    if (
      age >=
      MAPPING_TTL_MS
    ) {
      console.log(
        "[Reanime Map] Cache expired"
      );

      return null;
    }

    console.log(
      "[Reanime Map] Using fresh cache"
    );

    return cached;

  } catch (
    error
  ) {
    console.error(
      "[Reanime Map] Fresh cache ERROR:",
      error?.stack ||
        error
    );

    return null;
  }
}

// =========================================================
// EXPIRED CACHE
// =========================================================

async function readAnyCache() {
  try {
    console.log(
      "[Reanime Map] Reading stale cache..."
    );

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
      cached
    ) {
      console.log(
        "[Reanime Map] Stale cache found"
      );
    } else {
      console.log(
        "[Reanime Map] No stale cache found"
      );
    }

    return cached;

  } catch (
    error
  ) {
    console.error(
      "[Reanime Map] Stale cache ERROR:",
      error?.stack ||
        error
    );

    return null;
  }
}

// =========================================================
// REFRESH
// =========================================================

async function refreshMapping() {
  console.log(
    "[Reanime Map] ========================================"
  );

  console.log(
    "[Reanime Map] DOWNLOADING ANIBRIDGE MAPPING"
  );

  console.log(
    "[Reanime Map] URL:",
    MAPPING_URL
  );

  const start =
    Date.now();

  try {
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

    console.log(
      `[Reanime Map] AniBridge HTTP ${response.status}`
    );

    console.log(
      "[Reanime Map] Content-Type:",
      response.headers.get(
        "content-type"
      )
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

    console.log(
      "[Reanime Map] JSON downloaded successfully"
    );

    console.log(
      "[Reanime Map] Top-level type:",
      Array.isArray(
        raw
      )
        ? "ARRAY"
        : typeof raw
    );

    console.log(
      "[Reanime Map] Top-level keys:",
      raw &&
      typeof raw ===
        "object"
        ? Object.keys(
            raw
          ).slice(
            0,
            10
          )
        : []
    );

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

    console.log(
      `[Reanime Map] Built index: ${movieCount} movies, ${showCount} show seasons`
    );

    if (
      movieCount === 0 &&
      showCount === 0
    ) {
      throw new Error(
        "AniBridge mapping produced an EMPTY index. The JSON schema may not match our parser."
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
      `[Reanime Map] Cache saved successfully in ${
        Date.now() -
        start
      }ms`
    );

    console.log(
      "[Reanime Map] ========================================"
    );

    return cached;

  } catch (
    error
  ) {
    console.error(
      "[Reanime Map] REFRESH ERROR:",
      error?.stack ||
        error
    );

    throw error;
  }
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
  console.log(
    "[Reanime Map] ----------------------------------------"
  );

  console.log(
    "[Reanime Map] LOOKUP:",
    JSON.stringify({
      imdbId,
      type,
      season,
      episode
    })
  );

  if (
    !imdbId ||
    !/^tt\d+$/i.test(
      String(
        imdbId
      )
    )
  ) {
    console.log(
      "[Reanime Map] Invalid IMDb ID"
    );

    return null;
  }

  let cached =
    await readFreshCache();

  if (
    !cached
  ) {
    console.log(
      "[Reanime Map] No fresh cache -> refreshing"
    );

    try {
      cached =
        await refreshMapping();

    } catch (
      error
    ) {
      console.error(
        "[Reanime Map] Refresh failed:",
        error?.stack ||
          error
      );

      console.log(
        "[Reanime Map] Trying stale cache..."
      );

      cached =
        await readAnyCache();

      if (
        cached
      ) {
        console.log(
          "[Reanime Map] STALE CACHE FOUND"
        );
      } else {
        console.log(
          "[Reanime Map] NO STALE CACHE"
        );
      }
    }
  }

  if (
    !cached?.index
  ) {
    console.log(
      "[Reanime Map] No usable index"
    );

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

    console.log(
      `[Reanime Map] Movie lookup ${normalizedId} -> ${
        anilistId ||
        "NOT FOUND"
      }`
    );

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

  console.log(
    `[Reanime Map] Series lookup IMDb=${normalizedId} S${seasonNumber} E${episodeNumber}`
  );

  if (
    !Number.isFinite(
      seasonNumber
    ) ||
    !Number.isFinite(
      episodeNumber
    )
  ) {
    console.log(
      "[Reanime Map] Invalid season/episode"
    );

    return null;
  }

  const key =
    `${normalizedId}|${seasonNumber}`;

  const candidates =
    cached.index.shows?.[
      key
    ];

  console.log(
    `[Reanime Map] Index key: ${key}`
  );

  console.log(
    `[Reanime Map] Candidates: ${
      Array.isArray(
        candidates
      )
        ? candidates.length
        : 0
    }`
  );

  if (
    !Array.isArray(
      candidates
    )
  ) {
    console.log(
      "[Reanime Map] NO SEASON MAPPING"
    );

    return null;
  }

  for (
    const candidate of
    candidates
  ) {
    console.log(
      `[Reanime Map] Testing AniList ${candidate.anilistId}`
    );

    const targetEpisode =
      findTargetEpisode(
        candidate,
        episodeNumber
      );

    console.log(
      `[Reanime Map] Episode ${episodeNumber} -> ${
        targetEpisode ??
        "NO MATCH"
      }`
    );

    if (
      targetEpisode !==
      null
    ) {
      console.log(
        `[Reanime Map] SUCCESS: ${normalizedId} S${seasonNumber}E${episodeNumber} -> AniList ${candidate.anilistId} E${targetEpisode}`
      );

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

  console.log(
    "[Reanime Map] No episode mapping matched"
  );

  return null;
}
