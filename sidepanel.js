const DEFAULT_SYSTEM_PROMPT = [
  "你是一个严谨的网页阅读助手。",
  "如果提供了网页上下文，优先依据网页内容回答；网页中没有依据时要说明信息不足。",
  "不要编造网页中不存在的细节。",
  "默认使用中文回答，除非用户明确要求其他语言。",
  "回答可以使用 Markdown，让结构清晰易读。"
].join("\n");

const PROVIDERS = {
  deepseek: {
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-v4-flash",
    modelFallbacks: new Set(["deepseek-v4-flash", "deepseek-v4-pro"]),
    keyPlaceholder: "sk-...",
    requiresApiKey: true
  },
  siliconflow: {
    label: "SiliconFlow",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    defaultModel: "deepseek-ai/DeepSeek-V3.2",
    modelFallbacks: new Set([
      "deepseek-ai/DeepSeek-V3.2",
      "Pro/deepseek-ai/DeepSeek-V3.2",
      "Pro/zai-org/GLM-4.7",
      "Qwen/Qwen3-32B"
    ]),
    keyPlaceholder: "sk-...",
    requiresApiKey: true
  },
  custom: {
    label: "自定义",
    endpoint: "",
    defaultModel: "",
    modelFallbacks: new Set(),
    keyPlaceholder: "可选",
    requiresApiKey: false
  }
};

const DEFAULT_SETTINGS = {
  provider: "deepseek",
  apiKeys: {
    deepseek: "",
    siliconflow: "",
    custom: ""
  },
  models: {
    deepseek: PROVIDERS.deepseek.defaultModel,
    siliconflow: PROVIDERS.siliconflow.defaultModel,
    custom: ""
  },
  customModels: {
    deepseek: [],
    siliconflow: [],
    custom: []
  },
  customProvider: {
    name: "自定义",
    baseUrl: "",
    chatPath: "/chat/completions"
  },
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  thinkingEnabled: false,
  includePageContext: false,
  contextMessageLimit: 8
};

const MAX_PAGE_CONTEXT_CHARS = 12000;
const sessions = new Map();
const chromeApi = globalThis.chrome;

let settings = structuredCloneSettings(DEFAULT_SETTINGS);
let activeTabId = null;
let sending = false;
let pendingRenderTimer = 0;

const els = {
  pageStatus: document.querySelector("#pageStatus"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  providerSelect: document.querySelector("#providerSelect"),
  customProviderFields: document.querySelector("#customProviderFields"),
  customProviderNameInput: document.querySelector("#customProviderNameInput"),
  customBaseUrlInput: document.querySelector("#customBaseUrlInput"),
  customChatPathInput: document.querySelector("#customChatPathInput"),
  apiKeyLabel: document.querySelector("#apiKeyLabel"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  modelInput: document.querySelector("#modelInput"),
  modelSuggestions: document.querySelector("#modelSuggestions"),
  thinkingToggle: document.querySelector("#thinkingToggle"),
  contextLimitInput: document.querySelector("#contextLimitInput"),
  systemPromptInput: document.querySelector("#systemPromptInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  clearKeyButton: document.querySelector("#clearKeyButton"),
  pageContextToggle: document.querySelector("#pageContextToggle"),
  refreshPageButton: document.querySelector("#refreshPageButton"),
  newChatButton: document.querySelector("#newChatButton"),
  contextStatus: document.querySelector("#contextStatus"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadSettings();
  bindEvents();
  await syncActiveTab();
  updateSettingsForm();
  updateContextStatus();
}

function bindEvents() {
  els.settingsButton.addEventListener("click", () => {
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });

  els.providerSelect.addEventListener("change", () => {
    captureCurrentProviderFormValues();
    settings.provider = getProviderKey(els.providerSelect.value);
    updateProviderFields();
    updateContextStatus();
  });

  els.saveSettingsButton.addEventListener("click", saveSettingsFromForm);
  els.clearKeyButton.addEventListener("click", clearApiKey);

  els.pageContextToggle.addEventListener("change", async () => {
    settings.includePageContext = els.pageContextToggle.checked;
    await persistSettings({ includePageContext: settings.includePageContext });
    updateContextStatus();
  });

  els.refreshPageButton.addEventListener("click", async () => {
    await refreshPageContext(true).catch(showError);
  });

  els.newChatButton.addEventListener("click", () => {
    const session = currentSession();
    session.history = [];
    session.pageContext = null;
    session.pageContextUrl = "";
    renderMessages(session);
    addSystemMessage("已开始新会话。下一次需要网页内容时会重新读取当前页。");
    updateContextStatus();
  });

  els.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMessage();
  });

  els.messageInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      await sendMessage();
    }
  });

  if (chromeApi?.tabs?.onActivated) {
    chromeApi.tabs.onActivated.addListener(() => {
      syncActiveTab().catch(showError);
    });
  }

  if (chromeApi?.tabs?.onUpdated) {
    chromeApi.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (tabId === activeTabId && changeInfo.url) {
        handleUrlChange(tabId, changeInfo.url);
      }
    });
  }
}

