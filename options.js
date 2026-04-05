var ColorStyle = Quill.import('attributors/style/color');
var BackgroundStyle = Quill.import('attributors/style/background');
Quill.register(ColorStyle, true); Quill.register(BackgroundStyle, true);

var quill = new Quill('#editor-container', {
  theme: 'snow', placeholder: 'Soạn báo cáo của bạn ở đây...',
  modules: { toolbar: [['bold', 'italic', 'underline', 'strike'], [{ 'color': [] }, { 'background': [] }], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }
});

// CẤU HÌNH HỆ THỐNG MÁY CHỦ (Đã mã hóa để bảo mật)
const API_LINKS = {
  L1: atob("aHR0cHM6Ly82OWI5NjZlZWU2OTY1M2ZmZTZhNzk2ZDQubW9ja2FwaS5pby90ZW1wbGF0ZXM="),
  L2: atob("aHR0cHM6Ly82OWI5ODA1ZWU2OTY1M2ZmZTZhN2U0NTEubW9ja2FwaS5pby9Sb2JvdGlj"),
  L3: atob("aHR0cHM6Ly82OWI5ODBhOGU2OTY1M2ZmZTZhN2U1NzMubW9ja2FwaS5pby9XZWItQXBw"),
  L4: atob("aHR0cHM6Ly82OWI5ODA1ZGU2OTY1M2ZmZTZhN2UzZjQubW9ja2FwaS5pby9yb2JvdA==")
};

const COURSE_TREE = {
  "Scratch": { api: API_LINKS.L1, courses: ["SB", "SA", "SI"] },
  "Game":    { api: API_LINKS.L1, courses: ["GB", "GA", "GI"] },
  "PRE":     { api: API_LINKS.L2, courses: ["PREB", "PREA", "PREI"] },
  "ARM":     { api: API_LINKS.L2, courses: ["ARMB", "ARMA", "ARMI"] },
  "WEB":     { api: API_LINKS.L3, courses: ["JSB", "JSA", "JSI"] },
  "SEMI":    { api: API_LINKS.L4, courses: ["SEMIB", "SEMIA", "SEMII"] },
  "Python":  { api: API_LINKS.L4, courses: ["PTB", "PTA", "PTI"] }
};

let templates = [];
let activeNode = null; 

// KHAI BÁO CÁC ELEMENT
const pasteInput = document.getElementById('pasteInput');
const searchInput = document.getElementById('searchInput');
const toggleInput = document.getElementById('toggleInput'); 
const saveKeysBtn = document.getElementById('saveKeysBtn');

const geminiKeyInput = document.getElementById('geminiKeyInput');
const aiModelInput = document.getElementById('aiModelInput');
const scoreGioi = document.getElementById('scoreGioi');
const scoreKha = document.getElementById('scoreKha');
const scoreTb = document.getElementById('scoreTb');
const promptTemplateSelect = document.getElementById('promptTemplateSelect');
const applyPromptTemplateBtn = document.getElementById('applyPromptTemplateBtn');
const promptTemplateHint = document.getElementById('promptTemplateHint');
const aiPromptInput = document.getElementById('aiPromptInput');
const saveAiBtn = document.getElementById('saveAiBtn');

const treeContainer = document.getElementById('treeContainer');
const editorBlocker = document.getElementById('editorBlocker');
const lblEditorPath = document.getElementById('lblEditorPath');
const lblEditorTarget = document.getElementById('lblEditorTarget');
const btnSaveData = document.getElementById('btnSaveData');
const btnDeleteData = document.getElementById('btnDeleteData');
const cloudStatus = document.getElementById('cloudStatus');

const authMethodGoogle = document.getElementById('authMethodGoogle');
const authMethodManual = document.getElementById('authMethodManual');
const btnGoogleLogin = document.getElementById('btnGoogleLogin');
const googleIdentityInfo = document.getElementById('googleIdentityInfo');
const manualUidInput = document.getElementById('manualUidInput');
const manualTokenInput = document.getElementById('manualTokenInput');
const btnSaveManualIdentity = document.getElementById('btnSaveManualIdentity');
const identityStatus = document.getElementById('identityStatus');
const currentIdentitySummary = document.getElementById('currentIdentitySummary');
const btnClearIdentity = document.getElementById('btnClearIdentity');

let currentUserIdentity = null;

const DEFAULT_PROMPT = `Bạn là thầy giáo dạy lập trình thân thiện và chuyên nghiệp. Dựa vào các từ khóa của học sinh này: "{keywords}".
Hãy viết 1 đoạn nhận xét chung dành cho phụ huynh, trình bày rõ ràng nhẹ nhàng, không dùng từ gây phản cảm hoặc chất vấn học viên. Dùng nói giảm nói tránh sao cho nhẹ nhưng vẫn truyền đạt được ý của keywords. và tối ưu nhất là khoảng 80 chữ.viết ngắn gọn , không cần kính gửi gì như viết thư. truyền đạt ý chính là đủ:
ví dụ:
Con là học sinh hòa đồng, luôn mang lại năng lượng tích cực cho lớp học. Bên cạnh đó, con cũng đã có sự tiến bộ nhất định khi bắt đầu cố gắng tự giải quyết một số bài tập. Tuy nhiên, con vẫn còn phụ thuộc vào công cụ hỗ trợ. Thầy mong con luyện tập nghiêm túc hơn, tự mình tư duy và làm bài để củng cố kiến thức và phát triển tư duy lập trình một cách bền vững..`;

const PROMPT_TEMPLATE_CUSTOM = '__custom__';
const PROMPT_TEMPLATES = [
  {
    id: 'legacy_default',
    label: 'Prompt hien tai (Legacy)',
    hint: 'Prompt dang dung truoc day cua ban.',
    prompt: DEFAULT_PROMPT
  },
  {
    id: 'female_teacher_soft',
    label: 'Giao vien nu - mem mai',
    hint: 'Nhe nhang, dong vien, phu hop phu huynh.',
    prompt: `Ban la co giao day lap trinh, giao tiep am ap va tinh te. Dua vao keywords: "{keywords}".
Hay viet 1 doan nhan xet 70-100 chu gui phu huynh theo 3 y:
1) Diem tot cua con trong buoi hoc.
2) Dieu can ren them, noi nhe va tich cuc.
3) Goi y hoc tap cu the cho tuan toi.
Khong phe binh nang, khong dung tu gay ap luc, van ro muc tieu cai thien.`
  },
  {
    id: 'female_teacher_strict',
    label: 'Giao vien nu - nghiem',
    hint: 'Van lich su nhung ro rang ve ky luat va ky nang.',
    prompt: `Ban la co giao day lap trinh, phong cach ro rang va ky luat. Dua vao keywords: "{keywords}".
Viet 1 doan nhan xet 80-110 chu cho phu huynh, gom:
- Ket qua hien tai cua con.
- 1-2 van de can sua ngay.
- Ke hoach ren luyen cu the (muc tieu + han thoi gian).
Ngu dieu ton trong, truc dien, khong lan man.`
  },
  {
    id: 'neutral_short',
    label: 'Trung lap - ngan gon',
    hint: 'Nhan xet ngan, de copy nhanh len LMS.',
    prompt: `Ban la giao vien lap trinh. Dua vao keywords: "{keywords}".
Viet nhan xet 60-80 chu, 3 cau:
Cau 1: diem manh.
Cau 2: diem can cai thien.
Cau 3: huong dan hanh dong tiep theo.
Khong mo dau thu tu, khong chen tieu de.`
  },
  {
    id: 'female_parent_focus',
    label: 'Giao vien nu - huong PH',
    hint: 'Tap trung hanh dong cu the de phu huynh de theo sat.',
    prompt: `Ban la co giao lap trinh. Dua vao keywords: "{keywords}".
Hay viet nhan xet 80-110 chu gui phu huynh, giu giong van am ap va ro rang:
1) Neu 1 diem tien bo noi bat cua con.
2) Neu 1 han che can uu tien cai thien ngay.
3) Dua ra 2 viec phu huynh co the dong hanh tai nha trong tuan nay.
Khong dung tu trach moc, khong qua chung chung, cau van ngan gon de doc nhanh.`
  }
];

function getPromptTemplateById(templateId) {
  return PROMPT_TEMPLATES.find((template) => template.id === templateId) || null;
}

function updatePromptTemplateHint(templateId) {
  if (!promptTemplateHint) return;
  if (!templateId || templateId === PROMPT_TEMPLATE_CUSTOM) {
    promptTemplateHint.textContent = 'Ban co the giu prompt hien tai hoac chon mau roi bam "Ap dung mau".';
    return;
  }

  const template = getPromptTemplateById(templateId);
  promptTemplateHint.textContent = template ? template.hint : '';
}

function syncPromptTemplateSelect(promptText) {
  if (!promptTemplateSelect) return;
  const normalizedPrompt = String(promptText || '').trim();
  const matchedTemplate = PROMPT_TEMPLATES.find((template) => template.prompt.trim() === normalizedPrompt);
  promptTemplateSelect.value = matchedTemplate ? matchedTemplate.id : PROMPT_TEMPLATE_CUSTOM;
  updatePromptTemplateHint(promptTemplateSelect.value);
}

function initPromptTemplateSelector() {
  if (!promptTemplateSelect) return;

  const optionHtml = [
    `<option value="${PROMPT_TEMPLATE_CUSTOM}">Keep current prompt</option>`,
    ...PROMPT_TEMPLATES.map((template) => `<option value="${template.id}">${template.label}</option>`)
  ];
  promptTemplateSelect.innerHTML = optionHtml.join('');
  updatePromptTemplateHint(PROMPT_TEMPLATE_CUSTOM);
}

function setIdentityStatus(text, isError = false) {
  if (!identityStatus) return;
  identityStatus.textContent = text;
  identityStatus.style.color = isError ? '#dc3545' : '#0056b3';
}

function updateIdentityMethodUI() {
  if (!authMethodGoogle || !authMethodManual) return;
  const useGoogle = authMethodGoogle.checked;
  if (btnGoogleLogin) btnGoogleLogin.disabled = !useGoogle;
  if (manualUidInput) manualUidInput.disabled = useGoogle;
  if (manualTokenInput) manualTokenInput.disabled = useGoogle;
  if (btnSaveManualIdentity) btnSaveManualIdentity.disabled = useGoogle;
}

function renderIdentity(identity) {
  currentUserIdentity = identity || null;
  if (!currentIdentitySummary) return;

  if (!identity || !identity.userId) {
    currentIdentitySummary.textContent = 'Identity đang trống. Hãy chọn Google hoặc Manual UID.';
    setIdentityStatus('Chưa cài đặt user identity.');
    if (googleIdentityInfo) {
      googleIdentityInfo.textContent = 'Lấy profile từ tài khoản Google của Chrome profile hiện tại.';
    }
    return;
  }

  const methodLabel = identity.method === 'google' ? 'Google Login' : 'Manual UID/Token';
  const updatedAt = identity.updatedAt ? new Date(identity.updatedAt).toLocaleString() : 'Unknown';
  const tokenInfo = identity.token ? 'Token: saved' : 'Token: empty';
  setIdentityStatus(`Đang dùng ${methodLabel} - UID: ${identity.userId}`);
  currentIdentitySummary.textContent = `Method: ${methodLabel} | Display: ${identity.displayName || identity.userId} | ${tokenInfo} | Updated: ${updatedAt}`;

  if (identity.method === 'google') {
    if (authMethodGoogle) authMethodGoogle.checked = true;
    if (googleIdentityInfo) {
      const email = identity.google?.email || '(no email returned)';
      const profileId = identity.google?.id || '(no profile id)';
      googleIdentityInfo.textContent = `Google account: ${email} | Profile ID: ${profileId}`;
    }
  } else {
    if (authMethodManual) authMethodManual.checked = true;
    if (manualUidInput) manualUidInput.value = identity.userId || '';
    if (manualTokenInput) manualTokenInput.value = identity.token || '';
  }

  updateIdentityMethodUI();
}

function saveIdentity(identity) {
  chrome.storage.local.set({ userIdentity: identity }, () => {
    renderIdentity(identity);
  });
}

function handleGoogleIdentity() {
  setIdentityStatus('Đang kết nối Google profile...');
  chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (profile) => {
    if (chrome.runtime.lastError) {
      setIdentityStatus(`Google login lỗi: ${chrome.runtime.lastError.message}`, true);
      return;
    }

    const googleId = profile?.id?.trim() || '';
    const email = profile?.email?.trim() || '';
    const userId = googleId || email;

    if (!userId) {
      setIdentityStatus('Không lấy được Google ID. Hãy đăng nhập Chrome profile trước.', true);
      return;
    }

    const identity = {
      method: 'google',
      userId,
      displayName: email || googleId,
      token: '',
      google: { id: googleId, email },
      updatedAt: new Date().toISOString()
    };

    saveIdentity(identity);
  });
}

