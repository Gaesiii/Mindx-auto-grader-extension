let isExtensionEnabled = true;
let pasteKey = ''; let toggleKey = ''; let searchKey = '';
let templates = [];
let geminiApiKey = '';
let currentAiModel = 'gemini-2.5-flash';
let aiProviders = [];
let userAiPrompt = ''; 
let cloudApiUrl = '';
let autoTickScores = { gioi: [5,5,5,5,5,5,5], kha: [4,4,4,4,4,4,4], tb: [3,3,3,3,3,3,3] };
const GOOGLE_PROVIDER_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
let exhaustedAiCandidates = new Set();
let exhaustedAiDateKey = getLocalDateKey();
let lastAiRequestAt = 0;

// 🌐 ĐƯỜNG DẪN GỌI VỀ WEB APP PYTHON (LOCALHOST)
const WEB_APP_API_URL = "https://lms-performance-tracker.vercel.app/api/generate";
const ACP_EVAL_PANEL_ID = 'acp-eval-panel';
const ACP_EVAL_REOPEN_ID = 'acp-eval-reopen';
const ACP_MIN_RADIO_COUNT = 20;
const ACP_BULK_PANEL_ID = 'acp-student-keyword-panel';
const ACP_BULK_SCAN_COOLDOWN_MS = 500;
const ACP_BULK_MIN_REQUEST_INTERVAL_MS = 2600;
const ACP_BULK_TRANSIENT_RETRY_DELAY_MS = 10000;
const ACP_BULK_TRANSIENT_RETRY_COUNT = 2;
const ACP_BULK_DIALOG_WAIT_TIMEOUT_MS = 12000;
const ACP_BULK_EDITOR_WAIT_TIMEOUT_MS = 12000;
const ACP_BULK_DIALOG_CLOSE_TIMEOUT_MS = 6000;
const BULK_DEFAULT_TAGS = ['Ngoan', 'Gioi', 'Tap trung', 'Lam bai nhanh', 'Can co gang', 'Sang tao'];

// 🎯 RADAR GHI NHỚ VỊ TRÍ ZALO
let lastActiveInput = null;
let lastSavedRange = null;
let evalDialogCounter = 0;
let evalRefreshScheduled = false;
let savedBulkTags = BULK_DEFAULT_TAGS.slice();
let bulkRefreshScheduled = false;
let lastBulkScanAt = 0;
let lastBulkStudentHash = '';
let bulkKeywordDrafts = {};
let bulkLessonContentDraft = '';
let bulkLessonPickerState = { subject: 'Scratch', course: 'SB', lesson: 1 };
let bulkLessonStatusText = 'Chon mon/khoa/buoi roi bam Lay noi dung API.';
let bulkLessonStatusIsError = false;
let bulkRunInProgress = false;

const CLOUD_APIS = [
  atob("aHR0cHM6Ly82OWI5NjZlZWU2OTY1M2ZmZTZhNzk2ZDQubW9ja2FwaS5pby90ZW1wbGF0ZXM="),
  atob("aHR0cHM6Ly82OWI5ODA1ZWU2OTY1M2ZmZTZhN2U0NTEubW9ja2FwaS5pby9Sb2JvdGlj"),
  atob("aHR0cHM6Ly82OWI5ODBhOGU2OTY1M2ZmZTZhN2U1NzMubW9ja2FwaS5pby9XZWItQXBw"),
  atob("aHR0cHM6Ly82OWI5ODA1ZGU2OTY1M2ZmZTZhN2UzZjQubW9ja2FwaS5pby9yb2JvdA==")
];
const COURSE_TREE = {
  "Scratch": { courses: ["SB", "SA", "SI"] },
  "Game":    { courses: ["GB", "GA", "GI"] },
  "PRE":     { courses: ["PREB", "PREA", "PREI"] },
  "ARM":     { courses: ["ARMB", "ARMA", "ARMI"] },
  "WEB":     { courses: ["JSB", "JSA", "JSI"] },
  "SEMI":    { courses: ["SEMIB", "SEMIA", "SEMII"] },
  "Python":  { courses: ["PTB", "PTA", "PTI"] }
};

const COURSE_API_BY_SUBJECT = {
  Scratch: CLOUD_APIS[0],
  Game: CLOUD_APIS[0],
  PRE: CLOUD_APIS[1],
  ARM: CLOUD_APIS[1],
  WEB: CLOUD_APIS[2],
  SEMI: CLOUD_APIS[3],
  Python: CLOUD_APIS[3]
};

function parseScoreString(str) { return String(str || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)); }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLocalDateKey() {
  return new Date().toLocaleDateString('en-CA');
}

function sanitizeTagList(rawTags) {
  const source = Array.isArray(rawTags) ? rawTags : BULK_DEFAULT_TAGS;
  const normalized = source
    .map((tag) => String(tag || '').trim())
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : BULK_DEFAULT_TAGS.slice();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeVietnameseText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBulkSubjectList() {
  return Object.keys(COURSE_TREE);
}

function ensureBulkLessonPickerState() {
  const subjects = getBulkSubjectList();
  if (!subjects.length) return;

  if (!subjects.includes(bulkLessonPickerState.subject)) {
    bulkLessonPickerState.subject = subjects[0];
  }

  const courses = COURSE_TREE[bulkLessonPickerState.subject]?.courses || [];
  if (!courses.includes(bulkLessonPickerState.course)) {
    bulkLessonPickerState.course = courses[0] || '';
  }

  const lesson = Number.parseInt(bulkLessonPickerState.lesson, 10);
  if (!Number.isFinite(lesson) || lesson < 1 || lesson > 14) {
    bulkLessonPickerState.lesson = 1;
  } else {
    bulkLessonPickerState.lesson = lesson;
  }
}

function getBulkCourseList(subject) {
  return (COURSE_TREE[subject]?.courses || []).slice();
}

function getBulkLessonStatusColor() {
  return bulkLessonStatusIsError ? '#b91c1c' : '#475569';
}

function setBulkLessonStatus(text, isError = false) {
  bulkLessonStatusText = String(text || '').trim() || '...';
  bulkLessonStatusIsError = Boolean(isError);

  const panel = getBulkPanel();
  if (!panel) return;
  const statusEl = panel.querySelector('#acp-bulk-lesson-status');
  if (!(statusEl instanceof HTMLElement)) return;
  statusEl.textContent = bulkLessonStatusText;
  statusEl.style.color = getBulkLessonStatusColor();
}

function buildSelectOptionsHtml(values, selectedValue) {
  return values.map((value) => {
    const selected = String(value) === String(selectedValue) ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
  }).join('');
}

function buildLessonOptionsHtml(selectedLesson) {
  const options = [];
  for (let lesson = 1; lesson <= 14; lesson += 1) {
    options.push(lesson);
  }
  return buildSelectOptionsHtml(options, selectedLesson);
}

function isLikelyUrlText(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  if (/(https?:\/\/|www\.|bit\.ly|youtu\.be|youtube\.com|drive\.google\.com|docs\.google\.com|zalo\.me|facebook\.com)/i.test(text)) return true;
  if (/(^|\s)([a-z0-9-]+\.)+(com|vn|net|org|io|me|gg)(\/|\s|$)/i.test(text)) return true;
  return false;
}

function shouldDropLessonLine(line) {
  const rawLine = String(line || '').trim();
  if (!rawLine) return true;
  if (isLikelyUrlText(rawLine)) return true;

  const normalized = normalizeVietnameseText(rawLine).replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  const closingPatterns = [
    /^cam on\b/,
    /^xin cam on\b/,
    /^thank you\b/,
    /^tran trong\b/,
    /^than men\b/,
    /^best regards\b/,
    /^trong truong hop\b/,
    /^neu co\b/,
    /^em xin phep\b/,
    /^noi dung buoi hoc\b/,
    /^link\b/,
    /^link lam bai\b/,
    /^bai tap ve nha\b/,
    /^lien he\b/,
    /^hotline\b/,
    /^zalo\b/,
    /^facebook\b/,
    /^website\b/
  ];
  if (closingPatterns.some((pattern) => pattern.test(normalized))) return true;
  return false;
}

function cleanLessonContentHtml(rawHtml) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(rawHtml || '');

  wrapper.querySelectorAll('script, style, noscript, iframe').forEach((node) => node.remove());
  wrapper.querySelectorAll('a').forEach((anchor) => {
    const href = String(anchor.getAttribute('href') || '').trim();
    const text = String(anchor.textContent || '').trim();
    if (!text || isLikelyUrlText(text) || isLikelyUrlText(href)) {
      anchor.remove();
      return;
    }
    anchor.replaceWith(document.createTextNode(text));
  });
  wrapper.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  wrapper.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, tr').forEach((node) => {
    node.appendChild(document.createTextNode('\n'));
  });

  const rawText = String(wrapper.innerText || wrapper.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ');
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  const normalizedLines = lines.map((line) => normalizeVietnameseText(line).replace(/\s+/g, ' ').trim());
  const contentHeaderIndex = normalizedLines.findIndex((line) => /^noi dung buoi hoc\b/.test(line));
  const startIndex = contentHeaderIndex >= 0 ? contentHeaderIndex + 1 : 0;

  const stopPatterns = [
    /^link\b/,
    /^link lam bai\b/,
    /^bai tap ve nha\b/,
    /^trong truong hop\b/,
    /^neu co\b/,
    /^vui long lien he\b/,
    /^lien he\b/,
    /^cam on\b/,
    /^xin cam on\b/
  ];

  const extracted = [];
  const extractedSeen = new Set();
  for (let index = startIndex; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const normalized = normalizedLines[index];
    if (!normalized) continue;

    if (stopPatterns.some((pattern) => pattern.test(normalized))) break;
    if (isLikelyUrlText(rawLine)) continue;

    const contentLine = rawLine.replace(/^[-*\d\s.)]+/, '').trim();
    if (!contentLine) continue;
    if (shouldDropLessonLine(contentLine)) continue;

    const key = normalizeVietnameseText(contentLine).replace(/\s+/g, ' ').trim();
    if (!key || extractedSeen.has(key)) continue;
    extractedSeen.add(key);
    extracted.push(contentLine);

    if (extracted.length >= 3) break;
  }

  if (extracted.length) return extracted.join('\n').trim();

  const cleaned = [];
  const seen = new Set();
  lines.forEach((line) => {
    if (shouldDropLessonLine(line)) return;
    const key = normalizeVietnameseText(line).replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    cleaned.push(line.replace(/^[-*\d\s.)]+/, '').trim());
  });

  if (cleaned.length) return cleaned.slice(0, 3).join('\n').trim();
  return lines.filter((line) => !isLikelyUrlText(line)).join('\n').trim();
}

