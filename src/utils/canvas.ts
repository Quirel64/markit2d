import type { Pixel } from '../types'
import { CANVAS_SIZE } from '../constants'

export const makeBlankPixels = (): Pixel[] => Array(CANVAS_SIZE * CANVAS_SIZE).fill(null)

export const clonePixels = (pixels: Pixel[]): Pixel[] => [...pixels]

export const indexOf = (x: number, y: number): number => y * CANVAS_SIZE + x

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
