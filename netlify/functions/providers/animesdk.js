import {
  HttpClient,
  AnilistMeta,
  MappingClient,
  GogoanimeProvider,
  AnikotoProvider,
  MegaPlayProvider,
  AllmangaProvider,
  AnimeParadiseProvider
} from "anime-sdk";

// =========================================================
// CONFIGURATION
// =========================================================

const ID_MAPPER_URL =
  "https://idmapper.vercel.app/api/mapper";

const REQUEST_TIMEOUT_MS =
  25000;

// =========================================================
// SDK CLIENT
// =========================================================

const http =
  new HttpClient({
    timeoutMs:
      REQUEST_TIMEOUT_MS
  });

const mapping =
  new MappingClient(
    http
  );

const meta =
  new AnilistMeta(
    http,
    {
      mappingClient:
        mapping
    }
  );

// ---------------------------------------------------------
// Providers
// ---------------------------------------------------------

const providers = [
  new GogoanimeProvider(
    http
  ),

  new AnikotoProvider(
    http
  ),

  new MegaPlayProvider(
    http
  ),

  new AllmangaProvider(
    http
  ),

  new AnimeParadiseProvider(
    http
  )
];

// =========================================================
// IMDb → AniList
// =========================================================

async function getAniListId(
  imdbId
) {
  if (
    !imdbId
  ) {
    return null;
  }

  const url =
    `${ID_MAPPER_URL}?imdb_id=${encodeURIComponent(
      imdbId
    )}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json"
        },

        signal:
          AbortSignal.timeout(
            REQUEST_TIMEOUT_MS
          )
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `IMDb mapper returned HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  /*
   * The mapper may expose the AniList
   * value in different nesting depending
   * on the returned mapping record.
   */

  const candidates = [
    data?.anilist_id,
    data?.anilistId,
    data?.anilist,
    data?.data?.anilist_id,
    data?.data?.anilistId,
    data?.data?.anilist
  ];

  for (
    const value of candidates
  ) {
    const id =
      Number(
        value
      );

    if (
      Number.isInteger(id) &&
      id > 0
    ) {
      return id;
    }
  }

  /*
   * Some mapper responses return an
   * array of mapping records.
   */

  const records =
    Array.isArray(
      data
    )
      ? data
      : Array.isArray(
          data?.data
        )
        ? data.data
        : [];

  for (
    const record of records
  ) {
    const candidates = [
      record?.anilist_id,
      record?.anilistId,
      record?.anilist
    ];

    for (
      const value of candidates
    ) {
      const id =
        Number(
          value
        );

      if (
        Number.isInteger(id) &&
        id > 0
      ) {
        return id;
      }
    }
  }

  return null;
}

// =========================================================
// SEASON OFFSET
// =========================================================

async function getSeasonOffset(
  metaUrn,
  season
) {
  if (
    !Number.isFinite(
      season
    ) ||
    season <= 1
  ) {
    return 0;
  }

  let current =
    await meta.fetchMediaInfo(
      metaUrn
    );

  let offset =
    0;

  const visited =
    new Set();

  /*
   * AniList represents later seasons as
   * sequel entries.

   * Walk backwards through PREQUEL
   * relations and add each previous
   * season's episode count.
   */

  for (
    let i = 0;
    i < 8;
    i++
  ) {
    if (
      !current ||
      visited.has(
        current.id
      )
    ) {
      break;
    }

    visited.add(
      current.id
    );

    const prequel =
      (
        current.relations ||
        []
      ).find(
        relation =>
          relation.relationType ===
          "PREQUEL"
      );

    if (
      !prequel
    ) {
      break;
    }

    try {
      const previous =
        await meta.fetchMediaInfo(
          prequel.id
        );

      if (
        typeof previous.episodeCount ===
        "number"
      ) {
        offset +=
          previous.episodeCount;
      }

      current =
        previous;

    } catch {
      break;
    }
  }

  return offset;
}

// =========================================================
// NORMALIZE SDK STREAM
// =========================================================

