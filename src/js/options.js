import Sortable from "sortablejs"

import { isFirefox, isExtension, getVersion } from "./utils/browser.js"
import { WorldMap } from "./utils/openstreetmap.js"
import { HexClock } from "./utils/timeManager.js"
import { availableLanguages, translate, translationCoverage } from "./utils/i18n.js"
import { bgGetAll, bgPut, bgDelete, bgClear } from "./utils/backgrounds.js"
import { runMigrations } from "./utils/migrate.js"

const defaultColour = "#ffffff"
const defaultColourBlurBg = "#181818"

export const extensionSettings = {
  language: "",
  searchbar: false,
  animations: false,
  disableTextShadow: false,
  show_time: true,
  show_date: true,
  fmt_time: "",
  fmt_date: "",
  customfont: "",
  customfontgoogle: false,
  bookmarks: [], // legacy
  bookmarksMigrated: false, // once true, bookmarkGroups is authoritative and legacy is ignored
  bookmarkGroups: [],
  bookmarksRowsPerGroup: 1,
  bookmarksFavicon: false,
  bookmarksTopSitesEnabled: false,
  bookmarksTopSitesAmount: 5,
  bookmarksTopSitesMode: "separate",
  bookmarksTopSitesGroup: 0,
  bookmarksTopSitesOrder: 999,
  wEnable: false,
  wlat: 0,
  wlon: 0,
  wManualLocation: false,
  temp_type: "celcius",
  wShowHourly: false,
  wDailyDays: 0,
  hexbg: false,
  showSettings: true,
  customcss: "",
  notepadEnabled: false,
  notepadInWindow: false,
  notepadFont: "",
  notepadFontScale: 1.0,
  notepadOpen: false,
  notepadTabs: [],
  notepadActiveTab: 0,
  notepadWidth: 300,
  notepadHeight: 220,
  notepadPopupId: null,
  notepadPopupWidth: null,
  notepadPopupHeight: null,
  clock_style: 0,
  clock_tumbler: false,
  time_12h: false,
  colour_global: null,
  colour_time: null,
  colour_date: null,
  colour_weather: null,
  colour_bookmarks: null,
  colour_icon: null,
  colour_placeholder: null,
  colour_input: null,
  colour_blurbg: null,
  uiScale: 1.0,
  scaleClock: null,
  scaleDate: null,
  scaleSearchbar: null,
  scaleWeather: null,
  scaleBookmarks: null,
  scaleIcon: null,
  blurAmountUi: 3,
  blurAmountBg: 3
}

const URLS = {
  google_fonts: { href: "https://fonts.google.com/", label: "Google Fonts" },
  met_norway: { href: "https://api.met.no/", label: "MET Norway" },
  i18n: { href: "https://github.com/AlexFlipnote/homepage_plusplus/tree/master/i18n", label: "i18n folder" }
}

function applyTranslations(lang) {
  document.querySelectorAll("[data-translate]").forEach(el => {
    const args = el.dataset.translateDefault !== undefined ? { default: el.dataset.translateDefault } : {}
    let text = translate(lang, el.dataset.translate, args)
    text = text.replace(/\n/g, "<br>")
    text = text.replace(/\{url:(\w+)\}/g, (_, key) => {
      const u = URLS[key]
      return u ? `<a href="${u.href}" target="_blank">${u.label}</a>` : key
    })
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>")
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>")
    el.innerHTML = text
  })

  document.querySelectorAll("[data-translate-placeholder]").forEach(el => {
    el.placeholder = translate(lang, el.dataset.translatePlaceholder)
  })
}

// We don't care where it loads, if it finds it, replace it
const findVersion = document.getElementById("version-label")
if (findVersion) {
  findVersion.textContent = `v${getVersion()}`
}

const userMap = new WorldMap()

function createAlert(message, css="") {
  const notification = document.getElementById("settings-notification")
  const alert = document.createElement("div")
  alert.classList.add("alert")
  if (css) { alert.classList.add(css) }
  alert.textContent = message || "Options saved"
  notification.appendChild(alert)
  setTimeout(() => { alert.remove() }, 3000)
}

function exportSettings() {
  chrome.storage.local.get({ ...extensionSettings }, (items) => {
    const json = JSON.stringify(items, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "homepage_settings.json"
    a.click()
    URL.revokeObjectURL(url)
    createAlert("Settings exported")
  })
}

function importSettings(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      const filtered = {}
      for (const key of Object.keys(extensionSettings)) {
        if (key in data) filtered[key] = data[key]
      }
      if (Object.keys(filtered).length === 0) {
        createAlert("No valid settings found in file", "remove")
        return
      }
      chrome.storage.local.set(filtered, () => {
        createAlert("Settings imported, reloading...", "change")
        setTimeout(() => location.reload(), 1200)
      })
    } catch {
      createAlert("Invalid settings file", "remove")
    }
  }
  reader.readAsText(file)
}

function readScale(id) {
  const v = parseFloat(document.getElementById(id).value)
  return Number.isNaN(v) || v === 1.0 ? null : v
}

