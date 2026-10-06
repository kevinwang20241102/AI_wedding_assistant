import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { isMockAuth, isValidPassword, registerAccount } from '../services/authService'
import { setAuthSession } from '../services/authSession'
import { ApiError } from '../types/auth'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; password?: string; phone?: string }>({})

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: { username?: string; password?: string; phone?: string } = {}
    if (!username.trim()) nextErrors.username = '请填写用户名'
    if (!isValidPassword(password)) nextErrors.password = '密码需同时包含大写字母、小写字母和数字'
    if (!phone.trim()) nextErrors.phone = '请填写手机号'
    setErrors(nextErrors)
    if (nextErrors.username || nextErrors.password || nextErrors.phone) return

    setSaving(true)
    try {
      const user = await registerAccount({
        username: username.trim(),
        password,
        phone: phone.trim(),
      })
      setAuthSession({ user, remember: false })
      navigate('/wedding/new', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.error.includes('用户名')) setErrors({ username: error.error })
        else if (error.error.includes('手机号')) setErrors({ phone: error.error })
        else setErrors({ password: error.error })
      } else {
        setErrors({ password: '注册失败，请稍后再试' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-wrap has-hearts">
      {isMockAuth() ? <p className="demo">[Mock]</p> : null}
      <form className="card" onSubmit={handleSubmit}>
        <h1>注册</h1>
        <div className="field">
          <label htmlFor="username">用户名</label>
          <input
            id="username"
            name="username"
            type="text"
            value={username}
            className={errors.username ? 'invalid' : undefined}
            onChange={(event) => setUsername(event.target.value)}
          />
          {errors.username ? <div className="error">{errors.username}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            className={errors.password ? 'invalid' : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="hint">至少 8 位，需包含大写字母、小写字母和数字</div>
          {errors.password ? <div className="error">{errors.password}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="phone">手机号</label>
          <input
            id="phone"
            name="phone"
            type="text"
            value={phone}
            className={errors.phone ? 'invalid' : undefined}
            onChange={(event) => setPhone(event.target.value)}
          />
          {errors.phone ? <div className="error">{errors.phone}</div> : null}
        </div>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? '正在保存' : '注册'}
        </button>
        <div className="links">
          <Link to="/login">已有账号，去登录</Link>
        </div>
      </form>
    </div>
  )
}
