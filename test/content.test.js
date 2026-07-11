const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('../../../backend/node_modules/playwright-core');

const extensionRoot = path.join(__dirname, '..');
const workspaceRoot = path.join(extensionRoot, '..', '..');
const autoGraderContentPath = path.join(extensionRoot, 'content.js');

const BULK_EXPORTS = `
window.__acpInjectEvaluationPanel = injectEvaluationPanel;
window.__acpGetEvaluationContext = getEvaluationContext;
window.__acpMapBatchCommentsByStudentId = mapBatchCommentsByStudentId;
window.__acpNormalizeStudentNameForMatch = normalizeStudentNameForMatch;
window.__acpResolveBatchItemByStudentName = resolveBatchItemByStudentName;
window.__acpProcessBulkStudentWithComment = processBulkStudentWithComment;
window.__acpGetBulkSaveButton = getBulkSaveButton;
window.__acpDialogLikelyBelongsToStudent = dialogLikelyBelongsToStudent;
`;

async function launchInjectedPage({ html, scriptExtra = BULK_EXPORTS } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const scriptSource = fs.readFileSync(autoGraderContentPath, 'utf8');

  await page.setContent(html || '<!doctype html><html><body></body></html>', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const realSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args) => realSetTimeout(handler, Math.min(Number(timeout) || 0, 1), ...args);
    window.chrome = {
      runtime: {
        lastError: null,
        sendMessage(_message, callback) {
          if (callback) callback({});
        }
      },
      storage: {
        local: {
          get(_keys, callback) {
            callback({ isExtensionEnabled: true });
          },
          set(_value, callback) {
            if (callback) callback();
          }
        },
        onChanged: { addListener() {} }
      }
    };
    document.execCommand = document.execCommand || (() => true);
  });

  await page.evaluate((source) => {
    window.eval(source);
  }, `${scriptSource}\n${scriptExtra}`);

  return { browser, page };
}

async function withInjectedAutoGrader(fixtureName, run) {
  const html = fs.readFileSync(path.join(workspaceRoot, fixtureName), 'utf8');
  const { browser, page } = await launchInjectedPage({ html });
  try {
    await run(page);
  } finally {
    await browser.close();
  }
}

function buildBulkRosterHtml() {
  return `<!doctype html>
<html>
<body>
  <table id="roster">
    <tr>
      <td><span class="name-display">Nguyễn Văn An</span></td>
      <td><button type="button" data-student="an">Nhận xét học sinh</button></td>
    </tr>
    <tr>
      <td><span class="name-display">Trần Thị Bình</span></td>
      <td><button type="button" data-student="binh">Nhận xét học sinh</button></td>
    </tr>
  </table>
  <div id="dialog-host"></div>
  <script>
    window.__saveClickCount = 0;
    window.__openStudent = null;
    document.querySelectorAll('button[data-student]').forEach((button) => {
      button.addEventListener('click', () => {
        const student = button.getAttribute('data-student');
        window.__openStudent = student;
        const host = document.getElementById('dialog-host');
        const title = student === 'an' ? 'Nguyễn Văn An' : 'Trần Thị Bình';
        host.innerHTML = \`
          <div role="dialog" class="modal" style="display:block">
            <h3>Nhận xét - \${title}</h3>
            <div class="ql-editor" contenteditable="true"></div>
            <button type="button" id="lms-save-btn">Lưu</button>
            <button type="button" id="lms-close-btn">Đóng</button>
          </div>
        \`;
        const saveBtn = document.getElementById('lms-save-btn');
        const closeBtn = document.getElementById('lms-close-btn');
        saveBtn.addEventListener('click', () => {
          window.__saveClickCount += 1;
          host.innerHTML = '';
        });
        closeBtn.addEventListener('click', () => {
          host.innerHTML = '';
        });
      });
    });
  </script>
</body>
</html>`;
}

