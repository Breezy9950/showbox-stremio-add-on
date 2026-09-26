const DEFAULT_QUALITIES = [
  { name: "ORG", enabled: true },
  { name: "4K", enabled: true },
  { name: "1440p", enabled: true },
  { name: "1080p", enabled: true },
  { name: "720p", enabled: true },
  { name: "480p", enabled: true },
  { name: "360p", enabled: true }
];

function decodeConfig(value) {
  try {
    if (!value) return {};

    let base64 = value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    while (base64.length % 4) {
      base64 += "=";
    }

    const json =
      Buffer.from(base64, "base64").toString("utf8");

    return JSON.parse(json);
  } catch {
    return {};
  }
}

function encodeConfig(config) {
  const json = JSON.stringify(config);

  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeQualities(qualities) {
  if (!Array.isArray(qualities)) {
    return DEFAULT_QUALITIES.map(item => ({
      ...item
    }));
  }

  const map = new Map(
    DEFAULT_QUALITIES.map(item => [
      item.name,
      item
    ])
  );

  const result =
    DEFAULT_QUALITIES.map(item => ({
      name: item.name,
      enabled: item.enabled
    }));

  for (const item of qualities) {
    if (!item || !map.has(item.name)) {
      continue;
    }

    const target =
      result.find(
        x => x.name === item.name
      );

    if (target) {
      target.enabled =
        item.enabled !== false;
    }
  }

  return result;
}

function normalizeFileSize(fileSize) {
  if (
    !fileSize ||
    typeof fileSize !== "object"
  ) {
    return {
      minGb: null,
      maxGb: null
    };
  }

  const min =
    fileSize.minGb === null ||
    fileSize.minGb === undefined ||
    fileSize.minGb === ""
      ? null
      : Number(fileSize.minGb);

  const max =
    fileSize.maxGb === null ||
    fileSize.maxGb === undefined ||
    fileSize.maxGb === ""
      ? null
      : Number(fileSize.maxGb);

  return {
    minGb:
      Number.isFinite(min)
        ? min
        : null,

    maxGb:
      Number.isFinite(max)
        ? max
        : null
  };
}

function getConfigFromRequest(request) {
  const url =
    new URL(request.url);

  const pathname =
    url.pathname.replace(/\/+$/, "");

  let configValue = null;

  /*
   * Supported formats:
   *
   * /configure/<config>
   *
   * /<config>/configure
   *
   * The second format is used by Nuvio.
   */

  let match =
    pathname.match(
      /^\/configure\/([^/]+)$/
    );

  if (match) {
    configValue = match[1];
  }

  if (!configValue) {
    match =
      pathname.match(
        /^\/([^/]+)\/configure$/
      );

    if (match) {
      configValue = match[1];
    }
  }

  if (!configValue) {
    return null;
  }

  const config =
    decodeConfig(configValue);

  /*
   * Make sure we actually decoded
   * an object rather than returning {}.
   */
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    return null;
  }

  return config;
}

export const config = {
  path: [
    "/configure/:config",
    "/:config/configure"
  ]
};

