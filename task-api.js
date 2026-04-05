(function initTaskApi(globalScope) {
  const STORAGE_KEYS = {
    tasksByUser: "trialTasksByUser",
    submissionLog: "trialTaskSubmissionLog"
  };

  const API_ENDPOINTS = {
    fetchTasks: "https://lms-performance-tracker.vercel.app/api/trial-tasks",
    submitTasks: "https://lms-performance-tracker.vercel.app/api/trial-tasks/submit"
  };

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizeTask(task) {
    return {
      id: task?.id || makeId("task"),
      studentName: task?.studentName || "",
      age: Number.parseInt(task?.age, 10) || 0,
      course: task?.course || "",
      notes: task?.notes || "",
      consultantInfo: task?.consultantInfo || "",
      schedule: {
        date: task?.schedule?.date || "",
        time: task?.schedule?.time || ""
      },
      trialStatus: task?.trialStatus || "pending",
      absent: Boolean(task?.absent),
      feedback: task?.feedback || "",
      dataLogs: task?.dataLogs || "",
      source: task?.source || "assigned",
      updatedAt: task?.updatedAt || new Date().toISOString(),
      submittedAt: task?.submittedAt || null
    };
  }

  function seedTasksForUser(userIdentity) {
    const today = new Date();
    const date = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const consultantName = userIdentity?.displayName || userIdentity?.userId || "Consultant";

    return [
      normalizeTask({
        id: makeId("assigned"),
        studentName: "Nguyen Minh Anh",
        age: 10,
        course: "Scratch SB",
        notes: "New student, shy but cooperative.",
        consultantInfo: consultantName,
        schedule: { date, time: "18:30" },
        source: "assigned"
      }),
      normalizeTask({
        id: makeId("assigned"),
        studentName: "Tran Gia Huy",
        age: 12,
        course: "Python PTB",
        notes: "Needs support on logic and algorithm flow.",
        consultantInfo: consultantName,
        schedule: { date: tomorrow, time: "19:00" },
        source: "assigned"
      })
    ];
  }

  function buildSubmissionPayload(userIdentity, tasks) {
    return {
      userId: userIdentity?.userId || "",
      authMethod: userIdentity?.method || "",
      token: userIdentity?.token || "",
      submittedAt: new Date().toISOString(),
      tasks: tasks.map((task) => ({
        id: task.id,
        studentName: task.studentName,
        age: task.age,
        course: task.course,
        notes: task.notes,
        consultantInfo: task.consultantInfo,
        schedule: task.schedule,
        trialStatus: task.trialStatus,
        absent: task.absent,
        feedback: task.feedback,
        dataLogs: task.dataLogs,
        source: task.source,
        updatedAt: task.updatedAt
      }))
    };
  }

  async function loadTaskMap() {
    const data = await storageGet([STORAGE_KEYS.tasksByUser]);
    const map = data[STORAGE_KEYS.tasksByUser];
    return map && typeof map === "object" ? map : {};
  }

  async function getAssignedTasks(userIdentity) {
    const userId = userIdentity?.userId;
    if (!userId) return [];
    const token = userIdentity?.token || "";

    if (API_ENDPOINTS.fetchTasks) {
      const query = new URLSearchParams({ userId });
      if (token) query.set("token", token);
      const response = await fetch(`${API_ENDPOINTS.fetchTasks}?${query.toString()}`);
      if (!response.ok) throw new Error(`Fetch task API failed (${response.status})`);
      const payload = await response.json();
      const remoteTasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
      return remoteTasks.map(normalizeTask);
    }

    const map = await loadTaskMap();
    if (!Array.isArray(map[userId]) || map[userId].length === 0) {
      map[userId] = seedTasksForUser(userIdentity);
      await storageSet({ [STORAGE_KEYS.tasksByUser]: map });
    }

    return map[userId].map(normalizeTask);
  }

  async function saveTasks(userIdentity, tasks) {
    const userId = userIdentity?.userId;
    if (!userId) return [];

    const map = await loadTaskMap();
    map[userId] = tasks.map(normalizeTask);
    await storageSet({ [STORAGE_KEYS.tasksByUser]: map });
    return map[userId];
  }

  async function submitTasks(userIdentity, tasks) {
    const payload = buildSubmissionPayload(userIdentity, tasks);
    if (!payload.userId) throw new Error("Missing user identity");

    if (API_ENDPOINTS.submitTasks) {
      const response = await fetch(API_ENDPOINTS.submitTasks, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`Submit API failed (${response.status})`);
      return response.json();
    }

    const data = await storageGet([STORAGE_KEYS.submissionLog]);
    const log = Array.isArray(data[STORAGE_KEYS.submissionLog]) ? data[STORAGE_KEYS.submissionLog] : [];
    log.unshift(payload);
    await storageSet({ [STORAGE_KEYS.submissionLog]: log.slice(0, 100) });
    return { ok: true, source: "local-mock", payload };
  }

  function setApiEndpoints(config) {
    if (!config || typeof config !== "object") return;
    if (typeof config.fetchTasks === "string") API_ENDPOINTS.fetchTasks = config.fetchTasks.trim();
    if (typeof config.submitTasks === "string") API_ENDPOINTS.submitTasks = config.submitTasks.trim();
  }

  globalScope.TaskApi = {
    getAssignedTasks,
    saveTasks,
    submitTasks,
    buildSubmissionPayload,
    setApiEndpoints,
    normalizeTask
  };
})(window);