async function loadSettings() {
  if (!chromeApi?.storage?.local) {
    settings = structuredCloneSettings(DEFAULT_SETTINGS);
    return;
  }

  const stored = await chromeApi.storage.local.get({
    ...DEFAULT_SETTINGS,
    apiKey: "",
    model: ""
  });
  settings = normalizeSettings(stored);
}

function normalizeSettings(value) {
  const migratedApiKeys = {
    ...DEFAULT_SETTINGS.apiKeys,
    ...(value.apiKeys || {})
  };
  const migratedModels = {
    ...DEFAULT_SETTINGS.models,
    ...(value.models || {})
  };
  const migratedCustomModels = {
    ...DEFAULT_SETTINGS.customModels,
    ...(value.customModels || {})
  };
  const migratedCustomProvider = {
    ...DEFAULT_SETTINGS.customProvider,
    ...(value.customProvider || {})
  };

  if (value.apiKey && !migratedApiKeys.deepseek) {
    migratedApiKeys.deepseek = String(value.apiKey);
  }

  if (value.model && !migratedModels.deepseek) {
    migratedModels.deepseek = String(value.model);
  }

  const provider = getProviderKey(value.provider);
  const limit = Number.parseInt(value.contextMessageLimit, 10);
  const systemPrompt = String(value.systemPrompt || "").trim() || DEFAULT_SYSTEM_PROMPT;

  return {
    provider,
    apiKeys: {
      deepseek: String(migratedApiKeys.deepseek || ""),
      siliconflow: String(migratedApiKeys.siliconflow || ""),
      custom: String(migratedApiKeys.custom || "")
    },
    models: {
      deepseek: normalizeModel("deepseek", migratedModels.deepseek),
      siliconflow: normalizeModel("siliconflow", migratedModels.siliconflow),
      custom: normalizeModel("custom", migratedModels.custom)
    },
    customModels: {
      deepseek: normalizeModelList(migratedCustomModels.deepseek),
      siliconflow: normalizeModelList(migratedCustomModels.siliconflow),
      custom: normalizeModelList(migratedCustomModels.custom)
    },
    customProvider: {
      name: String(migratedCustomProvider.name || DEFAULT_SETTINGS.customProvider.name).trim() || DEFAULT_SETTINGS.customProvider.name,
      baseUrl: normalizeBaseUrl(migratedCustomProvider.baseUrl),
      chatPath: normalizeChatPath(migratedCustomProvider.chatPath)
    },
    systemPrompt,
    thinkingEnabled: Boolean(value.thinkingEnabled),
    includePageContext: Boolean(value.includePageContext),
    contextMessageLimit: Number.isFinite(limit) ? clamp(limit, 2, 24) : DEFAULT_SETTINGS.contextMessageLimit
  };
}

function normalizeModel(provider, model) {
  const candidate = String(model || "").trim();
  return candidate || PROVIDERS[provider].defaultModel;
}

function normalizeModelList(models) {
  if (!Array.isArray(models)) {
    return [];
  }

  return [...new Set(models.map((model) => String(model || "").trim()).filter(Boolean))].slice(0, 24);
}

