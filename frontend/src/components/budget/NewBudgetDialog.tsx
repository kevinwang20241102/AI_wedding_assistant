import { useState } from 'react'
import type { FormEvent, PointerEvent } from 'react'
import { BUDGET_STATUSES, toFen } from '../../mocks/budget'
import type { BudgetCategoryCreateRequest, BudgetCategoryStatus } from '../../mocks/budget'

type NewBudgetDialogProps = {
  onClose: () => void
  onSave: (input: BudgetCategoryCreateRequest) => string | null
}

export default function NewBudgetDialog({ onClose, onSave }: NewBudgetDialogProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('0.00')
  const [status, setStatus] = useState<BudgetCategoryStatus>('未确定')
  const [note, setNote] = useState('')
  const [cleared, setCleared] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})

  function clearZero(event: PointerEvent<HTMLInputElement>) {
    if (cleared) return
    setCleared(true)
    const n = Number(String(event.currentTarget.value).replace(/,/g, ''))
    if (n === 0) setAmount('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: { name?: string; amount?: string } = {}
    const trimmed = name.trim()
    if (!trimmed) next.name = '请填写预算名称'
    const fen = toFen(amount)
    if (fen == null) next.amount = '请填写金额'
    setErrors(next)
    if (next.name || next.amount) return
    const message = onSave({
      name: trimmed,
      amount_fen: fen ?? 0,
      status,
      note: note.trim(),
    })
    if (message) setErrors({ amount: message })
  }

  return (
    <div className="modal-back" role="presentation">
      <form
        className="modal"
        data-form="new-cat"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-budget"
        onSubmit={handleSubmit}
      >
        <div className="modal-title" id="new-budget">
          新增预算
        </div>
        <div className="field">
          <label htmlFor="new-cat-name">预算名称</label>
          <input
            id="new-cat-name"
            name="name"
            type="text"
            value={name}
            className={errors.name ? 'invalid' : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name ? <div className="error">{errors.name}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="new-cat-amount">预算金额</label>
          <input
            id="new-cat-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            className={errors.amount ? 'invalid' : undefined}
            onPointerDown={clearZero}
            onFocus={() => {
              if (cleared) return
              setCleared(true)
              const n = Number(String(amount).replace(/,/g, ''))
              if (n === 0) setAmount('')
            }}
            onChange={(event) => setAmount(event.target.value)}
          />
          {errors.amount ? <div className="error">{errors.amount}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="new-cat-status">预算状态</label>
          <select
            id="new-cat-status"
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
          <label htmlFor="new-cat-note">预算备注</label>
          <input
            id="new-cat-note"
            name="note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