// Saves options to chrome.storage
function saveOptions(message, css="") {
  function fetchGroupBookmarks(listEl) {
    const bookmarkItems = listEl.getElementsByClassName("bookmark-item")
    const bookmarks = []

    for (var i = 0; i < bookmarkItems.length; i++) {
      const bmEl = bookmarkItems[i]
      const name = bmEl.getElementsByClassName("bookmark-name")[0].value
      const url = bmEl.getElementsByClassName("bookmark-url")[0].value || "#"
      bookmarks.push({ name: name, url: url })
    }

    return bookmarks
  }

  function fetchBookmarkGroups() {
    const groups = []
    document.querySelectorAll("#bgroups .bookmark-group:not(.bookmark-group--auto)").forEach(groupEl => {
      const name = groupEl.getElementsByClassName("bookmark-group-name")[0].value || "Bookmarks"
      const list = groupEl.getElementsByClassName("bookmark-group-list")[0]
      groups.push({ name: name, items: fetchGroupBookmarks(list) })
    })
    return groups
  }

  // Index of the auto (top sites) placeholder card among all group cards, so its
  // position on the homepage can be restored when top sites use their own group.
  function fetchTopSitesOrder() {
    const cards = [...document.querySelectorAll("#bgroups .bookmark-group")]
    const idx = cards.findIndex(el => el.classList.contains("bookmark-group--auto"))
    return idx === -1 ? 999 : idx
  }

  function saveColour(elName, defaultValue = defaultColour) {
    const el = document.getElementById(elName)
    if (el && el.value === defaultValue) {
      return null
    }
    return el ? el.value : null
  }

  const topSites = readTopSitesPlacement()

  chrome.storage.local.set({
    language: document.getElementById("language").value,
    animations: document.getElementById("animations").checked,
    show_time: document.getElementById("show_time").checked,
    show_date: document.getElementById("show_date").checked,
    fmt_time: document.getElementById("fmt_time").value,
    searchbar: document.getElementById("searchbar").checked,
    fmt_date: document.getElementById("fmt_date").value,
    customfont: document.getElementById("customfont").value,
    disableTextShadow: document.getElementById("disableTextShadow").checked,
    customfontgoogle: document.getElementById("customfontgoogle").checked,
    wEnable: document.getElementById("wEnable").checked,
    wlat: userMap.marker ? userMap.marker.getLatLng().lat : 0,
    wlon: userMap.marker ? userMap.marker.getLatLng().lng : 0,
    wManualLocation: document.getElementById("wManualLocation").checked,
    hexbg: document.getElementById("hexbg").checked,
    temp_type: document.getElementById("temp_type").value,
    wShowHourly: document.getElementById("wShowHourly").checked,
    wDailyDays: parseInt(document.getElementById("wDailyDays").value),
    showSettings: document.getElementById("show-settings").checked,
    bookmarksFavicon: document.getElementById("bookmarksFavicon").checked,
    bookmarksTopSitesEnabled: document.getElementById("bookmarksTopSitesEnabled").checked,
    bookmarksTopSitesAmount: parseInt(document.getElementById("bookmarksTopSitesAmount").value) || 5,
    bookmarksTopSitesMode: topSites.mode,
    bookmarksTopSitesGroup: topSites.group,
    bookmarksTopSitesOrder: fetchTopSitesOrder(),
    bookmarksRowsPerGroup: parseInt(document.getElementById("bookmarksRowsPerGroup").value) || 1,
    customcss: document.getElementById("customcss").value,
    bookmarkGroups: fetchBookmarkGroups(),
    notepadEnabled: document.getElementById("notepadEnabled").checked,
    notepadInWindow: document.getElementById("notepadInWindow").checked,
    notepadFont: document.getElementById("notepadFont").value,
    notepadFontScale: parseFloat(document.getElementById("notepadFontSize").value) || 1.0,
    clock_style: parseInt(document.getElementById("clock_style").value),
    clock_tumbler: document.getElementById("clock_tumbler").checked,
    time_12h: document.getElementById("time_12h").checked,
    colour_global: saveColour("colour_global"),
    colour_icon: saveColour("colour_icon"),
    colour_time: saveColour("colour_time"),
    colour_date: saveColour("colour_date"),
    colour_weather: saveColour("colour_weather"),
    colour_bookmarks: saveColour("colour_bookmarks"),
    colour_placeholder: saveColour("colour_placeholder"),
    colour_input: saveColour("colour_input"),
    colour_blurbg: saveColour("colour_blurbg", defaultColourBlurBg),
    uiScale: parseFloat(document.getElementById("uiScale").value) || 1.0,
    scaleClock: readScale("scaleClock"),
    scaleDate: readScale("scaleDate"),
    scaleSearchbar: readScale("scaleSearchbar"),
    scaleWeather: readScale("scaleWeather"),
    scaleBookmarks: readScale("scaleBookmarks"),
    scaleIcon: readScale("scaleIcon"),
    blurAmountUi: parseInt(document.getElementById("blurAmountUi").value) ?? 3,
    blurAmountBg: parseInt(document.getElementById("blurAmountBg").value) ?? 3
  }, () => {
    createAlert(message, css)
  })
}

