import { createConfig } from "./config-store.js";


const DEFAULT_QUALITIES = [
  "ORG",
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p"
];


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


function filterRows() {
  return `
    <div class="filter-setting-row">

      <label class="filter-setting-name">

        <input
          type="checkbox"
          class="filter-setting-checkbox"
          id="camFilter"
          checked
        >

        <span>CAM</span>

      </label>

    </div>
  `;
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

  const filterList =
    document.getElementById("filterList");

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


  function getFilterConfig() {

    return {

      cam:
        document.getElementById("camFilter").checked

    };

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


  function clearManifest() {

    manifestUrl.value = "";

    installButton.classList.add(
      "disabled"
    );

    installButton.href = "#";

  }


  async function createManifest() {

    if (!currentToken) {
      return;
    }


    const qualities =
      getQualityConfig();


    if (!qualities.some(item => item.enabled)) {

      checkStatus.textContent =
        "Enable at least one quality.";

      checkStatus.className =
        "error";

      clearManifest();

      return;

    }


    const config = {

      uiToken:
        currentToken,

      fileSize:
        getFileSizeConfig(),

      qualities,

      filters:
        getFilterConfig()

    };


    generateButton.disabled =
      true;

    generateButton.textContent =
      "Generating...";


    checkStatus.textContent =
      "";


    try {

      const response =
        await fetch(
          "/create-config",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(config)
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ||
          "Failed to create configuration"
        );

      }


      manifestUrl.value =
        data.manifestUrl;

      installButton.href =
        data.stremioUrl;

      installButton.classList.remove(
        "disabled"
      );


      checkStatus.textContent =
        "Configuration generated.";

      checkStatus.className =
        "success";


      configuration.style.display =
        "block";


    }

    catch (error) {

      console.error(
        "[ShowBox] Configuration generation failed:",
        error
      );


      checkStatus.textContent =
        error.message ||
        "Failed to create configuration.";

      checkStatus.className =
        "error";


      clearManifest();

    }

    finally {

      generateButton.disabled =
        false;

      generateButton.textContent =
        "Generate";

    }

  }


  qualityList.addEventListener(
    "change",
    function () {

      clearManifest();

      checkStatus.textContent =
        "Settings changed. Generate again to update the addon.";

      checkStatus.className =
        "";

    }
  );


  filterList.addEventListener(
    "change",
    function () {

      clearManifest();

      checkStatus.textContent =
        "Settings changed. Generate again to update the addon.";

      checkStatus.className =
        "";

    }
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


      clearManifest();

      checkStatus.textContent =
        "Settings changed. Generate again to update the addon.";

      checkStatus.className =
        "";

    }
  );


  minSizeInput.addEventListener(
    "input",
    function () {

      clearManifest();

      checkStatus.textContent =
        "Settings changed. Generate again to update the addon.";

      checkStatus.className =
        "";

    }
  );


  maxSizeInput.addEventListener(
    "input",
    function () {

      clearManifest();

      checkStatus.textContent =
        "Settings changed. Generate again to update the addon.";

      checkStatus.className =
        "";

    }
  );


  tokenInput.addEventListener(
    "input",
    function () {

      currentToken = "";

      configuration.style.display =
        "none";

      clearManifest();

      checkStatus.textContent =
        "";

    }
  );


  generateButton.addEventListener(
    "click",
    async function () {

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


      currentToken =
        token;


      checkStatus.textContent =
        "";

      checkStatus.className =
        "success";


      configuration.style.display =
        "block";


      await createManifest();

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
  /* CREATE CONFIGURATION */
  /* -------------------------------------------------- */

  if (
    pathname === "/create-config" &&
    request.method === "POST"
  ) {

    try {

      const body =
        await request.json();


      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {

        return new Response(
          JSON.stringify({
            error:
              "Invalid configuration"
          }),
          {
            status: 400,

            headers: {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          }
        );

      }


      const uiToken =
        typeof body.uiToken === "string"
          ? body.uiToken.trim()
          : "";


      if (!uiToken) {

        return new Response(
          JSON.stringify({
            error:
              "ShowBox UI token is required"
          }),
          {
            status: 400,

            headers: {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          }
        );

      }


      const config = {

        uiToken,

        fileSize:
          body.fileSize &&
          typeof body.fileSize === "object"

            ? {

                minGb:
                  body.fileSize.minGb === null ||
                  body.fileSize.minGb === undefined ||
                  body.fileSize.minGb === ""
                    ? null
                    : Number(
                        body.fileSize.minGb
                      ),

                maxGb:
                  body.fileSize.maxGb === null ||
                  body.fileSize.maxGb === undefined ||
                  body.fileSize.maxGb === ""
                    ? null
                    : Number(
                        body.fileSize.maxGb
                      )

              }

            : {
                minGb: null,
                maxGb: null
              },


        qualities:
          Array.isArray(body.qualities)

            ? body.qualities
                .filter(
                  item =>
                    item &&
                    typeof item.name === "string"
                )
                .map(item => ({
                  name:
                    item.name,

                  enabled:
                    item.enabled !== false
                }))

            : [],


        filters:
          body.filters &&
          typeof body.filters === "object"

            ? {
                cam:
                  body.filters.cam !== false
              }

            : {
                cam: true
              }

      };


      if (
        config.fileSize.minGb !== null &&
        !Number.isFinite(
          config.fileSize.minGb
        )
      ) {

        config.fileSize.minGb =
          null;

      }


      if (
        config.fileSize.maxGb !== null &&
        !Number.isFinite(
          config.fileSize.maxGb
        )
      ) {

        config.fileSize.maxGb =
          null;

      }


      if (
        config.fileSize.minGb !== null &&
        config.fileSize.maxGb !== null &&
        config.fileSize.minGb >
          config.fileSize.maxGb
      ) {

        return new Response(
          JSON.stringify({
            error:
              "Minimum size cannot be greater than maximum size"
          }),
          {
            status: 400,

            headers: {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          }
        );

      }


      const configId =
        await createConfig(config);


      const manifestUrl =
        `${url.origin}/${configId}/manifest.json`;


      const stremioUrl =
        `stremio://${url.host}/${configId}/manifest.json`;


      return new Response(
        JSON.stringify({

          configId,

          manifestUrl,

          stremioUrl

        }),
        {
          status: 200,

          headers: {
            "Content-Type":
              "application/json; charset=utf-8",

            "Cache-Control":
              "no-store"
          }
        }
      );

    }

    catch (error) {

      console.error(
        "[ShowBox] Config creation failed:",
        error
      );


      return new Response(
        JSON.stringify({
          error:
            "Failed to create configuration"
        }),
        {
          status: 500,

          headers: {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        }
      );

    }

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
            "application/json",

          "Cache-Control":
            "no-store"

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
      content="#0d0e11">

<title>ShowBox Stremio Addon</title>

<style>

:root {
  color-scheme: dark;

  --bg: #0d0e11;
  --surface: #15161b;
  --surface-2: #1d1f25;
  --surface-3: #252831;

  --border: #292c34;
  --border-light: #343740;

  --text: #f1f1f3;
  --text-soft: #c9cad0;
  --muted: #858892;
  --muted-2: #696c75;

  --white: #f4f4f5;
  --black: #101115;

  --success: #a7e3b1;
  --error: #ff9b9b;

  --radius-lg: 22px;
  --radius-md: 16px;
  --radius-sm: 13px;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--bg);
}

body {
  margin: 0;
  min-height: 100vh;

  background:
    radial-gradient(
      circle at 50% -15%,
      rgba(255,255,255,.055),
      transparent 38%
    ),
    var(--bg);

  color: var(--text);

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "SF Pro Text",
    "Segoe UI",
    sans-serif;

  -webkit-font-smoothing: antialiased;
}

.container {
  width: min(680px, calc(100% - 28px));
  margin: auto;
  padding: 48px 0 70px;
}


/* -------------------------------------------------- */
/* HERO */
/* -------------------------------------------------- */

h1 {
  margin: 0;

  font-size: clamp(36px, 8vw, 48px);
  line-height: 1;
  font-weight: 750;
  letter-spacing: -1.8px;
}

.subtitle {
  max-width: 520px;

  margin:
    14px 0 0;

  color: var(--muted);

  font-size: 14px;
  line-height: 1.55;
}


/* -------------------------------------------------- */
/* TOKEN */
/* -------------------------------------------------- */

.title {
  display: block;

  margin:
    38px 0 9px;

  color: var(--muted-2);

  font-size: 11px;
  font-weight: 700;

  letter-spacing: .12em;
  text-transform: uppercase;
}

#tokenInput {
  width: 100%;
  height: 54px;

  padding:
    0 16px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  outline: none;

  background:
    var(--surface-2);

  color: var(--text);

  font-size: 14px;

  transition:
    border-color .15s ease,
    background .15s ease;
}

#tokenInput::placeholder {
  color: var(--muted-2);
}

#tokenInput:focus {
  border-color: #50545f;
  background: var(--surface-3);
}

#generateButton {
  width: 100%;
  height: 50px;

  margin-top: 12px;

  padding: 0 20px;

  border: 0;
  border-radius: 14px;

  background: var(--white);
  color: var(--black);

  font-size: 14px;
  font-weight: 700;

  cursor: pointer;

  transition:
    opacity .15s ease,
    transform .12s ease;
}

#generateButton:hover {
  opacity: .9;
}

#generateButton:active {
  transform: scale(.985);
}