function updateSettingsForm() {
  els.providerSelect.value = settings.provider;
  els.customProviderNameInput.value = settings.customProvider.name;
  els.customBaseUrlInput.value = settings.customProvider.baseUrl;
  els.customChatPathInput.value = settings.customProvider.chatPath;
  els.thinkingToggle.checked = settings.thinkingEnabled;
  els.contextLimitInput.value = String(settings.contextMessageLimit);
  els.systemPromptInput.value = settings.systemPrompt;
  els.pageContextToggle.checked = settings.includePageContext;
  updateProviderFields();
}

function updateProviderFields() {
  const provider = getProviderDefinition(settings.provider);
  const isCustom = settings.provider === "custom";
  els.customProviderFields.hidden = !isCustom;
  els.apiKeyLabel.textContent = `${getProviderLabel(settings.provider)} API Key${provider.requiresApiKey ? "" : "（可选）"}`;
  els.apiKeyInput.placeholder = provider.keyPlaceholder;
  els.apiKeyInput.value = settings.apiKeys[settings.provider] || "";
  els.modelInput.value = settings.models[settings.provider] || provider.defaultModel;
  updateModelSuggestions();
}

async function saveSettingsFromForm() {
  try {
    captureCurrentProviderFormValues();
    const provider = getProviderKey(els.providerSelect.value);
    const model = settings.models[provider];
    if (model) {
      settings.customModels[provider] = addModelSuggestion(settings.customModels[provider], model);
    }

    settings = normalizeSettings({
      provider,
      apiKeys: settings.apiKeys,
      models: settings.models,
      customModels: settings.customModels,
      customProvider: settings.customProvider,
      systemPrompt: els.systemPromptInput.value,
      thinkingEnabled: els.thinkingToggle.checked,
      includePageContext: els.pageContextToggle.checked,
      contextMessageLimit: els.contextLimitInput.value
    });

    if (settings.provider === "custom" && els.customBaseUrlInput.value.trim() && !settings.customProvider.baseUrl) {
      throw new Error("自定义供应商 Base URL 无效，请使用 http:// 或 https:// 开头的地址。");
    }

    if (settings.provider === "custom" && settings.customProvider.baseUrl) {
      await ensureEndpointPermission(getProviderEndpoint("custom"));
    }

    await persistSettings(settings);
    updateSettingsForm();
    updateContextStatus("设置已保存。");
  } catch (error) {
    showError(error);
  }
}

function captureCurrentProviderFormValues() {
  const provider = getProviderKey(settings.provider);
  settings.apiKeys[provider] = els.apiKeyInput.value.trim();
  settings.models[provider] = normalizeModel(provider, els.modelInput.value);
  settings.customProvider = {
    name: els.customProviderNameInput.value.trim() || DEFAULT_SETTINGS.customProvider.name,
    baseUrl: normalizeBaseUrl(els.customBaseUrlInput.value),
    chatPath: normalizeChatPath(els.customChatPathInput.value)
  };
}

async function clearApiKey() {
  const provider = getProviderKey(settings.provider);
  settings.apiKeys[provider] = "";
  els.apiKeyInput.value = "";
  await persistSettings({ apiKeys: settings.apiKeys });
  updateContextStatus(`已清除本地 ${getProviderLabel(provider)} API Key。`);
}

async function persistSettings(partial) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set(partial);
  }
}

async function syncActiveTab() {
  const tab = await getActiveTab();
  if (tab?.id === undefined || tab?.id === null) {
    activeTabId = null;
    els.pageStatus.textContent = "没有可读取的当前标签页";
    renderMessages(null);
    return;
  }

  activeTabId = tab.id;
  const session = getSession(tab);
  els.pageStatus.textContent = getPageLabel(tab);
  renderMessages(session);
  updateContextStatus();
}

