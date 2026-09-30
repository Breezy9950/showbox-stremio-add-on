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

// =========================================================
// PROVIDERS
// =========================================================

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
          "ORG";

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
// RESOLVE PROVIDER
// =========================================================

async function resolveProvider(
  provider,
  metaUrn,
  episodeNumber,
  providerName
) {
  try {
    console.log(
      `[ANIME-SDK] Resolving ${providerName}`,
      {
        metaUrn,
        episode:
          episodeNumber
      }
    );

    /*
     * IMPORTANT:
     *
     * Use the metadata layer's resolveStream()
     * rather than manually calling
     * fetchContentUnits() followed by
     * provider.resolveStream().
     *
     * The metadata layer handles:
     *
     * AniList → provider mapping
     * provider-native lookup
     * MALSync / Anify / ARM fallback
     * fuzzy matching
     * absolute episode matching
     */

    const resolved =
      await meta.resolveStream(
        metaUrn,
        episodeNumber,
        provider,
        "sub"
      );

    const streams =
      normalizeSdkStream(
        resolved,
        providerName,
        episodeNumber
      );

    console.log(
      `[ANIME-SDK] ${providerName} resolved`,
      {
        streams:
          streams.length
      }
    );

    return streams;

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
   * Resolve IMDb → AniList.
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

  // -------------------------------------------------------
  // Movie
  // -------------------------------------------------------

  if (
    type ===
    "movie"
  ) {
    const results =
      await Promise.all(
        providers.map(
          provider =>
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

  // -------------------------------------------------------
  // Series
  // -------------------------------------------------------

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
   * The SDK metadata layer itself handles
   * absolute episode matching and PREQUEL
   * offsets when appropriate.
   *
   * Therefore we pass the requested
   * season episode number directly.
   */

  console.log(
    "[ANIME-SDK] Episode request:",
    {
      season,
      episode
    }
  );

  const results =
    await Promise.all(
      providers.map(
        provider =>
          resolveProvider(
            provider,
            metaUrn,
            episode,
            provider.id
          )
      )
    );

  return results.flat();
}