#generateButton:disabled {
  opacity: .55;
  cursor: default;
}

#checkStatus {
  min-height: 18px;

  margin-top: 10px;

  color: var(--muted-2);

  font-size: 12px;
}

.success {
  color: var(--success) !important;
}

.error {
  color: var(--error) !important;
}


/* -------------------------------------------------- */
/* CONFIGURATION */
/* -------------------------------------------------- */

#configuration {
  display: none;
  margin-top: 42px;
}


/* -------------------------------------------------- */
/* SECTION HEADERS */
/* -------------------------------------------------- */

.section-title {
  margin: 0;

  color: var(--text);

  font-size: 29px;
  line-height: 1.15;
  font-weight: 700;

  letter-spacing: -.7px;
}

.section-description {
  margin:
    6px 0 14px;

  color: var(--muted-2);

  font-size: 12px;
  line-height: 1.45;
}


/* -------------------------------------------------- */
/* FILTERING */
/* -------------------------------------------------- */

.filter-card {
  padding: 14px;

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-lg);

  background:
    var(--surface);
}

.filter-heading {
  padding:
    5px 7px 12px;

  color:
    var(--muted-2);

  font-size: 11px;
  font-weight: 700;

  letter-spacing: .12em;
  text-transform: uppercase;
}

.filter-icon {
  display: none;
}