function createMapInit(items) {
  try {
    userMap.createMap("map", items.wlat, items.wlon)
  } catch {
    return // Ignore error
  }

  userMap.map.on("click", (e) => {
    const { lat, lng } = e.latlng
    userMap.setMarker(lat, lng)
    const wlat = document.getElementById("wlat")
    const wlon = document.getElementById("wlon")
    wlat.textContent = lat.toFixed(4)
    wlon.textContent = lng.toFixed(4)
    saveOptions(`Weather location set: Lat ${lat.toFixed(4)}, Lon ${lng.toFixed(4)}`, "change")
  })

  // Correct tile layout if the map was created while its section was hidden (0-size).
  // Navigating to the weather section also invalidates, covering the normal load path.
  requestAnimationFrame(() => { if (userMap.map) userMap.map.invalidateSize() })
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
  if (isExtension) runMigrations()

  chrome.storage.local.get({ ...extensionSettings }, async (items) => {
    const language = document.getElementById("language")
    language.value = items.language
    language.onchange = () => {
      saveOptions(`Language changed: ${language.value || "default"}`, "change")
      applyTranslations(language.value)
    }

    applyTranslations(items.language)

    const animations = document.getElementById("animations")
    animations.checked = items.animations
    animations.onchange = () => { saveOptions(`Animations set: ${animations.checked}`, animations.checked ? "add" : "remove") }

    const disableTextShadow = document.getElementById("disableTextShadow")
    disableTextShadow.checked = items.disableTextShadow
    disableTextShadow.onchange = () => { saveOptions(`Text shadow disabled set: ${disableTextShadow.checked}`, disableTextShadow.checked ? "add" : "remove") }

    const showTime = document.getElementById("show_time")
    showTime.checked = items.show_time
    showTime.onchange = () => { saveOptions(`Show time set: ${showTime.checked}`, showTime.checked ? "add" : "remove") }

    const showDate = document.getElementById("show_date")
    showDate.checked = items.show_date
    showDate.onchange = () => { saveOptions(`Show date set: ${showDate.checked}`, showDate.checked ? "add" : "remove") }

    const searchbar = document.getElementById("searchbar")
    searchbar.checked = items.searchbar
    searchbar.onchange = () => { saveOptions(`Search bar set: ${searchbar.checked}`, searchbar.checked ? "add" : "remove") }

    const wManualLocation = document.getElementById("wManualLocation")
    wManualLocation.checked = items.wManualLocation
    wManualLocation.onchange = () => {
      saveOptions(`Weather manual location set: ${wManualLocation.checked}`, wManualLocation.checked ? "add" : "remove")
      document.getElementById("map").classList.toggle("map--disabled", !wManualLocation.checked)
    }

    // The map is always shown under the option; when manual location is off it is
    // rendered as a dimmed, non-interactive preview (see .map--disabled).
    createMapInit(items)
    document.getElementById("map").classList.toggle("map--disabled", !items.wManualLocation)

    const wlat = document.getElementById("wlat")
    const wlon = document.getElementById("wlon")
    wlat.textContent = items.wlat.toFixed(4) || "0.0000"
    wlon.textContent = items.wlon.toFixed(4) || "0.0000"

    const fmtTime = document.getElementById("fmt_time")
    fmtTime.value = items.fmt_time
    fmtTime.placeholder = translate(items.language, items.time_12h ? "time.format.default_12h" : "time.format.default")
    fmtTime.onchange = () => { saveOptions(`Time format set: ${fmtTime.value || "default"}`, fmtTime.value ? "change" : "remove") }

    const fmtDate = document.getElementById("fmt_date")
    fmtDate.value = items.fmt_date
    fmtDate.onchange = () => { saveOptions(`Date format set: ${fmtDate.value || "default"}`, fmtDate.value ? "change" : "remove") }

    function syncClockStyleUI(style) {
      const isSwiss = style === 2
      const isDigital = style === 0
      document.getElementById("row-clock-tumbler").classList.toggle("setting-row--disabled", isSwiss)
      document.getElementById("row-time-12h").classList.toggle("setting-row--disabled", !isDigital)
      document.getElementById("group-fmt-time").classList.toggle("setting-group--disabled", !isDigital)
      if (!isDigital) {
        const t12h = document.getElementById("time_12h")
        if (t12h.checked) {
          t12h.checked = false
          fmtTime.placeholder = translate(items.language, "time.format.default")
        }
      }
    }

    const clockStyle = document.getElementById("clock_style")
    clockStyle.value = items.clock_style
    clockStyle.onchange = () => {
      syncClockStyleUI(parseInt(clockStyle.value))
      saveOptions(`Clock style set: ${clockStyle.value}`, "change")
    }
    syncClockStyleUI(items.clock_style)

    const clockTumbler = document.getElementById("clock_tumbler")
    clockTumbler.checked = items.clock_tumbler
    clockTumbler.onchange = () => { saveOptions(`Tumbler effect set: ${clockTumbler.checked}`, clockTumbler.checked ? "add" : "remove") }

    const time12h = document.getElementById("time_12h")
    time12h.checked = items.time_12h
    time12h.onchange = () => {
      if (time12h.checked && parseInt(clockStyle.value) !== 0) {
        clockStyle.value = "0"
        syncClockStyleUI(0)
      }
      fmtTime.placeholder = translate(items.language, time12h.checked ? "time.format.default_12h" : "time.format.default")
      saveOptions(`12h clock set: ${time12h.checked}`, time12h.checked ? "add" : "remove")
    }

    const customfont = document.getElementById("customfont")
    customfont.value = items.customfont
    customfont.onchange = () => { saveOptions(`Custom font set: ${customfont.value || "default"}`, customfont.value ? "change" : "remove") }

    const customfontgoogle = document.getElementById("customfontgoogle")
    customfontgoogle.checked = items.customfontgoogle
    customfontgoogle.onchange = () => { saveOptions(`Google font set: ${customfontgoogle.checked}`, customfontgoogle.checked ? "add" : "remove") }

    const hexbg = document.getElementById("hexbg")
    hexbg.checked = items.hexbg
    hexbg.onchange = () => { saveOptions(`HEX background set: ${hexbg.checked}`, hexbg.checked ? "add" : "remove") }

    const wEnable = document.getElementById("wEnable")
    wEnable.checked = items.wEnable
    wEnable.onchange = () => { saveOptions(`Set weather: ${wEnable.checked}`, wEnable.checked ? "add" : "remove") }

    const tempType = document.getElementById("temp_type")
    tempType.value = items.temp_type
    tempType.onchange = () => { saveOptions(`Weather temperature type changed: ${tempType.value}`, "change") }

    const wShowHourly = document.getElementById("wShowHourly")
    wShowHourly.checked = items.wShowHourly
    wShowHourly.onchange = () => { saveOptions(`Show hourly forecast set: ${wShowHourly.checked}`, wShowHourly.checked ? "add" : "remove") }

    const wDailyDays = document.getElementById("wDailyDays")
    const wDailyDaysLabel = document.getElementById("wDailyDays-label")
    wDailyDays.value = items.wDailyDays
    if (wDailyDaysLabel) wDailyDaysLabel.textContent = items.wDailyDays
    wDailyDays.oninput = () => { if (wDailyDaysLabel) wDailyDaysLabel.textContent = wDailyDays.value }
    wDailyDays.onchange = () => { saveOptions(`Daily forecast days set: ${wDailyDays.value}`, "change") }

    const showSettings = document.getElementById("show-settings")
    showSettings.checked = items.showSettings
    showSettings.onchange = () => { saveOptions(`Show settings button set: ${showSettings.checked}`, showSettings.checked ? "add" : "remove") }

    const customcss = document.getElementById("customcss")
    customcss.value = items.customcss
    customcss.onchange = () => { saveOptions("Custom CSS changed") }

    const notepadEnabled = document.getElementById("notepadEnabled")
    notepadEnabled.checked = items.notepadEnabled
    notepadEnabled.onchange = () => { saveOptions(`Notepad set: ${notepadEnabled.checked}`, notepadEnabled.checked ? "add" : "remove") }

    const notepadInWindow = document.getElementById("notepadInWindow")
    notepadInWindow.checked = items.notepadInWindow
    notepadInWindow.onchange = () => { saveOptions(`Notepad in window set: ${notepadInWindow.checked}`, notepadInWindow.checked ? "add" : "remove") }

    const notepadFont = document.getElementById("notepadFont")
    notepadFont.value = items.notepadFont
    notepadFont.onchange = () => { saveOptions(`Notepad font set: ${notepadFont.value || "default"}`, notepadFont.value ? "change" : "remove") }

    const notepadFontSize = document.getElementById("notepadFontSize")
    const notepadFontSizeLabel = document.getElementById("notepadFontSize-label")
    notepadFontSize.value = items.notepadFontScale
    if (notepadFontSizeLabel) notepadFontSizeLabel.textContent = parseFloat(items.notepadFontScale).toFixed(1) + "x"
    notepadFontSize.oninput = () => { if (notepadFontSizeLabel) notepadFontSizeLabel.textContent = parseFloat(notepadFontSize.value).toFixed(1) + "x" }
    notepadFontSize.onchange = () => { saveOptions(`Notepad font scale set: ${notepadFontSize.value}`, "change") }

    const bookmarksTopSitesEnabled = document.getElementById("bookmarksTopSitesEnabled")
    bookmarksTopSitesEnabled.checked = items.bookmarksTopSitesEnabled
    bookmarksTopSitesEnabled.onchange = () => { syncAutoGroupCard(); saveOptions(`Bookmarks top sites set: ${bookmarksTopSitesEnabled.checked}`, bookmarksTopSitesEnabled.checked ? "add" : "remove") }

    const bookmarksTopSitesAmount = document.getElementById("bookmarksTopSitesAmount")
    const bookmarksTopSitesAmountLabel = document.getElementById("bookmarksTopSitesAmount-label")
    bookmarksTopSitesAmount.value = items.bookmarksTopSitesAmount
    if (bookmarksTopSitesAmountLabel) bookmarksTopSitesAmountLabel.textContent = items.bookmarksTopSitesAmount
    bookmarksTopSitesAmount.oninput = () => { if (bookmarksTopSitesAmountLabel) bookmarksTopSitesAmountLabel.textContent = bookmarksTopSitesAmount.value }
    bookmarksTopSitesAmount.onchange = () => { saveOptions(`Bookmarks top sites amount set: ${bookmarksTopSitesAmount.value}`, "change") }

    const bookmarksRowsPerGroup = document.getElementById("bookmarksRowsPerGroup")
    const bookmarksRowsPerGroupLabel = document.getElementById("bookmarksRowsPerGroup-label")
    bookmarksRowsPerGroup.value = items.bookmarksRowsPerGroup
    if (bookmarksRowsPerGroupLabel) bookmarksRowsPerGroupLabel.textContent = items.bookmarksRowsPerGroup
    bookmarksRowsPerGroup.oninput = () => { if (bookmarksRowsPerGroupLabel) bookmarksRowsPerGroupLabel.textContent = bookmarksRowsPerGroup.value }
    bookmarksRowsPerGroup.onchange = () => { saveOptions(`Bookmark rows per group set: ${bookmarksRowsPerGroup.value}`, "change") }

    const bookmarksTopSitesPlacement = document.getElementById("bookmarksTopSitesPlacement")
    bookmarksTopSitesPlacement.onchange = () => {
      syncAutoGroupCard()
      saveOptions("Top sites placement set", "change")
    }

    const bookmarksFavicon = document.getElementById("bookmarksFavicon")
    bookmarksFavicon.checked = items.bookmarksFavicon
    bookmarksFavicon.onchange = () => { saveOptions(`Bookmarks favicon set: ${bookmarksFavicon.checked}`, bookmarksFavicon.checked ? "add" : "remove") }

    const uiScale = document.getElementById("uiScale")
    const uiScaleLabel = document.getElementById("uiScale-label")
    uiScale.value = items.uiScale
    if (uiScaleLabel) uiScaleLabel.textContent = parseFloat(items.uiScale).toFixed(1)
    uiScale.oninput = () => { if (uiScaleLabel) uiScaleLabel.textContent = parseFloat(uiScale.value).toFixed(1) }
    uiScale.onchange = () => { saveOptions(`UI scale set: ${uiScale.value}`, "change") }

    function initScaleSlider(id, storedValue, label) {
      const el = document.getElementById(id)
      const labelEl = document.getElementById(`${id}-label`)
      const display = storedValue ?? 1.0
      el.value = display
      if (labelEl) labelEl.textContent = display.toFixed(1)
      el.oninput = () => { if (labelEl) labelEl.textContent = parseFloat(el.value).toFixed(1) }
      el.onchange = () => { saveOptions(`${label} scale set: ${el.value}`, "change") }
    }

    initScaleSlider("scaleClock", items.scaleClock, "Clock")
    initScaleSlider("scaleDate", items.scaleDate, "Date")
    initScaleSlider("scaleSearchbar", items.scaleSearchbar, "Search bar")
    initScaleSlider("scaleWeather", items.scaleWeather, "Weather")
    initScaleSlider("scaleBookmarks", items.scaleBookmarks, "Bookmarks")
    initScaleSlider("scaleIcon", items.scaleIcon, "Icons")

    const resetIndividualScales = document.getElementById("reset-individual-scales")
    if (resetIndividualScales) {
      resetIndividualScales.onclick = () => {
        const ids = ["uiScale", "scaleClock", "scaleDate", "scaleSearchbar", "scaleWeather", "scaleBookmarks", "scaleIcon"]
        ids.forEach(id => {
          const el = document.getElementById(id)
          const labelEl = document.getElementById(`${id}-label`)
          if (el) el.value = 1.0
          if (labelEl) labelEl.textContent = "1.0"
        })
        saveOptions("All scales reset to default", "change")
      }
    }

    function initColourWidget(id, savedValue, label, defaultValue = defaultColour) {
      const native = document.getElementById(id)
      const widget = native.closest(".colour-picker-widget")
      const swatch = widget.querySelector(".colour-swatch")
      const hexInput = widget.querySelector(".colour-hex-input")

      function applyValue(hex) {
        const colour = hex || defaultValue
        native.value = colour
        hexInput.value = colour
        hexInput.classList.remove("invalid")
        swatch.style.setProperty("--swatch-color", colour)
      }

      applyValue(savedValue)

      swatch.addEventListener("click", () => native.click())

      let saveDebounce = null
      let lastSavedValue = native.value

      native.addEventListener("input", () => {
        hexInput.value = native.value
        hexInput.classList.remove("invalid")
        swatch.style.setProperty("--swatch-color", native.value)
        clearTimeout(saveDebounce)
        saveDebounce = setTimeout(() => {
          if (native.value === lastSavedValue) return
          lastSavedValue = native.value
          saveOptions(`${label} set: ${native.value || "default"}`, native.value ? "change" : "remove")
        }, 400)
      })

      native.addEventListener("change", () => {
        clearTimeout(saveDebounce)
        if (native.value === lastSavedValue) return
        lastSavedValue = native.value
        saveOptions(`${label} set: ${native.value || "default"}`, native.value ? "change" : "remove")
      })

      hexInput.addEventListener("input", () => {
        let v = hexInput.value.trim()
        if (!v.startsWith("#")) v = "#" + v
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          hexInput.classList.remove("invalid")
          native.value = v
          swatch.style.setProperty("--swatch-color", v)
        } else {
          hexInput.classList.add("invalid")
        }
      })

      hexInput.addEventListener("change", () => {
        let v = hexInput.value.trim()
        if (!v.startsWith("#")) v = "#" + v
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          hexInput.classList.remove("invalid")
          native.value = v
          swatch.style.setProperty("--swatch-color", v)
          saveOptions(`${label} set: ${v}`, "change")
        } else {
          applyValue(native.value)
        }
      })

      return { setValue: applyValue }
    }

    const colourGlobal = initColourWidget("colour_global", items.colour_global, "Global colour")
    const colourIcon = initColourWidget("colour_icon", items.colour_icon, "Icon colour")
    const colourTime = initColourWidget("colour_time", items.colour_time, "Time colour")
    const colourDate = initColourWidget("colour_date", items.colour_date, "Date colour")
    const colourWeather = initColourWidget("colour_weather", items.colour_weather, "Weather colour")
    const colourBookmarks = initColourWidget("colour_bookmarks", items.colour_bookmarks, "Bookmarks colour")
    const colourPlaceholder = initColourWidget("colour_placeholder", items.colour_placeholder, "Placeholder text colour")
    const colourInput = initColourWidget("colour_input", items.colour_input, "Written text colour")
    const colourBlurbg = initColourWidget("colour_blurbg", items.colour_blurbg, "Blur background colour", defaultColourBlurBg)

    const colourResetAll = document.getElementById("reset_colours_all")
    colourResetAll.onclick = () => {
      colourGlobal.setValue(null)
      colourIcon.setValue(null)
      colourTime.setValue(null)
      colourDate.setValue(null)
      colourWeather.setValue(null)
      colourBookmarks.setValue(null)
      colourPlaceholder.setValue(null)
      colourInput.setValue(null)
      colourBlurbg.setValue(defaultColourBlurBg)
      saveOptions("All colours reset to default", "change")
    }

    const blurAmountUi = document.getElementById("blurAmountUi")
    const blurAmountUiLabel = document.getElementById("blurAmountUi-label")
    blurAmountUi.value = items.blurAmountUi
    if (blurAmountUiLabel) blurAmountUiLabel.textContent = items.blurAmountUi
    blurAmountUi.oninput = () => { if (blurAmountUiLabel) blurAmountUiLabel.textContent = blurAmountUi.value }
    blurAmountUi.onchange = () => { saveOptions(`UI blur amount set: ${blurAmountUi.value}`, "change") }

    const blurAmountBg = document.getElementById("blurAmountBg")
    const blurAmountBgLabel = document.getElementById("blurAmountBg-label")
    blurAmountBg.value = items.blurAmountBg
    if (blurAmountBgLabel) blurAmountBgLabel.textContent = items.blurAmountBg
    blurAmountBg.oninput = () => { if (blurAmountBgLabel) blurAmountBgLabel.textContent = blurAmountBg.value }
    blurAmountBg.onchange = () => { saveOptions(`Background blur amount set: ${blurAmountBg.value}`, "change") }

    if (isFirefox) {
      document.getElementById("bmFavFirefox").style.display = "none"
    }

    let groups = Array.isArray(items.bookmarkGroups) ? items.bookmarkGroups : []
    // Only fall back to the legacy flat list before migration has completed; afterwards an
    // empty bookmarkGroups is a deliberate state and must be respected.
    if (!items.bookmarksMigrated && !groups.length) {
      groups = [{ name: "Bookmarks", items: Array.isArray(items.bookmarks) ? items.bookmarks : [] }]
    }
    groups.forEach(({ name, items: bms }) => createGroupElement(name, bms || []))
    initGroupsSortable()
    refreshTopSitesPlacementSelect()
    if (items.bookmarksTopSitesMode === "merge") {
      const target = Math.min(items.bookmarksTopSitesGroup || 0, Math.max(0, groups.length - 1))
      const placement = document.getElementById("bookmarksTopSitesPlacement")
      placement.value = groups.length ? `merge:${target}` : "separate"
    }
    syncAutoGroupCard(items.bookmarksTopSitesOrder)

    const allPreviews = document.getElementById("custombg_previews")
    const existingBgs = await bgGetAll()
    for (const { id, blob } of existingBgs) {
      createPreview(URL.createObjectURL(blob), id, allPreviews)
    }
  })
}

