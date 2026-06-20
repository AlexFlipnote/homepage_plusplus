import Sortable from "sortablejs"
import { translate, getLocale } from "./i18n.js"

function t(key, args) { return translate(getLocale(), key, args) }
function defaultTitle(n) { return t("notepad.tab.default_title", { n }) }

// --- Markdown ↔ editor HTML ---

function applyInline(text) {
  // escape HTML, then apply inline markdown
  const s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return s
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
}

function mdToEditorHtml(md) {
  if (!md) return "<div><br></div>"
  const lines = md.split("\n")
  const out = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].startsWith("|")) {
      const block = []
      while (i < lines.length && lines[i].startsWith("|")) block.push(lines[i++])
      out.push(tableBlockToHtml(block))
    } else {
      out.push(`<div>${applyInline(lines[i]) || "<br>"}</div>`)
      i++
    }
  }
  return out.join("") || "<div><br></div>"
}

function tableBlockToHtml(lines) {
  const rows = lines.filter(l => !/^\|[\s\-:|]+\|$/.test(l))
  if (!rows.length) return ""
  return "<table>" + rows.map(l =>
    "<tr>" + l.split("|").slice(1, -1).map(c => `<td>${applyInline(c.trim()) || "<br>"}</td>`).join("") + "</tr>"
  ).join("") + "</table>"
}

function inlineNodeToMd(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  const inner = () => Array.from(node.childNodes).map(inlineNodeToMd).join("")
  switch (node.nodeName) {
  case "B": case "STRONG":             return `**${inner()}**`
  case "I": case "EM":                 return `*${inner()}*`
  case "DEL": case "S": case "STRIKE": return `~~${inner()}~~`
  case "U":                            return `__${inner()}__`
  case "BR":                           return ""
  default:                             return inner()
  }
}

function editorToMd(editorEl) {
  const lines = []
  for (const child of editorEl.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      lines.push(child.textContent)
    } else if (child.nodeName === "DIV") {
      lines.push(Array.from(child.childNodes).map(inlineNodeToMd).join(""))
    } else if (child.nodeName === "BR") {
      lines.push("")
    } else if (child.nodeName === "TABLE") {
      lines.push(...tableToMd(child))
      // Blank line after table so adjacent tables never merge into one block on reload
      if (child.nextElementSibling?.nodeName === "TABLE") lines.push("")
    }
  }
  // trim a single trailing empty line Chrome sometimes adds
  if (lines.length && lines[lines.length - 1] === "") lines.pop()
  return lines.join("\n")
}

function tableToMd(table) {
  const rows = Array.from(table.querySelectorAll("tr"))
  if (!rows.length) return []
  const lines = []
  rows.forEach((tr, i) => {
    const cells = Array.from(tr.querySelectorAll("td, th")).map(td =>
      Array.from(td.childNodes).map(n => n.nodeName === "BR" ? "" : inlineNodeToMd(n)).join("").trim()
    )
    lines.push(`| ${cells.join(" | ")} |`)
    if (i === 0) lines.push(`| ${cells.map(() => "---").join(" | ")} |`)
  })
  return lines
}