.filter-option {
  padding: 17px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-md);

  background:
    var(--surface-2);
}

.filter-option-title {
  display: flex;
  align-items: center;

  gap: 9px;

  margin: 0 0 5px;

  color: var(--text);

  font-size: 17px;
  font-weight: 650;

  letter-spacing: -.2px;
}

.help-button {
  width: 24px;
  height: 24px;

  padding: 0;

  border: 0;
  border-radius: 50%;

  background: #30333b;

  color: var(--muted);

  font-size: 12px;
  font-weight: 700;

  cursor: pointer;
}

.size-fields {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 10px;

  margin-top: 14px;
}

.size-field label {
  display: block;

  margin:
    0 0 7px;

  color:
    var(--muted-2);

  font-size: 11px;
  font-weight: 600;

  letter-spacing: .03em;
}

.size-input {
  width: 100%;
  height: 52px;

  padding:
    0 14px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  outline: none;

  background:
    var(--surface-3);

  color:
    var(--text);

  font-size: 14px;
}

.size-input::placeholder {
  color:
    var(--muted-2);
}

.size-input:focus {
  border-color:
    #50545f;
}


/* -------------------------------------------------- */
/* QUALITY */
/* -------------------------------------------------- */

.quality-section {
  margin-top: 38px;
}

.configuration-title {
  margin: 0;

  color:
    var(--text);

  font-size: 29px;
  line-height: 1.15;

  font-weight: 700;

  letter-spacing: -.7px;
}

.description {
  margin:
    6px 0 14px;

  color:
    var(--muted-2);

  font-size: 12px;
  line-height: 1.45;
}

.quality-list {
  display: flex;

  flex-direction:
    column;

  gap: 8px;

  padding: 8px;

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-lg);

  background:
    var(--surface);
}

.quality-row {
  display: flex;

  align-items: center;
  justify-content: space-between;

  min-height: 62px;

  padding:
    11px 12px 11px 14px;

  border-radius:
    var(--radius-md);

  background:
    var(--surface-2);

  border:
    1px solid transparent;

  transition:
    background .15s ease,
    border-color .15s ease;
}

.quality-row:hover {
  border-color:
    var(--border-light);
}

.filter-section {
  margin-top: 38px;
}

.filter-setting-list {
  display: flex;

  flex-direction: column;

  gap: 8px;

  padding: 8px;

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-lg);

  background:
    var(--surface);
}

.filter-setting-row {
  display: flex;

  align-items: center;

  min-height: 62px;

  padding:
    11px 14px;

  border-radius:
    var(--radius-md);

  background:
    var(--surface-2);

  border:
    1px solid transparent;
}

.filter-setting-name {
  display: flex;

  align-items: center;

  gap: 12px;

  color:
    var(--text);

  font-size: 15px;
  font-weight: 600;

  cursor: pointer;
}

