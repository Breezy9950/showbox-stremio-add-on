import {
  resolveImdbToAnilist
} from "./reanime-id-map.js";

// =========================================================
// REANIME CONSTANTS
// =========================================================

const REANIME_DOMAINS = [
  "https://reanime.to",
  "https://reanime.cz",
  "https://reanime.wtf"
];

const REANIME_BASE =
  "https://reanime.to";

const FLIXCLOUD_BASE =
  "https://flixcloud.cc";

const TMDB_API_KEY =
  "439c478a771f35c05022f9feabcca01c";

const ANILIST_URL =
  "https://graphql.anilist.co";

const ARM_BASE =
  "https://arm.haglund.dev/api/v2";

const CINEMETA_URL =
  "https://v3-cinemeta.strem.io/meta";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent":
    USER_AGENT,

  "Accept":
    "application/json, text/plain, */*",

  "Accept-Language":
    "en-US,en;q=0.9"
};

// =========================================================
// ACTIVE REANIME DOMAIN
// =========================================================

let activeBaseUrl =
  REANIME_BASE;

// =========================================================
// ABSOLUTIZE
// =========================================================

function absolutize(
  path,
  base = activeBaseUrl
) {
  if (
    !path
  ) {
    return "";
  }

  if (
    path.startsWith(
      "http"
    )
  ) {
    return path;
  }

  const cleanPath =
    path.startsWith(
      "/"
    )
      ? path
      : `/${path}`;

  return `${base}${cleanPath}`;
}

// =========================================================
// FETCH TEXT
// =========================================================

async function fetchText(
  url,
  options = {}
) {
  const isAbsolute =
    url.startsWith(
      "http"
    );

  const urlsToTry =
    isAbsolute
      ? [url]
      : REANIME_DOMAINS.map(
          domain =>
            absolutize(
              url,
              domain
            )
        );

  let lastError =
    null;

  for (
    const tryUrl of
    urlsToTry
  ) {
    try {
      const response =
        await fetch(
          tryUrl,
          {
            ...options,

            headers: {
              ...HEADERS,

              ...(options.headers ||
                {})
            }
          }
        );

      if (
        response.ok
      ) {
        if (
          !isAbsolute
        ) {
          const match =
            tryUrl.match(
              /^(https?:\/\/[^/]+)/
            );

          if (
            match
          ) {
            activeBaseUrl =
              match[1];
          }
        }

        return await response.text();
      }

      lastError =
        new Error(
          `Reanime HTTP ${response.status}: ${tryUrl}`
        );

    } catch (
      error
    ) {
      lastError =
        error;
    }
  }

  throw (
    lastError ||
    new Error(
      `Failed to fetch: ${url}`
    )
  );
}

// =========================================================
// FETCH JSON
// =========================================================

async function fetchJson(
  url,
  options = {}
) {
  const text =
    await fetchText(
      url,
      {
        ...options,

        headers: {
          Accept:
            "application/json, text/plain, */*",

          ...(options.headers ||
            {})
        }
      }
    );

  return JSON.parse(
    text
  );
}

// =========================================================
// TMDB INFO
// =========================================================

