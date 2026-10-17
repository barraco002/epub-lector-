import { render } from 'preact'
import './styles/fonts.generated.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/library.css'
import './styles/reader.css'
import { startAppearance } from './lib/appearance'
import { App } from './app'

startAppearance()
render(<App />, document.getElementById('app')!)
