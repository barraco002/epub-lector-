// Diccionario y traducción bajo demanda: solo se consulta la red cuando el usuario lo pide.

export interface Sense {
  pos: string
  definitions: { text: string; example?: string }[]
}

export interface Definition {
  word: string
  phonetic?: string
  audio?: string
  senses: Sense[]
  source: string
  url: string
}

const cache = new Map<string, Promise<Definition | null>>()

const strip = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function fetchJson(url: string, timeoutMs = 9000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

async function freeDictionary(word: string): Promise<Definition | null> {
  const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
  if (!Array.isArray(data) || !data.length) return null
  const first = data[0]
  const phon = (first.phonetics ?? []).find((p: { text?: string; audio?: string }) => p.audio) ?? first.phonetics?.[0]
  const senses: Sense[] = []
  for (const entry of data) {
    for (const m of entry.meanings ?? []) {
      senses.push({
        pos: m.partOfSpeech ?? '',
        definitions: (m.definitions ?? []).slice(0, 4).map((d: { definition: string; example?: string }) => ({ text: d.definition, example: d.example })),
      })
    }
  }
  return {
    word: first.word ?? word,
    phonetic: first.phonetic ?? phon?.text,
    audio: phon?.audio || undefined,
    senses: senses.slice(0, 6),
    source: 'Free Dictionary',
    url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
  }
}

async function wiktionary(word: string, lang: string): Promise<Definition | null> {
  const data = await fetchJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`)
  if (!data || typeof data !== 'object') return null
  const entries: { partOfSpeech: string; definitions: { definition: string; examples?: string[] }[] }[] = data[lang] ?? data.en ?? Object.values(data)[0] ?? []
  const senses = entries.slice(0, 6).map((e) => ({
    pos: e.partOfSpeech,
    definitions: e.definitions
      .map((d) => ({ text: strip(d.definition), example: d.examples?.[0] ? strip(d.examples[0]) : undefined }))
      .filter((d) => d.text)
      .slice(0, 4),
  }))
  if (!senses.some((s) => s.definitions.length)) return null
  return { word, senses, source: 'Wiktionary', url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}` }
}

export function cleanWord(text: string) {
  return text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

export function define(text: string, lang = 'en'): Promise<Definition | null> {
  const word = cleanWord(text)
  if (!word) return Promise.resolve(null)
  const l = (lang || 'en').slice(0, 2).toLowerCase()
  const key = `${l}:${word.toLowerCase()}`
  let p = cache.get(key)
  if (!p) {
    p = (async () => {
      try {
        if (l === 'en') return (await freeDictionary(word)) ?? (await freeDictionary(word.toLowerCase())) ?? (await wiktionary(word, 'en'))
        return (await wiktionary(word, l)) ?? (await wiktionary(word.toLowerCase(), l))
      } catch {
        return null
      }
    })()
    cache.set(key, p)
    p.then((r) => r === null && cache.delete(key))
  }
  return p
}

export async function translate(text: string, from: string, to: string): Promise<string | null> {
  const src = (from || 'en').slice(0, 2).toLowerCase()
  const dst = (to || 'es').slice(0, 2).toLowerCase()
  if (src === dst) return text
  const q = text.slice(0, 480)
  try {
    const data = await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${src}|${dst}`)
    const out = data?.responseData?.translatedText
    return typeof out === 'string' && out ? out : null
  } catch {
    return null
  }
}

export const googleTranslateUrl = (text: string, to: string) =>
  `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(to)}&text=${encodeURIComponent(text.slice(0, 2000))}&op=translate`

export const raeUrl = (word: string) => `https://dle.rae.es/${encodeURIComponent(cleanWord(word).toLowerCase())}`
