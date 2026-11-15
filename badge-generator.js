(() => {
  "use strict";

  function snippet(format, badgeUrl, reportUrl) {
    if (format === "html") {
      return `<a href="${reportUrl}"><img src="${badgeUrl}" alt="SlopCodeMonitor"></a>`;
    }
    if (format === "rst") {
      return `.. image:: ${badgeUrl}\n   :target: ${reportUrl}\n   :alt: SlopCodeMonitor`;
    }
    return `[![SlopCodeMonitor](${badgeUrl})](${reportUrl})`;
  }

  async function copy(text, status) {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      status.textContent = "Copied to clipboard.";
      return true;
    } catch (error) {
      console.error("Could not copy badge:", error);
      status.textContent = "Copy failed. Select and copy the embed code manually.";
      return false;
    }
  }

  document.querySelectorAll("[data-badge-detail]").forEach((detail) => {
    const status = detail.querySelector("[data-copy-status]");
    detail.querySelectorAll("[data-copy-format]").forEach((button) => {
      button.addEventListener("click", async () => {
        const text = snippet(button.dataset.copyFormat, detail.dataset.badgeUrl, detail.dataset.reportUrl);
        const code = detail.querySelector("[data-detail-code]");
        code.value = text;
        code.hidden = await copy(text, status);
      });
    });
  });

  const widget = document.querySelector("[data-badge-generator]");
  if (!widget) return;
  const input = widget.querySelector("#badge-search");
  const options = widget.querySelector("#badge-options");
  const status = widget.querySelector("[data-badge-status]");
  const notFound = widget.querySelector("[data-badge-not-found]");
  const result = widget.querySelector("[data-badge-result]");
  const format = widget.querySelector("#badge-format");
  const code = widget.querySelector("[data-badge-code]");
  const preview = widget.querySelector("[data-badge-preview]");
  const reportLink = widget.querySelector("[data-report-link]");
  const badgeLink = widget.querySelector("[data-badge-report]");
  const copyStatus = widget.querySelector("[data-copy-status]");
  const baseUrl = widget.dataset.siteUrl.replace(/\/+$/, "");
  let manifestPromise;
  let selection = null;
  let requestId = 0;

  function normalize(value) {
    let text = value.trim().toLowerCase();
    if (/^https?:\/\//.test(text)) {
      let url;
      try {
        url = new URL(text);
      } catch (error) {
        return "";
      }
      if (url.hostname !== "github.com" || !["http:", "https:"].includes(url.protocol)) return "";
      text = url.pathname;
    } else {
      text = text.split(/[?#]/, 1)[0];
    }
    const parts = text.split("/").filter(Boolean);
    if (parts.length < 2) return "";
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(owner) ||
        !/^[a-z0-9_.-]+$/.test(repo) || repo === "." || repo === "..") return "";
    return `${owner}/${repo}`;
  }

  function absolutePath(path) {
    const encode = (part) => encodeURIComponent(part).replace(/[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${baseUrl}/${path.split("/").map(encode).join("/")}`;
  }

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch("badges/manifest.json").then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).then((data) => {
        if (!data || !data.repos || typeof data.repos !== "object" || Array.isArray(data.repos) ||
            data.count !== Object.keys(data.repos).length) throw new Error("Invalid badge manifest");
        return data.repos;
      }).catch((error) => {
        manifestPromise = null;
        throw error;
      });
    }
    return manifestPromise;
  }

  function renderCode() {
    if (selection) code.value = snippet(format.value, selection.badgeUrl, selection.reportUrl);
    copyStatus.textContent = "";
  }

  async function update() {
    const currentRequest = ++requestId;
    const raw = input.value.trim();
    result.hidden = true;
    notFound.hidden = true;
    selection = null;
    status.textContent = "Loading repository index…";
    try {
      const repos = await loadManifest();
      if (currentRequest !== requestId) return;
      const key = normalize(raw);
      const query = key || raw.toLowerCase().replace(/^https?:\/\/github\.com\//, "");
      options.replaceChildren();
      if (query) {
        Object.keys(repos).filter((name) => name.includes(query)).slice(0, 20).forEach((name) => {
          const option = document.createElement("option");
          option.value = name;
          options.appendChild(option);
        });
      }
      status.textContent = "";
      if (!raw) return;
      if (!key || !Object.hasOwn(repos, key)) {
        notFound.hidden = false;
        return;
      }
      const entry = repos[key];
      if (entry.badge !== `badges/${key}.svg` || typeof entry.report !== "string" ||
          !/^reports\/detail_[^/]+\.html$/.test(entry.report)) {
        throw new Error("Invalid badge or report path in manifest");
      }
      selection = {badgeUrl: absolutePath(entry.badge), reportUrl: absolutePath(entry.report)};
      preview.src = selection.badgeUrl;
      preview.alt = `SlopCodeMonitor badge for ${entry.name}`;
      badgeLink.href = selection.reportUrl;
      reportLink.href = selection.reportUrl;
      result.hidden = false;
      renderCode();
    } catch (error) {
      if (currentRequest !== requestId) return;
      console.error("Could not load badge manifest:", error);
      status.textContent = "Could not load the badge index. Serve the site over HTTP(S) and try again.";
    }
  }

  input.addEventListener("focus", update);
  input.addEventListener("input", update);
  format.addEventListener("change", renderCode);
  widget.querySelector("[data-badge-copy]").addEventListener("click", () => copy(code.value, copyStatus));
})();
