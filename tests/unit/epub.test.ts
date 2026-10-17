import { describe, expect, it } from 'vitest'
import { normalizePath, resolveHref, isExternalUrl } from '../../src/lib/epub/paths'
import { relativizeDeclarations, rewriteUrls, scopeSelector, scopeSelectorList, splitSelectorList, extractImports } from '../../src/lib/epub/css'

describe('rutas EPUB', () => {
  it('normaliza . y ..', () => {
    expect(normalizePath('OEBPS/Text/../Images/./a.png')).toBe('OEBPS/Images/a.png')
    expect(normalizePath('/a//b/')).toBe('a/b')
  })
  it('resuelve hrefs relativos, fragmentos y codificación', () => {
    expect(resolveHref('../Images/p%201.png', 'OEBPS/Text/c1.xhtml')).toEqual({ path: 'OEBPS/Images/p 1.png', fragment: '' })
    expect(resolveHref('c2.xhtml#n%C3%BA1', 'OEBPS/Text/c1.xhtml')).toEqual({ path: 'OEBPS/Text/c2.xhtml', fragment: 'nú1' })
    expect(resolveHref('#nota', 'OEBPS/c1.xhtml')).toEqual({ path: 'OEBPS/c1.xhtml', fragment: 'nota' })
  })
  it('detecta URLs externas', () => {
    expect(isExternalUrl('https://x.org')).toBe(true)
    expect(isExternalUrl('mailto:a@b.c')).toBe(true)
    expect(isExternalUrl('../a.xhtml')).toBe(false)
    expect(resolveHref('https://x.org/a', 'a.xhtml')).toBeNull()
  })
})

describe('aislamiento del CSS del libro', () => {
  it('divide listas de selectores respetando paréntesis', () => {
    expect(splitSelectorList('p, :is(h1, h2) > a, [title="a,b"]')).toEqual(['p', ':is(h1, h2) > a', '[title="a,b"]'])
  })
  it('prefija selectores y reasigna html/body', () => {
    expect(scopeSelector('p.x')).toBe(':where(#bk) p.x')
    expect(scopeSelector('body.libro p')).toBe(':where(#bk) .bk-body.libro p')
    expect(scopeSelector('html body')).toBe(':where(#bk) .bk-body')
    expect(scopeSelector(':root')).toBe(':where(#bk)')
    expect(scopeSelector('.tbody p')).toBe(':where(#bk) .tbody p')
    expect(scopeSelectorList('h1, body > div')).toBe(':where(#bk) h1, :where(#bk) .bk-body > div')
  })
  it('vuelve relativos los tamaños absolutos de letra', () => {
    expect(relativizeDeclarations('font-size: 24px;')).toBe('font-size: calc(var(--fs) * 1.5);')
    expect(relativizeDeclarations('font-size: 12pt;')).toBe('font-size: calc(var(--fs) * 1);')
    expect(relativizeDeclarations('font-size: small;')).toBe('font-size: calc(var(--fs) * 0.8125);')
    expect(relativizeDeclarations('margin: 2rem;')).toBe('margin: calc(var(--fs) * 2);')
  })
  it('reescribe url() y extrae @import', () => {
    expect(rewriteUrls('background: url("../i.png")', () => 'blob:x')).toBe('background: url("blob:x")')
    expect(rewriteUrls("src: url(data:font/woff2;base64,AA)", () => 'blob:x')).toBe('src: url(data:font/woff2;base64,AA)')
    const { css, imports } = extractImports('@import url("a.css");\n@import "b.css";\np{}')
    expect(imports).toEqual(['a.css', 'b.css'])
    expect(css.trim()).toBe('p{}')
  })
})
