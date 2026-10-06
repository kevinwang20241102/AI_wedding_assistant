import type { MouseEvent } from 'react'
import type { GuestPublic } from '../../mocks/seating'

type GuestChipProps = {
  guest: GuestPublic
  tone?: 'placed' | 'waiting' | 'table'
  onRemove: () => void
  removeLabel: string
  removeAct: 'delete-guest' | 'unseat'
}

export default function GuestChip({ guest, tone = 'table', onRemove, removeLabel, removeAct }: GuestChipProps) {
  const extra = tone === 'placed' ? ' placed' : tone === 'waiting' ? ' waiting' : ''

  function handleRemove(event: MouseEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.stopPropagation()
    onRemove()
  }

  return (
    <button className={`chip${extra}`} type="button" data-guest={guest.id}>
      <span className="chip-name">{guest.name}</span>
      {removeAct === 'delete-guest' ? (
        <span className="chip-x" data-act="delete-guest" aria-label={removeLabel} onClick={handleRemove}>
          ×
        </span>
      ) : (
        <span data-act="unseat" aria-label={removeLabel} onClick={handleRemove}>
          ×
        </span>
      )}
    </button>
  )
}
