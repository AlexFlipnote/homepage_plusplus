import { translate, SELECTED_LANG } from "./i18n.js"

export const CLOCK_STYLE = {
  DIGITAL: 0,
  TUMBLER: 1,
  SWISS: 2
}

export function compileStrftime(fmt) {
  const pad2 = n => (n < 10 ? "0" + n : "" + n)
  const pad3 = n => (n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n)
  const padSpace2 = n => (n < 10 ? " " + n : "" + n)

  const intlCache = {
    monthLong: new Map(),
    monthShort: new Map(),
    weekdayLong: new Map(),
    weekdayShort: new Map(),
    dayPeriod: new Map()
  }

  function fmtPartsForMonth(options) {
    const translateKey = options.length === "short" ? "date.months.short" : "date.months.long"
    const monthNames = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december"
    ]

    return monthIndex => {
      const monthKey = monthNames[monthIndex]
      return translate(SELECTED_LANG, `${translateKey}.${monthKey}`)
    }
  }

  function fmtPartsForWeekday(options) {
    const translateKey = options.length === "short" ? "date.days.short" : "date.days.long"
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    return weekdayIndex => {
      const dayKey = dayNames[weekdayIndex]
      return translate(SELECTED_LANG, `${translateKey}.${dayKey}`)
    }
  }

  function fmtDayPeriod() {
    if (!intlCache.dayPeriod.has("en-US")) {
      const dtf = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true })
      intlCache.dayPeriod.set("en-US", dtf)
    }
    const dtf = intlCache.dayPeriod.get("en-US")
    return hour => {
      const parts = dtf.formatToParts(new Date(2020, 0, 1, hour))
      const p = parts.find(x => x.type === "dayPeriod")
      return p ? p.value : (hour < 12 ? "AM" : "PM")
    }
  }

  function tokenFactory(token) {
    switch (token) {
    case "%Y": return d => String(d.getFullYear())
    case "%y": return d => pad2(d.getFullYear() % 100)

    case "%m": return d => pad2(d.getMonth() + 1)
    case "%B": {
      const getMonth = fmtPartsForMonth({ length: "long" })
      return d => getMonth(d.getMonth())
    }
    case "%b": {
      const getMonth = fmtPartsForMonth({ length: "short" })
      return d => getMonth(d.getMonth())
    }

    case "%d": return d => pad2(d.getDate())
    case "%e": return d => padSpace2(d.getDate())
    case "%j": return d => {
      const start = new Date(d.getFullYear(), 0, 1)
      const diff = d - start
      return pad3(Math.floor(diff / 86400000) + 1)
    }

    case "%A": {
      const getDay = fmtPartsForWeekday({ length: "long" })
      return d => getDay(d.getDay())
    }
    case "%a": {
      const getDay = fmtPartsForWeekday({ length: "short" })
      return d => getDay(d.getDay())
    }
    case "%w": return d => String(d.getDay())

    case "%H": return d => pad2(d.getHours())
    case "%I": return d => {
      const h = d.getHours() % 12
      return pad2(h === 0 ? 12 : h)
    }
    case "%p": {
      const getPeriod = fmtDayPeriod()
      return d => getPeriod(d.getHours())
    }

    case "%M": return d => pad2(d.getMinutes())
    case "%S": return d => pad2(d.getSeconds())
    case "%f": return d => String(d.getMilliseconds()).padStart(3, "0")

    case "%z": return d => {
      const off = -d.getTimezoneOffset()
      const sign = off >= 0 ? "+" : "-"
      const abs = Math.abs(off)
      const hh = pad2(Math.floor(abs / 60))
      const mm = pad2(abs % 60)
      return sign + hh + mm
    }
    case "%Z": return d => {
      try {
        const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(d)
        const t = parts.find(p => p.type === "timeZoneName")
        return t ? t.value : tokenFactory("%z")(d)
      } catch {
        return tokenFactory("%z")(d)
      }
    }

    case "%F": return d => `${tokenFactory("%Y")(d)}-${tokenFactory("%m")(d)}-${tokenFactory("%d")(d)}`
    case "%T": return d => `${tokenFactory("%H")(d)}:${tokenFactory("%M")(d)}:${tokenFactory("%S")(d)}`
    case "%%": return () => "%"

    default:
      return () => token
    }
  }

  const parts = []
  const regex = /%[A-Za-z%]/g
  let lastIndex = 0
  let m

  while ((m = regex.exec(fmt)) !== null) {
    const idx = m.index
    if (idx > lastIndex) {
      parts.push(fmt.slice(lastIndex, idx))
    }
    const token = m[0]
    parts.push(tokenFactory(token))
    lastIndex = idx + token.length
  }
  if (lastIndex < fmt.length) parts.push(fmt.slice(lastIndex))

  return function formatDate(date = new Date()) {
    if (!(date instanceof Date)) date = new Date(date)
    const o = []
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (typeof p === "string") o.push(p)
      else o.push(p(date))
    }
    return o.join("")
  }
}

