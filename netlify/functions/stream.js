export const config = {
  path: "/:config/stream/:type/:id.json"
};

function decodeBase64Url(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

async function imdbToTmdb(imdbId, type) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url =
    `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&external_source=imdb_id`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TMDB returned HTTP ${response.status}`);
  }

  const data = await response.json();

  if (type === "movie") {
    return data.movie_results?.[0]?.id ?? null;
  }

  return data.tv_results?.[0]?.id ?? null;
}

export default async (req, context) => {
  try {
    const { type, id, config } = context.params;

    // Decode the addon configuration
    let configData = {};

    if (config) {
      try {
        configData = JSON.parse(decodeBase64Url(config));
      } catch {
        // Configuration isn't relevant to this test
      }
    }

    // Nuvio sends:
    // movie:  tt12345678
    // series: tt12345678:1:1
    const decodedId = decodeURIComponent(id);

    let imdbId = decodedId;
    let season = null;
    let episode = null;

    if (type === "series") {
      const parts = decodedId.split(":");

      imdbId = parts[0];
      season = Number(parts[1]);
      episode = Number(parts[2]);
    }

    const tmdbId = await imdbToTmdb(imdbId, type);

    console.log("[ShowBox] TMDB conversion:", {
  type,
  imdbId,
  season,
  episode,
  tmdbId
});

    return new Response(
      JSON.stringify({
        test: true,
        received: {
          type,
          id: decodedId
        },
        parsed: {
          imdbId,
          season,
          episode
        },
        tmdbId,
        hasConfig: Object.keys(configData).length > 0
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        test: true,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