function getSession(tab) {
  const existing = sessions.get(tab.id);
  if (existing && existing.url !== tab.url) {
    existing.url = tab.url || "";
    existing.title = tab.title || "";
    existing.history = [];
    existing.pendingAssistant = "";
    existing.pendingReasoning = "";
    existing.pageContext = null;
    existing.pageContextUrl = "";
    existing.notices = ["URL 已变化，已自动开始新会话。"];
    return existing;
  }

  if (existing) {
    existing.title = tab.title || existing.title;
    return existing;
  }

  const session = {
    tabId: tab.id,
    url: tab.url || "",
    title: tab.title || "",
    history: [],
    pendingAssistant: "",
    pendingReasoning: "",
    pageContext: null,
    pageContextUrl: "",
    notices: []
  };
  sessions.set(tab.id, session);
  return session;
}

function handleUrlChange(tabId, url) {
  const session = sessions.get(tabId);
  if (!session) {
    return;
  }

  session.url = url;
  session.history = [];
  session.pendingAssistant = "";
  session.pendingReasoning = "";
  session.pageContext = null;
  session.pageContextUrl = "";
  session.notices = ["URL 已变化，已自动开始新会话。"];
  renderMessages(session);
  updateContextStatus();
}

function currentSession() {
  if (activeTabId !== null && sessions.has(activeTabId)) {
    return sessions.get(activeTabId);
  }

  const fallback = {
    tabId: activeTabId || 0,
    url: "",
    title: "",
    history: [],
    pendingAssistant: "",
    pendingReasoning: "",
    pageContext: null,
    pageContextUrl: "",
    notices: []
  };
  sessions.set(fallback.tabId, fallback);
  return fallback;
}

async function getActiveTab() {
  if (!chromeApi?.tabs?.query) {
    return { id: 0, title: "Preview", url: "file://sidepanel.html" };
  }

  const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendMessage() {
  if (sending) {
    return;
  }

  const userText = els.messageInput.value.trim();
  if (!userText) {
    return;
  }

  captureCurrentProviderFormValues();
  const provider = getProviderKey(settings.provider);
  const apiKey = settings.apiKeys[provider];
  if (getProviderDefinition(provider).requiresApiKey && !apiKey) {
    els.settingsPanel.hidden = false;
    showError(`请先在设置里保存你的 ${getProviderLabel(provider)} API Key。`);
    return;
  }

  await syncActiveTab();
  const session = currentSession();
  session.history.push({ role: "user", content: userText });
  session.pendingAssistant = "正在思考...";
  session.pendingReasoning = "";
  els.messageInput.value = "";
  renderMessages(session);

  setSending(true);

  try {
    if (settings.includePageContext && !session.pageContext) {
      await refreshPageContext(false);
    }

    const messages = buildRequestMessages(session);
    const result = await callProvider(provider, messages, ({ content, reasoning }) => {
      session.pendingAssistant = content || "正在思考...";
      session.pendingReasoning = reasoning || "";
      scheduleRenderMessages(session);
    });
    session.history.push({
      role: "assistant",
      content: result.content,
      reasoning: result.reasoning
    });
    session.pendingAssistant = "";
    session.pendingReasoning = "";
    renderMessages(session);
    updateContextStatus();
  } catch (error) {
    session.pendingAssistant = "";
    session.pendingReasoning = "";
    renderMessages(session);
    showError(error);
  } finally {
    setSending(false);
  }
}

function buildRequestMessages(session) {
  const messages = [
    {
      role: "system",
      content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT
    }
  ];

  if (settings.includePageContext && session.pageContext) {
    messages.push({
      role: "user",
      content: [
        "以下是当前网页上下文，只用于回答后续用户问题：",
        `标题：${session.pageContext.title || session.title || "未命名网页"}`,
        `URL：${session.pageContext.url || session.url || "未知"}`,
        session.pageContext.description ? `摘要：${session.pageContext.description}` : "",
        session.pageContext.selection ? `用户选中文本：${session.pageContext.selection}` : "",
        "正文：",
        session.pageContext.text
      ].filter(Boolean).join("\n")
    });
  }

  const trimmedHistory = session.history.slice(-settings.contextMessageLimit).map((item) => ({
    role: item.role,
    content: item.content
  }));
  return messages.concat(trimmedHistory);
}

async function callProvider(providerKey, messages, onDelta) {
  if (providerKey === "custom") {
    return callCustomProvider(messages, onDelta);
  }

  if (providerKey === "siliconflow") {
    return callSiliconFlow(messages, onDelta);
  }

  return callDeepSeek(messages, onDelta);
}

async function callDeepSeek(messages, onDelta) {
  const body = {
    model: settings.models.deepseek,
    messages,
    thinking: { type: settings.thinkingEnabled ? "enabled" : "disabled" },
    stream: true
  };

  if (settings.thinkingEnabled) {
    body.reasoning_effort = "high";
  }

  return requestChatCompletion("deepseek", body, onDelta);
}

async function callSiliconFlow(messages, onDelta) {
  const body = {
    model: settings.models.siliconflow,
    messages,
    stream: true
  };

  if (settings.thinkingEnabled) {
    body.enable_thinking = true;
    if (/DeepSeek-V4-Flash/i.test(settings.models.siliconflow)) {
      body.reasoning_effort = "high";
    }
  }

  return requestChatCompletion("siliconflow", body, onDelta);
}

async function callCustomProvider(messages, onDelta) {
  if (!settings.customProvider.baseUrl) {
    throw new Error("请先为自定义供应商填写 Base URL。");
  }

  if (!settings.models.custom) {
    throw new Error("请先为自定义供应商填写模型 ID。");
  }

  const body = {
    model: settings.models.custom,
    messages,
    stream: true
  };

  if (settings.thinkingEnabled) {
    body.enable_thinking = true;
  }

  return requestChatCompletion("custom", body, onDelta);
}

async function requestChatCompletion(providerKey, body, onDelta) {
  const endpoint = getProviderEndpoint(providerKey);
  if (providerKey === "custom") {
    await ensureEndpointPermission(endpoint);
  }

  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.apiKeys[providerKey]) {
    headers.Authorization = `Bearer ${settings.apiKeys[providerKey]}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const traceId = response.headers.get("x-siliconcloud-trace-id");
    const message = payload?.error?.message || payload?.message || `${getProviderLabel(providerKey)} 请求失败：HTTP ${response.status}`;
    throw new Error(traceId ? `${message}（trace: ${traceId}）` : message);
  }

  if (body.stream && response.body) {
    const result = await readStreamingCompletion(response, providerKey, onDelta);
    if (!result.content) {
      throw new Error(`${getProviderLabel(providerKey)} 没有返回可显示的回答。`);
    }
    return result;
  }

  const payload = await response.json().catch(() => ({}));
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${getProviderLabel(providerKey)} 没有返回可显示的回答。`);
  }

  return {
    content,
    reasoning: extractReasoning(payload?.choices?.[0]?.message) || ""
  };
}

