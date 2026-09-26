export default async (req, context) => {
  const url = new URL(req.url);
  // Homepage / custom installer
  if (url.pathname === "/" || url.pathname === "/configure") {
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#111111">
  <title>ShowBox Stremio Addon</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111;
      color: #fff;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }
    main {
      width: 100%;
      max-width: 560px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 32px;
      line-height: 1.2;
    }
    .subtitle {
      margin: 0 0 30px;
      color: #999;
      line-height: 1.5;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #ccc;
      font-size: 14px;
      font-weight: 500;
    }
    input {
      width: 100%;
      min-height: 48px;
      padding: 13px 14px;
      border: 1px solid #333;
      border-radius: 10px;
      background: #1a1a1a;
      color: #fff;
      font-size: 15px;
      outline: none;
    }
    input:focus {
      border-color: #666;
    }
    .primary {
      width: 100%;
      min-height: 48px;
      margin-top: 14px;
      padding: 13px 18px;
      border: 0;
      border-radius: 10px;
      background: #fff;
      color: #111;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .primary:active,
    .secondary:active {
      opacity: 0.75;
    }
    #result {
      display: none;
      margin-top: 30px;
    }
    .result-title {
      margin-bottom: 8px;
      color: #ccc;
      font-size: 14px;
      font-weight: 500;
    }
    .url-row {
      display: flex;
      gap: 8px;
    }
    .url-row input {
      min-width: 0;
      flex: 1;
    }
    .secondary {
      width: auto;
      flex-shrink: 0;
      min-height: 48px;
      padding: 0 18px;
      border: 1px solid #333;
      border-radius: 10px;
      background: #1a1a1a;
      color: #fff;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
    }
    .install {
      width: 100%;
      min-height: 48px;
      margin-top: 10px;
      padding: 13px 18px;
      display: block;
      border-radius: 10px;
      background: #fff;
      color: #111;
      text-align: center;
      text-decoration: none;
      font-size: 16px;
      font-weight: 600;
    }
    .instruction {
      margin-top: 14px;
      color: #888;
      font-size: 13px;
      line-height: 1.5;
    }
    #status {
      min-height: 20px;
      margin-top: 10px;
      color: #aaa;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <main>
    <h1>ShowBox Stremio Addon</h1>
    <p class="subtitle">
      Enter your ShowBox UI token to create your personal
      configured addon.
    </p>
    <label for="token">
      ShowBox UI Token
    </label>
    <input
      id="token"
      type="password"
      placeholder="Enter your ShowBox UI token"
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
    />
    <button
      id="generate"
      class="primary"
    >
      Generate Install Link
    </button>
    <div id="result">
      <div class="result-title">
        Configured Manifest URL
      </div>
      <div class="url-row">
        <input
          id="manifestUrl"
          type="text"
          readonly
        />
        <button
          id="copy"
          class="secondary"
        >
          Copy
        </button>
      </div>
      <a
        id="install"
        class="install"
        href="#"
      >
        Install in Stremio
      </a>
      <div class="instruction">
        On iOS, if the Install button does not open Stremio,
        use Copy and paste the manifest URL into Stremio's
        Add Addon field.
      </div>
      <div id="status"></div>
    </div>
  </main>
  <script>
    const tokenInput =
      document.getElementById("token");
    const generateButton =
      document.getElementById("generate");
    const result =
      document.getElementById("result");
    const manifestUrl =
      document.getElementById("manifestUrl");
    const copyButton =
      document.getElementById("copy");
    const installButton =
      document.getElementById("install");
    const status =
      document.getElementById("status");
    function base64UrlEncode(value) {
      const bytes =
        new TextEncoder().encode(value);
      let binary = "";
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary)
        .replace(/\\+/g, "-")
        .replace(/\\//g, "_")
        .replace(/=+$/g, "");
    }
    generateButton.addEventListener(
      "click",
      () => {
        const token =
          tokenInput.value.trim();
        if (!token) {
          result.style.display = "block";
          status.textContent =
            "Please enter your ShowBox UI token.";
          return;
        }
        /*
         * This is the configuration object
         * that stream.js will decode.
         */
        const config = {
          uiToken: token
        };
        /*
         * Encode the configuration into
         * the Stremio addon URL.
         */
        const encodedConfig =
          base64UrlEncode(
            JSON.stringify(config)
          );
        /*
         * Normal HTTPS manifest URL.
         *
         * Example:
         * https://zippy-naiad-9e3303.netlify.app/<config>/manifest.json
         */
        const httpsManifestUrl =
          window.location.origin +
          "/" +
          encodedConfig +
          "/manifest.json";
        /*
         * Stremio deep-link version.
         *
         * Example:
         * stremio://zippy-naiad-9e3303.netlify.app/<config>/manifest.json
         */
        const stremioInstallUrl =
          "stremio://" +
          window.location.host +
          "/" +
          encodedConfig +
          "/manifest.json";
        manifestUrl.value =
          httpsManifestUrl;
        installButton.href =
          stremioInstallUrl;
        result.style.display =
          "block";
        status.textContent = "";
      }
    );
    copyButton.addEventListener(
      "click",
      async () => {
        const value =
          manifestUrl.value;
        if (!value) {
          return;
        }
        try {
          await navigator.clipboard.writeText(
            value
          );
          copyButton.textContent =
            "Copied!";
          status.textContent =
            "Manifest URL copied.";
        } catch (error) {
          manifestUrl.focus();
          manifestUrl.select();
          document.execCommand("copy");
          copyButton.textContent =
            "Copied!";
          status.textContent =
            "Manifest URL copied.";
        }
        setTimeout(() => {
          copyButton.textContent =
            "Copy";
        }, 2000);
      }
    );
  </script>
</body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
          "Access-Control-Allow-Origin":
            "*"
        }
      }
    );
  }
  /*
   * Manifest
   *
   * This is returned for:
   *
   * /manifest.json
   *
   * and:
   *
   * /<encoded-config>/manifest.json
   */
  return new Response(
    JSON.stringify({
      id: "com.showbox.stremio",
      version: "1.0.0",
      name: "ShowBox",
      description:
        "ShowBox Stremio addon",
      resources: [
        "stream"
      ],
      types: [
        "movie",
        "series"
      ],
      catalogs: [],
      behaviorHints: {
        configurable: true,
        configurationRequired: false
      },
      config: [
        {
          key: "uiToken",
          type: "password",
          title:
            "ShowBox UI Token",
          required: true
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json",
        "Access-Control-Allow-Origin":
          "*"
      }
    }
  );
};
/*
 * Netlify function routes.
 */
export const config = {
  path: [
    "/",
    "/configure",
    "/manifest.json",
    "/:config/manifest.json"
  ]
};
