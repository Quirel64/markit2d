import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Tool = 'pencil' | 'eraser' | 'fill'
type Pixel = string | null

type ProjectPayload = {
  version: 1
  width: number
  height: number
  pixels: Pixel[]
}

const CANVAS_SIZE = 64
const VIEW_SIZE = 768
const GRID_PRESETS = [8, 16, 32, 64]
const BRUSH_PRESETS = [1, 3, 5]
const STORAGE_KEY = 'pixel-grid-studio-draft'
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

const encodeProject = (pixels: Pixel[]) => {
  const payload: ProjectPayload = {
    version: 1,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    pixels,
  }

  return `PGS1:${btoa(JSON.stringify(payload))}`
}

const decodeProject = (code: string) => {
  const trimmed = code.trim()
  const encoded = trimmed.startsWith('PGS1:') ? trimmed.slice(5) : trimmed
  const payload = JSON.parse(atob(encoded)) as ProjectPayload

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

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const lastPaintedRef = useRef<string | null>(null)

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
  const [gridSize, setGridSize] = useState(32)
  const [brushSize, setBrushSize] = useState(1)
  const [history, setHistory] = useState<Pixel[][]>([])
  const [future, setFuture] = useState<Pixel[][]>([])
  const [projectCode, setProjectCode] = useState('')
  const [status, setStatus] = useState('Ready')

  const blockSize = useMemo(() => CANVAS_SIZE / gridSize, [gridSize])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, encodeProject(pixels))
  }, [pixels])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = VIEW_SIZE / CANVAS_SIZE
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE)

    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, VIEW_SIZE, VIEW_SIZE)

    for (let y = 0; y < CANVAS_SIZE; y += 1) {
      for (let x = 0; x < CANVAS_SIZE; x += 1) {
        const fill = pixels[indexOf(x, y)]
        if (fill) {
          ctx.fillStyle = fill
          ctx.fillRect(x * scale, y * scale, scale, scale)
        }
      }
    }

    const gridStep = VIEW_SIZE / gridSize
    ctx.strokeStyle = gridSize >= 64 ? 'rgba(15, 23, 42, 0.14)' : 'rgba(15, 23, 42, 0.2)'
    ctx.lineWidth = 1

    for (let line = 0; line <= gridSize; line += 1) {
      const pos = Math.round(line * gridStep) + 0.5
      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, VIEW_SIZE)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, pos)
      ctx.lineTo(VIEW_SIZE, pos)
      ctx.stroke()
    }
  }, [gridSize, pixels])

  const pushHistory = useCallback(() => {
    setHistory((items) => [...items.slice(-39), clonePixels(pixels)])
    setFuture([])
  }, [pixels])

  const pointToCell = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const rawX = Math.floor(((event.clientX - rect.left) / rect.width) * CANVAS_SIZE)
    const rawY = Math.floor(((event.clientY - rect.top) / rect.height) * CANVAS_SIZE)
    const x = Math.min(CANVAS_SIZE - 1, Math.max(0, rawX))
    const y = Math.min(CANVAS_SIZE - 1, Math.max(0, rawY))
    const cellX = Math.floor(x / blockSize)
    const cellY = Math.floor(y / blockSize)

    return { cellX, cellY, x: cellX * blockSize, y: cellY * blockSize }
  }, [blockSize])

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
      const point = pointToCell(event)
      if (!point) return

      if (tool === 'fill') {
        floodFill(point.x, point.y, color)
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
    [brushSize, color, floodFill, gridSize, paintBlock, pointToCell, tool],
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    isDrawingRef.current = true
    lastPaintedRef.current = null

    if (tool !== 'fill') pushHistory()
    applyTool(event)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || tool === 'fill') return
    applyTool(event)
  }

  const stopDrawing = () => {
    isDrawingRef.current = false
    lastPaintedRef.current = null
  }

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
    exportCanvas.width = CANVAS_SIZE
    exportCanvas.height = CANVAS_SIZE
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) return

    pixels.forEach((pixel, index) => {
      if (!pixel) return
      ctx.fillStyle = pixel
      ctx.fillRect(index % CANVAS_SIZE, Math.floor(index / CANVAS_SIZE), 1, 1)
    })

    const link = document.createElement('a')
    link.download = 'pixel-art.png'
    link.href = exportCanvas.toDataURL('image/png')
    link.click()
    setStatus('PNG exported')
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

  const handleCustomColorChange = (nextColor: string) => {
    setCustomColor(nextColor)
    setColor(nextColor)
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
        <aside className="panel tools-panel" aria-label="Tools">
          <div className="control-group">
            <span className="label">Tools</span>
            <div className="button-grid">
              {(['pencil', 'eraser', 'fill'] as Tool[]).map((item) => (
                <button
                  className={tool === item ? 'tool-button active' : 'tool-button'}
                  key={item}
                  onClick={() => setTool(item)}
                  type="button"
                >
                  <span className="tool-icon" aria-hidden="true">
                    {item === 'pencil' ? 'P' : item === 'eraser' ? 'E' : 'F'}
                  </span>
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </div>

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
            <span className="label">Colors</span>
            <div className="palette">
              {PALETTE.map((swatch) => (
                <button
                  aria-label={`Use ${swatch}`}
                  className={color === swatch ? 'swatch active' : 'swatch'}
                  key={swatch}
                  onClick={() => setColor(swatch)}
                  style={{ backgroundColor: swatch }}
                  type="button"
                />
              ))}
            </div>
            <label className="color-field">
              <span>Custom</span>
              <input
                onChange={(event) => handleCustomColorChange(event.target.value)}
                type="color"
                value={customColor}
              />
            </label>
          </div>
        </aside>

        <section className="canvas-stage" aria-label="Pixel canvas">
          <canvas
            aria-label="Drawing surface"
            className="pixel-canvas"
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

        <aside className="panel actions-panel" aria-label="Project actions">
          <div className="control-group">
            <span className="label">History</span>
            <div className="action-row">
              <button disabled={!history.length} onClick={undo} type="button">
                Undo
              </button>
              <button disabled={!future.length} onClick={redo} type="button">
                Redo
              </button>
            </div>
          </div>

          <div className="control-group">
            <span className="label">Export</span>
            <button onClick={exportPng} type="button">
              Download PNG
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
              placeholder="Paste a PGS1 project code"
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
        </aside>
      </section>
    </main>
  )
}

export default App