function isTemplateMatchLesson(templateTitle, subject, course, lesson) {
  const normalizedTitle = normalizeVietnameseText(templateTitle).replace(/\s+/g, ' ').trim();
  if (!normalizedTitle) return false;

  const normalizedSubject = normalizeVietnameseText(subject).trim();
  const normalizedCourse = normalizeVietnameseText(course).trim();
  const lessonNumber = Number.parseInt(lesson, 10);
  if (!normalizedCourse || !Number.isFinite(lessonNumber)) return false;

  if (normalizedTitle === `${normalizedSubject} - ${normalizedCourse} - buoi ${lessonNumber}`) return true;
  if (normalizedTitle === `${normalizedCourse} buoi ${lessonNumber}`) return true;
  if (normalizedTitle === `${normalizedCourse} - buoi ${lessonNumber}`) return true;

  const courseRegex = new RegExp(`\\b${escapeRegExp(normalizedCourse)}\\b`, 'i');
  if (!courseRegex.test(normalizedTitle)) return false;

  const lessonRegex = new RegExp(`(?:\\bbuoi\\b|\\bb\\b)\\s*0?${lessonNumber}(?!\\d)`, 'i');
  if (lessonRegex.test(normalizedTitle)) return true;

  const numericTokenRegex = new RegExp(`(?:^|\\D)0?${lessonNumber}(?:\\D|$)`, 'i');
  if (!numericTokenRegex.test(normalizedTitle)) return false;

  if (normalizedSubject) {
    const subjectRegex = new RegExp(`\\b${escapeRegExp(normalizedSubject)}\\b`, 'i');
    if (subjectRegex.test(normalizedTitle)) return true;
  }

  return true;
}

async function fetchBulkLessonContentFromApi(subject, course, lesson) {
  const apiUrl = COURSE_API_BY_SUBJECT[subject];
  if (!apiUrl) {
    throw new Error(`Khong tim thay API cho mon ${subject}`);
  }

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`API loi (${response.status})`);
  }

  const payload = await response.json();
  const templates = Array.isArray(payload) ? payload : [];
  const matchedCandidates = templates.filter((item) => isTemplateMatchLesson(item?.title, subject, course, lesson));
  const preferred = matchedCandidates.find((item) => {
    const title = normalizeVietnameseText(item?.title).replace(/\s+/g, ' ').trim();
    const exactA = `${normalizeVietnameseText(subject)} - ${normalizeVietnameseText(course)} - buoi ${Number.parseInt(lesson, 10)}`;
    const exactB = `${normalizeVietnameseText(course)} - buoi ${Number.parseInt(lesson, 10)}`;
    return title === exactA || title === exactB;
  });
  const matched = preferred || matchedCandidates[0];
  if (!matched) {
    throw new Error(`Khong tim thay noi dung cho ${course} - Buoi ${lesson}`);
  }

  const cleanText = cleanLessonContentHtml(matched.content || '');
  if (!cleanText) {
    throw new Error('Noi dung bai hoc rong sau khi loc');
  }

  return {
    title: String(matched.title || `${subject} - ${course} - Buoi ${lesson}`),
    text: cleanText
  };
}

async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value.trim()) return false;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy command failed');
  return true;
}

ensureBulkLessonPickerState();

function normalizeProviderType(value) {
  return String(value || '').toLowerCase() === 'other' ? 'other' : 'google';
}

function sanitizeAiProviders(rawProviders) {
  if (!Array.isArray(rawProviders)) return [];

  return rawProviders
    .map((provider, index) => {
      const providerType = normalizeProviderType(provider?.provider);
      const apiKey = String(provider?.apiKey || '').trim();
      if (!apiKey) return null;

      const model = providerType === 'other'
        ? String(provider?.model || '').trim()
        : '';
      if (providerType === 'other' && !model) return null;

      return {
        id: String(provider?.id || `provider-${index + 1}`),
        provider: providerType,
        name: String(provider?.name || '').trim(),
        apiKey,
        model
      };
    })
    .filter(Boolean);
}

function resetExhaustedAiIfNewDate() {
  const todayKey = getLocalDateKey();
  if (todayKey !== exhaustedAiDateKey) {
    exhaustedAiCandidates.clear();
    exhaustedAiDateKey = todayKey;
  }
}

chrome.storage.local.get(['isExtensionEnabled', 'pasteKey', 'toggleKey', 'searchKey', 'geminiApiKey', 'aiModel', 'aiProviders', 'autoTickScores', 'aiPrompt', 'customTags'], (result) => {
  isExtensionEnabled = result.isExtensionEnabled !== false;
  if (result.pasteKey) pasteKey = result.pasteKey;
  if (result.toggleKey) toggleKey = result.toggleKey;
  if (result.searchKey) searchKey = result.searchKey;
  if (result.geminiApiKey) geminiApiKey = result.geminiApiKey;
  if (result.aiModel) currentAiModel = result.aiModel;
  aiProviders = sanitizeAiProviders(result.aiProviders);
  if (result.aiPrompt) userAiPrompt = result.aiPrompt;
  if (result.autoTickScores) {
    autoTickScores = { gioi: parseScoreString(result.autoTickScores.gioi), kha: parseScoreString(result.autoTickScores.kha), tb: parseScoreString(result.autoTickScores.tb) };
  }
  savedBulkTags = sanitizeTagList(result.customTags);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.isExtensionEnabled) {
      isExtensionEnabled = changes.isExtensionEnabled.newValue;
      scheduleEvaluationPanelRefresh();
    }
    if (changes.pasteKey) pasteKey = changes.pasteKey.newValue;
    if (changes.toggleKey) toggleKey = changes.toggleKey.newValue;
    if (changes.searchKey) searchKey = changes.searchKey.newValue;
    if (changes.geminiApiKey) geminiApiKey = changes.geminiApiKey.newValue;
    if (changes.aiModel) currentAiModel = changes.aiModel.newValue;
    if (changes.aiProviders) {
      aiProviders = sanitizeAiProviders(changes.aiProviders.newValue);
      exhaustedAiCandidates.clear();
      exhaustedAiDateKey = getLocalDateKey();
    }
    if (changes.aiPrompt) userAiPrompt = changes.aiPrompt.newValue;
    if (changes.autoTickScores) {
      autoTickScores = { gioi: parseScoreString(changes.autoTickScores.newValue.gioi), kha: parseScoreString(changes.autoTickScores.newValue.kha), tb: parseScoreString(changes.autoTickScores.newValue.tb) };
    }
    if (changes.customTags) {
      savedBulkTags = sanitizeTagList(changes.customTags.newValue);
      rerenderBulkTagsUI();
    }
  }
});

function getCurrentKeyCombo(e) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;
  let keys = [];
  if (e.ctrlKey) keys.push('Ctrl'); if (e.altKey) keys.push('Alt'); if (e.shiftKey) keys.push('Shift');
  keys.push(e.key === ' ' ? 'Space' : e.key.toUpperCase());
  return keys.join('+');
}

function formatForZalo(html) {
  if (!html) return '';
  return html.replace(/<p[^>]*>/gi, '<div>').replace(/<\/p>/gi, '</div>').replace(/<strong[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>').replace(/<em[^>]*>/gi, '<i>').replace(/<\/em>/gi, '</i>');
}

document.addEventListener('selectionchange', () => {
  const activeEl = document.activeElement;
  if (!activeEl) return;
  
  if (activeEl.closest('#acp-search-modal') || activeEl.closest('#acp-eval-panel')) return;

  if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable || activeEl.classList.contains('ql-editor')) {
    lastActiveInput = activeEl;
    const sel = window.getSelection();
    if (sel.rangeCount > 0) lastSavedRange = sel.getRangeAt(0).cloneRange();
  }
});

document.addEventListener('mouseup', () => {
  if (!isExtensionEnabled) return;
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    try {
      document.execCommand('copy');
      chrome.runtime.sendMessage({ type: "NEW_COPY", text: selectedText }, () => { if (chrome.runtime.lastError) {} });
    } catch (err) {}
  }
});

document.addEventListener('keydown', async (e) => {
  const pressedCombo = getCurrentKeyCombo(e);
  if (!pressedCombo) return;

  if (toggleKey && pressedCombo === toggleKey) {
    e.preventDefault(); 
    const newState = !isExtensionEnabled;
    chrome.storage.local.set({ isExtensionEnabled: newState }, () => showNotificationToast(newState));
    return; 
  }

  if (searchKey && pressedCombo === searchKey && isExtensionEnabled) {
    e.preventDefault(); 
    openTreeModal(); 
    return;
  }
});

function showNotificationToast(msg) {
  const existingToast = document.getElementById('autoCopyPasteToast');
  if (existingToast) existingToast.remove();
  const toast = document.createElement('div'); toast.id = 'autoCopyPasteToast';
  toast.textContent = msg === true ? 'Auto Copy: ĐANG BẬT' : (msg === false ? 'Auto Copy: ĐÃ TẮT' : msg);
  toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; background-color: #4CAF50; color: white; padding: 12px 24px; border-radius: 8px; font-family: Arial; font-size: 14px; font-weight: bold; z-index: 2147483647; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s; pointer-events: none;`;
  if(msg === false) toast.style.backgroundColor = '#F44336';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2000);
}

