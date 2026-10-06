import { yuan } from '../../mocks/budget'

type BudgetBoardProps = {
  totalFen: number
  allocatedFen: number
  unallocatedFen: number
  over: boolean
}

export default function BudgetBoard({ totalFen, allocatedFen, unallocatedFen, over }: BudgetBoardProps) {
  return (
    <header className="head-board">
      <div className="metric">
        <span className="metric-label">总预算</span>
        <span className="metric-value hero">
          <b className="count-num">¥{yuan(totalFen)}</b>
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">已分配</span>
        <span className="metric-value">¥{yuan(allocatedFen)}</span>
      </div>
      <div className="metric">
        <span className="metric-label">未分配</span>
        <span className={`metric-value${over ? ' danger' : ''}`}>¥{yuan(unallocatedFen)}</span>
        {over ? <span className="danger-text">已超出总预算</span> : null}
      </div>
    </header>
  )
}
