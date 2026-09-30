import * as cheerioModule from "cheerio";

const cheerio =
  cheerioModule.default ||
  cheerioModule;

const MAIN_URL =
  "https://anizone.to";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  "Referer":
    "https://anizone.to/"
};

const TMDB_API_KEY =
  "68e094699525b18a70bab2f86b1fa706";

// =========================================================
// LOGGING
// =========================================================

function log(
  message,
  data
) {
  if (
    data === undefined
  ) {
    console.log(
      `[AniZone] ${message}`
    );
    return;
  }

  try {
    console.log(
      `[AniZone] ${message}`,
      JSON.stringify(
        data
      )
    );
  } catch {
    console.log(
      `[AniZone] ${message}`,
      data
    );
  }
}

// =========================================================
// UTILS
// =========================================================

const HEX_ESCAPE =
  /\\x([0-9a-fA-F]{2})/g;

const INVALID_BACKSLASH =
  /\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g;

function sanitizeJson(raw) {
  if (!raw) {
    return "";
  }

  return raw
    .replace(/\\u0022/g, '"')
    .replace(/\\u0026/g, "&")
    .replace(/\\'/g, "'")
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\")
    .replace(/\\&/g, "&")
    .replace(/\\'/g, "'")
    .replace(/\\0/g, "\\u0000")
    .replace(
      HEX_ESCAPE,
      (_, hex) =>
        "\\u00" + hex
    )
    .replace(
      INVALID_BACKSLASH,
      ""
    );
}

function parseXDataJson(raw) {
  return JSON.parse(
    sanitizeJson(raw)
  );
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 8000
) {
  const mergedHeaders = {
    "User-Agent":
      HEADERS["User-Agent"],

    "Referer":
      HEADERS["Referer"],

    ...(options.headers || {})
  };

  // Match the AniZone plugin's request options.
  const fetchOptions = {
    skipSizeCheck: true,
    ...options,
    headers:
      mergedHeaders
  };

  let timer = null;

  const timeoutPromise =
    new Promise(
      (_, reject) => {
        timer =
          setTimeout(
            () =>
              reject(
                new Error(
                  "Timeout"
                )
              ),
            timeoutMs
          );
      }
    );

  try {
    const response =
      await Promise.race([
        fetch(
          url,
          fetchOptions
        ),
        timeoutPromise
      ]);

    clearTimeout(timer);

    return response;

  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function fetchText(
  url,
  options = {}
) {
  const finalUrl =
    url.startsWith("http")
      ? url
      : `${MAIN_URL}${url}`;

  try {
    const response =
      await fetchWithTimeout(
        finalUrl,
        options,
        10000
      );

    log(
      `GET ${finalUrl} -> ${response.status}`
    );

    if (!response.ok) {
      let errorBody = "";

      try {
        errorBody =
          await response.text();
      } catch {}

      log(
        "AniZone request rejected",
        {
          url:
            finalUrl,

          status:
            response.status,

          server:
            response.headers?.get?.(
              "server"
            ) || "",

          contentType:
            response.headers?.get?.(
              "content-type"
            ) || "",

          bodyPreview:
            errorBody
              .slice(0, 500)
              .replace(
                /\s+/g,
                " "
              )
        }
      );

      return "";
    }

    return await response.text();

  } catch (error) {
    log(
      `GET failed: ${finalUrl}`,
      error?.message ||
        error
    );

    return "";
  }
}

async function fetchWithCookies(
  url,
  options = {}
) {
  const finalUrl =
    url.startsWith("http")
      ? url
      : `${MAIN_URL}${url}`;

  try {
    const response =
      await fetchWithTimeout(
        finalUrl,
        options,
        10000
      );

    log(
      `GET episode ${finalUrl} -> ${response.status}`
    );

    if (!response.ok) {
      let errorBody = "";

      try {
        errorBody =
          await response.text();
      } catch {}

      log(
        "Episode page rejected",
        {
          url:
            finalUrl,

          status:
            response.status,

          server:
            response.headers?.get?.(
              "server"
            ) || "",

          contentType:
            response.headers?.get?.(
              "content-type"
            ) || "",

          location:
            response.headers?.get?.(
              "location"
            ) || "",

          bodyPreview:
            errorBody
              .slice(0, 500)
              .replace(
                /\s+/g,
                " "
              )
        }
      );

      return {
        text: "",
        cookies: "",
        ok: false
      };
    }

    const text =
      await response.text();

    let cookies = "";

    try {
      if (
        typeof response
          .headers
          ?.getSetCookie ===
        "function"
      ) {
        cookies =
          response
            .headers
            .getSetCookie()
            .map(
              c =>
                c.split(
                  ";"
                )[0]
            )
            .join("; ");

      } else if (
        response.headers?.get
      ) {
        cookies =
          response.headers.get(
            "set-cookie"
          ) || "";
      }
    } catch {}

    log(
      "Episode page loaded",
      {
        characters:
          text.length,

        hasCookies:
          Boolean(cookies)
      }
    );

    return {
      text,
      cookies,
      ok: true
    };

  } catch (error) {
    log(
      `Episode request failed: ${finalUrl}`,
      error?.message ||
        error
    );

    return {
      text: "",
      cookies: "",
      ok: false
    };
  }
}

// =========================================================
// TMDB
// =========================================================

async function getTmdbId(
  imdbId,
  mediaType
) {
  try {
    log(
      "Resolving TMDB ID",
      {
        imdbId,
        mediaType
      }
    );

    const url =
      `https://api.themoviedb.org/3/find/${encodeURIComponent(
        imdbId
      )}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;

    const response =
      await fetchWithTimeout(
        url,
        {},
        5000
      );

    log(
      `TMDB find -> ${response.status}`
    );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const tmdbId =
      mediaType === "tv"
        ? data?.tv_results?.[0]
            ?.id || null
        : data?.movie_results?.[0]
            ?.id || null;

    log(
      "TMDB ID resolved",
      {
        tmdbId
      }
    );

    return tmdbId;

  } catch (error) {
    log(
      "TMDB ID resolution failed",
      error?.message ||
        error
    );

    return null;
  }
}

async function getImdbId(
  tmdbId,
  mediaType
) {
  try {
    const url =
      `https://api.themoviedb.org/3/${
        mediaType === "tv"
          ? "tv"
          : "movie"
      }/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;

    const response =
      await fetchWithTimeout(
        url,
        {},
        5000
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const imdbId =
      data.imdb_id ||
      null;

    log(
      "TMDB -> IMDb",
      {
        tmdbId,
        imdbId
      }
    );

    return imdbId;

  } catch (error) {
    log(
      "TMDB -> IMDb failed",
      error?.message ||
        error
    );

    return null;
  }
}

// =========================================================
// MAPPING
// =========================================================

function isDateMatch(
  d1,
  d2
) {
  if (!d1 || !d2) {
    return false;
  }

  const s1 =
    d1.split("T")[0];

  const s2 =
    d2.split("T")[0];

  const date1 =
    new Date(
      s1 +
        "T00:00:00Z"
    );

  const date2 =
    new Date(
      s2 +
        "T00:00:00Z"
    );

  const diff =
    Math.abs(
      date1.getTime() -
        date2.getTime()
    );

  return (
    Math.ceil(
      diff /
        (1000 *
          60 *
          60 *
          24)
    ) <= 2
  );
}

async function resolveMapping(
  imdbId,
  season,
  episode,
  tmdbId
) {
  const seasonNum =
    parseInt(
      season,
      10
    );

  const episodeNum =
    parseInt(
      episode,
      10
    );

  const mapId =
    `${imdbId}:s${season}:e${episode}`;

  log(
    "Starting AnimeSync mapping",
    {
      imdbId,
      tmdbId,
      season: seasonNum,
      episode: episodeNum
    }
  );

  let metaData =
    null;

  const metaUrls = [
    `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`,
    `https://cinemeta-live.strem.io/meta/series/${imdbId}.json`
  ];

  for (
    const url of metaUrls
  ) {
    try {
      const response =
        await fetchWithTimeout(
          url,
          {},
          5000
        );

      log(
        `Cinemeta request -> ${response.status}`
      );

      if (response.ok) {
        const json =
          await response.json();

        if (
          json?.meta?.videos
        ) {
          metaData =
            json.meta;

          log(
            "Cinemeta metadata found",
            {
              title:
                metaData.name,

              videos:
                metaData.videos
                  .length
            }
          );

          break;
        }
      }
    } catch (error) {
      log(
        "Cinemeta request failed",
        error?.message ||
          error
      );
    }
  }

  if (
    (!metaData ||
      !metaData.videos) &&
    tmdbId
  ) {
    try {
      log(
        "Falling back to TMDB episode metadata"
      );

      const tmdbEpUrl =
        `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}`;

      const tmdbResponse =
        await fetchWithTimeout(
          tmdbEpUrl,
          {},
          5000
        );

      log(
        `TMDB episode metadata -> ${tmdbResponse.status}`
      );

      if (
        tmdbResponse.ok
      ) {
        const epData =
          await tmdbResponse.json();

        if (
          epData?.air_date
        ) {
          const tvUrl =
            `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;

          const tvResponse =
            await fetchWithTimeout(
              tvUrl,
              {},
              5000
            );

          const tvData =
            tvResponse.ok
              ? await tvResponse.json()
              : {};

          metaData = {
            name:
              tvData.name ||
              tvData.original_name,

            moviedb_id:
              tmdbId,

            videos: [
              {
                season:
                  seasonNum,

                episode:
                  episodeNum,

                released:
                  epData.air_date
              }
            ]
          };
        }
      }
    } catch (error) {
      log(
        "TMDB metadata fallback failed",
        error?.message ||
          error
      );
    }
  }

  if (
    !metaData ||
    !metaData.videos
  ) {
    log(
      "No episode metadata available"
    );

    return null;
  }

  const video =
    metaData.videos.find(
      v =>
        v.season ===
          seasonNum &&
        v.episode ===
          episodeNum
    );

  if (
    !video?.released
  ) {
    log(
      "Requested episode has no release date"
    );

    return null;
  }

  const airDate =
    video.released.split(
      "T"
    )[0];

  const showTitle =
    metaData.name;

  const dayIndex =
    metaData.videos.filter(
      v => {
        if (!v.released) {
          return false;
        }

        return (
          v.released.split(
            "T"
          )[0] ===
            airDate &&
          (
            v.season <
              seasonNum ||
            (
              v.season ===
                seasonNum &&
              v.episode <
                episodeNum
            )
          )
        );
      }
    ).length;

  log(
    "Episode mapping metadata",
    {
      showTitle,
      airDate,
      dayIndex
    }
  );

  let malIds =
    [];

  const tId =
    tmdbId ||
    metaData.moviedb_id ||
    metaData.themoviedb_id;

  const tvdbId =
    metaData.tvdb_id;

  const armUrls = [
    `https://arm.haglund.dev/api/v2/imdb?id=${imdbId}`,

    tId
      ? `https://arm.haglund.dev/api/v2/themoviedb?id=${tId}`
      : null,

    tvdbId
      ? `https://arm.haglund.dev/api/v2/thetvdb?id=${tvdbId}`
      : null
  ].filter(Boolean);

  for (
    const url of armUrls
  ) {
    try {
      const response =
        await fetchWithTimeout(
          url,
          {},
          5000
        );

      log(
        `ARM request -> ${response.status}`
      );

      if (response.ok) {
        const data =
          await response.json();

        if (
          Array.isArray(data)
        ) {
          data.forEach(
            entry => {
              if (
                entry.myanimelist
              ) {
                malIds.push(
                  entry.myanimelist
                );
              }
            }
          );
        }
      }
    } catch (error) {
      log(
        "ARM request failed",
        error?.message ||
          error
      );
    }
  }

  try {
    const aniIdUrl =
      tId
        ? `https://api.ani.zip/mappings?themoviedb_id=${tId}`
        : `https://api.ani.zip/mappings?imdb_id=${imdbId}`;

    const response =
      await fetchWithTimeout(
        aniIdUrl,
        {},
        5000
      );

    log(
      `Ani.zip mapping -> ${response.status}`
    );

    if (response.ok) {
      const data =
        await response.json();

      if (
        data?.mappings
          ?.mal_id
      ) {
        malIds.push(
          data.mappings.mal_id
        );
      }
    }
  } catch (error) {
    log(
      "Ani.zip mapping failed",
      error?.message ||
        error
    );
  }

  malIds = [
    ...new Set(
      malIds
    )
  ]
    .filter(Boolean)
    .sort(
      (a, b) =>
        b - a
    );

  log(
    "Candidate MAL IDs",
    malIds
  );

  let finalResult =
    null;

  for (
    const malId of malIds
  ) {
    try {
      const response =
        await fetchWithTimeout(
          `https://api.ani.zip/mappings?mal_id=${malId}`,
          {},
          5000
        );

      log(
        `Ani.zip MAL ${malId} -> ${response.status}`
      );

      if (response.ok) {
        const data =
          await response.json();

        const extraTitles =
          data?.titles
            ? Object.values(
                data.titles
              ).filter(Boolean)
            : [];

        if (
          data?.episodes
        ) {
          const aniEpisodes =
            Object.values(
              data.episodes
            )
              .map(
                ep => ({
                  mal_episode_number:
                    parseInt(
                      ep.episode,
                      10
                    ),

                  air_date:
                    ep.airDateUtc ||
                    ep.airDate ||
                    ep.airdate
                })
              )
              .filter(
                ep =>
                  !isNaN(
                    ep.mal_episode_number
                  )
              );

          const matches =
            aniEpisodes
              .filter(
                ep =>
                  isDateMatch(
                    ep.air_date,
                    airDate
                  )
              )
              .sort(
                (
                  a,
                  b
                ) =>
                  a.mal_episode_number -
                  b.mal_episode_number
              );

          if (
            matches[
              dayIndex
            ]
          ) {
            const match =
              matches[
                dayIndex
              ];

            finalResult = {
              id:
                mapId,

              imdb_id:
                imdbId,

              season:
                seasonNum,

              episode:
                episodeNum,

              mal_id:
                malId,

              mal_episode:
                match.mal_episode_number,

              anime_title:
                showTitle,

              titles:
                extraTitles,

              air_date:
                airDate
            };

            log(
              "AniSync mapping matched",
              {
                malId,
                malEpisode:
                  match.mal_episode_number,
                titles:
                  extraTitles
              }
            );

            break;
          }
        }
      }
    } catch (error) {
      log(
        `Ani.zip MAL ${malId} failed`,
        error?.message ||
          error
      );
    }

    try {
      const response =
        await fetchWithTimeout(
          `https://api.jikan.moe/v4/anime/${malId}`,
          {},
          5000
        );

      log(
        `Jikan MAL ${malId} -> ${response.status}`
      );

      if (
        response.ok
      ) {
        const data =
          await response.json();

        if (
          data?.data?.aired
            ?.from &&
          isDateMatch(
            data.data.aired.from,
            airDate
          )
        ) {
          finalResult = {
            id:
              mapId,

            imdb_id:
              imdbId,

            season:
              seasonNum,

            episode:
              episodeNum,

            mal_id:
              malId,

            mal_episode:
              dayIndex + 1,

            anime_title:
              showTitle,

            titles: [
              data.data.title,
              data.data.title_english,
              data.data.title_japanese
            ].filter(Boolean),

            air_date:
              airDate
          };

          log(
            "Jikan mapping matched",
            {
              malId,
              malEpisode:
                dayIndex + 1
            }
          );

          break;
        }
      }
    } catch (error) {
      log(
        `Jikan MAL ${malId} failed`,
        error?.message ||
          error
      );
    }
  }

  if (
    !finalResult &&
    malIds.length === 1 &&
    seasonNum === 1
  ) {
    finalResult = {
      id:
        mapId,

      imdb_id:
        imdbId,

      season:
        seasonNum,

      episode:
        episodeNum,

      mal_id:
        malIds[0],

      mal_episode:
        episodeNum,

      anime_title:
        showTitle,

      titles: [],

      air_date:
        airDate
    };

    log(
      "Using single-MAL-ID fallback",
      finalResult
    );
  }

  log(
    "Final mapping result",
    finalResult
      ? {
          malId:
            finalResult.mal_id,

          malEpisode:
            finalResult.mal_episode,

          title:
            finalResult.anime_title
        }
      : null
  );

  return finalResult;
}

async function getMalTitle(
  malId
) {
  if (!malId) {
    return null;
  }

  try {
    const response =
      await fetchWithTimeout(
        `https://api.jikan.moe/v4/anime/${malId}`,
        {},
        5000
      );

    if (
      response.ok
    ) {
      const data =
        await response.json();

      return (
        data?.data?.title ||
        data?.data?.title_english ||
        null
      );
    }
  } catch {}

  return null;
}

async function getTmdbInfo(
  tmdbId,
  mediaType,
  season = 1
) {
  try {
    const url =
      `https://api.themoviedb.org/3/${
        mediaType === "tv"
          ? "tv"
          : "movie"
      }/${tmdbId}?api_key=${TMDB_API_KEY}`;

    const response =
      await fetchWithTimeout(
        url,
        {},
        6000
      );

    log(
      `TMDB info -> ${response.status}`
    );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const info = {
      title:
        data.name ||
        data.title ||
        data.original_name ||
        data.original_title ||
        "",

      originalTitle:
        data.original_name ||
        data.original_title ||
        "",

      seasonName:
        ""
    };

    if (
      mediaType === "tv" &&
      season
    ) {
      try {
        const seasonUrl =
          `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}`;

        const seasonResponse =
          await fetchWithTimeout(
            seasonUrl,
            {},
            6000
          );

        if (
          seasonResponse.ok
        ) {
          const seasonData =
            await seasonResponse.json();

          info.seasonName =
            seasonData.name ||
            "";
        }
      } catch {}
    }

    return info;

  } catch {
    return null;
  }
}

// =========================================================
// ANIZONE SEARCH
// =========================================================

function normalize(
  str
) {
  if (!str) {
    return "";
  }

  return str
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ""
    )
    .trim();
}

function parseCards(
  html,
  $
) {
  const cards = [];

  const itemsMatch =
    html.match(
      /items:\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/
    );

  if (itemsMatch) {
    try {
      const parsed =
        parseXDataJson(
          itemsMatch[1]
        );

      if (
        Array.isArray(parsed)
      ) {
        for (
          const item of parsed
        ) {
          if (
            !item ||
            !item.slug
          ) {
            continue;
          }

          const titles =
            new Set();

          if (
            item.main_title
          ) {
            titles.add(
              item.main_title
            );
          }

          if (
            item.title_list &&
            typeof item.title_list ===
              "object"
          ) {
            Object.values(
              item.title_list
            ).forEach(
              title => {
                if (title) {
                  titles.add(
                    title
                  );
                }
              }
            );
          }

          cards.push({
            slug:
              item.slug,

            url:
              item.url ||
              `/anime/${item.slug}`,

            titles:
              Array.from(
                titles
              )
          });
        }
      }
    } catch {}
  }

  if (
    cards.length === 0
  ) {
    $(
      '[x-data*="anmTitles"]'
    ).each(
      (
        _i,
        el
      ) => {
        const href =
          $(el)
            .find(
              'a[href*="/anime/"]'
            )
            .first()
            .attr(
              "href"
            );

        if (!href) {
          return;
        }

        const parts =
          href.split(
            "/"
          );

        const slug =
          parts[
            parts.length - 1
          ] ||
          parts[
            parts.length - 2
          ];

        const titles =
          new Set();

        const xData =
          $(el).attr(
            "x-data"
          ) || "";

        const jsonMatch =
          xData.match(
            /JSON\.parse\('((?:[^'\\]|\\.)*)'\)/
          );

        if (jsonMatch) {
          try {
            const parsed =
              parseXDataJson(
                jsonMatch[1]
              );

            Object.values(
              parsed
            ).forEach(
              title => {
                if (title) {
                  titles.add(
                    title
                  );
                }
              }
            );
          } catch {}
        }

        cards.push({
          slug,
          titles:
            Array.from(
              titles
            )
        });
      }
    );
  }

  return cards;
}

function getSeasonRegexes(
  season
) {
  if (
    season === 1
  ) {
    return {
      mustNot: [
        /season\s*[2-9]/i,
        /saison\s*[2-9]/i,
        /[\s\-][iI]{2,}/,
        /\s+[2-9]nd/i,
        /\s+[2-9]rd/i,
        /\s+[2-9]th/i,
        /\s+ii\b/i,
        /\s+iii\b/i,
        /\s+iv\b/i,
        /\s+v\b/i,
        /movie/i,
        /gekijouban/i,
        /the movie/i
      ]
    };
  }

  const patterns = [];

  if (
    season === 2
  ) {
    patterns.push(
      /season\s*2/i,
      /saison\s*2/i,
      /2nd\s*season/i,
      /[\s\-]ii\b/i,
      /\b2\b/
    );

  } else if (
    season === 3
  ) {
    patterns.push(
      /season\s*3/i,
      /saison\s*3/i,
      /3rd\s*season/i,
      /[\s\-]iii\b/i,
      /\b3\b/
    );

  } else if (
    season === 4
  ) {
    patterns.push(
      /season\s*4/i,
      /saison\s*4/i,
      /4th\s*season/i,
      /[\s\-]iv\b/i,
      /\b4\b/,
      /final\s*season/i
    );

  } else {
    patterns.push(
      new RegExp(
        `(?:season|saison)\\s*${season}`,
        "i"
      ),
      new RegExp(
        `\\b${season}\\b`
      )
    );
  }

  return {
    must:
      patterns
  };
}

function matchCard(
  cards,
  targetTitles,
  baseTitle,
  season = 1,
  seasonName = ""
) {
  const normalizedTargets =
    targetTitles
      .map(normalize)
      .filter(Boolean);

  const normalizedBase =
    normalize(
      baseTitle
    );

  const normalizedSeasonName =
    normalize(
      seasonName
    );

  if (
    normalizedSeasonName &&
    normalizedSeasonName !==
      "season" +
        season
  ) {
    for (
      const card of cards
    ) {
      for (
        const title of
          card.titles
      ) {
        if (
          normalize(
            title
          ).includes(
            normalizedSeasonName
          )
        ) {
          return card.slug;
        }
      }
    }
  }

  for (
    const target of
      normalizedTargets
  ) {
    for (
      const card of cards
    ) {
      for (
        const title of
          card.titles
      ) {
        if (
          normalize(
            title
          ) === target
        ) {
          return card.slug;
        }
      }
    }
  }

  const seasonRules =
    getSeasonRegexes(
      season
    );

  for (
    const card of cards
  ) {
    let matchesBase =
      false;

    for (
      const title of
        card.titles
    ) {
      const norm =
        normalize(
          title
        );

      if (
        norm.includes(
          normalizedBase
        ) ||
        normalizedBase.includes(
          norm
        )
      ) {
        matchesBase = true;
        break;
      }
    }

    if (!matchesBase) {
      continue;
    }

    let seasonMatches =
      false;

    if (
      season === 1
    ) {
      let hasOtherSeason =
        false;

      for (
        const title of
          card.titles
      ) {
        if (
          seasonRules.mustNot.some(
            regex =>
              regex.test(
                title
              )
          )
        ) {
          hasOtherSeason =
            true;
          break;
        }
      }

      if (
        !hasOtherSeason
      ) {
        seasonMatches =
          true;
      }

    } else {
      for (
        const title of
          card.titles
      ) {
        if (
          seasonRules.must.some(
            regex =>
              regex.test(
                title
              )
          )
        ) {
          seasonMatches =
            true;
          break;
        }
      }
    }

    if (
      seasonMatches
    ) {
      return card.slug;
    }
  }

  return cards[0]
    ? cards[0].slug
    : null;
}

function matchMovieCard(
  cards,
  targetTitles
) {
  const normalizedTargets =
    targetTitles
      .map(normalize)
      .filter(Boolean);

  for (
    const card of cards
  ) {
    for (
      const title of
        card.titles
    ) {
      const norm =
        normalize(
          title
        );

      if (
        normalizedTargets.some(
          target =>
            target ===
            norm
        )
      ) {
        return card.slug;
      }
    }
  }

  for (
    const card of cards
  ) {
    for (
      const title of
        card.titles
    ) {
      const norm =
        normalize(
          title
        );

      if (
        normalizedTargets.some(
          target =>
            norm.includes(
              target
            ) ||
            target.includes(
              norm
            )
        )
      ) {
        return card.slug;
      }
    }
  }

  return cards[0]
    ? cards[0].slug
    : null;
}

// =========================================================
// VIDEO / SERVER PARSING
// =========================================================

function parseVidstackFromHtml(
  html,
  $
) {
  const vidMatch =
    html.match(
      /vidstackPlayer\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)\)/
    );

  if (vidMatch) {
    try {
      const data =
        parseXDataJson(
          vidMatch[1]
        );

      const masterUrl =
        data.src
          ? data.src.replace(
              /\\/g,
              ""
            )
          : null;

      const subtitles =
        (data.subtitles ||
          [])
          .map(
            subtitle => ({
              url:
                subtitle.file
                  ? subtitle.file.replace(
                      /\\/g,
                      ""
                    )
                  : "",

              name:
                subtitle.title ||
                subtitle.language ||
                "English",

              language:
                subtitle.language ||
                "en"
            })
          )
          .filter(
            subtitle =>
              subtitle.url
          );

      if (
        masterUrl
      ) {
        log(
          "Vidstack stream found",
          {
            hasMasterUrl:
              true,

            subtitles:
              subtitles.length
          }
        );

        return {
          masterUrl,
          subtitles
        };
      }
    } catch (error) {
      log(
        "Vidstack JSON parsing failed",
        error?.message ||
          error
      );
    }
  }

  let masterUrl =
    $("media-player").attr(
      "src"
    );

  if (!masterUrl) {
    const urlMatch =
      html.match(
        /https:\/\/[^"']+\/master\.m3u8/
      );

    if (urlMatch) {
      masterUrl =
        urlMatch[0];
    }
  }

  const subtitles =
    [];

  $("track").each(
    (
      _i,
      el
    ) => {
      const src =
        $(el).attr(
          "src"
        );

      const kind =
        $(el).attr(
          "kind"
        );

      if (
        src &&
        (
          kind ===
            "subtitles" ||
          kind ===
            "captions" ||
          src.endsWith(
            ".ass"
          ) ||
          src.endsWith(
            ".vtt"
          )
        )
      ) {
        subtitles.push({
          url:
            src,

          name:
            $(el).attr(
              "label"
            ) ||
            "English",

          language:
            $(el).attr(
              "srclang"
            ) ||
            "en"
        });
      }
    }
  );

  log(
    "Fallback stream parser result",
    {
      hasMasterUrl:
        Boolean(
          masterUrl
        ),

      subtitles:
        subtitles.length
    }
  );

  return {
    masterUrl,
    subtitles
  };
}

function parseAudioFormat(
  btnText
) {
  const lower =
    btnText.toLowerCase();

  const hasJap =
    lower.includes(
      "japanese"
    ) ||
    lower.includes(
      "jpn"
    ) ||
    lower.includes(
      "ja"
    );

  const hasEng =
    lower.includes(
      "english"
    ) ||
    lower.includes(
      "eng"
    ) ||
    lower.includes(
      "en"
    );

  if (
    hasEng &&
    hasJap
  ) {
    return "Dual Audio";
  }

  if (
    hasEng
  ) {
    return "Dub";
  }

  if (
    hasJap
  ) {
    return "Sub";
  }

  if (
    lower.includes(
      "multi"
    )
  ) {
    return "Multi-Audio";
  }

  return "Sub";
}

async function searchCards(
  query
) {
  if (!query) {
    return [];
  }

  log(
    "Searching AniZone",
    {
      query
    }
  );

  const searchUrl =
    `/anime?search=${encodeURIComponent(
      query
    )}&sort=title-asc`;

  const searchHtml =
    await fetchText(
      searchUrl
    );

  if (!searchHtml) {
    log(
      "AniZone search returned empty HTML"
    );

    return [];
  }

  const $search =
    cheerio.load(
      searchHtml
    );

  const cards =
    parseCards(
      searchHtml,
      $search
    );

  log(
    "AniZone search results",
    {
      query,
      cards:
        cards.length,
      titles:
        cards
          .slice(0, 5)
          .map(
            card =>
              card.titles
          )
    }
  );

  return cards;
}

// =========================================================
// PROVIDER
// =========================================================

export async function getAniZoneStreams({
  imdbId,
  type,
  season = 1,
  episode = 1
}) {
  const startedAt =
    Date.now();

  try {
    const mediaType =
      type === "movie"
        ? "movie"
        : "tv";

    log(
      "========================================"
    );

    log(
      "Provider request started",
      {
        imdbId,
        type,
        mediaType,
        season,
        episode
      }
    );

    const tmdbId =
      await getTmdbId(
        imdbId,
        mediaType
      );

    if (!tmdbId) {
      log(
        "STOP: TMDB ID could not be resolved"
      );

      return [];
    }

    let animeTitle =
      "";

    let altTitles =
      [];

    let mappedEp =
      episode;

    let seasonName =
      "";

    let targetTitles =
      [];

    if (
      mediaType === "tv"
    ) {
      const resolvedImdbId =
        await getImdbId(
          tmdbId,
          "tv"
        );

      if (
        resolvedImdbId
      ) {
        const mapping =
          await resolveMapping(
            resolvedImdbId,
            season,
            episode,
            tmdbId
          );

        if (mapping) {
          mappedEp =
            mapping.mal_episode ||
            episode;

          animeTitle =
            mapping.anime_title ||
            "";

          if (
            Array.isArray(
              mapping.titles
            )
          ) {
            targetTitles.push(
              ...mapping.titles
            );
          }

          const malTitle =
            await getMalTitle(
              mapping.mal_id
            );

          if (
            malTitle
          ) {
            targetTitles.push(
              malTitle
            );

            if (
              !animeTitle
            ) {
              animeTitle =
                malTitle;
            }
          }

          log(
            "AnimeSync mapping selected",
            {
              animeTitle,
              mappedEp,
              targetTitles
            }
          );
        } else {
          log(
            "AnimeSync mapping returned no match"
          );
        }
      }

      if (!animeTitle) {
        const tmdbInfo =
          await getTmdbInfo(
            tmdbId,
            mediaType,
            season
          );

        if (tmdbInfo) {
          animeTitle =
            tmdbInfo.title;

          if (
            tmdbInfo.originalTitle
          ) {
            altTitles.push(
              tmdbInfo.originalTitle
            );
          }

          seasonName =
            tmdbInfo.seasonName ||
            "";
        }

        log(
          "Using TMDB title fallback",
          {
            animeTitle,
            seasonName,
            altTitles
          }
        );
      }

    } else {
      const tmdbInfo =
        await getTmdbInfo(
          tmdbId,
          "movie"
        );

      if (tmdbInfo) {
        animeTitle =
          tmdbInfo.title;

        if (
          tmdbInfo.originalTitle
        ) {
          altTitles.push(
            tmdbInfo.originalTitle
          );
        }
      }

      mappedEp =
        1;
    }

    if (
      !animeTitle &&
      targetTitles.length === 0
    ) {
      log(
        "STOP: No anime title or mapping titles"
      );

      return [];
    }

    if (
      !animeTitle &&
      targetTitles.length > 0
    ) {
      animeTitle =
        targetTitles[0];
    }

    const specificTargetTitles =
      season === 1 ||
      mediaType === "movie"
        ? [
            ...targetTitles,
            animeTitle,
            ...altTitles
          ]
        : [
            ...targetTitles
          ];

    const baseCleanQuery =
      animeTitle
        .split(":")[0]
        .replace(
          /season.*|\d+nd season|\d+rd season|\d+th season|saison.*/gi,
          ""
        )
        .trim();

    log(
      "AniZone search parameters",
      {
        animeTitle,
        baseCleanQuery,
        seasonName,
        targetTitles:
          specificTargetTitles
      }
    );

    let cards =
      await searchCards(
        baseCleanQuery
      );

    if (
      cards.length === 0 &&
      animeTitle !==
        baseCleanQuery
    ) {
      log(
        "Retrying search with title"
      );

      cards =
        await searchCards(
          animeTitle
            .split(":")[0]
            .trim()
        );
    }

    if (
      cards.length === 0
    ) {
      for (
        const title of
          altTitles
      ) {
        const altClean =
          title
            .split(":")[0]
            .trim();

        cards =
          await searchCards(
            altClean
          );

        if (
          cards.length > 0
        ) {
          break;
        }
      }
    }

    if (
      cards.length === 0
    ) {
      log(
        "STOP: No AniZone search results"
      );

      return [];
    }

    let animeSlug =
      null;

    if (
      mediaType === "tv"
    ) {
      animeSlug =
        matchCard(
          cards,
          specificTargetTitles,
          baseCleanQuery,
          season,
          seasonName
        );
    } else {
      animeSlug =
        matchMovieCard(
          cards,
          specificTargetTitles
        );
    }

    log(
      "Selected AniZone slug",
      {
        animeSlug
      }
    );

    if (!animeSlug) {
      log(
        "STOP: No matching AniZone slug"
      );

      return [];
    }

    const episodeUrl =
      `/anime/${animeSlug}/${mappedEp}`;

    log(
      "Loading episode page",
      {
        episodeUrl
      }
    );

    const epResponse =
      await fetchWithCookies(
        episodeUrl
      );

    if (
      !epResponse.ok ||
      !epResponse.text
    ) {
      log(
        "STOP: Episode page failed"
      );

      return [];
    }

    const epHtml =
      epResponse.text;

    const $ep =
      cheerio.load(
        epHtml
      );

    const streams =
      [];

    const defaultStream =
      parseVidstackFromHtml(
        epHtml,
        $ep
      );

    const serverButtons =
      $ep(
        'button[wire\\:click*="setVideo"]'
      );

    log(
      "Episode page parsed",
      {
        serverButtons:
          serverButtons.length,

        defaultStream:
          Boolean(
            defaultStream.masterUrl
          ),

        subtitles:
          defaultStream
            .subtitles.length
      }
    );

    let defaultFormat =
      "Sub";

    let defaultServerName =
      "AniZone";

    if (
      serverButtons.length >
      0
    ) {
      const firstBtn =
        serverButtons.first();

      const btnText =
        firstBtn
          .text()
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      defaultFormat =
        parseAudioFormat(
          btnText
        );

      const nameMatch =
        btnText.match(
          /^([A-Za-z0-9_-]+)/
        );

      if (
        nameMatch
      ) {
        defaultServerName =
          nameMatch[1];
      }

      log(
        "Default server",
        {
          buttonText:
            btnText,

          server:
            defaultServerName,

          format:
            defaultFormat
        }
      );
    }

    if (
      defaultStream.masterUrl
    ) {
      streams.push({
        name:
          "AniZone",

        title:
          `${animeTitle} - Episode ${mappedEp} [${defaultServerName} - ${defaultFormat}]`,

        url:
          defaultStream.masterUrl,

        quality:
          "Multi",

        headers:
          HEADERS,

        subtitles:
          defaultStream.subtitles
      });

      log(
        "Added default stream",
        {
          name:
            "AniZone",

          quality:
            "Multi",

          format:
            defaultFormat,

          hasUrl:
            true
        }
      );

    } else {
      log(
        "WARNING: Default stream has no master URL"
      );
    }

    if (
      serverButtons.length >
      1
    ) {
      const csrfToken =
        $ep(
          "script[data-csrf]"
        ).attr(
          "data-csrf"
        );

      const snapshotEl =
        $ep(
          'main > div[wire\\:snapshot], main > ul[wire\\:snapshot], [wire\\:snapshot]'
        );

      const snapshot =
        snapshotEl.attr(
          "wire:snapshot"
        );

      log(
        "Additional server metadata",
        {
          serverCount:
            serverButtons.length,

          hasCsrf:
            Boolean(
              csrfToken
            ),

          hasSnapshot:
            Boolean(
              snapshot
            ),

          hasCookies:
            Boolean(
              epResponse.cookies
            )
        }
      );

      if (
        csrfToken &&
        snapshot &&
        epResponse.cookies
      ) {
        for (
          let i = 1;
          i <
            serverButtons.length;
          i++
        ) {
          const btn =
            serverButtons.eq(
              i
            );

          const clickAttr =
            btn.attr(
              "wire:click"
            ) || "";

          const vMatch =
            clickAttr.match(
              /setVideo\((\d+)\)/
            );

          if (!vMatch) {
            log(
              `Server ${i + 1}: no video ID`
            );

            continue;
          }

          const videoId =
            parseInt(
              vMatch[1],
              10
            );

          const btnText =
            btn
              .text()
              .replace(
                /\s+/g,
                " "
              )
              .trim();

          const sFormat =
            parseAudioFormat(
              btnText
            );

          const nameMatch =
            btnText.match(
              /^([A-Za-z0-9_-]+)/
            );

          const sName =
            nameMatch
              ? nameMatch[1]
              : `Server ${i + 1}`;

          log(
            `Requesting additional server ${i + 1}`,
            {
              videoId,
              server:
                sName,
              format:
                sFormat
            }
          );

          try {
            const payload = {
              _token:
                csrfToken,

              components: [
                {
                  snapshot,

                  updates:
                    {},

                  calls: [
                    {
                      path:
                        "",

                      method:
                        "setVideo",

                      params: [
                        videoId
                      ]
                    }
                  ]
                }
              ]
            };

            const postResponse =
              await fetchWithTimeout(
                `${MAIN_URL}/livewire/update`,
                {
                  method:
                    "POST",

                  headers: {
                    "Accept":
                      "*/*",

                    "Content-Type":
                      "application/json",

                    "X-Livewire":
                      "",

                    "X-CSRF-TOKEN":
                      csrfToken,

                    "Origin":
                      MAIN_URL,

                    "Referer":
                      `${MAIN_URL}${episodeUrl}`,

                    "Cookie":
                      epResponse.cookies
                  },

                  body:
                    JSON.stringify(
                      payload
                    )
                },
                8000
              );

            log(
              `Additional server ${i + 1} response -> ${postResponse.status}`
            );

            if (
              postResponse.ok
            ) {
              const postData =
                await postResponse.json();

              const liveHtml =
                postData
                  ?.components?.[0]
                  ?.effects?.html;

              log(
                `Additional server ${i + 1} Livewire HTML`,
                {
                  hasHtml:
                    Boolean(
                      liveHtml
                    ),

                  characters:
                    liveHtml?.length ||
                    0
                }
              );

              if (
                liveHtml
              ) {
                const $live =
                  cheerio.load(
                    liveHtml
                  );

                const extraStream =
                  parseVidstackFromHtml(
                    liveHtml,
                    $live
                  );

                log(
                  `Additional server ${i + 1} parsed`,
                  {
                    hasUrl:
                      Boolean(
                        extraStream.masterUrl
                      ),

                    subtitles:
                      extraStream
                        .subtitles.length
                  }
                );

                if (
                  extraStream.masterUrl &&
                  extraStream.masterUrl !==
                    defaultStream.masterUrl
                ) {
                  streams.push({
                    name:
                      "AniZone",

                    title:
                      `${animeTitle} - Episode ${mappedEp} [${sName} - ${sFormat}]`,

                    url:
                      extraStream.masterUrl,

                    quality:
                      "Multi",

                    headers:
                      HEADERS,

                    subtitles:
                      extraStream
                        .subtitles
                        .length >
                      0
                        ? extraStream.subtitles
                        : defaultStream.subtitles
                  });

                  log(
                    `Added additional server ${i + 1}`,
                    {
                      server:
                        sName,

                      format:
                        sFormat
                    }
                  );

                } else {
                  log(
                    `Server ${i + 1}: no unique stream found`
                  );
                }
              }
            }

          } catch (error) {
            log(
              `Additional server ${i + 1} failed`,
              error?.message ||
                error
            );
          }
        }
      }
    }

    log(
      "AniZone provider finished",
      {
        streams:
          streams.length,

        elapsedMs:
          Date.now() -
          startedAt
      }
    );

    log(
      "========================================"
    );

    return streams;

  } catch (error) {
    log(
      "FATAL provider error",
      {
        message:
          error?.message ||
          String(error),

        stack:
          error?.stack
      }
    );

    return [];
  }
}
