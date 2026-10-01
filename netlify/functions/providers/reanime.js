import { resolveImdbToAnilist } from "./reanime-id-map.js";
import { resolveFlixCloud } from "./flixcloud.js";

// =========================================================
// CONSTANTS
// =========================================================

const REANIME_DOMAINS = [
  "https://reanime.to",
  "https://reanime.cz",
  "https://reanime.wtf"
];

const REANIME_BASE = REANIME_DOMAINS[0];

const TMDB_API_KEY =
  "439c478a771f35c05022f9feabcca01c";

const ANILIST_URL =
  "https://graphql.anilist.co";

const ARM_BASE =
  "https://arm.haglund.dev/api/v2";

const CINEMETA_URL =
  "https://v3-cinemeta.strem.io/meta";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept":
    "application/json, text/plain, */*",
  "Accept-Language":
    "en-US,en;q=0.9"
};

// =========================================================
// ACTIVE REANIME DOMAIN
// =========================================================

let activeBaseUrl = REANIME_BASE;

// =========================================================
// URL HELPERS
// =========================================================

function absolutize(
  path,
  base = activeBaseUrl
) {
  if (!path)
    return "";

  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  const cleanPath =
    path.startsWith("/")
      ? path
      : `/${path}`;

  return `${base}${cleanPath}`;
}

// =========================================================
// HTTP
// =========================================================

async function fetchText(
  url,
  options = {}
) {
  const isAbsolute =
    url.startsWith("http://") ||
    url.startsWith("https://");

  const urlsToTry = isAbsolute
    ? [url]
    : REANIME_DOMAINS.map(
        (domain) =>
          absolutize(url, domain)
      );

  let lastError = null;

  for (const tryUrl of urlsToTry) {
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
              ...(options.headers || {})
            }
          }
        );

      console.log(
        `[Reanime HTTP] ${tryUrl} -> ${response.status}`
      );

      if (response.ok) {
        if (!isAbsolute) {
          const match =
            tryUrl.match(
              /^(https?:\/\/[^/]+)/
            );

          if (match) {
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
    } catch (error) {
      lastError = error;

      console.error(
        `[Reanime HTTP] ${tryUrl} failed:`,
        error.message
      );
    }
  }

  throw (
    lastError ||
    new Error(
      `Failed to fetch ${url}`
    )
  );
}

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
          ...(options.headers || {})
        }
      }
    );

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid JSON from ${url}: ${error.message}`
    );
  }
}

// =========================================================
// TMDB
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
    `https://api.themoviedb.org/3/${endpoint}/${tmdbId}` +
    `?api_key=${TMDB_API_KEY}` +
    `&append_to_response=external_ids`;

  try {
    const data =
      await fetchJson(url);

    return {
      title:
        data.name ||
        data.title ||
        data.original_name ||
        data.original_title ||
        "",

      year:
        (
          data.first_air_date ||
          data.release_date ||
          ""
        ).match(/\d{4}/)?.[0] ||
        null,

      imdbId:
        data.external_ids?.imdb_id ||
        null
    };
  } catch (error) {
    console.error(
      `[Reanime] TMDB lookup failed: ${error.message}`
    );

    return {
      title: "",
      year: null,
      imdbId: null
    };
  }
}

// =========================================================
// ANILIST
// =========================================================

