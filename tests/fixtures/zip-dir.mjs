// Empaqueta una carpeta EPUB descomprimida: node tests/fixtures/zip-dir.mjs <carpeta> <salida.epub>
import { zipSync } from 'fflate'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
const [dir, outFile] = process.argv.slice(2)
const files = { mimetype: [new TextEncoder().encode('application/epub+zip'), { level: 0 }] }
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else { const r = relative(dir, p); if (r !== 'mimetype') files[r] = readFileSync(p) } } }
walk(dir)
writeFileSync(outFile, zipSync(files))
