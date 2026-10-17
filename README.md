# 🌙 Lunaria

Lector de EPUB inspirado en Moon+ Reader y en la estética de Substack: lectura en **scroll infinito**, todo personalizable (temas, tipografía, tamaños, márgenes), **pomodoro**, **sonidos ambientales sintetizados** (lluvia, tormenta, ruido blanco…) y **gamificación** (XP, niveles, rachas, logros y avisos de progreso).

- **Android:** APK nativo (Capacitor).
- **PC:** un único archivo `Lunaria-x.y.z.html` que se abre con doble clic en el navegador, sin instalar nada y sin internet.

## Descargar

Cada vez que se sube código, GitHub Actions ejecuta los tests, compila y publica una versión en
**[Releases](https://github.com/barraco002/epub-lector-/releases/latest)**:

| Plataforma | Archivo | Cómo usarlo |
|---|---|---|
| Android 7+ | `Lunaria-0.1.N.apk` | Descárgalo en el móvil y ábrelo. La primera vez Android pedirá permitir instalar desde esa fuente. Las versiones nuevas se instalan encima **sin perder la biblioteca**. |
| PC (Windows/Mac/Linux) | `Lunaria-0.1.N.html` | Doble clic → se abre en Chrome/Edge/Firefox. Los libros quedan guardados en ese navegador. |

> En Android puedes abrir un `.epub` desde el gestor de archivos, Drive o Telegram con **"Abrir con → Lunaria"**, o compartirlo hacia la app.

## Funciones

**Lectura**
- Scroll continuo entre capítulos (solo se construyen los capítulos cercanos; los lejanos se descargan de memoria).
- Toques: arriba/izquierda retrocede una pantalla, abajo/derecha avanza, centro abre el menú. Teclas de volumen para pasar pantalla (Android).
- **Autoscroll** a tus palabras por minuto, continuo o por pantallas; se pausa al tocar.
- Posición guardada por carácter (sobrevive a cambios de fuente o tamaño). Índice, marcadores, búsqueda sin tildes ni mayúsculas.
- Subrayados en 5 colores con notas (exportables a Markdown), notas al pie en ventana emergente, visor de imágenes.
- Diccionario (Free Dictionary / Wiktionary) y traducción (MyMemory) **solo cuando los pides**; enlaces a Google Translate y la RAE.
- Pantalla completa inmersiva, pantalla encendida con temporizador, línea de estado (hora, batería, %, minutos que faltan del capítulo).

**Personalización**
- **45 temas** (Substack, Papel, Sepia, Pergamino, Nord, Dracula, Catppuccin, Rosé Pine, Tokyo Night, Gruvbox, AMOLED, ámbar nocturno…), todos con contraste de texto verificado (WCAG AA o superior). Editor para crear, duplicar, exportar e importar temas; texturas de papel, lino o grano.
- **27 familias tipográficas libres** incluidas y offline (Spectral —la de Substack—, Literata, Charis SIL, Newsreader, EB Garamond, Atkinson Hyperlegible, OpenDyslexic, iA Writer Quattro…) + tus propias fuentes `.ttf/.otf/.woff2`.
- Tamaño, grosor (fuentes variables), interlineado, espacio entre párrafos, sangría, espaciado de letras y palabras, márgenes, ancho de línea, justificado y separación silábica. Estilos rápidos (Substack, Kindle, Libro clásico, Accesible, Dislexia…) y estilos propios.
- Se puede respetar o anular la fuente, los colores y el espaciado del propio libro.
- **Filtro de luz azul** programable (calienta los colores del tema y las imágenes, sin capas encima) y atenuación por debajo del brillo mínimo.

**Concentración**
- Pomodoro con fases configurables, descanso largo cada N, autoinicio, aviso con campana/cuenco/madera y pantalla de descanso (regla 20-20-20).
- 13 sonidos generados en el dispositivo y mezclables: lluvia, lluvia en la ventana, tormenta con truenos, viento, olas, chimenea, bosque, grillos, arroyo, ventilador y ruido blanco/rosa/marrón. Ambientes prediseñados, temporizador de apagado y modo "solo durante el enfoque".

**Gamificación**
- XP por palabras leídas (con tope de velocidad: saltar capítulos no cuenta), pomodoros, capítulos y libros terminados.
- Niveles con títulos («Ratón de biblioteca», «Guardián de Alejandría»…), **racha diaria** con comodines, meta diaria en minutos.
- 42 logros (Búho nocturno, Maratón, Ladrillo, Políglota…), mapa de calor de 18 semanas, minutos por día, velocidad de lectura.
- Avisos durante la lectura: «Leíste 1.000 palabras», «Avanzaste 5 %», «Capítulo terminado» y barrita de sesión.

## Rendimiento y batería

Medido con Chromium y la CPU ralentizada 4× (equivalente a un móvil de gama media):

| Prueba | Resultado |
|---|---|
| Importar *Moby-Dick* (135 capítulos) | 1,3 s |
| Abrirlo | 0,9 s |
| Lector en reposo durante 10 s | 12 ms de CPU, 0 recálculos de maquetación |
| Scroll | 60 fps (p95: 16,8 ms por frame) |
| Sonido de fondo sonando | 90 ms de hilo principal cada 10 s |
| Memoria JS con el libro abierto | ~4 MB |

Decisiones que lo hacen posible: nada de bucles de animación salvo con el autoscroll activo; pomodoro y filtro programado con un único temporizador hasta el siguiente evento; los sonidos se generan una vez en un Web Worker y luego se reproducen en bucle (sin procesado en JavaScript) y el `AudioContext` se suspende en cuanto nada suena; todo se pausa al salir de la app; la pantalla se deja apagar tras unos minutos sin tocarla.

## Privacidad

Todo se guarda en el dispositivo (IndexedDB). No hay cuentas, analíticas ni anuncios. Internet solo se usa al pedir una definición o una traducción. Desde **Ajustes → Tus datos** puedes exportar una copia (progreso, subrayados, estadísticas, temas) e importarla en otro dispositivo: al volver a importar el mismo EPUB recupera su progreso.

## Desarrollo

Requiere Node 22.

```bash
npm install
npm run dev            # servidor de desarrollo
npm run typecheck      # TypeScript
npm test               # tests unitarios (Vitest)
npm run build && npm run e2e   # pruebas en navegador (Playwright, móvil y escritorio)
npm run build:single   # dist-single/index.html (versión PC de un solo archivo)
npm run android:apk    # APK (necesita Android SDK y Java 21)
```

Estructura: `src/lib/epub` (lectura y saneado de EPUB, aislamiento del CSS del libro), `src/lib/reader` (motor de scroll, autoscroll, sesión), `src/lib/audio` (síntesis de sonidos), `src/lib/game` (XP, niveles, logros), `src/components` (interfaz en Preact), `android/` (proyecto Capacitor con el plugin nativo `LunariaPlugin`).

### Firma del APK

El APK se firma con `android/keystore/lunaria.p12` para que cada versión actualice a la anterior. Como el repositorio es público, cualquiera podría firmar un APK con esa misma clave. Si prefieres una clave privada, crea estos secretos en *Settings → Secrets and variables → Actions*: `LUNARIA_KEYSTORE_BASE64`, `LUNARIA_KEYSTORE_PASSWORD`, `LUNARIA_KEY_ALIAS`, `LUNARIA_KEY_PASSWORD`. Ojo: cambiar de clave obliga a desinstalar la app una vez (exporta antes una copia desde Ajustes).

## Créditos

- Parser EPUB basado en las ideas de [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT).
- Fuentes vía [Fontsource](https://fontsource.org) con licencia SIL Open Font License.
- Iconos de [Lucide](https://lucide.dev) (ISC). Interfaz con [Preact](https://preactjs.com); app Android con [Capacitor](https://capacitorjs.com).
