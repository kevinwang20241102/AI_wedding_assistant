import type { PointerEvent } from 'react'
import { budgetShare, statusClass, yuan } from '../../mocks/budget'
import type { BudgetCategoryRow, BudgetCategoryStatus } from '../../mocks/budget'
import CategoryDetail from './CategoryDetail'

type CategoryRowProps = {
  category: BudgetCategoryRow
  totalFen: number
  open: boolean
  lifted: boolean
  onPointerDown: (event: PointerEvent<HTMLDivElement>, id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  onSave: (id: number, patch: { amount_fen: number; status: BudgetCategoryStatus; note: string }) => string | null
}

export default function CategoryRow({
  category,
  totalFen,
  open,
  lifted,
  onPointerDown,
  onEdit,
  onDelete,
  onSave,
}: CategoryRowProps) {
  const note = category.note.trim()
  return (
    <div className={`cat-item${lifted ? ' is-lifted' : ''}`} data-cat={category.id}>
      <div className="cat" onPointerDown={(event) => onPointerDown(event, category.id)}>
        <span className="swatch" style={{ background: category.color }} />
        <span className="name">{category.name}</span>
        <span className="money">¥{yuan(category.amount_fen)}</span>
        <span className="tag share">{budgetShare(category.amount_fen, totalFen)}</span>
        <span className="budget-note">{note ? `备注：${note}` : '备注：暂无'}</span>
        <span className={`tag ${statusClass(category.status)}`}>{category.status}</span>
        <button className="btn danger" type="button" onClick={() => onEdit(category.id)}>
          编辑
        </button>
        <button className="btn danger" type="button" onClick={() => onDelete(category.id)}>
          删除
        </button>
      </div>
      {open ? (
        <CategoryDetail
          category={category}
          onSave={(patch) => onSave(category.id, patch)}
        />
      ) : null}
    </div>
  )
}
