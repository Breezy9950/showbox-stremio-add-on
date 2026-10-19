import { getStreams as getAnimeStreams } from "./providers/anime/index.js";

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    // Match /anime-addon/stream/movie/tt123.json
    const match = url.pathname.match(/^\/anime-addon\/stream\/([^/]+)\/(.+)\.json$/);
    
    if (!match) throw new Error("Invalid path");
    
    const type = match[1];
    let rawId = decodeURIComponent(match[2]);
    
    let imdbId, season, episode;
    if (type === "series") {
      const parts = rawId.split(":");
      imdbId = parts[0];
      season = Number(parts[1]);
      episode = Number(parts[2]);
    } else {
      imdbId = rawId;
    }

    console.log(`[ANIME-STANDALONE] Request: ${imdbId} S${season}E${episode}`);

    let streams = [];
    try {
      streams = await getAnimeStreams({ imdbId, type, season, episode });
    } catch (err) {
      console.error("[ANIME-STANDALONE] Failed to run orchestrator:", err?.message || err);
      streams = [{
        name: "⚠️ Anime Error",
        title: `⚠️ Anime Error\nFailed to run provider. ${err?.message || err}`,
        url: "https://example.com/error.mp4",
        behaviorHints: { notWebReady: true }
      }];
    }

    return new Response(JSON.stringify({ streams }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (error) {
    console.error("[ANIME-STANDALONE] Fatal error:", error?.stack || error?.message || error);
    return new Response(JSON.stringify({ streams: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};

export const config = {
  path: "/anime-addon/stream/:type/:id.json"
};