export default async function handler(request) {

  const existingConfig =
    getConfigFromRequest(request);

  if (!existingConfig) {

    return new Response(
      `
<!DOCTYPE html>
<html>
<head>

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>ShowBox Configure</title>

<style>

body {
  margin: 0;
  padding: 40px 20px;
  background: #111;
  color: #fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  text-align: center;
}

.card {
  max-width: 560px;
  margin: auto;
  background: #17181d;
  padding: 28px;
  border-radius: 18px;
}

p {
  color: #aaa;
  line-height: 1.5;
}

</style>

</head>

<body>

<div class="card">

<h2>Invalid configuration</h2>

<p>
This Configure page must be opened using
an existing addon configuration.
</p>

</div>

</body>
</html>
`,
      {
        status: 400,

        headers: {
          "Content-Type":
            "text/html; charset=utf-8"
        }
      }
    );
  }

  /*
   * The token is deliberately never exposed
   * to browser-side JavaScript.
   *
   * It remains available only inside
   * this server-side function.
   */
  const uiToken =
    typeof existingConfig.uiToken === "string"
      ? existingConfig.uiToken
      : "";

  const qualities =
    normalizeQualities(
      existingConfig.qualities
    );

  const fileSize =
    normalizeFileSize(
      existingConfig.fileSize
    );


  /*
   * POST
   *
   * Save the new configuration while
   * preserving the existing token.
   */
  if (request.method === "POST") {

    try {

      const body =
        await request.json();

      const newQualities =
        normalizeQualities(
          body.qualities
        );


      const minGb =
        body.fileSize?.minGb === null ||
        body.fileSize?.minGb === undefined ||
        body.fileSize?.minGb === ""
          ? null
          : Number(
              body.fileSize.minGb
            );


      const maxGb =
        body.fileSize?.maxGb === null ||
        body.fileSize?.maxGb === undefined ||
        body.fileSize?.maxGb === ""
          ? null
          : Number(
              body.fileSize.maxGb
            );


      const newFileSize = {
        minGb:
          Number.isFinite(minGb)
            ? minGb
            : null,

        maxGb:
          Number.isFinite(maxGb)
            ? maxGb
            : null
      };


      /*
       * Preserve the existing configuration.
       *
       * Most importantly, preserve uiToken.
       */
      const newConfig = {
        ...existingConfig,

        uiToken,

        fileSize:
          newFileSize,

        qualities:
          newQualities.map(
            item => ({
              name: item.name,
              enabled: item.enabled
            })
          )
      };


      const encoded =
        encodeConfig(newConfig);


      const requestUrl =
        new URL(request.url);


      const manifestUrl =
        `${requestUrl.origin}/${encoded}/manifest.json`;


      return new Response(
        JSON.stringify({
          manifestUrl
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

    } catch (error) {

      console.error(
        "[Configure] Save error:",
        error
      );


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
  }


  /*
   * Only expose safe configuration
   * values to browser JavaScript.
   *
   * uiToken is intentionally NOT included.
   */
  const publicConfig = {
    qualities,
    fileSize
  };


  const qualitiesJson =
    JSON.stringify(
      publicConfig.qualities
    )
      .replace(
        /</g,
        "\\u003c"
      )
      .replace(
        />/g,
        "\\u003e"
      )
      .replace(
        /&/g,
        "\\u0026"
      );


  const fileSizeJson =
    JSON.stringify(
      publicConfig.fileSize
    )
      .replace(
        /</g,
        "\\u003c"
      )
      .replace(
        />/g,
        "\\u003e"
      )
      .replace(
        /&/g,
        "\\u0026"
      );


  const html = `
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,
           initial-scale=1,
           viewport-fit=cover"
>

<title>ShowBox Stremio Addon</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 24px 16px 40px;
  background: #111;
  color: #fff;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.container {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

h1 {
  margin: 8px 0 8px;

  font-size: 27px;
  font-weight: 700;

  letter-spacing: -0.5px;
}

.subtitle {
  margin: 0 0 26px;

  color: #9b9ca3;

  font-size: 15px;
  line-height: 1.5;
}

.card {
  background: #17181d;

  border: 1px solid #24252c;

  border-radius: 18px;

  padding: 20px;

  margin-bottom: 16px;
}

.card-title {
  font-size: 17px;

  font-weight: 650;

  margin-bottom: 6px;
}

.card-description {
  color: #92939b;

  font-size: 13px;

  line-height: 1.45;

  margin-bottom: 18px;
}

.size-row {
  display: flex;

  gap: 12px;
}

.size-field {
  flex: 1;
}

label {
  display: block;

  color: #a5a6ae;

  font-size: 13px;

  margin-bottom: 7px;
}

input[type="number"] {
  width: 100%;

  height: 45px;

  border: 1px solid #303139;

  border-radius: 11px;

  background: #20222a;

  color: #fff;

  padding: 0 13px;

  font-size: 15px;

  outline: none;
}

input[type="number"]:focus {
  border-color: #62646e;
}

.quality-list {
  display: flex;

  flex-direction: column;

  gap: 8px;
}

.quality-row {
  display: flex;

  align-items: center;

  gap: 12px;

  min-height: 48px;

  padding: 8px 10px;

  background: #20222a;

  border-radius: 11px;
}

.quality-name {
  flex: 1;

  font-size: 15px;
}

.quality-controls {
  display: flex;

  gap: 6px;
}

.quality-controls button {
  width: 34px;

  height: 34px;

  border: 0;

  border-radius: 9px;

  background: #2b2d36;

  color: #ddd;

  font-size: 17px;
}

.quality-controls button:active {
  background: #383a45;
}

.quality-controls button:disabled {
  opacity: 0.3;
}

input[type="checkbox"] {
  width: 19px;

  height: 19px;

  accent-color: #fff;
}

button.main {
  width: 100%;

  height: 47px;

  border: 0;

  border-radius: 12px;

  background: #fff;

  color: #111;

  font-size: 15px;

  font-weight: 650;

  margin-top: 18px;
}

button.main:active {
  opacity: 0.8;
}

button.main:disabled {
  opacity: 0.5;
}

.result {
  display: none;

  margin-top: 16px;
}

.result.visible {
  display: block;
}

.manifest-url {
  width: 100%;

  padding: 12px;

  border-radius: 11px;

  background: #20222a;

  color: #aaa;

  font-size: 12px;

  line-height: 1.45;

  word-break: break-all;

  user-select: all;
}

.result-buttons {
  display: flex;

  gap: 10px;

  margin-top: 12px;
}

.result-buttons button {
  flex: 1;

  height: 44px;

  border: 0;

  border-radius: 11px;

  font-size: 14px;

  font-weight: 600;
}

.copy {
  background: #292b33;

  color: #fff;
}

.install {
  background: #fff;

  color: #111;
}

.note {
  margin-top: 20px;

  padding: 14px;

  border-radius: 12px;

  background: #17181d;

  color: #8f9098;

  font-size: 13px;

  line-height: 1.5;
}

.status {
  display: none;

  margin-top: 12px;

  padding: 11px 12px;

  border-radius: 10px;

  background: #20222a;

  color: #aaa;

  font-size: 13px;
}

.status.visible {
  display: block;
}

</style>

</head>

<body>

<div class="container">

<h1>
ShowBox Stremio Addon
</h1>

<p class="subtitle">
Configure your stream preferences.
</p>


<div class="card">

<div class="card-title">
File size
</div>

<div class="card-description">
Only show files within the selected size range.
Leave a field empty for no limit.
</div>


<div class="size-row">


<div class="size-field">

<label for="minSize">
Minimum (GB)
</label>

<input
  id="minSize"
  type="number"
  min="0"
  step="0.1"
  placeholder="No minimum"
>

</div>


<div class="size-field">

<label for="maxSize">
Maximum (GB)
</label>

<input
  id="maxSize"
  type="number"
  min="0"
  step="0.1"
  placeholder="No maximum"
>

</div>


</div>

</div>


<div class="card">

<div class="card-title">
Quality
</div>

<div class="card-description">
Enable the qualities you want and use
the arrows to change their priority.
</div>

<div
  id="qualityList"
  class="quality-list"
></div>

</div>


<button
  id="save"
  class="main"
>
Save configuration
</button>


<div
  id="status"
  class="status"
></div>


<div
  id="result"
  class="result"
>

<div class="card">

<div class="card-title">
Manifest URL
</div>

<div
  id="manifestUrl"
  class="manifest-url"
></div>


<div class="result-buttons">

<button
  id="copy"
  class="copy"
>
Copy
</button>

<button
  id="install"
  class="install"
>
Install in Stremio
</button>

</div>

</div>

</div>


<div class="note">

On iOS/iPadOS, if Stremio does not open automatically,
copy the manifest URL and add it manually through
Stremio's Add-ons page.

</div>


</div>


<script>

const qualities =
  ${qualitiesJson};

const fileSize =
  ${fileSizeJson};


const qualityList =
  document.getElementById(
    "qualityList"
  );

const minSizeInput =
  document.getElementById(
    "minSize"
  );

const maxSizeInput =
  document.getElementById(
    "maxSize"
  );

const saveButton =
  document.getElementById(
    "save"
  );

const status =
  document.getElementById(
    "status"
  );

const result =
  document.getElementById(
    "result"
  );

const manifestUrl =
  document.getElementById(
    "manifestUrl"
  );

const copyButton =
  document.getElementById(
    "copy"
  );

const installButton =
  document.getElementById(
    "install"
  );


function renderQualities() {

  qualityList.innerHTML = "";


  qualities.forEach(
    (quality, index) => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "quality-row";


      const checkbox =
        document.createElement(
          "input"
        );

      checkbox.type =
        "checkbox";

      checkbox.checked =
        quality.enabled;


      checkbox.addEventListener(
        "change",
        () => {

          quality.enabled =
            checkbox.checked;

        }
      );


      const name =
        document.createElement(
          "div"
        );

      name.className =
        "quality-name";

      name.textContent =
        quality.name;


      const controls =
        document.createElement(
          "div"
        );

      controls.className =
        "quality-controls";


      const up =
        document.createElement(
          "button"
        );

      up.type =
        "button";

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
            qualities[index - 1];

          qualities[index - 1] =
            qualities[index];

          qualities[index] =
            temp;


          renderQualities();

        }
      );


      const down =
        document.createElement(
          "button"
        );

      down.type =
        "button";

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


          const temp =
            qualities[index + 1];

          qualities[index + 1] =
            qualities[index];

          qualities[index] =
            temp;


          renderQualities();

        }
      );


      controls.appendChild(up);

      controls.appendChild(down);


      row.appendChild(
        checkbox
      );

      row.appendChild(
        name
      );

      row.appendChild(
        controls
      );


      qualityList.appendChild(
        row
      );

    }
  );
}


function showStatus(message) {

  status.textContent =
    message;

  status.classList.add(
    "visible"
  );

}


function hideStatus() {

  status.classList.remove(
    "visible"
  );

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


async function saveConfiguration() {

  hideStatus();


  const fileSize =
    getFileSizeConfig();


  if (
    fileSize.minGb !== null &&
    fileSize.maxGb !== null &&
    fileSize.minGb >
      fileSize.maxGb
  ) {

    showStatus(
      "Minimum size cannot be greater than maximum size."
    );

    return;
  }


  saveButton.disabled =
    true;

  saveButton.textContent =
    "Saving...";


  const config = {

    qualities:
      qualities.map(
        item => ({
          name:
            item.name,

          enabled:
            item.enabled
        })
      ),

    fileSize

  };


  try {

    const response =
      await fetch(
        window.location.pathname,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              config
            )
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.manifestUrl
    ) {

      throw new Error(
        data.error ||
        "Failed to save configuration"
      );

    }


    manifestUrl.textContent =
      data.manifestUrl;


    result.classList.add(
      "visible"
    );


    showStatus(
      "Configuration saved."
    );


    window.scrollTo({
      top:
        document.body.scrollHeight,

      behavior:
        "smooth"
    });


  } catch (error) {

    console.error(
      error
    );


    showStatus(
      error.message ||
      "Something went wrong."
    );


  } finally {

    saveButton.disabled =
      false;

    saveButton.textContent =
      "Save configuration";

  }

}


copyButton.addEventListener(
  "click",
  async () => {

    const url =
      manifestUrl.textContent;


    try {

      await navigator.clipboard.writeText(
        url
      );


      copyButton.textContent =
        "Copied!";


      setTimeout(
        () => {

          copyButton.textContent =
            "Copy";

        },
        1500
      );


    } catch {

      showStatus(
        "Copy failed. Select the URL manually."
      );

    }

  }
);


installButton.addEventListener(
  "click",
  () => {

    const url =
      manifestUrl.textContent;


    if (!url) {
      return;
    }


    const stremioUrl =
      "stremio://" +
      url.replace(
        /^https?:\\/\\//,
        ""
      );


    window.location.href =
      stremioUrl;

  }
);


if (
  fileSize.minGb !== null
) {

  minSizeInput.value =
    fileSize.minGb;

}


if (
  fileSize.maxGb !== null
) {

  maxSizeInput.value =
    fileSize.maxGb;

}


renderQualities();


saveButton.addEventListener(
  "click",
  saveConfiguration
);

</script>

</body>

</html>
`;


  return new Response(
    html,
    {
      status: 200,

      headers: {
        "Content-Type":
          "text/html; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}
