const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('../../../backend/node_modules/playwright-core');

const extensionRoot = path.join(__dirname, '..');
const workspaceRoot = path.join(extensionRoot, '..', '..');
const autoGraderContentPath = path.join(extensionRoot, 'content.js');

async function withInjectedAutoGrader(fixtureName, run) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const html = fs.readFileSync(path.join(workspaceRoot, fixtureName), 'utf8');
  const scriptSource = fs.readFileSync(autoGraderContentPath, 'utf8');

  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
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
      window.eval(`${source}
window.__acpInjectEvaluationPanel = injectEvaluationPanel;
window.__acpGetEvaluationContext = getEvaluationContext;`);
    }, scriptSource);

    await run(page);
  } finally {
    await browser.close();
  }
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
        hasScoreButtons: ['btn-gioi', 'btn-kha', 'btn-tb'].every(id => document.getElementById(id))
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
        hasScoreButtons: ['btn-gioi', 'btn-kha', 'btn-tb'].every(id => document.getElementById(id))
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
