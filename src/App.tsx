import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'


// nav to this folder and in command prommpt use npm run dev to start server for quick tests.

type Tool = 'view' | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select'

// nav to folder and in command prommpt use npm run dev to start server for quick tests.
// to update the folder do npm install then npm run build then delete what is inside the docs folder and 
// replace it with whats inside the dist folder and save and
//  then do github commit which can be done via vscode




type Pixel = string | null
type MenuId = 'tools' | 'grid' | 'color' | 'project'
type Viewport = {
  zoom: number
  panX: number
  panY: number
}

type PointerPoint = {
  x: number
  y: number
}

type GestureState = {
  lastCenter: PointerPoint | null
  lastDistance: number | null
}

type HslColor = {
  hue: number
  saturation: number
  lightness: number
}

type ProjectPayloadV1 = {
  version: 1
  width: number
  height: number
  pixels: Pixel[]
}

type ProjectPayloadV2 = {
  version: 2
  width: number
  height: number
  palette: string[]
  runs: Array<[number, number]>
}

const CANVAS_SIZE = 64
const VIEW_SIZE = 768
const MIN_ZOOM = 1
const MAX_ZOOM = 16
const GRID_PRESETS = [8, 16, 32, 64]
const BRUSH_PRESETS = [1, 3, 5]
const EXPORT_SCALES = [1, 4, 8, 16]
const TOOLS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: 'view', icon: '🔍', label: 'view' },
  { id: 'pencil', icon: '✏️', label: 'pencil' },
  { id: 'eraser', icon: '🧽', label: 'eraser' },
  { id: 'fill', icon: '🪣', label: 'fill' },
  { id: 'eyedropper', icon: '💧', label: 'eyedropper' },
  { id: 'select', icon: '⛶', label: 'select' },
]
const MENUS: Array<{ id: MenuId; icon: string; label: string }> = [
  { id: 'tools', icon: 'T', label: 'Tools' },
  { id: 'grid', icon: 'G', label: 'Grid' },
  { id: 'color', icon: 'C', label: 'Color' },
  { id: 'project', icon: 'P', label: 'Project' },
]
const STORAGE_KEY = 'pixel-grid-studio-draft'
const PINNED_COLORS_KEY = 'pixel-grid-studio-pinned-colors'
const PINNED_TOOLS_KEY = 'pixel-grid-studio-pinned-tools'
const PALETTE = [
  '#111827',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#38bdf8',
  '#6366f1',
  '#ec4899',
]

const makeBlankPixels = () => Array<Pixel>(CANVAS_SIZE * CANVAS_SIZE).fill(null)

const clonePixels = (pixels: Pixel[]) => [...pixels]

const indexOf = (x: number, y: number) => y * CANVAS_SIZE + x

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const clampViewport = ({ zoom, panX, panY }: Viewport): Viewport => {
  const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  const minPan = VIEW_SIZE - VIEW_SIZE * nextZoom

  return {
    zoom: nextZoom,
    panX: nextZoom === MIN_ZOOM ? 0 : clamp(panX, minPan, 0),
    panY: nextZoom === MIN_ZOOM ? 0 : clamp(panY, minPan, 0),
  }
}

const getDistance = (first: PointerPoint, second: PointerPoint) =>
  Math.hypot(second.x - first.x, second.y - first.y)

const getCenter = (first: PointerPoint, second: PointerPoint) => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
})

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(clean, 16)

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }
}

const rgbToHex = (red: number, green: number, blue: number) =>
  `#${[red, green, blue].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`

