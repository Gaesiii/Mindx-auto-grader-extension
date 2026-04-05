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

// 🌐 ĐƯỜNG DẪN GỌI VỀ WEB APP PYTHON (LOCALHOST)
const WEB_APP_API_URL = "https://lms-performance-tracker.vercel.app/api/generate";
const ACP_EVAL_PANEL_ID = 'acp-eval-panel';
const ACP_EVAL_REOPEN_ID = 'acp-eval-reopen';
const ACP_MIN_RADIO_COUNT = 20;

// 🎯 RADAR GHI NHỚ VỊ TRÍ ZALO
let lastActiveInput = null;
let lastSavedRange = null;
let evalDialogCounter = 0;
let evalRefreshScheduled = false;

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

function parseScoreString(str) { return String(str || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)); }

function getLocalDateKey() {
  return new Date().toLocaleDateString('en-CA');
}

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

chrome.storage.local.get(['isExtensionEnabled', 'pasteKey', 'toggleKey', 'searchKey', 'geminiApiKey', 'aiModel', 'aiProviders', 'autoTickScores', 'aiPrompt'], (result) => {
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
    const requests = CLOUD_APIS.map(url => fetch(url).then(res => res.json()).catch(e => []));
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
        
        const t = templates.find(x => {
          if (!x.title) return false;
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
          html += `<div class="acp-tree-item has-data" data-id="${t.id}">
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
      const targetTemplate = templates.find(x => x.id === id);
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

// ===============================================
// MODULE LMS MINDX (GIAO DIỆN V1 NGUYÊN BẢN)
// ===============================================
function injectEvaluationPanel() {
  if (document.querySelectorAll('input[type="radio"], .ql-editor').length === 0) return;
  if (document.getElementById('acp-eval-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'acp-eval-panel';
  panel.style.cssText = `position: fixed; top: 80px; right: 20px; width: 320px; background: #ffffff; border-radius: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.15); z-index: 2147483647; padding: 15px; font-family: Arial, sans-serif; border: 1px solid #e0e0e0;`;
  
  panel.innerHTML = `
    <h4 style="margin:0 0 12px 0; color:#1a73e8; font-size:15px; display:flex; justify-content:space-between;">
      ⚡ Auto Tick Điểm LMS
      <span style="font-size:11px; font-weight:normal; color:#888; cursor:pointer;" onclick="document.getElementById('acp-eval-panel').style.display='none'">[Đóng]</span>
    </h4>
    <div style="display:flex; gap:8px; margin-bottom: 15px;">
      <button id="btn-gioi" style="flex:1; background:#28a745; color:#fff; border:none; padding:8px; border-radius:5px; cursor:pointer; font-weight:bold;">Giỏi</button>
      <button id="btn-kha" style="flex:1; background:#ffc107; color:#000; border:none; padding:8px; border-radius:5px; cursor:pointer; font-weight:bold;">Khá</button>
      <button id="btn-tb" style="flex:1; background:#dc3545; color:#fff; border:none; padding:8px; border-radius:5px; cursor:pointer; font-weight:bold;">TB</button>
    </div>
    <div style="border-top:1px solid #eee; padding-top:12px;">
      
      <label style="font-size:12px; font-weight:bold; color:#555;">Tạo nhận xét chung (AI):</label>
      <input type="text" id="ai-keywords" placeholder="VD: hiểu bài, làm game nhanh..." style="width:100%; padding:10px; margin-top:4px; border:1px solid #ccc; border-radius:5px; box-sizing:border-box; outline:none; font-size:13px; color:#333;">
      
      <button id="btn-gen-ai" style="width:100%; background:#8e24aa; color:#fff; border:none; padding:10px; border-radius:5px; cursor:pointer; margin-top:10px; font-weight:bold; transition:0.2s;">✨ Nhờ AI viết nhận xét</button>
    </div>
  `;

  const popupContainer = document.querySelector('[role="dialog"]') || document.body;
  popupContainer.appendChild(panel);

  // Dòng này được BÊ Y XÌ từ V1 gốc của bạn để đảm bảo không lỗi gõ phím
  ['mousedown', 'mouseup', 'click', 'keydown', 'focusin'].forEach(evt => {
    panel.addEventListener(evt, (e) => e.stopPropagation());
  });

  document.getElementById('btn-gioi').addEventListener('click', () => fillReactScores('gioi'));
  document.getElementById('btn-kha').addEventListener('click', () => fillReactScores('kha'));
  document.getElementById('btn-tb').addEventListener('click', () => fillReactScores('tb'));
  document.getElementById('btn-gen-ai').addEventListener('click', generateAIComment);
}

function fillReactScores(level) {
  const scoresArray = autoTickScores[level];
  const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
  
  const pointsPerCriteria = 5; 
  for (let i = 0; i < scoresArray.length; i++) {
     const targetIndex = (i * pointsPerCriteria) + (scoresArray[i] - 1);
     if (allRadios[targetIndex]) allRadios[targetIndex].click();
  }
  showNotificationToast(`Đã tick điểm mức: ${level.toUpperCase()}`);
}

async function generateAIComment() {
  const keywordInput = document.getElementById('ai-keywords');
  const keywords = keywordInput.value.trim();
  const btn = document.getElementById('btn-gen-ai');

  if (!keywords) return alert("Vui lòng nhập Từ khóa để AI nhận xét!");
  if (!geminiApiKey) return alert("Vui lòng vào trang Tùy chọn (Options) để nhập Gemini API Key!");

  btn.innerHTML = "⏳ Đang gọi Web App..."; btn.style.opacity = '0.7'; btn.disabled = true;

  const defaultPrompt = `Bạn là giáo viên dạy lập trình thân thiện. Dựa vào từ khóa: "${keywords}". Viết thành 3 ý: Điểm mạnh, Điểm cần cải thiện, Lời khuyên.`;
  const finalPromptText = userAiPrompt ? userAiPrompt.replace('{keywords}', keywords) : defaultPrompt;
  
  // 1. Dùng Javascript bắt điểm Barem từ DOM đang hiển thị
  const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
  let currentScores = [];
  allRadios.forEach((radio, index) => {
    if (radio.checked) {
      currentScores.push((index % 5) + 1);
    }
  });
  const scoresString = currentScores.length > 0 ? currentScores.join(", ") : "Chưa chấm điểm";

  // 2. Lấy TOÀN BỘ HTML để ném qua Web App Python xử lý bóc tách Mã lớp và Buổi
  const rawHtmlData = document.documentElement.outerHTML;

  // 3. Đóng gói Payload KHÔNG có trường student_name
  const payload = { 
    prompt: finalPromptText,
    model: currentAiModel,
    api_key: geminiApiKey,
    keywords: keywords,
    scores: scoresString,
    raw_html: rawHtmlData
  };

  try {
    const response = await fetch(WEB_APP_API_URL, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error("Lỗi HTTP: " + response.status);
    
    const data = await response.json();
    if (data.status === "error") throw new Error(data.message);

    let aiText = data.data.trim();
    aiText = aiText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    const quillEditors = document.querySelectorAll('.ql-editor');
    if (quillEditors.length > 0) {
      const finalCommentBox = quillEditors[quillEditors.length - 1]; 
      
      finalCommentBox.focus(); 
      document.execCommand('insertHTML', false, aiText.replace(/\n/g, '<br>')); 
      
      keywordInput.value = ''; 
      showNotificationToast("✨ Web App đã trả về nhận xét thành công!");
    } else { 
      alert("Không tìm thấy ô nhận xét Đánh giá chung!\n\nAI:\n" + aiText); 
    }
  } catch (error) { 
      alert("Lỗi kết nối Web App. Bạn đã chạy server Python chưa?\nChi tiết: " + error.message); 
  } 
  finally { btn.innerHTML = "✨ Nhờ AI viết nhận xét"; btn.style.opacity = '1'; btn.disabled = false; }
}

const observer = new MutationObserver(() => scheduleEvaluationPanelRefresh());
observer.observe(document.body, { childList: true, subtree: true });
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

async function generateAIComment() {
  const keywordInput = document.getElementById('ai-keywords');
  const btn = document.getElementById('btn-gen-ai');
  if (!keywordInput || !btn) return;

  const keywords = keywordInput.value.trim();
  if (!keywords) return alert("Vui long nhap tu khoa de AI nhan xet!");

  const aiCandidates = buildAiCandidates();
  if (!aiCandidates.length) {
    return alert("Chua co API key/model kha dung. Vao Options de cau hinh AI Provider.");
  }

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

  let aiText = '';
  let selectedCandidate = null;
  let lastError = null;

  try {
    for (const candidate of aiCandidates) {
      const payload = {
        ...basePayload,
        model: candidate.model,
        api_key: candidate.apiKey,
        provider: candidate.provider
      };

      try {
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

        aiText = String(data?.data || '').trim();
        selectedCandidate = candidate;
        break;
      } catch (candidateError) {
        lastError = candidateError;
        const errorMessage = String(candidateError?.message || '');
        if (isDailyQuotaError(errorMessage)) {
          exhaustedAiCandidates.add(candidate.id);
        }
      }
    }

    if (!selectedCandidate || !aiText) {
      const remainingCandidates = buildAiCandidates();
      if (!remainingCandidates.length) {
        throw new Error('Tat ca key/model hien da het quota trong ngay. Hay doi reset quota hoac them key moi.');
      }
      if (lastError) throw lastError;
      throw new Error('Khong co candidate AI nao tra ve ket qua.');
    }

    aiText = aiText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const quillEditors = context ? context.editors : getVisibleQuillEditors();
    if (quillEditors.length > 0) {
      const finalCommentBox = quillEditors[quillEditors.length - 1];
      finalCommentBox.focus();
      document.execCommand('insertHTML', false, aiText.replace(/\n/g, '<br>'));
      keywordInput.value = '';
      showNotificationToast(`AI thanh cong (${selectedCandidate.model})`);
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
}, true);