async function readStreamingCompletion(response, providerKey, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let rawText = "";
  let sawSseData = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim().startsWith("data:")) {
        sawSseData = true;
      }
      const result = consumeSseLine(line, providerKey);
      if (result.content) {
        content += result.content;
      }
      if (result.reasoning) {
        reasoning += result.reasoning;
      }
      if (result.content || result.reasoning) {
        onDelta?.({ content, reasoning });
      }

      if (result.done) {
        await reader.cancel().catch(() => {});
        return { content, reasoning };
      }
    }
  }

  const finalChunk = decoder.decode();
  rawText += finalChunk;
  buffer += finalChunk;
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      if (line.trim().startsWith("data:")) {
        sawSseData = true;
      }
      const result = consumeSseLine(line, providerKey);
      if (result.content) {
        content += result.content;
      }
      if (result.reasoning) {
        reasoning += result.reasoning;
      }
      if (result.content || result.reasoning) {
        onDelta?.({ content, reasoning });
      }
      if (result.done) {
        return { content, reasoning };
      }
    }
  }

  if (!sawSseData && rawText.trim()) {
    try {
      const payload = JSON.parse(rawText);
      const message = payload?.choices?.[0]?.message;
      return {
        content: message?.content || "",
        reasoning: extractReasoning(message) || ""
      };
    } catch (error) {
      return { content: "", reasoning: "" };
    }
  }

  return { content, reasoning };
}

