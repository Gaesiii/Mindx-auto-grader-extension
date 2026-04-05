const state = {
  userIdentity: null,
  updateInfo: null,
  tasks: [],
  selectedTaskId: null,
  busy: false
};

const els = {
  updateBanner: document.getElementById("updateBanner"),
  btnCheckUpdates: document.getElementById("btnCheckUpdates"),
  identityText: document.getElementById("identityText"),
  btnOpenSettings: document.getElementById("btnOpenSettings"),
  taskList: document.getElementById("taskList"),
  evaluationForm: document.getElementById("evaluationForm"),
  studentNameField: document.getElementById("studentNameField"),
  ageField: document.getElementById("ageField"),
  courseField: document.getElementById("courseField"),
  consultantField: document.getElementById("consultantField"),
  notesField: document.getElementById("notesField"),
  scheduleDateField: document.getElementById("scheduleDateField"),
  scheduleTimeField: document.getElementById("scheduleTimeField"),
  absentField: document.getElementById("absentField"),
  trialStatusField: document.getElementById("trialStatusField"),
  feedbackField: document.getElementById("feedbackField"),
  dataLogsField: document.getElementById("dataLogsField"),
  btnSaveDraft: document.getElementById("btnSaveDraft"),
  btnSubmitTask: document.getElementById("btnSubmitTask"),
  unexpectedForm: document.getElementById("unexpectedForm"),
  newStudentName: document.getElementById("newStudentName"),
  newStudentAge: document.getElementById("newStudentAge"),
  newStudentCourse: document.getElementById("newStudentCourse"),
  newConsultantInfo: document.getElementById("newConsultantInfo"),
  newScheduleDate: document.getElementById("newScheduleDate"),
  newScheduleTime: document.getElementById("newScheduleTime"),
  newStudentNotes: document.getElementById("newStudentNotes"),
  btnSubmitAll: document.getElementById("btnSubmitAll"),
  statusText: document.getElementById("statusText")
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, isError = false) {
  if (!els.statusText) return;
  els.statusText.textContent = message || "";
  els.statusText.classList.toggle("error", Boolean(isError));
}

function setBusy(nextBusy) {
  state.busy = nextBusy;
  const disabled = Boolean(nextBusy);
  [els.btnSubmitAll, els.btnCheckUpdates].forEach((button) => {
    if (button) button.disabled = disabled;
  });
}

function getSelectedTask() {
  return state.tasks.find((task) => task.id === state.selectedTaskId) || null;
}

function applyAbsentState() {
  if (!els.absentField || !els.trialStatusField) return;
  const absent = els.absentField.checked;
  if (absent && els.trialStatusField.value === "pass") {
    els.trialStatusField.value = "fail";
  }
  els.trialStatusField.disabled = absent;
}

function clearEvaluationForm() {
  if (!els.evaluationForm) return;
  els.studentNameField.value = "";
  els.ageField.value = "";
  els.courseField.value = "";
  els.consultantField.value = "";
  els.notesField.value = "";
  els.scheduleDateField.value = "";
  els.scheduleTimeField.value = "";
  els.absentField.checked = false;
  els.trialStatusField.value = "pending";
  els.feedbackField.value = "";
  els.dataLogsField.value = "";
  applyAbsentState();
}

function setEvaluationDisabled(disabled) {
  [els.absentField, els.trialStatusField, els.feedbackField, els.dataLogsField, els.btnSaveDraft, els.btnSubmitTask].forEach((el) => {
    if (el) el.disabled = disabled;
  });
}

function fillEvaluationForm(task) {
  if (!task) {
    clearEvaluationForm();
    setEvaluationDisabled(true);
    return;
  }

  els.studentNameField.value = task.studentName || "";
  els.ageField.value = task.age || "";
  els.courseField.value = task.course || "";
  els.consultantField.value = task.consultantInfo || "";
  els.notesField.value = task.notes || "";
  els.scheduleDateField.value = task.schedule?.date || "";
  els.scheduleTimeField.value = task.schedule?.time || "";
  els.absentField.checked = Boolean(task.absent);
  els.trialStatusField.value = task.trialStatus || "pending";
  els.feedbackField.value = task.feedback || "";
  els.dataLogsField.value = task.dataLogs || "";
  setEvaluationDisabled(false);
  applyAbsentState();
}

function renderIdentity() {
  if (!state.userIdentity?.userId) {
    els.identityText.textContent = "No identity configured. Open Settings to connect Google or set manual UID.";
    return;
  }

  const method = state.userIdentity.method === "google" ? "Google" : "Manual";
  const display = state.userIdentity.displayName || state.userIdentity.userId;
  els.identityText.textContent = `${method} • ${display} (UID: ${state.userIdentity.userId})`;
}

