import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { confirmPasswordReset, isMockAuth, isValidPassword, sendPasswordResetCode } from '../services/authService'
import { ApiError } from '../types/auth'

export default function PasswordResetPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [errors, setErrors] = useState<{ phone?: string; code?: string; password?: string }>({})
  const [notice, setNotice] = useState('')
  const [noticeOk, setNoticeOk] = useState(false)

  useEffect(() => {
    if (resendAt <= Date.now()) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [resendAt])

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))

  async function handleSendCode() {
    setErrors({})
    setNotice('')
    if (!phone.trim()) {
      setErrors({ phone: '请填写手机号' })
      return
    }
    setSending(true)
    try {
      const result = await sendPasswordResetCode({ phone: phone.trim() })
      setResendAt(Date.now() + result.resend_after_seconds * 1000)
      setNow(Date.now())
    } catch (error) {
      if (error instanceof ApiError && error.status === 500) {
        setErrors({ phone: '验证码暂时无法发送，请稍后再试' })
      } else if (error instanceof ApiError) {
        setErrors({ phone: error.error })
      } else {
        setErrors({ phone: '验证码暂时无法发送，请稍后再试' })
      }
    } finally {
      setSending(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: { phone?: string; code?: string; password?: string } = {}
    if (!phone.trim()) nextErrors.phone = '请填写手机号'
    if (!code.trim()) nextErrors.code = '验证码不正确'
    if (!isValidPassword(password)) nextErrors.password = '密码需同时包含大写字母、小写字母和数字'
    setErrors(nextErrors)
    setNotice('')
    if (nextErrors.phone || nextErrors.code || nextErrors.password) return

    setSaving(true)
    try {
      await confirmPasswordReset({
        phone: phone.trim(),
        code: code.trim(),
        new_password: password,
      })
      navigate('/login', { replace: true, state: { notice: '密码已更新，请用新密码登录' } })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.error.includes('验证码')) setErrors({ code: error.error })
        else if (error.error.includes('密码')) setErrors({ password: error.error })
        else setErrors({ phone: error.error })
      } else {
        setNotice('重置失败，请稍后再试')
        setNoticeOk(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-wrap">
      {isMockAuth() ? <p className="demo">[Mock]</p> : null}
      <form className="card" onSubmit={handleSubmit}>
        <h1>找回密码</h1>
        {notice ? <div className={noticeOk ? 'ok' : 'banner'}>{notice}</div> : null}
        <div className="field">
          <label htmlFor="phone">手机号</label>
          <div className="row">
            <input
              id="phone"
              name="phone"
              type="text"
              value={phone}
              className={errors.phone ? 'invalid' : undefined}
              onChange={(event) => setPhone(event.target.value)}
            />
            <button
              className="btn secondary"
              type="button"
              disabled={wait > 0 || sending}
              onClick={() => {
                void handleSendCode()
              }}
            >
              {wait > 0 ? `${wait} 秒后可重发` : '获取验证码'}
            </button>
          </div>
          {errors.phone ? <div className="error">{errors.phone}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="code">验证码</label>
          <input
            id="code"
            name="code"
            type="text"
            value={code}
            className={errors.code ? 'invalid' : undefined}
            onChange={(event) => setCode(event.target.value)}
          />
          {errors.code ? <div className="error">{errors.code}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="password">新密码</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            className={errors.password ? 'invalid' : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
          {errors.password ? <div className="error">{errors.password}</div> : null}
        </div>
        <div className="hint">至少 8 位，需包含大写字母、小写字母和数字</div>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? '正在保存' : '重置密码'}
        </button>
        <div className="links">
          <Link to="/login">返回登录</Link>
        </div>
      </form>
    </div>
  )
}