// ===============================================
// MODULE: BẢNG CHỌN CÂY THƯ MỤC
// ===============================================
async function openTreeModal() {
  let modal = document.getElementById('acp-search-modal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'acp-search-modal';
    modal.style.cssText = `position: fixed; top: 10%; left: 50%; transform: translateX(-50%); width: 500px; max-width: 90%; background: #fff; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 2147483647; font-family: Arial, sans-serif; overflow: hidden; display: none; flex-direction: column; border: 1px solid #ccc; max-height: 80vh;`;
    
    const style = document.createElement('style');
    style.textContent = `
      .acp-tree-container { padding: 15px; overflow-y: auto; max-height: 65vh; background: #fdfdfd; }
      .acp-tree-details { margin-bottom: 5px; }
      .acp-tree-summary { font-weight: bold; cursor: pointer; padding: 10px; background: #eef2f5; border-radius: 4px; border: 1px solid #dee2e6; outline: none; transition: 0.2s; display: block; font-size: 14px;}
      .acp-tree-summary:hover { background: #e2e6ea; }
      .acp-crs-summary { margin-left: 15px; background: #fff; font-size: 14px; border-left: 3px solid #0056b3;}
      .acp-tree-content { margin-left: 20px; padding-left: 10px; border-left: 1px dashed #ccc; }
      .acp-tree-item { padding: 10px 10px; border-bottom: 1px dashed #eee; display: flex; justify-content: space-between; align-items: center; font-size: 13px; transition: 0.2s; }
      .acp-tree-item.has-data { cursor: pointer; color: #0056b3; font-weight: bold; }
      .acp-tree-item.has-data:hover { background: #e9ecef; border-left: 3px solid #0056b3; }
      .acp-tree-item.no-data { color: #999; cursor: not-allowed; }
      .acp-badge { font-size: 11px; padding: 4px 8px; border-radius: 12px; font-weight: normal; }
      .acp-badge.has-data { background: #d4edda; color: #155724; }
      .acp-badge.no-data { background: #f8d7da; color: #721c24; }
    `;

    modal.innerHTML = `
      <div style="background: #0056b3; color: white; padding: 15px; font-weight: bold; font-size: 16px; text-align: center;">
        📌 Chọn Báo Cáo Để Chèn (Zalo)
      </div>
      <div id="acp-tree-root" class="acp-tree-container"></div>
      <div style="font-size:11px; color:#888; text-align:center; padding:10px; background:#fff; border-top:1px solid #eee;">Bấm Esc hoặc click ra ngoài để đóng</div>
    `;
    modal.appendChild(style);
    document.body.appendChild(modal);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTreeModal(); });
    document.addEventListener('click', (e) => { if (!modal.contains(e.target) && modal.style.display === 'flex') closeTreeModal(); });
    
    ['mousedown', 'mouseup', 'click', 'keydown', 'focusin'].forEach(evt => {
      modal.addEventListener(evt, (e) => e.stopPropagation());
    });
  }
  
  modal.style.display = 'flex'; 
  const rootEl = document.getElementById('acp-tree-root');
  rootEl.innerHTML = '<div style="text-align:center; padding:30px; color:#666; font-weight:bold;">⏳ Đang kéo dữ liệu từ Cloud...</div>';

  try {
    const requests = CLOUD_APIS.map((url) =>
      fetch(url)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) return data.map((item) => ({ ...item, _apiOrigin: url }));
          return [];
        })
        .catch(() => [])
    );
    const results = await Promise.all(requests);
    templates = results.flat().filter(t => t && t.id); 
    renderTreeInsideModal();
  } catch (e) { 
    rootEl.innerHTML = '<div style="text-align:center; padding:30px; color:red;">❌ Lỗi đồng bộ. Hãy thử lại!</div>';
  }
}

function closeTreeModal() {
  const modal = document.getElementById('acp-search-modal');
  if (modal) modal.style.display = 'none'; 
}

function renderTreeInsideModal() {
  const rootEl = document.getElementById('acp-tree-root');
  if (!rootEl) return;

  let html = '';
  for (const [subject, data] of Object.entries(COURSE_TREE)) {
    html += `<details class="acp-tree-details"><summary class="acp-tree-summary">📁 Môn ${subject}</summary><div class="acp-tree-content">`;
    for (const course of data.courses) {
      html += `<details class="acp-tree-details"><summary class="acp-tree-summary acp-crs-summary">🎓 Khóa ${course}</summary><div class="acp-tree-content">`;
      for (let i = 1; i <= 14; i++) {
        const expectedTitle = `${subject} - ${course} - Buổi ${i}`;
        const targetApi = COURSE_API_BY_SUBJECT[subject];
        
        const t = templates.find(x => {
          if (!x.title) return false;
          if (targetApi && x._apiOrigin && x._apiOrigin !== targetApi) return false;
          const titleClean = x.title.trim().toLowerCase();
          const expectedClean = expectedTitle.toLowerCase();
          const courseClean = course.toLowerCase();
          
          if (titleClean === expectedClean) return true;
          if (titleClean === `${courseClean} buổi ${i}`) return true;
          if (titleClean === `${courseClean} - buổi ${i}`) return true;
          
          const regex = new RegExp(`\\b${courseClean}\\b.*(?:buổi|buoi|b)\\s*0?${i}(?!\\d)`, 'i');
          return regex.test(titleClean);
        });

        if (t) {
          html += `<div class="acp-tree-item has-data" data-id="${t.id}" data-api="${escapeHtml(t._apiOrigin || '')}">
                      Buổi ${i} <span class="acp-badge has-data">✔️ Bấm để chèn</span>
                   </div>`;
        } else {
          html += `<div class="acp-tree-item no-data">
                      Buổi ${i} <span class="acp-badge no-data">Trống</span>
                   </div>`;
        }
      }
      html += `</div></details>`;
    }
    html += `</div></details>`;
  }
  rootEl.innerHTML = html;

  rootEl.querySelectorAll('.acp-tree-item.has-data').forEach(item => {
    item.addEventListener('click', async function() {
      const id = this.getAttribute('data-id');
      const apiOrigin = this.getAttribute('data-api');
      const targetTemplate = templates.find(x => x.id === id && (!apiOrigin || x._apiOrigin === apiOrigin));
      if (targetTemplate) await executeAutoPaste(targetTemplate);
    });
  });
}

async function executeAutoPaste(t) {
  try {
    const tempDiv = document.createElement('div'); tempDiv.innerHTML = t.content;
    const safeZaloHtml = formatForZalo(t.content);
    const blobHtml = new Blob([safeZaloHtml], { type: 'text/html' });
    const blobText = new Blob([tempDiv.innerText], { type: 'text/plain' });
    const clipboardItem = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });
    
    await navigator.clipboard.write([clipboardItem]);
    closeTreeModal();

    if (lastActiveInput) {
      lastActiveInput.focus();
      
      if (lastSavedRange && (lastActiveInput.isContentEditable || lastActiveInput.classList.contains('ql-editor'))) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(lastSavedRange);
      }

      const dt = new DataTransfer();
      dt.setData('text/html', safeZaloHtml);
      dt.setData('text/plain', tempDiv.innerText);

      const pasteEvent = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      const isCancelled = !lastActiveInput.dispatchEvent(pasteEvent);

      if (!isCancelled) {
         if (lastActiveInput.isContentEditable || lastActiveInput.classList.contains('ql-editor')) {
            document.execCommand('insertHTML', false, safeZaloHtml);
         } else {
            document.execCommand('insertText', false, tempDiv.innerText);
         }
      }
      lastActiveInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      showNotificationToast('✨ Đã tự động chèn: ' + t.title); 
    } else {
      showNotificationToast('Đã Copy, ấn Ctrl+V để dán'); 
    }
  } catch (err) { 
    showNotificationToast('Đã Copy (Text thường). Bạn hãy dán!'); closeTreeModal();
  }
}


const evaluationObserver = new MutationObserver(() => scheduleEvaluationPanelRefresh());
evaluationObserver.observe(document.body, { childList: true, subtree: true });
setTimeout(scheduleEvaluationPanelRefresh, 1500);

function isElementVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return el.getClientRects().length > 0;
}

function getVisibleEvaluationRadios() {
  return Array.from(document.querySelectorAll('input[type="radio"]')).filter(isElementVisible);
}

function getVisibleQuillEditors() {
  return Array.from(document.querySelectorAll('.ql-editor')).filter(isElementVisible);
}

function ensureDialogIdentity(dialog) {
  if (!(dialog instanceof HTMLElement)) return 'page-root';
  if (!dialog.dataset.acpDialogId) {
    evalDialogCounter += 1;
    dialog.dataset.acpDialogId = `acp-dialog-${evalDialogCounter}`;
  }
  return dialog.dataset.acpDialogId;
}

function getEvaluationContext() {
  const radios = getVisibleEvaluationRadios();
  const editors = getVisibleQuillEditors();
  if (radios.length < ACP_MIN_RADIO_COUNT || editors.length === 0) return null;

  const anchorEditor = editors[editors.length - 1];
  const dialog = anchorEditor.closest('[role="dialog"]');
  const container = dialog || document.body;
  const dialogId = ensureDialogIdentity(dialog);
  const key = `${location.pathname}|${dialogId}|r${radios.length}|e${editors.length}`;
  return { radios, editors, container, key };
}

function getEvaluationPanel() {
  return document.getElementById(ACP_EVAL_PANEL_ID);
}

function getEvaluationReopenButton() {
  return document.getElementById(ACP_EVAL_REOPEN_ID);
}