function normalizeSdkStream(
  payload,
  providerName,
  episodeNumber
) {
  if (
    !payload ||
    payload.type !==
      "video"
  ) {
    return [];
  }

  if (
    !Array.isArray(
      payload.streams
    )
  ) {
    return [];
  }

  return payload.streams
    .filter(
      stream =>
        stream &&
        typeof stream.sourceUrl ===
          "string" &&
        stream.sourceUrl
    )
    .map(
      stream => {
        let quality =
          stream.quality ||
          "auto";

        if (
          quality ===
          "auto"
        ) {
          quality =
            "ORG";
        }

        return {
          name:
            quality,

          title:
            `${providerName} - Episode ${episodeNumber}`,

          url:
            stream.sourceUrl,

          behaviorHints: {
            notWebReady:
              false
          },

          ...(stream.headers &&
          typeof stream.headers ===
            "object"
            ? {
                headers:
                  stream.headers
              }
            : {}),

          ...(Array.isArray(
            stream.subtitles
          ) &&
          stream.subtitles.length
            ? {
                subtitles:
                  stream.subtitles.map(
                    subtitle => ({
                      url:
                        subtitle.url,

                      lang:
                        subtitle.language ||
                        "Unknown",

                      label:
                        subtitle.label ||
                        subtitle.language ||
                        "Subtitle"
                    })
                  )
              }
            : {})
        };
      }
    );
}

// =========================================================
// RESOLVE ONE PROVIDER
// =========================================================

async function resolveProvider(
  provider,
  metaUrn,
  episodeNumber,
  providerName
) {
  try {
    /*
     * Fetch the provider's episode list
     * through the SDK mapping layer.
     */

    const units =
      await meta.fetchContentUnits(
        metaUrn,
        provider
      );

    if (
      !Array.isArray(
        units
      ) ||
      !units.length
    ) {
      console.log(
        `[ANIME-SDK] ${providerName}: no episodes`
      );

      return [];
    }

    /*
     * First try the requested episode
     * directly.
     */

    let unit =
      units.find(
        item =>
          item.number ===
          episodeNumber
      );

    /*
     * If this is a multi-season provider
     * with continuous numbering, the
     * caller can pass an absolute episode.
     */

    if (
      !unit
    ) {
      console.log(
        `[ANIME-SDK] ${providerName}: episode ${episodeNumber} not found`
      );

      return [];
    }

    const languages =
      unit.availableLanguages ||
      ["sub"];

    /*
     * Prefer sub, then fall back to
     * whatever language the provider exposes.
     */

    const language =
      languages.includes(
        "sub"
      )
        ? "sub"
        : languages[0];

    const resolved =
      await provider.resolveStream(
        unit.id,
        language
      );

    return normalizeSdkStream(
      resolved,
      providerName,
      episodeNumber
    );

  } catch (
    error
  ) {
    console.error(
      `[ANIME-SDK] ${providerName} failed:`,
      error?.stack ||
        error?.message ||
        error
    );

    return [];
  }
}

// =========================================================
// MAIN EXPORT
// =========================================================

export async function getAnimeSdkStreams({
  imdbId,
  type,
  season,
  episode
}) {
  if (
    !imdbId
  ) {
    throw new Error(
      "IMDb ID is required"
    );
  }

  /*
   * The SDK is anime-oriented.
   * Don't attempt to use it for
   * non-anime content.
   */

  const aniListId =
    await getAniListId(
      imdbId
    );

  if (
    !aniListId
  ) {
    console.log(
      "[ANIME-SDK] No AniList mapping for:",
      imdbId
    );

    return [];
  }

  const metaUrn =
    `anilist:${aniListId}`;

  console.log(
    "[ANIME-SDK] IMDb → AniList:",
    {
      imdbId,
      aniListId
    }
  );

  /*
   * Movies are represented as a
   * single content unit.
   */

  if (
    type ===
    "movie"
  ) {
    const results =
      await Promise.all(
        providers.map(
          (
            provider
          ) =>
            resolveProvider(
              provider,
              metaUrn,
              1,
              provider.id
            )
        )
      );

    return results.flat();
  }

  if (
    type !==
    "series"
  ) {
    return [];
  }

  if (
    !Number.isFinite(
      season
    ) ||
    !Number.isFinite(
      episode
    )
  ) {
    return [];
  }

  /*
   * For S1 this is simply episode N.
   *
   * For later seasons, walk AniList's
   * PREQUEL chain to calculate the
   * absolute episode number used by
   * providers that concatenate seasons.
   */

  const offset =
    await getSeasonOffset(
      metaUrn,
      season
    );

  const absoluteEpisode =
    offset +
    episode;

  console.log(
    "[ANIME-SDK] Episode mapping:",
    {
      season,
      episode,
      offset,
      absoluteEpisode
    }
  );

  const results =
    await Promise.all(
      providers.map(
        provider =>
          resolveProvider(
            provider,
            metaUrn,
            absoluteEpisode,
            provider.id
          )
      )
    );

  return results.flat();
}
