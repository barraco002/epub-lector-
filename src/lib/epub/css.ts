// Aislamiento del CSS de cada libro: todas las reglas quedan limitadas al contenedor del lector,
// `body`/`html` se reasignan a nuestros envoltorios y los tamaños absolutos (px, pt, rem,
// palabras clave) se vuelven relativos al tamaño de letra elegido por el usuario.

export const BOOK_ROOT = ':where(#bk)'
export const BOOK_BODY = '.bk-body'

/** Divide una lista de selectores por las comas de primer nivel (respeta paréntesis, corchetes y comillas). */
export function splitSelectorList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i))
      start = i + 1
    }
  }
  out.push(list.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

export function scopeSelector(selector: string, root = BOOK_ROOT, body = BOOK_BODY): string {
  let s = selector.trim()
  // html / :root al principio → raíz del libro
  s = s.replace(/^(?::root|html)(?![\w-])/i, root)
  // `body` como selector de tipo (no como parte de una clase, id o atributo)
  s = s.replace(/(^|[\s>+~(])body(?![\w-])/gi, (_, pre) => pre + body)
  if (s.startsWith(root)) return s
  return `${root} ${s}`
}

export const scopeSelectorList = (list: string, root = BOOK_ROOT, body = BOOK_BODY) =>
  splitSelectorList(list)
    .map((s) => scopeSelector(s, root, body))
    .join(', ')

const KEYWORD_SIZES: Record<string, number> = {
  'xx-small': 0.5625,
  'x-small': 0.625,
  small: 0.8125,
  medium: 1,
  large: 1.125,
  'x-large': 1.5,
  'xx-large': 2,
  'xxx-large': 3,
}

const rel = (factor: number) => `calc(var(--fs) * ${+factor.toFixed(4)})`

/** Convierte unidades absolutas de tamaño de letra en relativas al tamaño del lector. */
export function relativizeDeclarations(css: string): string {
  return (
    css
      .replace(/font-size\s*:\s*([\d.]+)(px|pt)\b/gi, (_, n, unit) => `font-size: ${rel(unit.toLowerCase() === 'pt' ? n / 12 : n / 16)}`)
      .replace(/font-size\s*:\s*(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)\b/gi, (_, k) => `font-size: ${rel(KEYWORD_SIZES[k.toLowerCase()])}`)
      // rem se refiere a la raíz de la app, no del libro
      .replace(/(-?[\d.]+)rem\b/gi, (_, n) => rel(parseFloat(n)))
  )
}

const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi

export function rewriteUrls(css: string, resolve: (url: string) => string | null): string {
  return css.replace(URL_RE, (match, _q, url) => {
    if (/^(data|blob):/i.test(url)) return match
    const out = resolve(url)
    return out ? `url("${out}")` : 'none'
  })
}

/** Quita @import (los resolvemos aparte) y devuelve sus URLs. */
export function extractImports(css: string): { css: string; imports: string[] } {
  const imports: string[] = []
  const out = css.replace(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi, (_, url) => {
    imports.push(url)
    return ''
  })
  return { css: out, imports }
}

/**
 * Reescribe una hoja de estilo completa usando el parser CSS del propio navegador (CSSOM),
 * que tolera el CSS imperfecto de muchos EPUB.
 */
export function scopeStylesheet(
  cssText: string,
  resolveUrl: (url: string) => string | null,
  root = BOOK_ROOT,
  body = BOOK_BODY,
): string {
  const sheet = new CSSStyleSheet()
  try {
    sheet.replaceSync(cssText)
  } catch {
    return ''
  }
  const out: string[] = []
  const walk = (rules: CSSRuleList, sink: string[]) => {
    for (const rule of [...rules]) {
      if (rule instanceof CSSStyleRule) {
        const decl = rule.style.cssText
        if (!decl) continue
        sink.push(`${scopeSelectorList(rule.selectorText, root, body)} { ${rewriteUrls(relativizeDeclarations(decl), resolveUrl)} }`)
      } else if (rule instanceof CSSMediaRule) {
        const inner: string[] = []
        walk(rule.cssRules, inner)
        if (inner.length) sink.push(`@media ${rule.conditionText ?? rule.media.mediaText} { ${inner.join('\n')} }`)
      } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
        const inner: string[] = []
        walk(rule.cssRules, inner)
        if (inner.length) sink.push(`@supports ${rule.conditionText} { ${inner.join('\n')} }`)
      } else if (rule instanceof CSSFontFaceRule) {
        sink.push(`@font-face { ${rewriteUrls(rule.style.cssText, resolveUrl)} }`)
      }
      // @page, @keyframes, @namespace, etc. no aportan nada en un lector continuo
    }
  }
  walk(sheet.cssRules, out)
  return out.join('\n')
}