function hideEvaluationReopenButton() {
  const reopen = getEvaluationReopenButton();
  if (reopen) reopen.remove();
}

function showEvaluationReopenButton() {
  if (getEvaluationReopenButton()) return;

  const reopen = document.createElement('button');
  reopen.id = ACP_EVAL_REOPEN_ID;
  reopen.type = 'button';
  reopen.textContent = 'Mo Auto Tick';
  reopen.style.cssText = `position: fixed; right: 20px; bottom: 24px; z-index: 2147483647; border: 1px solid #0f4db8; background: #1a73e8; color: #fff; border-radius: 999px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 20px rgba(26,115,232,0.35);`;
  reopen.addEventListener('click', () => {
    const panel = getEvaluationPanel();
    if (!panel) {
      scheduleEvaluationPanelRefresh();
      return;
    }
    panel.dataset.closed = '0';
    panel.style.display = 'block';
    hideEvaluationReopenButton();
  });
  document.body.appendChild(reopen);
}

function closeEvaluationPanel(panel) {
  if (!panel) return;
  panel.dataset.closed = '1';
  panel.dataset.closedContext = panel.dataset.contextKey || '';
  panel.style.display = 'none';
  showEvaluationReopenButton();
}

function buildEvaluationPanel(contextKey) {
  const panel = document.createElement('div');
  panel.id = ACP_EVAL_PANEL_ID;
  panel.dataset.contextKey = contextKey;
  panel.dataset.closed = '0';
  panel.style.cssText = `position: fixed; top: 80px; right: 20px; width: min(320px, calc(100vw - 40px)); background: #ffffff; border-radius: 10px; box-shadow: 0 8px 25px rgba(0,0,0,0.15); z-index: 2147483647; padding: 14px; font-family: Arial, sans-serif; border: 1px solid #e0e0e0;`;
  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:10px;">
      <h4 style="margin:0; color:#1a73e8; font-size:15px;">Auto Tick Diem LMS</h4>
      <button id="acp-eval-close" type="button" style="background:transparent; border:none; color:#6b7280; font-size:12px; cursor:pointer;">Dong</button>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:15px;">
      <button id="btn-gioi" type="button" style="flex:1; background:#28a745; color:#fff; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold;">Gioi</button>
      <button id="btn-kha" type="button" style="flex:1; background:#f6c000; color:#111; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold;">Kha</button>
      <button id="btn-tb" type="button" style="flex:1; background:#dc3545; color:#fff; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold;">TB</button>
    </div>
    <div style="border-top:1px solid #eee; padding-top:12px;">
      <label style="font-size:12px; font-weight:bold; color:#555;">Tao nhan xet chung (AI):</label>
      <input type="text" id="ai-keywords" placeholder="VD: hieu bai, lam game nhanh..." style="width:100%; padding:10px; margin-top:4px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; outline:none; font-size:13px; color:#333;">
      <button id="btn-gen-ai" type="button" style="width:100%; background:#1a73e8; color:#fff; border:none; padding:10px; border-radius:6px; cursor:pointer; margin-top:10px; font-weight:bold; transition:0.2s;">Nho AI viet nhan xet</button>
    </div>
  `;

  ['mousedown', 'mouseup', 'click', 'keydown', 'focusin'].forEach((evt) => {
    panel.addEventListener(evt, (e) => e.stopPropagation());
  });

  panel.querySelector('#acp-eval-close').addEventListener('click', () => closeEvaluationPanel(panel));
  panel.querySelector('#btn-gioi').addEventListener('click', () => fillReactScores('gioi'));
  panel.querySelector('#btn-kha').addEventListener('click', () => fillReactScores('kha'));
  panel.querySelector('#btn-tb').addEventListener('click', () => fillReactScores('tb'));
  panel.querySelector('#btn-gen-ai').addEventListener('click', generateAIComment);

  return panel;
}

function scheduleEvaluationPanelRefresh() {
  if (evalRefreshScheduled) return;
  evalRefreshScheduled = true;
  window.requestAnimationFrame(() => {
    evalRefreshScheduled = false;
    injectEvaluationPanel();
  });
}

function injectEvaluationPanel() {
  const panel = getEvaluationPanel();

  if (!isExtensionEnabled) {
    if (panel) panel.remove();
    hideEvaluationReopenButton();
    return;
  }

  const context = getEvaluationContext();
  if (!context) {
    if (panel) panel.remove();
    hideEvaluationReopenButton();
    return;
  }

  if (!panel) {
    const createdPanel = buildEvaluationPanel(context.key);
    context.container.appendChild(createdPanel);
    hideEvaluationReopenButton();
    return;
  }

  if (panel.parentElement !== context.container) {
    context.container.appendChild(panel);
  }

  panel.dataset.contextKey = context.key;
  if (panel.dataset.closed === '1') {
    if (panel.dataset.closedContext !== context.key) {
      panel.dataset.closed = '0';
      panel.style.display = 'block';
      hideEvaluationReopenButton();
    } else {
      showEvaluationReopenButton();
    }
    return;
  }

  panel.style.display = 'block';
  hideEvaluationReopenButton();
}

function getWeightedRandomScore(level) {
  const buckets = {
    gioi: [
      { score: 4, weight: 35 },
      { score: 5, weight: 65 }
    ],
    kha: [
      { score: 3, weight: 45 },
      { score: 4, weight: 45 },
      { score: 5, weight: 10 }
    ],
    tb: [
      { score: 3, weight: 78 },
      { score: 4, weight: 22 }
    ]
  };

  const profile = buckets[level] || buckets.tb;
  const totalWeight = profile.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of profile) {
    roll -= item.weight;
    if (roll <= 0) return item.score;
  }
  return profile[profile.length - 1].score;
}

function generateRandomScorePattern(level, criteriaCount) {
  const count = Math.max(0, Number(criteriaCount) || 0);
  return Array.from({ length: count }, () => getWeightedRandomScore(level));
}

function fillReactScores(level) {
  const context = getEvaluationContext();
  const allRadios = context ? context.radios : getVisibleEvaluationRadios();
  const pointsPerCriteria = 5;
  const criteriaCount = Math.floor(allRadios.length / pointsPerCriteria);

  if (criteriaCount <= 0) {
    showNotificationToast('Khong tim thay bang diem de auto tick');
    return;
  }

  const scoresArray = generateRandomScorePattern(level, criteriaCount);
  for (let i = 0; i < scoresArray.length; i++) {
    const targetIndex = (i * pointsPerCriteria) + (scoresArray[i] - 1);
    if (allRadios[targetIndex]) allRadios[targetIndex].click();
  }
  showNotificationToast(`Da tick ${level.toUpperCase()}: ${scoresArray.join('-')}`);
}

function buildAiCandidates() {
  resetExhaustedAiIfNewDate();

  const sourceProviders = aiProviders.length
    ? aiProviders
    : (geminiApiKey ? [{ id: 'legacy-google', provider: 'google', name: 'Google Legacy', apiKey: geminiApiKey, model: '' }] : []);

  const candidates = [];
  sourceProviders.forEach((provider, providerIndex) => {
    const providerType = normalizeProviderType(provider.provider);
    const providerId = provider.id || `provider-${providerIndex + 1}`;
    const providerName = provider.name || (providerType === 'google' ? 'Google Gemini' : 'Other Provider');
    const apiKey = String(provider.apiKey || '').trim();
    if (!apiKey) return;

    if (providerType === 'google') {
      GOOGLE_PROVIDER_MODELS.forEach((modelName) => {
        const candidateId = `${providerId}|${modelName}`;
        if (exhaustedAiCandidates.has(candidateId)) return;
        candidates.push({
          id: candidateId,
          provider: 'google',
          providerName,
          apiKey,
          model: modelName
        });
      });
      return;
    }

    const customModel = String(provider.model || '').trim();
    if (!customModel) return;

    const candidateId = `${providerId}|${customModel}`;
    if (exhaustedAiCandidates.has(candidateId)) return;
    candidates.push({
      id: candidateId,
      provider: 'other',
      providerName,
      apiKey,
      model: customModel
    });
  });

  return candidates;
}

function isDailyQuotaError(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  const quotaTokens = ['quota', 'exhaust', 'limit', '429', 'rate limit', 'insufficient', 'ran out', 'token'];
  const dailyTokens = ['daily', 'day', 'today', '24h', 'per day'];
  const hasQuotaSignal = quotaTokens.some((token) => text.includes(token));
  const hasDailySignal = dailyTokens.some((token) => text.includes(token));

  if (hasQuotaSignal && hasDailySignal) return true;
  if (text.includes('resource has been exhausted')) return true;
  if (text.includes('insufficient_quota')) return true;
  return false;
}

function isTransientAiError(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  const transientTokens = [
    '429', '503', '504', 'rate limit', 'unavailable', 'temporar',
    'timeout', 'try again', 'connection', 'network', 'overloaded'
  ];
  return transientTokens.some((token) => text.includes(token));
}

async function waitForAiWindow(minIntervalMs) {
  const gap = Math.max(0, Number(minIntervalMs) || 0);
  if (!gap) return;
  const elapsed = Date.now() - lastAiRequestAt;
  if (elapsed < gap) {
    await sleep(gap - elapsed);
  }
}

async function requestAiTextWithFallback(basePayload, options = {}) {
  const {
    minIntervalMs = 0,
    maxRetriesPerCandidate = 1,
    retryDelayMs = 0
  } = options;

  const aiCandidates = buildAiCandidates();
  if (!aiCandidates.length) {
    throw new Error('Chua co API key/model kha dung. Vao Options de cau hinh AI Provider.');
  }

  let lastError = null;

  for (const candidate of aiCandidates) {
    const payload = {
      ...basePayload,
      model: candidate.model,
      api_key: candidate.apiKey,
      provider: candidate.provider
    };

    for (let attempt = 1; attempt <= Math.max(1, maxRetriesPerCandidate); attempt++) {
      try {
        await waitForAiWindow(minIntervalMs);
        lastAiRequestAt = Date.now();

        const response = await fetch(WEB_APP_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        let data = null;
        try {
          data = await response.json();
        } catch (jsonError) {
          data = { status: 'error', message: `Invalid JSON response (${response.status})` };
        }

        if (!response.ok) {
          const httpError = data?.message || `HTTP ${response.status}`;
          throw new Error(httpError);
        }

        if (data?.status === 'error') {
          throw new Error(data.message || 'Unknown AI error');
        }

        return {
          aiText: String(data?.data || '').trim(),
          candidate
        };
      } catch (candidateError) {
        lastError = candidateError;
        const errorMessage = String(candidateError?.message || '');

        if (isDailyQuotaError(errorMessage)) {
          exhaustedAiCandidates.add(candidate.id);
          break;
        }

        const shouldRetryTransient = isTransientAiError(errorMessage) && attempt < maxRetriesPerCandidate;
        if (shouldRetryTransient) {
          if (retryDelayMs > 0) await sleep(retryDelayMs);
          continue;
        }
        break;
      }
    }
  }

  const remainingCandidates = buildAiCandidates();
  if (!remainingCandidates.length) {
    throw new Error('Tat ca key/model hien da het quota trong ngay. Hay doi reset quota hoac them key moi.');
  }
  if (lastError) throw lastError;
  throw new Error('Khong co candidate AI nao tra ve ket qua.');
}

async function generateAIComment() {
  const keywordInput = document.getElementById('ai-keywords');
  const btn = document.getElementById('btn-gen-ai');
  if (!keywordInput || !btn) return;

  const keywords = keywordInput.value.trim();
  if (!keywords) return alert("Vui long nhap tu khoa de AI nhan xet!");

  btn.innerHTML = "Dang goi Web App...";
  btn.style.opacity = '0.7';
  btn.disabled = true;

  const defaultPrompt = `Ban la giao vien day lap trinh than thien. Dua vao tu khoa: "${keywords}". Viet thanh 3 y: Diem manh, Diem can cai thien, Loi khuyen.`;
  const finalPromptText = userAiPrompt ? userAiPrompt.replace('{keywords}', keywords) : defaultPrompt;

  const context = getEvaluationContext();
  const allRadios = context ? context.radios : getVisibleEvaluationRadios();
  const currentScores = [];
  allRadios.forEach((radio, index) => {
    if (radio.checked) currentScores.push((index % 5) + 1);
  });
  const scoresString = currentScores.length > 0 ? currentScores.join(", ") : "Chua cham diem";
  const basePayload = {
    prompt: finalPromptText,
    keywords: keywords,
    scores: scoresString,
    raw_html: document.documentElement.outerHTML
  };

  try {
    const aiResult = await requestAiTextWithFallback(basePayload, {
      minIntervalMs: 800,
      maxRetriesPerCandidate: 1,
      retryDelayMs: 0
    });
    const aiText = aiResult.aiText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const quillEditors = context ? context.editors : getVisibleQuillEditors();
    if (quillEditors.length > 0) {
      const finalCommentBox = quillEditors[quillEditors.length - 1];
      finalCommentBox.focus();
      document.execCommand('insertHTML', false, aiText.replace(/\n/g, '<br>'));
      keywordInput.value = '';
      showNotificationToast(`AI thanh cong (${aiResult.candidate.model})`);
    } else {
      alert("Khong tim thay o nhan xet Danh gia chung!\n\nAI:\n" + aiText);
    }
  } catch (error) {
    alert("Loi goi AI.\nChi tiet: " + error.message);
  } finally {
    btn.innerHTML = "Nho AI viet nhan xet";
    btn.style.opacity = '1';
    btn.disabled = false;
  }
}

document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('.ql-editor, input[type="radio"]') || target.closest('.ql-editor')) {
    scheduleEvaluationPanelRefresh();
  }
  if (target.matches('.name-display, button, textarea') || target.closest('tr')) {
    scheduleBulkPanelRefresh();
  }
}, true);

function getBulkPanel() {
  return document.getElementById(ACP_BULK_PANEL_ID);
}

function getBulkStudentHash(students) {
  return students.map((student) => student.name).join('|');
}

function getStudentsForBulkPanel() {
  const students = [];

  document.querySelectorAll('tr').forEach((row, rowIndex) => {
    const nameEl = row.querySelector('.name-display');
    if (!nameEl) return;

    const actionButton = Array.from(row.querySelectorAll('button')).find((button) => {
      const text = normalizeVietnameseText(button?.innerText || button?.textContent || '');
      return text.includes('nhan xet hoc sinh');
    });
    if (!actionButton) return;

    const name = String(nameEl.textContent || '').trim();
    if (!name) return;

    students.push({
      key: `${rowIndex}|${name}`,
      name
    });
  });

  return students;
}

function findBulkStudentActionButton(student) {
  let byExactKey = null;
  let byName = null;

  const rows = Array.from(document.querySelectorAll('tr'));
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const nameEl = row.querySelector('.name-display');
    if (!nameEl) continue;

    const actionButton = Array.from(row.querySelectorAll('button')).find((button) => {
      const text = normalizeVietnameseText(button?.innerText || button?.textContent || '');
      return text.includes('nhan xet hoc sinh');
    });
    if (!actionButton || actionButton.disabled) continue;

    const name = String(nameEl.textContent || '').trim();
    const key = `${rowIndex}|${name}`;
    if (!byName && name === student.name) {
      byName = actionButton;
    }
    if (student.key && key === student.key) {
      byExactKey = actionButton;
      break;
    }
  }

  return byExactKey || byName;
}

function hideBulkPanel() {
  const panel = getBulkPanel();
  if (panel) panel.style.display = 'none';
}

function snapshotBulkKeywordDrafts() {
  const panel = getBulkPanel();
  if (!panel) return;

  panel.querySelectorAll('textarea[data-student-key]').forEach((textarea) => {
    const key = textarea.getAttribute('data-student-key');
    if (!key) return;
    bulkKeywordDrafts[key] = textarea.value;
  });

  const lessonContentInput = panel.querySelector('#acp-bulk-lesson-content');
  if (lessonContentInput instanceof HTMLTextAreaElement) {
    bulkLessonContentDraft = lessonContentInput.value;
  }

  const subjectSelect = panel.querySelector('#acp-bulk-subject');
  if (subjectSelect instanceof HTMLSelectElement) {
    bulkLessonPickerState.subject = subjectSelect.value;
  }
  const courseSelect = panel.querySelector('#acp-bulk-course');
  if (courseSelect instanceof HTMLSelectElement) {
    bulkLessonPickerState.course = courseSelect.value;
  }
  const lessonSelect = panel.querySelector('#acp-bulk-lesson');
  if (lessonSelect instanceof HTMLSelectElement) {
    bulkLessonPickerState.lesson = Number.parseInt(lessonSelect.value, 10);
  }
  ensureBulkLessonPickerState();
}

function getBulkTagsHtml(targetId) {
  const chips = savedBulkTags.map((tag) => `
    <span class="acp-bulk-tag-chip" style="display:inline-flex; align-items:center; gap:4px; background:#e6f4ff; border:1px solid #b3daff; border-radius:12px; padding:2px 7px; font-size:11px; color:#0b4f95; margin:2px;">
      <button type="button" data-action="append-tag" data-target-id="${targetId}" data-tag="${escapeHtml(tag)}" style="border:none; background:transparent; color:inherit; cursor:pointer; font-size:11px; padding:0;">${escapeHtml(tag)}</button>
      <button type="button" data-action="remove-tag" data-tag="${escapeHtml(tag)}" style="border:none; background:transparent; color:#c62828; cursor:pointer; font-size:12px; padding:0;">x</button>
    </span>
  `).join('');

  return `
    ${chips}
    <span style="display:inline-flex; gap:5px; margin-left:4px;">
      <button type="button" data-action="add-tag" data-target-id="${targetId}" style="border:1px dashed #9aa5b1; background:#fff; color:#4f5d75; border-radius:10px; padding:2px 8px; font-size:11px; cursor:pointer;">+ Them</button>
      <button type="button" data-action="clear-keyword" data-target-id="${targetId}" style="border:1px dashed #ef9a9a; background:#fff5f5; color:#b71c1c; border-radius:10px; padding:2px 8px; font-size:11px; cursor:pointer;">Xoa trang</button>
    </span>
  `;
}

function rerenderBulkTagsUI() {
  const panel = getBulkPanel();
  if (!panel) return;

  panel.querySelectorAll('.acp-bulk-tags[data-target-id]').forEach((container) => {
    const targetId = container.getAttribute('data-target-id');
    if (!targetId) return;
    container.innerHTML = getBulkTagsHtml(targetId);
  });
}

function upsertBulkTag(tagText) {
  const cleanedTag = String(tagText || '').trim();
  if (!cleanedTag) return;
  if (savedBulkTags.includes(cleanedTag)) return;

  savedBulkTags = sanitizeTagList([...savedBulkTags, cleanedTag]);
  chrome.storage.local.set({ customTags: savedBulkTags }, () => {
    rerenderBulkTagsUI();
  });
}

function removeBulkTag(tagText) {
  const cleanedTag = String(tagText || '').trim();
  if (!cleanedTag) return;

  savedBulkTags = sanitizeTagList(savedBulkTags.filter((tag) => tag !== cleanedTag));
  chrome.storage.local.set({ customTags: savedBulkTags }, () => {
    rerenderBulkTagsUI();
  });
}

function addBulkTagToInput(targetId, tagText) {
  const input = document.getElementById(targetId);
  if (!input) return;

  const current = String(input.value || '').trim();
  const normalized = current
    ? current.split(',').map((part) => part.trim()).filter(Boolean)
    : [];

  if (!normalized.includes(tagText)) {
    normalized.push(tagText);
  }

  input.value = normalized.join(', ');
  input.focus();
  const key = input.getAttribute('data-student-key');
  if (key) bulkKeywordDrafts[key] = input.value;
}

function ensureBulkPanel() {
  let panel = getBulkPanel();
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = ACP_BULK_PANEL_ID;
  panel.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    width: min(420px, calc(100vw - 24px));
    max-height: calc(100vh - 100px);
    overflow: hidden;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.18);
    border: 1px solid #d6dee6;
    z-index: 2147483647;
    font-family: Arial, sans-serif;
  `;

  ['mousedown', 'mouseup', 'click', 'keydown', 'focusin'].forEach((evt) => {
    panel.addEventListener(evt, (event) => event.stopPropagation());
  });

  panel.addEventListener('click', handleBulkPanelClick);
  panel.addEventListener('input', handleBulkPanelInput);
  panel.addEventListener('change', handleBulkPanelChange);

  document.body.appendChild(panel);
  return panel;
}

function handleBulkPanelClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const actionEl = target.closest('[data-action]');
  if (!actionEl) {
    if (target.id === 'acp-bulk-close') {
      const panel = getBulkPanel();
      if (panel) {
        panel.dataset.closedForHash = panel.dataset.studentHash || '';
        panel.style.display = 'none';
      }
      return;
    }
    if (target.id === 'acp-bulk-run') {
      runBulkAutoAll();
    }
    return;
  }

  const action = actionEl.getAttribute('data-action');
  if (!action) return;

  if (action === 'append-tag') {
    const targetId = actionEl.getAttribute('data-target-id');
    const tag = actionEl.getAttribute('data-tag');
    if (targetId && tag) addBulkTagToInput(targetId, tag);
    return;
  }

  if (action === 'remove-tag') {
    const tag = actionEl.getAttribute('data-tag');
    if (!tag) return;
    if (confirm(`Xoa tag "${tag}"?`)) {
      removeBulkTag(tag);
    }
    return;
  }

  if (action === 'add-tag') {
    const targetId = actionEl.getAttribute('data-target-id');
    const newTag = prompt('Nhap tag moi:');
    if (!targetId || !newTag) return;
    const cleaned = String(newTag || '').trim();
    if (!cleaned) return;
    upsertBulkTag(cleaned);
    addBulkTagToInput(targetId, cleaned);
    return;
  }

  if (action === 'clear-keyword') {
    const targetId = actionEl.getAttribute('data-target-id');
    if (!targetId) return;
    const input = document.getElementById(targetId);
    if (!input) return;
    input.value = '';
    const key = input.getAttribute('data-student-key');
    if (key) bulkKeywordDrafts[key] = '';
    input.focus();
    return;
  }

  if (action === 'fetch-lesson-content') {
    fetchAndFillBulkLessonContent();
    return;
  }

  if (action === 'copy-lesson-content') {
    copyBulkLessonContentToClipboard();
  }
}

function handleBulkPanelInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.id === 'acp-bulk-lesson-content') {
    bulkLessonContentDraft = target.value;
    return;
  }
  if (target.matches('textarea[data-student-key]')) {
    const key = target.getAttribute('data-student-key');
    if (!key) return;
    bulkKeywordDrafts[key] = target.value;
  }
}

function handleBulkPanelChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;

  if (target.id === 'acp-bulk-subject') {
    bulkLessonPickerState.subject = target.value;
    const courses = getBulkCourseList(bulkLessonPickerState.subject);
    if (!courses.includes(bulkLessonPickerState.course)) {
      bulkLessonPickerState.course = courses[0] || '';
    }

    const panel = getBulkPanel();
    if (panel) {
      const courseSelect = panel.querySelector('#acp-bulk-course');
      if (courseSelect instanceof HTMLSelectElement) {
        courseSelect.innerHTML = buildSelectOptionsHtml(courses, bulkLessonPickerState.course);
        courseSelect.value = bulkLessonPickerState.course;
      }
    }
    ensureBulkLessonPickerState();
    return;
  }

  if (target.id === 'acp-bulk-course') {
    bulkLessonPickerState.course = target.value;
    ensureBulkLessonPickerState();
    return;
  }

  if (target.id === 'acp-bulk-lesson') {
    bulkLessonPickerState.lesson = Number.parseInt(target.value, 10);
    ensureBulkLessonPickerState();
  }
}

async function fetchAndFillBulkLessonContent(options = {}) {
  const { silent = false } = options;
  snapshotBulkKeywordDrafts();
  ensureBulkLessonPickerState();

  const { subject, course, lesson } = bulkLessonPickerState;
  setBulkLessonStatus(`Dang lay noi dung ${course} - Buoi ${lesson}...`, false);

  try {
    const result = await fetchBulkLessonContentFromApi(subject, course, lesson);
    bulkLessonContentDraft = result.text;

    const panel = getBulkPanel();
    if (panel) {
      const textarea = panel.querySelector('#acp-bulk-lesson-content');
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.value = bulkLessonContentDraft;
      }
    }

    setBulkLessonStatus(`Da lay: ${result.title}`, false);
    if (!silent) showNotificationToast(`Da lay noi dung ${course} - Buoi ${lesson}`);
    return result.text;
  } catch (error) {
    const message = String(error?.message || error || 'Unknown error');
    setBulkLessonStatus(`Loi lay noi dung: ${message}`, true);
    if (!silent) showNotificationToast(`Loi lay noi dung bai hoc: ${message}`);
    throw error;
  }
}

async function copyBulkLessonContentToClipboard() {
  snapshotBulkKeywordDrafts();
  const value = String(bulkLessonContentDraft || '').trim();
  if (!value) {
    setBulkLessonStatus('Chua co noi dung de copy.', true);
    showNotificationToast('Chua co noi dung bai hoc de copy');
    return;
  }

  try {
    await copyTextToClipboard(value);
    setBulkLessonStatus('Da copy noi dung bai hoc vao clipboard.', false);
    showNotificationToast('Da copy noi dung bai hoc');
  } catch (error) {
    const message = String(error?.message || error || 'Unknown error');
    setBulkLessonStatus(`Khong copy duoc: ${message}`, true);
    showNotificationToast(`Khong copy duoc: ${message}`);
  }
}

function renderBulkStudentPanel(students) {
  snapshotBulkKeywordDrafts();
  ensureBulkLessonPickerState();
  const panel = ensureBulkPanel();
  const studentHash = getBulkStudentHash(students);
  const lessonContentValue = escapeHtml(bulkLessonContentDraft || '');
  const subjectOptionsHtml = buildSelectOptionsHtml(getBulkSubjectList(), bulkLessonPickerState.subject);
  const courseOptionsHtml = buildSelectOptionsHtml(getBulkCourseList(bulkLessonPickerState.subject), bulkLessonPickerState.course);
  const lessonOptionsHtml = buildLessonOptionsHtml(bulkLessonPickerState.lesson);
  const lessonStatusColor = getBulkLessonStatusColor();
  const lessonStatusText = escapeHtml(bulkLessonStatusText || '...');

  panel.dataset.studentHash = studentHash;
  panel.dataset.closedForHash = '';
  panel.style.display = 'block';

  const rowsHtml = students.map((student, index) => {
    const inputId = `acp-bulk-kw-${index}`;
    const currentValue = escapeHtml(bulkKeywordDrafts[student.key] || '');
    return `
      <div style="padding:10px; border:1px solid #eef1f4; border-radius:8px; background:#fafbfc; margin-bottom:10px;">
        <div style="font-size:13px; font-weight:700; color:#1a73e8; margin-bottom:6px;">${escapeHtml(student.name)}</div>
        <textarea id="${inputId}" data-student-key="${escapeHtml(student.key)}" placeholder="Nhap keywords, bo trong de bo qua hoc sinh nay" style="width:100%; min-height:48px; resize:vertical; box-sizing:border-box; border:1px solid #c9d3df; border-radius:6px; padding:7px; font-size:12px;">${currentValue}</textarea>
        <div class="acp-bulk-tags" data-target-id="${inputId}" style="margin-top:6px; display:flex; flex-wrap:wrap; align-items:center;">
          ${getBulkTagsHtml(inputId)}
        </div>
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px 12px 8px; border-bottom:1px solid #e5ebf1; background:#f8fafc;">
      <div style="font-size:14px; font-weight:700; color:#123;">Nhan xet tung hoc sinh</div>
      <button type="button" id="acp-bulk-close" style="border:none; background:transparent; color:#6b7280; cursor:pointer; font-size:12px;">Dong</button>
    </div>
    <div style="padding:10px 12px; max-height: calc(100vh - 210px); overflow:auto;">
      <div style="padding:10px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; margin-bottom:10px;">
        <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">Noi dung bai hoc tu API</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 0.9fr; gap:6px; margin-bottom:6px;">
          <select id="acp-bulk-subject" style="height:30px; border:1px solid #c9d3df; border-radius:6px; padding:0 6px; font-size:12px;">${subjectOptionsHtml}</select>
          <select id="acp-bulk-course" style="height:30px; border:1px solid #c9d3df; border-radius:6px; padding:0 6px; font-size:12px;">${courseOptionsHtml}</select>
          <select id="acp-bulk-lesson" style="height:30px; border:1px solid #c9d3df; border-radius:6px; padding:0 6px; font-size:12px;">${lessonOptionsHtml}</select>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:6px;">
          <button type="button" data-action="fetch-lesson-content" style="flex:1; height:30px; border:1px solid #0d6efd; background:#0d6efd; color:#fff; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">Lay noi dung</button>
          <button type="button" data-action="copy-lesson-content" style="flex:1; height:30px; border:1px solid #64748b; background:#fff; color:#1f2937; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">Copy noi dung</button>
        </div>
        <textarea id="acp-bulk-lesson-content" placeholder="Nhap tom tat noi dung bai hoc de AI viet sat buoi hoc hon" style="width:100%; min-height:68px; resize:vertical; box-sizing:border-box; border:1px solid #c9d3df; border-radius:6px; padding:7px; font-size:12px;">${lessonContentValue}</textarea>
        <div id="acp-bulk-lesson-status" style="margin-top:6px; font-size:11px; color:${lessonStatusColor};">${lessonStatusText}</div>
      </div>
      ${rowsHtml}
    </div>
    <div style="padding:10px 12px 12px; border-top:1px solid #e5ebf1; background:#fff;">
      <button type="button" id="acp-bulk-run" style="width:100%; border:none; border-radius:7px; background:#0d6efd; color:#fff; padding:10px; font-size:13px; font-weight:700; cursor:pointer;">Viet nhan xet tat ca (AI 1 lan goi)</button>
    </div>
  `;
}

function scheduleBulkPanelRefresh() {
  if (bulkRefreshScheduled) return;
  bulkRefreshScheduled = true;
  window.requestAnimationFrame(() => {
    bulkRefreshScheduled = false;
    refreshBulkPanel();
  });
}

function refreshBulkPanel() {
  if (bulkRunInProgress) return;

  if (!isExtensionEnabled) {
    hideBulkPanel();
    return;
  }

  const now = Date.now();
  if (now - lastBulkScanAt < ACP_BULK_SCAN_COOLDOWN_MS) return;
  lastBulkScanAt = now;

  const students = getStudentsForBulkPanel();
  if (!students.length) {
    lastBulkStudentHash = '';
    hideBulkPanel();
    return;
  }

  const hash = getBulkStudentHash(students);
  const panel = getBulkPanel();

  if (panel && panel.dataset.closedForHash === hash) return;

  if (!panel || panel.dataset.studentHash !== hash) {
    lastBulkStudentHash = hash;
    renderBulkStudentPanel(students);
    return;
  }

  if (panel.style.display === 'none') {
    panel.style.display = 'block';
  }
}

function getBulkActiveDialog() {
  const dialogs = Array.from(
    document.querySelectorAll('[role="dialog"], .modal, .ant-modal, .MuiDialog-root, .MuiModal-root, .ant-modal-wrap')
  ).filter(isElementVisible);
  if (!dialogs.length) return null;
  return dialogs[dialogs.length - 1];
}

function getBulkEditor(container) {
  if (!(container instanceof Element || container instanceof Document)) return null;

  const candidates = Array.from(
    container.querySelectorAll('.ql-editor, [contenteditable]:not([contenteditable="false"]), [role="textbox"], textarea:not([disabled]):not([readonly]), input[type="text"]:not([disabled]):not([readonly])')
  ).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (!isElementVisible(el)) return false;
    if (el.closest(`#${ACP_BULK_PANEL_ID}`)) return false;
    return true;
  });
  if (!candidates.length) return null;

  const quillEditors = candidates.filter((el) => el.classList.contains('ql-editor'));
  if (quillEditors.length) return quillEditors[quillEditors.length - 1];

  const contentEditableEditors = candidates.filter((el) => el.isContentEditable);
  if (contentEditableEditors.length) return contentEditableEditors[contentEditableEditors.length - 1];

  const textareas = candidates.filter((el) => el instanceof HTMLTextAreaElement);
  if (textareas.length) return textareas[textareas.length - 1];

  return candidates[candidates.length - 1];
}