function handleManualIdentitySave() {
  const uid = manualUidInput?.value.trim() || '';
  const token = manualTokenInput?.value.trim() || '';

  if (!uid) {
    setIdentityStatus('UID không được để trống.', true);
    if (manualUidInput) manualUidInput.focus();
    return;
  }

  const identity = {
    method: 'manual',
    userId: uid,
    displayName: uid,
    token,
    updatedAt: new Date().toISOString()
  };

  saveIdentity(identity);
}

function clearIdentity() {
  chrome.storage.local.remove(['userIdentity'], () => {
    currentUserIdentity = null;
    if (manualUidInput) manualUidInput.value = '';
    if (manualTokenInput) manualTokenInput.value = '';
    if (authMethodGoogle) authMethodGoogle.checked = true;
    updateIdentityMethodUI();
    renderIdentity(null);
  });
}

function initIdentitySection(identity) {
  if (!authMethodGoogle || !authMethodManual) return;

  if (identity?.method === 'manual') {
    authMethodManual.checked = true;
    authMethodGoogle.checked = false;
  } else {
    authMethodGoogle.checked = true;
    authMethodManual.checked = false;
  }

  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', handleGoogleIdentity);
  }
  if (btnSaveManualIdentity) {
    btnSaveManualIdentity.addEventListener('click', handleManualIdentitySave);
  }
  if (btnClearIdentity) {
    btnClearIdentity.addEventListener('click', clearIdentity);
  }

  [authMethodGoogle, authMethodManual].forEach((radio) => {
    radio.addEventListener('change', updateIdentityMethodUI);
  });

  renderIdentity(identity || null);
  updateIdentityMethodUI();
}

