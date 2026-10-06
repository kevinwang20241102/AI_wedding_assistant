type PlanBoardProps = {
  weddingDate: string
  countdownDays: number
  completed: number
  inProgress: number
  total: number
}

function ratio(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0
}

export default function PlanBoard({ weddingDate, countdownDays, completed, inProgress, total }: PlanBoardProps) {
  const countLabel = countdownDays > 0 ? '距离婚礼' : countdownDays === 0 ? '婚礼日期' : '婚礼已过'
  const heroCountdown = countdownDays !== 0

  return (
    <header className="head-board">
      <div className="metric">
        <span className="metric-label">婚礼日期</span>
        <span className="metric-value hero">
          <b className="count-num">{weddingDate}</b>
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">{countLabel}</span>
        <span className={`metric-value${heroCountdown ? ' hero' : ''}`}>
          {countdownDays === 0 ? (
            '就是婚礼当天'
          ) : (
            <>
              <b className="count-num">{countdownDays > 0 ? countdownDays : -countdownDays}</b> 天
            </>
          )}
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">已完成</span>
        <span className="metric-value">
          {completed} / {total}
        </span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${ratio(completed, total)}%` }} />
        </div>
      </div>
      <div className="metric">
        <span className="metric-label">进行中</span>
        <span className="metric-value">
          {inProgress} / {total}
        </span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${ratio(inProgress, total)}%` }} />
        </div>
      </div>
    </header>
  )
}
