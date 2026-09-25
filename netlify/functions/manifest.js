export default async () => {
  return new Response(
    JSON.stringify({
      id: "com.showbox.stremio",
      version: "1.0.0",
      name: "ShowBox",
      description: "ShowBox Stremio addon",
      resources: ["stream"],
      types: ["movie", "series"],
      catalogs: []
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
};