// ==========================================
// HỆ THỐNG GIỮ TRẠNG THÁI CÂY THƯ MỤC
// ==========================================
function saveTreeState() {
  let openNodes = [];
  document.querySelectorAll('details[open]').forEach(details => {
      if (details.id) openNodes.push(details.id);
  });
  localStorage.setItem('acp_tree_state', JSON.stringify(openNodes));
}

function restoreTreeState() {
  let state = localStorage.getItem('acp_tree_state');
  if (state) {
      let openNodes = JSON.parse(state);
      openNodes.forEach(id => {
          let details = document.getElementById(id);
          if (details) details.open = true;
      });
  }
  
  if (activeNode) {
      let activeItem = document.getElementById(`node-${activeNode.subject}-${activeNode.course}-${activeNode.lesson}`);
      if (activeItem) activeItem.classList.add('active');
  }
}

initPromptTemplateSelector();

chrome.storage.local.get(['pasteKey', 'searchKey', 'toggleKey', 'geminiApiKey', 'aiModel', 'autoTickScores', 'aiPrompt', 'userIdentity'], (result) => {
  if (result.pasteKey) pasteInput.value = result.pasteKey;
  if (result.searchKey) searchInput.value = result.searchKey;
  if (result.toggleKey) toggleInput.value = result.toggleKey;
  
  if (result.geminiApiKey) geminiKeyInput.value = result.geminiApiKey;
  if (result.aiModel) aiModelInput.value = result.aiModel;
  
  const scores = result.autoTickScores || { gioi: '5,5,5,5,5,5,5', kha: '4,4,4,4,4,4,4', tb: '3,3,3,3,3,3,3' };
  scoreGioi.value = scores.gioi; 
  scoreKha.value = scores.kha; 
  scoreTb.value = scores.tb;
  aiPromptInput.value = result.aiPrompt || DEFAULT_PROMPT;
  syncPromptTemplateSelect(aiPromptInput.value);
  initIdentitySection(result.userIdentity || null);

  fetchAllData(); 
});