function getBulkSaveButton(container) {
  if (!(container instanceof Element || container instanceof Document)) return null;
  const buttons = Array.from(container.querySelectorAll('button')).filter((button) => {
    if (button.disabled || !isElementVisible(button)) return false;
    if (button.closest(`#${ACP_BULK_PANEL_ID}`)) return false;
    return true;
  });
  const saveKeywords = ['luu', 'save', 'hoan thanh', 'xong', 'cap nhat', 'xac nhan', 'gui'];
  for (let index = buttons.length - 1; index >= 0; index -= 1) {
    const button = buttons[index];
    const text = normalizeVietnameseText(button.innerText || button.textContent || '');
    if (saveKeywords.some((token) => text.includes(token))) {
      return button;
    }
  }
  return null;
}

function getBulkCloseButton(container) {
  if (!(container instanceof Element || container instanceof Document)) return null;
  const buttons = Array.from(container.querySelectorAll('button')).filter((button) => {
    if (button.disabled || !isElementVisible(button)) return false;
    if (button.closest(`#${ACP_BULK_PANEL_ID}`)) return false;
    return true;
  });
  const closeKeywords = ['dong', 'huy', 'close', 'cancel', 'quay lai', 'thoat'];
  const closeButton = buttons.find((button) => {
    const text = normalizeVietnameseText(button.innerText || button.textContent || '');
    return closeKeywords.some((token) => text === token || text.includes(token));
  });
  if (closeButton) return closeButton;

  return container.querySelector('.close, .btn-close, [aria-label="Close"], [data-dismiss="modal"]');
}

function decodeBulkHtmlToPlainText(htmlValue) {
  const temp = document.createElement('div');
  temp.innerHTML = String(htmlValue || '').replace(/<br\s*\/?>/gi, '\n');
  return String(temp.innerText || temp.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function isBulkDialogOpen(dialog) {
  if (!(dialog instanceof HTMLElement)) return false;
  if (!document.body.contains(dialog)) return false;
  return isElementVisible(dialog);
}

async function waitForBulkDialog(timeoutMs = ACP_BULK_DIALOG_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const activeDialog = getBulkActiveDialog();
    if (activeDialog) return activeDialog;
    await sleep(180);
  }
  return getBulkActiveDialog();
}

async function waitForBulkEditor(dialog, timeoutMs = ACP_BULK_EDITOR_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    let editor = getBulkEditor(dialog);
    if (!editor) editor = getBulkEditor(document);
    if (editor) return editor;
    await sleep(180);
  }
  return getBulkEditor(dialog) || getBulkEditor(document);
}

async function waitForBulkDialogClosed(dialog, timeoutMs = ACP_BULK_DIALOG_CLOSE_TIMEOUT_MS) {
  if (!(dialog instanceof HTMLElement)) return;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isBulkDialogOpen(dialog)) return;
    await sleep(180);
  }
}

function updateBulkEditorContent(editor, htmlValue) {
  if (!(editor instanceof HTMLElement)) return;
  const plainTextValue = decodeBulkHtmlToPlainText(htmlValue);

  if (editor instanceof HTMLTextAreaElement || (editor instanceof HTMLInputElement && editor.type === 'text')) {
    editor.focus();
    editor.value = plainTextValue;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  editor.focus();
  if (editor.classList.contains('ql-editor') || editor.isContentEditable) {
    document.execCommand('selectAll', false, null);
    const inserted = document.execCommand('insertHTML', false, htmlValue);
    if (!inserted) editor.innerHTML = htmlValue;
  } else {
    editor.textContent = plainTextValue;
  }

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyBulkPromptVariables(templateText, values) {
  let output = String(templateText || '');
  const map = values && typeof values === 'object' ? values : {};
  Object.entries(map).forEach(([token, value]) => {
    const safeToken = String(token || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!safeToken) return;
    output = output.replace(new RegExp(`\\{${safeToken}\\}`, 'gi'), String(value ?? ''));
  });
  return output;
}

function getBulkStudentInstruction(studentName, keyword, lessonContent) {
  const fallbackPrompt = `Ban la giao vien day lap trinh. Dua vao tu khoa: "${keyword}". Viet nhan xet cho hoc sinh ten ${studentName} gom 3 y: Diem manh, Diem can cai thien, Loi khuyen.`;
  const template = String(userAiPrompt || '').trim() || fallbackPrompt;
  return applyBulkPromptVariables(template, {
    name: studentName,
    student_name: studentName,
    keywords: keyword,
    lesson_content: lessonContent,
    lessonContent: lessonContent
  });
}

function buildBulkBatchPrompt(batchItems, lessonContent) {
  const normalizedLessonContent = String(lessonContent || '').trim();
  const payloadForModel = batchItems.map((item) => ({
    student_id: item.studentId,
    student_name: item.student.name,
    keywords: item.keyword,
    instruction: getBulkStudentInstruction(item.student.name, item.keyword, normalizedLessonContent)
  }));

  const parts = [
    'Ban la giao vien lap trinh, can viet nhan xet rieng cho tung hoc sinh.',
    normalizedLessonContent
      ? `Noi dung bai hoc tham khao:\n${normalizedLessonContent}`
      : 'Khong co noi dung bai hoc bo sung.',
    'Bat buoc tra ve dung JSON, KHONG markdown, KHONG text ngoai JSON.',
    'Schema JSON:',
    '{"comments":[{"student_id":"S1","student_name":"Ten hoc sinh","comment":"Noi dung nhan xet"}]}',
    'Danh sach hoc sinh can xu ly:',
    JSON.stringify(payloadForModel, null, 2)
  ];

  return parts.join('\n\n');
}

function stripJsonFence(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractLikelyJson(text) {
  const clean = stripJsonFence(text);
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return clean.slice(firstBrace, lastBrace + 1).trim();
  }
  const firstBracket = clean.indexOf('[');
  const lastBracket = clean.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return clean.slice(firstBracket, lastBracket + 1).trim();
  }
  return clean;
}

function parseBulkJsonResponse(aiText) {
  const candidates = [
    String(aiText || ''),
    stripJsonFence(aiText),
    extractLikelyJson(aiText)
  ];
  const uniqueCandidates = Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)));
  for (const candidate of uniqueCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {}
  }
  throw new Error('AI khong tra ve JSON hop le cho batch.');
}

