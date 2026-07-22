import type { Tool, MenuId, ShapeType, Palette } from '../types'

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
export const HIDDEN_BUILTINS_KEY = 'pixel-grid-studio-hidden-builtins'

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

export const PALETTES_KEY = 'pixel-grid-studio-palettes'
export const ACTIVE_PALETTE_KEY = 'pixel-grid-studio-active-palette'

export const DEFAULT_PALETTES: Palette[] = [
  {
    id: 'starter',
    name: 'Starter',
    colors: [...PALETTE],
    builtIn: true,
  },
  {
    id: 'gameboy',
    name: 'Gameboy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    builtIn: true,
  },
  {
    id: 'pico8',
    name: 'Pico-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
    builtIn: true,
  },
  {
    id: 'sweetie16',
    name: 'Sweetie 16',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57',
      '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
      '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ],
    builtIn: true,
  },
  {
    id: 'nes',
    name: 'NES',
    colors: [
      '#626262', '#002497', '#240097', '#480096',
      '#6a0093', '#91006c', '#a70025', '#9a2000',
      '#6b3000', '#383d00', '#0b4600', '#004a00',
      '#004421', '#003579', '#000000',
      '#adadad', '#0064ff', '#3800ff', '#6e00ff',
      '#a300cc', '#c91a6c', '#db2a00', '#c44600',
      '#8c6b00', '#547a00', '#188a00', '#008b30',
      '#007ea5',
      '#ffffff', '#5eb5ff', '#8a7eff', '#b96aff',
      '#e05aff', '#ff5ec3', '#ff7357', '#ff9a3e',
      '#ffbe3b', '#dff83b', '#7bf843', '#39f85f',
      '#2af4b9', '#3b9dff', '#6e6e6e',
      '#b5d9ff', '#c3c0ff', '#d5b0ff',
      '#e8b0ff', '#ffb0e0', '#ffb8b0', '#ffcfb0',
      '#ffe1b0', '#efffb0', '#b5f8b9', '#b0ffe0',
      '#b0fef5', '#b0e0ff', '#c8c8c8',
    ],
    builtIn: true,
  },
]
