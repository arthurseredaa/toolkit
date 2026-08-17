import type { OutputType } from './types'

export type PlanInput = {
  inputType: string
  hasAlpha: boolean
  canEncode: (type: OutputType) => boolean
}

export function planOutput({
  inputType,
  hasAlpha,
  canEncode
}: PlanInput): OutputType {
  if (inputType === 'image/jpeg') return 'image/jpeg'
  if (inputType === 'image/png') return hasAlpha ? 'image/png' : 'image/jpeg'
  if (inputType === 'image/webp') {
    if (canEncode('image/webp')) return 'image/webp'
    return hasAlpha ? 'image/png' : 'image/jpeg'
  }
  return 'image/jpeg'
}

const EXT: Record<OutputType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

export function outputName(
  name: string,
  inputType: string,
  outputType: OutputType
): string {
  if (inputType === outputType) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${stem}.${EXT[outputType]}`
}
