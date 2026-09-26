export default async (req, context) => {
  const url = new URL(req.url);

  // Root homepage
  if (url.pathname === "/") {
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShowBox Stremio Addon</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      text-align: center;
      padding: 32px;
    }

    h1 {
      margin-bottom: 10px;
    }

    p {
      color: #aaa;
    }
  </style>
</head>
<body>
  <main>
    <h1>ShowBox Stremio Addon</h1>
    <p>Addon is online.</p>
    <p>Use the manifest URL to install it in Stremio.</p>
  </main>
</body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  // Normal manifest
  return new Response(
    JSON.stringify({
      id: "com.showbox.stremio",
      version: "1.0.0",
      name: "ShowBox",
      description: "ShowBox Stremio addon",
      resources: ["stream"],
      types: ["movie", "series"],
      catalogs: [],
      behaviorHints: {
        configurable: true,
        configurationRequired: true
      },
      config: [
        {
          key: "uiToken",
          type: "password",
          title: "ShowBox UI Token",
          required: true
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
};

export const config = {
  path: [
    "/",
    "/manifest.json",
    "/:config/manifest.json"
  ]
};
