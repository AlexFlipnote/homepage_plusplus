import Sortable from "sortablejs"

import { isFirefox, getVersion } from "./utils/browser.js"
import { WorldMap } from "./utils/openstreetmap.js"
import { HexClock } from "./utils/timeManager.js"
import { availableLanguages, translate, translationCoverage } from "./utils/i18n.js"

const defaultColour = "#ffffff"
const defaultColourBlurBg = "#181818"

export const extensionSettings = {
  language: "",
  searchbar: false,
  animations: false,
  disableTextShadow: false,
  custombg: [],
  show_time: true,
  show_date: true,
  fmt_time: "",
  fmt_date: "",
  customfont: "",
  customfontgoogle: false,
  bookmarks: [],
  bookmarksFavicon: false,
  bookmarksTopSitesEnabled: false,
  bookmarksTopSitesAmount: 5,
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
  notepadOpen: false,
  notepadTabs: [],
  notepadActiveTab: 0,
  notepadWidth: 300,
  notepadHeight: 220,
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
  const custombg = []
  const custombgPreviews = document.getElementsByClassName("preview-image")
  for (var i = 0; i < custombgPreviews.length; i++) { custombg.push(custombgPreviews[i].src) }

  function fetchBookmarkInputs() {
    const blist = document.getElementById("blist")
    const bookmarkItems = blist.getElementsByClassName("bookmark-item")
    const bookmarks = []

    for (var i = 0; i < bookmarkItems.length; i++) {
      const bmEl = bookmarkItems[i]
      const name = bmEl.getElementsByClassName("bookmark-name")[0].value
      const url = bmEl.getElementsByClassName("bookmark-url")[0].value || "#"
      bookmarks.push({ name: name, url: url })
    }

    return bookmarks
  }

  function saveColour(elName, defaultValue = defaultColour) {
    const el = document.getElementById(elName)
    if (el && el.value === defaultValue) {
      return null
    }
    return el ? el.value : null
  }

  chrome.storage.local.set({
    language: document.getElementById("language").value,
    animations: document.getElementById("animations").checked,
    custombg: custombg,
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
    customcss: document.getElementById("customcss").value,
    bookmarks: fetchBookmarkInputs(),
    notepadEnabled: document.getElementById("notepadEnabled").checked,
    notepadInWindow: document.getElementById("notepadInWindow").checked,
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
  const getMap = document.getElementById("map")
  getMap.style.display = "block"

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
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
  chrome.storage.local.get({ ...extensionSettings }, (items) => {
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

      if (wManualLocation.checked) {
        createMapInit(items)
      } else {
        document.getElementById("map").style.display = "none"
      }
    }

    if (items.wManualLocation) {
      createMapInit(items)
    }

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

    const bookmarksTopSitesEnabled = document.getElementById("bookmarksTopSitesEnabled")
    bookmarksTopSitesEnabled.checked = items.bookmarksTopSitesEnabled
    bookmarksTopSitesEnabled.onchange = () => { saveOptions(`Bookmarks top sites set: ${bookmarksTopSitesEnabled.checked}`, bookmarksTopSitesEnabled.checked ? "add" : "remove") }

    const bookmarksTopSitesAmount = document.getElementById("bookmarksTopSitesAmount")
    const bookmarksTopSitesAmountLabel = document.getElementById("bookmarksTopSitesAmount-label")
    bookmarksTopSitesAmount.value = items.bookmarksTopSitesAmount
    if (bookmarksTopSitesAmountLabel) bookmarksTopSitesAmountLabel.textContent = items.bookmarksTopSitesAmount
    bookmarksTopSitesAmount.oninput = () => { if (bookmarksTopSitesAmountLabel) bookmarksTopSitesAmountLabel.textContent = bookmarksTopSitesAmount.value }
    bookmarksTopSitesAmount.onchange = () => { saveOptions(`Bookmarks top sites amount set: ${bookmarksTopSitesAmount.value}`, "change") }

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
        const ids = ["scaleClock", "scaleDate", "scaleSearchbar", "scaleWeather", "scaleBookmarks", "scaleIcon"]
        ids.forEach(id => {
          const el = document.getElementById(id)
          const labelEl = document.getElementById(`${id}-label`)
          if (el) el.value = 1.0
          if (labelEl) labelEl.textContent = "1.0"
        })
        saveOptions("Individual scales reset to global", "change")
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

    items.bookmarks.forEach(({ name, url }) => {
      createBookmarkElement(name, url)
    })

    const allPreviews = document.getElementById("custombg_previews")
    for (var i = 0; i < items.custombg.length; i++) {
      createPreview(items.custombg[i], allPreviews)
    }
  })
}

function createBookmarkElement(bkey, burl) {
  const blist = document.getElementById("blist")
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

  blist.appendChild(container)
}

function createPreview(image, target) {
  const container = document.createElement("div")
  container.classList.add("preview-container")

  const preview = document.createElement("img")
  preview.classList.add("preview-image")
  preview.src = image

  container.append(preview) // div -> img

  const fileContainer = target.querySelector(".file-container")
  fileContainer.before(container)
}

// This part of the code loads only when touching options.html
if (document.getElementById("settings-notification")) {
  document.addEventListener("DOMContentLoaded", () => {
    const categoryMap = {
      general: ["general", "timestamp"],
      appearance: ["background", "colours", "font", "hexbg", "scale", "accessibility"],
      features: ["weather", "bookmarks", "notepad"],
      advanced: ["customcss", "backup", "translations"]
    }

    const sectionToCategory = {}
    for (const [cat, sections] of Object.entries(categoryMap)) {
      for (const s of sections) sectionToCategory[s] = cat
    }

    const content = document.querySelector(".settings-content")

    function setActiveSidebarItem(name) {
      document.querySelectorAll(".sidebar-item").forEach(b => b.classList.remove("active"))
      const btn = document.querySelector(`.sidebar-item[data-section="${name}"]`)
      if (btn) btn.classList.add("active")
    }

    function activateCategory(categoryName) {
      document.querySelectorAll(".settings-section").forEach(s => s.classList.remove("active"))
      const sections = categoryMap[categoryName] || []
      sections.forEach(name => {
        const s = document.getElementById("section-" + name)
        if (s) s.classList.add("active")
      })
    }

    function navigateTo(sectionName) {
      const category = sectionToCategory[sectionName]
      if (!category) return

      activateCategory(category)
      setActiveSidebarItem(sectionName)
      location.hash = sectionName

      requestAnimationFrame(() => {
        const target = document.getElementById("section-" + sectionName)
        if (!target) return
        if (categoryMap[category][0] === sectionName) {
          content.scrollTop = 0
        } else {
          const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop
          content.scrollTop = top
        }
        if (userMap.map) userMap.map.invalidateSize()
      })
    }

    content.addEventListener("scroll", () => {
      const threshold = 80
      const activeSections = [...document.querySelectorAll(".settings-section.active")]
      const contentTop = content.getBoundingClientRect().top

      let current = activeSections[0]
      for (const section of activeSections) {
        const top = section.getBoundingClientRect().top - contentTop
        if (top <= threshold) current = section
      }

      if (current) setActiveSidebarItem(current.id.replace("section-", ""))
    })

    document.querySelectorAll(".sidebar-item").forEach(btn => {
      btn.addEventListener("click", () => {
        navigateTo(btn.dataset.section.replace(/\s+/g, "_"))
      })
    })

    const hash = location.hash.slice(1)
    if (hash && sectionToCategory[hash]) {
      navigateTo(hash)
    } else {
      activateCategory("general")
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

    new Sortable(document.getElementById("blist"), {
      animation: 150,
      ghostClass: "sortable-ghost",
      handle: ".drag",
      onEnd: () => {
        saveOptions("Reordered bookmarks", "change")
      }
    })
  })

  // CustomBG Appender
  document.getElementById("custombg_uploader").onchange = () => {
    const allPreviews = document.getElementById("custombg_previews")

    const files = document.getElementById("custombg_uploader").files

    if (!files.length) { return }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const reader = new FileReader()

      reader.addEventListener("load", () => {
        const mbLimit = 1.5
        const imageSizeMB = (reader.result.length * (3/4)) / (1024 * 1024)
        if (imageSizeMB > mbLimit) {
          createAlert(`Image is larger than ${mbLimit}MB and will not be uploaded.`, "remove")
        } else {
          createPreview(reader.result, allPreviews)
          saveOptions("Added background image", "add")
        }
      }, false)

      reader.readAsDataURL(file)
    }

    // When done, reset the input so the same file can be uploaded again if wanted
    document.getElementById("custombg_uploader").value = ""
  }

  document.getElementById("add_bookmark").onclick = () => {
    createBookmarkElement(
      document.getElementById("bookmark_name").value || "New Bookmark",
      document.getElementById("bookmark_url").value || "#"
    )
    document.getElementById("bookmark_name").value = ""
    document.getElementById("bookmark_url").value = ""
    saveOptions("Added new bookmark")
  }

  // CustomBG Remover
  document.body.onclick = function (ev) {
    if (ev.target.getAttribute("class") == "preview-image") {
      ev.target.remove()
      saveOptions("Removed background image", "remove")
    }
  }

  function custombgPrune() {
    const custombgPreviews = document.getElementById("custombg_previews")
    const findCustomBg = custombgPreviews.getElementsByClassName("preview-container")
    if (findCustomBg.length == 0) { return }

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
