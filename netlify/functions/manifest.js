const DEFAULT_QUALITIES = [
  { label: "2160p", enabled: true },
  { label: "1440p", enabled: true },
  { label: "1080p", enabled: true },
  { label: "720p", enabled: true },
  { label: "480p", enabled: true },
  { label: "360p", enabled: false },
];

function encodeConfig(config) {
  return Buffer.from(JSON.stringify(config)).toString("base64url");
}

function qualityRows() {
  return DEFAULT_QUALITIES.map(
    (q) => `
      <label class="quality-row">
        <div class="quality-info">
          <span class="quality-name">${q.label}</span>
          <span class="quality-description">
            ${q.enabled ? "Included in streams" : "Excluded from streams"}
          </span>
        </div>

        <span class="switch">
          <input
            type="checkbox"
            data-quality="${q.label}"
            ${q.enabled ? "checked" : ""}
          >
          <span class="slider"></span>
        </span>
      </label>
    `
  ).join("");
}

const homepageScript = `
<script>
(() => {
  const tokenInput = document.getElementById("tokenInput");
  const generateButton = document.getElementById("generateButton");
  const checkStatus = document.getElementById("checkStatus");

  const configuration = document.getElementById("configuration");
  const qualityList = document.getElementById("qualityList");

  const minSizeInput = document.getElementById("minSizeInput");
  const maxSizeInput = document.getElementById("maxSizeInput");

  const manifestUrl = document.getElementById("manifestUrl");
  const copyButton = document.getElementById("copyButton");
  const installButton = document.getElementById("installButton");

  let currentToken = "";

  function getQualityConfig() {
    const qualities = {};

    document.querySelectorAll("[data-quality]").forEach((input) => {
      qualities[input.dataset.quality] = input.checked;
    });

    return qualities;
  }

  function getFileSizeConfig() {
    const minValue = minSizeInput.value.trim();
    const maxValue = maxSizeInput.value.trim();

    return {
      minGb:
        minValue === "" || Number.isNaN(Number(minValue))
          ? null
          : Number(minValue),

      maxGb:
        maxValue === "" || Number.isNaN(Number(maxValue))
          ? null
          : Number(maxValue),
    };
  }

  function updateManifest() {
    if (!currentToken) return;

    const config = {
      uiToken: currentToken,
      fileSize: getFileSizeConfig(),
      qualities: getQualityConfig(),
    };

    const encoded = btoa(
      unescape(encodeURIComponent(JSON.stringify(config)))
    )
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_")
      .replace(/=+$/, "");

    const base = window.location.origin;

    const httpsUrl =
      base + "/" + encoded + "/manifest.json";

    const stremioUrl =
      "stremio://" +
      window.location.host +
      "/" +
      encoded +
      "/manifest.json";

    manifestUrl.value = httpsUrl;
    installButton.href = stremioUrl;

    configuration.classList.add("visible");
  }

  generateButton.addEventListener("click", () => {
    const token = tokenInput.value.trim();

    if (!token) {
      checkStatus.textContent =
        "Enter your ShowBox UI token first.";
      checkStatus.className = "status error";
      return;
    }

    if (token.length <= 100) {
      checkStatus.textContent = "Invalid Cookie";
      checkStatus.className = "status error";
      return;
    }

    currentToken = token;

    checkStatus.textContent = "Token accepted";
    checkStatus.className = "status success";

    updateManifest();
  });

  tokenInput.addEventListener("input", () => {
    currentToken = "";
    configuration.classList.remove("visible");

    checkStatus.textContent = "";
    checkStatus.className = "status";
  });

  document.querySelectorAll("[data-quality]").forEach((input) => {
    input.addEventListener("change", updateManifest);
  });

  minSizeInput.addEventListener("input", updateManifest);
  maxSizeInput.addEventListener("input", updateManifest);

  copyButton.addEventListener("click", async () => {
    if (!manifestUrl.value) return;

    try {
      await navigator.clipboard.writeText(manifestUrl.value);

      copyButton.textContent = "Copied";

      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1500);
    } catch {
      manifestUrl.select();
      document.execCommand("copy");

      copyButton.textContent = "Copied";

      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1500);
    }
  });
})();
</script>
`;

