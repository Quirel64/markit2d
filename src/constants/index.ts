import type { Tool, MenuId, ShapeType } from '../types'

export const CANVAS_SIZE = 128
export const VIEW_SIZE = 768
export const MIN_ZOOM = 1
export const MAX_ZOOM = 16
export const GRID_PRESETS = [8, 16, 32, 64, 128]
export const BRUSH_PRESETS = [1, 3, 5]
export const EXPORT_SCALES = [1, 4, 8, 16]

export const TOOLS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: 'view', icon: '🔍', label: 'view' },
  { id: 'pencil', icon: '✏️', label: 'pencil' },
  { id: 'eraser', icon: '🧽', label: 'eraser' },
  { id: 'fill', icon: '🪣', label: 'fill' },
  { id: 'eyedropper', icon: '💧', label: 'eyedropper' },
  { id: 'select', icon: '⛶', label: 'select' },
  { id: 'path', icon: 'P', label: 'path' },
  { id: 'shape', icon: '□', label: 'shape' },
]

export const SHAPE_PRESETS: Array<{ id: ShapeType; icon: string; label: string }> = [
  { id: 'rectangle', icon: '□', label: 'Rect' },
  { id: 'circle', icon: '○', label: 'Circle' },
  { id: 'line', icon: '╱', label: 'Line' },
]

export const MENUS: Array<{ id: MenuId; icon: string; label: string }> = [
  { id: 'tools', icon: '✎', label: 'Tools' },
  { id: 'grid', icon: '▦', label: 'Grid' },
  { id: 'color', icon: '◉', label: 'Color' },
]

export const STORAGE_KEY = 'pixel-grid-studio-draft'
export const PINNED_COLORS_KEY = 'pixel-grid-studio-pinned-colors'
export const PINNED_TOOLS_KEY = 'pixel-grid-studio-pinned-tools'
export const PROJECTS_INDEX_KEY = 'pixel-grid-studio-projects'
export const PROJECT_PREFIX = 'pixel-grid-studio-project-'

export const PALETTE = [
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
