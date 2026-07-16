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
  },
  {
    version: "2.8.0",
    run(items) {
      // Flat bookmarks array is now grouped: wrap the legacy list into one default group
      if (Array.isArray(items.bookmarkGroups)) return null
      const legacy = Array.isArray(items.bookmarks) ? items.bookmarks : []
      return { bookmarkGroups: [{ name: "Bookmarks", items: legacy }] }
    }
  },
  {
    version: "2.8.1",
    run(items) {
      // Recovery: the 2.8.0 migration only ran on the new-tab page, so opening Settings
      // first could persist an empty bookmarkGroups and strand the legacy `bookmarks` key.
      // Restore those bookmarks if the groups are effectively empty.
      const legacy = Array.isArray(items.bookmarks) ? items.bookmarks : []
      if (!legacy.length) return null

      const groups = Array.isArray(items.bookmarkGroups) ? items.bookmarkGroups : []
      const hasBookmarks = groups.some(g => Array.isArray(g.items) && g.items.length)
      if (hasBookmarks) return null // groups already hold data, never clobber it

      if (groups.length) {
        const restored = [...groups]
        restored[0] = { ...restored[0], items: legacy }
        return { bookmarkGroups: restored }
      }
      return { bookmarkGroups: [{ name: "Bookmarks", items: legacy }] }
    }
  },
  {
    version: "2.8.2",
    run(items) {
      // Mark bookmark migration complete. Once set, bookmarkGroups is authoritative and the
      // legacy `bookmarks` key is ignored — so deleting all groups sticks instead of the old
      // list being resurrected by the render fallback.
      if (items.bookmarksMigrated) return null
      return { bookmarksMigrated: true }
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
