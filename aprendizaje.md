# Aprendizaje — Lunaria (iteración de pulido UX)

Decisiones, patrones y trade-offs de esta iteración, pensados para reutilizarlos en apps de lectura (o cualquier app WebView + Capacitor) parecidas.

## 1. Indicador de avance: "perceptible si lo buscas, invisible si lees"

- **Problema:** una línea de 2 px con el color de acento (naranja) arriba del todo. Los ojos empiezan cada pantalla por arriba, así que competía con el texto en cada línea.
- **Decisión:** hilo de 2 px **abajo**, con el **color del texto al 20 % de opacidad** (`color-mix(in srgb, var(--text) 20%, transparent)`), sin pista de fondo y con una transición lenta (0,6 s). Se oculta cuando el menú está abierto, porque el menú ya tiene su propio deslizador.
- **Patrón reutilizable:** el progreso ambiental debe usar el tono del texto, no el de marca. El color de marca (acento) se reserva para lo que el usuario está tocando.
- Hay un estilo opcional "con color" para quien lo prefiera (`progressStyle: 'acento'`).

## 2. App fijada ("Fijar aplicación" de Android) sin salida

- **Causa raíz (dos fallos que se suman):**
  1. El modo inmersivo ocultaba también la **barra de navegación**, y el gesto del sistema para desfijar (Atrás + Recientes, o deslizar y mantener) la necesita.
  2. En la raíz, Atrás llamaba a `App.exitApp()`, que **Android ignora mientras hay lock task**: el botón no hacía nada.
- **Solución:**
  - El plugin nativo consulta `ActivityManager.getLockTaskModeState()`. Si la app está fijada, el modo inmersivo solo oculta la barra de estado y nunca la de navegación.
  - En la raíz, el Atrás llama a `stopLockTask()` (la propia app puede desfijarse) y avisa con «App desfijada · Pulsa Atrás otra vez para salir».
- **Aprendizaje:** al ocultar las barras del sistema hay que contemplar siempre los modos en los que el sistema depende de ellas: fijado, quiosco y accesibilidad. Y hay que comprobar que la acción final de Atrás funciona en todos los estados de la tarea.

## 3. Modo auto sin nada encima del texto

- **Causa:** el autoscroll se arranca desde un panel. Para llegar al panel hay que abrir el menú, y al arrancar se cerraba el panel pero **no** las barras superior e inferior. Además, la píldora de velocidad quedaba fija sobre el texto.
- **Solución:**
  - Un efecto en el lector: cuando `auto.running` pasa a `true`, se cierran el menú y los paneles, venga de donde venga el arranque (panel, tecla A o futuro acceso directo).
  - La píldora se **desvanece a los 2,5 s** y reaparece al pausar o al cambiar la velocidad.
  - Tocar el texto **pausa** en lugar de salir, y otro toque reanuda. Arrastrar con el auto en pausa recoloca el texto sin reanudar, porque la reanudación ocurre en `pointerup` y no en `pointerdown`.
  - Atrás o Escape salen del modo auto antes que del libro: el modo se registra en la pila de cierres.
  - En Android, las teclas de volumen regulan la velocidad mientras el modo auto está activo.
- **Patrón:** separar "modo activo" de "en movimiento" (`running` + `paused`) evita muchos casos raros y permite controles que no estorban.

## 4. Personalización independiente y persistente

- **Colores propios** (texto, fondo, acento) que se aplican **encima de cualquier tema** (`applyColorOverrides`). Si cambias fondo o texto, se derivan automáticamente el secundario, los bordes y la superficie, y hay un test que garantiza un contraste de al menos 3,5:1 en el texto secundario. Así no hace falta crear un tema para cambiar un color, y el ajuste sobrevive al cambiar de tema.
- **Aire vertical** (`paddingY`) independiente de los márgenes laterales.
- **Fondos:** se añadieron puntos, viñeta e imagen propia (guardada en IndexedDB, con control de intensidad). El rayado de cuaderno se **descartó**: sus líneas no pueden alinearse con los renglones del texto, porque dependen del tamaño, el interlineado y el desplazamiento, y desalineado se ve peor que nada.
- **9 temas más** (Luna, Carbón, Pizarra, Lámpara de banquero, Vino, Papiro, Té verde, Rosa empolvado, Cuaderno). Todos pasan el test automático de contraste WCAG.
- **Persistencia:** los ajustes viven en `localStorage` (lectura síncrona al arrancar, sin destello) con escritura agrupada. Las imágenes y fuentes propias van a IndexedDB.

