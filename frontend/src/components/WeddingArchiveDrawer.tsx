import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../types/auth'
import { isMockAuth } from '../services/authService'
import { getCurrentWedding, updateWedding } from '../services/weddingService'
import { useAuth } from '../stores/authContext'
import WeddingPhotoPane from './WeddingPhotoPane'
import './wedding-archive.css'

type WeddingArchiveDrawerProps = {
  onClose: () => void
}

type FieldErrors = {
  startDate?: string
  weddingDate?: string
  city?: string
  budget?: string
  headcount?: string
}

function toFen(text: string) {
  const value = Number(String(text).replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

export default function WeddingArchiveDrawer({ onClose }: WeddingArchiveDrawerProps) {
  const { user } = useAuth()
  const userId = user?.id ?? 0
  const [params] = useSearchParams()
  const focusBudget = params.get('focus') === 'budget'
  const [groomName, setGroomName] = useState('')
  const [groomBirthday, setGroomBirthday] = useState('')
  const [brideName, setBrideName] = useState('')
  const [brideBirthday, setBrideBirthday] = useState('')
  const [startDate, setStartDate] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [city, setCity] = useState('')
  const [budget, setBudget] = useState('')
  const [headcount, setHeadcount] = useState('')
  const [preference, setPreference] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState('')

  useEffect(() => {
    let cancelled = false
    void getCurrentWedding(userId)
      .then((current) => {
        if (cancelled) return
        setGroomName(current.groom_nickname ?? '')
        setGroomBirthday(current.groom_birthday ?? '')
        setBrideName(current.bride_nickname ?? '')
        setBrideBirthday(current.bride_birthday ?? '')
        setStartDate(current.start_date)
        setWeddingDate(current.wedding_date)
        setCity(current.city)
        setBudget(yuan(current.total_budget_fen))
        setHeadcount(String(current.guest_estimate))
        setPreference(current.other_preference ?? '')
      })
      .catch((error) => {
        if (cancelled) return
        setBanner(error instanceof ApiError ? error.error : '档案读取失败，请稍后再试')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!focusBudget) return
    const input = document.getElementById('budget')
    if (input instanceof HTMLInputElement) input.focus({ preventScroll: true })
  }, [focusBudget])

  function formatBudget() {
    const fen = toFen(budget)
    if (fen == null || budget.trim() === '') return
    setBudget((fen / 100).toFixed(2))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: FieldErrors = {}
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
      await updateWedding(userId, {
        start_date: startDate,
        wedding_date: weddingDate,
        city: city.trim(),
        total_budget_fen: fen,
        guest_estimate: guests,
        groom_nickname: groomName,
        groom_birthday: groomBirthday,
        bride_nickname: brideName,
        bride_birthday: brideBirthday,
        other_preference: preference,
      })
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.error.includes('婚礼日期')) setErrors({ weddingDate: error.error })
        else if (error.error.includes('开始备婚')) setErrors({ startDate: error.error })
        else if (error.error.includes('城市')) setErrors({ city: error.error })
        else if (error.error.includes('预算')) setErrors({ budget: error.error })
        else if (error.error.includes('人数')) setErrors({ headcount: error.error })
        else setBanner(error.error)
      } else {
        setBanner('保存失败，请稍后再试')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="archive-page">
      {isMockAuth() ? <p className="demo">[Mock]</p> : null}
      <div className="archive-head">
        <h1 id="archive-title">婚礼档案</h1>
        <button className="btn secondary" type="button" onClick={onClose}>
          返回
        </button>
      </div>
      <div className="archive-cols">
        <form className="archive-col" onSubmit={handleSubmit} noValidate>
          <div className="archive-fields">
            {banner ? <div className="banner">{banner}</div> : null}
            <div className="couple-row">
              <div className="field">
                <label htmlFor="groomName">新郎昵称</label>
                <input
                  id="groomName"
                  name="groomName"
                  type="text"
                  value={groomName}
                  onChange={(event) => setGroomName(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="groomBirthday">新郎生日</label>
                <input
                  id="groomBirthday"
                  name="groomBirthday"
                  type="date"
                  value={groomBirthday}
                  onChange={(event) => setGroomBirthday(event.target.value)}
                />
              </div>
            </div>
            <div className="couple-row">
              <div className="field">
                <label htmlFor="brideName">新娘昵称</label>
                <input
                  id="brideName"
                  name="brideName"
                  type="text"
                  value={brideName}
                  onChange={(event) => setBrideName(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="brideBirthday">新娘生日</label>
                <input
                  id="brideBirthday"
                  name="brideBirthday"
                  type="date"
                  value={brideBirthday}
                  onChange={(event) => setBrideBirthday(event.target.value)}
                />
              </div>
            </div>
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
            <div className="field field-preference">
              <label htmlFor="preference">其他婚礼偏好</label>
              <textarea
                id="preference"
                name="preference"
                rows={4}
                value={preference}
                onChange={(event) => setPreference(event.target.value)}
              />
            </div>
          </div>
          <div className="archive-save">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? '正在保存' : '保存'}
            </button>
          </div>
        </form>
        <WeddingPhotoPane userId={userId} />
      </div>
    </div>
  )
}
