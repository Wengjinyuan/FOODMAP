# 美食地图 - 项目指令

## 识图能力

底层模型不具备原生视觉能力。遇到图片时，**不要用 Read 工具**，改用以下方式：

### AI 视觉理解（vision.js）

适用于：UI截图、图表、照片、设计稿等**需要理解画面内容**的场景。

```
node scripts/vision.js "<图片路径>" "用中文描述这张图片"
```

支持本地路径和网络 URL：`node scripts/vision.js --url "https://..." "描述问题"`

### OCR 文字提取（MinerU）

适用于：文档 PDF、带文字的截图（报错信息、代码等）**只需提取文字**的场景。

直接调用 `parse_documents` MCP 工具：
```
parse_documents(urls: "<文件路径>")
```

### 选择策略

| 场景 | 用什么 |
|------|--------|
| 报错截图、代码截图、PDF → 提取文字即可 | MinerU `parse_documents` |
| UI设计图、图表、照片 → 需要理解画面 | `node scripts/vision.js` |
| 不确定 → 两个都跑 | 先 OCR 后 vision |

## 截图自动 OCR（已配置 hook）

`UserPromptSubmit` hook 会自动检测 `screenshots/` 目录中的新文件，用 MinerU 解析后注入上下文。用户只需保存截图到该目录 + 打字提问。

## 项目技术栈

- 微信小程序 (miniprogram/)
- 云开发 CloudBase (cloudfunctions/)
