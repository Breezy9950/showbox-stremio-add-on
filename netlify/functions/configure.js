export default async () => {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#111111">

<title>ShowBox Configuration</title>

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
  border-color: #777;
}

/* -------------------------------------------------- */
/* CONNECTION */
/* -------------------------------------------------- */

#testButton {
  width: 100%;
  min-height: 48px;

  margin-top: 16px;
  padding: 13px 18px;

  border: 1px solid #444;
  border-radius: 10px;

  background: #fff;
  color: #111;

  font-size: 16px;
  font-weight: 600;

  cursor: pointer;
}

#testButton:disabled {
  opacity: 0.55;
  cursor: default;
}

#status {
  min-height: 22px;
  margin-top: 12px;

  color: #aaa;
  font-size: 14px;
}

.success {
  color: #fff !important;
}

.error {
  color: #aaa !important;
}

/* -------------------------------------------------- */
/* QUALITY SETTINGS */
/* -------------------------------------------------- */

#configuration {
  display: none;
  margin-top: 30px;
}

#configuration.visible {
  display: block;
}

.section-title {
  margin-bottom: 6px;

  color: #fff;
  font-size: 18px;
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

  accent-color: #fff;
}

.quality-name {
  flex: 1;

  color: #fff;
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

/* -------------------------------------------------- */
/* RESULT */
/* -------------------------------------------------- */

#result {
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

#copy {
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

#install {
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

  transition: opacity 0.15s;
}

#install.disabled {
  background: #333;
  color: #777;

  pointer-events: none;
  cursor: default;
}

.instruction {
  margin-top: 14px;

  color: #777;

  font-size: 13px;
  line-height: 1.5;
}

</style>
</head>

<body>

<main>

<h1>ShowBox Stremio Addon</h1>

<p class="subtitle">
Enter your ShowBox UI token to test the connection and configure the addon.
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

<button id="testButton" type="button">
Test Connection
</button>

<div id="status"></div>

<div id="configuration">

  <div class="section-title">
    Quality settings
  </div>

  <p class="section-description">
    Enable the qualities you want. Move them up or down to set their priority.
  </p>

  <div id="qualityList" class="quality-list"></div>

  <div id="result">

    <div class="result-title">
      Manifest URL
    </div>

    <div class="url-row">

      <input
        id="manifestUrl"
        type="text"
        readonly
      />

      <button id="copy" type="button">
        Copy
      </button>

    </div>

    <a
      id="install"
      class="disabled"
      href="#"
    >
      Install in Stremio
    </a>

    <div class="instruction">
      On iOS, if the Install button does not open Stremio,
      use Copy and paste the manifest URL into Stremio's Add Addon field.
    </div>

  </div>

</div>

</main>

<script>

const DEFAULT_QUALITIES = [
  { name: "ORG", enabled: true },
  { name: "4K", enabled: true },
  { name: "1440p", enabled: true },
  { name: "1080p", enabled: true },
  { name: "720p", enabled: true },
  { name: "480p", enabled: true },
  { name: "360p", enabled: true }
];

let qualities = DEFAULT_QUALITIES.map(item => ({
  ...item
}));

let currentToken = "";
let connectionValid = false;

const tokenInput =
  document.getElementById("token");

const testButton =
  document.getElementById("testButton");

const status =
  document.getElementById("status");

const configuration =
  document.getElementById("configuration");

const qualityList =
  document.getElementById("qualityList");

const manifestUrl =
  document.getElementById("manifestUrl");

const copyButton =
  document.getElementById("copy");

const installButton =
  document.getElementById("install");


/* -------------------------------------------------- */
/* BASE64URL */
/* -------------------------------------------------- */

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
    .replace(/=+$/, "");
}


/* -------------------------------------------------- */
/* BUILD MANIFEST */
/* -------------------------------------------------- */

function updateManifest() {

  if (!connectionValid || !currentToken) {
    return;
  }

  const enabled =
    qualities.filter(item => item.enabled);

  if (!enabled.length) {

    manifestUrl.value = "";

    installButton.classList.add("disabled");
    installButton.href = "#";

    return;
  }

  const config = {

    uiToken: currentToken,

    qualities: qualities.map(item => ({
      name: item.name,
      enabled: item.enabled
    }))

  };

  const encoded =
    base64UrlEncode(
      JSON.stringify(config)
    );

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

  manifestUrl.value = httpsUrl;

  installButton.href = stremioUrl;

  installButton.classList.remove("disabled");
}


