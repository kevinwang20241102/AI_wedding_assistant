import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FocusEvent } from 'react'
import type { GuestPublic, TablePublic } from '../../mocks/seating'
import GuestChip from './GuestChip'

type TableCardProps = {
  table: TablePublic
  guests: GuestPublic[]
  onRename: (tableId: number, name: string) => void
  onCapacity: (tableId: number, capacity: number) => void
  onMain: (tableId: number) => void
  onDelete: (tableId: number) => void
  onUnseat: (guestId: number) => void
}

export default function TableCard({
  table,
  guests,
  onRename,
  onCapacity,
  onMain,
  onDelete,
  onUnseat,
}: TableCardProps) {
  const full = guests.length >= table.capacity
  const [nameDraft, setNameDraft] = useState(table.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const tableNameRef = useRef(table.name)
  const onRenameRef = useRef(onRename)
  const tableIdRef = useRef(table.id)
  const sentRef = useRef(table.name)
  tableNameRef.current = table.name
  onRenameRef.current = onRename
  tableIdRef.current = table.id

  useEffect(() => {
    setNameDraft(table.name)
    sentRef.current = table.name
  }, [table.name])

  function commitRename(raw: string) {
    const next = raw.trim() || tableNameRef.current
    setNameDraft(next)
    if (next === tableNameRef.current || next === sentRef.current) return
    sentRef.current = next
    onRenameRef.current(tableIdRef.current, next)
  }

  function handleRenameChange(event: ChangeEvent<HTMLInputElement>) {
    setNameDraft(event.target.value)
  }

  function handleRenameBlur(event: FocusEvent<HTMLInputElement>) {
    commitRename(event.currentTarget.value)
  }

  useEffect(() => {
    function flushIfOutside(event: Event) {
      const input = inputRef.current
      const target = event.target as Node | null
      if (!input || !target || input.contains(target)) return
      if (document.activeElement !== input && input.value === tableNameRef.current) return
      commitRename(input.value)
    }
    document.addEventListener('pointerdown', flushIfOutside, true)
    document.addEventListener('click', flushIfOutside, true)
    return () => {
      document.removeEventListener('pointerdown', flushIfOutside, true)
      document.removeEventListener('click', flushIfOutside, true)
    }
  }, [])

  function handleCapacity(event: ChangeEvent<HTMLInputElement>) {
    onCapacity(table.id, Math.max(1, Number(event.target.value) || 1))
  }

  return (
    <article
      className={`table${table.is_head ? ' main' : ''}`}
      data-table={table.id}
      style={{ left: table.pos_x, top: table.pos_y, zIndex: table.is_head ? 2 : 1 }}
    >
      <div className="handle" data-handle={table.id}>
        拖动桌位{table.is_head ? ' · 主桌' : ''}
      </div>
      <div className="table-name">{table.name}</div>
      <div>
        已坐 {guests.length} / 容量 {table.capacity}
      </div>
      {full ? <div className="full">已满，仍可入座</div> : null}
      <div className="chips">
        {guests.map((guest) => (
          <GuestChip
            key={guest.id}
            guest={guest}
            tone="table"
            removeAct="unseat"
            removeLabel={`移出${guest.name}`}
            onRemove={() => onUnseat(guest.id)}
          />
        ))}
      </div>
      <div className="table-actions">
        <input
          ref={inputRef}
          data-act="rename"
          value={nameDraft}
          aria-label="桌名"
          onChange={handleRenameChange}
          onBlur={handleRenameBlur}
        />
        <input
          data-act="capacity"
          type="number"
          min={1}
          value={table.capacity}
          aria-label="容量"
          onChange={handleCapacity}
        />
        <button className="btn danger" type="button" onClick={() => onMain(table.id)}>
          设为主桌
        </button>
        <button className="btn danger" type="button" onClick={() => onDelete(table.id)}>
          删除
        </button>
      </div>
    </article>
  )
}