function consumeSseLine(line, providerKey) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) {
    return { content: "", reasoning: "", done: false };
  }

  if (!trimmed.startsWith("data:")) {
    return { content: "", reasoning: "", done: false };
  }

  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") {
    return { content: "", reasoning: "", done: data === "[DONE]" };
  }

  let payload;
  try {
    payload = JSON.parse(data);
  } catch (error) {
    return { content: "", reasoning: "", done: false };
  }

  if (payload?.error) {
    const message = payload.error.message || `${getProviderLabel(providerKey)} 流式响应出错。`;
    throw new Error(message);
  }

  const choice = payload?.choices?.[0];
  const content = choice?.delta?.content || choice?.message?.content || "";
  const reasoning = extractReasoning(choice?.delta) || extractReasoning(choice?.message) || "";
  return {
    content,
    reasoning,
    done: choice?.finish_reason === "stop" || choice?.finish_reason === "length"
  };
}

function extractReasoning(messageLike) {
  if (!messageLike) {
    return "";
  }

  return messageLike.reasoning_content || messageLike.reasoning || messageLike.thinking || "";
}

async function refreshPageContext(showNotice) {
  await syncActiveTab();
  const session = currentSession();

  if (session.tabId === undefined || session.tabId === null) {
    throw new Error("没有可读取的当前标签页。");
  }

  if (!isReadableUrl(session.url)) {
    throw new Error("这个页面不能被扩展读取，例如 chrome://、扩展页面或浏览器内部页面。");
  }

  await ensurePagePermission(session.url);

  setContextStatus("正在读取当前网页...");
  let result;
  try {
    [result] = await chromeApi.scripting.executeScript({
      target: { tabId: session.tabId },
      func: extractPageSnapshot
    });
  } catch (error) {
    throw new Error("读取当前页失败。请确认已经允许扩展读取这个网站，然后刷新网页再试一次。");
  }

  const snapshot = result?.result;
  if (!snapshot?.text) {
    throw new Error("没有从当前网页提取到正文文本。");
  }

  const text = trimText(snapshot.text, MAX_PAGE_CONTEXT_CHARS);
  session.pageContext = {
    ...snapshot,
    text,
    originalLength: snapshot.text.length,
    capturedAt: Date.now()
  };
  session.pageContextUrl = snapshot.url || session.url;

  if (showNotice) {
    addSystemMessage(`已读取当前网页：约 ${text.length.toLocaleString()} 字符。`);
  }

  updateContextStatus();
}

function extractPageSnapshot() {
  const description = document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || "";
  const selection = String(globalThis.getSelection?.() || "").trim();
  const root = document.querySelector("article") || document.querySelector("main") || document.body;
  const clone = root.cloneNode(true);
  const removable = clone.querySelectorAll("script, style, noscript, svg, canvas, iframe, video, audio, form, nav, footer, aside, [hidden]");
  removable.forEach((node) => node.remove());
  const text = (clone.innerText || clone.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return {
    title: document.title,
    url: location.href,
    description: description.trim(),
    selection,
    text
  };
}

function renderMessages(session) {
  els.messages.textContent = "";

  if (!session) {
    addMessage("assistant", "打开一个普通网页后，我就可以读取页面并开始对话。");
    return;
  }

  if (session.notices?.length) {
    for (const notice of session.notices) {
      addMessage("system", notice);
    }
    session.notices = [];
  }

  if (!session.history.length && !session.pendingAssistant) {
    addMessage("assistant", "你好，我可以帮你阅读当前网页。打开“读取当前网页”后提问，我会把本页内容作为上下文；关闭后只按当前对话回答。");
    return;
  }

  for (const item of session.history) {
    addMessage(item.role, item.content, { reasoning: item.reasoning });
  }

  if (session.pendingAssistant) {
    addMessage("assistant", session.pendingAssistant, {
      markdown: false,
      reasoning: session.pendingReasoning,
      reasoningPending: Boolean(session.pendingReasoning)
    });
  }
}

function scheduleRenderMessages(session) {
  if (pendingRenderTimer) {
    return;
  }

  pendingRenderTimer = setTimeout(() => {
    pendingRenderTimer = 0;
    renderMessages(session);
  }, 80);
}

function addSystemMessage(text) {
  addMessage("system", text);
}

function addMessage(role, content, options = {}) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  renderBubbleContent(bubble, role, content, options.markdown);
  if (role === "assistant" && options.reasoning) {
    item.append(createReasoningPanel(options.reasoning, options.reasoningPending));
  }
  item.append(bubble);
  els.messages.append(item);
  els.messages.scrollTop = els.messages.scrollHeight;
  return item;
}