function renderUpdateBanner() {
  const info = state.updateInfo;
  if (!info?.updateAvailable) {
    els.updateBanner.classList.add("hidden");
    els.updateBanner.innerHTML = "";
    return;
  }

  const shortSha = info.latestCommitSha ? info.latestCommitSha.slice(0, 7) : "unknown";
  const detail = info.reason === "tag"
    ? `New tag detected: ${escapeHtml(info.latestTagName || "unknown")}`
    : `New commit detected: ${escapeHtml(shortSha)}`;
  const link = info.latestCommitUrl || info.repoUrl || "https://github.com";
  const checkedAt = info.checkedAt ? new Date(info.checkedAt).toLocaleString() : "unknown";

  els.updateBanner.classList.remove("hidden");
  els.updateBanner.innerHTML = `
    <div><strong>Update available.</strong> ${detail}</div>
    <div style="margin-top:4px;">Last check: ${escapeHtml(checkedAt)}</div>
    <button id="btnOpenUpdateLink" class="btn btn-secondary" type="button" style="margin-top:6px;">Open Repository</button>
  `;

  const button = document.getElementById("btnOpenUpdateLink");
  if (button) {
    button.addEventListener("click", () => {
      chrome.tabs.create({ url: link });
    });
  }
}

function statusClass(status, absent) {
  if (absent) return "status-fail";
  if (status === "pass") return "status-pass";
  if (status === "fail") return "status-fail";
  return "status-pending";
}

function renderTaskList() {
  if (!state.tasks.length) {
    els.taskList.innerHTML = '<div class="task-item">No task assigned.</div>';
    fillEvaluationForm(null);
    return;
  }

  const html = state.tasks.map((task) => {
    const active = task.id === state.selectedTaskId ? "active" : "";
    const statusLabel = task.absent ? "Absent" : (task.trialStatus || "pending").toUpperCase();
    const sourceLabel = task.source === "unexpected" ? "Unexpected" : "Assigned";
    return `
      <button class="task-item ${active}" data-task-id="${escapeHtml(task.id)}" type="button">
        <div class="line-main">${escapeHtml(task.studentName || "Unknown Student")}</div>
        <div class="line-meta">${escapeHtml(task.course || "-")} • ${escapeHtml(task.schedule?.date || "-")} ${escapeHtml(task.schedule?.time || "")}</div>
        <div class="line-meta">${escapeHtml(sourceLabel)} • Consultant: ${escapeHtml(task.consultantInfo || "-")}</div>
        <div class="line-status ${statusClass(task.trialStatus, task.absent)}">${escapeHtml(statusLabel)}</div>
      </button>
    `;
  }).join("");

  els.taskList.innerHTML = html;
  const selected = getSelectedTask();
  fillEvaluationForm(selected);
}

function upsertSelectedTaskFromForm() {
  const selected = getSelectedTask();
  if (!selected) return null;

  const updated = {
    ...selected,
    absent: Boolean(els.absentField.checked),
    trialStatus: els.trialStatusField.value,
    feedback: els.feedbackField.value.trim(),
    dataLogs: els.dataLogsField.value.trim(),
    updatedAt: new Date().toISOString()
  };

  if (updated.absent && updated.trialStatus === "pass") {
    updated.trialStatus = "fail";
  }

  state.tasks = state.tasks.map((task) => (task.id === updated.id ? updated : task));
  return updated;
}

async function persistTasks() {
  if (!state.userIdentity?.userId) return;
  state.tasks = await window.TaskApi.saveTasks(state.userIdentity, state.tasks);
}

async function loadTasks() {
  if (!state.userIdentity?.userId) {
    state.tasks = [];
    state.selectedTaskId = null;
    renderTaskList();
    setStatus("Configure identity first to fetch trial tasks.", true);
    return;
  }

  try {
    state.tasks = await window.TaskApi.getAssignedTasks(state.userIdentity);
    if (!state.tasks.some((task) => task.id === state.selectedTaskId)) {
      state.selectedTaskId = state.tasks[0]?.id || null;
    }
    renderTaskList();
    setStatus(`Loaded ${state.tasks.length} task(s).`);
  } catch (error) {
    setStatus(`Cannot load tasks: ${error.message}`, true);
  }
}

function selectTask(taskId) {
  if (!state.tasks.some((task) => task.id === taskId)) return;
  state.selectedTaskId = taskId;
  renderTaskList();
}

async function checkUpdatesNow() {
  if (state.busy) return;
  if (!els.btnCheckUpdates) return;

  const label = els.btnCheckUpdates.textContent;
  els.btnCheckUpdates.textContent = "Checking...";
  setBusy(true);

  chrome.runtime.sendMessage({ type: "CHECK_UPDATES_NOW" }, (response) => {
    setBusy(false);
    els.btnCheckUpdates.textContent = label;

    if (chrome.runtime.lastError) {
      setStatus(`Update check failed: ${chrome.runtime.lastError.message}`, true);
      return;
    }

    if (!response?.ok) {
      setStatus(`Update check failed: ${response?.error || "Unknown error"}`, true);
      return;
    }

    state.updateInfo = response.info || null;
    renderUpdateBanner();

    const info = state.updateInfo;
    if (info?.lastError) {
      setStatus(`Update check warning: ${info.lastError}`, true);
      return;
    }

    if (info?.updateAvailable) {
      setStatus("Update available. Open repository for details.");
      return;
    }

    const version = info?.localVersion || "unknown";
    setStatus(`Ban dang o phien ban moi nhat (${version}).`);
  });
}

