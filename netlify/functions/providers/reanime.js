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
      console.log(
        `[Reanime HTTP] GET ${tryUrl}`
      );

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

      console.log(
        `[Reanime HTTP] ${response.status} ${tryUrl}`
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

            console.log(
              `[Reanime] Active domain changed to ${activeBaseUrl}`
            );
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
      console.error(
        `[Reanime HTTP] Request failed: ${tryUrl}`,
        error?.message ||
          error
      );

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

  try {
    return JSON.parse(
      text
    );
  } catch (
    error
  ) {
    console.error(
      "[Reanime HTTP] JSON parse failed for:",
      url
    );

    console.error(
      "[Reanime HTTP] Response preview:",
      text.substring(
        0,
        500
      )
    );

    throw error;
  }
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

  console.log(
    `[Reanime] TMDB lookup: ${tmdbId} (${mediaType})`
  );

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

  } catch (
    error
  ) {
    console.error(
      "[Reanime] TMDB lookup failed:",
      error?.message ||
        error
    );

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

  console.log(
    `[Reanime] AniList metadata lookup: ${alId}`
  );

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
      console.log(
        `[Reanime] AniList ${alId} returned no Media`
      );

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

  } catch (
    error
  ) {
    console.error(
      "[Reanime] AniList metadata failed:",
      error?.message ||
        error
    );

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

  console.log(
    `[Reanime] Cinemeta lookup: ${url}`
  );

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
      console.log(
        `[Reanime] Cinemeta could not find S${season}E${episode}`
      );

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

  } catch (
    error
  ) {
    console.error(
      "[Reanime] Cinemeta failed:",
      error?.message ||
        error
    );

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
// =========================================================

async function getSyncInfo(
  id,
  mediaType,
  season,
  episode
) {
  console.log(
    `[Reanime] Original resolver: ${id} ${mediaType} S${season}E${episode}`
  );

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

    } catch (
      error
    ) {
      console.error(
        "[Reanime] ARM lookup failed:",
        error?.message ||
          error
      );
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
// ORIGINAL ANILIST DATE RESOLVER
// =========================================================

async function resolveByDate(
  releaseDateStr,
  showTitle,
  originalEpisode,
  episodeTitle,
  dayIndex
) {
  console.log(
    "[Reanime] Original AniList date resolver:",
    JSON.stringify({
      releaseDateStr,
      showTitle,
      originalEpisode,
      episodeTitle,
      dayIndex
    })
  );

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

    console.log(
      `[Reanime] AniList date resolver candidates: ${candidates.length}`
    );

    if (
      candidates.length ===
      0
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

      console.log(
        `[Reanime] Date resolver matched AniList ${anime.id} -> episode ${episodeNum}`
      );

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

  } catch (
    error
  ) {
    console.error(
      "[Reanime] AniList date resolver failed:",
      error?.stack ||
        error
    );
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
  console.log(
    `[Reanime] Searching ReAnime: "${query}" (${year || "no year"})`
  );

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
      console.log(
        `[Reanime] Search endpoint: ${endpoint}`
      );

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
        console.log(
          "[Reanime] Search response was not JSON"
        );

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
        console.log(
          "[Reanime] Search returned no usable list"
        );

        continue;
      }

      console.log(
        `[Reanime] Search returned ${list.length} candidates`
      );

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

    } catch (
      error
    ) {
      console.error(
        "[Reanime] Search endpoint failed:",
        error?.stack ||
          error
      );
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

  const best =
    unique.length >
    0
      ? unique[0]
      : null;

  console.log(
    "[Reanime] Best search result:",
    JSON.stringify(
      best
    )
  );

  return best;
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

  console.log(
    `[Reanime] getFlixEmbeds: AniList=${anilistId}, episode=${episodeNumber}, language=${language}`
  );

  // =======================================================
  // DIRECT ANILIST LOOKUP
  // =======================================================

  if (
    anilistId
  ) {
    try {
      const flixUrl =
        `/api/flix/${anilistId}/${episodeNumber}`;

      console.log(
        `[Reanime] Calling Flix API: ${flixUrl}`
      );

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

      console.log(
        "[Reanime] Flix API response:",
        JSON.stringify({
          success:
            json?.success,

          serverCount:
            Array.isArray(
              json?.servers
            )
              ? json.servers.length
              : 0
        })
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

        console.log(
          `[Reanime] ${language} servers after filter: ${filtered.length}`
        );

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

    } catch (
      error
    ) {
      console.error(
        `[Reanime] Direct Flix API failed for AniList ${anilistId}:`,
        error?.stack ||
          error
      );
    }
  }

  // =======================================================
  // SLUG FALLBACK
  // =======================================================

  if (
    slug
  ) {
    try {
      console.log(
        `[Reanime] Trying slug API: ${slug}`
      );

      const animeApiUrl =
        `/api/v1/anime/${slug}`;

      const animeData =
        await fetchJson(
          animeApiUrl
        );

      const alId =
        animeData?.anilist_id;

      console.log(
        `[Reanime] Slug API AniList ID: ${alId || "none"}`
      );

      if (
        alId
      ) {
        const flixUrl =
          `/api/flix/${alId}/${episodeNumber}`;

        console.log(
          `[Reanime] Calling Flix API via slug: ${flixUrl}`
        );

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

        console.log(
          "[Reanime] Slug Flix response:",
          JSON.stringify({
            success:
              json?.success,

            serverCount:
              Array.isArray(
                json?.servers
              )
                ? json.servers.length
                : 0
          })
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

    } catch (
      error
    ) {
      console.error(
        "[Reanime] Slug fallback failed:",
        error?.stack ||
          error
      );
    }

    // =====================================================
    // HTML ANILIST FALLBACK
    // =====================================================

    try {
      console.log(
        `[Reanime] Trying HTML AniList fallback: ${slug}`
      );

      const html =
        await fetchText(
          `/anime/${slug}?_ep=${episodeNumber}`
        );

      const anilistMatch =
        html.match(
          /anilist_id:\s*(\d+)/
        );

      console.log(
        `[Reanime] HTML AniList ID: ${
          anilistMatch
            ? anilistMatch[1]
            : "none"
        }`
      );

      if (
        anilistMatch
      ) {
        const alId =
          anilistMatch[1];

        const flixUrl =
          `/api/flix/${alId}/${episodeNumber}`;

        console.log(
          `[Reanime] Calling Flix API via HTML ID: ${flixUrl}`
        );

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

    } catch (
      error
    ) {
      console.error(
        "[Reanime] HTML AniList fallback failed:",
        error?.stack ||
          error
      );
    }
  }

  console.log(
    `[Reanime] No Flix servers found for AniList=${anilistId}, episode=${episodeNumber}, language=${language}`
  );

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
  console.log(
    "[Reanime] FlixCloud embed:",
    embedUrl
  );

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
      console.error(
        "[Reanime] Could not extract FlixCloud AID from:",
        embedUrl
      );

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

    const dataUrl =
      `${FLIXCLOUD_BASE}/d/${aid}/__data.json`;

    console.log(
      `[Reanime] Fetching FlixCloud data: ${dataUrl}`
    );

    const res =
      await fetch(
        dataUrl,
        {
          headers:
            dlHeaders
        }
      );

    console.log(
      `[Reanime] FlixCloud HTTP ${res.status}`
    );

    if (
      !res.ok
    ) {
      console.error(
        `[Reanime] FlixCloud returned HTTP ${res.status}`
      );

      return null;
    }

    const dataBody =
      await res.text();

    console.log(
      `[Reanime] FlixCloud response size: ${dataBody.length} bytes`
    );

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

    console.log(
      "[Reanime] FlixCloud extraction:",
      JSON.stringify({
        aid,
        hasFileId:
          !!fileId,
        hasToken:
          !!token,
        base,
        resolution,
        size
      })
    );

    if (
      !fileId ||
      !token
    ) {
      console.error(
        "[Reanime] Missing FlixCloud fileId or token"
      );

      return null;
    }

    let ready =
      false;

    try {
      const progressUrl =
        `${base}/download/${fileId}/progress?token=${token}`;

      console.log(
        `[Reanime] Checking FlixCloud progress: ${progressUrl}`
      );

      const progRes =
        await fetch(
          progressUrl,
          {
            headers:
              dlHeaders
          }
        );

      console.log(
        `[Reanime] FlixCloud progress HTTP ${progRes.status}`
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

    } catch (
      error
    ) {
      console.error(
        "[Reanime] FlixCloud progress failed:",
        error?.message ||
          error
      );
    }

    const fileUrl =
      `${base}/download/${fileId}?token=${token}`;

    console.log(
      "[Reanime] Direct download URL generated"
    );

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

  } catch (
    error
  ) {
    console.error(
      "[Reanime] FlixCloud extraction ERROR:",
      error?.stack ||
        error
    );

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
  console.log(
    "[Reanime] ========================================"
  );

  console.log(
    "[Reanime] REQUEST:",
    JSON.stringify({
      imdbId,
      type,
      season,
      episode
    })
  );

  try {
    if (
      type !== "movie" &&
      type !== "series"
    ) {
      console.error(
        `[Reanime] Unsupported type: ${type}`
      );

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

    console.log(
      `[Reanime] Initial state: IMDb=${imdbId}, type=${type}, season=${season}, episode=${episodeNumber}`
    );

    // =====================================================
    // 1. ANIBRIDGE
    // =====================================================

    try {
      console.log(
        "[Reanime] Starting AniBridge lookup..."
      );

      const mapping =
        await resolveImdbToAnilist({
          imdbId,

          type,

          season,

          episode:
            episodeNumber
        });

      console.log(
        "[Reanime] AniBridge result:",
        JSON.stringify(
          mapping
        )
      );

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
          `[Reanime] AniBridge SUCCESS: ${imdbId} -> AniList ${alId}, episode ${episodeNumber}`
        );
      } else {
        console.log(
          `[Reanime] AniBridge did not find ${imdbId}`
        );
      }

    } catch (
      error
    ) {
      console.error(
        "[Reanime] AniBridge lookup failed:",
        error?.stack ||
          error
      );
    }

    // =====================================================
    // 2. ORIGINAL REANIME RESOLVER
    // =====================================================

    if (
      !alId
    ) {
      console.log(
        "[Reanime] Starting original resolver fallback..."
      );

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

        console.log(
          "[Reanime] Sync info:",
          JSON.stringify(
            syncInfo
          )
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

        console.log(
          "[Reanime] Original resolver result:",
          JSON.stringify(
            syncResult
          )
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

          console.log(
            `[Reanime] Original resolver SUCCESS: AniList=${alId}, episode=${episodeNumber}`
          );
        }

      } catch (
        error
      ) {
        console.error(
          "[Reanime] Original resolver failed:",
          error?.stack ||
            error
        );
      }
    }

    // =====================================================
    // 3. TMDB TITLE/YEAR FALLBACK
    // =====================================================

    if (
      !searchTitle ||
      !searchYear
    ) {
      console.log(
        "[Reanime] Getting TMDB title/year fallback..."
      );

      try {
        const tmdb =
          await getTmdbInfo(
            imdbId,
            type === "movie"
              ? "movie"
              : "tv"
          );

        console.log(
          "[Reanime] TMDB fallback:",
          JSON.stringify(
            tmdb
          )
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

      } catch (
        error
      ) {
        console.error(
          "[Reanime] TMDB fallback failed:",
          error?.stack ||
            error
        );
      }
    }

    console.log(
      "[Reanime] Resolved state:",
      JSON.stringify({
        alId,
        episodeNumber,
        searchTitle,
        searchYear
      })
    );

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
      console.log(
        `[Reanime] Fetching Flix servers for AniList ${alId}`
      );

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

          console.log(
            `[Reanime] ${lang} server result: ${res.servers?.length || 0}`
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

        } catch (
          error
        ) {
          console.error(
            `[Reanime] ${lang} server lookup failed:`,
            error?.stack ||
              error
          );
        }
      }
    } else {
      console.log(
        "[Reanime] No AniList ID available, skipping direct Flix lookup"
      );
    }

    // =====================================================
    // REANIME SEARCH FALLBACK
    // =====================================================

    if (
      Object.keys(
        serversByLang
      ).length ===
      0
    ) {
      console.log(
        "[Reanime] No direct Flix servers. Starting ReAnime search fallback..."
      );

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

          console.log(
            "[Reanime] Search selected:",
            JSON.stringify({
              slug,
              anilistId:
                finalAlId,
              title:
                anime.title,
              score:
                anime.score
            })
          );

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

              console.log(
                `[Reanime] Search fallback ${lang}: ${res.servers?.length || 0} servers`
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

            } catch (
              error
            ) {
              console.error(
                `[Reanime] Search fallback ${lang} failed:`,
                error?.stack ||
                  error
              );
            }
          }

        } else {
          console.log(
            "[Reanime] ReAnime search returned no candidate"
          );
        }

      } else {
        console.log(
          "[Reanime] No search title available"
        );
      }
    }

    // =====================================================
    // NO SERVERS
    // =====================================================

    if (
      Object.keys(
        serversByLang
      ).length ===
      0
    ) {
      console.error(
        "[Reanime] NO SERVERS FOUND"
      );

      console.log(
        "[Reanime] Final debug state:",
        JSON.stringify({
          imdbId,
          type,
          season,
          episode,
          alId,
          episodeNumber,
          searchTitle,
          searchYear
        })
      );

      return [];
    }

    console.log(
      "[Reanime] Server languages:",
      Object.keys(
        serversByLang
      )
    );

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

      console.log(
        `[Reanime] ${language}: ${serverList.length} servers`
      );

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
          console.log(
            `[Reanime] Server ${i} has no dataLink`
          );

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
                console.log(
                  `[Reanime] Stream extracted: ${serverName} ${directDl.quality || "1080p"} ${language}`
                );

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

              console.error(
                `[Reanime] Failed to extract stream from ${serverName}`
              );

            } catch (
              error
            ) {
              console.error(
                `[Reanime] Individual stream extraction failed:`,
                error?.stack ||
                  error
              );
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

    console.log(
      `[Reanime] FINAL STREAM COUNT: ${streams.length}`
    );

    console.log(
      "[Reanime] FINAL STREAMS:",
      JSON.stringify(
        streams.map(
          stream => ({
            name:
              stream.name,

            quality:
              stream.quality,

            size:
              stream.size
          })
        )
      )
    );

    console.log(
      "[Reanime] ========================================"
    );

    return streams;

  } catch (
    error
  ) {
    console.error(
      "[Reanime] FATAL ERROR:",
      error?.stack ||
        error
    );

    return [];
  }
}