async function getTmdbInfo(
  tmdbId,
  mediaType
) {
  const endpoint =
    mediaType === "tv"
      ? "tv"
      : "movie";

  const url =
    `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

  try {
    const data =
      await fetchJson(
        url
      );

    return {
      title:
        data.name ||
        data.title ||
        data.original_name ||
        data.original_title ||
        "",

      year:
        (
          (
            data.first_air_date ||
            data.release_date ||
            ""
          ).match(
            /\d{4}/
          ) ||
          [null]
        )[0],

      imdbId:
        data.external_ids &&
        data.external_ids.imdb_id
    };

  } catch {
    return {
      title:
        "",

      year:
        null,

      imdbId:
        null
    };
  }
}

// =========================================================
// ANILIST INFO
// =========================================================

async function getAnilistInfo(
  alId
) {
  const query =
    "query($id:Int){Media(id:$id){id title{english romaji native} startDate{year}}}";

  try {
    const json =
      await fetchJson(
        ANILIST_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              query,

              variables: {
                id:
                  parseInt(
                    alId,
                    10
                  )
              }
            })
        }
      );

    const media =
      json?.data?.Media;

    if (
      !media
    ) {
      return {
        title:
          "",

        year:
          null
      };
    }

    return {
      title:
        media.title?.english ||
        media.title?.romaji ||
        media.title?.native ||
        "",

      year:
        media.startDate?.year ||
        null
    };

  } catch {
    return {
      title:
        "",

      year:
        null
    };
  }
}

// =========================================================
// CINEMETA INFO
// =========================================================

async function getCinemetaInfo(
  imdbId,
  mediaType,
  season,
  episode
) {
  const type =
    mediaType === "movie"
      ? "movie"
      : "series";

  const url =
    `${CINEMETA_URL}/${type}/${imdbId}.json`;

  try {
    const data =
      await fetchJson(
        url
      );

    const meta =
      data.meta;

    if (
      !meta
    ) {
      throw new Error(
        "No Cinemeta metadata"
      );
    }

    if (
      mediaType === "movie"
    ) {
      return {
        date:
          meta.released
            ? meta.released.split(
                "T"
              )[0]
            : null,

        title:
          meta.name,

        dayIndex:
          1
      };
    }

    const videos =
      meta.videos ||
      [];

    const target =
      videos.find(
        video =>
          video.season == season &&
          video.episode == episode
      );

    if (
      !target ||
      !target.released
    ) {
      return {
        date:
          null,

        title:
          null,

        dayIndex:
          1
      };
    }

    const targetDate =
      target.released.split(
        "T"
      )[0];

    const dayIndex =
      videos.filter(
        video =>
          video.season == season &&
          video.released &&
          video.released.split(
            "T"
          )[0] ===
            targetDate &&
          parseInt(
            video.episode
          ) <
            parseInt(
              episode
            )
      ).length + 1;

    return {
      date:
        targetDate,

      title:
        target.name ||
        null,

      dayIndex
    };

  } catch {
    return {
      date:
        null,

      title:
        null,

      dayIndex:
        1
    };
  }
}

// =========================================================
// ORIGINAL REANIME SYNC RESOLVER
//
// This remains as fallback when AniBridge doesn't contain
// the requested IMDb mapping.
// =========================================================

async function getSyncInfo(
  id,
  mediaType,
  season,
  episode
) {
  const isImdb =
    typeof id ===
      "string" &&
    id.startsWith(
      "tt"
    );

  if (
    isImdb
  ) {
    const info =
      await getCinemetaInfo(
        id,
        mediaType,
        season,
        episode
      );

    if (
      info.date
    ) {
      return {
        imdbId:
          id,

        releaseDate:
          info.date,

        episodeTitle:
          info.title,

        dayIndex:
          info.dayIndex,

        episode
      };
    }

    throw new Error(
      "Could not find release date on Cinemeta"
    );
  }

  const tmdbUrl =
    `https://api.themoviedb.org/3/${mediaType === "movie" ? "movie" : "tv"}/${id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

  const details =
    await fetchJson(
      tmdbUrl
    );

  let imdbId =
    details.external_ids &&
    details.external_ids.imdb_id ||
    details.imdb_id ||
    null;

  const title =
    details.name ||
    details.title ||
    null;

  if (
    !imdbId
  ) {
    try {
      const armData =
        await fetchJson(
          `${ARM_BASE}/themoviedb?id=${id}`
        );

      imdbId =
        Array.isArray(
          armData
        ) &&
        armData.length > 0
          ? armData[0].imdb
          : null;

    } catch {
      // Ignore ARM failure.
    }
  }

  if (
    !imdbId
  ) {
    throw new Error(
      `No IMDb ID found for TMDB ${id}`
    );
  }

  const cMeta =
    await getCinemetaInfo(
      imdbId,
      mediaType,
      season,
      episode
    );

  let finalDate =
    cMeta.date;

  if (
    mediaType === "movie" &&
    details.release_date
  ) {
    finalDate =
      details.release_date;
  }

  if (
    !finalDate
  ) {
    throw new Error(
      `Could not find release date for ID ${imdbId}`
    );
  }

  return {
    imdbId,

    tmdbId:
      id,

    releaseDate:
      finalDate,

    title,

    episodeTitle:
      cMeta.title,

    dayIndex:
      cMeta.dayIndex,

    episode
  };
}

