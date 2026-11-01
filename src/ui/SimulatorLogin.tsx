import { useState, type FormEvent } from 'react';
import { login } from '../api/client.ts';
import c from './SimulatorLogin.module.css';

interface Props {
  onSuccess: (user: any) => void;
}

export function SimulatorLogin({ onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { user } = await login(email.trim(), password);
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Đăng nhập không thành công.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={c.backdrop}>
      <div className={c.card}>
        <div className={c.header}>
          <h1 className={c.title}>TMEC Simulator</h1>
          <p className={c.subtitle}>Đăng nhập tài khoản hệ thống để nạp ngựa và kết nối vận hành</p>
        </div>

        {error && <div className={c.errorBanner}>{error}</div>}

        <form className={c.form} onSubmit={handleSubmit}>
          <div className={c.field}>
            <label className={c.label} htmlFor="sim-email">
              Email
            </label>
            <input
              id="sim-email"
              type="email"
              className={c.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nhanvien@equiflow.com"
              disabled={loading}
              autoComplete="username"
              required
            />
          </div>

          <div className={c.field}>
            <label className={c.label} htmlFor="sim-pass">
              Mật khẩu
            </label>
            <input
              id="sim-pass"
              type="password"
              className={c.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className={c.submitBtn} disabled={loading}>
            {loading ? 'Đang xác thực...' : 'Đăng nhập Simulator'}
          </button>
        </form>
      </div>
    </div>
  );
}
