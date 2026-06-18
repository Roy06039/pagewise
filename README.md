# Pagewise DeepSeek Sidebar

Chrome Manifest V3 side panel extension for chatting with DeepSeek about the current page.

## What it does

- Opens as a Chrome right side panel.
- Supports DeepSeek and SiliconFlow chat completion APIs.
- Supports a custom OpenAI-compatible provider with configurable Base URL and chat path.
- Stores each provider's API Key locally with `chrome.storage.local`.
- Saves manually entered model IDs as local suggestions for that provider.
- Renders assistant replies as a safe Markdown subset.
- Streams assistant replies as plain text while generating, then renders Markdown after completion.
- Shows provider-returned reasoning content in a collapsible section when available.
- Keeps reasoning content out of future chat context; only assistant `content` is sent back to the model.
- Lets the user edit the system prompt.
- Reads the active page only when the "读取当前网页" switch is on.
- Requests permission for the current website the first time page reading is used there.
- Keeps temporary per-tab chat context in memory.
- Automatically starts a fresh session when the active tab URL changes.
- Lets the user choose how many recent chat messages are sent as context.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this folder: `D:\royra\Documents\Browser Sidebar`.
5. Click the extension icon to open the side panel.

## Notes

- No backend server is required.
- API Keys are not sent anywhere except directly to the selected provider:
  - DeepSeek: `https://api.deepseek.com/chat/completions`
  - SiliconFlow: `https://api.siliconflow.cn/v1/chat/completions`
- Custom providers use the configured `{Base URL}{Chat path}` endpoint and may trigger a Chrome permission prompt for that API host.
- The first page read on a site may trigger a Chrome permission prompt for that site's origin.
- Chrome internal pages such as `chrome://extensions` cannot be read by extensions.
