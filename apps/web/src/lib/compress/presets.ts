import type { PresetName } from './types'

export const PRESETS: Record<PresetName, { label: string; quality: number }> = {
  smaller: { label: 'Smaller', quality: 0.6 },
  balanced: { label: 'Balanced', quality: 0.8 },
  better: { label: 'Better', quality: 0.9 }
}

export const PRESET_ORDER: PresetName[] = ['smaller', 'balanced', 'better']

export const DEFAULT_PRESET: PresetName = 'balanced'
