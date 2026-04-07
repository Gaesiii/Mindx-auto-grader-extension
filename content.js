// ================== CẤU HÌNH AI & BIẾN TOÀN CỤC ==================
let lastRun = 0;
let lastStudentHash = "";
let geminiApiKey = '';
let userAiPrompt = ''; 
let currentAiModel = 'gemini-2.5-flash';
const WEB_APP_API_URL = "https://lms-performance-tracker.vercel.app/api/generate";

const INITIAL_TAGS = ["Ngoan", "Giỏi", "Tập trung", "Làm bài nhanh", "Cần cố gắng", "Sáng tạo"];
let savedTags = [];
const LESSON_TEMPLATE_APIS = [
  { key: "templates", label: "Templates", url: "https://69b966eee69653ffe6a796d4.mockapi.io/templates" },
  { key: "robotic", label: "Robotic", url: "https://69b9805ee69653ffe6a7e451.mockapi.io/Robotic" },
  { key: "web-app", label: "Web-App", url: "https://69b980a8e69653ffe6a7e573.mockapi.io/Web-App" },
  { key: "robot", label: "robot", url: "https://69b9805de69653ffe6a7e3f4.mockapi.io/robot" }
];

const lessonTemplateState = {
  sourceKey: LESSON_TEMPLATE_APIS[0].key,
  bySource: {},
  selectedBySource: {}
};

let lessonTemplateLoadRequestId = 0;

chrome.storage.local.get(['geminiApiKey', 'aiPrompt', 'customTags'], (result) => {
  geminiApiKey = result.geminiApiKey || '';
  userAiPrompt = result.aiPrompt || '';
  savedTags = result.customTags || INITIAL_TAGS;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.geminiApiKey) geminiApiKey = changes.geminiApiKey.newValue;
    if (changes.aiPrompt) userAiPrompt = changes.aiPrompt.newValue;
    if (changes.customTags) {
      savedTags = changes.customTags.newValue || INITIAL_TAGS;
      rerenderAllTagsUI(); 
    }
  }
});

// ================== DETECT & GET STUDENTS ==================
function isNhanXetTabActive() {
  return document.querySelector('.name-display') !== null;
}

function toMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStudents() {
  const students = [];
  document.querySelectorAll('tr').forEach(row => {
    const nameEl = row.querySelector('.name-display');
    const buttons = Array.from(row.querySelectorAll('button'));
    if (!nameEl || buttons.length === 0) return;

    let btn = buttons.find((button) => {
      const text = toMatchText(button.innerText);
      return (
        text.includes("nhan xet") ||
        text.includes("feedback") ||
        text.includes("comment")
      );
    });

    // Fallback: encoding/text can vary across LMS pages.
    if (!btn && buttons.length === 1) btn = buttons[0];
    if (!btn) btn = buttons.find((button) => (button.innerText || "").trim().length > 0) || buttons[0];

    if (btn) {
      students.push({
        name: nameEl.innerText.trim(),
        button: btn
      });
    }
  });
  return students;
}

// ================== XỬ LÝ TAGS LOGIC ==================
function addTagToInput(targetId, tagText) {
  const input = document.getElementById(targetId);
  if (!input) return;

  let currentVal = input.value.trim();
  const tagsArray = currentVal.split(',').map(t => t.trim()).filter(t => t);
  
  if (tagsArray.includes(tagText)) return; 

  if (currentVal === "") {
    input.value = tagText;
  } else {
    input.value = currentVal + ", " + tagText;
  }
  input.focus();
}

function saveTagsAndRerender(newTags) {
  savedTags = newTags;
  chrome.storage.local.set({ customTags: savedTags }, () => {
    rerenderAllTagsUI();
  });
}

function rerenderAllTagsUI() {
  document.querySelectorAll('[id^="tags-container-"]').forEach(container => {
    const targetId = container.id.replace('tags-container-', 'kw-');
    container.innerHTML = renderTagsHTML(targetId);
  });
}

