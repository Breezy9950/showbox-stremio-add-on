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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function qualityRows() {
  return DEFAULT_QUALITIES.map((quality, index) => `
    <div class="quality-row" data-index="${index}">
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
          data-index="${index}"
          ${index === 0 ? "disabled" : ""}
        >↑</button>

        <button
          type="button"
          class="move-button"
          data-action="down"
          data-index="${index}"
          ${index === DEFAULT_QUALITIES.length - 1 ? "disabled" : ""}
        >↓</button>
      </div>
    </div>
  `).join("");
}

export default async (request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ------------------------------------------------------------
  // MANIFEST
  // ------------------------------------------------------------

  if (
    pathname === "/manifest.json" ||
    pathname.match(/^\/[^/]+\/manifest\.json$/)
  ) {
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
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  // ------------------------------------------------------------
  // HOMEPAGE
  // ------------------------------------------------------------

  const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">

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
  max-width: 760px;
  margin: auto;
}

h1 {
  font-size: 38px;
  margin: 0 0 12px;
}

.subtitle {
  color: #999;
  margin-bottom: 42px;
  font-size: 18px;
}

label.title {
  display: block;
  margin-bottom: 10px;
  font-size: 17px;
}

input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 17px 18px;
  border-radius: 14px;
  border: 1px solid #333;
  background: #1b1b1b;
  color: white;
  font-size: 17px;
  outline: none;
}

input:focus {
  border-color: #666;
}

button {
  border: 0;
  border-radius: 14px;
  padding: 16px 20px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  width: 100%;
  margin-top: 16px;
  background: #f5f5f5;
  color: #111;
}

.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.secondary {
  background: #292929;
  color: white;
}

.status {
  margin-top: 14px;
  min-height: 24px;
  color: #aaa;
}

.configuration {
  display: none;
  margin-top: 38px;
}

.configuration.visible {
  display: block;
}

.configuration h2 {
  margin-bottom: 8px;
}

.description {
  color: #999;
  margin-bottom: 22px;
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
  border-radius: 14px;
  background: #1b1b1b;
  border: 1px solid #2d2d2d;
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
}

.move-buttons {
  display: flex;
  gap: 7px;
}

.move-button {
  width: 44px;
  height: 40px;
  padding: 0;
  background: #292929;
  color: white;
}

