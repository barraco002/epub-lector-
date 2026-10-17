// Genera EPUBs de prueba en tests/.fixtures/:
//  - novela-es.epub: EPUB 2 (NCX) en español, 40 capítulos (~110.000 palabras), notas al pie,
//    imagen, CSS con tamaños en px y contenido hostil (scripts, onclick, javascript:) que debe sanearse.
//  - corto-en.epub: EPUB 3 (nav) en inglés, 3 capítulos, para pruebas rápidas.
import { zipSync, strToU8 } from 'fflate'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = join(new URL('..', import.meta.url).pathname, '.fixtures')
mkdirSync(out, { recursive: true })

// PNG 2x2 válido (rojo, verde, azul, blanco)
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC'),
  (c) => c.charCodeAt(0),
)

const FRASES = [
  'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, vivía un hidalgo de los de lanza en astillero.',
  'La noche caía despacio sobre los tejados y el viento traía olor a lluvia y a tierra mojada.',
  'Nadie en el pueblo recordaba quién había plantado aquel árbol junto al pozo, pero todos lo cuidaban.',
  'Leía cada tarde junto a la ventana, con una taza de café que siempre olvidaba hasta que se enfriaba.',
  'El reloj de la plaza marcaba las horas con una puntualidad que ningún vecino se atrevía a discutir.',
  'Había en sus ojos una mezcla de curiosidad y cansancio, como quien ha viajado demasiado lejos.',
  'Las páginas del cuaderno estaban llenas de nombres, fechas y pequeños dibujos de pájaros.',
  'Cuando por fin llegó la primavera, el río creció tanto que cubrió el viejo puente de piedra.',
]

function parrafos(cap, n) {
  let html = ''
  for (let p = 0; p < n; p++) {
    let t = ''
    for (let k = 0; k < 6; k++) t += FRASES[(cap * 7 + p * 3 + k) % FRASES.length] + ' '
    html += `<p>${t.trim()}</p>\n`
  }
  return html
}

function novela() {
  const caps = 40
  const files = {}
  files['mimetype'] = [strToU8('application/epub+zip'), { level: 0 }]
  files['META-INF/container.xml'] = strToU8(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  )
  files['OEBPS/Styles/libro.css'] = strToU8(
    `body.libro { margin: 5%; font-family: "Comic Sans MS", cursive; color: #ff0000; }
p { font-size: 14px; text-indent: 2em; margin: 0; line-height: 18px; }
h1 { font-size: 24pt; text-align: center; }
.nota { font-size: small; }
@import url("extra.css");`,
  )
  files['OEBPS/Styles/extra.css'] = strToU8(`.destacado { font-weight: bold; }`)
  files['OEBPS/Images/portada.png'] = PNG
  let manifest = `<item id="css" href="Styles/libro.css" media-type="text/css"/><item id="css2" href="Styles/extra.css" media-type="text/css"/><item id="portada" href="Images/portada.png" media-type="image/png"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`
  let spine = ''
  let nav = ''
  for (let i = 1; i <= caps; i++) {
    const id = `cap${String(i).padStart(2, '0')}`
    let body = `<h1 id="t${i}">Capítulo ${i}</h1>\n`
    if (i === 1) {
      body += `<p class="destacado">Primera línea del libro. Marca única: AMANECER-UNO.</p>
<p><img src="../Images/portada.png" alt="Ilustración"/></p>
<p>Texto con nota<a href="notas.xhtml#n1" epub:type="noteref"><sup>1</sup></a> y un enlace al <a href="cap03.xhtml#t3">capítulo tres</a>.</p>
<script>window.__pwned = 1</script>
<p onclick="window.__pwned = 2">Párrafo con manejador onclick.</p>
<p><a href="javascript:window.__pwned=3">Enlace malicioso</a></p>
<iframe src="https://example.com"></iframe>\n`
    }
    if (i === 20) body += `<p>En mitad del libro aparece la palabra clave MURCIÉLAGO escondida.</p>\n`
    body += parrafos(i, 22)
    files[`OEBPS/Text/${id}.xhtml`] = strToU8(
      `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es">
<head><title>Capítulo ${i}</title><link rel="stylesheet" type="text/css" href="../Styles/libro.css"/><style>.cap${i} { letter-spacing: 0; }</style></head>
<body class="libro">
${body}</body></html>`,
    )
    manifest += `<item id="${id}" href="Text/${id}.xhtml" media-type="application/xhtml+xml"/>`
    spine += `<itemref idref="${id}"/>`
    nav += `<navPoint id="np${i}" playOrder="${i}"><navLabel><text>Capítulo ${i}</text></navLabel><content src="Text/${id}.xhtml"/></navPoint>`
  }
  files['OEBPS/Text/notas.xhtml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Notas</title></head><body><h1>Notas</h1><aside epub:type="footnote" id="n1"><p class="nota">1. Esta es la nota al pie número uno.</p></aside></body></html>`,
  )
  manifest += `<item id="notas" href="Text/notas.xhtml" media-type="application/xhtml+xml"/>`
  spine += `<itemref idref="notas" linear="no"/>`
  files['OEBPS/toc.ncx'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head></head><docTitle><text>La novela de prueba</text></docTitle><navMap>${nav}</navMap></ncx>`,
  )
  files['OEBPS/content.opf'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="2.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>La novela de prueba</dc:title><dc:creator opf:role="aut">Ana Autora</dc:creator><dc:language>es</dc:language><dc:identifier id="uid">urn:uuid:novela-prueba</dc:identifier>
<dc:description>&lt;p&gt;Una novela &lt;b&gt;generada&lt;/b&gt; para pruebas.&lt;/p&gt;</dc:description><meta name="cover" content="portada"/>
</metadata><manifest>${manifest}</manifest><spine toc="ncx">${spine}</spine></package>`,
  )
  return zipSync(files)
}

function corto() {
  const files = {}
  files['mimetype'] = [strToU8('application/epub+zip'), { level: 0 }]
  files['META-INF/container.xml'] = strToU8(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  )
  const chapters = ['The Beginning', 'The Middle', 'The End']
  let manifest = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
  let spine = ''
  let navList = ''
  chapters.forEach((title, i) => {
    let ps = ''
    for (let p = 0; p < 30; p++) ps += `<p>Reading is to the mind what exercise is to the body, said someone wise in paragraph ${p + 1} of chapter ${i + 1}. The rain kept falling softly.</p>`
    files[`c${i}.xhtml`] = strToU8(
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>${title}</title></head><body><section id="s${i}"><h2>${title}</h2>${ps}</section></body></html>`,
    )
    manifest += `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`
    spine += `<itemref idref="c${i}"/>`
    navList += `<li><a href="c${i}.xhtml#s${i}">${title}</a></li>`
  })
  files['nav.xhtml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol>${navList}</ol></nav></body></html>`,
  )
  files['content.opf'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A Short Book</dc:title><dc:creator>Bob Writer</dc:creator><dc:language>en</dc:language><dc:identifier id="id">short-book</dc:identifier></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`,
  )
  return zipSync(files)
}

writeFileSync(join(out, 'novela-es.epub'), novela())
writeFileSync(join(out, 'corto-en.epub'), corto())
console.log('fixtures →', out)
