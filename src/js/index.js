import { isFirefox, isExtension } from "./utils/browser"
import { extensionSettings } from "./options.js"
import { getWeather } from "./utils/weather.js"
import { HexClock, Clock } from "./utils/timeManager.js"
import { availableLanguages, setLocale, translate, getLocale } from "./utils/i18n.js"
import * as manifest from "../manifest.json"

const DEFAULT = {
  backgroundImagesCount: 31
}

function faviconURL(u) {
  return chrome.runtime.getURL(
    `/_favicon/?pageUrl=${u}&size=32`
  )
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
  console.log(`☑️ Running in extension mode (v${manifest.version})`)

  document.getElementById("search-form").onsubmit = (e) => {
    e.preventDefault()
    chrome.search.query({
      text: document.getElementById("search-input").value
    })
  }

  chrome.storage.local.get({ ...extensionSettings }, function(items) {
    if (!items.animations) {
      document.body.classList.add("no-animations")
    }

    // Start by setting language
    setLocale(items.language)
    const defaultTime = translate(items.language, "time.format.default")
    const defaultDate = translate(items.language, "date.format.default")

    if (items.show_time) {
      new Clock("time", items.fmt_time || defaultTime).start()
    }

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

      document.getElementById("wrefresh").addEventListener("click", () => {
        if (weatherPosition) getWeather(items, weatherPosition, items.language, true)
      })
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
      backgroundElement.src = ""
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

      const updateScrollbarState = () => {
        notepadEl.classList.toggle("scrollbar-visible", notepadText.scrollHeight > notepadText.clientHeight)
      }

      notepadEl.removeAttribute("style")

      let notepadWidth = items.notepadWidth || 300
      let notepadHeight = items.notepadHeight || 220
      notepadEl.style.setProperty("--notepad-width", `${notepadWidth}px`)
      notepadEl.style.setProperty("--notepad-height", `${notepadHeight}px`)

      if (items.notepadContent) {
        notepadText.value = items.notepadContent
      }
      notepadText.placeholder = translate(items.language, "notepad.placeholder")

      if (items.notepadOpen) {
        notepadEl.classList.add("open")
        requestAnimationFrame(updateScrollbarState)
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

      notepadClose.addEventListener("click", (e) => {
        e.stopPropagation()
        notepadEl.classList.remove("open")
        chrome.storage.local.set({ notepadOpen: false })
      })

      let saveContentTimeout = null
      notepadText.addEventListener("input", () => {
        updateScrollbarState()
        clearTimeout(saveContentTimeout)
        saveContentTimeout = setTimeout(() => {
          chrome.storage.local.set({ notepadContent: notepadText.value })
        }, 500)
      })

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
        notepadWidth = Math.max(180, Math.min(maxNotepadWidth(), resizeStartWidth - dx))
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

      if (items.notepadOpen) clampNotepadSize()
    }
  })

} else {
  console.log("ℹ️ Running in demo mode")
  document.body.classList.add("no-animations")
  // Demo mode

  const wname = document.getElementById("wname")
  const wdescription = document.getElementById("wdescription")
  wname.textContent = translate(undefined, "demo.weather.location")
  wdescription.textContent = translate(undefined, "demo.weather.condition")

  const timeClock = new Clock("time", translate(undefined, "time.format.default"))
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

  turnSwitch(document.getElementById("demo-buttons"), "flex")

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

  // Toggle bookmarks
  document.getElementById("bookmarksToggle").onclick = function() {
    turnSwitch(document.getElementById("bookmarks"), "flex")
  }

  // Toggle notepad (demo: no storage, factory new state)
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

    notepadText.oninput = () => updateScrollbarState()

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
      notepadWidth = Math.max(180, Math.min(maxNotepadWidth(), resizeStartWidth - dx))
      notepadHeight = Math.max(100, Math.min(maxNotepadHeight(), resizeStartHeight + dy))
      applyNotepadSize()
    })

    document.addEventListener("mouseup", () => {
      if (!isResizing) return
      isResizing = false
      notepadEl.classList.remove("resizing")
    })
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
    const format = el.target.value
    if (format) {
      timeClock.changeFormat(format)
    } else {
      timeClock.changeFormat(translate(getLocale(), "time.format.default"))
    }
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
    let browser = "Chrome"
    let link = "https://chromewebstore.google.com/detail/npagigfpfilcemncemkphndcaigegcbk"

    if (isFirefox) {
      browser = "Firefox"
      link = "https://addons.mozilla.org/addon/alexflipnote-homepage/"
    }

    const addbutton = document.getElementById("install-button")
    addbutton.style.display = "block"
    addbutton.innerText = translate(language, "demo.install", {browser: browser})
    addbutton.href = link
    if (link === "#") addbutton.onclick = () => { return false }
  }

  downloadButton()

  // Change language
  document.getElementById("language").onchange = () => {
    let getLangVal = document.getElementById("language").value
    if (!getLangVal) { getLangVal = navigator.language }

    setLocale(getLangVal)
    timeClock.changeFormat(translate(getLangVal, "time.format.default"))
    dateClock.changeFormat(translate(getLangVal, "date.format.default"))

    const searchInput = document.getElementById("search-input")
    searchInput.placeholder = translate(getLangVal, "search.placeholder")

    wname.textContent = translate(getLangVal, "demo.weather.location")
    wdescription.textContent = translate(getLangVal, "demo.weather.condition")

    downloadButton(getLangVal)
  }
}