// =========================================================
// ORIGINAL AniList DATE RESOLVER
// =========================================================

async function resolveByDate(
  releaseDateStr,
  showTitle,
  originalEpisode,
  episodeTitle,
  dayIndex
) {
  if (
    !releaseDateStr ||
    !/^\d{4}-\d{2}-\d{2}/.test(
      releaseDateStr
    )
  ) {
    return null;
  }

  const query =
    "query($search:String){Page(perPage:20){media(search:$search,type:ANIME){id type format title{romaji english native}startDate{year month day}endDate{year month day}episodes streamingEpisodes{title}}}}";

  try {
    const json =
      await fetchJson(
        ANILIST_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              query,

              variables: {
                search:
                  showTitle
              }
            })
        }
      );

    const candidates =
      json?.data?.Page?.media ||
      [];

    if (
      candidates.length === 0
    ) {
      return null;
    }

    const targetDate =
      new Date(
        releaseDateStr
      );

    for (
      const anime of
      candidates
    ) {
      const s =
        anime.startDate;

      const startStr =
        s?.year &&
        s?.month &&
        s?.day
          ? `${s.year}-${String(
              s.month
            ).padStart(
              2,
              "0"
            )}-${String(
              s.day
            ).padStart(
              2,
              "0"
            )}`
          : null;

      if (
        !startStr
      ) {
        continue;
      }

      const startDate =
        new Date(
          startStr
        );

      const diffDays =
        Math.ceil(
          Math.abs(
            targetDate.getTime() -
              startDate.getTime()
          ) /
            (
              1000 *
              60 *
              60 *
              24
            )
        );

      let isMatch =
        false;

      if (
        anime.format ===
          "MOVIE" ||
        anime.format ===
          "SPECIAL" ||
        anime.episodes ===
          1
      ) {
        if (
          diffDays <= 2
        ) {
          isMatch =
            true;
        }

      } else {
        const startLimit =
          new Date(
            startDate
          );

        startLimit.setDate(
          startLimit.getDate() -
            2
        );

        if (
          targetDate >=
          startLimit
        ) {
          if (
            anime.endDate &&
            anime.endDate.year
          ) {
            const endDate =
              new Date(
                anime.endDate.year,
                (
                  anime.endDate.month ||
                  12
                ) - 1,
                anime.endDate.day ||
                  31
              );

            endDate.setDate(
              endDate.getDate() +
                2
            );

            if (
              targetDate <=
              endDate
            ) {
              isMatch =
                true;
            }

          } else {
            isMatch =
              true;
          }
        }
      }

      if (
        !isMatch
      ) {
        continue;
      }

      const isTV =
        anime.format !==
          "MOVIE" &&
        anime.format !==
          "SPECIAL" &&
        anime.episodes !==
          1;

      let episodeNum =
        isTV &&
        originalEpisode
          ? originalEpisode
          : dayIndex ||
            1;

      const episodes =
        anime.streamingEpisodes ||
        [];

      if (
        episodes.length > 1 &&
        episodeTitle
      ) {
        const cleanTarget =
          episodeTitle
            .toLowerCase()
            .replace(
              /[^a-z0-9]/g,
              ""
            );

        for (
          let j = 0;
          j < episodes.length;
          j++
        ) {
          const cleanAl =
            (
              episodes[j].title ||
              ""
            )
              .toLowerCase()
              .replace(
                /[^a-z0-9]/g,
                ""
              );

          if (
            cleanAl &&
            (
              cleanAl.includes(
                cleanTarget
              ) ||
              cleanTarget.includes(
                cleanAl
              )
            )
          ) {
            episodeNum =
              j + 1;

            break;
          }
        }
      }

      return {
        alId:
          anime.id,

        episode:
          episodeNum,

        title:
          anime.title?.english ||
          anime.title?.romaji ||
          anime.title?.native
      };
    }

  } catch {
    // Fallback returns null.
  }

  return null;
}

