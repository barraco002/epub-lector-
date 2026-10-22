// Imagen de fondo propia del lector (guardada en IndexedDB, una sola a la vez).
import { signal } from '@preact/signals'
import { kv } from './db'
import { update } from './settings'

export const bgImageUrl = signal<string | null>(null)

function setBlob(blob: Blob | undefined) {
  if (bgImageUrl.value) URL.revokeObjectURL(bgImageUrl.value)
  bgImageUrl.value = blob ? URL.createObjectURL(blob) : null
}

export async function loadBgImage() {
  setBlob((await kv.get<Blob>('bgImage')) ?? undefined)
}

export async function setBgImage(file: Blob) {
  await kv.set('bgImage', file)
  setBlob(file)
  update({ bgImage: true })
}

export async function clearBgImage() {
  await kv.set('bgImage', undefined)
  setBlob(undefined)
  update({ bgImage: false })
}