function renderTagsHTML(targetId) {
  let html = '';
  savedTags.forEach(tag => {
    html += `
      <div style="display:inline-flex; align-items:center; background:#e0f7fa; border:1px solid #b2ebf2; border-radius:12px; padding:2px 6px; margin: 3px 2px;">
        <span class="suggested-tag" data-target="${targetId}" data-tag="${tag}" style="color:#006064; font-size:11px; cursor:pointer; user-select:none;">${tag}</span>
        <span class="delete-tag" data-tag="${tag}" style="margin-left:4px; color:#d32f2f; font-size:14px; cursor:pointer; font-weight:bold; line-height:1; user-select:none; padding: 0 2px;" title="Xóa tag này khỏi hệ thống">&times;</span>
      </div>
    `;
  });
  html += `
    <div style="display:inline-flex; gap: 5px; margin: 3px 2px; margin-left: 5px; align-items:center;">
      <span class="add-custom-tag" data-target="${targetId}" style="background:#f1f3f4; color:#5f6368; padding:3px 8px; border-radius:12px; font-size:11px; cursor:pointer; border:1px dashed #ccc; font-weight:bold; user-select:none;">+ Thêm</span>
      <span class="clear-input" data-target="${targetId}" style="background:#ffebee; color:#c62828; padding:3px 8px; border-radius:12px; font-size:11px; cursor:pointer; border:1px dashed #ffcdd2; font-weight:bold; user-select:none;">🗑 Xóa trắng</span>
    </div>
  `;
  return html;
}

function getLessonApiByKey(key) {
  return LESSON_TEMPLATE_APIS.find((api) => api.key === key) || LESSON_TEMPLATE_APIS[0];
}

function parseLessonOrder(title) {
  const match = String(title || "").match(/(\d+)(?!.*\d)/);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function normalizeLessonTemplate(item, index) {
  const title = String(item?.title || `Template ${index + 1}`).trim();
  return {
    id: String(item?.id || `template-${index + 1}`),
    title,
    content: String(item?.content || ""),
    order: parseLessonOrder(title)
  };
}

function htmlToReadableText(html) {
  if (!html) return "";
  const holder = document.createElement("div");
  holder.innerHTML = String(html);
  return (holder.innerText || holder.textContent || "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeVietnameseText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVietnameseTextSafe(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.replace(/\u0111/g, "d");
}

function isLessonStopLine(normalizedLine) {
  if (!normalizedLine) return false;
  return (
    normalizedLine.startsWith("link ") ||
    normalizedLine.startsWith("http://") ||
    normalizedLine.startsWith("https://") ||
    normalizedLine.includes("student book") ||
    normalizedLine.includes("cam on")
  );
}

function extractLessonBodyText(rawContent) {
  const readableText = htmlToReadableText(rawContent);
  if (!readableText) return "";

  const lines = readableText.split(/\r?\n/).map((line) => line.trim());
  let startIndex = -1;
  let inlineAfterMarker = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalized = normalizeVietnameseTextSafe(line);
    if (!normalized.includes("noi dung buoi hoc")) continue;

    startIndex = i;
    const colonIndex = line.indexOf(":");
    if (colonIndex >= 0 && colonIndex < line.length - 1) {
      inlineAfterMarker = line.slice(colonIndex + 1).trim();
    }
    break;
  }

  if (startIndex === -1) return readableText;

  const pickedLines = [];
  if (inlineAfterMarker) pickedLines.push(inlineAfterMarker);

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    const normalized = normalizeVietnameseTextSafe(line);
    if (isLessonStopLine(normalized)) break;

    pickedLines.push(line.replace(/^[\-\u2022]\s*/, ""));
  }

  const finalText = pickedLines.join("\n").trim();
  return finalText || readableText;
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value.trim()) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (error) {
    // Fallback below.
  }

  try {
    const temp = document.createElement("textarea");
    temp.value = value;
    temp.setAttribute("readonly", "");
    temp.style.position = "fixed";
    temp.style.top = "-9999px";
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, temp.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(temp);
    return copied;
  } catch (error) {
    return false;
  }
}

function getCurrentLessonTemplates() {
  return lessonTemplateState.bySource[lessonTemplateState.sourceKey] || [];
}

function getSelectedLessonTemplate() {
  const sourceKey = lessonTemplateState.sourceKey;
  const selectedId = lessonTemplateState.selectedBySource[sourceKey];
  if (!selectedId) return null;
  const templates = lessonTemplateState.bySource[sourceKey] || [];
  return templates.find((template) => template.id === selectedId) || null;
}