.move-button:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.result {
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

.result-row input {
  flex: 1;
}

.install {
  width: 100%;
  margin-top: 14px;
  background: #f5f5f5;
  color: #111;
}

.note {
  margin-top: 16px;
  color: #777;
  line-height: 1.5;
}

.success {
  color: #72d572;
}

.error {
  color: #ff7272;
}

.hidden {
  display: none !important;
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
}
</style>
</head>

<body>

<div class="container">

  <h1>ShowBox Stremio Addon</h1>

  <div class="subtitle">
    Enter your ShowBox UI token to configure the addon.
  </div>

  <label class="title" for="tokenInput">
    ShowBox UI Token
  </label>

  <input
    id="tokenInput"
    type="password"
    autocomplete="off"
    placeholder="Enter your ShowBox UI token"
  >

  <button id="checkButton" class="primary" type="button">
    Check Token
  </button>

  <div id="checkStatus" class="status"></div>

  <button
    id="generateButton"
    class="primary"
    type="button"
    disabled
  >
    Generate Install Link
  </button>

  <!-- QUALITY SETTINGS -->
  <div id="configuration" class="configuration">

    <h2>Quality settings</h2>

    <div class="description">
      Enable the qualities you want. Move them up or down to set their priority.
    </div>

    <div id="qualityList" class="quality-list">
      ${qualityRows()}
    </div>

    <div class="result">

      <span class="result-label">
        Configured Manifest URL
      </span>

      <div class="result-row">

        <input
          id="manifestUrl"
          type="text"
          readonly
        >

        <button
          id="copyButton"
          class="secondary"
          type="button"
        >
          Copy
        </button>

      </div>

      <button
        id="installButton"
        class="install"
        type="button"
      >
        Install in Stremio
      </button>

      <div class="note">
        On iOS, if the Install button does not open Stremio,
        use Copy and paste the manifest URL into Stremio's Add Addon field.
      </div>

    </div>

  </div>

</div>

<script>
(function () {

  const DEFAULT_QUALITIES = ${JSON.stringify(DEFAULT_QUALITIES)};

  const tokenInput = document.getElementById("tokenInput");
  const checkButton = document.getElementById("checkButton");
  const checkStatus = document.getElementById("checkStatus");
  const generateButton = document.getElementById("generateButton");

  const configuration = document.getElementById("configuration");
  const qualityList = document.getElementById("qualityList");

  const manifestUrl = document.getElementById("manifestUrl");
  const copyButton = document.getElementById("copyButton");
  const installButton = document.getElementById("installButton");

  let tokenChecked = false;

  // ----------------------------------------------------------
  // QUALITY LIST
  // ----------------------------------------------------------

  function getQualityRows() {
    return Array.from(
      qualityList.querySelectorAll(".quality-row")
    );
  }

  function refreshMoveButtons() {

    const rows = getQualityRows();

    rows.forEach(function (row, index) {

      const up = row.querySelector('[data-action="up"]');
      const down = row.querySelector('[data-action="down"]');

      up.disabled = index === 0;
      down.disabled = index === rows.length - 1;

    });
  }

  function moveQuality(index, direction) {

    const rows = getQualityRows();

    if (
      index < 0 ||
      index >= rows.length
    ) {
      return;
    }

    if (direction === "up" && index > 0) {

      qualityList.insertBefore(
        rows[index],
        rows[index - 1]
      );

    } else if (
      direction === "down" &&
      index < rows.length - 1
    ) {

      qualityList.insertBefore(
        rows[index + 1],
        rows[index]
      );

    }

    refreshMoveButtons();
  }

  qualityList.addEventListener("click", function (event) {

    const button = event.target.closest(".move-button");

    if (!button) {
      return;
    }

    const row = button.closest(".quality-row");
    const rows = getQualityRows();
    const index = rows.indexOf(row);

    moveQuality(
      index,
      button.dataset.action
    );

  });

  refreshMoveButtons();

  // ----------------------------------------------------------
  // TOKEN CHECK STATE
  // ----------------------------------------------------------

  function resetTokenCheck() {

    tokenChecked = false;

    generateButton.disabled = true;

    configuration.classList.remove("visible");

    checkStatus.textContent = "";
    checkStatus.className = "status";

  }

  tokenInput.addEventListener("input", function () {
    resetTokenCheck();
  });

  // ----------------------------------------------------------
  // CHECK TOKEN
  // ----------------------------------------------------------

  checkButton.addEventListener("click", async function () {

    const token = tokenInput.value.trim();

    if (!token) {

      checkStatus.textContent =
        "Enter your ShowBox UI token first.";

      checkStatus.className =
        "status error";

      return;
    }

    checkButton.disabled = true;
    generateButton.disabled = true;

    configuration.classList.remove("visible");

    checkStatus.textContent =
      "Checking token...";

    checkStatus.className =
      "status";

    try {

      const response = await fetch("/check-token", {

        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          token: token
        })

      });

      const data = await response.json();

      if (data.status === "usable") {

        tokenChecked = true;

        checkStatus.textContent =
          "Token is usable.";

        checkStatus.className =
          "status success";

        generateButton.disabled = false;

        // Only reveal quality settings after
        // the token has successfully been checked.
        configuration.classList.add("visible");

      } else if (data.status === "rate_limited") {

        tokenChecked = false;

        checkStatus.textContent =
          "This token is currently rate limited. Wait and try again later.";

        checkStatus.className =
          "status error";

      } else if (data.status === "invalid") {

        tokenChecked = false;

        checkStatus.textContent =
          "This token was rejected and could not be used.";

        checkStatus.className =
          "status error";

      } else {

        tokenChecked = false;

        checkStatus.textContent =
          data.message ||
          "The token could not be verified right now.";

        checkStatus.className =
          "status error";
      }

    } catch (error) {

      tokenChecked = false;

      checkStatus.textContent =
        "Could not contact the token checker.";

      checkStatus.className =
        "status error";

    } finally {

      checkButton.disabled = false;

    }

  });

  // ----------------------------------------------------------
  // GET CURRENT QUALITY CONFIGURATION
  // ----------------------------------------------------------

  function getQualityConfiguration() {

    const rows = getQualityRows();

    return rows.map(function (row) {

      const checkbox =
        row.querySelector(".quality-checkbox");

      return {
        name: checkbox.dataset.quality,
        enabled: checkbox.checked
      };

    });

  }

  // ----------------------------------------------------------
  // GENERATE
  // ----------------------------------------------------------

  generateButton.addEventListener("click", function () {

    if (!tokenChecked) {
      return;
    }

    const token = tokenInput.value.trim();

    if (!token) {
      return;
    }

    const config = {

      uiToken: token,

      qualities: getQualityConfiguration()

    };

    const encoded = btoa(
      unescape(
        encodeURIComponent(
          JSON.stringify(config)
        )
      )
    )
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_")
      .replace(/=+$/, "");

    const host = window.location.host;

    const url =
      "https://" +
      host +
      "/" +
      encoded +
      "/manifest.json";

    manifestUrl.value = url;

    // Clear the token after generating.
    tokenInput.value = "";

    tokenChecked = false;

    generateButton.disabled = true;

    checkStatus.textContent =
      "Addon link generated.";

    checkStatus.className =
      "status success";

  });

  // ----------------------------------------------------------
  // COPY
  // ----------------------------------------------------------

  copyButton.addEventListener("click", async function () {

    if (!manifestUrl.value) {
      return;
    }

    try {

      await navigator.clipboard.writeText(
        manifestUrl.value
      );

      copyButton.textContent = "Copied";

      setTimeout(function () {
        copyButton.textContent = "Copy";
      }, 1500);

    } catch (error) {

      manifestUrl.select();
      document.execCommand("copy");

      copyButton.textContent = "Copied";

      setTimeout(function () {
        copyButton.textContent = "Copy";
      }, 1500);

    }

  });

  // ----------------------------------------------------------
  // INSTALL
  // ----------------------------------------------------------

  installButton.addEventListener("click", function () {

    if (!manifestUrl.value) {
      return;
    }

    const stremioUrl =
      "stremio://" +
      window.location.host +
      manifestUrl.value.substring(
        ("https://" + window.location.host).length
      );

    window.location.href = stremioUrl;

  });

})();
</script>

</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
};

export const config = {
  path: [
    "/",
    "/manifest.json",
    "/:config/manifest.json"
  ]
};
