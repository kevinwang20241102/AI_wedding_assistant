import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../types/auth'
import { isMockAuth } from '../services/authService'
import { useAuth } from '../stores/authContext'
import '../styles/shell.css'

function toFen(text: string) {
  const value = Number(String(text).replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export default function CreateWeddingPage() {
  const { user, createWedding } = useAuth()
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [city, setCity] = useState('')
  const [budget, setBudget] = useState('')
  const [headcount, setHeadcount] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{
    startDate?: string
    weddingDate?: string
    city?: string
    budget?: string
    headcount?: string
  }>({})
  const [banner, setBanner] = useState('')

  if (user?.has_wedding) {
    return (
      <div className="auth-wrap">
        {isMockAuth() ? <p className="demo">[Mock]</p> : null}
        <div className="card">
          <h1>创建婚礼项目</h1>
          <p>你已经有一个婚礼项目</p>
          <Link className="btn secondary" to="/plan">
            返回备婚计划书
          </Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    if (!startDate) nextErrors.startDate = '请填写开始备婚日期'
    if (!weddingDate) nextErrors.weddingDate = '请填写婚礼日期'
    if (!city.trim()) nextErrors.city = '请填写城市'
    const fen = toFen(budget)
    if (fen == null || budget.trim() === '') nextErrors.budget = '请填写总预算'
    if (headcount.trim() === '' || Number.isNaN(Number(headcount))) nextErrors.headcount = '请填写总人数'
    if (startDate && weddingDate && weddingDate < startDate) {
      nextErrors.weddingDate = '婚礼日期不能早于开始备婚日期'
    }
    if (fen != null && fen < 0) nextErrors.budget = '请填写总预算'
    const guests = Number(headcount)
    if (headcount.trim() !== '' && (!Number.isInteger(guests) || guests < 0)) {
      nextErrors.headcount = '请填写总人数'
    }
    setErrors(nextErrors)
    setBanner('')
    if (Object.keys(nextErrors).length) return
    if (fen == null) return

    setSaving(true)
    try {
      await createWedding({
        start_date: startDate,
        wedding_date: weddingDate,
        city: city.trim(),
        total_budget_fen: fen,
        guest_estimate: guests,
      })
      navigate('/plan', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.error.includes('婚礼日期')) setErrors({ weddingDate: error.error })
        else if (error.error.includes('开始备婚')) setErrors({ startDate: error.error })
        else if (error.error.includes('城市')) setErrors({ city: error.error })
        else if (error.error.includes('预算')) setErrors({ budget: error.error })
        else if (error.error.includes('人数')) setErrors({ headcount: error.error })
        else setBanner(error.error)
      } else {
        setBanner('创建失败，请稍后再试')
      }
    } finally {
      setSaving(false)
    }
  }

  function formatBudget() {
    const fen = toFen(budget)
    if (fen == null || budget.trim() === '') return
    setBudget((fen / 100).toFixed(2))
  }

  return (
    <div className="auth-wrap">
      {isMockAuth() ? <p className="demo">[Mock]</p> : null}
      <form className="card wide" onSubmit={handleSubmit}>
        <h1>创建婚礼项目</h1>
        {banner ? <div className="banner">{banner}</div> : null}
        <div className="field">
          <label htmlFor="startDate">开始备婚日期</label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            value={startDate}
            className={errors.startDate ? 'invalid' : undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
          {errors.startDate ? <div className="error">{errors.startDate}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="weddingDate">婚礼日期</label>
          <input
            id="weddingDate"
            name="weddingDate"
            type="date"
            value={weddingDate}
            className={errors.weddingDate ? 'invalid' : undefined}
            onChange={(event) => setWeddingDate(event.target.value)}
          />
          {errors.weddingDate ? <div className="error">{errors.weddingDate}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="city">城市</label>
          <input
            id="city"
            name="city"
            type="text"
            value={city}
            className={errors.city ? 'invalid' : undefined}
            onChange={(event) => setCity(event.target.value)}
          />
          {errors.city ? <div className="error">{errors.city}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="budget">总预算（元）</label>
          <input
            id="budget"
            name="budget"
            type="text"
            inputMode="decimal"
            value={budget}
            className={errors.budget ? 'invalid' : undefined}
            onChange={(event) => setBudget(event.target.value)}
            onBlur={formatBudget}
          />
          {errors.budget ? <div className="error">{errors.budget}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="headcount">总人数</label>
          <input
            id="headcount"
            name="headcount"
            type="number"
            min="0"
            value={headcount}
            className={errors.headcount ? 'invalid' : undefined}
            onChange={(event) => setHeadcount(event.target.value)}
          />
          {errors.headcount ? <div className="error">{errors.headcount}</div> : null}
        </div>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? '正在保存' : '创建项目'}
        </button>
      </form>
    </div>
  )
}
