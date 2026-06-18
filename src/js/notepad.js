import { setLocale, translate } from "./utils/i18n.js"
import { createNotepadCore } from "./utils/notepad.js"

const tabsBar = document.querySelector(".notepad-tabs-bar")
const tabAddBtn = document.querySelector(".notepad-tab-add")
const notepadText = document.getElementById("notepad-text")

chrome.storage.local.get({ notepadTabs: [], notepadActiveTab: 0, language: "" }, (items) => {
  setLocale(items.language)
  document.title = translate(items.language, "notepad.window_title")
  notepadText.placeholder = translate(items.language, "notepad.placeholder")

  const core = createNotepadCore(tabsBar, tabAddBtn, notepadText)
  core.init(items.notepadTabs, items.notepadActiveTab, (tabs, activeTab) => {
    chrome.storage.local.set({ notepadTabs: tabs, notepadActiveTab: activeTab })
  })

  // Real-time sync with the homepage widget
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    if (!changes.notepadTabs && !changes.notepadActiveTab) return
    const newTabs = changes.notepadTabs?.newValue ?? core.getTabs()
    const newActiveTab = changes.notepadActiveTab?.newValue ?? core.getActiveTab()
    core.onExternalChange(newTabs, newActiveTab)
  })
})
