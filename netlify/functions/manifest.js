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


function homepageScript() {

  return `
(function () {

"use strict";

const tokenInput =
  document.getElementById("tokenInput");

const testButton =
  document.getElementById("testButton");

const checkStatus =
  document.getElementById("checkStatus");

const configuration =
  document.getElementById("configuration");

const qualityList =
  document.getElementById("qualityList");

const manifestUrl =
  document.getElementById("manifestUrl");

const copyButton =
  document.getElementById("copyButton");

const installButton =
  document.getElementById("installButton");

let currentToken = "";
let connectionValid = false;


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


function encodeConfig(config) {

  const json =
    JSON.stringify(config);

  const bytes =
    new TextEncoder().encode(json);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\\\\+/g, "-")
    .replace(/\\\\//g, "_")
    .replace(/=+$/, "");

}


function updateManifest() {

  if (!connectionValid || !currentToken) {
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
    uiToken: currentToken,
    qualities
  };


  const encoded =
    encodeConfig(config);


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


tokenInput.addEventListener(
  "input",
  function () {

    connectionValid = false;
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


testButton.addEventListener(
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


    testButton.disabled = true;

    connectionValid = false;
    currentToken = "";

    configuration.style.display =
      "none";

    installButton.classList.add(
      "disabled"
    );

    installButton.href = "#";

    checkStatus.textContent =
      "Checking connection...";

    checkStatus.className = "";


    try {

      const response =
        await fetch(
          "/check-token",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                token
              })
          }
        );


      const data =
        await response.json();


      if (data.status === "usable") {

        connectionValid = true;
        currentToken = token;

        checkStatus.textContent =
          "Cookie is working.";

        checkStatus.className =
          "success";

        configuration.style.display =
          "block";

        updateManifest();

        tokenInput.value = "";

      }

      else if (
        data.status === "rate_limited"
      ) {

        checkStatus.textContent =
          "Cookie is currently rate limited.";

        checkStatus.className =
          "error";

      }

      else if (
        data.status === "invalid"
      ) {

        checkStatus.textContent =
          "Cookie is not usable.";

        checkStatus.className =
          "error";

      }

      else {

        checkStatus.textContent =
          data.message ||
          "Could not verify the cookie.";

        checkStatus.className =
          "error";

      }

    }

    catch {

      checkStatus.textContent =
        "Could not contact the token checker.";

      checkStatus.className =
        "error";

    }

    finally {

      testButton.disabled = false;

    }

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
  /* HOMEPAGE JAVASCRIPT */
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

#testButton {
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

#testButton:disabled {
  opacity: .55;
  cursor: default;
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
  margin-top: 38px;
}

.configuration-title {
  margin-bottom: 8px;
  font-size: 22px;
  font-weight: 600;
}

.description {
  margin-bottom: 22px;
  color: #999;
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
}

@media (max-width: 600px) {

  body {
    padding: 28px 16px;
  }

  h1 {
    font-size: 30px;
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
Enter your ShowBox UI token to test the connection and configure the addon.
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
  id="testButton"
  type="button"
>
Test Connection
</button>

<div id="checkStatus"></div>

<div id="configuration">

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
