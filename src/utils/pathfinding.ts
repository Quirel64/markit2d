import type { PointerPoint } from '../types'

type PathNode = PointerPoint & {
  g: number
  f: number
}

type FindPixelPathOptions = {
  start: PointerPoint
  end: PointerPoint
  width: number
  height: number
  allowDiagonal: boolean
  isBlocked?: (point: PointerPoint) => boolean
}

const DIAGONAL_COST = Math.SQRT2

const keyOf = (point: PointerPoint): string => `${point.x}:${point.y}`

const heuristic = (a: PointerPoint, b: PointerPoint, allowDiagonal: boolean): number => {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)

  if (!allowDiagonal) return dx + dy

  return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy)
}

const getNeighbors = (point: PointerPoint, width: number, height: number, allowDiagonal: boolean): PathNode[] => {
  const directions = allowDiagonal
    ? [
        { x: 1, y: 0, cost: 1 },
        { x: -1, y: 0, cost: 1 },
        { x: 0, y: 1, cost: 1 },
        { x: 0, y: -1, cost: 1 },
        { x: 1, y: 1, cost: DIAGONAL_COST },
        { x: 1, y: -1, cost: DIAGONAL_COST },
        { x: -1, y: 1, cost: DIAGONAL_COST },
        { x: -1, y: -1, cost: DIAGONAL_COST },
      ]
    : [
        { x: 1, y: 0, cost: 1 },
        { x: -1, y: 0, cost: 1 },
        { x: 0, y: 1, cost: 1 },
        { x: 0, y: -1, cost: 1 },
      ]

  return directions
    .map((direction) => ({
      x: point.x + direction.x,
      y: point.y + direction.y,
      g: direction.cost,
      f: 0,
    }))
    .filter((neighbor) => neighbor.x >= 0 && neighbor.y >= 0 && neighbor.x < width && neighbor.y < height)
}

const reconstructPath = (
  cameFrom: Map<string, string>,
  pointsByKey: Map<string, PointerPoint>,
  endKey: string,
): PointerPoint[] => {
  const path: PointerPoint[] = []
  let currentKey: string | undefined = endKey

  while (currentKey) {
    const point = pointsByKey.get(currentKey)
    if (!point) break

    path.push(point)
    currentKey = cameFrom.get(currentKey)
  }

  return path.reverse()
}

export const findPixelPath = ({
  start,
  end,
  width,
  height,
  allowDiagonal,
  isBlocked = () => false,
}: FindPixelPathOptions): PointerPoint[] => {
  const startKey = keyOf(start)
  const endKey = keyOf(end)
  const open: PathNode[] = [{ ...start, g: 0, f: heuristic(start, end, allowDiagonal) }]
  const closed = new Set<string>()
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startKey, 0]])
  const pointsByKey = new Map<string, PointerPoint>([
    [startKey, start],
    [endKey, end],
  ])

  while (open.length) {
    open.sort((a, b) => a.f - b.f)
    const current = open.shift()
    if (!current) break

    const currentKey = keyOf(current)
    if (currentKey === endKey) {
      return reconstructPath(cameFrom, pointsByKey, endKey)
    }

    closed.add(currentKey)

    for (const neighbor of getNeighbors(current, width, height, allowDiagonal)) {
      const neighborKey = keyOf(neighbor)
      if (closed.has(neighborKey)) continue
      if (neighborKey !== endKey && isBlocked(neighbor)) continue

      const tentativeG = current.g + neighbor.g
      const bestG = gScore.get(neighborKey)
      if (bestG !== undefined && tentativeG >= bestG) continue

      cameFrom.set(neighborKey, currentKey)
      gScore.set(neighborKey, tentativeG)
      pointsByKey.set(neighborKey, neighbor)

      const existing = open.find((node) => keyOf(node) === neighborKey)
      const nextNode = {
        x: neighbor.x,
        y: neighbor.y,
        g: tentativeG,
        f: tentativeG + heuristic(neighbor, end, allowDiagonal),
      }

      if (existing) {
        existing.g = nextNode.g
        existing.f = nextNode.f
      } else {
        open.push(nextNode)
      }
    }
  }

  return []
}
