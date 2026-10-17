// Utilidades de rutas dentro del ZIP de un EPUB. Las rutas internas son siempre absolutas
// respecto a la raíz del ZIP, sin barra inicial y ya decodificadas ("OEBPS/Text/cap 1.xhtml").

export const dirname = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

export function normalizePath(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export const isExternalUrl = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(blob|data):/i.test(href)

/** Resuelve `href` (relativo al archivo `from`) → { path, fragment }. Devuelve null para URLs externas. */
export function resolveHref(href: string, from: string): { path: string; fragment: string } | null {
  const raw = href.trim()
  if (!raw || isExternalUrl(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return null
  const hashAt = raw.indexOf('#')
  const pathPart = (hashAt >= 0 ? raw.slice(0, hashAt) : raw).split('?')[0]
  const fragment = hashAt >= 0 ? safeDecode(raw.slice(hashAt + 1)) : ''
  if (!pathPart) return { path: from, fragment }
  const base = pathPart.startsWith('/') ? '' : dirname(from)
  return { path: normalizePath(base + safeDecode(pathPart)), fragment }
}

export const MIME_BY_EXT: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
}

export const mimeFromPath = (path: string) => MIME_BY_EXT[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