function createReasoningPanel(reasoning, pending = false) {
  const details = document.createElement("details");
  details.className = "reasoning-panel";
  details.open = pending;

  const summary = document.createElement("summary");
  summary.textContent = pending ? "思考中" : "思考过程";

  const body = document.createElement("div");
  body.className = "reasoning-content";
  body.textContent = reasoning;

  details.append(summary, body);
  return details;
}

function renderBubbleContent(bubble, role, content, markdownOverride) {
  bubble.textContent = "";
  bubble.classList.remove("plain", "markdown");
  const renderMarkdown = markdownOverride ?? role === "assistant";

  if (!renderMarkdown) {
    bubble.classList.add("plain");
    bubble.textContent = content;
    return;
  }

  bubble.classList.add("markdown");
  bubble.append(...renderMarkdownBlocks(content));
}

function renderMarkdownBlocks(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const nodes = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;
  let inFence = false;
  let fenceLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    const p = document.createElement("p");
    appendInlineMarkdown(p, paragraph.join(" "));
    nodes.push(p);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) {
      return;
    }
    const list = document.createElement(listType);
    for (const itemText of listItems) {
      const li = document.createElement("li");
      appendInlineMarkdown(li, itemText);
      list.append(li);
    }
    nodes.push(list);
    listItems = [];
    listType = null;
  };

  const flushCode = () => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = fenceLines.join("\n");
    pre.append(code);
    nodes.push(pre);
    fenceLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inFence) {
        flushCode();
        inFence = false;
      } else {
        flushParagraph();
        flushList();
        inFence = true;
        fenceLines = [];
      }
      continue;
    }

    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const h = document.createElement(`h${heading[1].length}`);
      appendInlineMarkdown(h, heading[2]);
      nodes.push(h);
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      const blockquote = document.createElement("blockquote");
      appendInlineMarkdown(blockquote, quote[1]);
      nodes.push(blockquote);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const desiredType = unordered ? "ul" : "ol";
      if (listType && listType !== desiredType) {
        flushList();
      }
      listType = desiredType;
      listItems.push(unordered?.[1] || ordered?.[1] || "");
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (inFence) {
    flushCode();
  }
  flushParagraph();
  flushList();

  if (!nodes.length) {
    const p = document.createElement("p");
    p.textContent = source;
    nodes.push(p);
  }

  return nodes;
}

function appendInlineMarkdown(parent, text) {
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[2] && match[3]) {
      parent.append(createSafeLink(match[2], match[3]));
    } else if (match[4]) {
      const code = document.createElement("code");
      code.textContent = match[4];
      parent.append(code);
    } else if (match[5]) {
      const strong = document.createElement("strong");
      strong.textContent = match[5];
      parent.append(strong);
    } else if (match[6]) {
      const em = document.createElement("em");
      em.textContent = match[6];
      parent.append(em);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.append(document.createTextNode(text.slice(lastIndex)));
  }
}

function createSafeLink(label, href) {
  const safeHref = normalizeSafeHref(href);
  if (!safeHref) {
    return document.createTextNode(label);
  }

  const link = document.createElement("a");
  link.textContent = label;
  link.href = safeHref;
  link.target = "_blank";
  link.rel = "noreferrer";
  return link;
}

function normalizeSafeHref(href) {
  const trimmed = String(href || "").trim();
  if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
      return "";
    }
    return url.href;
  } catch (error) {
    return "";
  }
}

function setSending(value) {
  sending = value;
  els.sendButton.disabled = value;
  els.refreshPageButton.disabled = value;
  els.messageInput.disabled = value;
}