function createBookmarkElement(list, bkey, burl) {
  const container = document.createElement("div")
  container.classList.add("bookmark-item")

  const dragIcon = document.createElement("img")
  dragIcon.src = "images/icons/drag.png"
  dragIcon.classList.add("drag")

  const nameInput = document.createElement("input")
  nameInput.type = "text"
  nameInput.value = bkey
  nameInput.classList.add("bookmark-name")

  const urlInput = document.createElement("input")
  urlInput.type = "text"
  urlInput.value = burl
  urlInput.classList.add("bookmark-url")

  const removeButton = document.createElement("img")
  removeButton.src = "images/icons/delete.png"
  removeButton.classList.add("remove")
  removeButton.onclick = function() {
    container.remove()
    saveOptions("Removed bookmark", "remove")
  }

  container.appendChild(dragIcon)
  container.appendChild(nameInput)
  container.appendChild(urlInput)
  container.appendChild(removeButton)

  nameInput.onchange = () => { saveOptions("Changed bookmark name", "change") }
  urlInput.onchange = () => { saveOptions("Changed bookmark URL", "change") }

  list.appendChild(container)
}

function initGroupListSortable(list) {
  new Sortable(list, {
    group: "bookmarks",
    animation: 150,
    ghostClass: "sortable-ghost",
    handle: ".drag",
    onEnd: () => { saveOptions("Reordered bookmarks", "change") }
  })
}