export async function handler(event) {
  const path = event.path || "/";

  if (
    path === "/" ||
    path === "/homepage.js" ||
    path === "/manifest.json"
  ) {
    const homepage = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1"
/>

<title>ShowBox Stremio Addon</title>

<style>
:root {
  color-scheme: dark;

  --background: #0d0e11;
  --surface: #15161b;
  --surface-2: #1d1f25;
  --surface-3: #252831;

  --border: #292c34;
  --border-light: #32353e;

  --text: #f4f4f5;
  --muted: #92959f;
  --muted-2: #6f727c;

  --accent: #ffffff;
  --accent-text: #0d0e11;

  --success: #a7e3b1;
  --error: #ff9696;

  --radius-lg: 22px;
  --radius-md: 16px;
  --radius-sm: 13px;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--background);
}

body {
  margin: 0;
  min-height: 100vh;

  background:
    radial-gradient(
      circle at 50% -20%,
      rgba(255,255,255,.055),
      transparent 38%
    ),
    var(--background);

  color: var(--text);

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "SF Pro Text",
    Inter,
    system-ui,
    sans-serif;

  -webkit-font-smoothing: antialiased;
}

.page {
  width: min(680px, calc(100% - 32px));
  margin: 0 auto;
  padding: 54px 0 70px;
}

/* ---------------- HEADER ---------------- */

.hero {
  margin-bottom: 42px;
}

.eyebrow {
  margin-bottom: 12px;

  color: var(--muted-2);

  font-size: 11px;
  font-weight: 700;
  letter-spacing: .13em;
  text-transform: uppercase;
}

.title {
  margin: 0;

  font-size: clamp(34px, 7vw, 46px);
  line-height: 1.05;
  letter-spacing: -.045em;
  font-weight: 750;
}

.subtitle {
  max-width: 520px;
  margin: 14px 0 0;

  color: var(--muted);

  font-size: 14px;
  line-height: 1.6;
}

/* ---------------- SECTIONS ---------------- */

.section {
  margin-top: 38px;
}

.section:first-of-type {
  margin-top: 0;
}

.section-header {
  margin-bottom: 13px;
}

.section-title {
  margin: 0;

  font-size: 25px;
  line-height: 1.15;
  letter-spacing: -.025em;
  font-weight: 700;
}

.section-description {
  margin: 6px 0 0;

  color: var(--muted-2);

  font-size: 12px;
  line-height: 1.45;
}

/* ---------------- CARDS ---------------- */

.card {
  background: var(--surface);

  border: 1px solid var(--border);
  border-radius: var(--radius-lg);

  padding: 20px;
}

/* ---------------- TOKEN ---------------- */

.token-card {
  padding: 18px;
}

.token-label {
  display: block;

  margin: 0 0 9px;

  color: var(--muted-2);

  font-size: 11px;
  font-weight: 700;
  letter-spacing: .11em;
  text-transform: uppercase;
}

.token-input {
  width: 100%;
  height: 54px;

  padding: 0 15px;

  background: var(--surface-2);

  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);

  outline: none;

  color: var(--text);

  font-size: 14px;

  transition:
    border-color .15s ease,
    background .15s ease;
}

.token-input::placeholder {
  color: var(--muted-2);
}

.token-input:focus {
  border-color: #4a4d57;
  background: var(--surface-3);
}

.generate-row {
  display: flex;
  align-items: center;
  gap: 10px;

  margin-top: 12px;
}

.generate-button {
  height: 48px;

  padding: 0 20px;

  border: 0;
  border-radius: 14px;

  background: var(--accent);
  color: var(--accent-text);

  font-size: 14px;
  font-weight: 700;

  cursor: pointer;

  transition:
    transform .12s ease,
    opacity .12s ease;
}

.generate-button:active {
  transform: scale(.97);
}

.generate-button:hover {
  opacity: .9;
}

.status {
  min-height: 18px;

  color: var(--muted-2);

  font-size: 12px;
}

.status.success {
  color: var(--success);
}

.status.error {
  color: var(--error);
}

/* ---------------- FILTER ---------------- */

.filter-card {
  padding: 14px;
}

.filter-heading {
  padding: 5px 7px 12px;

  color: var(--muted-2);

  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.filter-option {
  padding: 17px;

  background: var(--surface-2);

  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

.filter-option-title {
  margin: 0;

  font-size: 17px;
  font-weight: 650;
  letter-spacing: -.015em;
}

.filter-option-description {
  margin: 5px 0 15px;

  color: var(--muted-2);

  font-size: 11px;
  line-height: 1.4;
}

.size-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.size-field {
  position: relative;
}

.size-input {
  width: 100%;
  height: 52px;

  padding: 0 42px 0 14px;

  background: var(--surface-3);

  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);

  outline: none;

  color: var(--text);

  font-size: 14px;

  appearance: textfield;
}

.size-input::-webkit-inner-spin-button,
.size-input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}

