import { useEffect, useState } from 'react'
import type { FormEvent, PointerEvent } from 'react'
import { BUDGET_STATUSES, toFen, yuan } from '../../mocks/budget'
import type { BudgetCategoryRow, BudgetCategoryStatus } from '../../mocks/budget'

type CategoryDetailProps = {
  category: BudgetCategoryRow
  onSave: (patch: { amount_fen: number; status: BudgetCategoryStatus; note: string }) => string | null
}

export default function CategoryDetail({ category, onSave }: CategoryDetailProps) {
  const [amount, setAmount] = useState(() => yuan(category.amount_fen))
  const [status, setStatus] = useState<BudgetCategoryStatus>(category.status)
  const [note, setNote] = useState(category.note)
  const [cleared, setCleared] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setAmount(yuan(category.amount_fen))
    setStatus(category.status)
    setNote(category.note)
    setCleared(false)
    setError('')
  }, [category.id, category.amount_fen, category.status, category.note])

  function clearZero(event: PointerEvent<HTMLInputElement>) {
    if (cleared) return
    setCleared(true)
    const n = Number(String(event.currentTarget.value).replace(/,/g, ''))
    if (n === 0) setAmount('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fen = toFen(amount)
    if (fen == null) {
      setError('请填写金额')
      return
    }
    const message = onSave({ amount_fen: fen, status, note: note.trim() })
    if (message) setError(message)
  }

  return (
    <form className="detail" data-form="cat" data-id={category.id} onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`cat-amount-${category.id}`}>金额（元）</label>
        <input
          id={`cat-amount-${category.id}`}
          name="amount"
          type="text"
          inputMode="decimal"
          value={amount}
          className={error ? 'invalid' : undefined}
          onPointerDown={clearZero}
          onFocus={() => {
            if (cleared) return
            setCleared(true)
            const n = Number(String(amount).replace(/,/g, ''))
            if (n === 0) setAmount('')
          }}
          onChange={(event) => setAmount(event.target.value)}
        />
        {error ? <div className="error">{error}</div> : null}
      </div>
      <div className="field">
        <label htmlFor={`cat-status-${category.id}`}>状态</label>
        <select
          id={`cat-status-${category.id}`}
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as BudgetCategoryStatus)}
        >
          {BUDGET_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`cat-note-${category.id}`}>预算备注</label>
        <input
          id={`cat-note-${category.id}`}
          name="note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <button className="btn primary" type="submit">
        保存
      </button>
    </form>
  )
}