function initGroupsSortable() {
  new Sortable(document.getElementById("bgroups"), {
    animation: 150,
    ghostClass: "sortable-ghost",
    handle: ".bookmark-group-drag",
    onEnd: () => { saveOptions("Reordered groups", "change") }
  })
}

// Focus an input and briefly flash it, so the eye follows where the next entry goes.
function highlightInput(el) {
  if (!el) return
  el.focus()
  el.classList.remove("input-highlight")
  void el.offsetWidth // restart the animation if it is already applied
  el.classList.add("input-highlight")
  el.addEventListener("animationend", () => el.classList.remove("input-highlight"), { once: true })
}

// Run an action when Enter is pressed in an input (mirrors clicking its add button).
function addOnEnter(el, action) {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      action()
    }
  })
}

function createGroupElement(name = "Bookmarks", bookmarks = []) {
  const bgroups = document.getElementById("bgroups")
  const lang = document.getElementById("language").value

  const card = document.createElement("div")
  card.classList.add("bookmark-group")

  const header = document.createElement("div")
  header.classList.add("bookmark-group-header")

  const dragIcon = document.createElement("img")
  dragIcon.src = "images/icons/drag.png"
  dragIcon.classList.add("drag", "bookmark-group-drag")

  const nameInput = document.createElement("input")
  nameInput.type = "text"
  nameInput.value = name
  nameInput.classList.add("bookmark-group-name", "secondary")
  nameInput.dataset.translatePlaceholder = "settings.bookmarks.groups.name_placeholder"
  nameInput.placeholder = translate(lang, "settings.bookmarks.groups.name_placeholder")
  nameInput.onchange = () => { refreshTopSitesPlacementSelect(); saveOptions("Changed group name", "change") }

  const removeButton = document.createElement("img")
  removeButton.src = "images/icons/delete.png"
  removeButton.classList.add("remove", "bookmark-group-remove")
  removeButton.onclick = () => { card.remove(); refreshTopSitesPlacementSelect(); saveOptions("Removed group", "remove") }

  header.append(dragIcon, nameInput, removeButton)

  const list = document.createElement("div")
  list.classList.add("bookmark-container", "bookmark-group-list")
  bookmarks.forEach(({ name: bName, url }) => createBookmarkElement(list, bName, url))

  const addRow = document.createElement("div")
  addRow.classList.add("bookmark-container")
  const addItem = document.createElement("div")
  addItem.classList.add("bookmark-item")

  const addName = document.createElement("input")
  addName.classList.add("secondary", "bookmark-add-name")
  addName.dataset.translatePlaceholder = "settings.bookmarks.items.name_placeholder"
  addName.placeholder = translate(lang, "settings.bookmarks.items.name_placeholder")

  const addUrl = document.createElement("input")
  addUrl.classList.add("secondary", "bookmark-add-url")
  addUrl.dataset.translatePlaceholder = "settings.bookmarks.items.url_placeholder"
  addUrl.placeholder = translate(lang, "settings.bookmarks.items.url_placeholder")

  const addBtn = document.createElement("img")
  addBtn.src = "images/icons/bookmark_add.png"
  addBtn.classList.add("bookmark-add-button")
  addBtn.alt = "Add bookmark"

  const addBookmark = () => {
    createBookmarkElement(list, addName.value || translate(lang, "settings.bookmarks.items.default_name"), addUrl.value || "#")
    addName.value = ""
    addUrl.value = ""
    saveOptions("Added new bookmark")
    highlightInput(addName) // ready for the next bookmark in this group
  }
  addBtn.onclick = addBookmark
  addOnEnter(addName, addBookmark)
  addOnEnter(addUrl, addBookmark)

  addItem.append(addName, addUrl, addBtn)
  addRow.append(addItem)

  card.append(header, list, addRow)

  // Keep the auto (top sites) placeholder below user groups by inserting above it
  const auto = bgroups.querySelector(".bookmark-group--auto")
  if (auto) bgroups.insertBefore(card, auto)
  else bgroups.appendChild(card)

  initGroupListSortable(list)
  return card
}

