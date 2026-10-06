import type { RefObject } from 'react'
import type { CanvasView, GuestPublic, TablePublic } from '../../mocks/seating'
import TableCard from './TableCard'

type SeatCanvasProps = {
  canvas: CanvasView
  tables: TablePublic[]
  guests: GuestPublic[]
  boardRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLDivElement | null>
  onZoom: (dir: number) => void
  onAddTable: () => void
  onRename: (tableId: number, name: string) => void
  onCapacity: (tableId: number, capacity: number) => void
  onMain: (tableId: number) => void
  onDelete: (tableId: number) => void
  onUnseat: (guestId: number) => void
}

export default function SeatCanvas({
  canvas,
  tables,
  guests,
  boardRef,
  canvasRef,
  onZoom,
  onAddTable,
  onRename,
  onCapacity,
  onMain,
  onDelete,
  onUnseat,
}: SeatCanvasProps) {
  return (
    <div className="board" data-pan="1" ref={boardRef}>
      <div className="board-tools">
        <button className="btn secondary" type="button" data-act="zoom" data-dir="1" onClick={() => onZoom(1)}>
          放大
        </button>
        <button className="btn secondary" type="button" data-act="zoom" data-dir="-1" onClick={() => onZoom(-1)}>
          缩小
        </button>
        <button className="btn secondary" type="button" onClick={onAddTable}>
          新增桌子
        </button>
      </div>
      <div
        className="canvas"
        ref={canvasRef}
        style={{ transform: `translate(${canvas.x}px,${canvas.y}px) scale(${canvas.scale})` }}
      >
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            guests={guests.filter((guest) => guest.table_id === table.id)}
            onRename={onRename}
            onCapacity={onCapacity}
            onMain={onMain}
            onDelete={onDelete}
            onUnseat={onUnseat}
          />
        ))}
      </div>
    </div>
  )
}
