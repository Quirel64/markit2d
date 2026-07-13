import type { Pixel, ProjectPayloadV1, ProjectPayloadV2 } from '../types'
import { CANVAS_SIZE } from '../constants'

const toBase64Url = (value: string): string =>
  btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

const fromBase64Url = (value: string): string => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')

  return atob(padded)
}

const decodeProjectV1 = (encoded: string): Pixel[] => {
  const payload = JSON.parse(atob(encoded)) as ProjectPayloadV1

  if (
    payload.version !== 1 ||
    payload.width !== CANVAS_SIZE ||
    payload.height !== CANVAS_SIZE ||
    !Array.isArray(payload.pixels) ||
    payload.pixels.length !== CANVAS_SIZE * CANVAS_SIZE
  ) {
    throw new Error('Unsupported project code')
  }

  return payload.pixels.map((pixel) => (typeof pixel === 'string' ? pixel : null))
}

const decodeProjectV2 = (encoded: string): Pixel[] => {
  const payload = JSON.parse(fromBase64Url(encoded)) as ProjectPayloadV2

  if (
    payload.version !== 2 ||
    payload.width !== CANVAS_SIZE ||
    payload.height !== CANVAS_SIZE ||
    !Array.isArray(payload.palette) ||
    !Array.isArray(payload.runs)
  ) {
    throw new Error('Unsupported project code')
  }

  const decoded = payload.runs.flatMap(([paletteIndex, count]) => {
    const fill = paletteIndex === 0 ? null : payload.palette[paletteIndex - 1]
    return Array<Pixel>(count).fill(typeof fill === 'string' ? fill : null)
  })

  if (decoded.length !== CANVAS_SIZE * CANVAS_SIZE) {
    throw new Error('Unsupported project code')
  }

  return decoded
}

export const encodeProject = (pixels: Pixel[]): string => {
  const palette = Array.from(new Set(pixels.filter((pixel): pixel is string => Boolean(pixel))))
  const colorIndexes = new Map(palette.map((pixel, index) => [pixel, index + 1]))
  const runs: Array<[number, number]> = []

  for (const pixel of pixels) {
    const value = pixel ? colorIndexes.get(pixel) ?? 0 : 0
    const lastRun = runs.at(-1)

    if (lastRun && lastRun[0] === value) {
      lastRun[1] += 1
    } else {
      runs.push([value, 1])
    }
  }

  const payload: ProjectPayloadV2 = {
    version: 2,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    palette,
    runs,
  }

  return `PGS2:${toBase64Url(JSON.stringify(payload))}`
}

export const decodeProject = (code: string): Pixel[] => {
  const trimmed = code.trim()
  const prefix = trimmed.slice(0, 5).toUpperCase()
  const encoded = trimmed.slice(5)

  if (prefix === 'PGS2:') return decodeProjectV2(encoded)
  if (prefix === 'PGS1:') return decodeProjectV1(encoded)

  return decodeProjectV1(trimmed)
}
