// Genera los sonidos fuera del hilo principal: la interfaz nunca se congela.
import { bake, bakeThunder, RECIPES } from './generators'

export type BakeInput = { kind: 'sound'; sound: string; ctxRate: number; seed: number } | { kind: 'thunder'; rate: number; seed: number }
export type BakeRequest = BakeInput & { id: number }
export type BakeResponse = { id: number; data: Float32Array; rate: number } | { id: number; error: string }

self.onmessage = (e: MessageEvent<BakeRequest>) => {
  const req = e.data
  try {
    if (req.kind === 'thunder') {
      const data = bakeThunder(req.rate, req.seed)
      postMessage({ id: req.id, data, rate: req.rate } satisfies BakeResponse, { transfer: [data.buffer] })
      return
    }
    const recipe = RECIPES.find((r) => r.id === req.sound)
    if (!recipe) throw new Error(`Sonido desconocido: ${req.sound}`)
    const { data, rate } = bake(recipe, req.ctxRate, req.seed)
    for (let i = 0; i < data.length; i++) data[i] *= recipe.trim
    postMessage({ id: req.id, data, rate } satisfies BakeResponse, { transfer: [data.buffer] })
  } catch (err) {
    postMessage({ id: req.id, error: String(err) } satisfies BakeResponse)
  }
}