export class Clock {
  constructor(el, format) {
    this.el = typeof el === "string" ? document.getElementById(el) : el
    this.format = format
    this.animationFrameId = null
    this._lastTime = null
  }

  changeFormat(newFormat) {
    this.format = newFormat
    this._lastTime = null
  }

  getTime() {
    const fmt = compileStrftime(this.format)
    return fmt(new Date())
  }

  start() {
    const time = this.getTime()
    if (time !== this._lastTime) {
      this._lastTime = time
      this.el.textContent = time
    }
    this.animationFrameId = requestAnimationFrame(() => this.start())
  }

  stop() {
    cancelAnimationFrame(this.animationFrameId)
    this._lastTime = null
  }
}

export class TumblerClock {
  constructor(el, format) {
    this.el = typeof el === "string" ? document.getElementById(el) : el
    this.format = format
    this.animationFrameId = null
    this.lastTime = null
    this.slots = []
    this._initialized = false
  }

  changeFormat(newFormat) {
    this.format = newFormat
    this._initialized = false
    this.lastTime = null
    this.slots = []
  }

  getTime() {
    const fmt = compileStrftime(this.format)
    return fmt(new Date())
  }

  _initSlots(timeStr) {
    this.el.innerHTML = ""
    this.el.classList.add("clock-tumbler")
    this.slots = []

    for (const ch of timeStr) {
      const slot = document.createElement("span")
      slot.className = "clock-slot"
      const char = document.createElement("span")
      char.className = "clock-char"
      char.textContent = ch
      slot.appendChild(char)
      this.el.appendChild(slot)
      this.slots.push({ slotEl: slot, charEl: char, value: ch })
    }

    this._initialized = true
    this.lastTime = timeStr
  }

  _updateSlots(newTime) {
    if (newTime.length !== this.slots.length) {
      this._initSlots(newTime)
      return
    }

    for (let i = 0; i < newTime.length; i++) {
      const newChar = newTime[i]
      const slotData = this.slots[i]

      if (newChar !== slotData.value) {
        slotData.value = newChar
        const oldCharEl = slotData.charEl

        const newCharEl = document.createElement("span")
        newCharEl.className = "clock-char clock-char--enter"
        newCharEl.textContent = newChar

        oldCharEl.classList.add("clock-char--exit")
        slotData.slotEl.appendChild(newCharEl)
        slotData.charEl = newCharEl

        setTimeout(() => {
          oldCharEl.remove()
          newCharEl.classList.remove("clock-char--enter")
        }, 350)
      }
    }

    this.lastTime = newTime
  }

  start() {
    const currentTime = this.getTime()

    if (!this._initialized) {
      this._initSlots(currentTime)
    } else if (currentTime !== this.lastTime) {
      this._updateSlots(currentTime)
    }

    this.animationFrameId = requestAnimationFrame(() => this.start())
  }

  stop() {
    cancelAnimationFrame(this.animationFrameId)
    this.el.classList.remove("clock-tumbler")
    this.el.innerHTML = ""
    this._initialized = false
  }
}

