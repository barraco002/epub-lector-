// Los tests unitarios comprueban textos en español. La preferencia automática sigue al idioma del
// navegador, y los módulos se cargan después de este archivo: declaramos el navegador en español antes.
Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true })
