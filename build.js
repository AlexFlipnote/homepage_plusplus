import archiver from "archiver"
import esbuild from "esbuild"
import fs from "fs"
import path from "path"
import * as sass from "sass"
import { createWriteStream } from "fs"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const jsBuildConfigs = [
  { entryPoints: ["src/js/index.js"], outfile: "out/js/index.js" },
  { entryPoints: ["src/js/options.js"], outfile: "out/js/options.js" }
]

const esbuildOptions = (cfg, overrides = {}) => ({
  bundle: true,
  format: "iife",
  minify: true,
  sourcemap: false,
  target: ["es2017"],
  alias: {
    "@": path.join(__dirname, "src"),
    "@i18n": path.join(__dirname, "i18n")
  },
  ...cfg,
  ...overrides
})

function log(type, message) {
  const now = new Date()
  const pad = (num) => String(num).padStart(2, "0")
  const formattedDate =
    now.getFullYear() + "-" +
    pad(now.getMonth() + 1) + "-" +
    pad(now.getDate()) + " " +
    pad(now.getHours()) + ":" +
    pad(now.getMinutes()) + ":" +
    pad(now.getSeconds())

  console.log(`[ ${type.padStart(5)} ] ${formattedDate} ${message}`)
}

function ensureFolders(...folders) {
  folders.forEach(folder => {
    if (!fs.existsSync(path.join(__dirname, folder)))
      fs.mkdirSync(path.join(__dirname, folder), { recursive: true })
  })
}

async function clean() {
  log("CLEAN", "Removing build folders...")
  for (const folder of ["out", "dist"])
    await fs.promises.rm(path.join(__dirname, folder), { recursive: true, force: true })
  log("CLEAN", "Done")
}

async function copyAssets() {
  log("ASSET", "Copying assets...")
  const files = fs.readdirSync(path.join(__dirname, "src"), { withFileTypes: true })
  files.forEach(file => {
    if (file.isFile() && (file.name.endsWith(".html") || file.name.endsWith(".json")))
      fs.copyFileSync(path.join(__dirname, "src", file.name), path.join(__dirname, "out", file.name))
  })
  fs.cpSync(path.join(__dirname, "src", "images"), path.join(__dirname, "out", "images"), { recursive: true })
  log("ASSET", "Done copying assets")
}

async function buildJS(overrides = {}) {
  log("JS", "Building JS...")
  await Promise.all(jsBuildConfigs.map(cfg => esbuild.build(esbuildOptions(cfg, overrides))))
  log("JS", "Done building the JS")
}

async function buildCSS() {
  log("CSS", "Converting SCSS to CSS")
  const result = sass.compile(path.join(__dirname, "src/scss/index.scss"), { style: "compressed" })
  const outputFile = path.join(__dirname, "out/css/index.css")
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, result.css)
  log("CSS", "Done building the CSS")
}

async function build() {
  await copyAssets()
  await buildJS()
  await buildCSS()
}

async function zip() {
  await build()

  log("ZIP", "Creating archives...")
  const timestamp = Math.floor(Date.now() / 1000)

  const zipPublic = `plugin_${timestamp}.zip`
  const archiveOut = archiver("zip", { zlib: { level: 9 } })
  archiveOut.pipe(createWriteStream(path.join(__dirname, "dist", zipPublic)))
  archiveOut.directory(path.join(__dirname, "out/"), false)
  await archiveOut.finalize()

  // Firefox requires source files when submitting minified code
  const zipSource = `source_${timestamp}.zip`
  const archiveSource = archiver("zip", { zlib: { level: 9 } })
  archiveSource.pipe(createWriteStream(path.join(__dirname, "dist", zipSource)))
  archiveSource.directory(path.join(__dirname, "src/"), false)
  for (const file of ["build.js", "package.json"])
    archiveSource.file(path.join(__dirname, file), { name: file })
  await archiveSource.finalize()

  log("ZIP", `${zipPublic} + ${zipSource}`)
}

const jsWatchPlugin = {
  name: "watch-log",
  setup(build) {
    build.onStart(() => log("JS", "Building JS..."))
    build.onEnd(result => log("JS", result.errors.length ? "Error" : "Done building"))
  }
}

async function watch() {
  log("WATCH", "Starting to watch for changes...")

  await copyAssets()
  await buildCSS()

  const contexts = await Promise.all(
    jsBuildConfigs.map(cfg => esbuild.context(esbuildOptions(cfg, {
      minify: false,
      sourcemap: true,
      plugins: [jsWatchPlugin]
    })))
  )
  await Promise.all(contexts.map(ctx => ctx.watch()))

  fs.watch(path.join(__dirname, "src/scss"), { recursive: true }, () => {
    buildCSS().catch(err => log("CSS", err.message))
  })

  fs.watch(path.join(__dirname, "src"), { recursive: false }, (_, filename) => {
    if (filename && (filename.endsWith(".html") || filename.endsWith(".json")))
      copyAssets().catch(err => log("ASSET", err.message))
  })

  fs.watch(path.join(__dirname, "src/images"), { recursive: true }, () => {
    copyAssets().catch(err => log("ASSET", err.message))
  })
}

const command = process.argv[2]

if (command === "clean") {
  await clean()
  process.exit(0)
}

ensureFolders("out", "dist")

switch (command) {
case "zip":   await zip();   break
case "watch": await watch(); break
default:      await build(); break
}