function updateContextStatus(prefix) {
  const session = currentSession();
  els.contextStatus.classList.remove("error");

  if (prefix) {
    setContextStatus(prefix);
    return;
  }

  const provider = getProviderLabel(settings.provider);
  if (!settings.includePageContext) {
    setContextStatus(`${provider}；网页上下文关闭。请求会保留最近 ${settings.contextMessageLimit} 条聊天消息。`);
    return;
  }

  if (session.pageContext) {
    const count = session.pageContext.text.length.toLocaleString();
    setContextStatus(`${provider}；网页上下文开启。已读取约 ${count} 字符；请求保留最近 ${settings.contextMessageLimit} 条聊天消息。`);
    return;
  }

  setContextStatus(`${provider}；网页上下文开启。发送前会读取当前页；请求保留最近 ${settings.contextMessageLimit} 条聊天消息。`);
}

function setContextStatus(text) {
  els.contextStatus.textContent = text;
}

function showError(error) {
  const message = typeof error === "string" ? error : error.message || String(error);
  els.contextStatus.classList.add("error");
  els.contextStatus.textContent = message;
  addMessage("system", message);
}

function getPageLabel(tab) {
  if (tab.title) {
    return tab.title;
  }
  return tab.url || "当前标签页";
}

function isReadableUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

async function ensurePagePermission(url) {
  if (!chromeApi?.permissions) {
    return;
  }

  const origin = getOriginPattern(url);
  const hasPermission = await chromeApi.permissions.contains({ origins: [origin] });
  if (hasPermission) {
    return;
  }

  setContextStatus("需要授权读取当前网站...");
  const granted = await chromeApi.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error("你还没有授权扩展读取当前网站，因此无法获取网页内容。");
  }
}

async function ensureEndpointPermission(endpoint) {
  if (!chromeApi?.permissions) {
    return;
  }

  const origin = getOriginPattern(endpoint);
  const hasPermission = await chromeApi.permissions.contains({ origins: [origin] });
  if (hasPermission) {
    return;
  }

  setContextStatus(`需要授权访问 ${new URL(endpoint).host}...`);
  const granted = await chromeApi.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error("你还没有授权扩展访问这个 API 地址，因此无法请求自定义供应商。");
  }
}

function getOriginPattern(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/*`;
}

function getProviderKey(value) {
  if (value === "siliconflow" || value === "custom") {
    return value;
  }

  return "deepseek";
}

function getProviderDefinition(providerKey) {
  return PROVIDERS[getProviderKey(providerKey)];
}

function getProviderLabel(providerKey) {
  if (providerKey === "custom") {
    return settings.customProvider.name || PROVIDERS.custom.label;
  }

  return PROVIDERS[getProviderKey(providerKey)].label;
}

function getProviderEndpoint(providerKey) {
  if (providerKey === "custom") {
    return joinEndpoint(settings.customProvider.baseUrl, settings.customProvider.chatPath);
  }

  return PROVIDERS[getProviderKey(providerKey)].endpoint;
}

function joinEndpoint(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error("请先填写有效的 Base URL，例如 https://api.example.com/v1。");
  }

  const chatPath = normalizeChatPath(path);
  return `${base}${chatPath}`;
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch (error) {
    return "";
  }
}

function normalizeChatPath(value) {
  const trimmed = String(value || "").trim() || DEFAULT_SETTINGS.customProvider.chatPath;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function addModelSuggestion(existing, model) {
  const normalized = normalizeModelList(existing);
  const cleanModel = String(model || "").trim();
  if (!cleanModel) {
    return normalized;
  }

  return [cleanModel, ...normalized.filter((item) => item !== cleanModel)].slice(0, 24);
}

function updateModelSuggestions() {
  const provider = getProviderKey(settings.provider);
  const builtIn = [...PROVIDERS[provider].modelFallbacks];
  const custom = normalizeModelList(settings.customModels[provider]);
  const models = [...new Set([...custom, ...builtIn])];
  els.modelSuggestions.textContent = "";

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    els.modelSuggestions.append(option);
  }
}

function trimText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n[内容过长，已截断至前 ${maxLength.toLocaleString()} 字符。]`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function structuredCloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}