// Rebuild the adaptive placement dropdown: "Own group" plus one "Merge into {name}" per group.
// A single control avoids the show/hide UI churn of a separate mode + target selector.
function refreshTopSitesPlacementSelect() {
  const select = document.getElementById("bookmarksTopSitesPlacement")
  if (!select) return
  const lang = document.getElementById("language").value
  const prev = select.value
  select.innerHTML = ""

  const own = document.createElement("option")
  own.value = "separate"
  own.textContent = translate(lang, "settings.bookmarks.top_sites.mode.separate")
  select.appendChild(own)

  const groups = document.querySelectorAll("#bgroups .bookmark-group:not(.bookmark-group--auto)")
  groups.forEach((g, i) => {
    const name = g.getElementsByClassName("bookmark-group-name")[0].value || `Group ${i + 1}`
    const opt = document.createElement("option")
    opt.value = `merge:${i}`
    opt.textContent = translate(lang, "settings.bookmarks.top_sites.mode.merge", { name })
    select.appendChild(opt)
  })

  // Keep the previous selection if it still exists, otherwise fall back to "Own group"
  select.value = [...select.options].some(o => o.value === prev) ? prev : "separate"
}

// Read the placement dropdown into the stored mode + target group index
function readTopSitesPlacement() {
  const value = document.getElementById("bookmarksTopSitesPlacement").value
  if (value.startsWith("merge:")) {
    return { mode: "merge", group: parseInt(value.slice(6)) || 0 }
  }
  return { mode: "separate", group: 0 }
}

