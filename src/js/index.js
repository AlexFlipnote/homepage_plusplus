import { isFirefox, isExtension, getVersion } from "./utils/browser"
import { extensionSettings } from "./options.js"
import { getWeather } from "./utils/weather.js"
import { HexClock, Clock, TumblerClock, AnalogClock, UnixClock, CLOCK_STYLE } from "./utils/timeManager.js"
import { availableLanguages, setLocale, translate, getLocale } from "./utils/i18n.js"
import { runMigrations } from "./utils/migrate.js"
import { createNotepadCore } from "./utils/notepad.js"

const DEFAULT = {
  backgroundImagesCount: 31
}

function faviconURL(u) {
  return chrome.runtime.getURL(
    `/_favicon/?pageUrl=${u}&size=32`
  )
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

class ManualPosition {
  constructor(lat, lon) {
    this.coords = {
      latitude: lat,
      longitude: lon
    }
  }
}

function createBookmark(
  el, name, url,
  {
    bookmarksFavicon = false,
    isAuto = false,
    localFavicon = ""
  } = {}
) {
  const container = document.createElement("a")
  container.href = url
  container.title = name

  if (isAuto) {
    container.setAttribute("data-auto", "true")
  }

  if (!isFirefox && bookmarksFavicon) {
    const bIcon = document.createElement("img")
    bIcon.src = faviconURL(url)
    bIcon.className = "bookmark-icon"
    container.appendChild(bIcon)
  }

  if (localFavicon.length > 0) {
    const bIcon = document.createElement("img")
    bIcon.src = localFavicon
    bIcon.className = "bookmark-icon"
    container.appendChild(bIcon)
  }

  const bName = document.createElement("span")
  bName.textContent = name
  container.appendChild(bName)

  el.appendChild(container)
}

if (isExtension) {
  // Extension mode
  console.log(`☑️ Running in extension mode (v${getVersion()})`)
  runMigrations()

  const runtimeOnlyKeys = ["notepadTabs", "notepadActiveTab", "notepadOpen", "notepadWidth", "notepadHeight", "notepadPopupId", "notepadPopupWidth", "notepadPopupHeight"]
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    const hasSettingChange = Object.keys(changes).some(k => k in extensionSettings && !runtimeOnlyKeys.includes(k))
    if (hasSettingChange) location.reload()
  })

  document.getElementById("search-form").onsubmit = (e) => {
    e.preventDefault()
    chrome.search.query({
      text: document.getElementById("search-input").value
    })
  }

  chrome.storage.local.get({ ...extensionSettings }, function(items) {
    if (items.animations) {
      document.body.classList.remove("no-animations")
    }

    // Start by setting language
    setLocale(items.language)
    const defaultTime = translate(items.language, items.time_12h ? "time.format.default_12h" : "time.format.default")
    const defaultDate = translate(items.language, "date.format.default")

    if (items.disableTextShadow) {
      document.body.classList.add("no-text-shadow")
    }

    if (items.uiScale && items.uiScale !== 1.0) {
      document.documentElement.style.setProperty("--ui-scale-global", items.uiScale)
    }

    if (items.show_time) {
      const style = items.clock_style
      const fmt = items.fmt_time || defaultTime

      if (style === CLOCK_STYLE.SWISS) {
        new AnalogClock("time").start()
      } else if (items.clock_tumbler) {
        const timeEl = document.getElementById("time")
        let tumblerFmt
        if (style === CLOCK_STYLE.HEX) {
          tumblerFmt = () => {
            const pad = n => ("0" + n).slice(-2)
            const now = new Date()
            const hex = `#${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
            timeEl.style.color = hex
            return hex
          }
        } else if (style === CLOCK_STYLE.UNIX) {
          tumblerFmt = () => String(Math.floor(Date.now() / 1000))
        } else {
          tumblerFmt = fmt
        }
        new TumblerClock("time", tumblerFmt).start()
      } else if (style === CLOCK_STYLE.HEX) {
        new HexClock("time", { color: true, text: true }).start()
      } else if (style === CLOCK_STYLE.UNIX) {
        new UnixClock("time").start()
      } else {
        new Clock("time", fmt).start()
      }
    }

    const root = document.documentElement

    if (items.scaleClock) root.style.setProperty("--ui-scale-clock", items.scaleClock)
    if (items.scaleDate) root.style.setProperty("--ui-scale-date", items.scaleDate)
    if (items.scaleSearchbar) root.style.setProperty("--ui-scale-searchbar", items.scaleSearchbar)
    if (items.scaleWeather) root.style.setProperty("--ui-scale-weather", items.scaleWeather)
    if (items.scaleBookmarks) root.style.setProperty("--ui-scale-bookmarks", items.scaleBookmarks)
    if (items.scaleIcon) root.style.setProperty("--ui-scale-icon", items.scaleIcon)

    if (items.colour_global) {
      root.style.setProperty("--font-primary", items.colour_global)
      root.style.setProperty("--font-secondary", hexToRGBA(items.colour_global, 0.75))
      root.style.setProperty("--font-tertiary", hexToRGBA(items.colour_global, 0.5))
    }

    if (items.colour_time) root.style.setProperty("--colour-time", items.colour_time)
    if (items.colour_date) root.style.setProperty("--colour-date", items.colour_date)
    if (items.colour_weather) root.style.setProperty("--colour-weather", items.colour_weather)
    if (items.colour_bookmarks) root.style.setProperty("--colour-bookmarks", items.colour_bookmarks)
    if (items.colour_icon) root.style.setProperty("--colour-icon", items.colour_icon)

    if (items.colour_placeholder) root.style.setProperty("--colour-placeholder", items.colour_placeholder)
    if (items.colour_input) root.style.setProperty("--colour-input", items.colour_input)
    if (items.colour_blurbg) root.style.setProperty("--blur-background", hexToRGBA(items.colour_blurbg, 0.5))

    if (items.blurAmountUi !== 3) root.style.setProperty("--blur-amount-ui", `blur(${items.blurAmountUi}px)`)
    if (items.blurAmountBg !== 3) root.style.setProperty("--blur-amount-bg", `blur(${items.blurAmountBg}px)`)

    if (items.show_date) {
      new Clock("date", items.fmt_date || defaultDate).start()
    }

    const backgroundElement = document.getElementById("background")
    const randomBgNum = Math.floor(Math.random() * DEFAULT.backgroundImagesCount)
    let newBackground = `images/backgrounds/background${randomBgNum}.jpg`

    if (items.custombg.length > 0) {
      newBackground = items.custombg[
        Math.floor(Math.random() * items.custombg.length)
      ]
    }

    backgroundElement.onload = () => {
      backgroundElement.style.opacity = 1
    }

    if (items.wEnable) {
      let weatherPosition = null

      const scheduleWeatherRefresh = (position) => {
        const now = new Date()
        const next = new Date(now)
        next.setSeconds(0)
        next.setMilliseconds(0)
        next.setMinutes(5)
        if (now.getMinutes() >= 5) next.setHours(now.getHours() + 1)
        const delay = next - now

        const refreshWeather = () => {
          console.log("⌛ Refreshing weather automatically")
          getWeather(items, position, items.language, true)
        }

        setTimeout(() => {
          refreshWeather()
          setInterval(refreshWeather, 60 * 60 * 1000)
        }, delay)
      }

      if (items.wManualLocation) {
        weatherPosition = new ManualPosition(items.wlat, items.wlon)
        getWeather(items, weatherPosition, items.language)
        scheduleWeatherRefresh(weatherPosition)
      } else {
        navigator.geolocation.getCurrentPosition((position) => {
          weatherPosition = position
          getWeather(items, weatherPosition, items.language)
          scheduleWeatherRefresh(weatherPosition)
        })
      }
    }

    const bookmarks = document.getElementById("bookmarks")

    if (items.bookmarks) {
      bookmarks.style.display = "flex"
      items.bookmarks.forEach(({ name, url }) => {
        createBookmark(bookmarks, name, url, {
          bookmarksFavicon: items.bookmarksFavicon
        })
      })
    }

    if (items.searchbar) {
      const searchForm = document.getElementById("search-form")
      const searchInput = document.getElementById("search-input")
      searchInput.placeholder = translate(items.language, "search.placeholder")
      searchForm.style.display = "block"

      document.addEventListener("keydown", (e) => {
        const notepadEl = document.getElementById("notepad")
        if (
          e.key.length === 1 &&
          !e.ctrlKey && !e.metaKey && !e.altKey &&
          document.activeElement !== searchInput &&
          document.activeElement.tagName !== "INPUT" &&
          document.activeElement.tagName !== "TEXTAREA" &&
          !(notepadEl && notepadEl.classList.contains("open"))
        ) {
          searchInput.focus()
        }
      })
    }

    if (items.bookmarksTopSitesEnabled) {
      bookmarks.style.display = "flex"
      chrome.topSites.get((sites) => {
        for (const { title, url } of sites.slice(0, items.bookmarksTopSitesAmount)) {
          createBookmark(bookmarks, title, url, {
            bookmarksFavicon: items.bookmarksFavicon,
            isAuto: true
          })
        }
      })
    }

    if (items.customfont) {
      if (items.customfontgoogle) {
        const gFont = document.createElement("link")
        gFont.href = `https://fonts.googleapis.com/css?family=${items.customfont.replace(" ", "+")}`
        gFont.rel = "stylesheet"
        document.head.appendChild(gFont)
      }
      document.body.style.fontFamily = `"${items.customfont}"`
    }

    if (items.hexbg) {
      // Use a 1x1 transparent gif as the background, to not have an error
      backgroundElement.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
      new HexClock(document.body, {background: true}).start()
    } else {
      backgroundElement.src = newBackground
    }

    if (items.customcss) {
      const cssEl = document.createElement("style")
      cssEl.type = "text/css"
      cssEl.innerText = items.customcss
      document.head.appendChild(cssEl)
    }

    if (items.showSettings) {
      const settings = document.getElementById("settings")
      settings.removeAttribute("style")
    }

    if (items.notepadEnabled) {
      const notepadEl = document.getElementById("notepad")
      const notepadText = document.getElementById("notepad-text")
      const notepadClose = notepadEl.querySelector(".notepad-close")
      const notepadResize = notepadEl.querySelector(".notepad-resize")
      const tabsBar = notepadEl.querySelector(".notepad-tabs-bar")
      const tabAddBtn = notepadEl.querySelector(".notepad-tab-add")
      const popoutBtn = notepadEl.querySelector(".notepad-popout")

      const updateScrollbarState = () => {
        notepadEl.classList.toggle("scrollbar-visible", notepadText.scrollHeight > notepadText.clientHeight)
      }

      notepadEl.removeAttribute("style")

      let notepadWidth = items.notepadWidth || 300
      let notepadHeight = items.notepadHeight || 220
      notepadEl.style.setProperty("--notepad-width", `${notepadWidth}px`)
      notepadEl.style.setProperty("--notepad-height", `${notepadHeight}px`)

      notepadText.placeholder = translate(items.language, "notepad.placeholder")

      if (items.notepadFont) {
        notepadEl.style.setProperty("--notepad-font-family", `"${items.notepadFont}"`)
      }
      if (items.notepadFontScale !== 1.0) {
        notepadEl.style.setProperty("--notepad-font-scale", items.notepadFontScale)
      }

      const notepadPadding = () => 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize)
      const maxNotepadWidth = () => window.innerWidth - notepadPadding() * 2
      const maxNotepadHeight = () => window.innerHeight - notepadPadding() * 2

      const applyNotepadSize = () => {
        notepadEl.style.setProperty("--notepad-width", `${notepadWidth}px`)
        notepadEl.style.setProperty("--notepad-height", `${notepadHeight}px`)
        updateScrollbarState()
      }

      const clampNotepadSize = () => {
        const clampedWidth = Math.min(notepadWidth, maxNotepadWidth())
        const clampedHeight = Math.min(notepadHeight, maxNotepadHeight())
        if (clampedWidth !== notepadWidth || clampedHeight !== notepadHeight) {
          notepadWidth = clampedWidth
          notepadHeight = clampedHeight
          applyNotepadSize()
          chrome.storage.local.set({ notepadWidth, notepadHeight })
        }
      }

      // --- Tab management ---
      const core = createNotepadCore(tabsBar, tabAddBtn, notepadText)
      core.init(items.notepadTabs, items.notepadActiveTab, (tabs, activeTab) => {
        chrome.storage.local.set({ notepadTabs: tabs, notepadActiveTab: activeTab })
      })

      // Patch textarea input to also update scrollbar state
      notepadText.addEventListener("input", updateScrollbarState)

      // --- Real-time sync with standalone window ---
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return
        if (!changes.notepadTabs && !changes.notepadActiveTab) return
        const newTabs = changes.notepadTabs?.newValue ?? core.getTabs()
        const newActiveTab = changes.notepadActiveTab?.newValue ?? core.getActiveTab()
        core.onExternalChange(newTabs, newActiveTab)
        updateScrollbarState()
      })

      // --- Pop-out window ---
      let notepadWindowId = items.notepadPopupId || null

      function openNotepadWindow() {
        if (notepadWindowId !== null) {
          chrome.windows.update(notepadWindowId, { focused: true }, (win) => {
            if (chrome.runtime.lastError || !win) { notepadWindowId = null; spawnNotepadWindow() }
          })
          return
        }
        spawnNotepadWindow()
      }

      function spawnNotepadWindow() {
        core.flush()
        chrome.storage.local.set({ notepadTabs: core.getTabs(), notepadActiveTab: core.getActiveTab() })
        chrome.storage.local.get({ notepadPopupWidth: null, notepadPopupHeight: null }, (dims) => {
          const w = dims.notepadPopupWidth || Math.max(notepadWidth, 320)
          const h = dims.notepadPopupHeight || Math.max(notepadHeight + 40, 200)
          chrome.windows.create({
            url: chrome.runtime.getURL("notepad.html"),
            type: "popup",
            width: w,
            height: h
          }, (win) => {
            notepadWindowId = win.id
            chrome.storage.local.set({ notepadPopupId: win.id })

            chrome.windows.onRemoved.addListener(function handler(id) {
              if (id !== notepadWindowId) return
              notepadWindowId = null
              chrome.storage.local.set({ notepadPopupId: null })
              chrome.windows.onRemoved.removeListener(handler)
            })
          })
        })
      }

      popoutBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        openNotepadWindow()
      })

      // --- Open / close ---
      if (items.notepadInWindow) {
        notepadEl.addEventListener("click", openNotepadWindow)
      } else {
        notepadEl.addEventListener("click", () => {
          if (!notepadEl.classList.contains("open")) {
            notepadText.style.overflowY = "hidden"
            notepadEl.classList.add("open")
            chrome.storage.local.set({ notepadOpen: true })
            clampNotepadSize()
            notepadEl.addEventListener("transitionend", () => {
              notepadText.style.overflowY = ""
              updateScrollbarState()
              notepadText.focus()
            }, { once: true })
          }
        })
      }

      if (items.notepadOpen && !items.notepadInWindow) {
        notepadEl.classList.add("open")
        requestAnimationFrame(updateScrollbarState)
      }

      notepadClose.addEventListener("click", (e) => {
        e.stopPropagation()
        notepadEl.classList.remove("open")
        chrome.storage.local.set({ notepadOpen: false })
      })

      // --- Resize ---
      let isResizing = false
      let resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight

      notepadResize.addEventListener("mousedown", (e) => {
        isResizing = true
        resizeStartX = e.clientX
        resizeStartY = e.clientY
        resizeStartWidth = notepadWidth
        resizeStartHeight = notepadHeight
        notepadEl.classList.add("resizing")
        e.preventDefault()
      })

      document.addEventListener("mousemove", (e) => {
        if (!isResizing) return
        const dx = e.clientX - resizeStartX
        const dy = e.clientY - resizeStartY
        notepadWidth = Math.max(240, Math.min(maxNotepadWidth(), resizeStartWidth - dx))
        notepadHeight = Math.max(100, Math.min(maxNotepadHeight(), resizeStartHeight + dy))
        applyNotepadSize()
      })

      document.addEventListener("mouseup", () => {
        if (!isResizing) return
        isResizing = false
        notepadEl.classList.remove("resizing")
        chrome.storage.local.set({ notepadWidth, notepadHeight })
      })

      window.addEventListener("resize", clampNotepadSize)

      if (items.notepadOpen && !items.notepadInWindow) clampNotepadSize()
    }
  })

} else {
  console.log("ℹ️ Running in demo mode")
  // Demo mode

  document.title = "Homepage++ [ Demo ]"

  function updateDemoLabels(lang) {
    document.querySelectorAll("#demo-panel [data-translate]").forEach(el => {
      el.textContent = translate(lang, el.dataset.translate)
    })
  }

  updateDemoLabels(undefined)

  const wname = document.getElementById("wname")
  const wdescription = document.getElementById("wdescription")
  wname.textContent = translate(undefined, "demo.weather.location")
  wdescription.textContent = translate(undefined, "demo.weather.condition")

  let demo12h = false
  let timeClock = new Clock("time", translate(undefined, "time.format.default"))
  timeClock.start()

  const dateClock = new Clock("date", translate(undefined, "date.format.default"))
  dateClock.start()

  // Create some boiler plate bookmarks
  const bookmarksList = document.getElementById("bookmarks")
  createBookmark(bookmarksList, "Github", "https://github.com/AlexFlipnote/homepage_plusplus", {
    localFavicon: "images/icons/github.png"
  })
  createBookmark(bookmarksList, "Discord", "https://discord.gg/yqb7vATbjH", {
    localFavicon: "images/icons/discord.png"
  })

  function turnSwitch(el, display="block") {
    if (el.style.display == "none") {
      el.style.display = display
    } else {
      el.style.display = "none"
    }
  }

  function syncDemoClockUI(style) {
    const isAnalog = style === "analog"
    const isDigital = style === "digital"
    document.getElementById("demo-row-clock-tumbler").classList.toggle("setting-row--disabled", isAnalog)
    document.getElementById("demo-row-time-12h").classList.toggle("setting-row--disabled", !isDigital)
    document.getElementById("demo-group-fmt").classList.toggle("setting-group--disabled", !isDigital)
    if (!isDigital) {
      const t12h = document.getElementById("time12hToggle")
      if (t12h.checked) {
        t12h.checked = false
        demo12h = false
      }
    }
  }

  function switchClockStyle(style) {
    timeClock.stop()
    const timeEl = document.getElementById("time")
    timeEl.style.color = ""

    const fmt = document.getElementById("changeClock").value || translate(getLocale(), demo12h ? "time.format.default_12h" : "time.format.default")
    const useTumbler = document.getElementById("tumblerToggle").checked

    switch (style) {
    case "analog":
      timeClock = new AnalogClock("time")
      break
    case "hex": {
      const timeEl = document.getElementById("time")
      timeClock = useTumbler
        ? new TumblerClock("time", () => {
          const pad = n => ("0" + n).slice(-2)
          const now = new Date()
          const hex = `#${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
          timeEl.style.color = hex
          return hex
        })
        : new HexClock("time", { color: true, text: true })
      break
    }
    case "unix":
      timeClock = useTumbler
        ? new TumblerClock("time", () => String(Math.floor(Date.now() / 1000)))
        : new UnixClock("time")
      break
    default:
      timeClock = useTumbler ? new TumblerClock("time", fmt) : new Clock("time", fmt)
    }

    timeClock.start()
  }

  document.getElementById("clockStyle").onchange = (e) => {
    const style = e.target.value
    syncDemoClockUI(style)
    switchClockStyle(style)
  }

  document.getElementById("tumblerToggle").onclick = function() {
    switchClockStyle(document.getElementById("clockStyle").value)
  }

  document.getElementById("time12hToggle").onclick = function() {
    const currentStyle = document.getElementById("clockStyle").value
    if (this.checked && currentStyle !== "digital") {
      document.getElementById("clockStyle").value = "digital"
      syncDemoClockUI("digital")
      switchClockStyle("digital")
    }
    demo12h = this.checked
    const customFmt = document.getElementById("changeClock").value
    if (!customFmt && timeClock.changeFormat) {
      timeClock.changeFormat(translate(getLocale(), demo12h ? "time.format.default_12h" : "time.format.default"))
    }
  }

  document.getElementById("demo-panel").style.display = "flex"

  const demoPanelToggle = document.getElementById("demo-panel-toggle")
  demoPanelToggle.style.display = ""
  const demoPanel = document.getElementById("demo-panel")

  function openDemoPanel() {
    demoPanel.classList.add("open")
    demoPanelToggle.classList.add("panel-open")
  }

  function closeDemoPanel() {
    demoPanel.classList.remove("open")
    demoPanelToggle.classList.remove("panel-open")
  }

  demoPanelToggle.onclick = openDemoPanel

  demoPanel.querySelector(".demo-panel-close").onclick = closeDemoPanel

  document.addEventListener("click", (e) => {
    if (demoPanel.classList.contains("open") && !demoPanel.contains(e.target) && e.target !== demoPanelToggle) {
      closeDemoPanel()
    }
  })

  document.addEventListener("DOMContentLoaded", function() {
    const backgroundElement = document.getElementById("background")
    const randomBgNum = Math.floor(Math.random() * DEFAULT.backgroundImagesCount)

    backgroundElement.src = `images/backgrounds/background${randomBgNum}.jpg`
    backgroundElement.onload = () => {
      backgroundElement.style.opacity = 1
    }
  })

  // Load all languages
  for (const [k, v] of Object.entries(availableLanguages({ hideDefault: true }))) {
    const option = document.createElement("option")
    option.text = v
    option.value = k
    document.getElementById("language").appendChild(option)
  }

  // Toggle time
  document.getElementById("timeToggle").onclick = () => {
    turnSwitch(document.getElementById("time"), "block")
  }

  // Toggle date
  document.getElementById("dateToggle").onclick = () => {
    turnSwitch(document.getElementById("date"), "block")
  }

  // Change background
  document.getElementById("changebg").onchange = (el) => {
    const backgroundElement = document.getElementById("background")
    if (el.target.value) {
      backgroundElement.src = el.target.value
    }
    else {
      backgroundElement.src = null
    }
  }

  // Global colour
  const root = document.documentElement
  const demoColourNative = document.getElementById("demoColourGlobal")
  const demoColourWidget = demoColourNative.closest(".colour-picker-widget")
  const demoColourSwatch = demoColourWidget.querySelector(".colour-swatch")
  const demoColourHex = demoColourWidget.querySelector(".colour-hex-input")

  function applyGlobalColour(hex) {
    demoColourNative.value = hex
    demoColourHex.value = hex
    demoColourHex.classList.remove("invalid")
    demoColourSwatch.style.setProperty("--swatch-color", hex)
    root.style.setProperty("--font-primary", hex)
    root.style.setProperty("--font-secondary", hexToRGBA(hex, 0.75))
    root.style.setProperty("--font-tertiary", hexToRGBA(hex, 0.5))
  }

  demoColourSwatch.addEventListener("click", () => demoColourNative.click())

  demoColourNative.addEventListener("input", () => {
    applyGlobalColour(demoColourNative.value)
  })

  demoColourHex.addEventListener("input", () => {
    let v = demoColourHex.value.trim()
    if (!v.startsWith("#")) v = "#" + v
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      applyGlobalColour(v)
    } else {
      demoColourHex.classList.add("invalid")
    }
  })

  // UI scale
  const demoUiScale = document.getElementById("demoUiScale")
  const demoUiScaleLabel = document.getElementById("demoUiScale-label")
  demoUiScale.oninput = () => {
    const val = parseFloat(demoUiScale.value).toFixed(1)
    demoUiScaleLabel.textContent = val
    document.documentElement.style.setProperty("--ui-scale-global", val)
  }

  // Toggle bookmarks
  document.getElementById("bookmarksToggle").onclick = function() {
    turnSwitch(document.getElementById("bookmarks"), "flex")
  }

  // Toggle notepad (demo: no storage, factory new state)
  let demoNotepadInited = false
  document.getElementById("notepadToggle").onclick = function() {
    const notepadEl = document.getElementById("notepad")
    const notepadText = document.getElementById("notepad-text")
    const notepadClose = notepadEl.querySelector(".notepad-close")
    const notepadResize = notepadEl.querySelector(".notepad-resize")

    if (notepadEl.style.display !== "none") {
      notepadEl.style.display = "none"
      notepadEl.classList.remove("open")
      return
    }

    notepadEl.style.display = ""

    let notepadWidth = 300
    let notepadHeight = 220
    notepadEl.style.setProperty("--notepad-width", `${notepadWidth}px`)
    notepadEl.style.setProperty("--notepad-height", `${notepadHeight}px`)

    const updateScrollbarState = () => {
      notepadEl.classList.toggle("scrollbar-visible", notepadText.scrollHeight > notepadText.clientHeight)
    }

    if (!demoNotepadInited) {
      demoNotepadInited = true

      const tabsBar = notepadEl.querySelector(".notepad-tabs-bar")
      const tabAddBtn = notepadEl.querySelector(".notepad-tab-add")
      const popoutBtn = notepadEl.querySelector(".notepad-popout")
      const core = createNotepadCore(tabsBar, tabAddBtn, notepadText)
      core.init([], 0, () => {})
      notepadText.addEventListener("input", updateScrollbarState)

      popoutBtn.style.display = "none" // no chrome.windows in demo

      notepadEl.onclick = () => {
        if (!notepadEl.classList.contains("open")) {
          notepadEl.classList.add("open")
          requestAnimationFrame(updateScrollbarState)
          setTimeout(() => notepadText.focus(), 200)
        }
      }

      notepadClose.onclick = (e) => {
        e.stopPropagation()
        notepadEl.classList.remove("open")
      }

      const notepadPadding = () => 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize)
      const maxNotepadWidth = () => window.innerWidth - notepadPadding() * 2
      const maxNotepadHeight = () => window.innerHeight - notepadPadding() * 2

      const applyNotepadSize = () => {
        notepadEl.style.setProperty("--notepad-width", `${notepadWidth}px`)
        notepadEl.style.setProperty("--notepad-height", `${notepadHeight}px`)
        updateScrollbarState()
      }

      let isResizing = false
      let resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight

      notepadResize.onmousedown = (e) => {
        isResizing = true
        resizeStartX = e.clientX
        resizeStartY = e.clientY
        resizeStartWidth = notepadWidth
        resizeStartHeight = notepadHeight
        notepadEl.classList.add("resizing")
        e.preventDefault()
      }

      document.addEventListener("mousemove", (e) => {
        if (!isResizing) return
        const dx = e.clientX - resizeStartX
        const dy = e.clientY - resizeStartY
        notepadWidth = Math.max(240, Math.min(maxNotepadWidth(), resizeStartWidth - dx))
        notepadHeight = Math.max(100, Math.min(maxNotepadHeight(), resizeStartHeight + dy))
        applyNotepadSize()
      })

      document.addEventListener("mouseup", () => {
        if (!isResizing) return
        isResizing = false
        notepadEl.classList.remove("resizing")
      })
    }
  }

  // Toggle search bar
  document.getElementById("searchToggle").onclick = function() {
    turnSwitch(document.getElementById("search-form"), "block")
  }

  document.getElementById("search-form").onsubmit = (e) => {
    e.preventDefault()
    alert("This would then search using the browser's default search engine")
  }

  // Change background
  document.getElementById("changefont").onchange = (el) => {
    const font = el.target.value
    if (font) {
      document.body.style.fontFamily = `"${font}"`
    } else {
      document.body.style.fontFamily = ""
    }
  }

  // Change clock format
  document.getElementById("changeClock").oninput = (el) => {
    if (!timeClock.changeFormat) return
    const format = el.target.value
    timeClock.changeFormat(format || translate(getLocale(), demo12h ? "time.format.default_12h" : "time.format.default"))
  }

  // Change date format
  document.getElementById("changeDate").oninput = (el) => {
    const format = el.target.value
    if (format) {
      dateClock.changeFormat(format)
    } else {
      dateClock.changeFormat(translate(getLocale(), "date.format.default"))
    }
  }

  // Turn on/off weather
  document.getElementById("weather").onclick = () => {
    turnSwitch(document.getElementById("weather-container"), "flex")
  }

  // Add a nice install button
  function downloadButton(language=undefined) {
    document.getElementById("install-box").style.display = "flex"
    document.getElementById("install-box-title").innerText = translate(language, "demo.install.title")
    document.getElementById("install-button-chrome").innerText = translate(language, "demo.install", {browser: "Chrome/Edge"})
    document.getElementById("install-button-firefox").innerText = translate(language, "demo.install", {browser: "Firefox"})
  }

  downloadButton()

  // Change language
  document.getElementById("language").onchange = () => {
    let getLangVal = document.getElementById("language").value
    if (!getLangVal) { getLangVal = navigator.language }

    setLocale(getLangVal)
    updateDemoLabels(getLangVal)
    if (timeClock.changeFormat) timeClock.changeFormat(translate(getLangVal, demo12h ? "time.format.default_12h" : "time.format.default"))
    dateClock.changeFormat(translate(getLangVal, "date.format.default"))

    const searchInput = document.getElementById("search-input")
    searchInput.placeholder = translate(getLangVal, "search.placeholder")

    wname.textContent = translate(getLangVal, "demo.weather.location")
    wdescription.textContent = translate(getLangVal, "demo.weather.condition")

    downloadButton(getLangVal)
  }
}