.size-input::placeholder {
  color: var(--muted-2);
}

.size-input:focus {
  border-color: #4a4d57;
}

.size-unit {
  position: absolute;

  right: 14px;
  top: 50%;

  transform: translateY(-50%);

  color: var(--muted-2);

  font-size: 12px;
  pointer-events: none;
}

/* ---------------- QUALITY ---------------- */

.quality-card {
  padding: 8px;
}

.quality-row {
  display: flex;
  align-items: center;
  justify-content: space-between;

  min-height: 72px;

  padding: 13px 14px;

  border-radius: 15px;

  cursor: pointer;

  transition: background .15s ease;
}

.quality-row:hover {
  background: var(--surface-2);
}

.quality-info {
  min-width: 0;
}

.quality-name {
  display: block;

  font-size: 16px;
  font-weight: 650;

  letter-spacing: -.01em;
}

.quality-description {
  display: block;

  margin-top: 3px;

  color: var(--muted-2);

  font-size: 11px;
}

/* ---------------- SWITCH ---------------- */

.switch {
  position: relative;

  flex: 0 0 auto;

  width: 48px;
  height: 29px;

  margin-left: 16px;
}

.switch input {
  position: absolute;

  opacity: 0;

  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;

  background: #343740;

  border-radius: 999px;

  cursor: pointer;

  transition: background .2s ease;
}

.slider::before {
  content: "";

  position: absolute;

  width: 23px;
  height: 23px;

  left: 3px;
  top: 3px;

  background: #8f929a;

  border-radius: 50%;

  transition:
    transform .2s ease,
    background .2s ease;
}

.switch input:checked + .slider {
  background: #f1f1f2;
}

.switch input:checked + .slider::before {
  transform: translateX(19px);
  background: #111216;
}

/* ---------------- RESULT ---------------- */

.configuration {
  display: none;
}

.configuration.visible {
  display: block;
}

.manifest-card {
  padding: 14px;
}

