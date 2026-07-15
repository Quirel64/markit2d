import type { Pixel, ProjectPayloadV1, ProjectPayloadV2, ProjectMeta } from '../types'
import { CANVAS_SIZE, PROJECTS_INDEX_KEY, PROJECT_PREFIX } from '../constants'

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

const hasPixels = (pixels: Pixel[]): boolean => pixels.some((p) => p !== null)

const loadIndex = (): ProjectMeta[] => {
  try {
    const raw = window.localStorage.getItem(PROJECTS_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is ProjectMeta =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ProjectMeta).id === 'string' &&
        typeof (item as ProjectMeta).name === 'string',
    )
  } catch {
    return []
  }
}

const saveIndex = (index: ProjectMeta[]): void => {
  window.localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index))
}

export const listProjects = (): ProjectMeta[] => loadIndex()

export const loadProject = (id: string): Pixel[] | null => {
  const raw = window.localStorage.getItem(PROJECT_PREFIX + id)
  if (!raw) return null
  try {
    return decodeProject(raw)
  } catch {
    return null
  }
}

export const saveProject = (id: string, pixels: Pixel[]): boolean => {
  if (!hasPixels(pixels)) return false
  const encoded = encodeProject(pixels)
  window.localStorage.setItem(PROJECT_PREFIX + id, encoded)
  return true
}

export const deleteProject = (id: string): void => {
  window.localStorage.removeItem(PROJECT_PREFIX + id)
  const index = loadIndex().filter((p) => p.id !== id)
  saveIndex(index)
}

export const createProject = (name: string, pixels: Pixel[]): ProjectMeta | null => {
  if (!hasPixels(pixels)) return null
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const now = Date.now()
  const meta: ProjectMeta = { id, name, createdAt: now, updatedAt: now }
  saveProject(id, pixels)
  const index = loadIndex()
  index.unshift(meta)
  saveIndex(index)
  return meta
}

export const updateProject = (id: string, name: string, pixels: Pixel[]): boolean => {
  const index = loadIndex()
  const existing = index.find((p) => p.id === id)
  if (!existing) return false
  if (hasPixels(pixels)) {
    saveProject(id, pixels)
  }
  existing.name = name
  existing.updatedAt = Date.now()
  saveIndex(index)
  return true
}

export const isCanvasBlank = (pixels: Pixel[]): boolean => !hasPixels(pixels)