// =========================================================
// REANIME SEARCH
// =========================================================

function normalizeTitle(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

// =========================================================
// CANDIDATE SCORE
// =========================================================

function scoreCandidate(
  title,
  query,
  year,
  targetAnilistId,
  candidateAnilistId
) {
  if (
    targetAnilistId &&
    candidateAnilistId &&
    String(
      targetAnilistId
    ) ===
      String(
        candidateAnilistId
      )
  ) {
    return 1000;
  }

  const a =
    normalizeTitle(
      title
    );

  const b =
    normalizeTitle(
      query
    );

  if (
    !a ||
    !b
  ) {
    return 0;
  }

  let score =
    0;

  if (
    a === b
  ) {
    score +=
      100;
  }

  if (
    a.includes(b) ||
    b.includes(a)
  ) {
    score +=
      50;
  }

  const words =
    b.split(
      /\s+/
    ).filter(
      Boolean
    );

  for (
    const word of
    words
  ) {
    if (
      a.includes(
        word
      )
    ) {
      score +=
        4;
    }
  }

  if (
    year &&
    String(
      title
    ).includes(
      String(
        year
      )
    )
  ) {
    score +=
      10;
  }

  return score;
}

// =========================================================
// EXTRACT ANILIST ID
// =========================================================

function extractAnilistId(
  item
) {
  const direct =
    item &&
    (
      item.anilist_id ||
      item.anilistId
    );

  if (
    direct
  ) {
    return String(
      direct
    );
  }

  const imageUrls = [
    item?.cover_image?.extra_large,
    item?.cover_image?.large,
    item?.cover_image?.medium,
    item?.banner_image
  ].filter(
    Boolean
  );

  for (
    const url of
    imageUrls
  ) {
    const match =
      String(
        url
      ).match(
        /\/b?x?(\d+)-|\/(\d+)[-.]/
      );

    if (
      match
    ) {
      return (
        match[1] ||
        match[2]
      );
    }
  }

  return null;
}

// =========================================================
// SEARCH REANIME
// =========================================================

async function searchReanimeAnime(
  query,
  year,
  targetAnilistId = null
) {
  const endpoints = [
    `/api/v1/search?q=${encodeURIComponent(
      query
    )}&limit=36`,

    `/api/search?q=${encodeURIComponent(
      query
    )}`
  ];

  const candidates =
    [];

  for (
    const endpoint of
    endpoints
  ) {
    try {
      const text =
        await fetchText(
          endpoint
        );

      if (
        !text.trim().startsWith(
          "{"
        ) &&
        !text.trim().startsWith(
          "["
        )
      ) {
        continue;
      }

      const json =
        JSON.parse(
          text
        );

      const list =
        json.results ||
        json.data ||
        json.anime ||
        (
          Array.isArray(
            json
          )
            ? json
            : null
        );

      if (
        !Array.isArray(
          list
        )
      ) {
        continue;
      }

      list.forEach(
        item => {
          const rawSlug =
            item.anime_id ||
            item.slug ||
            item.id ||
            item.url;

          if (
            !rawSlug
          ) {
            return;
          }

          const cleanSlug =
            String(
              rawSlug
            ).replace(
              /-[a-z0-9]{6}$/,
              ""
            );

          const titles =
            [];

          if (
            typeof item.title ===
              "object" &&
            item.title
          ) {
            if (
              item.title.english
            ) {
              titles.push(
                item.title.english
              );
            }

            if (
              item.title.romaji
            ) {
              titles.push(
                item.title.romaji
              );
            }

            if (
              item.title.native
            ) {
              titles.push(
                item.title.native
              );
            }

          } else if (
            item.title
          ) {
            titles.push(
              item.title
            );
          }

          if (
            item.name
          ) {
            titles.push(
              item.name
            );
          }

          if (
            titles.length ===
            0
          ) {
            titles.push(
              cleanSlug
            );
          }

          const alId =
            extractAnilistId(
              item
            );

          let bestScore =
            0;

          for (
            const title of
            titles
          ) {
            const score =
              scoreCandidate(
                title,
                query,
                year,
                targetAnilistId,
                alId
              );

            if (
              score >
              bestScore
            ) {
              bestScore =
                score;
            }
          }

          candidates.push({
            slug:
              String(
                rawSlug
              ),

            cleanSlug,

            title:
              titles[0],

            anilistId:
              alId,

            score:
              bestScore
          });
        }
      );

    } catch {
      // Try next ReAnime endpoint.
    }

    if (
      candidates.some(
        candidate =>
          candidate.score >=
          1000
      )
    ) {
      break;
    }

    if (
      candidates.length >
        0 &&
      !targetAnilistId
    ) {
      break;
    }
  }

  const unique =
    [];

  const seen =
    new Set();

  for (
    const candidate of
    candidates
  ) {
    if (
      !candidate.slug ||
      seen.has(
        candidate.slug
      )
    ) {
      continue;
    }

    seen.add(
      candidate.slug
    );

    unique.push(
      candidate
    );
  }

  unique.sort(
    (
      a,
      b
    ) =>
      b.score -
      a.score
  );

  return unique.length >
    0
    ? unique[0]
    : null;
}

// =========================================================
// FLIX EMBEDS
// =========================================================

async function getFlixEmbeds(
  slug,
  episodeNumber,
  language,
  anilistId
) {
  const watchPath =
    `/watch/${
      slug ||
      "anime"
    }?ep=${
      episodeNumber
    }`;

  // =======================================================
  // DIRECT ANILIST LOOKUP
  // =======================================================

  if (
    anilistId
  ) {
    try {
      const flixUrl =
        `/api/flix/${anilistId}/${episodeNumber}`;

      const json =
        await fetchJson(
          flixUrl,
          {
            headers: {
              Referer:
                absolutize(
                  watchPath
                )
            }
          }
        );

      if (
        json.success &&
        Array.isArray(
          json.servers
        ) &&
        json.servers.length >
          0
      ) {
        const filtered =
          language
            ? json.servers.filter(
                server =>
                  server.dataType &&
                  server.dataType.toLowerCase() ===
                    language.toLowerCase()
              )
            : json.servers;

        return {
          watchUrl:
            absolutize(
              watchPath
            ),

          servers:
            filtered,

          embeds:
            filtered
              .map(
                server =>
                  server.dataLink
              )
              .filter(
                Boolean
              )
        };
      }

    } catch {
      // Continue with slug fallback.
    }
  }

  // =======================================================
  // SLUG FALLBACK
  // =======================================================

  if (
    slug
  ) {
    try {
      const animeApiUrl =
        `/api/v1/anime/${slug}`;

      const animeData =
        await fetchJson(
          animeApiUrl
        );

      const alId =
        animeData?.anilist_id;

      if (
        alId
      ) {
        const flixUrl =
          `/api/flix/${alId}/${episodeNumber}`;

        const json =
          await fetchJson(
            flixUrl,
            {
              headers: {
                Referer:
                  absolutize(
                    watchPath
                  )
              }
            }
          );

        if (
          json.success &&
          Array.isArray(
            json.servers
          ) &&
          json.servers.length >
            0
        ) {
          const filtered =
            language
              ? json.servers.filter(
                  server =>
                    server.dataType &&
                    server.dataType.toLowerCase() ===
                      language.toLowerCase()
                )
              : json.servers;

          return {
            watchUrl:
              absolutize(
                watchPath
              ),

            servers:
              filtered,

            embeds:
              filtered
                .map(
                  server =>
                    server.dataLink
                )
                .filter(
                  Boolean
                )
          };
        }
      }

    } catch {
      // Continue.
    }

    // =====================================================
    // HTML ANILIST FALLBACK
    // =====================================================

    try {
      const html =
        await fetchText(
          `/anime/${slug}?_ep=${episodeNumber}`
        );

      const anilistMatch =
        html.match(
          /anilist_id:\s*(\d+)/
        );

      if (
        anilistMatch
      ) {
        const alId =
          anilistMatch[1];

        const flixUrl =
          `/api/flix/${alId}/${episodeNumber}`;

        const json =
          await fetchJson(
            flixUrl,
            {
              headers: {
                Referer:
                  absolutize(
                    watchPath
                  )
              }
            }
          );

        if (
          json.success &&
          Array.isArray(
            json.servers
          ) &&
          json.servers.length >
            0
        ) {
          const filtered =
            language
              ? json.servers.filter(
                  server =>
                    server.dataType &&
                    server.dataType.toLowerCase() ===
                      language.toLowerCase()
                )
              : json.servers;

          return {
            watchUrl:
              absolutize(
                watchPath
              ),

            servers:
              filtered,

            embeds:
              filtered
                .map(
                  server =>
                    server.dataLink
                )
                .filter(
                  Boolean
                )
          };
        }
      }

    } catch {
      // Continue.
    }
  }

  return {
    watchUrl:
      absolutize(
        watchPath
      ),

    servers:
      [],

    embeds:
      []
  };
}

// =========================================================
// FLIXCLOUD DOWNLOAD
// =========================================================

async function extractFlixCloudDownload(
  embedUrl
) {
  try {
    const match =
      embedUrl.match(
        /\/e\/([a-z0-9]+)/i
      );

    const aid =
      match
        ? match[1]
        : null;

    if (
      !aid
    ) {
      return null;
    }

    const dlHeaders = {
      Accept:
        "*/*",

      Referer:
        `${FLIXCLOUD_BASE}/`,

      "User-Agent":
        USER_AGENT
    };

    const res =
      await fetch(
        `${FLIXCLOUD_BASE}/d/${aid}/__data.json`,
        {
          headers:
            dlHeaders
        }
      );

    if (
      !res.ok
    ) {
      return null;
    }

    const dataBody =
      await res.text();

    const fileIdMatch =
      dataBody.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      );

    const tokenMatch =
      dataBody.match(
        /eyJ[\w-]+\.[\w-]+\.[\w-]+/
      );

    const baseMatch =
      dataBody.match(
        /https:\/\/[a-z0-9-]+\.flixcloud\.cc/i
      );

    const resolutionMatch =
      dataBody.match(
        /(\d{3,4}p)/
      );

    const sizeMatch =
      dataBody.match(
        /"(\d+(?:\.\d+)?\s*[KMG]B)"/i
      );

    const fileId =
      fileIdMatch
        ? fileIdMatch[0]
        : null;

    const token =
      tokenMatch
        ? tokenMatch[0]
        : null;

    const base =
      baseMatch
        ? baseMatch[0]
        : FLIXCLOUD_BASE;

    const resolution =
      resolutionMatch
        ? resolutionMatch[1]
        : null;

    const size =
      sizeMatch
        ? sizeMatch[1]
        : "Unknown";

    if (
      !fileId ||
      !token
    ) {
      return null;
    }

    let ready =
      false;

    try {
      const progRes =
        await fetch(
          `${base}/download/${fileId}/progress?token=${token}`,
          {
            headers:
              dlHeaders
          }
        );

      if (
        progRes.ok
      ) {
        const text =
          await progRes.text();

        if (
          text.includes(
            '"status":"ready"'
          ) ||
          text.includes(
            '"ready"'
          )
        ) {
          ready =
            true;
        }
      }

    } catch {
      // Ignore progress failure.
    }

    const fileUrl =
      `${base}/download/${fileId}?token=${token}`;

    return {
      url:
        fileUrl,

      quality:
        resolution ||
        "1080p",

      size,

      type:
        "mkv",

      headers:
        dlHeaders,

      ready
    };

  } catch {
    return null;
  }
}