.manifest-box {
  padding: 15px;

  background: var(--surface-2);

  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

.manifest-label {
  display: block;

  margin-bottom: 8px;

  color: var(--muted-2);

  font-size: 11px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.manifest-row {
  display: flex;
  gap: 9px;
}

.manifest-input {
  min-width: 0;
  flex: 1;

  height: 48px;

  padding: 0 13px;

  background: var(--surface-3);

  border: 1px solid var(--border-light);
  border-radius: 12px;

  outline: none;

  color: var(--muted);

  font-size: 12px;
}

.copy-button {
  flex: 0 0 auto;

  height: 48px;

  padding: 0 16px;

  background: #30333b;

  border: 1px solid #3b3e47;
  border-radius: 12px;

  color: var(--text);

  font-size: 13px;
  font-weight: 650;

  cursor: pointer;
}

.install-button {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 100%;
  height: 52px;

  margin-top: 10px;

  border-radius: 13px;

  background: var(--accent);
  color: var(--accent-text);

  text-decoration: none;

  font-size: 14px;
  font-weight: 700;
}

/* ---------------- FOOTER ---------------- */

.footer {
  margin-top: 48px;

  color: var(--muted-2);

  font-size: 11px;
  line-height: 1.6;

  text-align: center;
}

/* ---------------- MOBILE ---------------- */

@media (max-width: 520px) {
  .page {
    width: min(100% - 24px, 680px);
    padding-top: 38px;
  }

  .hero {
    margin-bottom: 34px;
  }

  .title {
    font-size: 36px;
  }

  .section {
    margin-top: 32px;
  }

  .section-title {
    font-size: 23px;
  }

  .card {
    border-radius: 19px;
  }

  .generate-row {
    align-items: stretch;
    flex-direction: column;
  }

  .generate-button {
    width: 100%;
  }

  .status {
    min-height: 16px;
  }

  .manifest-row {
    flex-direction: column;
  }

  .copy-button {
    width: 100%;
  }
}
</style>
</head>

<body>

<main class="page">

  <!-- HERO -->

  <header class="hero">
    <div class="eyebrow">STREMIO ADDON</div>

    <h1 class="title">
      ShowBox
    </h1>

    <p class="subtitle">
      Generate a personal ShowBox addon using your FebBox UI token.
    </p>
  </header>


  <!-- TOKEN -->

  <section class="section">

    <div class="section-header">
      <h2 class="section-title">
        Configuration
      </h2>

      <p class="section-description">
        Enter your token to generate your private addon manifest.
      </p>
    </div>

    <div class="card token-card">

      <label
        class="token-label"
        for="tokenInput"
      >
        FEBBOX UI TOKEN
      </label>

      <input
        id="tokenInput"
        class="token-input"
        type="password"
        autocomplete="off"
        spellcheck="false"
        placeholder="Paste your UI token"
      >

      <div class="generate-row">

        <button
          id="generateButton"
          class="generate-button"
          type="button"
        >
          Generate addon
        </button>

        <div
          id="checkStatus"
          class="status"
        ></div>

      </div>

    </div>

  </section>


  <!-- CONFIGURATION -->

  <div
    id="configuration"
    class="configuration"
  >

    <!-- FILTERING -->

    <section class="section">

      <div class="section-header">
        <h2 class="section-title">
          Filtering
        </h2>

        <p class="section-description">
          Choose which streams should appear in your addon.
        </p>
      </div>

      <div class="card filter-card">

        <div class="filter-heading">
          FILE SIZE
        </div>

        <div class="filter-option">

          <h3 class="filter-option-title">
            Keep streams between
          </h3>

          <p class="filter-option-description">
            Leave either field empty for no limit.
          </p>

          <div class="size-fields">

            <div class="size-field">

              <input
                id="minSizeInput"
                class="size-input"
                type="number"
                min="0"
                step="0.1"
                placeholder="No minimum"
                inputmode="decimal"
              >

              <span class="size-unit">
                GB
              </span>

            </div>

            <div class="size-field">

              <input
                id="maxSizeInput"
                class="size-input"
                type="number"
                min="0"
                step="0.1"
                placeholder="No maximum"
                inputmode="decimal"
              >

              <span class="size-unit">
                GB
              </span>

            </div>

          </div>

        </div>

      </div>

    </section>


    <!-- QUALITY -->

    <section class="section quality-section">

      <div class="section-header">
        <h2 class="section-title">
          Quality
        </h2>

        <p class="section-description">
          Select the video qualities you want available.
        </p>
      </div>

      <div class="card quality-card">
        ${qualityRows()}
      </div>

    </section>


    <!-- MANIFEST -->

    <section class="section">

      <div class="section-header">
        <h2 class="section-title">
          Install
        </h2>

        <p class="section-description">
          Add the generated manifest to Stremio.
        </p>
      </div>

      <div class="card manifest-card">

        <div class="manifest-box">

          <label
            class="manifest-label"
            for="manifestUrl"
          >
            MANIFEST URL
          </label>

          <div class="manifest-row">

            <input
              id="manifestUrl"
              class="manifest-input"
              type="text"
              readonly
              placeholder="Generate your addon first"
            >

            <button
              id="copyButton"
              class="copy-button"
              type="button"
            >
              Copy
            </button>

          </div>

        </div>

        <a
          id="installButton"
          class="install-button"
          href="#"
        >
          Install in Stremio
        </a>

      </div>

    </section>

  </div>


  <footer class="footer">
    Your token is stored only inside the generated addon configuration.
  </footer>

</main>

${homepageScript}

</body>
</html>
`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: homepage,
    };
  }

  /*
   * Generic manifest route.
   * This is kept for Stremio's manifest request.
   */

  const match = path.match(/^\\/([^/]+)\\/manifest\\.json$/);

  if (match) {
    const encodedConfig = match[1];

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        id: "showbox.stremio.addon",
        version: "1.0.0",
        name: "ShowBox",
        description: "ShowBox Stremio addon",
        resources: ["stream"],
        types: ["movie", "series"],
        catalogs: [],
        idPrefixes: ["tt"],
        behaviorHints: {
          configurable: true,
        },
        config: [
          {
            key: "uiToken",
            type: "password",
            title: "ShowBox UI Token",
            required: true,
          },
        ],
      }),
    };
  }

  return {
    statusCode: 404,
    headers: {
      "Content-Type": "text/plain",
    },
    body: "Not found",
  };
}
export const config = {
  path: [
    "/",
    "/homepage.js",
    "/manifest.json",
    "/:config/manifest.json",
  ],
};