async function getAnilistInfo(
  alId
) {
  const query =
    `
    query($id:Int) {
      Media(id:$id) {
        id
        title {
          english
          romaji
          native
        }
        startDate {
          year
        }
      }
    }
    `;

  try {
    const json =
      await fetchJson(
        ANILIST_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
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

    if (!media) {
      return {
        title: "",
        year: null
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
  } catch (error) {
    console.error(
      `[Reanime] AniList lookup failed: ${error.message}`
    );

    return {
      title: "",
      year: null
    };
  }
}

// =========================================================
// CINEMETA / SYNC INFO
// =========================================================

async function getSyncInfo(
  id,
  mediaType,
  season,
  episode
) {
  const isImdb =
    typeof id === "string" &&
    id.startsWith("tt");

  const getCinemetaInfo =
    async (imdbId) => {
      const type =
        mediaType === "movie"
          ? "movie"
          : "series";

      const url =
        `${CINEMETA_URL}/${type}/${imdbId}.json`;

      try {
        const data =
          await fetchJson(url);

        const meta =
          data.meta;

        if (!meta) {
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
                ? meta.released.split("T")[0]
                : null,

            title:
              meta.name,

            dayIndex: 1
          };
        }

        const videos =
          meta.videos || [];

        const target =
          videos.find(
            (video) =>
              video.season == season &&
              video.episode == episode
          );

        if (
          !target ||
          !target.released
        ) {
          return {
            date: null,
            title: null,
            dayIndex: 1
          };
        }

        const targetDate =
          target.released.split("T")[0];

        const dayIndex =
          videos.filter(
            (video) =>
              video.season == season &&
              video.released &&
              video.released.split("T")[0] ===
                targetDate &&
              parseInt(
                video.episode,
                10
              ) <
                parseInt(
                  episode,
                  10
                )
          ).length + 1;

        return {
          date: targetDate,
          title:
            target.name || null,
          dayIndex
        };
      } catch (error) {
        console.error(
          `[Reanime] Cinemeta lookup failed: ${error.message}`
        );

        return {
          date: null,
          title: null,
          dayIndex: 1
        };
      }
    };

  if (isImdb) {
    const info =
      await getCinemetaInfo(id);

    if (info.date) {
      return {
        imdbId: id,
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
    `https://api.themoviedb.org/3/` +
    `${mediaType === "movie" ? "movie" : "tv"}` +
    `/${id}` +
    `?api_key=${TMDB_API_KEY}` +
    `&append_to_response=external_ids`;

  const details =
    await fetchJson(tmdbUrl);

  let imdbId =
    details.external_ids?.imdb_id ||
    details.imdb_id ||
    null;

  const title =
    details.name ||
    details.title ||
    null;

  if (!imdbId) {
    try {
      const armData =
        await fetchJson(
          `${ARM_BASE}/themoviedb?id=${id}`
        );

      if (
        Array.isArray(armData) &&
        armData.length > 0
      ) {
        imdbId =
          armData[0].imdb ||
          null;
      }
    } catch (error) {
      console.error(
        `[Reanime] ARM lookup failed: ${error.message}`
      );
    }
  }

  if (!imdbId) {
    throw new Error(
      `No IMDb ID found for TMDB ${id}`
    );
  }

  const cMeta =
    await getCinemetaInfo(
      imdbId
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

  if (!finalDate) {
    throw new Error(
      `Could not find release date for ID ${imdbId}`
    );
  }

  return {
    imdbId,
    tmdbId: id,
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
// OLD DATE-BASED ANILIST RESOLVER
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
    `
    query($search:String) {
      Page(perPage:20) {
        media(
          search:$search,
          type:ANIME
        ) {
          id
          type
          format
          title {
            romaji
            english
            native
          }
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          episodes
          streamingEpisodes {
            title
          }
        }
      }
    }
    `;

  try {
    const json =
      await fetchJson(
        ANILIST_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
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
      const anime of candidates
    ) {
      const s =
        anime.startDate;

      const startStr =
        s?.year &&
        s?.month &&
        s?.day
          ? `${s.year}-${String(
              s.month
            ).padStart(2, "0")}-${String(
              s.day
            ).padStart(2, "0")}`
          : null;

      if (!startStr)
        continue;

      const startDate =
        new Date(startStr);

      const diffDays =
        Math.ceil(
          Math.abs(
            targetDate.getTime() -
              startDate.getTime()
          ) /
            (1000 * 60 * 60 * 24)
        );

      let isMatch =
        false;

      if (
        anime.format ===
          "MOVIE" ||
        anime.format ===
          "SPECIAL" ||
        anime.episodes === 1
      ) {
        if (
          diffDays <= 2
        ) {
          isMatch = true;
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
                (anime.endDate.month ||
                  12) - 1,
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
              isMatch = true;
            }
          } else {
            isMatch = true;
          }
        }
      }

      if (!isMatch)
        continue;

      const isTV =
        anime.format !==
          "MOVIE" &&
        anime.format !==
          "SPECIAL" &&
        anime.episodes !== 1;

      let episodeNum =
        isTV &&
        originalEpisode
          ? originalEpisode
          : dayIndex || 1;

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
  } catch (error) {
    console.error(
      `[Reanime] Date resolver failed: ${error.message}`
    );
  }

  return null;
}

// =========================================================
// TITLE HELPERS
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
    normalizeTitle(title);

  const b =
    normalizeTitle(query);

  if (!a || !b)
    return 0;

  let score = 0;

  if (a === b)
    score += 100;

  if (
    a.includes(b) ||
    b.includes(a)
  ) {
    score += 50;
  }

  const words =
    b.split(/\s+/)
      .filter(Boolean);

  for (
    const word of words
  ) {
    if (
      a.includes(word)
    ) {
      score += 4;
    }
  }

  if (
    year &&
    String(title).includes(
      String(year)
    )
  ) {
    score += 10;
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
    item?.anilist_id ||
    item?.anilistId;

  if (direct)
    return String(direct);

  const imageUrls = [
    item?.cover_image?.extra_large,
    item?.cover_image?.large,
    item?.cover_image?.medium,
    item?.banner_image
  ].filter(Boolean);

  for (
    const url of imageUrls
  ) {
    const match =
      String(url).match(
        /\/b?x?(\d+)-|\/(\d+)[-.]/
      );

    if (match) {
      return (
        match[1] ||
        match[2]
      );
    }
  }

  return null;
}

// =========================================================
// REANIME SEARCH FALLBACK
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

  const candidates = [];

  for (
    const endpoint of endpoints
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
        JSON.parse(text);

      const list =
        json.results ||
        json.data ||
        json.anime ||
        (
          Array.isArray(json)
            ? json
            : null
        );

      if (!Array.isArray(list))
        continue;

      for (
        const item of list
      ) {
        const rawSlug =
          item.anime_id ||
          item.slug ||
          item.id ||
          item.url;

        if (!rawSlug)
          continue;

        const cleanSlug =
          String(rawSlug)
            .replace(
              /-[a-z0-9]{6}$/,
              ""
            );

        const titles = [];

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

        if (item.name) {
          titles.push(
            item.name
          );
        }

        if (
          titles.length === 0
        ) {
          titles.push(
            cleanSlug
          );
        }

        const alId =
          extractAnilistId(
            item
          );

        let bestScore = 0;

        for (
          const title of titles
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
            String(rawSlug),

          cleanSlug,

          title:
            titles[0],

          anilistId:
            alId,

          score:
            bestScore
        });
      }
    } catch (error) {
      console.error(
        `[Reanime] Search endpoint failed: ${endpoint}`,
        error.message
      );
    }

    if (
      candidates.some(
        (candidate) =>
          candidate.score >=
          1000
      )
    ) {
      break;
    }

    if (
      candidates.length > 0 &&
      !targetAnilistId
    ) {
      break;
    }
  }

  const unique = [];
  const seen = new Set();

  for (
    const candidate of candidates
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
    (a, b) =>
      b.score - a.score
  );

  return unique.length > 0
    ? unique[0]
    : null;
}

// =========================================================
// REANIME FLIX SERVERS
// =========================================================

async function getFlixEmbeds(
  slug,
  episodeNumber,
  language,
  anilistId
) {
  const watchPath =
    `/watch/${slug || "anime"}?ep=${episodeNumber}`;

  // -------------------------------------------------------
  // Direct AniList -> FlixCloud lookup
  // -------------------------------------------------------

  if (anilistId) {
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
        `[Reanime] Flix API response:`,
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
        json.servers.length > 0
      ) {
        const filtered =
          language
            ? json.servers.filter(
                (server) =>
                  server.dataType &&
                  server.dataType
                    .toLowerCase() ===
                    language.toLowerCase()
              )
            : json.servers;

        console.log(
          `[Reanime] ${language || "all"} servers after filter: ${filtered.length}`
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
                (server) =>
                  server.dataLink
              )
              .filter(Boolean)
        };
      }
    } catch (error) {
      console.error(
        `[Reanime] Direct Flix API failed: ${error.message}`
      );
    }
  }

  // -------------------------------------------------------
  // Slug -> AniList ID fallback
  // -------------------------------------------------------

  if (slug) {
    try {
      const animeApiUrl =
        `/api/v1/anime/${slug}`;

      const animeData =
        await fetchJson(
          animeApiUrl
        );

      const alId =
        animeData?.anilist_id;

      if (alId) {
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
          json.servers.length > 0
        ) {
          const filtered =
            language
              ? json.servers.filter(
                  (server) =>
                    server.dataType &&
                    server.dataType
                      .toLowerCase() ===
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
                  (server) =>
                    server.dataLink
                )
                .filter(Boolean)
          };
        }
      }
    } catch (error) {
      console.error(
        `[Reanime] Slug AniList fallback failed: ${error.message}`
      );
    }

    // -----------------------------------------------------
    // HTML fallback
    // -----------------------------------------------------

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
          json.servers.length > 0
        ) {
          const filtered =
            language
              ? json.servers.filter(
                  (server) =>
                    server.dataType &&
                    server.dataType
                      .toLowerCase() ===
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
                  (server) =>
                    server.dataLink
                )
                .filter(Boolean)
          };
        }
      }
    } catch (error) {
      console.error(
        `[Reanime] HTML AniList fallback failed: ${error.message}`
      );
    }
  }

  return {
    watchUrl:
      absolutize(
        watchPath
      ),

    servers: [],

    embeds: []
  };
}

