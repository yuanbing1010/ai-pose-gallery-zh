import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { getNodeDimensions } from './canvasEngine'
import type { CanvasEdge, CanvasNode } from './types'

const MAP_W = 196
const MAP_H = 122

export function CanvasMiniMap({
  nodes,
  edges,
  pan,
  zoom,
  viewportSize,
  selectedIds,
  onJumpToWorldCenter,
}: {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  pan: { x: number; y: number }
  zoom: number
  viewportSize: { width: number; height: number }
  selectedIds: Set<string>
  onJumpToWorldCenter: (worldX: number, worldY: number) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const draggingRef = useRef(false)

  const bounds = useMemo(() => {
    const viewLeft = -pan.x / zoom
    const viewTop = -pan.y / zoom
    const viewRight = viewLeft + viewportSize.width / zoom
    const viewBottom = viewTop + viewportSize.height / zoom

    let minX = viewLeft
    let minY = viewTop
    let maxX = viewRight
    let maxY = viewBottom

    for (const n of nodes) {
      const dims = getNodeDimensions(n)
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + dims.width)
      maxY = Math.max(maxY, n.y + dims.height)
    }

    const pad = 160
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad

    const worldW = Math.max(600, maxX - minX)
    const worldH = Math.max(400, maxY - minY)
    const scale = Math.min(MAP_W / worldW, MAP_H / worldH)
    const offsetX = (MAP_W - worldW * scale) / 2
    const offsetY = (MAP_H - worldH * scale) / 2

    return {
      minX,
      minY,
      scale,
      offsetX,
      offsetY,
      viewRect: {
        x: offsetX + (viewLeft - minX) * scale,
        y: offsetY + (viewTop - minY) * scale,
        w: Math.max(12, (viewRight - viewLeft) * scale),
        h: Math.max(10, (viewBottom - viewTop) * scale),
      },
    }
  }, [nodes, pan, zoom, viewportSize])

  const jumpFromPointer = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const wx = (mx - bounds.offsetX) / bounds.scale + bounds.minX
    const wy = (my - bounds.offsetY) / bounds.scale + bounds.minY
    onJumpToWorldCenter(wx, wy)
  }

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  return (
    <div
      data-canvas-interactive="true"
      className="ks-obsidian-stage dark pointer-events-auto overflow-hidden rounded-2xl border border-[#E5A918]/30 p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.52)]"
    >
      <div className="mb-1 flex items-center justify-between px-1 font-mono text-xs text-[#A9A192]">
        <span className="text-[#E5A918]">MINIMAP</span>
        <span className="tabular-nums">{nodes.length} NODES</span>
      </div>
      <svg
        ref={svgRef}
        width={MAP_W}
        height={MAP_H}
        onPointerDown={(e: ReactPointerEvent<SVGSVGElement>) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          draggingRef.current = true
          jumpFromPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return
          jumpFromPointer(e.clientX, e.clientY)
        }}
        onPointerUp={() => {
          draggingRef.current = false
        }}
        className="block cursor-crosshair rounded-xl bg-[#0D0C0B]"
      >
        {/* 连线缩略 */}
        {edges.map((edge) => {
          const from = nodeMap.get(edge.fromId)
          const to = nodeMap.get(edge.toId)
          if (!from || !to) return null
          const fd = getNodeDimensions(from)
          const td = getNodeDimensions(to)
          const x1 = bounds.offsetX + (from.x + fd.width - bounds.minX) * bounds.scale
          const y1 = bounds.offsetY + (from.y + fd.height * 0.4 - bounds.minY) * bounds.scale
          const x2 = bounds.offsetX + (to.x - bounds.minX) * bounds.scale
          const y2 = bounds.offsetY + (to.y + td.height * 0.4 - bounds.minY) * bounds.scale
          return (
            <line
              key={edge.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(229,169,24,0.45)"
              strokeWidth={1}
            />
          )
        })}

        {/* 节点缩略块 */}
        {nodes.map((node) => {
          const dims = getNodeDimensions(node)
          const x = bounds.offsetX + (node.x - bounds.minX) * bounds.scale
          const y = bounds.offsetY + (node.y - bounds.minY) * bounds.scale
          const w = Math.max(6, dims.width * bounds.scale)
          const h = Math.max(5, dims.height * bounds.scale)
          const selected = selectedIds.has(node.id)
          const fill =
            node.kind === 'group'
              ? 'rgba(229,169,24,0.12)'
              : node.kind === 'image'
                ? node.status === 'succeeded'
                  ? '#F5C443'
                  : '#D9381E'
                : node.kind === 'asset'
                  ? '#2DD4BF'
                  : '#9C9486'
          return (
            <rect
              key={node.id}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={2}
              fill={fill}
              fillOpacity={node.kind === 'group' ? 1 : 0.88}
              stroke={selected ? '#FFFFFF' : node.kind === 'group' ? '#E5A918' : 'none'}
              strokeDasharray={node.kind === 'group' ? '2 2' : undefined}
              strokeWidth={selected ? 1.4 : 0.9}
            />
          )
        })}

        {/* 当前相机视口框 */}
        <rect
          x={bounds.viewRect.x}
          y={bounds.viewRect.y}
          width={bounds.viewRect.w}
          height={bounds.viewRect.h}
          rx={3}
          fill="rgba(229,169,24,0.08)"
          stroke="#E5A918"
          strokeWidth={1.2}
        />
      </svg>
    </div>
  )
}
