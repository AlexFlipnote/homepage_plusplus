import { http } from "./http.js"
import { translate } from "./i18n.js"
import { reverseGeocode } from "./openstreetmap.js"
import { Cache } from "./cache.js"

// eslint-disable-next-line camelcase
import tz_lookup from "tz-lookup"

function toFahrenheit(celsius) {
  return Math.round(celsius * (9 / 5) + 32)
}

class ForecastData {
  constructor(data, lang = "en", time = null, timezone = null) {
    this.temprature = data.instant.details.air_temperature
    this.wind_speed = data.instant.details.wind_speed
    this.humidity = data.instant.details.relative_humidity
    this.wind_degrees = data.instant.details.wind_from_direction

    this.symbol_code = data.next_1_hours.summary.symbol_code
    this.precipitation = data.next_1_hours.details.precipitation_amount

    this.lang = lang
    this.time = time ? new Date(time) : null
    this.timezone = timezone
  }

  getHour() {
    if (!this.time) return ""
    const opts = { hour: "2-digit", hour12: false, ...(this.timezone && { timeZone: this.timezone }) }
    return this.time.toLocaleString("en-GB", opts) + ":00"
  }

  prettyName() {
    const removeVariant = this.symbol_code.replace("_day", "").replace("_night", "").replace("_polar_night", "")
    return translate(this.lang, `weather.${removeVariant}`).replace(/^\w/, c => c.toUpperCase())
  }

  feelsLike() {
    // Water vapor pressure (e) calculation
    const e = (this.humidity / 100) * 6.105 * Math.exp(
      (17.27 * this.temprature) / (237.7 + this.temprature)
    )
    // Australian Apparent Temperature formula
    const at = this.temprature + 0.33 * e - 0.70 * this.wind_speed - 4.00
    return Math.round(at * 10) / 10
  }
}

class MetNoWeather {
  constructor(lang = "en") {
    this.lang = lang
    this.entries = []
    this.timezone = null
  }

  updateEntries(weatherDataRaw) {
    this.entries = weatherDataRaw.map(entry => new ForecastData(entry.data, this.lang, entry.time, this.timezone))
  }

  getCurrent() {
    return this.entries[0]
  }

  getNextHours() {
    return this.entries.slice(1, this.entries.length)
  }

  async fetch(position) {
    const cache = new Cache()
    const pos = position.coords
    const posPrefix = `${pos.latitude.toFixed(2)},${pos.longitude.toFixed(2)}`
    const cacheKey = `weatherData_${posPrefix}`

    this.timezone = tz_lookup(pos.latitude, pos.longitude)

    // Check if weather data is cached (5 minutes)
    const cachedWeather = await cache.get(cacheKey)
    if (cachedWeather) {
      console.log("📦 Cache: Fetched weather data from cache")
      this.updateEntries(cachedWeather)
      return
    }

    const weatherResponse = await http(
      "GET",
      `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${pos.latitude}&lon=${pos.longitude}`
    )

    const weatherDataRaw = weatherResponse.properties.timeseries
    const now = new Date()
    const futureIdx = weatherDataRaw.findIndex(entry => new Date(entry.time) > now)
    const startIndex = futureIdx > 0 ? futureIdx - 1 : 0
    const slicedData = weatherDataRaw.slice(startIndex, startIndex + 6)
    this.updateEntries(slicedData)
    // Cache weather data for 5 minutes (300 seconds)
    cache.set(cacheKey, slicedData, 300)
  }
}

export async function getWeather(items, position, lang) {
  const cache = new Cache()

  const pos = position.coords
  const posPrefix = `${pos.latitude.toFixed(2)},${pos.longitude.toFixed(2)}`

  const locationCacheKey = `weatherLocation_${posPrefix}`

  const wtemp = document.getElementById("wtemp")
  const wname = document.getElementById("wname")

  let completedRequests = 0
  const showWeatherContainer = () => {
    completedRequests++
    if (completedRequests >= 2) {
      document.getElementById("weather-container").style.display = "flex"
    }
  }

  // Use MetNoWeather class to fetch weather data
  const weather = new MetNoWeather(lang || "en")
  await weather.fetch(position)
  const weatherData = weather.getCurrent()

  document.getElementById("wicon").src = `images/weather/${weatherData.symbol_code}.png`
  document.getElementById("wdescription").innerText = weatherData.prettyName()

  const isFahrenheit = items.temp_type === "fahrenheit"
  if (isFahrenheit) {
    wtemp.innerText = `${toFahrenheit(weatherData.temprature)} °F`
  } else {
    wtemp.innerText = `${Math.round(weatherData.temprature)} °C`
  }

  const forecastEl = document.getElementById("wforecast")
  forecastEl.innerHTML = weather.getNextHours().map(entry => {
    const temp = isFahrenheit
      ? `${toFahrenheit(entry.temprature)} °F`
      : `${Math.round(entry.temprature)} °C`
    return `<div class="forecast-item">
      <span class="forecast-hour">${entry.getHour()}</span>
      <img src="images/weather/${entry.symbol_code}.png" draggable="false" alt="${entry.prettyName()}">
      <span class="forecast-temp">${temp}</span>
    </div>`
  }).join("")

  showWeatherContainer()

  // OpenStreetMap API can be rate limited, so we cache the location name for 1 hour
  const weatherLocation = await cache.get(locationCacheKey)

  if (weatherLocation) {
    console.log("📦 Cache: Fetched location name from cache")
    wname.innerText = weatherLocation
    showWeatherContainer()
    return
  }

  const geoResponse = await reverseGeocode(pos.latitude, pos.longitude)

  wname.innerText = (
    geoResponse.address.city || geoResponse.address.town ||
    geoResponse.address.village || geoResponse.address.hamlet ||
      "Unknown Location"
  )
  showWeatherContainer()
  cache.set(locationCacheKey, wname.innerText)

}

