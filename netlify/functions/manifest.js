export default async (req) => {
  const url = new URL(req.url);

  // =========================================================
  // Homepage
  // =========================================================

  if (url.pathname === "/") {

    const html = `<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<meta
  name="theme-color"
  content="#111111"
>

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

#token {
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

#token:focus {
  border-color: #666;
}

.primary {
  width: 100%;

  min-height: 48px;

  margin-top: 24px;

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


/* ========================================================
   Configuration area
   ======================================================== */

#configuration {
  display: none;

  margin-top: 28px;
}

.section-title {
  margin-bottom: 6px;

  color: #fff;

  font-size: 17px;
  font-weight: 600;
}

.section-description {
  margin: 0 0 14px;

  color: #888;

  font-size: 13px;
  line-height: 1.5;
}

.quality-list {
  display: flex;

  flex-direction: column;

  gap: 8px;
}

.quality-row {
  min-height: 54px;

  display: flex;

  align-items: center;

  gap: 10px;

  padding: 8px 10px;

  border: 1px solid #2d2d2d;
  border-radius: 10px;

  background: #1a1a1a;
}

.quality-checkbox {
  width: 20px;
  height: 20px;

  margin: 0;

  accent-color: white;
}

.quality-name {
  flex: 1;

  font-size: 15px;
  font-weight: 500;
}

.move-button {
  width: 38px;
  height: 38px;

  min-width: 38px;

  padding: 0;

  border: 1px solid #333;
  border-radius: 8px;

  background: #222;
  color: #fff;

  font-size: 18px;

  cursor: pointer;
}

.move-button:disabled {
  opacity: 0.25;

  cursor: default;
}


/* ========================================================
   Result
   ======================================================== */

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

#manifestUrl {
  min-width: 0;

  flex: 1;

  width: 100%;

  min-height: 48px;

  padding: 13px 14px;

  border: 1px solid #333;
  border-radius: 10px;

  background: #1a1a1a;
  color: #fff;

  font-size: 13px;

  outline: none;
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

<h1>
ShowBox Stremio Addon
</h1>

<p class="subtitle">
Enter your ShowBox UI token to configure the addon.
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
  type="button"
>
Generate Install Link
</button>


<!-- ======================================================
     Quality configuration
     Hidden until token is submitted
     ====================================================== -->

<div id="configuration">

  <div class="section-title">
    Quality settings
  </div>

  <p class="section-description">
    Enable the qualities you want. Move them up or down to
    set their priority.
  </p>

  <div
    id="qualityList"
    class="quality-list"
  ></div>

</div>


<!-- ======================================================
     Result
     ====================================================== -->

<div id="result">

  <div class="result-title">
    Configured Manifest URL
  </div>


  <div class="url-row">

    <input
      id="manifestUrl"
      type="text"
      readonly
    >

    <button
      id="copy"
      class="secondary"
      type="button"
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


// ========================================================
// Quality defaults
// ========================================================

const qualityDefaults = [

  {
    name: "ORG",
    enabled: true
  },

  {
    name: "4K",
    enabled: true
  },

  {
    name: "1440p",
    enabled: true
  },

  {
    name: "1080p",
    enabled: true
  },

  {
    name: "720p",
    enabled: true
  },

  {
    name: "480p",
    enabled: true
  },

  {
    name: "360p",
    enabled: true
  }

];


let qualities =
  qualityDefaults.map(
    item => ({
      ...item
    })
  );


// ========================================================
// Elements
// ========================================================

const tokenInput =
  document.getElementById("token");

const generateButton =
  document.getElementById("generate");

const configuration =
  document.getElementById("configuration");

const qualityList =
  document.getElementById("qualityList");

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


// ========================================================
// Render qualities
// ========================================================

function renderQualities() {

  qualityList.innerHTML = "";


  qualities.forEach(
    (quality, index) => {

      const row =
        document.createElement("div");

      row.className =
        "quality-row";


      // Checkbox

      const checkbox =
        document.createElement("input");

      checkbox.type =
        "checkbox";

      checkbox.className =
        "quality-checkbox";

      checkbox.checked =
        quality.enabled;


      checkbox.addEventListener(
        "change",
        () => {

          quality.enabled =
            checkbox.checked;

        }
      );


      // Name

      const name =
        document.createElement("div");

      name.className =
        "quality-name";

      name.textContent =
        quality.name;


      // Up

      const up =
        document.createElement("button");

      up.type =
        "button";

      up.className =
        "move-button";

      up.textContent =
        "↑";

      up.disabled =
        index === 0;


      up.addEventListener(
        "click",
        () => {

          if (
            index === 0
          ) {
            return;
          }


          const current =
            qualities[index];


          qualities[index] =
            qualities[index - 1];


          qualities[index - 1] =
            current;


          renderQualities();

        }
      );


      // Down

      const down =
        document.createElement("button");

      down.type =
        "button";

      down.className =
        "move-button";

      down.textContent =
        "↓";

      down.disabled =
        index ===
        qualities.length - 1;


      down.addEventListener(
        "click",
        () => {

          if (
            index ===
            qualities.length - 1
          ) {
            return;
          }


          const current =
            qualities[index];


          qualities[index] =
            qualities[index + 1];


          qualities[index + 1] =
            current;


          renderQualities();

        }
      );


      row.appendChild(
        checkbox
      );

      row.appendChild(
        name
      );

      row.appendChild(
        up
      );

      row.appendChild(
        down
      );


      qualityList.appendChild(
        row
      );

    }
  );

}


// ========================================================
// Base64URL encoder
// ========================================================

function base64UrlEncode(
  value
) {

  const bytes =
    new TextEncoder()
      .encode(value);


  let binary = "";


  for (
    const byte of bytes
  ) {

    binary +=
      String.fromCharCode(
        byte
      );

  }


  return btoa(binary)
    .replace(/\\+/g, "-")
    .replace(/\\//g, "_")
    .replace(/=+$/, "");

}


// ========================================================
// Generate
// ========================================================

generateButton.addEventListener(
  "click",
  () => {

    const token =
      tokenInput.value.trim();


    // ----------------------------------------------------
    // Token required
    // ----------------------------------------------------

    if (!token) {

      status.textContent =
        "Please enter your ShowBox UI token.";

      result.style.display =
        "block";

      return;

    }


    // ----------------------------------------------------
    // Build configuration
    // ----------------------------------------------------

    const config = {

      uiToken:
        token,

      qualities:
        qualities.map(
          item => ({

            name:
              item.name,

            enabled:
              item.enabled

          })
        )

    };


    // ----------------------------------------------------
    // Encode
    // ----------------------------------------------------

    const encodedConfig =
      base64UrlEncode(
        JSON.stringify(
          config
        )
      );


    // ----------------------------------------------------
    // Manifest URL
    // ----------------------------------------------------

    const httpsManifestUrl =
      window.location.origin +
      "/" +
      encodedConfig +
      "/manifest.json";


    // ----------------------------------------------------
    // Stremio URL
    // ----------------------------------------------------

    const stremioInstallUrl =
      "stremio://" +
      window.location.host +
      "/" +
      encodedConfig +
      "/manifest.json";


    // ----------------------------------------------------
    // Show configuration controls
    // ----------------------------------------------------

    configuration.style.display =
      "block";


    // ----------------------------------------------------
    // Show result
    // ----------------------------------------------------

    manifestUrl.value =
      httpsManifestUrl;


    installButton.href =
      stremioInstallUrl;


    result.style.display =
      "block";


    status.textContent =
      "Addon link generated.";


    // ----------------------------------------------------
    // IMPORTANT:
    // Clear the token from the visible textbox.
    // ----------------------------------------------------

    tokenInput.value = "";


    // Don't retain the token in the DOM input value.

    tokenInput.blur();

  }
);


// ========================================================
// Copy
// ========================================================

copyButton.addEventListener(
  "click",
  async () => {

    const value =
      manifestUrl.value;


    if (!value) {
      return;
    }


    try {

      await navigator.clipboard
        .writeText(
          value
        );


      copyButton.textContent =
        "Copied!";


      status.textContent =
        "Manifest URL copied.";


    } catch {

      manifestUrl.focus();

      manifestUrl.select();


      try {

        document.execCommand(
          "copy"
        );

      } catch {
        // Ignore fallback failure
      }


      copyButton.textContent =
        "Copied!";


      status.textContent =
        "Manifest URL copied.";

    }


    setTimeout(
      () => {

        copyButton.textContent =
          "Copy";

      },
      2000
    );

  }
);


// ========================================================
// Initial state
// ========================================================

// Quality settings are intentionally NOT rendered
// until Generate is pressed.

</script>

</body>

</html>`;


    return new Response(
      html,
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


  // =========================================================
  // Manifest
  // =========================================================

  return new Response(
    JSON.stringify({

      id:
        "com.showbox.stremio",

      version:
        "1.0.0",

      name:
        "ShowBox",

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
        configurable:
          true,

        configurationRequired:
          false
      },

      config: [
        {
          key:
            "uiToken",

          type:
            "password",

          title:
            "ShowBox UI Token",

          required:
            true
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


// =========================================================
// Netlify routes
// =========================================================

export const config = {

  path: [
    "/",
    "/manifest.json",
    "/:config/manifest.json"
  ]

};