async function fetchLessonTemplates(sourceKey) {
  if (lessonTemplateState.bySource[sourceKey]) {
    return lessonTemplateState.bySource[sourceKey];
  }

  const api = getLessonApiByKey(sourceKey);
  const response = await fetch(api.url);
  if (!response.ok) {
    throw new Error(`API ${api.label} failed (${response.status})`);
  }

  const payload = await response.json();
  const list = Array.isArray(payload) ? payload : [];
  const normalized = list
    .map((item, index) => normalizeLessonTemplate(item, index))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    })
    .map(({ id, title, content }) => ({ id, title, content }));

  lessonTemplateState.bySource[sourceKey] = normalized;
  return normalized;
}

function setLessonTemplateStatus(panel, message, isError = false) {
  const statusEl = panel.querySelector("#lesson-template-status");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#c62828" : "#5f6368";
}

function updateLessonTemplatePreview(panel) {
  const previewEl = panel.querySelector("#lesson-template-preview");
  const template = getSelectedLessonTemplate();
  if (!previewEl) return;
  previewEl.value = template ? extractLessonBodyText(template.content) : "";
}

async function refreshLessonTemplateSelector(panel) {
  const sourceSelect = panel.querySelector("#lesson-source-select");
  const templateSelect = panel.querySelector("#lesson-template-select");
  if (!sourceSelect || !templateSelect) return;

  const sourceKey = sourceSelect.value;
  lessonTemplateState.sourceKey = sourceKey;
  const requestId = ++lessonTemplateLoadRequestId;

  templateSelect.innerHTML = "";
  templateSelect.disabled = true;
  setLessonTemplateStatus(panel, "Loading lesson content...");
  updateLessonTemplatePreview(panel);

  try {
    const templates = await fetchLessonTemplates(sourceKey);
    if (requestId !== lessonTemplateLoadRequestId) return;

    if (!templates.length) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "No data";
      templateSelect.appendChild(emptyOption);
      lessonTemplateState.selectedBySource[sourceKey] = "";
      setLessonTemplateStatus(panel, "This source is empty.");
      updateLessonTemplatePreview(panel);
      return;
    }

    templates.forEach((template) => {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.title;
      templateSelect.appendChild(option);
    });

    const previousSelected = lessonTemplateState.selectedBySource[sourceKey];
    const exists = templates.some((template) => template.id === previousSelected);
    const selectedId = exists ? previousSelected : templates[0].id;
    lessonTemplateState.selectedBySource[sourceKey] = selectedId;
    templateSelect.value = selectedId;
    templateSelect.disabled = false;
    setLessonTemplateStatus(panel, `Loaded ${templates.length} item(s).`);
    updateLessonTemplatePreview(panel);
  } catch (error) {
    if (requestId !== lessonTemplateLoadRequestId) return;
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Cannot load data";
    templateSelect.appendChild(option);
    lessonTemplateState.selectedBySource[sourceKey] = "";
    setLessonTemplateStatus(panel, `Load failed: ${error.message || "Unknown error"}`, true);
    updateLessonTemplatePreview(panel);
  }
}

async function initializeLessonTemplateUI(panel) {
  const sourceSelect = panel.querySelector("#lesson-source-select");
  const templateSelect = panel.querySelector("#lesson-template-select");
  const copyBtn = panel.querySelector("#copy-lesson-template-btn");
  if (!sourceSelect || !templateSelect) return;

  sourceSelect.innerHTML = "";
  LESSON_TEMPLATE_APIS.forEach((api) => {
    const option = document.createElement("option");
    option.value = api.key;
    option.textContent = api.label;
    sourceSelect.appendChild(option);
  });
  sourceSelect.value = lessonTemplateState.sourceKey;

  sourceSelect.addEventListener("change", () => {
    refreshLessonTemplateSelector(panel);
  });

  templateSelect.addEventListener("change", () => {
    lessonTemplateState.selectedBySource[lessonTemplateState.sourceKey] = templateSelect.value || "";
    updateLessonTemplatePreview(panel);
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const previewText = panel.querySelector("#lesson-template-preview")?.value || "";
      if (!previewText.trim()) {
        setLessonTemplateStatus(panel, "Khong co noi dung de copy.", true);
        return;
      }

      const copied = await copyTextToClipboard(previewText);
      setLessonTemplateStatus(
        panel,
        copied ? "Da copy noi dung buoi hoc." : "Khong the copy tren trang nay.",
        !copied
      );
    });
  }

  await refreshLessonTemplateSelector(panel);
}

