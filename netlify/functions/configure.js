export default async () => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShowBox Configuration</title>
  <style>
    body {
      font-family: sans-serif;
      max-width: 500px;
      margin: 40px auto;
      padding: 20px;
      background: #111;
      color: white;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      padding: 14px;
      margin: 10px 0 20px;
      border-radius: 8px;
      border: 1px solid #555;
      background: #222;
      color: white;
    }

    button {
      width: 100%;
      padding: 14px;
      border: 0;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
    }
  </style>
</head>

<body>
  <h1>ShowBox</h1>
  <p>Enter your ShowBox UI Token.</p>

  <form id="form">
    <label for="uiToken">ShowBox UI Token</label>
    <input
      id="uiToken"
      name="uiToken"
      type="password"
      required
    >

    <button type="submit">Install Addon</button>
  </form>

  <script>
    document.getElementById("form").addEventListener("submit", function(e) {
      e.preventDefault();

      const config = {
        uiToken: document.getElementById("uiToken").value
      };

      const encoded = encodeURIComponent(JSON.stringify(config));

      const manifestUrl =
        window.location.origin +
        "/" +
        encoded +
        "/manifest.json";

      window.location.href =
        "stremio://" +
        window.location.host +
        "/" +
        encoded +
        "/manifest.json";
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Access-Control-Allow-Origin": "*"
    }
  });
};

export const config = {
  path: "/configure"
};