// =========================================================
// MAIN
// =========================================================

export async function getStreams({
  imdbId,
  type,
  season = null,
  episode = null
}) {
  console.log(
    `[Reanime] REQUEST:`,
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
      console.log(
        `[Reanime] Unsupported type: ${type}`
      );

      return [];
    }

    // -----------------------------------------------------
    // Resolve media type
    // -----------------------------------------------------

    const mediaType =
      type === "movie"
        ? "movie"
        : "tv";

    let alId = null;

    let episodeNumber =
      mediaType === "tv"
        ? Number(
            episode || 1
          )
        : 1;

    let searchTitle = "";

    let searchYear = null;

    // -----------------------------------------------------
    // AniBridge IMDb -> AniList
    // -----------------------------------------------------

    if (
      typeof imdbId ===
        "string" &&
      imdbId.startsWith("tt")
    ) {
      try {
        const mapped =
  await resolveImdbToAnilist({
    imdbId,
    type: mediaType,
    season,
    episode: episodeNumber
  });

        console.log(
          `[Reanime] AniBridge result:`,
          JSON.stringify(
            mapped
          )
        );

        if (
          mapped?.anilistId
        ) {
          alId =
            String(
              mapped.anilistId
            );

          episodeNumber =
            Number(
              mapped.episode ||
                episodeNumber ||
                1
            );

          console.log(
            `[Reanime] AniBridge SUCCESS: ${imdbId} -> AniList ${alId}, episode ${episodeNumber}`
          );
        } else {
          console.log(
            `[Reanime] AniBridge returned no mapping`
          );
        }
      } catch (error) {
        console.error(
          `[Reanime] AniBridge failed: ${error.message}`
        );
      }
    }

    // -----------------------------------------------------
    // Original resolver fallback
    // -----------------------------------------------------

    if (!alId) {
      try {
        console.log(
          `[Reanime] Trying original date/title resolver`
        );

        const syncInfo =
          await getSyncInfo(
            imdbId,
            mediaType,
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
          syncResult?.alId
        ) {
          alId =
            String(
              syncResult.alId
            );

          episodeNumber =
            Number(
              syncResult.episode ||
                episodeNumber ||
                1
            );

          searchTitle =
            syncResult.title ||
            searchTitle;

          console.log(
            `[Reanime] Original resolver SUCCESS: AniList ${alId}, episode ${episodeNumber}`
          );
        }
      } catch (error) {
        console.error(
          `[Reanime] Original resolver failed: ${error.message}`
        );
      }
    }

    // -----------------------------------------------------
    // TMDB title/year fallback
    // -----------------------------------------------------

    if (
      !searchTitle ||
      !searchYear
    ) {
      try {
        const tmdb =
          await getTmdbInfo(
            imdbId,
            mediaType
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

        console.log(
          `[Reanime] TMDB fallback:`,
          JSON.stringify({
            title:
              searchTitle,
            year:
              searchYear,
            imdbId:
              tmdb.imdbId
          })
        );
      } catch (error) {
        console.error(
          `[Reanime] TMDB fallback failed: ${error.message}`
        );
      }
    }

    console.log(
      `[Reanime] Resolved state:`,
      JSON.stringify({
        alId,
        episodeNumber,
        searchTitle,
        searchYear
      })
    );

    // -----------------------------------------------------
    // Get servers
    // -----------------------------------------------------

    const serversByLang =
      {};

    let watchUrl =
      "";

    if (alId) {
      for (
        const language of [
          "sub",
          "dub"
        ]
      ) {
        try {
          const result =
            await getFlixEmbeds(
              null,
              episodeNumber,
              language,
              alId
            );

          if (
            result.servers &&
            result.servers.length > 0
          ) {
            serversByLang[
              language
            ] =
              result.servers;

            if (
              result.watchUrl
            ) {
              watchUrl =
                result.watchUrl;
            }
          }
        } catch (error) {
          console.error(
            `[Reanime] ${language} server lookup failed: ${error.message}`
          );
        }
      }
    }

    // -----------------------------------------------------
    // Search fallback
    // -----------------------------------------------------

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

      if (searchTitle) {
        try {
          const anime =
            await searchReanimeAnime(
              searchTitle,
              searchYear,
              alId
            );

          if (anime) {
            console.log(
              `[Reanime] Search fallback found: ${anime.title}`
            );

            const slug =
              anime.slug;

            const finalAlId =
              alId ||
              anime.anilistId;

            for (
              const language of [
                "sub",
                "dub"
              ]
            ) {
              try {
                const result =
                  await getFlixEmbeds(
                    slug,
                    episodeNumber,
                    language,
                    finalAlId
                  );

                if (
                  result.servers &&
                  result.servers.length >
                    0
                ) {
                  serversByLang[
                    language
                  ] =
                    result.servers;

                  if (
                    result.watchUrl
                  ) {
                    watchUrl =
                      result.watchUrl;
                  }
                }
              } catch (error) {
                console.error(
                  `[Reanime] Search fallback ${language} failed: ${error.message}`
                );
              }
            }
          }
        } catch (error) {
          console.error(
            `[Reanime] Search fallback failed: ${error.message}`
          );
        }
      }
    }

    if (
      Object.keys(
        serversByLang
      ).length === 0
    ) {
      console.log(
        `[Reanime] No ReAnime servers found`
      );

      return [];
    }

    // -----------------------------------------------------
    // Log server information
    // -----------------------------------------------------

    console.log(
      `[Reanime] Server languages:`,
      Object.keys(
        serversByLang
      )
    );

    for (
      const language of [
        "sub",
        "dub"
      ]
    ) {
      console.log(
        `[Reanime] ${language}: ${
          (
            serversByLang[
              language
            ] || []
          ).length
        } servers`
      );
    }

    // -----------------------------------------------------
    // Resolve FlixCloud
    // -----------------------------------------------------

    const streams = [];

    const seen =
      new Set();

    const tasks = [];

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

        if (!dataLink)
          continue;

        const serverName =
          server.serverName ||
          `HD-${i + 1}`;

        const langUpper =
          language.toUpperCase();

        const displayTitle =
          searchTitle ||
          "Anime";

        const streamTitle =
          mediaType === "movie"
            ? `${displayTitle} (${langUpper})`
            : `${displayTitle} - Episode ${episodeNumber} (${langUpper})`;

        tasks.push(
          (async () => {
            try {
              console.log(
                `[Reanime] FlixCloud embed: ${dataLink}`
              );

              const directStream =
                await resolveFlixCloud(
                  dataLink
                );

              if (
                directStream?.url
              ) {
                console.log(
                  `[Reanime] FlixCloud resolved: ${langUpper} ${serverName}`
                );

                return {
                  name:
                    `Reanime [${langUpper}] ${serverName}`,

                  title:
                    streamTitle,

                  url:
                    directStream.url,

                  quality:
                    "Auto",

                  provider:
                    "reanime",

                  type:
                    "m3u8"
                };
              }

              console.log(
                `[Reanime] FlixCloud returned no stream for ${serverName}`
              );
            } catch (error) {
              console.error(
                `[Reanime] Failed to resolve ${serverName}: ${error.message}`
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
      const result of results
    ) {
      if (
        result?.url &&
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

    // -----------------------------------------------------
    // Quality sorting
    // -----------------------------------------------------

    const qualityRank = {
      auto: 4000,
      adaptive: 4000,
      "2160p": 2160,
      "4k": 2160,
      "1080p": 1080,
      "720p": 720,
      "480p": 480,
      "360p": 360,
      unknown: 0
    };

    streams.sort(
      (a, b) => {
        const qa =
          qualityRank[
            String(
              a.quality ||
                "unknown"
            ).toLowerCase()
          ] || 0;

        const qb =
          qualityRank[
            String(
              b.quality ||
                "unknown"
            ).toLowerCase()
          ] || 0;

        return qb - qa;
      }
    );

    console.log(
      `[Reanime] FINAL STREAM COUNT: ${streams.length}`
    );

    console.log(
      `[Reanime] Stream summary:`,
      JSON.stringify(
        streams.map(
          (stream) => ({
            name:
              stream.name,
            quality:
              stream.quality,
            type:
              stream.type,
            hasUrl:
              Boolean(
                stream.url
              )
          })
        )
      )
    );

    return streams;
  } catch (error) {
    console.error(
      `[Reanime] Error: ${error.message}`
    );

    console.error(
      error.stack
    );

    return [];
  }
}
