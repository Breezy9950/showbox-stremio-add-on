export default async (req, context) => {
  const url = new URL(req.url);

  // Homepage / configuration page
  if (url.pathname === "/" || url.pathname === "/configure") {
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShowBox Stremio Addon</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: #111;
      color: #fff;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
    }

    main {
      width: 100%;
      max-width: 600px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 32px;
    }

    .subtitle {
      margin: 0 0 28px;
      color: #999;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      color: #ccc;
    }

    input {
      width: 100%;
      padding: 15px;
      border: 1px solid #333;
      border-radius: 10px;
      background: #1b1b1b;
      color: #fff;
      font-size: 15px;
      outline: none;
    }

    input:focus {
      border-color: #666;
    }

    button {
      width: 100%;
      margin-top: 14px;
      padding: 15px;
      border: 0;
      border-radius: 10px;
      background: #fff;
      color: #111;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    button:active {
      opacity: 0.8;
    }

    #result {
      display: none;
      margin-top: 30px;
    }

    .result-title {
      margin-bottom: 8px;
      font-size: 14px;
      color: #ccc;
    }

    .url-box {
      display: flex;
      gap: 8px;
    }

    .url-box input {
      flex: 1;
      min-width: 0;
    }

    .copy {
      width: auto;
      margin: 0;
      padding: 0 18px;
      flex-shrink: 0;
    }

    .instruction {
      margin-top: 16px;
      color: #999;
      font-size: 14px;
      line-height: 1.5;
    }

    #status {
      margin-top: 12px;
      color: #aaa;
      font-size: 14px;
    }
  </style>
</head>

<body>
  <main>
    <h1>ShowBox Stremio Addon</h1>

    <p class="subtitle">
      Generate a configured manifest URL for Stremio.
    </p>

    <label for="token">
      ShowBox UI Token
    </label>

    <input
      id="token"
      type="password"
      placeholder="Enter your ShowBox UI token"
      autocomplete="off"
    />

    <button id="generate">
      Generate Manifest URL
    </button>

    <div id="result">
      <div class="result-title">
        Your configured manifest URL
      </div>

      <div class="url-box">
        <input
          id="manifestUrl"
          type="text"
          readonly
        />

        <button
          id="copy"
          class="copy"
        >
          Copy
        </button>
      </div>

      <div class="instruction">
        Copy this URL and paste it into Stremio's
        Add Addon field.
      </div>

      <div id="status"></div>
    </div>
  </main>

  <script>
    const tokenInput = document.getElementById("token");
    const generateButton = document.getElementById("generate");
    const result = document.getElementById("result");
    const manifestUrl = document.getElementById("manifestUrl");
    const copyButton = document.getElementById("copy");
    const status = document.getElementById("status");

    function base64UrlEncode(value) {
      const bytes = new TextEncoder().encode(value);

      let binary = "";

      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }

      return btoa(binary)
        .replace(/\\+/g, "-")
        .replace(/\\//g, "_")
        .replace(/=+$/g, "");
    }

    generateButton.addEventListener("click", () => {
      const token = tokenInput.value.trim();

      if (!token) {
        status.textContent = "Please enter your ShowBox UI token.";
        result.style.display = "block";
        return;
      }

      const config = {
        uiToken: token
      };

      const encodedConfig = base64UrlEncode(
        JSON.stringify(config)
      );

      const url =
        window.location.origin +
        "/" +
        encodedConfig +
        "/manifest.json";

      manifestUrl.value = url;

      result.style.display = "block";
      status.textContent = "";
    });

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(manifestUrl.value);

        copyButton.textContent = "Copied!";
        status.textContent =
          "Paste the copied URL into Stremio.";

        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 2000);

      } catch (error) {
        manifestUrl.select();
        document.execCommand("copy");

        copyButton.textContent = "Copied!";

        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 2000);
      }
    });
  </script>
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
        configurationRequired: false
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
    "/configure",
    "/manifest.json",
    "/:config/manifest.json"
  ]
};
