export type Tool = 'view' | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select' | 'path' | 'shape'
export type ShapeType = 'rectangle' | 'circle' | 'line'
export type Pixel = string | null
export type MenuId = 'tools' | 'grid' | 'color'

export type Viewport = {
  zoom: number
  panX: number
  panY: number
}

export type PointerPoint = {
  x: number
  y: number
}

export type GestureState = {
  lastCenter: PointerPoint | null
  lastDistance: number | null
}

export type HslColor = {
  hue: number
  saturation: number
  lightness: number
}

export type ProjectPayloadV1 = {
  version: 1
  width: number
  height: number
  pixels: Pixel[]
}

export type ProjectPayloadV2 = {
  version: 2
  width: number
  height: number
  palette: string[]
  runs: Array<[number, number]>
}

export type FloatingSelection = {
  pixels: Array<{ x: number; y: number; color: Pixel; originalX: number; originalY: number }>
  bounds: { x: number; y: number; width: number; height: number }
  transform: { rotation: number; flipX: boolean; flipY: boolean; offsetX: number; offsetY: number }
}

export type ProjectMeta = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type Palette = {
  id: string
  name: string
  colors: string[]
  builtIn?: boolean
}