export function createNotepadCore(tabsBar, tabAddBtn, notepadText) {
  let tabs = []
  let activeTab = 0
  let saveCallback = null
  let saveTimer = null
  let pendingDelete = -1
  let deleteTimer = null
  let sortable = null
  let newTabIdx = -1
  let tablePicker = null

  // Replace textarea with contenteditable div (keep same id for CSS)
  const placeholderText = notepadText.placeholder || ""
  const editor = document.createElement("div")
  editor.contentEditable = "true"
  editor.spellcheck = false
  editor.id = notepadText.id
  editor.className = notepadText.className
  editor.dataset.placeholder = placeholderText
  notepadText.replaceWith(editor)

  const tabsWrap = tabsBar.parentElement

  // --- Formatting toolbar ---
  const toolbarEl = document.createElement("div")
  toolbarEl.className = "notepad-toolbar"

  const fmtBtns = [
    { cmd: "bold",          label: "B",  cls: "fmt-bold",      title: "Bold (Ctrl+B)" },
    { cmd: "italic",        label: "I",  cls: "fmt-italic",    title: "Italic (Ctrl+I)" },
    { cmd: "underline",     label: "U",  cls: "fmt-underline", title: "Underline (Ctrl+U)" },
    { cmd: "strikeThrough", label: "S",  cls: "fmt-strike",    title: "Strikethrough" },
    { cmd: "removeFormat",  label: "R",  cls: "fmt-reset",     title: "Reset formatting (Ctrl+R)" }
  ]
  fmtBtns.forEach(({ cmd, label, cls, title, fn }) => {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `notepad-toolbar-btn ${cls}`
    btn.dataset.cmd = cmd
    btn.textContent = label
    btn.title = title
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault() // keep editor focus
      if (fn) fn()
      else document.execCommand(cmd, false, null)
      updateToolbarState()
    })
    toolbarEl.appendChild(btn)
  })

  // --- Table toolbar button ---
  const tableBtnEl = document.createElement("button")
  tableBtnEl.type = "button"
  tableBtnEl.className = "notepad-toolbar-btn fmt-table"
  tableBtnEl.title = "Insert table"
  tableBtnEl.innerHTML = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 12 12\" fill=\"currentColor\" aria-hidden=\"true\"><rect x=\"0\" y=\"0\" width=\"5\" height=\"5\" rx=\"0.5\"/><rect x=\"7\" y=\"0\" width=\"5\" height=\"5\" rx=\"0.5\"/><rect x=\"0\" y=\"7\" width=\"5\" height=\"5\" rx=\"0.5\"/><rect x=\"7\" y=\"7\" width=\"5\" height=\"5\" rx=\"0.5\"/></svg>"
  tableBtnEl.addEventListener("mousedown", (e) => { e.preventDefault(); toggleTablePicker(tableBtnEl) })
  toolbarEl.insertBefore(tableBtnEl, toolbarEl.lastChild)

  editor.after(toolbarEl)

  // --- Table helpers ---

  // A cell is "empty" only if it has no children or a single BR placeholder.
  // Cells with <br><br> (a real line break) are NOT empty.
  function isCellEmpty(cell) {
    const kids = cell.childNodes
    return kids.length === 0 || (kids.length === 1 && kids[0].nodeName === "BR")
  }
  function isRowEmpty(row) {
    return Array.from(row.querySelectorAll("td, th")).every(isCellEmpty)
  }

  function getCellAncestor(node) {
    while (node && node !== editor) {
      if (node.nodeName === "TD" || node.nodeName === "TH") return node
      node = node.parentNode
    }
    return null
  }

  function focusCell(td) {
    const r = document.createRange()
    r.setStart(td, 0)
    r.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }

  function focusCellEnd(td) {
    const r = document.createRange()
    r.selectNodeContents(td)
    r.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }

  function focusElement(el) {
    const r = document.createRange()
    r.setStart(el, 0)
    r.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }

  function addTableRow(table, refRow) {
    const cols = refRow.querySelectorAll("td, th").length
    const tr = document.createElement("tr")
    for (let i = 0; i < cols; i++) {
      const td = document.createElement("td")
      td.innerHTML = "<br>"
      tr.appendChild(td)
    }
    refRow.after(tr)
    return tr
  }

  function insertTable(rows, cols) {
    editor.focus()
    const table = document.createElement("table")
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr")
      for (let c = 0; c < cols; c++) {
        const td = document.createElement("td")
        td.innerHTML = "<br>"
        tr.appendChild(td)
      }
      table.appendChild(tr)
    }
    function mkDiv() { const d = document.createElement("div"); d.innerHTML = "<br>"; return d }
    const sel = window.getSelection()
    if (sel?.rangeCount) {
      let block = sel.getRangeAt(0).startContainer
      while (block && block.parentNode !== editor) block = block.parentNode
      if (block) {
        if (block.nodeName === "TABLE") {
          // Cursor inside a table: separator between existing and new table
          block.after(mkDiv(), table)
          if (!table.nextSibling) table.after(mkDiv())
        } else if (!block.textContent && (block.childNodes.length === 0 || (block.childNodes.length === 1 && block.firstChild?.nodeName === "BR"))) {
          // Cursor on an empty line: replace it in-place, no extra blank line
          block.replaceWith(table)
          if (!table.nextSibling) table.after(mkDiv())
        } else {
          block.after(table)
          if (!table.nextSibling) table.after(mkDiv())
        }
        focusCell(table.querySelector("td")); return
      }
    }
    editor.append(table, mkDiv())
    focusCell(table.querySelector("td"))
  }

  function toggleTablePicker(btn) {
    if (tablePicker) { tablePicker.remove(); tablePicker = null; return }
    const ROWS = 5, COLS = 8
    const picker = document.createElement("div")
    picker.className = "notepad-table-picker"
    const grid = document.createElement("div")
    grid.className = "notepad-table-picker-grid"
    grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`
    const label = document.createElement("div")
    label.className = "notepad-table-picker-label"
    label.textContent = "Insert table"
    const cells = []
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const cell = document.createElement("div")
        cell.className = "notepad-table-picker-cell"
        cell.dataset.r = r; cell.dataset.c = c
        grid.appendChild(cell); cells.push(cell)
      }
    }
    grid.addEventListener("mousemove", (e) => {
      const t = e.target.closest(".notepad-table-picker-cell")
      if (!t) return
      const hr = +t.dataset.r, hc = +t.dataset.c
      cells.forEach(c => c.classList.toggle("active", +c.dataset.r <= hr && +c.dataset.c <= hc))
      label.textContent = `${hc} x ${hr}`
    })
    grid.addEventListener("mouseleave", () => {
      cells.forEach(c => c.classList.remove("active"))
      label.textContent = "Insert table"
    })
    grid.addEventListener("click", (e) => {
      const t = e.target.closest(".notepad-table-picker-cell")
      if (!t) return
      picker.remove(); tablePicker = null
      insertTable(+t.dataset.r, +t.dataset.c)
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    })
    picker.appendChild(grid)
    picker.appendChild(label)
    const btnRect = btn.getBoundingClientRect()
    picker.style.cssText = `position:fixed;left:${btnRect.left}px;bottom:${window.innerHeight - btnRect.top + 4}px`
    document.body.appendChild(picker)
    tablePicker = picker
    setTimeout(() => {
      const dismiss = (ev) => {
        if (!tablePicker || tablePicker.contains(ev.target) || ev.target === btn) return
        tablePicker.remove(); tablePicker = null
        document.removeEventListener("mousedown", dismiss)
      }
      document.addEventListener("mousedown", dismiss)
    }, 0)
  }

  // Highlight toolbar buttons when cursor is inside matching formatting
  const btnStateMap = new Map(fmtBtns.filter(b => b.state).map(b => [b.cmd, b.state]))
  function updateToolbarState() {
    toolbarEl.querySelectorAll("[data-cmd]").forEach(btn => {
      const customState = btnStateMap.get(btn.dataset.cmd)
      let active = false
      if (customState) active = customState()
      else try { active = document.queryCommandState(btn.dataset.cmd) } catch { /* unsupported */ }
      btn.classList.toggle("active", active)
    })
  }
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === editor) updateToolbarState()
  })

  // Paste as plain text, formatting is applied manually via toolbar/shortcuts
  editor.addEventListener("paste", (e) => {
    e.preventDefault()
    const text = e.clipboardData?.getData("text/plain") || ""
    if (!text) return
    document.execCommand("insertText", false, text)
    editor.dispatchEvent(new Event("input", { bubbles: true }))
  })

  function updatePlaceholder() {
    editor.classList.toggle("is-empty", !editor.textContent.trim())
  }

  // Gate document-level shortcuts to when notepad has focus
  const notepadRoot = tabsBar.closest("#notepad-window, .notepad-inner") || tabsBar.parentElement.parentElement
  function notepadHasFocus() {
    const el = document.activeElement
    return !!el && el !== document.body && notepadRoot.contains(el)
  }

  function schedSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveCallback?.(tabs, activeTab), 100)
  }

  function flush() {
    if (tabs[activeTab]) tabs[activeTab].content = editorToMd(editor)
    saveCallback?.(tabs, activeTab)
  }

  function load() {
    const md = tabs[activeTab]?.content || ""
    editor.innerHTML = mdToEditorHtml(md)
    // Chrome shows resize-handle artifacts between adjacent <table> elements in contenteditable
    Array.from(editor.children).forEach(el => {
      if (el.nodeName === "TABLE" && el.nextElementSibling?.nodeName === "TABLE") {
        const sep = document.createElement("div"); sep.innerHTML = "<br>"; el.after(sep)
      }
    })
    editor.style.setProperty("--editor-tab-colour", tabs[activeTab]?.colour || "#ffffff")
    updatePlaceholder()
  }

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
        clearTimeout(deleteTimer)
        deleteTimer = null
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
      btn.className = "notepad-tab" + (i === activeTab ? " active" : "") + (i === newTabIdx ? " notepad-tab-new" : "")
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
        if (i === activeTab) editor.style.setProperty("--editor-tab-colour", picker.value)
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
          // btn detached by an external render, clean up silently
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
        closeBtn.textContent = isConfirming ? "✓" : "x"
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation()
          if (isConfirming) {
            pendingDelete = -1
            clearTimeout(deleteTimer)
            deleteTimer = null
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
            clearTimeout(deleteTimer)
            // Auto-revert confirming state after 3s
            deleteTimer = setTimeout(() => {
              pendingDelete = -1
              deleteTimer = null
              render()
            }, 3000)
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
          clearTimeout(deleteTimer)
          deleteTimer = null
          const conf = tabsBar.querySelector(".notepad-tab-close.confirming")
          if (conf) {
            conf.classList.remove("confirming")
            conf.textContent = "x"
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

    newTabIdx = -1 // clear animation flag after render
    if (saveCallback !== null) initSortable()
    requestAnimationFrame(updateShadows)
  }

  function addTab() {
    pendingDelete = -1
    clearTimeout(deleteTimer)
    deleteTimer = null
    flush()
    tabs.push({ content: "", colour: "#ffffff", title: defaultTitle(tabs.length + 1) })
    newTabIdx = tabs.length - 1
    activeTab = tabs.length - 1
    render()
    load()
    schedSave()
    editor.focus()
  }

  tabAddBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    addTab()
  })

  // --- Editor keyboard handling ---
  editor.addEventListener("keydown", (e) => {
    // Formatting shortcuts (work inside and outside table cells)
    if (e.ctrlKey) {
      if (e.key === "b" || e.key === "B") { e.preventDefault(); document.execCommand("bold",         false, null); updateToolbarState(); return }
      if (e.key === "i" || e.key === "I") { e.preventDefault(); document.execCommand("italic",       false, null); updateToolbarState(); return }
      if (e.key === "u" || e.key === "U") { e.preventDefault(); document.execCommand("underline",    false, null); updateToolbarState(); return }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); document.execCommand("removeFormat", false, null); updateToolbarState(); return }
    }

    const sel = window.getSelection()
    const cell = sel?.rangeCount ? getCellAncestor(sel.getRangeAt(0).startContainer) : null

    if (cell) {
      const row = cell.closest("tr")
      const table = row.closest("table")
      if (e.key === "Tab") {
        e.preventDefault()
        const rowCells = Array.from(row.querySelectorAll("td, th"))
        const ci = rowCells.indexOf(cell)
        if (ci < rowCells.length - 1) {
          focusCell(rowCells[ci + 1])
        } else {
          const allRows = Array.from(table.querySelectorAll("tr"))
          const ri = allRows.indexOf(row)
          if (ri < allRows.length - 1) {
            focusCell(allRows[ri + 1].querySelector("td, th"))
          } else if (allRows.length === 1) {
            // Draft mode (1 row): expand columns instead of adding a row
            const td = document.createElement("td"); td.innerHTML = "<br>"
            row.appendChild(td); focusCell(td)
            editor.dispatchEvent(new Event("input", { bubbles: true }))
          } else {
            const nr = addTableRow(table, row)
            focusCell(nr.querySelector("td"))
            editor.dispatchEvent(new Event("input", { bubbles: true }))
          }
        }
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        if (e.shiftKey) { document.execCommand("insertLineBreak"); return }
        // Enter on first empty cell → delete row and exit table
        if (cell === row.querySelector("td, th") && isRowEmpty(row)) {
          row.remove()
          if (!table.querySelector("tr")) {
            const div = document.createElement("div"); div.innerHTML = "<br>"
            table.replaceWith(div); focusElement(div)
          } else {
            let after = table.nextElementSibling
            if (!after || after.nodeName === "TABLE" || after.textContent) {
              // No sibling, another table, or content immediately follows → need a blank line
              const div = document.createElement("div"); div.innerHTML = "<br>"
              after ? after.before(div) : table.after(div)
              after = div
            }
            focusElement(after)
          }
        } else {
          const nr = addTableRow(table, row)
          focusCell(nr.querySelector("td"))
        }
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        return
      }
      if (e.key === "Backspace") {
        const rowCells = Array.from(row.querySelectorAll("td, th"))
        const ci = rowCells.indexOf(cell)
        const isFirstCell = ci === 0
        if (isFirstCell && isRowEmpty(row)) {
          // Empty first cell: delete row and go to end of previous row's last cell
          e.preventDefault()
          const allRows = Array.from(table.querySelectorAll("tr"))
          const ri = allRows.indexOf(row)
          row.remove()
          if (!table.querySelector("tr")) {
            const div = document.createElement("div"); div.innerHTML = "<br>"
            table.replaceWith(div); focusElement(div)
          } else {
            const prevRow = allRows[ri - 1]
            if (prevRow) {
              const prevCells = prevRow.querySelectorAll("td, th")
              focusCellEnd(prevCells[prevCells.length - 1])
            } else {
              focusCellEnd(table.querySelector("td, th"))
            }
          }
          editor.dispatchEvent(new Event("input", { bubbles: true }))
          return
        }
        if (!isFirstCell && isCellEmpty(cell)) {
          e.preventDefault()
          const isLastCell = ci === rowCells.length - 1
          if (isLastCell && table.querySelectorAll("tr").length === 1) {
            // Draft mode: remove the last column
            cell.remove()
            if (!row.querySelector("td, th")) {
              const div = document.createElement("div"); div.innerHTML = "<br>"
              table.replaceWith(div); focusElement(div)
            } else {
              focusCellEnd(rowCells[ci - 1])
            }
            editor.dispatchEvent(new Event("input", { bubbles: true }))
          } else {
            // Locked mode: reverse tab
            focusCellEnd(rowCells[ci - 1])
          }
          return
        }
      }
      return // prevent list continuation for non-Tab/Enter in cells
    }

    // Guard keyboard navigation at table boundaries
    if ((e.key === "ArrowLeft" || e.key === "Backspace") && sel?.isCollapsed && sel.rangeCount) {
      const range = sel.getRangeAt(0)
      let block = range.startContainer
      while (block && block.parentNode !== editor) block = block.parentNode
      if (block) {
        const atStart = (() => { const t = document.createRange(); t.setStart(block, 0); t.setEnd(range.startContainer, range.startOffset); return t.collapsed })()
        if (atStart) {
          // Walk backwards past empty separator divs to find a TABLE
          let prev = block.previousElementSibling
          while (prev && prev.nodeName !== "TABLE" && !prev.textContent.trim()) prev = prev.previousElementSibling
          if (prev?.nodeName === "TABLE") {
            e.preventDefault()
            if (e.key === "ArrowLeft") {
              const rows = prev.querySelectorAll("tr")
              if (rows.length) { const cells = rows[rows.length - 1].querySelectorAll("td, th"); if (cells.length) focusCellEnd(cells[cells.length - 1]) }
            }
            // Backspace: just block Chrome's DOM corruption, no navigation
            return
          }
        }
      }
    }

    // Shift+Enter outside table: let browser insert newline, skip list continuation
    if (e.key === "Enter" && e.shiftKey) return

    // Auto-continue list on Enter
    if (e.key === "Enter") {
      if (!sel?.rangeCount) return
      let block = sel.getRangeAt(0).startContainer
      while (block && block.parentNode !== editor) block = block.parentNode
      if (!block) return

      const text = block.textContent || ""
      const bulletMatch = /^([*-]) /.exec(text)
      const numMatch   = /^(\d+)\. /.exec(text)
      if (!bulletMatch && !numMatch) return

      let prefix
      if (numMatch) {
        prefix = `${parseInt(numMatch[1], 10) + 1}. `
        if (text === numMatch[1] + ". " || text.trim() === numMatch[1] + ".") {
          e.preventDefault()
          block.innerHTML = "<br>"
          const r = document.createRange()
          r.setStart(block, 0); r.collapse(true)
          sel.removeAllRanges(); sel.addRange(r)
          return
        }
      } else {
        prefix = bulletMatch[1] + " "
        if (text === bulletMatch[1] + " " || text.trim() === bulletMatch[1]) {
          e.preventDefault()
          block.innerHTML = "<br>"
          const r = document.createRange()
          r.setStart(block, 0); r.collapse(true)
          sel.removeAllRanges(); sel.addRange(r)
          return
        }
      }

      // Continue list: let browser create the new div, then prefix it
      setTimeout(() => {
        const s = window.getSelection()
        if (!s?.rangeCount) return
        let newBlock = s.getRangeAt(0).startContainer
        while (newBlock && newBlock.parentNode !== editor) newBlock = newBlock.parentNode
        if (!newBlock || newBlock === block) return
        const prefixNode = document.createTextNode(prefix)
        newBlock.insertBefore(prefixNode, newBlock.firstChild)
        if (newBlock.lastChild?.nodeName === "BR" && newBlock.childNodes.length > 1) {
          newBlock.lastChild.remove()
        }
        const r = document.createRange()
        r.setStart(prefixNode, prefix.length); r.collapse(true)
        s.removeAllRanges(); s.addRange(r)
      }, 0)
    }
  })

  // --- Document-level shortcuts ---
  document.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || !notepadHasFocus()) return
    const num = parseInt(e.key)
    if (num >= 1 && num <= 9) {
      const idx = num - 1
      if (idx < tabs.length && idx !== activeTab) {
        e.preventDefault()
        flush()
        activeTab = idx
        tabsBar.querySelectorAll(".notepad-tab").forEach((el, i) => {
          el.classList.toggle("active", i === idx)
          el.setAttribute("aria-selected", String(i === idx))
        })
        load()
        schedSave()
      }
    }
  }, { capture: true })

  editor.addEventListener("input", () => {
    if (tabs[activeTab]) tabs[activeTab].content = editorToMd(editor)
    updatePlaceholder()
    schedSave()
  })

  editor.addEventListener("mousedown", () => {
    if (pendingDelete === -1) return
    clearTimeout(deleteTimer)
    deleteTimer = null
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
      clearTimeout(deleteTimer)
      deleteTimer = null
      tabs = newTabs.map(t => ({ ...t }))
      activeTab = Math.min(newActiveTab || 0, tabs.length - 1)
      render()
      load()
    }
  }
}