## 5. Modo concentración

- **Marco:** el texto se presenta como una página enmarcada (fondo del tema, borde fino y sombra muy suave) sobre un exterior ligeramente distinto. En el móvil deja 10 px de canal a cada lado para que el marco se perciba.
- **Franja:** una capa fija, sin eventos de puntero, que atenúa la parte de arriba y de abajo con degradados del color de fondo. Se lee en una franja central despejada.
- **Coste:** ambos son estáticos (sin animación). La franja es una capa compuesta por la GPU y no provoca repintados del texto al desplazarse.

## 6. Transición entre capítulos

- **Cabecera discreta** al inicio de cada capítulo: un ornamento con filetes, «N de M» en versalitas y el título en cursiva. Va **fuera de `.bk-body`**, así que no entra en el índice de texto ni altera posiciones, subrayados o búsquedas.
- **No se repite el título** si el libro ya abre el capítulo con ese mismo encabezado.
- **Numeración real:** cuenta solo las entradas del índice (TOC), no los archivos del *spine*, que incluyen portadas y páginas partidas.
- **Título que ya numera:** si el índice dice «Capítulo 2», no se añade «N de M»: el contador (posición en el índice) puede contradecir al libro, por ejemplo cuando el índice no tiene «Capítulo 1». `numbersItself` decide con el título.
- **Flujo sin pausas:** el separador es un ornamento fino con poco aire, para que el texto siga fluyendo al pasar de un capítulo a otro. El aviso «Capítulo N» al cruzar es un componente propio: su cambio no vuelve a renderizar todo el lector.
- **Píldora suave** al cruzar a otro capítulo con el scroll: aparece y se desvanece en 2,6 s, sin bloquear nada. Es útil con traducción, porque marca dónde empieza un texto nuevo.
- **Trade-off:** la cabecera hace el capítulo un poco más alto, así que los saltos por el índice dejan el título del libro unos 120 px más abajo. Se ajustó el test correspondiente.

## 7. Traducción (DeepL): decisión documentada

- **DeepL no se integró**, por tres motivos:
  1. Su API **no admite CORS**, así que no se puede llamar desde la versión de PC (un HTML abierto desde disco).
  2. Requiere una **clave por usuario** (cuenta y tarjeta incluso en el plan gratuito), que tendría que guardarse en el dispositivo.
  3. En Android solo funcionaría a través de HTTP nativo (CapacitorHttp), y eso abre una ruta de código distinta según la plataforma, difícil de probar aquí.
- **Alternativa estable aplicada en Android:** el botón **«Traducir con una app»** envía la selección con `Intent.ACTION_PROCESS_TEXT` a las apps instaladas (Google Translate, DeepL, diccionarios). No añade peso, funciona sin conexión si la app tiene idiomas descargados y no bloquea la lectura.
- **Estabilidad de MyMemory:** se añadió un reintento corto, un tiempo máximo de 6 s y la detección del aviso de cuota agotada (que MyMemory devuelve como si fuera la traducción). Siempre queda el enlace a Google Translate.
- Si en el futuro se quiere DeepL, la ruta viable es en Android con CapacitorHttp y una clave introducida por el usuario, desactivada por defecto.

## 8. Diseño menos genérico

- Las barras del lector usan el **color del papel** (`--bg`) en lugar de una superficie blanca con sombra.
- Los títulos del lector van en la **fuente del libro** (serif), en vez de la tipografía de sistema.
- El capítulo del deslizador va en cursiva y se usan ornamentos tipográficos (❦, filetes, versalitas). Es vocabulario de libro, no de *dashboard*.
- **Regla práctica:** en una app de lectura, la interfaz que aparece *sobre* el texto debe parecer parte de la página (mismo fondo, misma familia tipográfica). Las barras blancas con sombra y la fuente de sistema son lo que da la sensación de plantilla.

## 9. Proceso y verificación

- Cada comportamiento quedó cubierto por un test E2E en móvil y escritorio:
  - modo auto: sin menús encima, pausa y reanudación, salida con Escape;
  - indicador discreto: color y posición;
  - cabeceras de capítulo: «5 de 40», sin título duplicado;
  - concentración, colores propios y aire vertical: persisten tras recargar.