.filter-setting-checkbox {
  width: 20px;
  height: 20px;

  margin: 0;

  accent-color:
    #f1f1f2;
}

.quality-name {
  display: flex;

  align-items: center;

  gap: 12px;

  color:
    var(--text);

  font-size: 15px;
  font-weight: 600;

  cursor: pointer;
}

.quality-checkbox {
  width: 20px;
  height: 20px;

  margin: 0;

  accent-color:
    #f1f1f2;
}

.move-buttons {
  display: flex;

  gap: 6px;
}

.move-button {
  width: 36px;
  height: 36px;

  padding: 0;

  border:
    1px solid var(--border-light);

  border-radius:
    10px;

  background:
    var(--surface-3);

  color:
    var(--text-soft);

  font-size: 16px;

  cursor: pointer;
}

.move-button:hover {
  background:
    #2b2e36;
}

.move-button:active {
  transform:
    scale(.95);
}

.move-button:disabled {
  opacity:
    .3;

  cursor:
    default;
}


/* -------------------------------------------------- */
/* RESULT */
/* -------------------------------------------------- */

#result {
  margin-top: 40px;
}

.result-label {
  display: block;

  margin-bottom: 9px;

  color:
    var(--muted-2);

  font-size: 11px;
  font-weight: 700;

  letter-spacing: .12em;
  text-transform: uppercase;
}

.result-row {
  display: flex;

  gap: 10px;
}

#manifestUrl {
  flex: 1;

  min-width: 0;

  height: 50px;

  padding:
    0 14px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  outline: none;

  background:
    var(--surface-2);

  color:
    var(--text-soft);

  font-size: 12px;
}

#copyButton {
  width: 90px;

  border: 0;

  border-radius:
    var(--radius-sm);

  background:
    var(--surface-3);

  color:
    var(--text);

  font-size: 13px;
  font-weight: 650;

  cursor: pointer;
}

#copyButton:hover {
  background:
    #2b2e36;
}

#installButton {
  display: flex;

  align-items: center;
  justify-content: center;

  width: 100%;
  height: 50px;

  margin-top: 10px;

  border:
    1px solid var(--border-light);

  border-radius:
    var(--radius-sm);

  background:
    var(--white);

  color:
    var(--black);

  font-size: 13px;
  font-weight: 700;

  text-decoration: none;

  cursor: pointer;

  transition:
    opacity .15s ease;
}

#installButton:hover {
  opacity:
    .9;
}

#installButton.disabled {
  opacity:
    .35;

  pointer-events:
    none;
}

.note {
  margin-top: 12px;

  color:
    var(--muted-2);

  font-size: 11px;

  line-height: 1.5;
}


/* -------------------------------------------------- */
/* RESPONSIVE */
/* -------------------------------------------------- */

@media (max-width: 600px) {

  .container {
    width:
      calc(100% - 24px);

    padding:
      38px 0 60px;
  }

  h1 {
    font-size:
      38px;

    letter-spacing:
      -1.5px;
  }

  .subtitle {
    font-size:
      13px;
  }

  .section-title,
  .configuration-title {
    font-size:
      27px;
  }

  .size-fields {
    gap:
      9px;
  }

  .size-input {
    font-size:
      14px;
  }

  .result-row {
    flex-direction:
      column;
  }

  #copyButton {
    width: 100%;
  }

}

</style>

</head>

<body>

<div class="container">


<!-- HERO -->

<h1>
ShowBox
</h1>

<div class="subtitle">
Enter your FebBox UI token to generate your addon.
</div>


<!-- TOKEN -->

<label
  class="title"
  for="tokenInput"
>
ShowBox UI Token
</label>

<input
  id="tokenInput"
  type="text"
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


<!-- FILTERING -->

<section>

<div class="section-title">
Filtering
</div>

<div class="section-description">
Drop streams you never want to see.
</div>

<div class="filter-card">

<div class="filter-heading">
FILE SIZE
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


<!-- QUALITY -->

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


<!-- STREAM FILTERS -->

<section class="filter-section">

<div class="configuration-title">
Stream filters
</div>

<div class="description">
Enable the stream types you want to keep. These settings do not change quality priority.
</div>

<div
  id="filterList"
  class="filter-setting-list"
>
${filterRows()}
</div>

</section>


<!-- RESULT -->

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


<script>
${homepageScript()}
</script>

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
    "/create-config",
    "/manifest.json",
    "/:config/manifest.json"
  ]

};
