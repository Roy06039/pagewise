chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener(async (tab) => {
  await openSidePanel(tab?.windowId);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "open-side-panel") {
    return;
  }

  await openSidePanel(tab?.windowId);
});

async function openSidePanel(windowId) {
  if (!windowId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    windowId = tab?.windowId;
  }

  if (windowId) {
    await chrome.sidePanel.open({ windowId });
  }
}