const hexToHsl = (hex: string): HslColor => {
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

const hslToHex = ({ hue, saturation, lightness }: HslColor) => {
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

const shiftColor = (hex: string, shift: Partial<HslColor>) => {
  const hsl = hexToHsl(hex)

  return hslToHex({
    hue: (hsl.hue + (shift.hue ?? 0) + 360) % 360,
    saturation: clamp(hsl.saturation + (shift.saturation ?? 0), 0, 1),
    lightness: clamp(hsl.lightness + (shift.lightness ?? 0), 0.04, 0.96),
  })
}

const toBase64Url = (value: string) =>
  btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')

  return atob(padded)
}

const encodeProject = (pixels: Pixel[]) => {
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

const decodeProjectV1 = (encoded: string) => {
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

const decodeProjectV2 = (encoded: string) => {
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

const decodeProject = (code: string) => {
  const trimmed = code.trim()
  const prefix = trimmed.slice(0, 5).toUpperCase()
  const encoded = trimmed.slice(5)

  if (prefix === 'PGS2:') return decodeProjectV2(encoded)
  if (prefix === 'PGS1:') return decodeProjectV1(encoded)

  return decodeProjectV1(trimmed)
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const isDrawingRef = useRef(false)
  const lastPaintedRef = useRef<string | null>(null)
  const activePointersRef = useRef(new Map<number, PointerPoint>())
  const gestureRef = useRef<GestureState>({ lastCenter: null, lastDistance: null })
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  const [pixels, setPixels] = useState<Pixel[]>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return makeBlankPixels()

    try {
      return decodeProject(saved)
    } catch {
      return makeBlankPixels()
    }
  })
  const [tool, setTool] = useState<Tool>('pencil')
  const [color, setColor] = useState(PALETTE[0])
  const [customColor, setCustomColor] = useState(PALETTE[0])
  const [pinnedColors, setPinnedColors] = useState<string[]>(() => {
    const saved = window.localStorage.getItem(PINNED_COLORS_KEY)
    if (!saved) return PALETTE.slice(0, 5)

    try {
      const parsed = JSON.parse(saved) as unknown
      if (!Array.isArray(parsed)) return PALETTE.slice(0, 5)

      return parsed.filter((item): item is string => typeof item === 'string' && /^#[0-9a-f]{6}$/i.test(item))
    } catch {
      return PALETTE.slice(0, 5)
    }
  })

  const [pinnedTools, setPinnedTools] = useState<Tool[]>(() => {
    const saved = window.localStorage.getItem(PINNED_TOOLS_KEY)
    if (!saved) return ['pencil', 'eraser', 'fill']

    try {
      const parsed = JSON.parse(saved) as unknown
      if (!Array.isArray(parsed)) return ['pencil', 'eraser', 'fill']

      return parsed.filter((item): item is Tool => ['view', 'pencil', 'eraser', 'fill', 'eyedropper'].includes(item))
    } catch {
      return ['pencil', 'eraser', 'fill']
    }
  })

  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [floatingSelection, setFloatingSelection] = useState<{
    pixels: Array<{ x: number; y: number; color: Pixel; originalX: number; originalY: number }>
    bounds: { x: number; y: number; width: number; height: number }
    transform: { rotation: number; flipX: boolean; flipY: boolean; offsetX: number; offsetY: number }
  } | null>(null)
  const [selectStart, setSelectStart] = useState<{ x: number; y: number } | null>(null)

  const [gridSize, setGridSize] = useState(32)
  const [brushSize, setBrushSize] = useState(1)
  const [exportScale, setExportScale] = useState(8)
  const [exportTransparent, setExportTransparent] = useState(true)
  const [history, setHistory] = useState<Pixel[][]>([])
  const [future, setFuture] = useState<Pixel[][]>([])
  const [projectCode, setProjectCode] = useState('')
  const [status, setStatus] = useState('Ready')
  const [activeMenu, setActiveMenu] = useState<MenuId>('tools')
  const [isMenuOpen, setIsMenuOpen] = useState(true)
  const [isPinMode, setIsPinMode] = useState(false)
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })

  const blockSize = useMemo(() => CANVAS_SIZE / gridSize, [gridSize])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, encodeProject(pixels))
  }, [pixels])

  useEffect(() => {
    window.localStorage.setItem(PINNED_COLORS_KEY, JSON.stringify(pinnedColors))
  }, [pinnedColors])

  useEffect(() => {
    window.localStorage.setItem(PINNED_TOOLS_KEY, JSON.stringify(pinnedTools))
  }, [pinnedTools])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE)

    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, VIEW_SIZE, VIEW_SIZE)

    const artCanvas = document.createElement('canvas')
    artCanvas.width = CANVAS_SIZE
    artCanvas.height = CANVAS_SIZE
    const artCtx = artCanvas.getContext('2d')
    if (!artCtx) return

    const imageData = artCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE)
    pixels.forEach((pixel, index) => {
      if (!pixel) return

      const { red, green, blue } = hexToRgb(pixel)
      const dataIndex = index * 4
      imageData.data[dataIndex] = red
      imageData.data[dataIndex + 1] = green
      imageData.data[dataIndex + 2] = blue
      imageData.data[dataIndex + 3] = 255
    })
    artCtx.putImageData(imageData, 0, 0)

    ctx.save()
    ctx.translate(viewport.panX, viewport.panY)
    ctx.scale(viewport.zoom, viewport.zoom)
    ctx.drawImage(artCanvas, 0, 0, VIEW_SIZE, VIEW_SIZE)

    if (floatingSelection) {
      const { pixels: floatPixels, bounds, transform } = floatingSelection
      const floatCanvas = document.createElement('canvas')
      floatCanvas.width = bounds.width
      floatCanvas.height = bounds.height
      const floatCtx = floatCanvas.getContext('2d')
      if (floatCtx) {
        floatCtx.imageSmoothingEnabled = false
        const floatImageData = floatCtx.createImageData(bounds.width, bounds.height)
        for (const p of floatPixels) {
          const localX = p.originalX - bounds.x
          const localY = p.originalY - bounds.y
          if (localX >= 0 && localX < bounds.width && localY >= 0 && localY < bounds.height && p.color) {
            const { red, green, blue } = hexToRgb(p.color)
            const dataIndex = (localY * bounds.width + localX) * 4
            floatImageData.data[dataIndex] = red
            floatImageData.data[dataIndex + 1] = green
            floatImageData.data[dataIndex + 2] = blue
            floatImageData.data[dataIndex + 3] = 200
          }
        }
        floatCtx.putImageData(floatImageData, 0, 0)

        ctx.save()
        const centerX = (bounds.x + bounds.width / 2) * (VIEW_SIZE / CANVAS_SIZE)
        const centerY = (bounds.y + bounds.height / 2) * (VIEW_SIZE / CANVAS_SIZE)
        const pixelScale = VIEW_SIZE / CANVAS_SIZE
        ctx.translate(centerX + transform.offsetX * pixelScale * viewport.zoom, centerY + transform.offsetY * pixelScale * viewport.zoom)
        ctx.rotate((transform.rotation * Math.PI) / 180)
        if (transform.flipX) ctx.scale(-1, 1)
        if (transform.flipY) ctx.scale(1, -1)
        ctx.drawImage(floatCanvas, -bounds.width / 2 * pixelScale, -bounds.height / 2 * pixelScale, bounds.width * pixelScale, bounds.height * pixelScale)

        ctx.strokeStyle = '#0f766e'
        ctx.lineWidth = 2 / viewport.zoom
        ctx.setLineDash([8 / viewport.zoom, 4 / viewport.zoom])
        ctx.strokeRect(-bounds.width / 2 * pixelScale, -bounds.height / 2 * pixelScale, bounds.width * pixelScale, bounds.height * pixelScale)
        ctx.restore()
      }
    }

    if (selection) {
      ctx.save()
      ctx.strokeStyle = '#0f766e'
      ctx.lineWidth = 2 / viewport.zoom
      ctx.setLineDash([8 / viewport.zoom, 4 / viewport.zoom])
      const selX = selection.x * (VIEW_SIZE / CANVAS_SIZE)
      const selY = selection.y * (VIEW_SIZE / CANVAS_SIZE)
      const selW = selection.width * (VIEW_SIZE / CANVAS_SIZE)
      const selH = selection.height * (VIEW_SIZE / CANVAS_SIZE)
      ctx.strokeRect(selX, selY, selW, selH)
      ctx.fillStyle = 'rgba(20, 184, 166, 0.1)'
      ctx.fillRect(selX, selY, selW, selH)
      ctx.restore()
    }

    const gridStep = VIEW_SIZE / gridSize
    ctx.strokeStyle = gridSize >= 64 ? 'rgba(15, 23, 42, 0.14)' : 'rgba(15, 23, 42, 0.2)'
    ctx.lineWidth = 1 / viewport.zoom

    for (let line = 0; line <= gridSize; line += 1) {
      const pos = line * gridStep
      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, VIEW_SIZE)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, pos)
      ctx.lineTo(VIEW_SIZE, pos)
      ctx.stroke()
    }

    ctx.restore()
  }, [gridSize, pixels, viewport, floatingSelection, selection])

  const pushHistory = useCallback(() => {
    setHistory((items) => [...items.slice(-39), clonePixels(pixels)])
    setFuture([])
  }, [pixels])

  const handleCustomColorChange = useCallback((nextColor: string) => {
    setCustomColor(nextColor)
    setColor(nextColor)
  }, [])

  const selectColor = useCallback((nextColor: string) => {
    setColor(nextColor)
    setCustomColor(nextColor)
  }, [])

  const pointerToCanvasPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_SIZE,
    }
  }, [])

  const pointToCell = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerToCanvasPoint(event)
    if (!point) return null

    const worldX = (point.x - viewport.panX) / viewport.zoom
    const worldY = (point.y - viewport.panY) / viewport.zoom

    if (worldX < 0 || worldY < 0 || worldX >= VIEW_SIZE || worldY >= VIEW_SIZE) return null

    const rawX = Math.floor((worldX / VIEW_SIZE) * CANVAS_SIZE)
    const rawY = Math.floor((worldY / VIEW_SIZE) * CANVAS_SIZE)
    const x = Math.min(CANVAS_SIZE - 1, Math.max(0, rawX))
    const y = Math.min(CANVAS_SIZE - 1, Math.max(0, rawY))
    const cellX = Math.floor(x / blockSize)
    const cellY = Math.floor(y / blockSize)

    return { cellX, cellY, x: cellX * blockSize, y: cellY * blockSize }
  }, [blockSize, pointerToCanvasPoint, viewport])

  const pointToPixel = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerToCanvasPoint(event)
    if (!point) return null

    const worldX = (point.x - viewport.panX) / viewport.zoom
    const worldY = (point.y - viewport.panY) / viewport.zoom

    if (worldX < 0 || worldY < 0 || worldX >= VIEW_SIZE || worldY >= VIEW_SIZE) return null

    const rawX = Math.floor((worldX / VIEW_SIZE) * CANVAS_SIZE)
    const rawY = Math.floor((worldY / VIEW_SIZE) * CANVAS_SIZE)
    const x = Math.min(CANVAS_SIZE - 1, Math.max(0, rawX))
    const y = Math.min(CANVAS_SIZE - 1, Math.max(0, rawY))

    return { x, y }
  }, [pointerToCanvasPoint, viewport])

  const zoomAtPoint = useCallback((point: PointerPoint, zoomFactor: number) => {
    setViewport((current) => {
      const nextZoom = clamp(current.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM)
      const zoomRatio = nextZoom / current.zoom

      return clampViewport({
        zoom: nextZoom,
        panX: point.x - (point.x - current.panX) * zoomRatio,
        panY: point.y - (point.y - current.panY) * zoomRatio,
      })
    })
  }, [])

  const paintBlock = useCallback(
    (nextPixels: Pixel[], cellX: number, cellY: number, nextColor: Pixel) => {
      const offset = Math.floor(brushSize / 2)

      for (let brushY = -offset; brushY <= offset; brushY += 1) {
        for (let brushX = -offset; brushX <= offset; brushX += 1) {
          const targetCellX = cellX + brushX
          const targetCellY = cellY + brushY

          if (
            targetCellX < 0 ||
            targetCellY < 0 ||
            targetCellX >= gridSize ||
            targetCellY >= gridSize
          ) {
            continue
          }

          const startX = targetCellX * blockSize
          const startY = targetCellY * blockSize

          for (let y = startY; y < startY + blockSize; y += 1) {
            for (let x = startX; x < startX + blockSize; x += 1) {
              nextPixels[indexOf(x, y)] = nextColor
            }
          }
        }
      }
    },
    [blockSize, brushSize, gridSize],
  )

  const floodFill = useCallback(
    (startX: number, startY: number, nextColor: Pixel) => {
      const targetColor = pixels[indexOf(startX, startY)]
      if (targetColor === nextColor) return

      const nextPixels = clonePixels(pixels)
      const queue: Array<[number, number]> = [[startX, startY]]

      while (queue.length) {
        const current = queue.pop()
        if (!current) continue

        const [x, y] = current
        if (x < 0 || y < 0 || x >= CANVAS_SIZE || y >= CANVAS_SIZE) continue
        if (nextPixels[indexOf(x, y)] !== targetColor) continue

        nextPixels[indexOf(x, y)] = nextColor
        queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
      }

      pushHistory()
      setPixels(nextPixels)
      setStatus('Filled matching area')
    },
    [pixels, pushHistory],
  )

  const applyTool = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'view') return

      const point = pointToCell(event)
      if (!point) return

      if (tool === 'fill') {
        floodFill(point.x, point.y, color)
        return
      }

      if (tool === 'eyedropper') {
        const pickedColor = pixels[indexOf(point.x, point.y)]
        if (pickedColor) {
          selectColor(pickedColor)
          setStatus(`Picked ${pickedColor}`)
          setTool('pencil')
        } else {
          setStatus('No color to pick (transparent)')
        }
        return
      }

      if (tool === 'select') {
        return
      }

      const paintKey = `${point.cellX}:${point.cellY}:${tool}:${color}:${brushSize}:${gridSize}`
      if (lastPaintedRef.current === paintKey) return
      lastPaintedRef.current = paintKey

      setPixels((current) => {
        const nextPixels = clonePixels(current)
        paintBlock(nextPixels, point.cellX, point.cellY, tool === 'eraser' ? null : color)
        return nextPixels
      })
    },
    [brushSize, color, floodFill, gridSize, paintBlock, pointToCell, pixels, selectColor, tool],
  )

  const resetGesture = () => {
    gestureRef.current = { lastCenter: null, lastDistance: null }
  }

  const updateViewGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerToCanvasPoint(event)
    if (!point) return

    activePointersRef.current.set(event.pointerId, point)
    const pointers = Array.from(activePointersRef.current.values())

    if (pointers.length === 1) {
      const lastCenter = gestureRef.current.lastCenter
      if (lastCenter) {
        const deltaX = point.x - lastCenter.x
        const deltaY = point.y - lastCenter.y

        setViewport((current) =>
          clampViewport({
            ...current,
            panX: current.panX + deltaX,
            panY: current.panY + deltaY,
          }),
        )
      }

      gestureRef.current = { lastCenter: point, lastDistance: null }
      return
    }

    if (pointers.length >= 2) {
      const first = pointers[0]
      const second = pointers[1]
      const center = getCenter(first, second)
      const distance = getDistance(first, second)
      const lastCenter = gestureRef.current.lastCenter
      const lastDistance = gestureRef.current.lastDistance

      setViewport((current) => {
        const distanceScale = lastDistance ? distance / lastDistance : 1
        const nextZoom = clamp(current.zoom * distanceScale, MIN_ZOOM, MAX_ZOOM)
        const zoomRatio = nextZoom / current.zoom
        const panDeltaX = lastCenter ? center.x - lastCenter.x : 0
        const panDeltaY = lastCenter ? center.y - lastCenter.y : 0

        return clampViewport({
          zoom: nextZoom,
          panX: center.x - (center.x - current.panX) * zoomRatio + panDeltaX,
          panY: center.y - (center.y - current.panY) * zoomRatio + panDeltaY,
        })
      })

      gestureRef.current = { lastCenter: center, lastDistance: distance }
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)

    if (tool === 'view') {
      const point = pointerToCanvasPoint(event)
      if (!point) return

      activePointersRef.current.set(event.pointerId, point)
      const pointers = Array.from(activePointersRef.current.values())
      gestureRef.current =
        pointers.length >= 2
          ? { lastCenter: getCenter(pointers[0], pointers[1]), lastDistance: getDistance(pointers[0], pointers[1]) }
          : { lastCenter: point, lastDistance: null }
      return
    }

    if (tool === 'select') {
      const point = pointToPixel(event)
      if (!point) return

      if (floatingSelection) {
        const { bounds, transform } = floatingSelection
        const centerX = bounds.x + bounds.width / 2
        const centerY = bounds.y + bounds.height / 2
        const halfW = bounds.width / 2
        const halfH = bounds.height / 2
        if (
          point.x >= centerX - halfW + transform.offsetX &&
          point.x <= centerX + halfW + transform.offsetX &&
          point.y >= centerY - halfH + transform.offsetY &&
          point.y <= centerY + halfH + transform.offsetY
        ) {
          isDrawingRef.current = true
          dragStartRef.current = { x: point.x - transform.offsetX, y: point.y - transform.offsetY }
          return
        }
        commitFloatingSelection()
      }

      isDrawingRef.current = true
      setSelectStart({ x: point.x, y: point.y })
      setSelection({ x: point.x, y: point.y, width: 0, height: 0 })
      return
    }

    isDrawingRef.current = true
    lastPaintedRef.current = null

    if (tool !== 'fill') pushHistory()
    applyTool(event)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'view') {
      updateViewGesture(event)
      return
    }

    if (tool === 'select') {
      if (!isDrawingRef.current) return

      const point = pointToPixel(event)
      if (!point) return

      if (floatingSelection && dragStartRef.current) {
        const start = dragStartRef.current
        const newOffsetX = point.x - start.x
        const newOffsetY = point.y - start.y
        setFloatingSelection((prev) =>
          prev
            ? {
                ...prev,
                transform: {
                  ...prev.transform,
                  offsetX: newOffsetX,
                  offsetY: newOffsetY,
                },
              }
            : prev,
        )
        return
      }

      if (selectStart) {
        const minX = Math.min(selectStart.x, point.x)
        const minY = Math.min(selectStart.y, point.y)
        const maxX = Math.max(selectStart.x, point.x)
        const maxY = Math.max(selectStart.y, point.y)

        setSelection({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        })
      }
      return
    }

    if (!isDrawingRef.current || tool === 'fill') return
    applyTool(event)
  }

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event) {
      activePointersRef.current.delete(event.pointerId)
      if (activePointersRef.current.size === 0) {
        resetGesture()
      } else {
        const pointers = Array.from(activePointersRef.current.values())
        gestureRef.current =
          pointers.length >= 2
            ? { lastCenter: getCenter(pointers[0], pointers[1]), lastDistance: getDistance(pointers[0], pointers[1]) }
            : { lastCenter: pointers[0], lastDistance: null }
      }
    }

    if (tool === 'select' && isDrawingRef.current) {
      isDrawingRef.current = false
      dragStartRef.current = null
      if (selection && selection.width > 0 && selection.height > 0) {
        extractFloatingSelection()
      } else if (!floatingSelection) {
        setSelection(null)
        setSelectStart(null)
      }
      return
    }

    isDrawingRef.current = false
    lastPaintedRef.current = null
  }

  const extractFloatingSelection = useCallback(() => {
    if (!selection) return

    const selectedPixels: Array<{ x: number; y: number; color: Pixel }> = []
    for (let y = selection.y; y < selection.y + selection.height; y++) {
      for (let x = selection.x; x < selection.x + selection.width; x++) {
        if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
          const color = pixels[indexOf(x, y)]
          if (color) {
            selectedPixels.push({ x, y, color })
          }
        }
      }
    }

    if (selectedPixels.length === 0) {
      setSelection(null)
      setSelectStart(null)
      return
    }

    setFloatingSelection({
      pixels: selectedPixels.map((p) => ({ ...p, originalX: p.x, originalY: p.y })),
      bounds: { ...selection },
      transform: { rotation: 0, flipX: false, flipY: false, offsetX: 0, offsetY: 0 },
    })

    const clearedPixels = clonePixels(pixels)
    for (const p of selectedPixels) {
      clearedPixels[indexOf(p.x, p.y)] = null
    }
    pushHistory()
    setPixels(clearedPixels)

    setSelection(null)
    setSelectStart(null)
  }, [selection, pixels, pushHistory])

  const commitFloatingSelection = useCallback(() => {
    if (!floatingSelection) return
    const { pixels: floatPixels, bounds, transform } = floatingSelection

    const nextPixels = clonePixels(pixels)
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2

    for (const p of floatPixels) {
      let relX = p.originalX - centerX
      let relY = p.originalY - centerY

      if (transform.flipX) relX = -relX
      if (transform.flipY) relY = -relY

      if (transform.rotation === 90) {
        const tmp = relX
        relX = -relY
        relY = tmp
      } else if (transform.rotation === 180) {
        relX = -relX
        relY = -relY
      } else if (transform.rotation === 270) {
        const tmp = relX
        relX = relY
        relY = -tmp
      }

      const px = Math.round(centerX + relX + transform.offsetX)
      const py = Math.round(centerY + relY + transform.offsetY)

      if (px >= 0 && px < CANVAS_SIZE && py >= 0 && py < CANVAS_SIZE) {
        nextPixels[indexOf(px, py)] = p.color
      }
    }
    pushHistory()
    setPixels(nextPixels)
    setFloatingSelection(null)
    setStatus('Selection committed')
  }, [floatingSelection, pixels, pushHistory])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleNativeWheel = (event: WheelEvent) => {
      if (tool !== 'view') return

      event.preventDefault()
      const point = pointerToCanvasPoint(event)
      if (!point) return

      zoomAtPoint(point, event.deltaY > 0 ? 0.9 : 1.1)
    }

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false })

    return () => {
      canvas.removeEventListener('wheel', handleNativeWheel)
    }
  }, [pointerToCanvasPoint, tool, zoomAtPoint])

  useEffect(() => {
    if (!floatingSelection) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!floatingSelection) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setFloatingSelection((prev) =>
          prev ? { ...prev, transform: { ...prev.transform, offsetX: prev.transform.offsetX - 1 } } : prev,
        )
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setFloatingSelection((prev) =>
          prev ? { ...prev, transform: { ...prev.transform, offsetX: prev.transform.offsetX + 1 } } : prev,
        )
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setFloatingSelection((prev) =>
          prev ? { ...prev, transform: { ...prev.transform, offsetY: prev.transform.offsetY - 1 } } : prev,
        )
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFloatingSelection((prev) =>
          prev ? { ...prev, transform: { ...prev.transform, offsetY: prev.transform.offsetY + 1 } } : prev,
        )
      } else if (event.key === 'Enter') {
        event.preventDefault()
        commitFloatingSelection()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setFloatingSelection(null)
        setStatus('Selection canceled')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [floatingSelection, commitFloatingSelection])

  const undo = () => {
    setHistory((items) => {
      if (!items.length) return items

      const previous = items[items.length - 1]
      setFuture((futureItems) => [clonePixels(pixels), ...futureItems])
      setPixels(previous)
      setStatus('Undo')
      return items.slice(0, -1)
    })
  }

  const redo = () => {
    setFuture((items) => {
      if (!items.length) return items

      const next = items[0]
      setHistory((historyItems) => [...historyItems, clonePixels(pixels)])
      setPixels(next)
      setStatus('Redo')
      return items.slice(1)
    })
  }

  const clearCanvas = () => {
    pushHistory()
    setPixels(makeBlankPixels())
    setStatus('Canvas cleared')
  }

  const exportPng = () => {
    const exportCanvas = document.createElement('canvas')
    const exportSize = CANVAS_SIZE * exportScale
    exportCanvas.width = exportSize
    exportCanvas.height = exportSize
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false

    if (!exportTransparent) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, exportSize, exportSize)
    }

    pixels.forEach((pixel, index) => {
      if (!pixel) return
      ctx.fillStyle = pixel
      ctx.fillRect(
        (index % CANVAS_SIZE) * exportScale,
        Math.floor(index / CANVAS_SIZE) * exportScale,
        exportScale,
        exportScale,
      )
    })

    const link = document.createElement('a')
    link.download = `markit2d-${CANVAS_SIZE}x${CANVAS_SIZE}-${exportScale}x.png`
    link.href = exportCanvas.toDataURL('image/png')
    link.click()
    setStatus(`PNG exported at ${exportScale}x`)
  }

  const importImage = (file: File) => {
    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()

      image.onload = () => {
        const importCanvas = document.createElement('canvas')
        importCanvas.width = CANVAS_SIZE
        importCanvas.height = CANVAS_SIZE
        const ctx = importCanvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        ctx.imageSmoothingEnabled = true
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

        const scale = Math.min(CANVAS_SIZE / image.width, CANVAS_SIZE / image.height)
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const x = Math.floor((CANVAS_SIZE - width) / 2)
        const y = Math.floor((CANVAS_SIZE - height) / 2)

        ctx.drawImage(image, x, y, width, height)

        const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
        const importedPixels = makeBlankPixels()

        for (let index = 0; index < importedPixels.length; index += 1) {
          const dataIndex = index * 4
          const alpha = data[dataIndex + 3]

          if (alpha < 128) {
            importedPixels[index] = null
            continue
          }

          const red = data[dataIndex].toString(16).padStart(2, '0')
          const green = data[dataIndex + 1].toString(16).padStart(2, '0')
          const blue = data[dataIndex + 2].toString(16).padStart(2, '0')
          importedPixels[index] = `#${red}${green}${blue}`
        }

        pushHistory()
        setPixels(importedPixels)
        setStatus('Image imported')
      }

      image.src = String(reader.result)
    }

    reader.readAsDataURL(file)
  }

  const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) importImage(file)
    event.target.value = ''
  }

  const copyProjectCode = async () => {
    const code = encodeProject(pixels)
    setProjectCode(code)

    try {
      await navigator.clipboard.writeText(code)
      setStatus('Project code copied')
    } catch {
      setStatus('Project code ready to copy')
    }
  }

  const loadProjectCode = () => {
    try {
      const nextPixels = decodeProject(projectCode)
      pushHistory()
      setPixels(nextPixels)
      setStatus('Project code loaded')
    } catch {
      setStatus('That project code could not be loaded')
    }
  }


  const pinCurrentColor = () => {
    setPinnedColors((items) => {
      const normalized = color.toLowerCase()
      const nextItems = [normalized, ...items.filter((item) => item.toLowerCase() !== normalized)]

      return nextItems.slice(0, 18)
    })
    setStatus('Color pinned')
  }

  const unpinColor = (targetColor: string) => {
    setPinnedColors((items) => items.filter((item) => item.toLowerCase() !== targetColor.toLowerCase()))
    setStatus('Color unpinned')
  }

  const togglePinTool = (toolId: Tool) => {
    setPinnedTools((items) => {
      if (items.includes(toolId)) {
        setStatus(`${toolId} unpinned`)
        return items.filter((t) => t !== toolId)
      }
      if (items.length >= 5) {
        setStatus('Max 5 pins')
        return items
      }
      setStatus(`${toolId} pinned`)
      return [...items, toolId]
    })
  }

  const shadeRing = useMemo(
    () => [
      { label: 'Lighter', color: shiftColor(color, { lightness: 0.16 }) },
      { label: 'Warmer', color: shiftColor(color, { hue: -18, saturation: 0.04 }) },
      { label: 'Darker', color: shiftColor(color, { lightness: -0.16 }) },
      { label: 'Cooler', color: shiftColor(color, { hue: 18, saturation: 0.04 }) },
      { label: 'Bright', color: shiftColor(color, { saturation: 0.16, lightness: 0.06 }) },
      { label: 'Muted', color: shiftColor(color, { saturation: -0.18, lightness: -0.02 }) },
      { label: 'Deep', color: shiftColor(color, { saturation: 0.08, lightness: -0.26 }) },
      { label: 'Soft', color: shiftColor(color, { saturation: -0.1, lightness: 0.24 }) },
    ],
    [color],
  )

  const toggleMenu = (menuId: MenuId) => {
    setActiveMenu(menuId)
  }

  const renderActiveMenu = () => {
    if (activeMenu === 'tools') {
      return (
        <>
          <div className="control-group">
            <span className="label">Tools</span>
            <div className="button-grid">
              {TOOLS.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto' }}>
                  <button
                    className={tool === item.id ? 'tool-button active' : 'tool-button'}
                    onClick={() => isPinMode ? togglePinTool(item.id) : setTool(item.id)}
                    type="button"
                    style={{ flex: 1 }}
                  >
                    <span className="tool-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                  {isPinMode && (
                    <button
                      className={pinnedTools.includes(item.id) ? 'pin-btn active' : 'pin-btn'}
                      onClick={(e) => { e.stopPropagation(); togglePinTool(item.id); }}
                      title={pinnedTools.includes(item.id) ? `Unpin ${item.label}` : `Pin ${item.label}`}
                      type="button"
                    >
                      {pinnedTools.includes(item.id) ? '★' : '☆'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="control-group">
              <button
                className={isPinMode ? 'tool-button active' : 'tool-button'}
                onClick={() => setIsPinMode(!isPinMode)}
                type="button"
              >
                <span className="tool-icon" aria-hidden="true">{isPinMode ? '✓' : '⌘'}</span>
                <span>{isPinMode ? 'Exit pin mode' : 'Pin mode'}</span>
              </button>
            </div>
          </div>

          <div className="control-group">
            <span className="label">Brush</span>
            <div className="segmented">
              {BRUSH_PRESETS.map((preset) => (
                <button
                  className={brushSize === preset ? 'active' : ''}
                  key={preset}
                  onClick={() => setBrushSize(preset)}
                  type="button"
                >
                  {preset}x{preset}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <span className="label">View</span>
            <button
              onClick={() => {
                setViewport({ zoom: 1, panX: 0, panY: 0 })
                setStatus('View reset')
              }}
              type="button"
            >
              Reset view
            </button>
          </div>
        </>
      )
    }

    if (activeMenu === 'grid') {
      return (
        <div className="control-group">
          <span className="label">Grid</span>
          <div className="segmented">
            {GRID_PRESETS.map((preset) => (
              <button
                className={gridSize === preset ? 'active' : ''}
                key={preset}
                onClick={() => setGridSize(preset)}
                type="button"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (activeMenu === 'color') {
      return (
        <>
         <div className="current-color-card">
  <button
    aria-label={`Use current color ${color}`}
    className="current-swatch"
    style={{ backgroundColor: color }}
    type="button"
  />

  <div>
    <strong>{color.toUpperCase()}</strong>


    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
      <button onClick={pinCurrentColor} type="button">
        Pin color
      </button>

      <button
        onClick={() => unpinColor(color)}
        onContextMenu={(event) => {
          event.preventDefault()
          unpinColor(color)
        }}
        type="button"
      >

        Unpin color 

        Unpin color

      </button>
    </div>
  </div>
</div>


          <div className="control-group">
            <span className="label">Pinned</span>
            <div className="palette">
             {pinnedColors.map((swatch) => (
  <div key={swatch} className="swatch-row">
    <button
      aria-label={`Use pinned ${swatch}`}
      className={color.toLowerCase() === swatch.toLowerCase() ? 'swatch active' : 'swatch'}
      onClick={() => selectColor(swatch)}
       onContextMenu={(event) => {
                    event.preventDefault()
                    selectColor(swatch)
                    unpinColor(swatch)
                  }}
      style={{ backgroundColor: swatch }}
      title="Tap to use, right-click to unpin"
      type="button"
    />

  
  </div>
))}

            </div>
            
          </div>

          <div className="control-group">
            <span className="label">Shade ring</span>
            <div className="shade-ring">
              {shadeRing.map((shade, index) => (
                <button
                  aria-label={`Use ${shade.label} ${shade.color}`}
                  className={`shade-swatch shade-${index}`}
                  key={`${shade.label}-${shade.color}`}
                  onClick={() => selectColor(shade.color)}
                  style={{ backgroundColor: shade.color }}
                  title={shade.label}
                  type="button"
                />
              ))}
              <button
                aria-label={`Use base ${color}`}
                className="shade-center"
                onClick={() => selectColor(color)}
                style={{ backgroundColor: color }}
                type="button"
              />
            </div>
          </div>

          <div className="control-group">
            <span className="label">Preset palette</span>
            <div className="palette">
              {PALETTE.map((swatch) => (
                <button
                  aria-label={`Use ${swatch}`}
                  className={color === swatch ? 'swatch active' : 'swatch'}
                  key={swatch}
                  onClick={() => selectColor(swatch)}
                  style={{ backgroundColor: swatch }}
                  type="button"
                />
              ))}
            </div>
          </div>

          <label className="color-field">
            <span>Custom</span>
            <input
              onChange={(event) => handleCustomColorChange(event.target.value)}
              type="color"
              value={customColor}
            />
          </label>
        </>
      )
    }

    return (
      <>
        <div className="control-group">
          <span className="label">Export</span>
          <div className="segmented">
            {EXPORT_SCALES.map((preset) => (
              <button
                className={exportScale === preset ? 'active' : ''}
                key={preset}
                onClick={() => setExportScale(preset)}
                type="button"
              >
                {preset}x
              </button>
            ))}
          </div>
          <label className="toggle-field">
            <input
              checked={exportTransparent}
              onChange={(event) => setExportTransparent(event.target.checked)}
              type="checkbox"
            />
            <span>Transparent PNG</span>
          </label>
          <button onClick={exportPng} type="button">
            Download PNG
          </button>
        </div>

        <div className="control-group">
          <span className="label">Import</span>
          <input
            accept="image/*"
            className="hidden-input"
            onChange={handleImportChange}
            ref={importInputRef}
            type="file"
          />
          <button onClick={() => importInputRef.current?.click()} type="button">
            Import image
          </button>
          <button onClick={copyProjectCode} type="button">
            Copy project code
          </button>
        </div>

        <div className="control-group project-code">
          <label className="label" htmlFor="project-code">
            Load code
          </label>
          <textarea
            id="project-code"
            onChange={(event) => setProjectCode(event.target.value)}
            placeholder="Paste a PGS2 project code"
            value={projectCode}
          />
          <button onClick={loadProjectCode} type="button">
            Load project
          </button>
        </div>

        <div className="control-group">
          <button className="danger" onClick={clearCanvas} type="button">
            Clear canvas
          </button>
        </div>
      </>
    )
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Prototype</p>
          <h1>Pixel Grid Studio</h1>
        </div>
        <div className="status">{status}</div>
      </section>

      <section className="workspace">
        <section className="canvas-stage" aria-label="Pixel canvas">
          <canvas
            aria-label="Drawing surface"
            className={
              tool === 'view'
                ? 'pixel-canvas view-mode'
                : tool === 'eyedropper'
                ? 'pixel-canvas eyedropper-mode'
                : 'pixel-canvas'
            }
            height={VIEW_SIZE}
            onPointerCancel={stopDrawing}
            onPointerDown={handlePointerDown}
            onPointerLeave={stopDrawing}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            ref={canvasRef}
            width={VIEW_SIZE}
          />
        </section>
      </section>

      <div className="quick-controls" aria-label="Quick controls">
        <button
          aria-expanded={isMenuOpen}
          className="menu-toggle"
          onClick={() => setIsMenuOpen((open) => !open)}
          title="Menu"
          type="button"
        >
          Menu
        </button>
        <button disabled={!history.length} onClick={undo} title="Undo" type="button">
          Undo
        </button>
        <button disabled={!future.length} onClick={redo} title="Redo" type="button">
          Redo
        </button>
      </div>

      <div className="quick-pins" aria-label="Pinned tools">
        {pinnedTools.map((toolId) => {
          const toolDef = TOOLS.find((t) => t.id === toolId)
          return toolDef ? (
            <button
              key={toolId}
              className={`quick-pin ${tool === toolId ? 'active' : ''}`}
              onClick={() => setTool(toolId)}
              title={toolDef.label}
              type="button"
            >
              <span className="tool-icon" aria-hidden="true">{toolDef.icon}</span>
            </button>
          ) : null
        })}
        <button
          className="quick-pin color-pin"
          onClick={() => {
            toggleMenu('color')
            setIsMenuOpen((open) => !open)
          }}
          title="Colors"
          type="button"
        >
          <span className="tool-icon" aria-hidden="true" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316, #facc15, #22c55e, #14b8a6, #38bdf8, #6366f1, #ec4899)' }}>C</span>
        </button>
        {floatingSelection && (
          <>
            <button className="quick-pin" onClick={commitFloatingSelection} title="Commit (Enter)" type="button">
              <span className="tool-icon" aria-hidden="true">✓</span>
            </button>
            <button className="quick-pin" onClick={() => { setFloatingSelection(null); setStatus('Canceled') }} title="Cancel (Esc)" type="button">
              <span className="tool-icon" aria-hidden="true">✕</span>
            </button>
            <button
              className="quick-pin"
              onClick={() => setFloatingSelection((prev) => prev ? { ...prev, transform: { ...prev.transform, flipX: !prev.transform.flipX } } : prev)}
              title="Flip H"
              type="button"
            >
              <span className="tool-icon" aria-hidden="true">⇔</span>
            </button>
            <button
              className="quick-pin"
              onClick={() => setFloatingSelection((prev) => prev ? { ...prev, transform: { ...prev.transform, flipY: !prev.transform.flipY } } : prev)}
              title="Flip V"
              type="button"
            >
              <span className="tool-icon" aria-hidden="true">⇕</span>
            </button>
            <button
              className="quick-pin"
              onClick={() => setFloatingSelection((prev) => prev ? { ...prev, transform: { ...prev.transform, rotation: (prev.transform.rotation + 90) % 360 } } : prev)}
              title="Rotate 90°"
              type="button"
            >
              <span className="tool-icon" aria-hidden="true">↻</span>
            </button>
          </>
        )}
      </div>

      <aside className={isMenuOpen ? 'side-menu open' : 'side-menu'} aria-hidden={!isMenuOpen}>
        <div className="side-menu-header">
          <span className="label">Menu</span>
          <button className="menu-close" onClick={() => setIsMenuOpen(false)} type="button">
            Hide
          </button>
        </div>
        <nav className="menu-tabs" aria-label="Editor menu sections">
          {MENUS.map((item) => (
            <button
              aria-label={item.label}
              className={activeMenu === item.id ? 'menu-tab active' : 'menu-tab'}
              key={item.id}
              onClick={() => toggleMenu(item.id)}
              title={item.label}
              type="button"
            >
              
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-menu-content">{renderActiveMenu()}</div>
      </aside>
    </main>
  )
}

export default App
