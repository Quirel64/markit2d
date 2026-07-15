import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

import type { Tool, Pixel, MenuId, Viewport, PointerPoint, GestureState, FloatingSelection, ShapeType, ProjectMeta } from './types'
import {
  CANVAS_SIZE,
  VIEW_SIZE,
  GRID_PRESETS,
  BRUSH_PRESETS,
  EXPORT_SCALES,
  TOOLS,
  MENUS,
  STORAGE_KEY,
  PINNED_COLORS_KEY,
  PINNED_TOOLS_KEY,
  PALETTE,
  SHAPE_PRESETS,
  PROJECT_PREFIX,
} from './constants'
import { makeBlankPixels, clonePixels, indexOf, clamp } from './utils/canvas'
import { clampViewport, getDistance, getCenter } from './utils/viewport'
import { hexToRgb, shiftColor } from './utils/color'
import { encodeProject, decodeProject, listProjects, loadProject, saveProject, deleteProject, createProject, updateProject, isCanvasBlank } from './utils/project'
import { findPixelPath } from './utils/pathfinding'

const PREVIEW_SIZE = 48

function ProjectPreview({ projectId }: { projectId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)

    const raw = window.localStorage.getItem(PROJECT_PREFIX + projectId)
    if (!raw) return

    try {
      const pixels = decodeProject(raw)
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
      ctx.drawImage(artCanvas, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
    } catch {
      ctx.fillStyle = '#e2e8f0'
      ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
    }
  }, [projectId])

  return <canvas ref={canvasRef} className="project-preview" height={PREVIEW_SIZE} width={PREVIEW_SIZE} />
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

      return parsed.filter((item): item is Tool =>
        ['view', 'pencil', 'eraser', 'fill', 'eyedropper', 'select', 'path', 'shape'].includes(item),
      )
    } catch {
      return ['pencil', 'eraser', 'fill']
    }
  })
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [floatingSelection, setFloatingSelection] = useState<FloatingSelection | null>(null)
  const [clipboard, setClipboard] = useState<FloatingSelection | null>(null)
  const [selectStart, setSelectStart] = useState<{ x: number; y: number } | null>(null)
  const [pathStart, setPathStart] = useState<PointerPoint | null>(null)
  const [previewPath, setPreviewPath] = useState<PointerPoint[]>([])
  const [pathAllowDiagonal, setPathAllowDiagonal] = useState(false)
  const [pathCanCrossColors, setPathCanCrossColors] = useState(false)
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle')
  const [shapeStart, setShapeStart] = useState<PointerPoint | null>(null)
  const [previewShape, setPreviewShape] = useState<PointerPoint[]>([])
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'projects' | 'import-export'>('projects')
  const [isPinMode, setIsPinMode] = useState(false)
  const [isQuickPinsOpen, setIsQuickPinsOpen] = useState(true)
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [showGridLines, setShowGridLines] = useState(true)
  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects())
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const blockSize = useMemo(() => CANVAS_SIZE / gridSize, [gridSize])

  const isPathCellBlocked = useCallback(
    (point: PointerPoint, sourcePixels: Pixel[] = pixels) => {
      if (pathCanCrossColors) return false

      const startX = point.x * blockSize
      const startY = point.y * blockSize

      for (let y = startY; y < startY + blockSize; y += 1) {
        for (let x = startX; x < startX + blockSize; x += 1) {
          if (sourcePixels[indexOf(x, y)] !== null) return true
        }
      }

      return false
    },
    [blockSize, pathCanCrossColors, pixels],
  )

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
    if (tool === 'path') return

    //setPathStart(null)
   // setPreviewPath([])
  }, [tool])

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

    if (tool === 'path' && (previewPath.length || pathStart)) {
      const cellScale = VIEW_SIZE / gridSize
      const previewColor = hexToRgb(color)

      ctx.save()
      ctx.fillStyle = `rgba(${previewColor.red}, ${previewColor.green}, ${previewColor.blue}, 0.58)`

      for (const point of previewPath) {
        ctx.fillRect(point.x * cellScale, point.y * cellScale, cellScale, cellScale)
      }

      if (pathStart) {
        ctx.strokeStyle = '#0f766e'
        ctx.lineWidth = 2 / viewport.zoom
        ctx.strokeRect(pathStart.x * cellScale, pathStart.y * cellScale, cellScale, cellScale)
      }

      ctx.restore()
    }

    if (tool === 'shape' && (previewShape.length || shapeStart)) {
      const cellScale = VIEW_SIZE / gridSize
      const previewColor = hexToRgb(color)

      ctx.save()
      ctx.fillStyle = `rgba(${previewColor.red}, ${previewColor.green}, ${previewColor.blue}, 0.58)`

      for (const point of previewShape) {
        ctx.fillRect(point.x * cellScale, point.y * cellScale, cellScale, cellScale)
      }

      if (shapeStart) {
        ctx.strokeStyle = '#0f766e'
        ctx.lineWidth = 2 / viewport.zoom
        ctx.strokeRect(shapeStart.x * cellScale, shapeStart.y * cellScale, cellScale, cellScale)
      }

      ctx.restore()
    }

    if (showGridLines) {
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
    }

    ctx.restore()
  }, [color, gridSize, pathStart, pixels, previewPath, previewShape, showGridLines, shapeStart, tool, viewport, floatingSelection, selection])

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
      const nextZoom = clamp(current.zoom * zoomFactor, 1, 16)
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

  const paintGridCell = useCallback(
    (nextPixels: Pixel[], cellX: number, cellY: number, nextColor: Pixel) => {
      const startX = cellX * blockSize
      const startY = cellY * blockSize

      for (let y = startY; y < startY + blockSize; y += 1) {
        for (let x = startX; x < startX + blockSize; x += 1) {
          nextPixels[indexOf(x, y)] = nextColor
        }
      }
    },
    [blockSize],
  )

  const getShapeCells = useCallback(
    (start: PointerPoint, end: PointerPoint, type: ShapeType): PointerPoint[] => {
      const minX = Math.min(start.x, end.x)
      const maxX = Math.max(start.x, end.x)
      const minY = Math.min(start.y, end.y)
      const maxY = Math.max(start.y, end.y)

      if (type === 'rectangle') {
        const cells: PointerPoint[] = []
        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            const isEdge = x === minX || x === maxX || y === minY || y === maxY
            if (isEdge) cells.push({ x, y })
          }
        }
        return cells
      }

      if (type === 'circle') {
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        const radiusX = (maxX - minX) / 2
        const radiusY = (maxY - minY) / 2
        const radius = Math.max(radiusX, radiusY)
        const cells: PointerPoint[] = []
        const visited = new Set<string>()

        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            const dx = (x - centerX) / (radius || 1)
            const dy = (y - centerY) / (radius || 1)
            const dist = dx * dx + dy * dy
            const isEdge = dist >= 0.64 && dist <= 1.44
            if (isEdge) {
              const key = `${x}:${y}`
              if (!visited.has(key)) {
                visited.add(key)
                cells.push({ x, y })
              }
            }
          }
        }
        return cells
      }

      if (type === 'line') {
        const cells: PointerPoint[] = []
        const dx = Math.abs(end.x - start.x)
        const dy = Math.abs(end.y - start.y)
        const sx = start.x < end.x ? 1 : -1
        const sy = start.y < end.y ? 1 : -1
        let err = dx - dy
        let cx = start.x
        let cy = start.y

        while (true) {
          cells.push({ x: cx, y: cy })
          if (cx === end.x && cy === end.y) break
          const e2 = 2 * err
          if (e2 > -dy) {
            err -= dy
            cx += sx
          }
          if (e2 < dx) {
            err += dx
            cy += sy
          }
        }
        return cells
      }

      return []
    },
    [],
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

      if (tool === 'path') {
        return
      }

      if (tool === 'shape') {
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
        const nextZoom = clamp(current.zoom * distanceScale, 1, 16)
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

    if (tool === 'path') {
      const point = pointToCell(event)
      if (!point) return

      isDrawingRef.current = true
      const start = { x: point.cellX, y: point.cellY }
      setPathStart(start)
      setPreviewPath([start])
      setStatus('Path start set')
      return
    }

    if (tool === 'shape') {
      const point = pointToCell(event)
      if (!point) return

      isDrawingRef.current = true
      const start = { x: point.cellX, y: point.cellY }
      setShapeStart(start)
      setPreviewShape([start])
      setStatus('Shape start set')
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

    if (tool === 'path') {
      if (!isDrawingRef.current || !pathStart) return

      const point = pointToCell(event)
      if (!point) return

      const end = { x: point.cellX, y: point.cellY }
      const path = findPixelPath({
        start: pathStart,
        end,
        width: gridSize,
        height: gridSize,
        allowDiagonal: pathAllowDiagonal,
        isBlocked: (pathPoint) => isPathCellBlocked(pathPoint),
      })
      setPreviewPath(path)
      if (!path.length) setStatus('No open path')
      return
    }

    if (tool === 'shape') {
      if (!isDrawingRef.current || !shapeStart) return

      const point = pointToCell(event)
      if (!point) return

      const end = { x: point.cellX, y: point.cellY }
      const cells = getShapeCells(shapeStart, end, shapeType)
      setPreviewShape(cells)
      setStatus(`Shape: ${cells.length} cells`)
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

    if (tool === 'path' && isDrawingRef.current) {
      isDrawingRef.current = false

      if (previewPath.length) {
        pushHistory()
        setPixels((current) => {
          const nextPixels = clonePixels(current)
          for (const point of previewPath) {
            paintGridCell(nextPixels, point.x, point.y, color)
          }
          return nextPixels
        })
        setStatus(`Path drawn (${previewPath.length} cells)`)
      } else {
        setStatus('No open path')
      }

      setPathStart(null)
      setPreviewPath([])
      return
    }

    if (tool === 'shape' && isDrawingRef.current) {
      isDrawingRef.current = false

      if (previewShape.length) {
        pushHistory()
        setPixels((current) => {
          const nextPixels = clonePixels(current)
          for (const point of previewShape) {
            paintGridCell(nextPixels, point.x, point.y, color)
          }
          return nextPixels
        })
        setStatus(`Shape drawn (${previewShape.length} cells)`)
      } else {
        setStatus('No shape drawn')
      }

      setShapeStart(null)
      setPreviewShape([])
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

  const copySelection = useCallback(() => {
    if (!floatingSelection) return
    setClipboard({ ...floatingSelection })
    setStatus('Copied to clipboard')
  }, [floatingSelection])

  const cutSelection = useCallback(() => {
    if (!floatingSelection) return
    setClipboard({ ...floatingSelection })
    setFloatingSelection(null)
    setStatus('Cut to clipboard')
  }, [floatingSelection])

  const pasteClipboard = useCallback(() => {
    if (!clipboard) return
    setFloatingSelection({
      ...clipboard,
      transform: { rotation: 0, flipX: false, flipY: false, offsetX: 2, offsetY: 2 },
    })
    setTool('select')
    setStatus('Pasted from clipboard')
  }, [clipboard])

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

      const isCtrl = event.ctrlKey || event.metaKey

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
      } else if (isCtrl && event.key === 'c') {
        event.preventDefault()
        copySelection()
      } else if (isCtrl && event.key === 'x') {
        event.preventDefault()
        cutSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [floatingSelection, commitFloatingSelection, copySelection, cutSelection])

  useEffect(() => {
    const handlePaste = (event: KeyboardEvent) => {
      const isCtrl = event.ctrlKey || event.metaKey
      if (isCtrl && event.key === 'v' && clipboard && !floatingSelection) {
        event.preventDefault()
        pasteClipboard()
      }
    }

    window.addEventListener('keydown', handlePaste)
    return () => window.removeEventListener('keydown', handlePaste)
  }, [clipboard, floatingSelection, pasteClipboard])

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
    if (!isCanvasBlank(pixels) && !window.confirm('This will clear the canvas. Unsaved changes will be lost.')) return
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

  const refreshProjects = () => setProjects(listProjects())

  const saveCurrentAsProject = () => {
    const name = newProjectName.trim() || `Project ${projects.length + 1}`
    const meta = createProject(name, pixels)
    if (meta) {
      setActiveProjectId(meta.id)
      setNewProjectName('')
      refreshProjects()
      setStatus(`Saved as "${meta.name}"`)
    } else {
      setStatus('Cannot save empty canvas')
    }
  }

  const loadSavedProject = (id: string) => {
    if (!isCanvasBlank(pixels) && !window.confirm('Unsaved changes will be saved automatically before switching.')) return
    if (!isCanvasBlank(pixels) && activeProjectId) {
      saveProject(activeProjectId, pixels)
    }
    const loaded = loadProject(id)
    if (loaded) {
      pushHistory()
      setPixels(loaded)
      setActiveProjectId(id)
      refreshProjects()
      setStatus('Project loaded')
    } else {
      setStatus('Failed to load project')
    }
  }

  const startRenameProject = (id: string, currentName: string) => {
    setEditingProjectId(id)
    setEditingName(currentName)
  }

  const confirmRenameProject = () => {
    if (!editingProjectId) return
    const name = editingName.trim() || 'Untitled'
    updateProject(editingProjectId, name, pixels)
    setEditingProjectId(null)
    setEditingName('')
    refreshProjects()
    setStatus('Project renamed')
  }

  const removeProject = (id: string) => {
    if (!window.confirm('Delete this project permanently?')) return
    deleteProject(id)
    if (activeProjectId === id) setActiveProjectId(null)
    refreshProjects()
    setStatus('Project deleted')
  }

  const startNewProject = () => {
    if (!isCanvasBlank(pixels) && !window.confirm('Unsaved changes will be saved automatically before starting a new project.')) return
    if (!isCanvasBlank(pixels) && activeProjectId) {
      saveProject(activeProjectId, pixels)
    }
    pushHistory()
    setPixels(makeBlankPixels())
    setActiveProjectId(null)
    refreshProjects()
    setStatus('New project started')
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

          {tool === 'path' && (
            <div className="control-group path-options">
              <span className="label">Path</span>
              <div className="segmented two-up">
                <button
                  className={!pathAllowDiagonal ? 'active' : ''}
                  onClick={() => setPathAllowDiagonal(false)}
                  type="button"
                >
                  Straight
                </button>
                <button
                  className={pathAllowDiagonal ? 'active' : ''}
                  onClick={() => setPathAllowDiagonal(true)}
                  type="button"
                >
                  Diagonal
                </button>
              </div>
              <label className="toggle-field">
                <input
                  checked={pathCanCrossColors}
                  onChange={(event) => setPathCanCrossColors(event.target.checked)}
                  type="checkbox"
                />
                <span>Cross colored cells</span>
              </label>
            </div>
          )}

          {tool === 'shape' && (
            <div className="control-group shape-options">
              <span className="label">Shape</span>
              <div className="segmented three-up">
                {SHAPE_PRESETS.map((preset) => (
                  <button
                    className={shapeType === preset.id ? 'active' : ''}
                    key={preset.id}
                    onClick={() => setShapeType(preset.id)}
                    type="button"
                  >
                    <span className="tool-icon" aria-hidden="true">{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
        <>
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
          <div className="control-group">
            <label className="toggle-field">
              <input
                checked={showGridLines}
                onChange={(event) => setShowGridLines(event.target.checked)}
                type="checkbox"
              />
              <span>Show grid lines</span>
            </label>
          </div>
        </>
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

    return null
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="topbar-left">
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
        <div className="topbar-right">
          <span className="topbar-status">{status}</span>
          <button
            className={isSettingsOpen ? 'settings-btn active' : 'settings-btn'}
            onClick={() => setIsSettingsOpen((open) => !open)}
            title="Settings"
            type="button"
          >
            ⚙
          </button>
        </div>
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
                : tool === 'path'
                ? 'pixel-canvas path-mode'
                : tool === 'shape'
                ? 'pixel-canvas shape-mode'
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

      <div className={isQuickPinsOpen ? 'quick-pins' : 'quick-pins collapsed'}>
        <button
          className="quick-pins-toggle"
          onClick={() => setIsQuickPinsOpen((open) => !open)}
          title={isQuickPinsOpen ? 'Collapse toolbar' : 'Expand toolbar'}
          type="button"
        >
          {isQuickPinsOpen ? '▼' : '▲'}
        </button>
        {isQuickPinsOpen && (
          <>
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
            {clipboard && (
              <button className="quick-pin" onClick={pasteClipboard} title="Paste (Ctrl+V)" type="button">
                <span className="tool-icon" aria-hidden="true">📋</span>
              </button>
            )}
          </>
        )}
      </div>

      {floatingSelection && (
        <div className="selection-bar" aria-label="Selection controls">
          <button className="quick-pin" onClick={commitFloatingSelection} title="Commit (Enter)" type="button">
            <span className="tool-icon" aria-hidden="true">✓</span>
          </button>
          <button className="quick-pin" onClick={() => { setFloatingSelection(null); setStatus('Canceled') }} title="Cancel (Esc)" type="button">
            <span className="tool-icon" aria-hidden="true">✕</span>
          </button>
          <button className="quick-pin" onClick={copySelection} title="Copy (Ctrl+C)" type="button">
            <span className="tool-icon" aria-hidden="true">📄</span>
          </button>
          <button className="quick-pin" onClick={cutSelection} title="Cut (Ctrl+X)" type="button">
            <span className="tool-icon" aria-hidden="true">✂️</span>
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
        </div>
      )}

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
              <span className="menu-tab-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-menu-content">{renderActiveMenu()}</div>
      </aside>

      <aside className={isSettingsOpen ? 'settings-menu open' : 'settings-menu'} aria-hidden={!isSettingsOpen}>
        <div className="side-menu-header">
          <span className="label">Settings</span>
          <button className="menu-close" onClick={() => setIsSettingsOpen(false)} type="button">
            Hide
          </button>
        </div>
        <nav className="menu-tabs settings-tabs" aria-label="Settings sections">
          <button
            className={settingsTab === 'projects' ? 'menu-tab active' : 'menu-tab'}
            onClick={() => setSettingsTab('projects')}
            type="button"
          >
            <span className="menu-tab-icon" aria-hidden="true">📁</span>
            <span>Projects</span>
          </button>
          <button
            className={settingsTab === 'import-export' ? 'menu-tab active' : 'menu-tab'}
            onClick={() => setSettingsTab('import-export')}
            type="button"
          >
            <span className="menu-tab-icon" aria-hidden="true">✈</span>
            <span>Import / Export</span>
          </button>
        </nav>
        <div className="side-menu-content">
          {settingsTab === 'projects' && (
            <>
              <div className="control-group">
                <span className="label">Projects</span>
                <div className="new-project-row">
                  <input
                    className="project-name-input"
                    onChange={(event) => setNewProjectName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') saveCurrentAsProject() }}
                    placeholder="Project name..."
                    type="text"
                    value={newProjectName}
                  />
                  <button onClick={saveCurrentAsProject} type="button">
                    Save
                  </button>
                </div>
                <button onClick={startNewProject} type="button">
                  New project
                </button>
              </div>

              {projects.length > 0 && (
                <div className="control-group">
                  <span className="label">Saved ({projects.length})</span>
                  <div className="project-list">
                    {projects.map((project) => (
                      <div
                        className={activeProjectId === project.id ? 'project-item active' : 'project-item'}
                        key={project.id}
                      >
                        <ProjectPreview projectId={project.id} />
                        <div className="project-item-info">
                          {editingProjectId === project.id ? (
                            <input
                              className="project-edit-input"
                              autoFocus
                              onChange={(event) => setEditingName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') confirmRenameProject()
                                if (event.key === 'Escape') { setEditingProjectId(null); setEditingName('') }
                              }}
                              onBlur={confirmRenameProject}
                              value={editingName}
                            />
                          ) : (
                            <span className="project-item-name">{project.name}</span>
                          )}
                          <span className="project-item-date">
                            {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="project-item-actions">
                          <button className="project-action-btn" onClick={() => loadSavedProject(project.id)} title="Load" type="button">
                            ↑
                          </button>
                          <button
                            className="project-action-btn"
                            onClick={() => startRenameProject(project.id, project.name)}
                            title="Rename"
                            type="button"
                          >
                            ✎
                          </button>
                          <button className="project-action-btn danger" onClick={() => removeProject(project.id)} title="Delete" type="button">
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {settingsTab === 'import-export' && (
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
          )}
        </div>
      </aside>
    </main>
  )
}

export default App
