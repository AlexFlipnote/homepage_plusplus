import { setLocale, translate } from "./utils/i18n.js"
import { createNotepadCore } from "./utils/notepad.js"

// Prevent Ctrl+W from closing the standalone notepad window
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && (e.key === "w" || e.key === "W")) e.preventDefault()
}, { capture: true })

const tabsBar = document.querySelector(".notepad-tabs-bar")
const tabAddBtn = document.querySelector(".notepad-tab-add")
const notepadText = document.getElementById("notepad-text")

chrome.storage.local.get({ notepadTabs: [], notepadActiveTab: 0, language: "", notepadFont: "", notepadFontScale: 1.0, customfont: "", customfontgoogle: false }, (items) => {
  setLocale(items.language)
  document.title = translate(items.language, "notepad.window_title")
  notepadText.placeholder = translate(items.language, "notepad.placeholder")

  // notepadFont overrides global font; if neither set, inherit from CSS
  const fontFamily = items.notepadFont || items.customfont
  if (fontFamily) {
    document.documentElement.style.setProperty("--notepad-font-family", `"${fontFamily}"`)
    // Load Google Font for standalone window if needed
    if (!items.notepadFont && items.customfontgoogle) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = `https://fonts.googleapis.com/css?family=${items.customfont.replace(/ /g, "+")}`
      document.head.appendChild(link)
    }
  }
  if (items.notepadFontScale !== 1.0) {
    document.documentElement.style.setProperty("--notepad-font-scale", items.notepadFontScale)
  }

  const core = createNotepadCore(tabsBar, tabAddBtn, notepadText)
  core.init(items.notepadTabs, items.notepadActiveTab, (tabs, activeTab) => {
    chrome.storage.local.set({ notepadTabs: tabs, notepadActiveTab: activeTab })
  })

  // Save popup window size whenever it's resized
  let resizeTimer = null
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      chrome.storage.local.set({ notepadPopupWidth: window.outerWidth, notepadPopupHeight: window.outerHeight })
    }, 400)
  })

  const settingsKeys = new Set(["notepadFont", "notepadFontScale", "language", "customfont", "customfontgoogle"])

  // Reload on settings changes only
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    if (Object.keys(changes).some(k => settingsKeys.has(k))) location.reload()
  })

  // Sync on focus: refresh from storage when popup window is re-focused
  const notepadRoot = document.getElementById("notepad-window")
  let popupFocused = false
  notepadRoot.addEventListener("focusin", () => {
    if (popupFocused) return
    popupFocused = true
    chrome.storage.local.get({ notepadTabs: [], notepadActiveTab: 0 }, (stored) => {
      core.onExternalChange(stored.notepadTabs, stored.notepadActiveTab)
    })
  })
  notepadRoot.addEventListener("focusout", (e) => {
    if (!notepadRoot.contains(e.relatedTarget)) popupFocused = false
  })
})
