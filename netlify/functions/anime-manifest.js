export default async (req, context) => {
  const url = new URL(req.url);
  
  if (url.pathname === "/anime-manifest.json") {
    return new Response(JSON.stringify({
      id: "com.showbox.anime",
      version: "1.0.0",
      name: "ShowBox Anime",
      description: "Anime Streams",
      resources: ["stream"],
      types: ["movie", "series"],
      catalogs: [],
      behaviorHints: { configurable: false }
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // Simple HTML page to copy the URL
  return new Response(`
    <html>
      <body style="font-family: sans-serif; padding: 20px; background: #0d0e11; color: white;">
        <h2>ShowBox Anime</h2>
        <p>Copy this URL and paste it into Nuvio/Stremio:</p>
        <input type="text" value="${url.origin}/anime-manifest.json" style="width: 100%; padding: 10px;" readonly />
      </body>
    </html>
  `, {
    headers: { "Content-Type": "text/html" }
  });
};

export const config = {
  path: ["/anime-manifest.json", "/anime"]
};