async function saveDraft() {
  if (state.busy) return;
  const updated = upsertSelectedTaskFromForm();
  if (!updated) {
    setStatus("Select a task before saving.", true);
    return;
  }

  try {
    setBusy(true);
    await persistTasks();
    renderTaskList();
    setStatus("Draft saved locally.");
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function submitSelectedTask() {
  if (state.busy) return;
  const updated = upsertSelectedTaskFromForm();
  if (!updated) {
    setStatus("Select a task before submitting.", true);
    return;
  }

  if (!state.userIdentity?.userId) {
    setStatus("Missing user identity.", true);
    return;
  }

  try {
    setBusy(true);
    await persistTasks();
    await window.TaskApi.submitTasks(state.userIdentity, [updated]);

    const submittedAt = new Date().toISOString();
    state.tasks = state.tasks.map((task) => (
      task.id === updated.id ? { ...task, submittedAt } : task
    ));
    await persistTasks();
    renderTaskList();
    setStatus("Selected task submitted.");
  } catch (error) {
    setStatus(`Submit failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function submitAllTasks() {
  if (state.busy) return;
  if (!state.tasks.length) {
    setStatus("No tasks to submit.", true);
    return;
  }

  if (!state.userIdentity?.userId) {
    setStatus("Missing user identity.", true);
    return;
  }

  upsertSelectedTaskFromForm();

  try {
    setBusy(true);
    await persistTasks();
    await window.TaskApi.submitTasks(state.userIdentity, state.tasks);
    const submittedAt = new Date().toISOString();
    state.tasks = state.tasks.map((task) => ({ ...task, submittedAt }));
    await persistTasks();
    renderTaskList();
    setStatus(`Submitted ${state.tasks.length} task(s).`);
  } catch (error) {
    setStatus(`Submit all failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function addUnexpectedTask(event) {
  event.preventDefault();
  if (state.busy) return;
  if (!state.userIdentity?.userId) {
    setStatus("Configure identity before adding manual students.", true);
    return;
  }

  const newTask = window.TaskApi.normalizeTask({
    id: `unexpected-${Date.now()}`,
    studentName: els.newStudentName.value.trim(),
    age: Number.parseInt(els.newStudentAge.value, 10) || 0,
    course: els.newStudentCourse.value.trim(),
    notes: els.newStudentNotes.value.trim(),
    consultantInfo: els.newConsultantInfo.value.trim(),
    schedule: {
      date: els.newScheduleDate.value,
      time: els.newScheduleTime.value
    },
    trialStatus: "pending",
    absent: false,
    feedback: "",
    dataLogs: `Added from popup at ${new Date().toISOString()}`,
    source: "unexpected"
  });

  if (!newTask.studentName || !newTask.course) {
    setStatus("Name and course are required for unexpected student.", true);
    return;
  }

  try {
    setBusy(true);
    state.tasks.unshift(newTask);
    state.selectedTaskId = newTask.id;
    await persistTasks();
    renderTaskList();
    els.unexpectedForm.reset();
    setStatus("Unexpected student added.");
  } catch (error) {
    setStatus(`Cannot add student: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function bindEvents() {
  els.btnOpenSettings.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  els.btnCheckUpdates.addEventListener("click", checkUpdatesNow);
  els.absentField.addEventListener("change", applyAbsentState);
  els.btnSaveDraft.addEventListener("click", saveDraft);
  els.btnSubmitTask.addEventListener("click", submitSelectedTask);
  els.btnSubmitAll.addEventListener("click", submitAllTasks);
  els.unexpectedForm.addEventListener("submit", addUnexpectedTask);

  els.taskList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-id]");
    if (!button) return;
    selectTask(button.getAttribute("data-task-id"));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.updateInfo) {
      state.updateInfo = changes.updateInfo.newValue || null;
      renderUpdateBanner();
    }

    if (changes.userIdentity) {
      state.userIdentity = changes.userIdentity.newValue || null;
      renderIdentity();
      loadTasks();
    }
  });
}

async function initPopup() {
  if (!window.TaskApi) {
    setStatus("TaskApi module is missing.", true);
    return;
  }

  bindEvents();
  clearEvaluationForm();
  setEvaluationDisabled(true);

  const data = await storageGet(["userIdentity", "updateInfo", "taskApiConfig"]);
  if (data.taskApiConfig) {
    window.TaskApi.setApiEndpoints(data.taskApiConfig);
  }
  state.userIdentity = data.userIdentity || null;
  state.updateInfo = data.updateInfo || null;

  renderIdentity();
  renderUpdateBanner();
  await loadTasks();
}

document.addEventListener("DOMContentLoaded", () => {
  initPopup().catch((error) => {
    setStatus(`Popup init failed: ${error.message}`, true);
  });
});