- Resultado: **87 tests unitarios y 26 E2E en verde**.
- El fijado de app y las teclas de volumen solo se pueden comprobar en un dispositivo real. Se dejan la lógica nativa mínima y la compilación del APK verificada en CI.
- **Lección de la investigación con agentes:** el flujo de 90 agentes agotó la cuota semanal a mitad (8 investigaciones y 6 auditorías completas, el resto falló). Para la próxima:
  - verificar por lotes y no una propuesta por agente;
  - guardar resultados intermedios en un archivo, para poder retomar sin reejecutar;
  - presupuestar el número de agentes según el límite de uso, no solo según la calidad.

---

# Segunda iteración: las 14 propuestas elegidas

## 10. Lectura

- **Volver tras un salto.** Todo salto explícito (índice, búsqueda, enlace interno, barra de progreso) guarda antes el sitio y muestra «Volver a…». Si hay varios saltos seguidos se conserva el **primero**: es al que quieres volver tras mirar varios resultados de búsqueda.
- **Renglón entero al pasar pantalla.** Se busca con `caretPositionFromPoint` el renglón que cruza el borde inferior y se desplaza justo hasta su parte de arriba. Un primer intento dejaba 6 px de margen y asomaban los descendentes de la línea anterior. **Lección:** alinear exactamente con el borde visible. Ese borde visible no es `scrollTop = 0`: en Android está debajo de la barra de estado (`safe-area-inset-top`).
- **Ancho en letras (`ch`) y `font-size-adjust`.** Un ancho en píxeles cambia de significado con cada fuente; en letras por línea se mantiene la medida tipográfica (45–75). `font-size-adjust: 0.45` (la altura de x de Spectral) hace que cambiar de fuente no cambie el tamaño aparente.
- **Día/noche.** El tema de noche es un ajuste aparte (`nightThemeId`). Elegir un tema mientras es de noche cambia solo el de noche, así que nunca se pisa el de día.

## 11. Juego

- **Modo de juego.** El filtro está en un único sitio: `toast()`. Así ningún módulo (sesión, logros, metas) tiene que saber del modo. En «Discreto» las celebraciones se guardan para el resumen.
- **Resumen al cerrar.** Solo aparece si hubo lectura de verdad (1 minuto o 150 palabras): un resumen de 10 segundos de hojeo sería ruido.
- **Tarjeta para compartir.** Se dibuja en un `canvas` con los colores del tema actual. Se reutiliza `saveFile`, que en el PC descarga y en Android abre Compartir.
- **Mis palabras.** Se guarda la palabra con su **frase del libro**, porque recordar una palabra en contexto funciona mejor que con una definición suelta. Repaso Leitner en 6 cajas (1, 2, 4, 8, 16 y 32 días): sin algoritmos opacos y fácil de explicar.

## 12. Android

- **Pomodoro sin servicio.** La notificación usa `setUsesChronometer` + `setChronometerCountDown`, así que la cuenta atrás la dibuja el sistema sin despertar la app. Al final salta una alarma exacta (`USE_EXACT_ALARM` en Android 13+, `SCHEDULE_EXACT_ALARM` antes). Con la app delante la alarma no notifica: avisa la web. Con la app oculta, el temporizador de JavaScript se cancela para que no suenen dos avisos.
- **Foco de audio.** Pérdida temporal (llamada, GPS) → pausa y reanuda. Pérdida definitiva (otra música) → pausa. Auriculares desconectados (`BECOMING_NOISY`) → pausa: nunca suena de golpe por el altavoz.
- **Pantalla apagada.** Capacitor no pausa el WebView en segundo plano (`KeepRunning`), así que basta un servicio en primer plano de tipo `mediaPlayback` para que Android no mate el proceso. El servicio solo existe mientras suena y con la opción activa.
- **Copia automática.** La copia de Android tiene una cuota de 25 MB y, si se supera, **no se copia nada**. Con los EPUB en IndexedDB se superaría enseguida. Por eso la regla de copia incluye solo un JSON de progreso (pocos KB) y el paso directo de móvil a móvil (sin cuota) se deja sin limitar, para que se lleve también los libros.
- **Clave de firma.** Las contraseñas pasan por variables de entorno y no se interpolan en el script de CI: un símbolo como `$` o `"` en la contraseña rompería el paso.
- **Sin SDK de Android en el entorno de desarrollo** (Google Maven bloqueado): la compilación nativa se verifica en CI. Para reducir sorpresas: APIs con comprobación de versión, `try/catch` alrededor de lo que Android puede negar (avisos, servicios en primer plano) y `javac` local para descartar errores de sintaxis.