test('Auto Grader shows AI comment panel for LMS checkpoint comment dialogs', async () => {
  await withInjectedAutoGrader('checkpoint-nhanxet.txt', async (page) => {
    const result = await page.evaluate(() => {
      const context = window.__acpGetEvaluationContext();
      window.__acpInjectEvaluationPanel();
      return {
        hasContext: Boolean(context),
        radioCount: context?.radios?.length || 0,
        editorCount: context?.editors?.length || 0,
        hasPanel: Boolean(document.getElementById('acp-eval-panel')),
        hasAiButton: Boolean(document.getElementById('btn-gen-ai')),
        hasScoreButtons: ['btn-gioi', 'btn-kha', 'btn-tb'].every((id) => document.getElementById(id))
      };
    });

    assert.equal(result.hasContext, true);
    assert.equal(result.editorCount, 1);
    assert.ok(result.radioCount >= 20);
    assert.equal(result.hasPanel, true);
    assert.equal(result.hasAiButton, true);
    assert.equal(result.hasScoreButtons, true);
  });
});

test('Auto Grader shows AI comment panel for LMS non-checkpoint comment dialogs without score radios', async () => {
  await withInjectedAutoGrader('khongphaicheckpoint-nhanxet.txt', async (page) => {
    const result = await page.evaluate(() => {
      const context = window.__acpGetEvaluationContext();
      window.__acpInjectEvaluationPanel();
      return {
        hasContext: Boolean(context),
        radioCount: context?.radios?.length || 0,
        editorCount: context?.editors?.length || 0,
        hasPanel: Boolean(document.getElementById('acp-eval-panel')),
        hasAiButton: Boolean(document.getElementById('btn-gen-ai')),
        hasScoreButtons: ['btn-gioi', 'btn-kha', 'btn-tb'].every((id) => document.getElementById(id))
      };
    });

    assert.equal(result.hasContext, true);
    assert.equal(result.radioCount, 0);
    assert.equal(result.editorCount, 1);
    assert.equal(result.hasPanel, true);
    assert.equal(result.hasAiButton, true);
    assert.equal(result.hasScoreButtons, false);
  });
});

test('mapBatchCommentsByStudentId maps known student_id and normalized names', async () => {
  const { browser, page } = await launchInjectedPage();
  try {
    const result = await page.evaluate(() => {
      const batchItems = [
        { studentId: 'S1', student: { name: 'Nguyễn Văn An' }, keyword: 'ngoan' },
        { studentId: 'S2', student: { name: 'Trần Thị Bình' }, keyword: 'chăm chỉ' }
      ];

      const byId = window.__acpMapBatchCommentsByStudentId({
        comments: [
          { student_id: 'S2', comment: 'Nhan xet Binh' },
          { student_id: 'S1', comment: 'Nhan xet An' }
        ]
      }, batchItems);

      const byName = window.__acpMapBatchCommentsByStudentId({
        comments: [
          { student_name: 'nguyen van an', comment: 'An normalized' },
          { student_name: 'TRAN THI BINH', comment: 'Binh normalized' }
        ]
      }, batchItems);

      return {
        byId,
        byName,
        normalized: window.__acpNormalizeStudentNameForMatch('  Nguyễn   Văn An ')
      };
    });

    assert.equal(result.normalized, 'nguyen van an');
    assert.equal(result.byId.commentsByStudentId.S1.includes('Nhan xet An'), true);
    assert.equal(result.byId.commentsByStudentId.S2.includes('Nhan xet Binh'), true);
    assert.deepEqual(result.byId.missingStudentIds, []);
    assert.equal(result.byName.commentsByStudentId.S1.includes('An normalized'), true);
    assert.equal(result.byName.commentsByStudentId.S2.includes('Binh normalized'), true);
    assert.deepEqual(result.byName.missingStudentIds, []);
  } finally {
    await browser.close();
  }
});

