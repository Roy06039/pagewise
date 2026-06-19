# Pagewise

Pagewise 是一个 Chrome 侧边栏扩展，可以接入 LLM API，并在用户允许时读取当前网页内容，让用户围绕网页内容进行对话。

## 它能做什么

- 在浏览器右侧打开一个 AI 对话侧边栏。
- 读取当前网页内容，让你直接追问、总结、解释或提取信息。
- 可以手动关闭网页读取，只把它当普通 AI 聊天窗口使用。
- 支持 DeepSeek、SiliconFlow，也支持填写自定义兼容接口。
- 适合阅读长文章、文档、产品页面、模型介绍、价格说明等网页。
- 回复支持 Markdown，表格、列表等内容会更容易阅读。
- 可以显示模型返回的思考内容，并在回答完成后折叠起来。
- API Key 保存在你自己的浏览器本地，不会上传到这个项目。

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