// Show/hide/reposition the draggable "Top Sites" placeholder card in the group list.
// It only exists while top sites are enabled and set to their own (separate) group.
function syncAutoGroupCard(order) {
  const bgroups = document.getElementById("bgroups")
  const enabled = document.getElementById("bookmarksTopSitesEnabled").checked
  const placement = document.getElementById("bookmarksTopSitesPlacement").value
  let card = bgroups.querySelector(".bookmark-group--auto")

  if (!(enabled && placement === "separate")) {
    if (card) card.remove()
    return
  }

  if (!card) {
    const lang = document.getElementById("language").value
    card = document.createElement("div")
    card.classList.add("bookmark-group", "bookmark-group--auto")

    const header = document.createElement("div")
    header.classList.add("bookmark-group-header")

    const dragIcon = document.createElement("img")
    dragIcon.src = "images/icons/drag.png"
    dragIcon.classList.add("drag", "bookmark-group-drag")

    const label = document.createElement("span")
    label.classList.add("bookmark-group-auto-label")
    label.textContent = translate(lang, "settings.bookmarks.top_sites.auto_label")

    header.append(dragIcon, label)
    card.append(header)
  }

  const cards = [...bgroups.querySelectorAll(".bookmark-group:not(.bookmark-group--auto)")]
  const idx = Math.min(order ?? cards.length, cards.length)
  if (idx >= cards.length) bgroups.appendChild(card)
  else bgroups.insertBefore(card, cards[idx])
}

function createPreview(url, id, target) {
  const container = document.createElement("div")
  container.classList.add("preview-container")

  const preview = document.createElement("img")
  preview.classList.add("preview-image")
  preview.src = url
  preview.dataset.bgId = id

  container.append(preview) // div -> img

  const fileContainer = target.querySelector(".file-container")
  fileContainer.before(container)
}

