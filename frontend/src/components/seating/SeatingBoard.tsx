type SeatingBoardProps = {
  guestTotal: number
  confirmed: number
  seated: number
  unseated: number
}

export default function SeatingBoard({ guestTotal, confirmed, seated, unseated }: SeatingBoardProps) {
  return (
    <header className="head-board">
      <div className="metric">
        <span className="metric-label">宾客总数</span>
        <span className="metric-value hero">
          <b className="count-num">{guestTotal}</b>
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">已确认</span>
        <span className="metric-value">{confirmed}</span>
      </div>
      <div className="metric">
        <span className="metric-label">已排座</span>
        <span className="metric-value">{seated}</span>
      </div>
      <div className="metric">
        <span className="metric-label">未排座</span>
        <span className="metric-value">{unseated}</span>
      </div>
    </header>
  )
}