// ================== PANEL ==================
function createPanel() {
  let panel = document.getElementById('student-keyword-panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'student-keyword-panel';

  panel.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    width: 380px; 
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    z-index: 2147483647;
    padding: 15px;
    font-family: "Segoe UI", "Noto Sans", Arial, sans-serif;
    border: 1px solid #e0e0e0;
  `;

  const dialogs = document.querySelectorAll('[role="dialog"]');
  const container = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document.body;
  container.appendChild(panel);

  ['mousedown', 'mouseup'].forEach(evt => panel.addEventListener(evt, e => e.stopPropagation()));
  panel.addEventListener('keydown', e => e.stopPropagation(), { capture: true });
  panel.addEventListener('keyup', e => e.stopPropagation(), { capture: true });
  panel.addEventListener('keypress', e => e.stopPropagation(), { capture: true });

  panel.addEventListener('click', e => {
    e.stopPropagation();

    const tagEl = e.target.closest('.suggested-tag');
    if (tagEl) {
      addTagToInput(tagEl.getAttribute('data-target'), tagEl.getAttribute('data-tag'));
      const wrapper = tagEl.parentElement;
      const originalBg = wrapper.style.background;
      wrapper.style.background = '#80deea'; 
      setTimeout(() => { wrapper.style.background = originalBg; }, 200);
      return;
    }

    const delEl = e.target.closest('.delete-tag');
    if (delEl) {
      const tagValue = delEl.getAttribute('data-tag');
      if (confirm(`Bạn có chắc muốn xóa tag "${tagValue}" khỏi hệ thống?`)) {
        const newTags = savedTags.filter(t => t !== tagValue);
        saveTagsAndRerender(newTags);
      }
      return;
    }

    const addEl = e.target.closest('.add-custom-tag');
    if (addEl) {
      const targetId = addEl.getAttribute('data-target');
      const newTag = prompt("Nhập từ khóa mới (sẽ được lưu luôn vào hệ thống):");
      if (newTag && newTag.trim() !== "") {
        const cleanedTag = newTag.trim();
        if (!savedTags.includes(cleanedTag)) {
          savedTags.push(cleanedTag);
          saveTagsAndRerender(savedTags);
        }
        addTagToInput(targetId, cleanedTag);
      }
      return;
    }

    const clearEl = e.target.closest('.clear-input');
    if (clearEl) {
      const targetId = clearEl.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        input.value = '';
        input.focus();
      }
      return;
    }
  });

  return panel;
}

// ================== DRAG ==================
function makeDraggable(panel) {
  const header = panel.querySelector('#panel-header');
  if (!header) return;

  let dragState = null;

  const stopDragging = () => {
    if (!dragState) return;
    dragState = null;
    document.body.style.userSelect = "";
    header.style.cursor = "move";
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
  };

  const onPointerMove = (e) => {
    if (!dragState) return;
    panel.style.left = `${e.clientX - dragState.offsetX}px`;
    panel.style.top = `${e.clientY - dragState.offsetY}px`;
  };

  const onPointerUp = () => {
    stopDragging();
  };

  header.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";

    dragState = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };

    document.body.style.userSelect = "none";
    header.style.cursor = "grabbing";
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);

    if (header.setPointerCapture && typeof e.pointerId === "number") {
      try {
        header.setPointerCapture(e.pointerId);
      } catch (_error) {
        // Ignore capture errors and keep fallback listeners.
      }
    }
  });
}

// ================== RENDER PANEL UI ==================
function renderStudentPanel(students) {
  const panel = createPanel();
  panel.style.display = 'block';

  panel.innerHTML = `
    <div id="panel-header" style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      cursor:move;
      padding-bottom:5px;
      border-bottom:1px solid #ddd;
    ">
      <b>📋 Nhận xét theo từ khóa</b>
      <button id="close-panel" style="cursor:pointer; border:none; background:none; font-size:16px;">❌</button>
    </div>

    <div style="margin-top:10px; padding: 10px; background: #f9fbfd; border-radius: 6px; border: 1px solid #e9eef3;">
      <div style="font-size: 13px; font-weight: bold; color: #1f2937; margin-bottom: 6px;">Chon noi dung buoi hoc</div>
      <div style="display:flex; gap: 6px;">
        <select id="lesson-source-select" style="flex:1; padding: 6px; border:1px solid #ccc; border-radius: 4px; font-size: 12px;"></select>
        <select id="lesson-template-select" style="flex:1; padding: 6px; border:1px solid #ccc; border-radius: 4px; font-size: 12px;"></select>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:6px;">
        <div id="lesson-template-status" style="font-size:11px; color:#5f6368;"></div>
        <button
          id="copy-lesson-template-btn"
          type="button"
          style="padding:4px 8px; border:1px solid #c7d2e1; background:#fff; border-radius:4px; font-size:11px; cursor:pointer; white-space:nowrap;"
        >
          Copy noi dung
        </button>
      </div>
      <textarea
        id="lesson-template-preview"
        readonly
        placeholder="Noi dung se hien thi tai day..."
        style="width:100%; height:80px; margin-top:6px; padding:6px; border:1px solid #ddd; border-radius:4px; box-sizing:border-box; resize:vertical; font-size:12px; color:#333; background:#fff;"
      ></textarea>
    </div>

    <div style="margin-top:10px; max-height: 400px; overflow-y: auto; padding-right: 5px;">
      ${students.map((s, i) => `
        <div style="margin-bottom:15px; padding: 10px; background: #f9f9f9; border-radius: 6px; border: 1px solid #eee;">
          <div style="font-size: 14px; font-weight:bold; color:#1a73e8; margin-bottom: 5px;">🧑‍🎓 ${s.name}</div>
          <textarea id="kw-${i}" class="ai-kw-input" placeholder="Bỏ trống thì tool sẽ tự BỎ QUA bạn này..." 
            style="width:100%; height:45px; padding:6px; border: 1px solid #ccc; border-radius: 4px; box-sizing:border-box; outline:none; font-size:13px; color:#333; resize:vertical; user-select:text; pointer-events:auto;"></textarea>
          
          <div id="tags-container-${i}" style="display:flex; flex-wrap:wrap; margin-top:5px;">
            ${renderTagsHTML(`kw-${i}`)}
          </div>
        </div>
      `).join('')}
    </div>

    <button id="auto-run" style="
      width:100%;
      padding:10px;
      background:#8e24aa;
      color:white;
      border:none;
      border-radius:6px;
      cursor:pointer;
      margin-top:15px;
      font-size: 14px;
      font-weight: bold;
      transition: 0.2s;
    ">
    ✨ Viết nhận xét tất cả (AI)
    </button>
  `;

  document.getElementById('close-panel').onclick = () => {
    panel.style.display = 'none';
  };

  document.getElementById('auto-run').onclick = runAutoAll;
  makeDraggable(panel);
  initializeLessonTemplateUI(panel);

  setTimeout(() => {
    panel.querySelectorAll('.ai-kw-input').forEach(input => {
      input.addEventListener('mousedown', function(e) { e.stopPropagation(); this.focus(); });
      input.addEventListener('click', function(e) { e.stopPropagation(); this.focus(); });
    });
  }, 50);
}

// ================== HIDE & HASH ==================
function hidePanel() {
  const panel = document.getElementById('student-keyword-panel');
  if (panel) panel.style.display = 'none';
}

function getStudentHash(students) {
  return students.map(s => s.name).join('|');
}

// ================== OBSERVER ==================
const observer = new MutationObserver(() => {
  const now = Date.now();
  if (now - lastRun < 500) return;
  lastRun = now;

  if (!isNhanXetTabActive()) {
    hidePanel();
    return;
  }

  const students = getStudents();
  if (students.length === 0) return;

  const newHash = getStudentHash(students);
  if (newHash !== lastStudentHash) {
    lastStudentHash = newHash;
    renderStudentPanel(students);
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// ================== AUTO ENGINE CHÍNH ==================
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function countdownWait(seconds, btnElement, statusLabel) {
  let timeLeft = seconds;
  return new Promise(resolve => {
    const interval = setInterval(() => {
      if (btnElement) {
        btnElement.innerText = `⏳ Chờ Server Google: ${timeLeft}s...`;
      }
      timeLeft--;
      if (timeLeft < 0) {
        clearInterval(interval);
        if (btnElement) btnElement.innerText = `⏳ Đang thử lại: ${statusLabel}...`;
        resolve();
      }
    }, 1000);
  });
}

function formatCommentAsHtml(text) {
  return String(text || "")
    .trim()
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function stripCodeFence(text) {
  const raw = String(text || "").trim();
  const fenceMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : raw;
}

function extractLikelyJson(text) {
  const withoutFence = stripCodeFence(text);
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1).trim();
  }
  return withoutFence;
}

function parseBatchComments(rawText, targets) {
  const jsonText = extractLikelyJson(rawText);
  const parsed = JSON.parse(jsonText);
  const items = Array.isArray(parsed?.students) ? parsed.students : [];
  if (!items.length) {
    throw new Error("Batch result does not contain students array.");
  }

  const byId = new Map();
  const byName = new Map();
  targets.forEach((target) => {
    byId.set(String(target.id), target);
    byName.set(normalizeVietnameseText(target.name), target);
  });

  const commentMap = new Map();
  items.forEach((item) => {
    const commentText = String(item?.comment || "").trim();
    if (!commentText) return;

    const rawId = item?.id != null ? String(item.id).trim() : "";
    if (rawId && byId.has(rawId)) {
      commentMap.set(rawId, formatCommentAsHtml(commentText));
      return;
    }

    const normalizedName = normalizeVietnameseText(item?.name || "");
    if (normalizedName && byName.has(normalizedName)) {
      const target = byName.get(normalizedName);
      commentMap.set(String(target.id), formatCommentAsHtml(commentText));
    }
  });

  return commentMap;
}

function buildBatchPrompt(targets, selectedLessonTemplate, selectedLessonText) {
  const defaultPromptTemplate = `Ban la thay giao day lap trinh. Dua vao tu khoa "{keywords}", viet nhan xet 3 y cho hoc sinh {name}: Diem manh, Can cai thien, Loi khuyen.`;
  const promptTemplate = userAiPrompt && userAiPrompt.trim() ? userAiPrompt.trim() : defaultPromptTemplate;
  const studentList = targets
    .map((target) => `- id: ${target.id}; name: ${target.name}; keywords: ${target.keyword}`)
    .join("\n");

  let finalPromptText = [
    "Ban dang xu ly nhieu hoc vien trong 1 lan goi API.",
    "Hay tao nhan xet rieng cho tung hoc vien dua tren ten va keywords cua hoc vien do.",
    `Ap dung theo prompt mau sau cho moi hoc vien (thay {name} va {keywords}):\n${promptTemplate}`,
    "",
    "Danh sach hoc vien:",
    studentList,
    "",
    "Bat buoc tra ve DUY NHAT JSON hop le dung schema:",
    "{\"students\":[{\"id\":\"1\",\"name\":\"<student name>\",\"comment\":\"<comment>\"}]}",
    "Khong duoc them markdown, khong duoc them van ban ngoai JSON."
  ].join("\n");

  if (selectedLessonText) {
    finalPromptText += `\n\nNoi dung buoi hoc tham chieu (${selectedLessonTemplate.title}):\n${selectedLessonText}\nHay dua tren noi dung nay de viet nhan xet phu hop.`;
  }

  return finalPromptText;
}

function buildFallbackCommentMap(targets, messageBuilder) {
  const map = new Map();
  targets.forEach((target) => {
    map.set(String(target.id), formatCommentAsHtml(messageBuilder(target)));
  });
  return map;
}

async function generateCommentsBatch(targets, btnElement) {
  if (!geminiApiKey) {
    return buildFallbackCommentMap(
      targets,
      (target) => `[Thieu API Key] Hoc vien ${target.name}: ${target.keyword}`
    );
  }

  const selectedLessonTemplate = getSelectedLessonTemplate();
  const selectedLessonText = selectedLessonTemplate
    ? extractLessonBodyText(selectedLessonTemplate.content).slice(0, 3500)
    : "";
  const finalPromptText = buildBatchPrompt(targets, selectedLessonTemplate, selectedLessonText);

  const payload = {
    prompt: finalPromptText,
    model: currentAiModel,
    api_key: geminiApiKey,
    keywords: targets.map((target) => `${target.name}: ${target.keyword}`).join("\n"),
    scores: "Chưa chấm điểm",
    raw_html: selectedLessonTemplate?.content || "Batch processing mode",
    lesson_template_id: selectedLessonTemplate?.id || "",
    lesson_template_title: selectedLessonTemplate?.title || "",
    lesson_template_source: lessonTemplateState.sourceKey
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(WEB_APP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (error) {
        throw new Error("Loi ket noi Server Vercel");
      }

      if (responseData.status === "error") {
        throw new Error(responseData.message || "Loi AI khong xac dinh");
      }

      const aiText = String(responseData.data || "").trim();
      const parsedComments = parseBatchComments(aiText, targets);

      targets.forEach((target) => {
        if (!parsedComments.has(String(target.id))) {
          parsedComments.set(
            String(target.id),
            formatCommentAsHtml(`[AI khong tra ve nhan xet cho hoc vien nay] ${target.name}`)
          );
        }
      });
      return parsedComments;
    } catch (error) {
      const errMsg = String(error?.message || "").toUpperCase();

      if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        console.warn("Da dat gioi han toc do API ban mien phi.");
        return buildFallbackCommentMap(
          targets,
          (target) => `[BI CHAN DO GOI AI QUA NHANH. CHO VAI PHUT ROI LAM LAI] ${target.name}`
        );
      }

      if (errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("504")) {
        if (attempt < maxRetries) {
          await countdownWait(10, btnElement, "batch");
          continue;
        }
      }

      return buildFallbackCommentMap(
        targets,
        (target) => `[LOI AI: ${error.message}] Hoc vien ${target.name}`
      );
    }
  }
}
function getActiveDialog() {
  const dialogs = document.querySelectorAll('[role="dialog"], .modal, .ant-modal, .MuiDialog-root');
  if (dialogs.length > 0) return dialogs[dialogs.length - 1];
  return document.body;
}

function getEditor(container) {
  const editors = container.querySelectorAll('.ql-editor');
  return editors.length > 0 ? editors[editors.length - 1] : null;
}

function getSaveButton(container) {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find(btn => {
    const text = toMatchText(btn.innerText);
    return (
      text.includes("luu") ||
      text.includes("save") ||
      text.includes("hoan thanh") ||
      text.includes("submit")
    );
  });
}

function getCloseButton(container) {
  const buttons = Array.from(container.querySelectorAll('button'));
  let closeBtn = buttons.find(btn => {
    const text = toMatchText(btn.innerText);
    return (
      text === "dong" ||
      text === "huy" ||
      text === "close" ||
      text === "cancel" ||
      text === "quay lai" ||
      text === "tro lai" ||
      text === "back"
    );
  });
  
  if (!closeBtn) {
    closeBtn = container.querySelector('.close, .btn-close, [aria-label="Close"], [data-dismiss="modal"]');
  }
  return closeBtn;
}

// --- QUY TRÌNH XỬ LÝ 1 HỌC SINH ---
async function processStudent(student, commentHtml) {
  student.button.click();
  await sleep(1500);

  const activeDialog = getActiveDialog();

  const editor = getEditor(activeDialog);
  if (editor) {
    editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertHTML', false, commentHtml || "");

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  await sleep(800);

  let saveBtn = getSaveButton(activeDialog);
  if (saveBtn) saveBtn.click();

  await sleep(1000);

  saveBtn = getSaveButton(activeDialog);
  if (saveBtn) saveBtn.click();

  await sleep(1500);

  const closeBtn = getCloseButton(activeDialog);
  if (closeBtn) {
    closeBtn.click();
  } else {
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
    activeDialog.dispatchEvent(escEvent);
    document.dispatchEvent(escEvent);
  }

  await sleep(1200);
}

async function runAutoAll() {
  const students = getStudents();
  const btn = document.getElementById('auto-run');

  btn.disabled = true;
  btn.style.opacity = '0.6';

  const targets = [];
  let countSkipped = 0;

  for (let i = 0; i < students.length; i++) {
    const keyword = document.getElementById(`kw-${i}`)?.value.trim();

    if (!keyword) {
      countSkipped++;
      continue;
    }

    targets.push({
      id: String(targets.length + 1),
      name: students[i].name,
      keyword,
      student: students[i]
    });
  }

  if (!targets.length) {
    btn.innerText = "✨ Viết nhận xét tất cả (AI)";
    btn.disabled = false;
    btn.style.opacity = '1';
    alert("Khong co hoc vien nao duoc xu ly vi ban chua nhap tu khoa.");
    return;
  }

  btn.innerText = "⏳ Dang tao nhan xet cho toan bo hoc vien...";
  const commentsById = await generateCommentsBatch(targets, btn);

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const commentHtml = commentsById.get(String(target.id)) || formatCommentAsHtml(`[AI khong co ket qua] ${target.name}`);
    btn.innerText = `⏳ Đang xử lý: ${target.name}...`;
    await processStudent(target.student, commentHtml);
  }

  btn.innerText = "✨ Viết nhận xét tất cả (AI)";
  btn.disabled = false;
  btn.style.opacity = '1';

  alert(`🔥 HOÀN THÀNH!\n- Đã nhận xét: ${targets.length} học viên.\n- Bỏ qua: ${countSkipped} học viên không nhập từ khóa.`);
}