function formatKeyCombo(e) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null; 
  let keys = [];
  if (e.ctrlKey) keys.push('Ctrl'); if (e.altKey) keys.push('Alt'); if (e.shiftKey) keys.push('Shift');
  keys.push(e.key === ' ' ? 'Space' : e.key.toUpperCase());
  return keys.join('+');
}

[pasteInput, searchInput, toggleInput].forEach(input => {
  input.addEventListener('keydown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const combo = formatKeyCombo(e);
    if (combo) input.value = combo;
  });
});

if (promptTemplateSelect) {
  promptTemplateSelect.addEventListener('change', () => {
    updatePromptTemplateHint(promptTemplateSelect.value);
  });
}

if (applyPromptTemplateBtn) {
  applyPromptTemplateBtn.addEventListener('click', () => {
    const selectedId = promptTemplateSelect ? promptTemplateSelect.value : PROMPT_TEMPLATE_CUSTOM;
    if (selectedId === PROMPT_TEMPLATE_CUSTOM) {
      updatePromptTemplateHint(selectedId);
      return;
    }

    const template = getPromptTemplateById(selectedId);
    if (!template) return;
    aiPromptInput.value = template.prompt;
    updatePromptTemplateHint(selectedId);
  });
}

if (aiPromptInput) {
  aiPromptInput.addEventListener('input', () => {
    syncPromptTemplateSelect(aiPromptInput.value);
  });
}