test('mapBatchCommentsByStudentId is fail-closed for unknown id, ambiguous names, and conflicts', async () => {
  const { browser, page } = await launchInjectedPage();
  try {
    const result = await page.evaluate(() => {
      const batchItems = [
        { studentId: 'S1', student: { name: 'Nguyễn Văn An' }, keyword: 'a' },
        { studentId: 'S2', student: { name: 'Nguyễn Văn An' }, keyword: 'b' },
        { studentId: 'S3', student: { name: 'Lê Minh Cường' }, keyword: 'c' }
      ];

      const unknownId = window.__acpMapBatchCommentsByStudentId({
        comments: [{ student_id: 'S99', student_name: 'Không Tồn Tại', comment: 'spam first?' }]
      }, batchItems);

      const ambiguous = window.__acpMapBatchCommentsByStudentId({
        comments: [{ student_name: 'Nguyễn Văn An', comment: 'ambiguous twin' }]
      }, batchItems);

      const conflict = window.__acpMapBatchCommentsByStudentId({
        comments: [
          { student_id: 'S3', comment: 'first' },
          { student_id: 'S3', comment: 'second different' }
        ]
      }, batchItems);

      // Must never invent a fallback to the first student when unmatched.
      const noFirstStudentFallback = !Object.keys(unknownId.commentsByStudentId).length
        && !Object.keys(ambiguous.commentsByStudentId).length
        && !Object.keys(conflict.commentsByStudentId).length;

      return { unknownId, ambiguous, conflict, noFirstStudentFallback };
    });

    assert.equal(result.noFirstStudentFallback, true);
    assert.deepEqual(result.unknownId.commentsByStudentId, {});
    assert.ok(result.unknownId.missingStudentIds.includes('S1'));
    assert.ok(result.ambiguous.ambiguousStudentIds.includes('S1'));
    assert.ok(result.ambiguous.ambiguousStudentIds.includes('S2'));
    assert.ok(result.conflict.ambiguousStudentIds.includes('S3') || result.conflict.missingStudentIds.includes('S3'));
    assert.equal(Object.keys(result.conflict.commentsByStudentId).length, 0);
  } finally {
    await browser.close();
  }
});

test('bulk process pastes comment but never auto-clicks LMS Save', async () => {
  const { browser, page } = await launchInjectedPage({ html: buildBulkRosterHtml() });
  try {
    const started = await page.evaluate(() => {
      const student = { key: '0|Nguyễn Văn An', name: 'Nguyễn Văn An' };
      window.__bulkPromise = window.__acpProcessBulkStudentWithComment(student, 'Comment for An only', {
        allStudentNames: ['Nguyễn Văn An', 'Trần Thị Bình']
      });
      return true;
    });
    assert.equal(started, true);

    await page.waitForFunction(() => {
      const editor = document.querySelector('[role="dialog"] .ql-editor');
      return Boolean(editor && (editor.innerText || editor.textContent || '').includes('Comment for An only'));
    }, { timeout: 5000 });

    const midState = await page.evaluate(() => ({
      openStudent: window.__openStudent,
      saveClickCount: window.__saveClickCount,
      hasDialog: Boolean(document.querySelector('[role="dialog"]')),
      editorText: document.querySelector('[role="dialog"] .ql-editor')?.innerText || '',
      hasSkipButton: Boolean(document.getElementById('acp-bulk-skip-current'))
    }));

    assert.equal(midState.openStudent, 'an');
    assert.equal(midState.saveClickCount, 0);
    assert.equal(midState.hasDialog, true);
    assert.match(midState.editorText, /Comment for An only/);

    // User manually saves.
    await page.click('#lms-save-btn');

    const finalStatus = await page.evaluate(async () => {
      const result = await window.__bulkPromise;
      return {
        result,
        saveClickCount: window.__saveClickCount,
        hasDialog: Boolean(document.querySelector('[role="dialog"]'))
      };
    });

    assert.equal(finalStatus.result.status, 'closed');
    assert.equal(finalStatus.saveClickCount, 1);
    assert.equal(finalStatus.hasDialog, false);
  } finally {
    await browser.close();
  }
});

test('dialog ownership check blocks paste target when another student name is visible', async () => {
  const { browser, page } = await launchInjectedPage({
    html: `<!doctype html><html><body>
      <div role="dialog" id="dlg" style="display:block">
        <h3>Nhận xét - Trần Thị Bình</h3>
        <div class="ql-editor" contenteditable="true"></div>
        <button type="button">Lưu</button>
      </div>
    </body></html>`
  });
  try {
    const result = await page.evaluate(() => {
      const dialog = document.getElementById('dlg');
      return {
        forAn: window.__acpDialogLikelyBelongsToStudent(
          dialog,
          'Nguyễn Văn An',
          ['Nguyễn Văn An', 'Trần Thị Bình']
        ),
        forBinh: window.__acpDialogLikelyBelongsToStudent(
          dialog,
          'Trần Thị Bình',
          ['Nguyễn Văn An', 'Trần Thị Bình']
        )
      };
    });

    assert.equal(result.forAn, false);
    assert.equal(result.forBinh, true);
  } finally {
    await browser.close();
  }
});
