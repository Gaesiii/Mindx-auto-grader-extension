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
const aiPromptInput = document.getElementById('aiPromptInput');
const saveAiBtn = document.getElementById('saveAiBtn');

const treeContainer = document.getElementById('treeContainer');
const editorBlocker = document.getElementById('editorBlocker');
const lblEditorPath = document.getElementById('lblEditorPath');
const lblEditorTarget = document.getElementById('lblEditorTarget');
const btnSaveData = document.getElementById('btnSaveData');
const btnDeleteData = document.getElementById('btnDeleteData');
const cloudStatus = document.getElementById('cloudStatus');

const DEFAULT_PROMPT = `Bạn là giáo viên dạy lập trình thân thiện. Dựa vào từ khóa: "{keywords}". Viết thành 3 ý: Điểm mạnh, Điểm cần cải thiện, Lời khuyên.`;

chrome.storage.local.get(['pasteKey', 'searchKey', 'toggleKey', 'geminiApiKey', 'aiModel', 'autoTickScores', 'aiPrompt'], (result) => {
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

saveKeysBtn.addEventListener('click', () => {
  chrome.storage.local.set({ pasteKey: pasteInput.value, searchKey: searchInput.value, toggleKey: toggleInput.value }, () => alert("Đã lưu Phím tắt thành công!"));
});

saveAiBtn.addEventListener('click', () => {
  const scores = { gioi: scoreGioi.value.trim() || '5,5,5,5,5,5,5', kha: scoreKha.value.trim() || '4,4,4,4,4,4,4', tb: scoreTb.value.trim() || '3,3,3,3,3,3,3' };
  chrome.storage.local.set({ geminiApiKey: geminiKeyInput.value.trim(), aiModel: aiModelInput.value, autoTickScores: scores, aiPrompt: aiPromptInput.value.trim() || DEFAULT_PROMPT }, () => alert("Đã lưu Cấu hình AI và Barem!"));
});

// ===============================================
// CORE ENGINE: XỬ LÝ DỮ LIỆU CLOUD (ĐÃ FIX LỖI XUNG ĐỘT ID)
// ===============================================

async function fetchAllData() {
  treeContainer.innerHTML = '<div style="text-align:center; padding:50px 0; color:#888;">⏳ Đang đồng bộ dữ liệu Cloud...</div>';
  try {
    const requests = Object.values(API_LINKS).map(url => 
      fetch(url)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
           // QUAN TRỌNG: Gắn nhãn xuất xứ (URL) vào từng bài báo cáo để chống trùng ID
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
    html += `<details><summary>📁 Môn ${subject}</summary><div class="tree-content">`;
    for (const course of data.courses) {
      html += `<details><summary class="crs-summary">🎓 Khóa ${course}</summary><div class="tree-content">`;
      for (let i = 1; i <= 14; i++) {
        const expectedTitle = `${subject} - ${course} - Buổi ${i}`;
        
        const t = templates.find(x => {
          if (!x.title) return false;
          // CHỈ TÌM TRONG ĐÚNG SERVER CỦA MÔN NÀY (Chống nhận diện nhầm chéo máy chủ)
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
}

function openEditor(subject, course, lesson, existingId) {
  document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`node-${subject}-${course}-${lesson}`).classList.add('active');

  const targetApi = COURSE_TREE[subject].api;
  activeNode = { subject, course, lesson, id: existingId, title: `${subject} - ${course} - Buổi ${lesson}`, api: targetApi };
  
  editorBlocker.style.display = 'none';
  lblEditorPath.textContent = activeNode.title;
  
  if (existingId) {
    // TÌM CHÍNH XÁC ID VÀ ĐÚNG NGUỒN MÁY CHỦ (CHỐNG LỖI HIỂN THỊ LỆCH)
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