saveKeysBtn.addEventListener('click', () => {
  chrome.storage.local.set({ pasteKey: pasteInput.value, searchKey: searchInput.value, toggleKey: toggleInput.value }, () => alert("Đã lưu Phím tắt thành công!"));
});

saveAiBtn.addEventListener('click', () => {
  const scores = { gioi: scoreGioi.value.trim() || '5,5,5,5,5,5,5', kha: scoreKha.value.trim() || '4,4,4,4,4,4,4', tb: scoreTb.value.trim() || '3,3,3,3,3,3,3' };
  chrome.storage.local.set({ geminiApiKey: geminiKeyInput.value.trim(), aiModel: aiModelInput.value, autoTickScores: scores, aiPrompt: aiPromptInput.value.trim() || DEFAULT_PROMPT }, () => alert("Đã lưu Cấu hình AI và Barem!"));
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local' || !changes.userIdentity) return;
  renderIdentity(changes.userIdentity.newValue || null);
});

// ===============================================
// CORE ENGINE: XỬ LÝ DỮ LIỆU CLOUD (ĐÃ FIX XUNG ĐỘT)
// ===============================================

async function fetchAllData() {
  saveTreeState(); // Lưu trạng thái trước khi xóa HTML cũ
  
  treeContainer.innerHTML = '<div style="text-align:center; padding:50px 0; color:#888;">⏳ Đang đồng bộ dữ liệu Cloud...</div>';
  try {
    const requests = Object.values(API_LINKS).map(url => 
      fetch(url)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
           if (Array.isArray(data)) return data.map(item => ({ ...item, _apiOrigin: url }));
           return [];
        })
        .catch(e => [])
    );
    const results = await Promise.all(requests);
    templates = results.flat().filter(t => t && t.id); 
    renderTree();
  } catch (err) {
    treeContainer.innerHTML = '<div style="text-align:center; padding:50px 0; color:red;">❌ Lỗi tải dữ liệu. Hãy F5 lại!</div>';
  }
}

