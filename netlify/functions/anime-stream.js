export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/anime-stream\/([^/]+)\/(.+)\.json$/);
    
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

    // Dynamic import to prevent Netlify build from crashing if the file is missing
    let streams = [];
    try {
      const mod = await import("./providers/anime/index.js");
      streams = await mod.getStreams({ imdbId, type, season, episode });
    } catch (err) {
      console.error("[ANIME-STANDALONE] Failed to load orchestrator:", err?.message || err);
      // Return a visible error stream so you know it failed
      streams = [{
        name: "⚠️ Anime Error",
        title: `⚠️ Anime Error\nFailed to load provider. ${err?.message || err}`,
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
  path: "/anime-stream/:type/:id.json"
};