function normalizeBulkCommentEntries(parsedJson) {
  if (Array.isArray(parsedJson)) return parsedJson;
  if (parsedJson && Array.isArray(parsedJson.comments)) return parsedJson.comments;
  if (parsedJson && Array.isArray(parsedJson.results)) return parsedJson.results;
  if (parsedJson && parsedJson.comments && typeof parsedJson.comments === 'object') {
    return Object.entries(parsedJson.comments).map(([studentId, value]) => {
      if (typeof value === 'string') {
        return { student_id: studentId, comment: value };
      }
      if (value && typeof value === 'object') {
        return {
          student_id: value.student_id || value.studentId || studentId,
          student_name: value.student_name || value.studentName || value.name || '',
          comment: value.comment || value.text || value.content || value.html || ''
        };
      }
      return { student_id: studentId, comment: '' };
    });
  }

  if (parsedJson && typeof parsedJson === 'object') {
    return Object.entries(parsedJson).map(([key, value]) => {
      if (typeof value === 'string') {
        return { student_id: key, comment: value };
      }
      if (value && typeof value === 'object') {
        return {
          student_id: value.student_id || value.studentId || key,
          student_name: value.student_name || value.studentName || value.name || '',
          comment: value.comment || value.text || value.content || value.html || ''
        };
      }
      return { student_id: key, comment: '' };
    });
  }
  return [];
}

function normalizeCommentHtml(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return '';
  const hasHtmlTag = /<[^>]+>/.test(text);
  if (hasHtmlTag) return text;
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function mapBatchCommentsByStudentId(parsedJson, batchItems) {
  const entries = normalizeBulkCommentEntries(parsedJson);
  const commentsByStudentId = {};

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const explicitId = String(entry.student_id || entry.studentId || entry.id || '').trim();
    const rawName = String(entry.student_name || entry.studentName || entry.name || '').trim();
    const html = normalizeCommentHtml(entry.comment || entry.text || entry.content || entry.html || '');
    if (!html) return;

    let mappedId = explicitId;
    if (!mappedId && rawName) {
      const matched = batchItems.find((item) => item.student.name === rawName);
      if (matched) mappedId = matched.studentId;
    }
    if (!mappedId) return;
    commentsByStudentId[mappedId] = html;
  });

  const missingStudentIds = batchItems
    .map((item) => item.studentId)
    .filter((studentId) => !commentsByStudentId[studentId]);

  return { commentsByStudentId, missingStudentIds };
}

async function generateBulkCommentsBatch(batchItems, lessonContent) {
  const promptText = buildBulkBatchPrompt(batchItems, lessonContent);
  const payload = {
    prompt: promptText,
    keywords: batchItems.map((item) => `${item.student.name}: ${item.keyword}`).join(' | '),
    scores: 'Bulk processing mode',
    raw_html: String(lessonContent || '').trim() || 'Bulk processing mode',
    lesson_content: String(lessonContent || '').trim(),
    students: batchItems.map((item) => ({
      student_id: item.studentId,
      student_name: item.student.name,
      keywords: item.keyword
    }))
  };

  const aiResult = await requestAiTextWithFallback(payload, {
    minIntervalMs: ACP_BULK_MIN_REQUEST_INTERVAL_MS,
    maxRetriesPerCandidate: Math.max(1, ACP_BULK_TRANSIENT_RETRY_COUNT + 1),
    retryDelayMs: ACP_BULK_TRANSIENT_RETRY_DELAY_MS
  });

  const parsedJson = parseBulkJsonResponse(aiResult.aiText);
  const { commentsByStudentId, missingStudentIds } = mapBatchCommentsByStudentId(parsedJson, batchItems);
  if (!Object.keys(commentsByStudentId).length) {
    throw new Error('AI khong tra ve nhan xet hop le cho hoc sinh nao.');
  }
  return { commentsByStudentId, missingStudentIds, model: aiResult.candidate.model };
}

async function processBulkStudentWithComment(student, commentHtml) {
  const studentActionButton = findBulkStudentActionButton(student);
  if (!studentActionButton) {
    throw new Error(`Khong tim thay nut "Nhan xet hoc sinh" cho ${student.name}`);
  }

  studentActionButton.scrollIntoView({ block: 'center', inline: 'nearest' });
  studentActionButton.click();

  const activeDialog = await waitForBulkDialog();
  if (!activeDialog) {
    throw new Error(`Khong mo duoc hop thoai nhan xet cho ${student.name}`);
  }

  const editor = await waitForBulkEditor(activeDialog);
  if (!editor) {
    throw new Error(`Khong tim thay o nhan xet cho ${student.name}`);
  }

  updateBulkEditorContent(editor, commentHtml);

  await sleep(700);

  let clickedSave = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!isBulkDialogOpen(activeDialog)) break;
    const saveButton = getBulkSaveButton(activeDialog) || getBulkSaveButton(document);
    if (!saveButton) {
      await sleep(500);
      continue;
    }
    saveButton.click();
    clickedSave = true;
    await sleep(900);
  }

  if (!clickedSave && isBulkDialogOpen(activeDialog)) {
    throw new Error(`Khong tim thay nut luu cho ${student.name}`);
  }

  if (isBulkDialogOpen(activeDialog)) {
    const closeButton = getBulkCloseButton(activeDialog) || getBulkCloseButton(document);
    if (closeButton) {
      closeButton.click();
    } else {
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
      activeDialog.dispatchEvent(escEvent);
      document.dispatchEvent(escEvent);
    }
    await waitForBulkDialogClosed(activeDialog);
  }
}

async function runBulkAutoAll() {
  if (bulkRunInProgress) return;

  const panel = getBulkPanel();
  const runButton = document.getElementById('acp-bulk-run');
  if (!panel || !runButton) return;

  snapshotBulkKeywordDrafts();
  const students = getStudentsForBulkPanel();
  if (!students.length) {
    alert('Khong tim thay danh sach hoc sinh.');
    return;
  }

  bulkRunInProgress = true;
  runButton.disabled = true;
  runButton.style.opacity = '0.6';

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failedDetails = [];
  let usedModel = '';
  let generatedCount = 0;

  try {
    const batchItems = [];
    for (const student of students) {
      const keyword = String(bulkKeywordDrafts[student.key] || '').trim();
      if (!keyword) {
        skippedCount += 1;
        continue;
      }
      batchItems.push({
        student,
        keyword,
        studentId: `S${batchItems.length + 1}`
      });
    }

    if (!batchItems.length) {
      alert('Khong co hoc sinh nao co keywords de tao nhan xet.');
      return;
    }

    runButton.textContent = `Dang goi AI 1 lan cho ${batchItems.length} hoc sinh...`;

    let lessonContent = String(bulkLessonContentDraft || '').trim();
    if (!lessonContent) {
      runButton.textContent = `Dang lay noi dung bai hoc ${bulkLessonPickerState.course} - Buoi ${bulkLessonPickerState.lesson}...`;
      try {
        const fetched = await fetchAndFillBulkLessonContent({ silent: true });
        lessonContent = String(fetched || '').trim();
      } catch (fetchError) {}
    }

    if (!lessonContent) {
      setBulkLessonStatus('Chua co noi dung bai hoc tu API. Van tiep tuc tao nhan xet tu keywords.', true);
    }

    let batchResult;
    try {
      batchResult = await generateBulkCommentsBatch(batchItems, lessonContent);
      usedModel = batchResult.model || '';
      generatedCount = Object.keys(batchResult.commentsByStudentId || {}).length;
    } catch (batchError) {
      const message = String(batchError?.message || batchError || 'Unknown error');
      throw new Error(`Loi tao batch nhan xet: ${message}`);
    }

    if (batchResult.missingStudentIds.length > 0) {
      batchResult.missingStudentIds.forEach((studentId) => {
        const item = batchItems.find((candidate) => candidate.studentId === studentId);
        if (!item) return;
        failedCount += 1;
        failedDetails.push(`${item.student.name}: AI khong tra ve nhan xet`);
      });
    }

    for (const item of batchItems) {
      const commentHtml = batchResult.commentsByStudentId[item.studentId];
      if (!commentHtml) continue;

      runButton.textContent = `Dang dan: ${item.student.name}`;
      try {
        await processBulkStudentWithComment(item.student, commentHtml);
        successCount += 1;
        const modelSuffix = usedModel ? ` (${usedModel})` : '';
        showNotificationToast(`Xong ${item.student.name}${modelSuffix}`);
      } catch (error) {
        failedCount += 1;
        const errorMessage = String(error?.message || error || 'Unknown error');
        failedDetails.push(`${item.student.name}: ${errorMessage}`);
        console.error('Bulk process error', item.student.name, error);
        showNotificationToast(`Loi ${item.student.name}: ${errorMessage}`);
      }
    }
  } finally {
    runButton.disabled = false;
    runButton.style.opacity = '1';
    runButton.textContent = 'Viet nhan xet tat ca (AI 1 lan goi)';
    bulkRunInProgress = false;
  }

  const summaryLines = [
    'Hoan thanh.',
    `- So hoc sinh AI da tao text: ${generatedCount}`,
    `- Da xu ly: ${successCount}`,
    `- Bo qua (khong co keywords): ${skippedCount}`,
    `- Loi: ${failedCount}`
  ];
  if (usedModel) {
    summaryLines.splice(1, 0, `- Model da dung: ${usedModel}`);
  }
  if (failedDetails.length > 0) {
    const limitedDetails = failedDetails.slice(0, 5);
    summaryLines.push('', 'Chi tiet loi:');
    limitedDetails.forEach((item) => summaryLines.push(`- ${item}`));
    const remainingCount = failedDetails.length - limitedDetails.length;
    if (remainingCount > 0) {
      summaryLines.push(`- ... va ${remainingCount} loi khac`);
    }
  }
  alert(summaryLines.join('\n'));
}

const bulkPanelObserver = new MutationObserver(() => scheduleBulkPanelRefresh());
bulkPanelObserver.observe(document.body, { childList: true, subtree: true });
setTimeout(scheduleBulkPanelRefresh, 1800);