// =========================================================
// MAIN PROVIDER
// =========================================================

export async function getStreams({
  imdbId,
  type,
  season = null,
  episode = null
}) {
  try {
    if (
      type !== "movie" &&
      type !== "series"
    ) {
      return [];
    }

    // =====================================================
    // INITIAL VALUES
    // =====================================================

    let alId =
      null;

    let episodeNumber =
      type === "series"
        ? Number(
            episode || 1
          )
        : 1;

    let searchTitle =
      "";

    let searchYear =
      null;

    // =====================================================
    // 1. ANIBRIDGE
    //
    // This is now the FIRST ID resolver.
    // =====================================================

    try {
      const mapping =
        await resolveImdbToAnilist({
          imdbId,

          type,

          season,

          episode:
            episodeNumber
        });

      if (
        mapping?.anilistId
      ) {
        alId =
          String(
            mapping.anilistId
          );

        episodeNumber =
          Number(
            mapping.episode ||
              episodeNumber
          );

        console.log(
          `[Reanime] AniBridge: ${imdbId} → AniList ${alId}, episode ${episodeNumber}`
        );
      }

    } catch (
      error
    ) {
      console.error(
        "[Reanime] AniBridge lookup failed:",
        error?.message ||
          error
      );
    }

    // =====================================================
    // 2. ORIGINAL REANIME RESOLVER
    //
    // Only used if AniBridge didn't find the item.
    // =====================================================

    if (
      !alId
    ) {
      try {
        const syncInfo =
          await getSyncInfo(
            imdbId,
            type === "movie"
              ? "movie"
              : "tv",
            season,
            episodeNumber
          );

        searchTitle =
          syncInfo.title ||
          "";

        if (
          syncInfo.releaseDate
        ) {
          searchYear =
            syncInfo.releaseDate.substring(
              0,
              4
            );
        }

        const syncResult =
          await resolveByDate(
            syncInfo.releaseDate,
            syncInfo.title,
            episodeNumber,
            syncInfo.episodeTitle,
            syncInfo.dayIndex
          );

        if (
          syncResult &&
          syncResult.alId
        ) {
          alId =
            String(
              syncResult.alId
            );

          episodeNumber =
            syncResult.episode;

          searchTitle =
            syncResult.title ||
            searchTitle;
        }

      } catch {
        // Continue to TMDB fallback.
      }
    }

    // =====================================================
    // 3. TMDB TITLE/YEAR FALLBACK
    // =====================================================

    if (
      !searchTitle ||
      !searchYear
    ) {
      try {
        const tmdb =
          await getTmdbInfo(
            imdbId,
            type === "movie"
              ? "movie"
              : "tv"
          );

        if (
          !searchTitle
        ) {
          searchTitle =
            tmdb.title;
        }

        if (
          !searchYear
        ) {
          searchYear =
            tmdb.year;
        }

      } catch {
        // Ignore.
      }
    }

    // =====================================================
    // GET FLIX SERVERS
    // =====================================================

    const serversByLang =
      {};

    let watchUrl =
      "";

    if (
      alId
    ) {
      for (
        const lang of [
          "sub",
          "dub"
        ]
      ) {
        try {
          const res =
            await getFlixEmbeds(
              null,
              episodeNumber,
              lang,
              alId
            );

          if (
            res.servers &&
            res.servers.length >
              0
          ) {
            serversByLang[
              lang
            ] =
              res.servers;

            if (
              res.watchUrl
            ) {
              watchUrl =
                res.watchUrl;
            }
          }

        } catch {
          // Continue.
        }
      }
    }

    // =====================================================
    // REANIME SEARCH FALLBACK
    // =====================================================

    if (
      Object.keys(
        serversByLang
      ).length === 0
    ) {
      if (
        !searchTitle &&
        alId
      ) {
        const alInfo =
          await getAnilistInfo(
            alId
          );

        searchTitle =
          alInfo.title;

        searchYear =
          alInfo.year;
      }

      if (
        searchTitle
      ) {
        const anime =
          await searchReanimeAnime(
            searchTitle,
            searchYear,
            alId
          );

        if (
          anime
        ) {
          const slug =
            anime.slug;

          const finalAlId =
            alId ||
            anime.anilistId;

          for (
            const lang of [
              "sub",
              "dub"
            ]
          ) {
            try {
              const res =
                await getFlixEmbeds(
                  slug,
                  episodeNumber,
                  lang,
                  finalAlId
                );

              if (
                res.servers &&
                res.servers.length >
                  0
              ) {
                serversByLang[
                  lang
                ] =
                  res.servers;

                if (
                  res.watchUrl
                ) {
                  watchUrl =
                    res.watchUrl;
                }
              }

            } catch {
              // Continue.
            }
          }
        }
      }
    }

    // =====================================================
    // NO SERVERS
    // =====================================================

    if (
      Object.keys(
        serversByLang
      ).length === 0
    ) {
      return [];
    }

    // =====================================================
    // BUILD STREAMS
    // =====================================================

    const streams =
      [];

    const seen =
      new Set();

    const tasks =
      [];

    for (
      const language of [
        "sub",
        "dub"
      ]
    ) {
      const serverList =
        serversByLang[
          language
        ] || [];

      for (
        let i = 0;
        i <
        serverList.length;
        i++
      ) {
        const server =
          serverList[i];

        const dataLink =
          server.dataLink;

        if (
          !dataLink
        ) {
          continue;
        }

        const serverName =
          server.serverName ||
          `HD-${i + 1}`;

        const langUpper =
          language.toUpperCase();

        const displayTitle =
          searchTitle ||
          "Anime";

        const streamTitle =
          type === "movie"
            ? `${displayTitle} (${langUpper})`
            : `${displayTitle} - Episode ${episodeNumber} (${langUpper})`;

        tasks.push(
          (async () => {
            try {
              const directDl =
                await extractFlixCloudDownload(
                  dataLink
                );

              if (
                directDl &&
                directDl.url
              ) {
                return {
                  name:
                    `Reanime [${langUpper}] ${serverName} (${directDl.quality || "1080p"})`,

                  title:
                    streamTitle,

                  url:
                    directDl.url,

                  quality:
                    directDl.quality ||
                    "1080p",

                  size:
                    directDl.size ||
                    "Unknown",

                  headers:
                    directDl.headers,

                  provider:
                    "reanime",

                  type:
                    "mkv"
                };
              }

            } catch {
              // Ignore individual stream failure.
            }

            return null;
          })()
        );
      }
    }

    const results =
      await Promise.all(
        tasks
      );

    for (
      const result of
      results
    ) {
      if (
        result &&
        result.url &&
        !seen.has(
          result.url
        )
      ) {
        seen.add(
          result.url
        );

        streams.push(
          result
        );
      }
    }

    // =====================================================
    // QUALITY SORT
    // =====================================================

    const qualityRank = {
      auto:
        4000,

      adaptive:
        4000,

      "2160p":
        2160,

      "4k":
        2160,

      "1080p":
        1080,

      "720p":
        720,

      "480p":
        480,

      "360p":
        360,

      unknown:
        0
    };

    streams.sort(
      (
        a,
        b
      ) => {
        const qa =
          qualityRank[
            String(
              a.quality ||
                ""
            ).toLowerCase()
          ] ||
          0;

        const qb =
          qualityRank[
            String(
              b.quality ||
                ""
            ).toLowerCase()
          ] ||
          0;

        return (
          qb -
          qa
        );
      }
    );

    return streams;

  } catch (
    error
  ) {
    console.error(
      `[Reanime] Error: ${
        error?.message ||
        error
      }`
    );

    return [];
  }
}
