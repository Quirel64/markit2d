import type { HslColor } from '../types'
import { clamp } from './canvas'

export const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(clean, 16)

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }
}

export const rgbToHex = (red: number, green: number, blue: number) =>
  `#${[red, green, blue].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`

export const hexToHsl = (hex: string): HslColor => {
  const { red, green, blue } = hexToRgb(hex)
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min

  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness }
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue =
    max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4

  return {
    hue: (hue * 60 + 360) % 360,
    saturation,
    lightness,
  }
}

export const hslToHex = ({ hue, saturation, lightness }: HslColor) => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = lightness - chroma / 2
  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) {
    r = chroma
    g = x
  } else if (hue < 120) {
    r = x
    g = chroma
  } else if (hue < 180) {
    g = chroma
    b = x
  } else if (hue < 240) {
    g = x
    b = chroma
  } else if (hue < 300) {
    r = x
    b = chroma
  } else {
    r = chroma
    b = x
  }

  return rgbToHex((r + match) * 255, (g + match) * 255, (b + match) * 255)
}

export const shiftColor = (hex: string, shift: Partial<HslColor>) => {
  const hsl = hexToHsl(hex)

  return hslToHex({
    hue: (hsl.hue + (shift.hue ?? 0) + 360) % 360,
    saturation: clamp(hsl.saturation + (shift.saturation ?? 0), 0, 1),
    lightness: clamp(hsl.lightness + (shift.lightness ?? 0), 0.04, 0.96),
  })
}
