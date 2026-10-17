import { signal } from '@preact/signals'
import { uid } from './util'

export type ToastKind = 'info' | 'progress' | 'achievement' | 'level' | 'goal' | 'pomodoro' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  icon?: string
  /** 0..1, dibuja una barrita de progreso dentro del aviso */
  bar?: number
}

export const toasts = signal<Toast[]>([])

const DURATION: Record<ToastKind, number> = {
  info: 2600,
  progress: 3200,
  achievement: 5200,
  level: 5200,
  goal: 4800,
  pomodoro: 4500,
  error: 5000,
}

export function toast(t: Omit<Toast, 'id'>) {
  const item = { ...t, id: uid() }
  // Como mucho 3 avisos a la vez; los de progreso se sustituyen entre sí
  let list = toasts.value
  if (item.kind === 'progress') list = list.filter((x) => x.kind !== 'progress')
  toasts.value = [...list.slice(-2), item]
  setTimeout(() => dismiss(item.id), DURATION[item.kind])
  return item.id
}

export function dismiss(id: string) {
  toasts.value = toasts.value.filter((x) => x.id !== id)
}

export const info = (title: string, body?: string) => toast({ kind: 'info', title, body })
export const error = (title: string, body?: string) => toast({ kind: 'error', title, body, icon: '⚠️' })