// This part of the code loads only when touching options.html
if (document.getElementById("settings-notification")) {
  document.addEventListener("DOMContentLoaded", () => {
    const content = document.querySelector(".settings-content")

    function setActiveSidebarItem(name) {
      document.querySelectorAll(".sidebar-item").forEach(b => b.classList.remove("active"))
      const btn = document.querySelector(`.sidebar-item[data-section="${name}"]`)
      if (btn) btn.classList.add("active")
    }

    function navigateTo(sectionName) {
      const target = document.getElementById("section-" + sectionName)
      if (!target) return

      setActiveSidebarItem(sectionName)
      location.hash = sectionName

      const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop
      content.scrollTop = top
      if (userMap.map) userMap.map.invalidateSize()
    }

    content.addEventListener("scroll", () => {
      const threshold = 80
      const allSections = [...document.querySelectorAll(".settings-section")]
      const contentTop = content.getBoundingClientRect().top

      let current = allSections[0]
      for (const section of allSections) {
        const top = section.getBoundingClientRect().top - contentTop
        if (top <= threshold) current = section
      }

      if (current) setActiveSidebarItem(current.id.replace("section-", ""))
    })

    const searchInput = document.getElementById("settings-search")
    const searchEmptyState = document.getElementById("search-empty-state")
    const SEARCHABLE_SELECTOR = ".setting-row, .colour-sub-item"

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }

    function clearSearchHighlights() {
      content.querySelectorAll("mark.search-highlight").forEach(mark => {
        const parent = mark.parentNode
        parent.replaceChild(document.createTextNode(mark.textContent), mark)
        parent.normalize()
      })
    }

    // Wraps every case-insensitive occurrence of query in a <mark>, skipping
    // text that lives inside form controls (input/select values aren't nodes we can mark).
    function highlightMatches(root, query) {
      const re = new RegExp(escapeRegExp(query), "ig")
      const textNodes = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
          if (node.parentElement.closest("input, select, textarea, button, option")) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        }
      })
      let node
      while ((node = walker.nextNode())) textNodes.push(node)

      textNodes.forEach(textNode => {
        re.lastIndex = 0
        if (!re.test(textNode.nodeValue)) return
        re.lastIndex = 0

        const frag = document.createDocumentFragment()
        let lastIndex = 0
        let match
        while ((match = re.exec(textNode.nodeValue))) {
          frag.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex, match.index)))
          const mark = document.createElement("mark")
          mark.className = "search-highlight"
          mark.textContent = match[0]
          frag.appendChild(mark)
          lastIndex = match.index + match[0].length
        }
        frag.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex)))
        textNode.parentNode.replaceChild(frag, textNode)
      })
    }

    // Filters every searchable setting row/item down to the ones matching `rawQuery`,
    // hides whatever surrounds only-hidden rows (dividers, groups, subsection titles,
    // whole sections), highlights matches in yellow, and dims sidebar tabs with no hits.
    function applySearch(rawQuery) {
      const query = rawQuery.trim()
      clearSearchHighlights()

      if (!query) {
        content.classList.remove("search-active", "search-no-results")
        content.querySelectorAll(".search-hide").forEach(el => el.classList.remove("search-hide"))
        content.querySelectorAll(".section-no-match").forEach(el => el.classList.remove("section-no-match"))
        document.querySelectorAll(".sidebar-item.search-dim").forEach(el => el.classList.remove("search-dim"))
        return
      }

      content.classList.add("search-active")
      const lowerQuery = query.toLowerCase()
      const sectionHasMatch = {}

      document.querySelectorAll(".settings-section").forEach(section => {
        let sectionMatched = false

        const titleEl = section.querySelector(".section-title")
        if (titleEl && titleEl.textContent.toLowerCase().includes(lowerQuery)) sectionMatched = true

        section.querySelectorAll(SEARCHABLE_SELECTOR).forEach(unit => {
          const titleSpan = unit.querySelector(".setting-label > span:first-child")
          const titleText = (titleSpan ? titleSpan.textContent : unit.textContent).trim().replace(/\s+/g, " ").toLowerCase()
          const fullText = unit.textContent.trim().replace(/\s+/g, " ").toLowerCase()
          const isMatch = fullText.includes(lowerQuery)
          unit.classList.toggle("search-hide", !isMatch)
          if (isMatch) highlightMatches(unit, query)
          if (titleText.includes(lowerQuery)) sectionMatched = true
        })

        // Drop dividers touching a hidden row so no orphan line remains
        section.querySelectorAll(".setting-divider").forEach(divider => {
          const prev = divider.previousElementSibling
          const next = divider.nextElementSibling
          const hide = (prev && prev.classList.contains("search-hide")) || (next && next.classList.contains("search-hide"))
          divider.classList.toggle("search-hide", Boolean(hide))
        })

        // Collapse whole groups (and their subsection heading) once every row inside is hidden
        section.querySelectorAll(".setting-group").forEach(group => {
          const units = group.querySelectorAll(SEARCHABLE_SELECTOR)
          const noMatch = units.length > 0 && ![...units].some(u => !u.classList.contains("search-hide"))
          group.classList.toggle("search-hide", noMatch)

          const heading = group.previousElementSibling
          if (heading && heading.classList.contains("subsection-title")) {
            heading.classList.toggle("search-hide", noMatch)
          }
        })

        section.classList.toggle("section-no-match", !sectionMatched)
        sectionHasMatch[section.id] = sectionMatched
      })

      document.querySelectorAll(".sidebar-item").forEach(btn => {
        const sectionId = "section-" + btn.dataset.section
        btn.classList.toggle("search-dim", !sectionHasMatch[sectionId])
      })

      const anyMatch = Object.values(sectionHasMatch).some(Boolean)
      content.classList.toggle("search-no-results", !anyMatch)
      if (searchEmptyState) {
        const lang = document.getElementById("language").value
        searchEmptyState.textContent = translate(lang, "settings.nav.search_no_results", { query })
      }
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => applySearch(searchInput.value))
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          searchInput.value = ""
          applySearch("")
          searchInput.blur()
        }
      })
    }

    document.querySelectorAll(".sidebar-item").forEach(btn => {
      btn.addEventListener("click", () => {
        if (searchInput && searchInput.value.trim()) {
          searchInput.value = ""
          applySearch("")
        }
        navigateTo(btn.dataset.section.replace(/\s+/g, "_"))
      })
    })

    const hash = location.hash.slice(1)
    if (hash && document.getElementById("section-" + hash)) {
      navigateTo(hash)
    } else {
      setActiveSidebarItem("general")
    }

    const languages = document.getElementById("language")
    for (const [k, v] of Object.entries(availableLanguages({hideDefault: true}))) {
      const option = document.createElement("option")
      option.text = v
      option.value = k
      languages.appendChild(option)
    }

    const coverageList = document.getElementById("translation-coverage-list")
    const coverage = translationCoverage()
    const sorted = Object.entries(coverage).sort((a, b) => b[1].coverage - a[1].coverage)
    sorted.forEach(([code, { name, coverage: pct }], i) => {
      if (i > 0) {
        const divider = document.createElement("div")
        divider.className = "setting-divider"
        coverageList.appendChild(divider)
      }
      const row = document.createElement("div")
      row.className = "setting-row translation-coverage-row"

      const label = document.createElement("span")
      label.className = "translation-lang-name"
      label.textContent = `${name} (${code})`

      const barWrap = document.createElement("div")
      barWrap.className = "translation-bar-wrap"

      const bar = document.createElement("div")
      bar.className = "translation-bar"
      bar.style.width = `${pct}%`
      if (pct === 100) bar.classList.add("translation-bar--full")
      else if (pct >= 75) bar.classList.add("translation-bar--good")
      else bar.classList.add("translation-bar--low")

      const pctLabel = document.createElement("span")
      pctLabel.className = "translation-pct"
      pctLabel.textContent = `${pct}%`

      barWrap.appendChild(bar)
      row.appendChild(label)
      row.appendChild(barWrap)
      row.appendChild(pctLabel)
      coverageList.appendChild(row)
    })

    // Show live demo
    new HexClock(document.getElementById("hexbgdemobg"), {background:true}).start()
    new HexClock(document.getElementById("hexbgdemotext"), {text:true}).start()
  })

  // CustomBG Appender
  document.getElementById("custombg_uploader").onchange = async () => {
    const allPreviews = document.getElementById("custombg_previews")
    const files = document.getElementById("custombg_uploader").files

    if (!files.length) { return }

    for (const file of files) {
      const id = await bgPut(file)
      createPreview(URL.createObjectURL(file), id, allPreviews)
      saveOptions("Added background image", "add")
    }

    // Reset so the same file can be uploaded again if wanted
    document.getElementById("custombg_uploader").value = ""
  }

  const addGroup = () => {
    const nameInput = document.getElementById("group_name")
    const lang = document.getElementById("language").value
    const card = createGroupElement(nameInput.value || translate(lang, "settings.bookmarks.groups.default_name"), [])
    nameInput.value = ""
    refreshTopSitesPlacementSelect()
    saveOptions("Added new group")
    // Drop focus straight into the new group so bookmarks can be added right away
    highlightInput(card.querySelector(".bookmark-add-name"))
  }
  document.getElementById("add_group").onclick = addGroup
  addOnEnter(document.getElementById("group_name"), addGroup)

  // CustomBG Remover
  document.body.onclick = async function (ev) {
    if (ev.target.classList.contains("preview-image")) {
      await bgDelete(Number(ev.target.dataset.bgId))
      URL.revokeObjectURL(ev.target.src)
      ev.target.closest(".preview-container").remove()
      saveOptions("Removed background image", "remove")
    }
  }

  async function custombgPrune() {
    const custombgPreviews = document.getElementById("custombg_previews")
    const findCustomBg = custombgPreviews.getElementsByClassName("preview-container")
    if (findCustomBg.length == 0) { return }

    await bgClear()
    while (findCustomBg.length > 0) {
      findCustomBg[0].remove()
    }

    saveOptions("Deleted all background images", "remove")
  }

  document.addEventListener("DOMContentLoaded", restoreOptions)

  document.getElementById("custombg_prune").addEventListener("click", custombgPrune)

  document.getElementById("export-settings").addEventListener("click", exportSettings)

  document.getElementById("import-settings-input").addEventListener("change", (e) => {
    const file = e.target.files[0]
    if (file) importSettings(file)
    e.target.value = ""
  })

  document.getElementById("import-settings-btn").addEventListener("click", () => {
    document.getElementById("import-settings-input").click()
  })
}

// This part loads only on window.html
if (document.getElementById("window-settings-btn")) {
  chrome.storage.local.get({ language: "" }, (items) => {
    applyTranslations(items.language)
  })
}