export class AnalogClock {
  constructor(el) {
    this.el = typeof el === "string" ? document.getElementById(el) : el
    this.animationFrameId = null
    this._initialized = false
    this._hourEl = null
    this._minuteEl = null
    this._secondEl = null
    this._lastMinuteDeg = null
  }

  _init() {
    this.el.classList.add("analog-clock")
    this.el.innerHTML = ""
    this._lastMinuteDeg = null

    // Generate 60 tick marks, every 5th is an hour mark
    for (let i = 0; i < 60; i++) {
      const mark = document.createElement("div")
      mark.className = i % 5 === 0 ? "clock-mark clock-mark--hour" : "clock-mark"
      mark.style.transform = `rotate(${i * 6}deg)`
      this.el.appendChild(mark)
    }

    const hour = document.createElement("div")
    hour.className = "hand hand--hour"
    const minute = document.createElement("div")
    minute.className = "hand hand--minute"
    const second = document.createElement("div")
    second.className = "hand hand--second"

    this.el.append(hour, minute, second)
    this._hourEl = hour
    this._minuteEl = minute
    this._secondEl = second
    this._initialized = true
  }

  _update() {
    const now = new Date()
    const ms = now.getMilliseconds()
    const rawS = now.getSeconds() + ms / 1000
    const minutes = now.getMinutes()
    const hours = now.getHours() % 12

    // Second hand: sweeps 360° in 58s, parks at 12 for ~2s (SBB behaviour)
    const secondDeg = rawS < 58 ? (rawS / 58) * 360 : 360
    this._secondEl.style.transform = `rotate(${secondDeg}deg)`

    if (rawS < 58) {
      // Normal: hands fixed, only write to DOM when value changes
      const minuteDeg = minutes * 6
      if (minuteDeg !== this._lastMinuteDeg) {
        this._lastMinuteDeg = minuteDeg
        this._hourEl.style.transform = `rotate(${(hours + minutes / 60) * 30}deg)`
        this._minuteEl.style.transform = `rotate(${minuteDeg}deg)`
      }
    } else if (rawS >= 59) {
      // Second half of park (59→60): smoothly animate toward next minute
      const t = Math.min(rawS - 59, 1)
      const eased = t * t * (3 - 2 * t) // smoothstep
      const minuteDeg = minutes * 6 + 6 * eased
      const hourDeg = (hours + minutes / 60) * 30 + 0.5 * eased // 0.5° per minute step
      this._lastMinuteDeg = null // reset so first normal frame after rollover updates cleanly
      this._hourEl.style.transform = `rotate(${hourDeg}deg)`
      this._minuteEl.style.transform = `rotate(${minuteDeg}deg)`
    }
    // rawS 58–59: second parked, hands static, no update needed
  }

  start() {
    if (!this._initialized) this._init()
    this._update()
    this.animationFrameId = requestAnimationFrame(() => this.start())
  }

  stop() {
    cancelAnimationFrame(this.animationFrameId)
    this.el.classList.remove("analog-clock")
    this.el.innerHTML = ""
    this._initialized = false
    this._lastMinuteDeg = null
  }
}

export class HexClock {
  constructor(el, {background=false, color=false, text=false}={}) {
    this.el = typeof el === "string" ? document.getElementById(el) : el
    this.background = background
    this.color = color
    this.text = text
    this.animationFrameId = null
  }

  _timeInHex() {
    function pad(n) { return ("0" + n).slice(-2) }
    let now = new Date()
    let hour = pad(now.getHours())
    let minute = pad(now.getMinutes())
    let second = pad(now.getSeconds())
    return `${hour}${minute}${second}`
  }

  start() {
    if (this.background) this.el.style.backgroundColor = `#${this._timeInHex()}`
    if (this.color) this.el.style.color = `#${this._timeInHex()}`
    if (this.text) this.el.textContent = `#${this._timeInHex()}`
    this.animationFrameId = requestAnimationFrame(() => this.start())
  }

  stop() {
    cancelAnimationFrame(this.animationFrameId)
  }
}
