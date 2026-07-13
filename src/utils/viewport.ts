import type { Viewport, PointerPoint } from '../types'
import { MIN_ZOOM, MAX_ZOOM, VIEW_SIZE } from '../constants'
import { clamp } from './canvas'

export const clampViewport = ({ zoom, panX, panY }: Viewport): Viewport => {
  const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  const minPan = VIEW_SIZE - VIEW_SIZE * nextZoom

  return {
    zoom: nextZoom,
    panX: nextZoom === MIN_ZOOM ? 0 : clamp(panX, minPan, 0),
    panY: nextZoom === MIN_ZOOM ? 0 : clamp(panY, minPan, 0),
  }
}

export const getDistance = (first: PointerPoint, second: PointerPoint): number =>
  Math.hypot(second.x - first.x, second.y - first.y)

export const getCenter = (first: PointerPoint, second: PointerPoint): PointerPoint => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
})
