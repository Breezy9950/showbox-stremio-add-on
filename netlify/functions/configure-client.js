"use strict";

const config = window.__SHOWBOX_CONFIG__;

if (!config) {
  console.error("[Configure] Missing client configuration.");
} else {
  const {
    qualities,
    fileSize,
    filters,
    sessionId,
    expiresAt
  } = config;

  const qualityList = document.getElementById("qualityList");
  const minSizeInput = document.getElementById("minSize");
  const maxSizeInput = document.getElementById("maxSize");
  const fileSizeError = document.getElementById("fileSizeError");
  const camFilter = document.getElementById("camFilter");
  const saveButton = document.getElementById("save");
  const status = document.getElementById("status");
  const result = document.getElementById("result");
  const manifestUrl = document.getElementById("manifestUrl");
  const copyButton = document.getElementById("copy");
  const installButton = document.getElementById("install");

  let expired = false;

  function expire() {
    if (expired) return;

    expired = true;
    saveButton.disabled = true;

    window.location.replace(
      "/__showbox_configure_expired__"
    );
  }

  setTimeout(
    expire,
    Math.max(0, expiresAt - Date.now())
  );

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = type;
  }

  function invalidateResult() {
    result.style.display = "none";
    manifestUrl.textContent = "";
    setStatus("");
  }

  function renderQualities() {
    qualityList.innerHTML = "";

    qualities.forEach((quality, index) => {
      const row = document.createElement("div");
      row.className = "quality-row";

      const checkbox =
        document.createElement("input");

      checkbox.type = "checkbox";
      checkbox.className = "quality-check";
      checkbox.checked = quality.enabled;

      checkbox.addEventListener(
        "change",
        () => {
          quality.enabled = checkbox.checked;
          invalidateResult();
        }
      );

      const name =
        document.createElement("div");

      name.className = "quality-name";
      name.textContent = quality.name;

      const controls =
        document.createElement("div");

      controls.className = "quality-controls";

      const up =
        document.createElement("button");

      up.type = "button";
      up.textContent = "↑";
      up.disabled = index === 0;

      up.addEventListener("click", () => {
        if (index <= 0) return;

        [
          qualities[index - 1],
          qualities[index]
        ] = [
          qualities[index],
          qualities[index - 1]
        ];

        invalidateResult();
        renderQualities();
      });

      const down =
        document.createElement("button");

      down.type = "button";
      down.textContent = "↓";
      down.disabled =
        index === qualities.length - 1;

      down.addEventListener("click", () => {
        if (index >= qualities.length - 1) {
          return;
        }

        [
          qualities[index + 1],
          qualities[index]
        ] = [
          qualities[index],
          qualities[index + 1]
        ];

        invalidateResult();
        renderQualities();
      });

      controls.append(up, down);
      row.append(checkbox, name, controls);
      qualityList.appendChild(row);
    });
  }

  function getFileSize() {
    const min = minSizeInput.value.trim();
    const max = maxSizeInput.value.trim();

    return {
      minGb: min === "" ? null : Number(min),
      maxGb: max === "" ? null : Number(max)
    };
  }

  function validateFileSize() {
    const value = getFileSize();
    let error = "";

    if (
      value.minGb !== null &&
      (
        !Number.isFinite(value.minGb) ||
        value.minGb < 0 ||
        value.minGb > 200
      )
    ) {
      error =
        "Minimum size must be between 0 and 200 GB.";
    } else if (
      value.maxGb !== null &&
      (
        !Number.isFinite(value.maxGb) ||
        value.maxGb < 0 ||
        value.maxGb > 200
      )
    ) {
      error =
        "Maximum size must be between 0 and 200 GB.";
    } else if (
      value.minGb !== null &&
      value.maxGb !== null &&
      value.minGb > value.maxGb
    ) {
      error =
        "Minimum size cannot be greater than maximum size.";
    }

    fileSizeError.textContent = error;

    return !error;
  }

  async function saveConfiguration() {
    if (expired) return;

    if (Date.now() >= expiresAt) {
      expire();
      return;
    }

    if (!validateFileSize()) {
      return;
    }

    if (!qualities.some(
      quality => quality.enabled
    )) {
      setStatus(
        "Enable at least one quality.",
        "error"
      );

      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    setStatus("");

    try {
      const response = await fetch(
        window.location.pathname,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            action: "save",
            sessionId,
            qualities: qualities.map(
              quality => ({
                name: quality.name,
                enabled: quality.enabled
              })
            ),
            fileSize: getFileSize(),
            filters: {
              cam: camFilter.checked
            }
          }),
          cache: "no-store"
        }
      );

      if (
        response.status === 404 ||
        response.status === 410
      ) {
        expire();
        return;
      }

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          text ||
          "The server returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Failed to save configuration."
        );
      }

      if (!data.manifestUrl) {
        throw new Error(
          "The server did not return a manifest URL."
        );
      }

      manifestUrl.textContent =
        data.manifestUrl;

      result.style.display = "block";

      setStatus(
        "Configuration saved.",
        "success"
      );

      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth"
      });

    } catch (error) {
      if (!expired) {
        setStatus(
          error?.message ||
          "Failed to save configuration.",
          "error"
        );
      }
    } finally {
      if (!expired) {
        saveButton.disabled = false;
        saveButton.textContent =
          "Save Configuration";
      }
    }
  }

  saveButton.addEventListener(
    "click",
    saveConfiguration
  );

  minSizeInput.addEventListener(
    "input",
    () => {
      validateFileSize();
      invalidateResult();
    }
  );

  maxSizeInput.addEventListener(
    "input",
    () => {
      validateFileSize();
      invalidateResult();
    }
  );

  camFilter.addEventListener(
    "change",
    invalidateResult
  );

  copyButton.addEventListener(
    "click",
    async () => {
      const value =
        manifestUrl.textContent;

      if (!value) return;

      try {
        await navigator.clipboard.writeText(
          value
        );

        copyButton.textContent = "Copied";

        setTimeout(() => {
          if (!expired) {
            copyButton.textContent = "Copy";
          }
        }, 1500);

      } catch {
        setStatus(
          "Copy failed. Select the manifest URL manually.",
          "error"
        );
      }
    }
  );

  installButton.addEventListener(
    "click",
    () => {
      const value =
        manifestUrl.textContent;

      if (!value || expired) return;

      window.location.href =
        "stremio://" +
        value.replace(
          /^https?:\/\//,
          ""
        );
    }
  );

  if (fileSize.minGb !== null) {
    minSizeInput.value = fileSize.minGb;
  }

  if (fileSize.maxGb !== null) {
    maxSizeInput.value = fileSize.maxGb;
  }

  camFilter.checked =
    filters.cam !== false;

  renderQualities();
  validateFileSize();

  console.log("[Configure] Client loaded");
}
