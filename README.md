# Pagewise

Pagewise 是一个 Chrome 侧边栏扩展，可以接入 LLM API，并在用户允许时读取当前网页内容，让用户围绕网页内容进行对话。

## 功能

- 以 Chrome 右侧侧边栏形式打开。
- 支持 DeepSeek 和 SiliconFlow 聊天补全 API。
- 支持自定义 OpenAI 兼容供应商，可配置 Base URL、Chat path 和模型 ID。
- API Key 仅保存在本机 Chrome 本地存储中。
- 用户手动输入过的模型 ID 会保存为本地候选项。
- 支持编辑系统提示词。
- 支持设置最近保留几条聊天消息作为会话上下文。
- 支持设置网页上下文字数上限。
- 支持 Markdown 渲染，包括基础表格和列表。
- 支持流式输出，生成过程中先显示纯文本，完成后再渲染 Markdown。
- 支持展示供应商返回的思考内容；思考内容不会再次发送给模型。
- 只有开启“读取当前网页”后才会读取页面内容。
- 网页内容和聊天历史只保存在当前运行内存中，不持久化保存。
- 当前标签页 URL 变化时会自动开始新会话。
- 可以优先保留当前可见弹窗内容，适合读取模型详情、价格弹窗等页面。
- 可以在设置中一次性授权读取所有普通网站，减少逐站点权限确认。
- 可以在 `chrome://extensions/shortcuts` 中为侧边栏绑定快捷键。

## 安装到 Chrome

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目文件夹，也就是包含 `manifest.json` 的目录。
5. 点击扩展图标即可打开 Pagewise 侧边栏。

## 使用说明

1. 打开侧边栏设置。
2. 选择供应商，并填写自己的 API Key。
3. 选择或填写模型 ID。
4. 如果需要让模型参考网页内容，打开“读取当前网页”。
5. 在输入框中针对当前网页提问。

## 权限与隐私

- 不需要后端服务器。
- API Key 不会提交到本仓库，也不会发送到 Pagewise 自己的服务器。
- API Key 只会用于直接请求你选择的模型供应商：
  - DeepSeek: `https://api.deepseek.com/chat/completions`
  - SiliconFlow: `https://api.siliconflow.cn/v1/chat/completions`
- 自定义供应商会请求你配置的 `{Base URL}{Chat path}`。
- 第一次读取某个网站时，Chrome 可能会弹出网站读取权限确认。
- 也可以在设置中点击“一次性允许读取所有网站”，之后普通网站通常不再逐站点弹窗。
- Chrome 内部页面无法读取，例如 `chrome://extensions`、Chrome 网上应用店等。
- 网页内容、聊天内容、思考内容默认只保存在当前会话内存中，重启浏览器后不会保留。

## 当前限制

- 纯图片、Canvas、复杂 PDF 或 OCR 场景暂不支持稳定读取。
- 不会读取 Chrome 内部页面或扩展商店页面。
- 自定义供应商需要兼容 OpenAI Chat Completions 风格接口。
