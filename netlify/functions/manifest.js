const DEFAULT_QUALITIES = [
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];

function encodeConfig(config) {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function qualityRows() {
  return DEFAULT_QUALITIES
    .map((quality, index) => `
      <div class="quality-row">

        <label class="quality-name">

          <input
            type="checkbox"
            class="quality-checkbox"
            data-quality="${quality}"
            checked
          >

          <span>${quality}</span>

        </label>

        <div class="move-buttons">

          <button
            type="button"
            class="move-button"
            data-action="up"
            ${index === 0 ? "disabled" : ""}
          >↑</button>

          <button
            type="button"
            class="move-button"
            data-action="down"
            ${index === DEFAULT_QUALITIES.length - 1 ? "disabled" : ""}
          >↓</button>

        </div>

      </div>
    `)
    .join("");
}

function homepageScript() {

  return `
(function () {

  "use strict";

  const tokenInput =
    document.getElementById("tokenInput");

  const generateButton =
    document.getElementById("generateButton");

  const checkStatus =
    document.getElementById("checkStatus");

  const configuration =
    document.getElementById("configuration");

  const qualityList =
    document.getElementById("qualityList");

  const minSizeInput =
    document.getElementById("minSize");

  const maxSizeInput =
    document.getElementById("maxSize");

  const manifestUrl =
    document.getElementById("manifestUrl");

  const copyButton =
    document.getElementById("copyButton");

  const installButton =
    document.getElementById("installButton");


  let currentToken = "";


  function getRows() {

    return Array.from(
      qualityList.querySelectorAll(".quality-row")
    );

  }


  function getQualityConfig() {

    return getRows().map(row => {

      const checkbox =
        row.querySelector(".quality-checkbox");

      return {
        name: checkbox.dataset.quality,
        enabled: checkbox.checked
      };

    });

  }


  function getFileSizeConfig() {

    const minValue =
      minSizeInput.value.trim();

    const maxValue =
      maxSizeInput.value.trim();


    return {

      minGb:
        minValue === ""
          ? null
          : Number(minValue),

      maxGb:
        maxValue === ""
          ? null
          : Number(maxValue)

    };

  }


  function updateManifest() {

    if (!currentToken) {
      return;
    }


    const qualities =
      getQualityConfig();


    if (!qualities.some(item => item.enabled)) {

      manifestUrl.value = "";

      installButton.classList.add("disabled");

      installButton.href = "#";

      return;

    }


    const config = {

      uiToken:
        currentToken,

      fileSize:
        getFileSizeConfig(),

      qualities

    };


    const encoded =
      ${encodeConfig.toString()}(config);


    const httpsUrl =
      window.location.origin +
      "/" +
      encoded +
      "/manifest.json";


    const stremioUrl =
      "stremio://" +
      window.location.host +
      "/" +
      encoded +
      "/manifest.json";


    manifestUrl.value =
      httpsUrl;

    installButton.href =
      stremioUrl;

    installButton.classList.remove(
      "disabled"
    );

  }


  qualityList.addEventListener(
    "change",
    updateManifest
  );


  qualityList.addEventListener(
    "click",
    function (event) {

      const button =
        event.target.closest(".move-button");

      if (!button) {
        return;
      }


      const row =
        button.closest(".quality-row");

      const rows =
        getRows();

      const index =
        rows.indexOf(row);


      if (
        button.dataset.action === "up" &&
        index > 0
      ) {

        qualityList.insertBefore(
          row,
          rows[index - 1]
        );

      }


      if (
        button.dataset.action === "down" &&
        index < rows.length - 1
      ) {

        qualityList.insertBefore(
          rows[index + 1],
          row
        );

      }


      updateManifest();

    }
  );


  minSizeInput.addEventListener(
    "input",
    updateManifest
  );


  maxSizeInput.addEventListener(
    "input",
    updateManifest
  );


  tokenInput.addEventListener(
    "input",
    function () {

      currentToken = "";

      configuration.style.display =
        "none";

      manifestUrl.value = "";

      installButton.classList.add(
        "disabled"
      );

      installButton.href = "#";

      checkStatus.textContent = "";

    }
  );


  generateButton.addEventListener(
    "click",
    function () {

      const token =
        tokenInput.value.trim();


      if (!token) {

        checkStatus.textContent =
          "Enter your ShowBox UI token first.";

        checkStatus.className =
          "error";

        return;

      }


      if (token.length <= 100) {

        checkStatus.textContent =
          "Invalid Cookie";

        checkStatus.className =
          "error";

        return;

      }


      currentToken = token;


      checkStatus.textContent =
        "";

      checkStatus.className =
        "success";


      configuration.style.display =
        "block";


      updateManifest();

    }
  );


  copyButton.addEventListener(
    "click",
    async function () {

      if (!manifestUrl.value) {
        return;
      }


      try {

        await navigator.clipboard.writeText(
          manifestUrl.value
        );

      }

      catch {

        manifestUrl.focus();
        manifestUrl.select();

        document.execCommand("copy");

      }


      copyButton.textContent =
        "Copied";


      setTimeout(
        function () {
          copyButton.textContent =
            "Copy";
        },
        1500
      );

    }
  );

})();
`;
}


export default async (request) => {

  const url =
    new URL(request.url);

  const pathname =
    url.pathname;


  /* -------------------------------------------------- */
  /* EXTERNAL HOMEPAGE JAVASCRIPT */
  /* -------------------------------------------------- */

  if (pathname === "/homepage.js") {

    return new Response(
      homepageScript(),
      {
        headers: {
          "Content-Type":
            "application/javascript; charset=utf-8",

          "Cache-Control":
            "no-store"
        }
      }
    );

  }


  /* -------------------------------------------------- */
  /* MANIFEST */
  /* -------------------------------------------------- */

  if (
    pathname === "/manifest.json" ||
    pathname.match(
      /^\/[^/]+\/manifest\.json$/
    )
  ) {

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

        resources:
          ["stream"],

        types:
          ["movie", "series"],

        catalogs:
          [],

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
        headers: {
          "Content-Type":
            "application/json"
        }
      }
    );

  }


  /* -------------------------------------------------- */
  /* HOMEPAGE */
  /* -------------------------------------------------- */

  const html = `<!DOCTYPE html>

<html>

<head>

<meta name="viewport"
      content="width=device-width, initial-scale=1">

<meta name="theme-color"
      content="#111111">

<title>ShowBox Stremio Addon</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 40px 20px;
  background: #111;
  color: #eee;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.container {
  width: 100%;
  max-width: 760px;
  margin: auto;
}

h1 {
  margin: 0 0 12px;
  font-size: 38px;
}

.subtitle {
  margin-bottom: 42px;
  color: #999;
  font-size: 18px;
}

label.title {
  display: block;
  margin-bottom: 10px;
  font-size: 17px;
}

#tokenInput {
  width: 100%;
  padding: 17px 18px;
  border: 1px solid #333;
  border-radius: 14px;
  background: #1b1b1b;
  color: #fff;
  font-size: 17px;
  outline: none;
}

#tokenInput:focus {
  border-color: #777;
}

#generateButton {
  width: 100%;
  margin-top: 16px;
  padding: 16px 20px;
  border: 1px solid #444;
  border-radius: 14px;
  background: #fff;
  color: #111;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
}

#checkStatus {
  min-height: 24px;
  margin-top: 14px;
  color: #999;
}

.success {
  color: #fff !important;
}

.error {
  color: #aaa !important;
}

#configuration {
  display: none;
  margin-top: 42px;
}


/* -------------------------------------------------- */
/* FILTERING */
/* -------------------------------------------------- */

.section-title {
  margin: 0;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.5px;
}

.section-description {
  margin-top: 6px;
  margin-bottom: 24px;
  color: #85858d;
  font-size: 13px;
  line-height: 1.4;
}

.filter-card {
  padding: 16px;
  border: 1px solid #202126;
  border-radius: 20px;
  background: #17181d;
}

.filter-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 14px;
  color: #cfd0d7;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.filter-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #858995;
  font-size: 22px;
}

.filter-option {
  padding: 20px;
  border: 1px solid #2c2e36;
  border-radius: 16px;
  background: #20222a;
}

.filter-option-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 18px;
  color: #f0f0f3;
  font-size: 18px;
  font-weight: 600;
}

.help-button {
  width: 29px;
  height: 29px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #363942;
  color: #d7d8dd;
  font-size: 15px;
  font-weight: 700;
}

.size-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.size-field label {
  display: block;
  margin-bottom: 8px;
  color: #858995;
  font-size: 14px;
  font-weight: 600;
}

.size-input {
  width: 100%;
  height: 54px;
  padding: 0 18px;
  border: 1px solid #343742;
  border-radius: 13px;
  background: #292c35;
  color: #fff;
  font-size: 18px;
  outline: none;
}

.size-input::placeholder {
  color: #858995;
}

.size-input:focus {
  border-color: #555a68;
}


/* -------------------------------------------------- */
/* QUALITY SETTINGS */
/* -------------------------------------------------- */

.quality-section {
  margin-top: 38px;
}

.configuration-title {
  margin-bottom: 6px;
  font-size: 24px;
  font-weight: 600;
}

.description {
  margin-bottom: 22px;
  color: #85858d;
  font-size: 13px;
  line-height: 1.4;
}

.quality-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quality-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px;
  border: 1px solid #2d2d2d;
  border-radius: 14px;
  background: #1b1b1b;
}

.quality-name {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 17px;
}

.quality-checkbox {
  width: 20px;
  height: 20px;
  accent-color: #fff;
}

.move-buttons {
  display: flex;
  gap: 7px;
}

.move-button {
  width: 44px;
  height: 40px;
  padding: 0;
  border: 1px solid #333;
  border-radius: 9px;
  background: #292929;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}

.move-button:disabled {
  opacity: .25;
  cursor: default;
}


/* -------------------------------------------------- */
/* RESULT */
/* -------------------------------------------------- */

#result {
  margin-top: 36px;
}

.result-label {
  display: block;
  margin-bottom: 10px;
  color: #bbb;
}

.result-row {
  display: flex;
  gap: 10px;
}

#manifestUrl {
  flex: 1;
  min-width: 0;
  padding: 17px 18px;
  border: 1px solid #333;
  border-radius: 14px;
  background: #1b1b1b;
  color: #fff;
  font-size: 15px;
}

#copyButton {
  padding: 0 20px;
  border: 1px solid #333;
  border-radius: 14px;
  background: #292929;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

#installButton {
  width: 100%;
  margin-top: 14px;
  padding: 16px 20px;
  display: block;
  border: 0;
  border-radius: 14px;
  background: #fff;
  color: #111;
  text-align: center;
  text-decoration: none;
  font-size: 17px;
  font-weight: 600;
}

#installButton.disabled {
  background: #333;
  color: #777;
  pointer-events: none;
  cursor: default;
}

.note {
  margin-top: 16px;
  color: #777;
  line-height: 1.5;
  font-size: 13px;
}

@media (max-width: 600px) {

  body {
    padding: 28px 16px;
  }

  h1 {
    font-size: 30px;
  }

  .size-fields {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .filter-option {
    padding: 16px;
  }

  .size-input {
    padding: 0 14px;
  }

  .result-row {
    flex-direction: column;
  }

  #copyButton {
    min-height: 48px;
  }

}

</style>

</head>

<body>

<div class="container">

<h1>
ShowBox Stremio Addon
</h1>

<div class="subtitle">
Enter your FebBox UI token to generate your addon.
</div>

<label
  class="title"
  for="tokenInput"
>
ShowBox UI Token
</label>

<input
  id="tokenInput"
  type="password"
  autocomplete="off"
  autocapitalize="none"
  spellcheck="false"
  placeholder="Enter your ShowBox UI token"
>

<button
  id="generateButton"
  type="button"
>
Generate
</button>

<div id="checkStatus"></div>

<div id="configuration">

<section>

<div class="section-title">
Filtering
</div>

<div class="section-description">
Drop streams you never want to see.
</div>

<div class="filter-card">

<div class="filter-heading">

<span class="filter-icon">
▽
</span>

<span>
FILE SIZE
</span>

</div>

<div class="filter-option">

<div class="filter-option-title">

<span>
Keep streams between
</span>

<button
  type="button"
  class="help-button"
  title="Leave either field empty for no limit."
>
?
</button>

</div>

<div class="size-fields">

<div class="size-field">

<label for="minSize">
Min (GB)
</label>

<input
  id="minSize"
  class="size-input"
  type="number"
  min="0"
  step="0.1"
  placeholder="No minimum"
>

</div>

<div class="size-field">

<label for="maxSize">
Max (GB)
</label>

<input
  id="maxSize"
  class="size-input"
  type="number"
  min="0"
  step="0.1"
  placeholder="No maximum"
>

</div>

</div>

</div>

</div>

</section>


<section class="quality-section">

<div class="configuration-title">
Quality settings
</div>

<div class="description">
Enable the qualities you want. Move them up or down to set their priority.
</div>

<div
  id="qualityList"
  class="quality-list"
>
${qualityRows()}
</div>

</section>


<div id="result">

<span class="result-label">
Manifest URL
</span>

<div class="result-row">

<input
  id="manifestUrl"
  type="text"
  readonly
>

<button
  id="copyButton"
  type="button"
>
Copy
</button>

</div>

<a
  id="installButton"
  class="disabled"
  href="#"
>
Install in Stremio
</a>

<div class="note">
On iOS, if the Install button does not open Stremio,
use Copy and paste the manifest URL into Stremio's Add Addon field.
</div>

</div>

</div>

</div>

<script src="/homepage.js"></script>

</body>

</html>`;


  return new Response(
    html,
    {
      headers: {
        "Content-Type":
          "text/html; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );

};


export const config = {

  path: [
    "/",
    "/homepage.js",
    "/manifest.json",
    "/:config/manifest.json"
  ]

};
