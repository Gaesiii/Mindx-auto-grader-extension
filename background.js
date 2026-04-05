const UPDATE_CHECK_ALARM = "update-check-alarm";
const UPDATE_CHECK_INTERVAL_MINUTES = 60;

const GITHUB_REPO = {
  owner: "Gaesiii",
  name: "Mindx-auto-grader-extension",
  branch: "main",
  homepage: "https://github.com/Gaesiii/Mindx-auto-grader-extension"
};

const STORAGE_KEYS = {
  updateInfo: "updateInfo",
  installedCommitSha: "installedCommitSha",
  installedVersion: "installedVersion"
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function normalizeVersion(version) {
  if (!version || typeof version !== "string") return [];
  const clean = version.trim().replace(/^v/i, "");
  const match = clean.match(/^\d+(?:\.\d+){0,3}/);
  if (!match) return [];
  return match[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const aParts = normalizeVersion(a);
  const bParts = normalizeVersion(b);
  const maxLength = Math.max(aParts.length, bParts.length, 1);

  for (let i = 0; i < maxLength; i += 1) {
    const aValue = aParts[i] ?? 0;
    const bValue = bParts[i] ?? 0;
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }

  return 0;
}

function versionFromTag(tagName) {
  if (!tagName || typeof tagName !== "string") return null;
  const clean = tagName.trim().replace(/^v/i, "");
  const match = clean.match(/\d+(?:\.\d+){0,3}/);
  return match ? match[0] : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status})`);
  }

  return response.json();
}

async function fetchLatestCommit() {
  const url = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.name}/commits/${GITHUB_REPO.branch}`;
  const data = await fetchJson(url);

  return {
    sha: data?.sha || "",
    url: data?.html_url || GITHUB_REPO.homepage,
    date: data?.commit?.author?.date || null,
    message: data?.commit?.message || ""
  };
}

async function fetchLatestTag() {
  const url = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.name}/tags?per_page=1`;
  const data = await fetchJson(url);
  const latestTag = Array.isArray(data) ? data[0] : null;

  return {
    name: latestTag?.name || null,
    version: versionFromTag(latestTag?.name),
    sha: latestTag?.commit?.sha || null
  };
}

function setUpdateBadge(updateAvailable) {
  chrome.action.setBadgeText({ text: updateAvailable ? "NEW" : "" });

  if (updateAvailable) {
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
    chrome.action.setTitle({
      title: "Update available - open popup for details"
    });
    return;
  }

  chrome.action.setTitle({ title: "Mo khay lich su" });
}

function ensureUpdateAlarm() {
  chrome.alarms.create(UPDATE_CHECK_ALARM, {
    periodInMinutes: UPDATE_CHECK_INTERVAL_MINUTES
  });
}

async function checkForUpdates() {
  const manifest = chrome.runtime.getManifest();
  const localVersion = manifest.version;
  const currentState = await storageGet([
    STORAGE_KEYS.updateInfo,
    STORAGE_KEYS.installedCommitSha,
    STORAGE_KEYS.installedVersion
  ]);
  const previousInfo = currentState[STORAGE_KEYS.updateInfo] || null;

  try {
    const [latestCommit, latestTag] = await Promise.all([
      fetchLatestCommit(),
      fetchLatestTag()
    ]);

    let installedCommitSha = currentState[STORAGE_KEYS.installedCommitSha] || null;
    let installedVersion = currentState[STORAGE_KEYS.installedVersion] || null;

    if (installedVersion !== localVersion && latestCommit.sha) {
      installedVersion = localVersion;
      installedCommitSha = latestCommit.sha;
    } else if (!installedCommitSha && latestCommit.sha) {
      installedCommitSha = latestCommit.sha;
    }

    let updateAvailable = false;
    let reason = "none";

    if (latestTag.version && compareVersions(latestTag.version, localVersion) > 0) {
      updateAvailable = true;
      reason = "tag";
    } else if (installedCommitSha && latestCommit.sha && installedCommitSha !== latestCommit.sha) {
      updateAvailable = true;
      reason = "commit";
    }

    const updateInfo = {
      localVersion,
      latestCommitSha: latestCommit.sha,
      latestCommitUrl: latestCommit.url,
      latestCommitDate: latestCommit.date,
      latestCommitMessage: latestCommit.message,
      latestTagName: latestTag.name,
      latestTagVersion: latestTag.version,
      latestTagSha: latestTag.sha,
      updateAvailable,
      reason,
      repoUrl: GITHUB_REPO.homepage,
      checkedAt: new Date().toISOString(),
      lastError: null
    };

    await storageSet({
      [STORAGE_KEYS.updateInfo]: updateInfo,
      [STORAGE_KEYS.installedCommitSha]: installedCommitSha,
      [STORAGE_KEYS.installedVersion]: installedVersion || localVersion
    });

    setUpdateBadge(updateAvailable);
    return updateInfo;
  } catch (error) {
    const updateInfo = {
      ...(previousInfo || {}),
      localVersion,
      checkedAt: new Date().toISOString(),
      lastError: error?.message || "Unknown error while checking updates"
    };

    await storageSet({ [STORAGE_KEYS.updateInfo]: updateInfo });
    setUpdateBadge(Boolean(updateInfo.updateAvailable));
    return updateInfo;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureUpdateAlarm();
  checkForUpdates().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureUpdateAlarm();
  checkForUpdates().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== UPDATE_CHECK_ALARM) return;
  checkForUpdates().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;

  if (message.type === "CHECK_UPDATES_NOW") {
    checkForUpdates()
      .then((info) => sendResponse({ ok: true, info }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Unknown error" }));
    return true;
  }

  if (message.type === "GET_UPDATE_INFO") {
    storageGet([STORAGE_KEYS.updateInfo]).then((data) => {
      sendResponse({ ok: true, info: data[STORAGE_KEYS.updateInfo] || null });
    });
    return true;
  }

  return undefined;
});

(async () => {
  const { updateInfo } = await storageGet([STORAGE_KEYS.updateInfo]);
  setUpdateBadge(Boolean(updateInfo?.updateAvailable));
})();
