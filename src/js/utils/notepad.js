import Sortable from "sortablejs"
import { translate, getLocale } from "./i18n.js"

function t(key, args) { return translate(getLocale(), key, args) }
function defaultTitle(n) { return t("notepad.tab.default_title", { n }) }

export function createNotepadCore(tabsBar, tabAddBtn, notepadText) {
  let tabs = []
  let activeTab = 0
  let saveCallback = null
  let saveTimer = null
  let pendingDelete = -1
  let sortable = null

  function schedSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveCallback?.(tabs, activeTab), 500)
  }

  function flush() {
    if (tabs[activeTab]) tabs[activeTab].content = notepadText.value
  }

  function load() {
    notepadText.value = tabs[activeTab]?.content || ""
  }

  const tabsWrap = tabsBar.parentElement

  function updateShadows() {
    const atLeft = tabsBar.scrollLeft <= 0
    const atRight = tabsBar.scrollLeft + tabsBar.clientWidth >= tabsBar.scrollWidth - 1
    tabsWrap.classList.toggle("shadow-left", !atLeft)
    tabsWrap.classList.toggle("shadow-right", !atRight)
  }

  function initSortable() {
    sortable = new Sortable(tabsBar, {
      animation: 150,
      ghostClass: "notepad-tab-ghost",
      onEnd: ({ oldIndex, newIndex }) => {
        if (oldIndex === newIndex) return
        flush()
        const activeRef = tabs[activeTab]
        const moved = tabs.splice(oldIndex, 1)[0]
        tabs.splice(newIndex, 0, moved)
        activeTab = tabs.indexOf(activeRef)
        pendingDelete = -1
        // defer so Sortable finishes before we rebuild the DOM
        setTimeout(render, 0)
        schedSave()
      }
    })
  }

  function render() {
    if (sortable) { sortable.destroy(); sortable = null }

    tabsBar.innerHTML = ""
    tabs.forEach((tab, i) => {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "notepad-tab" + (i === activeTab ? " active" : "")
      btn.style.setProperty("--tab-colour", tab.colour || "#ffffff")
      btn.title = tab.title || defaultTitle(i + 1)
      btn.setAttribute("role", "tab")
      btn.setAttribute("aria-selected", String(i === activeTab))

      const swatch = document.createElement("span")
      swatch.className = "notepad-tab-swatch"

      const picker = document.createElement("input")
      picker.type = "color"
      picker.value = tab.colour || "#ffffff"
      picker.className = "notepad-tab-colour-picker"
      picker.addEventListener("input", (e) => {
        e.stopPropagation()
        tabs[i].colour = picker.value
        btn.style.setProperty("--tab-colour", picker.value)
        schedSave()
      })
      swatch.addEventListener("click", (e) => { e.stopPropagation(); picker.click() })

      const titleEl = document.createElement("span")
      titleEl.className = "notepad-tab-title"
      titleEl.textContent = tab.title || defaultTitle(i + 1)
      titleEl.addEventListener("dblclick", (e) => {
        e.stopPropagation()
        const inp = document.createElement("input")
        inp.type = "text"
        inp.className = "notepad-tab-title-edit"
        inp.value = tab.title || defaultTitle(i + 1)
        inp.maxLength = 32
        btn.classList.add("editing")
        titleEl.replaceWith(inp)
        inp.focus()
        inp.select()

        const done = (revert = false) => {
          document.removeEventListener("mousedown", outsideClick)
          if (revert) inp.value = tab.title || defaultTitle(i + 1)
          const v = inp.value.trim()
          if (v) tabs[i].title = v
          render()
          schedSave()
        }

        const outsideClick = (e) => {
          // btn detached by an external render — clean up silently
          if (!btn.isConnected) { document.removeEventListener("mousedown", outsideClick); return }
          if (!btn.contains(e.target)) done()
        }

        document.addEventListener("mousedown", outsideClick)

        inp.addEventListener("keydown", (ke) => {
          if (ke.key === "Enter") { ke.preventDefault(); done() }
          if (ke.key === "Escape") { ke.preventDefault(); done(true) }
          ke.stopPropagation()
        })
      })

      btn.appendChild(swatch)
      btn.appendChild(picker)
      btn.appendChild(titleEl)

      // Close button: on every tab when 2+ exist, but only visible+interactive on active tab via CSS
      if (tabs.length > 1) {
        const isConfirming = pendingDelete === i
        const closeBtn = document.createElement("button")
        closeBtn.type = "button"
        closeBtn.className = "notepad-tab-close" + (isConfirming ? " confirming" : "")
        closeBtn.setAttribute("aria-label", isConfirming
          ? `Confirm remove ${tab.title || defaultTitle(i + 1)}`
          : `Remove ${tab.title || defaultTitle(i + 1)}`)
        closeBtn.textContent = isConfirming ? "✓" : "×"
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation()
          if (isConfirming) {
            pendingDelete = -1
            flush()
            // Pin explicit width so CSS can transition it to 0
            btn.style.width = btn.getBoundingClientRect().width + "px"
            btn.getBoundingClientRect() // force reflow
            btn.classList.add("removing")
            const onEnd = (ev) => {
              if (ev.propertyName !== "width") return
              btn.removeEventListener("transitionend", onEnd)
              tabs.splice(i, 1)
              if (activeTab >= tabs.length) activeTab = tabs.length - 1
              render()
              load()
              schedSave()
            }
            btn.addEventListener("transitionend", onEnd)
          } else {
            pendingDelete = i
            render()
          }
        })
        btn.appendChild(closeBtn)
      }

      btn.addEventListener("click", (e) => {
        if (e.target === picker || e.target === swatch) return
        if (i === activeTab) return
        flush()
        // Clear any confirming state without full re-render
        if (pendingDelete !== -1) {
          const conf = tabsBar.querySelector(".notepad-tab-close.confirming")
          if (conf) {
            conf.classList.remove("confirming")
            conf.textContent = "×"
          }
          pendingDelete = -1
        }
        // Swap .active in-place so the close button CSS transition fires
        tabsBar.querySelectorAll(".notepad-tab").forEach((el, idx) => {
          el.classList.toggle("active", idx === i)
          el.setAttribute("aria-selected", String(idx === i))
        })
        activeTab = i
        load()
        schedSave()
      })

      tabsBar.appendChild(btn)
    })

    if (saveCallback !== null) initSortable()
    requestAnimationFrame(updateShadows)
  }

  tabAddBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    pendingDelete = -1
    flush()
    tabs.push({ content: "", colour: "#ffffff", title: defaultTitle(tabs.length + 1) })
    activeTab = tabs.length - 1
    render()
    load()
    schedSave()
    notepadText.focus()
  })

  notepadText.addEventListener("input", () => {
    if (tabs[activeTab]) tabs[activeTab].content = notepadText.value
    schedSave()
  })

  notepadText.addEventListener("mousedown", () => {
    if (pendingDelete === -1) return
    pendingDelete = -1
    render()
  })

  tabsBar.addEventListener("scroll", updateShadows)
  new ResizeObserver(updateShadows).observe(tabsBar)

  // Convert vertical scroll to horizontal on the tab bar
  tabsBar.addEventListener("wheel", (e) => {
    if (e.deltaY === 0) return
    e.preventDefault()
    tabsBar.scrollBy({ left: e.deltaY, behavior: "smooth" })
  }, { passive: false })

  return {
    init(initTabs, initActive, onSaveCallback) {
      saveCallback = onSaveCallback
      tabs = initTabs.length ? initTabs.map(t => ({ ...t })) : [{ content: "", colour: "#ffffff", title: defaultTitle(1) }]
      activeTab = Math.min(initActive || 0, tabs.length - 1)
      render()
      load()
    },
    flush,
    getTabs: () => tabs,
    getActiveTab: () => activeTab,
    onExternalChange(newTabs, newActiveTab) {
      if (!newTabs?.length) return
      if (
        JSON.stringify(newTabs) === JSON.stringify(tabs) &&
        newActiveTab === activeTab
      ) return
      pendingDelete = -1
      tabs = newTabs.map(t => ({ ...t }))
      activeTab = Math.min(newActiveTab || 0, tabs.length - 1)
      render()
      load()
    }
  }
}
