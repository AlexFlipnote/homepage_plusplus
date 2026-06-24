import { getVersion } from "./browser.js"
import { bgPut } from "./backgrounds.js"

const MIGRATION_VERSION_KEY = "_migrated_version"

function semverLte(a, b) {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return false
    if (pa[i] < pb[i]) return true
  }
  return true // equal
}

const migrations = [
  {
    version: "2.6.7",
    run(items) {
      const updates = {}

      // Tumbler moved from clock_style value 1 to a separate clock_tumbler toggle
      if (items.clock_style === 1) {
        updates.clock_style = 0
        updates.clock_tumbler = true
      }

      // Jumbo clock replaced by scaleClock individual scale
      if (items.clock_jumbo) {
        updates.scaleClock = 1.5
        updates.clock_jumbo = false
      }

      return Object.keys(updates).length ? updates : null
    }
  },
  {
    version: "2.7.0",
    run(items) {
      if (Array.isArray(items.notepadTabs)) return null
      return {
        notepadTabs: [{ content: items.notepadContent || "", colour: "#ffffff", title: "Note 1" }],
        notepadActiveTab: 0
      }
    }
  },
  {
    version: "2.7.6",
    async run(items) {
      if (!items.custombg?.length) return null
      for (const dataUrl of items.custombg) {
        try {
          const blob = await fetch(dataUrl).then(r => r.blob())
          await bgPut(blob)
        } catch (e) { void e }
      }
      return { custombg: [] }
    }
  }
]

export function runMigrations() {
  const currentVersion = getVersion()

  chrome.storage.local.get({ [MIGRATION_VERSION_KEY]: "0.0.0" }, (meta) => {
    const migratedVersion = meta[MIGRATION_VERSION_KEY]
    if (migratedVersion === currentVersion) return

    const pending = migrations.filter(m => semverLte(m.version, currentVersion) && !semverLte(m.version, migratedVersion))
    if (pending.length === 0) {
      chrome.storage.local.set({ [MIGRATION_VERSION_KEY]: currentVersion })
      return
    }

    chrome.storage.local.get(null, async (items) => {
      const updates = {}
      for (const migration of pending) {
        const result = await migration.run({ ...items, ...updates })
        if (result) Object.assign(updates, result)
      }

      updates[MIGRATION_VERSION_KEY] = currentVersion
      chrome.storage.local.set(updates, () => location.reload())
    })
  })
}