function renderTree() {
  let html = '';
  for (const [subject, data] of Object.entries(COURSE_TREE)) {
    // Đã thêm id để theo dõi thẻ details
    html += `<details id="details-${subject}"><summary>📁 Môn ${subject}</summary><div class="tree-content">`;
    for (const course of data.courses) {
      // Đã thêm id cho cấp khóa học
      html += `<details id="details-${subject}-${course}"><summary class="crs-summary">🎓 Khóa ${course}</summary><div class="tree-content">`;
      for (let i = 1; i <= 14; i++) {
        const expectedTitle = `${subject} - ${course} - Buổi ${i}`;
        
        const t = templates.find(x => {
          if (!x.title) return false;
          if (x._apiOrigin !== COURSE_TREE[subject].api) return false;
          
          const titleClean = x.title.trim().toLowerCase();
          const expectedClean = expectedTitle.toLowerCase();
          const courseClean = course.toLowerCase();
          
          if (titleClean === expectedClean) return true;
          if (titleClean === `${courseClean} buổi ${i}`) return true;
          if (titleClean === `${courseClean} - buổi ${i}`) return true;
          
          const regex = new RegExp(`\\b${courseClean}\\b.*(?:buổi|buoi|b)\\s*0?${i}(?!\\d)`, 'i');
          return regex.test(titleClean);
        });

        const statusHTML = t ? `<span class="badge has-data">✔️ Đã có</span>` : `<span class="badge no-data">Trống</span>`;
        
        html += `<div class="tree-item" id="node-${subject}-${course}-${i}" 
                      data-subject="${subject}" 
                      data-course="${course}" 
                      data-lesson="${i}" 
                      data-id="${t ? t.id : ''}">
                    Buổi ${i} ${statusHTML}
                 </div>`;
      }
      html += `</div></details>`;
    }
    html += `</div></details>`;
  }
  treeContainer.innerHTML = html;

  document.querySelectorAll('.tree-item').forEach(item => {
    item.addEventListener('click', function() {
      const s = this.getAttribute('data-subject');
      const c = this.getAttribute('data-course');
      const l = parseInt(this.getAttribute('data-lesson'));
      const id = this.getAttribute('data-id');
      openEditor(s, c, l, id);
    });
  });

  // Lưu trạng thái ngay khi có bất kỳ thao tác đóng mở nào
  document.querySelectorAll('details').forEach(details => {
      details.addEventListener('toggle', saveTreeState);
  });

  // Tự động khôi phục giao diện đã lưu
  restoreTreeState();
}

function openEditor(subject, course, lesson, existingId) {
  document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`node-${subject}-${course}-${lesson}`).classList.add('active');

  const targetApi = COURSE_TREE[subject].api;
  activeNode = { subject, course, lesson, id: existingId, title: `${subject} - ${course} - Buổi ${lesson}`, api: targetApi };
  
  editorBlocker.style.display = 'none';
  lblEditorPath.textContent = activeNode.title;
  
  if (existingId) {
    const t = templates.find(x => x.id === existingId && x._apiOrigin === targetApi);
    quill.root.innerHTML = t ? t.content : '';
    btnSaveData.innerHTML = '💾 Cập nhật Báo Cáo';
    btnSaveData.style.background = '#ffc107'; 
    btnSaveData.style.color = '#000';
    btnDeleteData.style.display = 'block';
  } else {
    quill.root.innerHTML = '';
    btnSaveData.innerHTML = '+ Thêm Mới Báo Cáo';
    btnSaveData.style.background = '#0056b3';
    btnSaveData.style.color = '#fff';
    btnDeleteData.style.display = 'none';
  }
}

btnSaveData.addEventListener('click', async () => {
  if (!activeNode) return;
  const contentHTML = quill.root.innerHTML; 
  if (!quill.getText().trim()) return alert('Vui lòng nhập nội dung báo cáo!');

  btnSaveData.innerHTML = "⏳ Đang đẩy lên Cloud..."; btnSaveData.disabled = true;

  try {
    const payload = { title: activeNode.title, content: contentHTML };
    const method = activeNode.id ? 'PUT' : 'POST';
    const targetUrl = activeNode.id ? `${activeNode.api}/${activeNode.id}` : activeNode.api;

    await fetch(targetUrl, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    
    cloudStatus.textContent = '✔️ Đã lưu thành công!'; cloudStatus.style.color = 'green';
    setTimeout(() => { cloudStatus.textContent = ''; }, 2000);
    
    editorBlocker.style.display = 'flex';
    editorBlocker.textContent = "✔️ Đã lưu! Đang tải lại cây dữ liệu...";
    await fetchAllData();
  } catch (err) {
    alert('Lỗi khi lưu lên Cloud: ' + err.message);
  } finally {
    btnSaveData.disabled = false;
  }
});

btnDeleteData.addEventListener('click', async () => {
  if (!activeNode || !activeNode.id) return;
  if (!confirm(`Xóa sạch nội dung của [${activeNode.title}] trên Cloud?`)) return;

  btnDeleteData.innerHTML = "⏳ Đang xóa..."; btnDeleteData.disabled = true;
  try {
    await fetch(`${activeNode.api}/${activeNode.id}`, { method: 'DELETE' });
    editorBlocker.style.display = 'flex';
    editorBlocker.textContent = "🗑️ Đã xóa! Đang tải lại cây dữ liệu...";
    await fetchAllData();
  } catch (err) {
    alert('Lỗi khi xóa: ' + err.message);
  } finally {
    btnDeleteData.disabled = false;
  }
});
