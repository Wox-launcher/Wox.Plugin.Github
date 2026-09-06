import { existsSync, readFileSync } from "fs"
import { join } from "path"

const templateCache = new Map<string, string>()
let pluginDirectory = ""

export function setPluginDirectory(directory: string): void {
  pluginDirectory = directory
  templateCache.clear()
}

export function resolveTemplatePath(fileName: string): string {
  const candidates = [
    pluginDirectory ? join(pluginDirectory, "templates", fileName) : "",
    join(__dirname, "templates", fileName),
    join(__dirname, "..", "templates", fileName),
    join(process.cwd(), "templates", fileName)
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`HTML template not found: ${fileName}`)
}

export function loadHtmlTemplate(fileName: string): string {
  const cached = templateCache.get(fileName)
  if (cached) {
    return cached
  }

  const html = readFileSync(resolveTemplatePath(fileName), "utf8")
  templateCache.set(fileName, html)
  return html
}

export function applyHtmlTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match))
}
