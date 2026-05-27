#!/usr/bin/env node
/**
 * UserPromptSubmit Hook — 自动解析 screenshots/ 中的新截图
 * stdout 输出的纯文本会自动注入到 Claude Code 对话上下文
 *
 * 用法：截图保存到 screenshots/ → 打字提问 → hook 自动 OCR → deepseek 直接分析
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');
const TRACKING_FILE = path.join(SCREENSHOTS_DIR, '.processed.json');
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.pdf', '.docx', '.pptx']);
const TIMEOUT = 120000;

function loadProcessed() {
  try {
    if (fs.existsSync(TRACKING_FILE)) return new Set(JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8')));
  } catch { /* corrupt */ }
  return new Set();
}

function saveProcessed(set) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify([...set], null, 2), 'utf8');
}

function findNew(processed) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) return [];
  return fs.readdirSync(SCREENSHOTS_DIR).filter(f => EXTS.has(path.extname(f).toLowerCase()) && !processed.has(f));
}

function parseFile(filePath) {
  // flash-extract: Free, No Auth, fast
  // 如果精度不够，改成 extract（需要先 mineru-open-api auth）
  try {
    return execSync(`npx -y mineru-open-api flash-extract "${filePath}"`, {
      timeout: TIMEOUT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    }).trim();
  } catch (err) {
    return `[解析失败: ${path.basename(filePath)}] ${err.stderr || err.message}`;
  }
}

// --- main ---
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
const processed = loadProcessed();
const newFiles = findNew(processed);

if (newFiles.length === 0) process.exit(0);

const results = [];
for (const f of newFiles) {
  results.push(`### 文件: ${f}\n${parseFile(path.join(SCREENSHOTS_DIR, f))}`);
  processed.add(f);
}
saveProcessed(processed);

process.stdout.write(`📸 [自动OCR] screenshots/ 中新解析了 ${newFiles.length} 个文件:\n\n${results.join('\n\n---\n\n')}`);
process.exit(0);