/* -------------------------------------------------- */
/* QUALITY UI */
/* -------------------------------------------------- */

function renderQualities() {

  qualityList.innerHTML = "";

  qualities.forEach((quality, index) => {

    const row =
      document.createElement("div");

    row.className =
      "quality-row";


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

        updateManifest();

      }
    );


    const name =
      document.createElement("div");

    name.className =
      "quality-name";

    name.textContent =
      quality.name;


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

        if (index === 0) {
          return;
        }

        const temp =
          qualities[index];

        qualities[index] =
          qualities[index - 1];

        qualities[index - 1] =
          temp;

        renderQualities();
        updateManifest();

      }
    );


    const down =
      document.createElement("button");

    down.type =
      "button";

    down.className =
      "move-button";

    down.textContent =
      "↓";

    down.disabled =
      index === qualities.length - 1;


    down.addEventListener(
      "click",
      () => {

        if (
          index ===
          qualities.length - 1
        ) {
          return;
        }

        const temp =
          qualities[index];

        qualities[index] =
          qualities[index + 1];

        qualities[index + 1] =
          temp;

        renderQualities();
        updateManifest();

      }
    );


    row.appendChild(checkbox);
    row.appendChild(name);
    row.appendChild(up);
    row.appendChild(down);

    qualityList.appendChild(row);

  });

}


/* -------------------------------------------------- */
/* TOKEN INPUT */
/* -------------------------------------------------- */

tokenInput.addEventListener(
  "input",
  () => {

    connectionValid = false;
    currentToken = "";

    configuration.style.display =
      "none";

    manifestUrl.value = "";

    installButton.classList.add(
      "disabled"
    );

    installButton.href = "#";

    status.textContent = "";

  }
);


/* -------------------------------------------------- */
/* TEST CONNECTION */
/* -------------------------------------------------- */

testButton.addEventListener(
  "click",
  async () => {

    const token =
      tokenInput.value.trim();

    if (!token) {

      status.textContent =
        "Enter your ShowBox UI token first.";

      status.className =
        "error";

      return;
    }

    testButton.disabled =
      true;

    connectionValid =
      false;

    currentToken =
      "";

    configuration.style.display =
      "none";

    installButton.classList.add(
      "disabled"
    );

    status.textContent =
      "Checking connection...";

    status.className = "";


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

            body: JSON.stringify({
              token
            })
          }
        );


      const data =
        await response.json();


      if (data.status === "usable") {

        connectionValid =
          true;

        currentToken =
          token;

        status.textContent =
          "Cookie is working.";

        status.className =
          "success";


        configuration.style.display =
          "block";


        /*
         * The successful test automatically
         * generates the manifest.
         */
        updateManifest();


        /*
         * Remove the cookie from the
         * visible input after success.
         */
        tokenInput.value = "";

      }

      else if (
        data.status ===
        "rate_limited"
      ) {

        status.textContent =
          "Cookie is currently rate limited.";

        status.className =
          "error";

      }

      else if (
        data.status ===
        "invalid"
      ) {

        status.textContent =
          "Cookie is not usable.";

        status.className =
          "error";

      }

      else {

        status.textContent =
          data.message ||
          "Could not verify the cookie.";

        status.className =
          "error";

      }

    }

    catch (error) {

      status.textContent =
        "Could not contact the token checker.";

      status.className =
        "error";

    }

    finally {

      testButton.disabled =
        false;

    }

  }
);


/* -------------------------------------------------- */
/* COPY */
/* -------------------------------------------------- */

copyButton.addEventListener(
  "click",
  async () => {

    if (!manifestUrl.value) {
      return;
    }

    try {

      await navigator.clipboard.writeText(
        manifestUrl.value
      );

      copyButton.textContent =
        "Copied";

    }

    catch {

      manifestUrl.focus();
      manifestUrl.select();

      document.execCommand(
        "copy"
      );

      copyButton.textContent =
        "Copied";

    }

    setTimeout(
      () => {
        copyButton.textContent =
          "Copy";
      },
      1500
    );

  }
);


/* -------------------------------------------------- */
/* INITIAL */
/* -------------------------------------------------- */

renderQualities();

</script>

</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type":
        "text/html; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*"
    }
  });
};

export const config = {
  path: "/configure"
};
