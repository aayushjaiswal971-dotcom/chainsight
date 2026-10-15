import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!email || !password) {
      toast.error('Enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Signed in.');
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'Invalid credentials.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('Demo@12345');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          padding: '28px 24px',
        }}
      >
        {/* Header with single-color logo */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="20" height="20" rx="3" stroke="var(--accent)" strokeWidth="2" fill="none" />
              <path d="M7 12H17M12 7V17" stroke="var(--accent)" strokeWidth="2" strokeLinecap="square" />
            </svg>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--text-main)' }}>
              ChainSight
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Sign in to access your operational workspace
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Input
            label="Email address"
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@enterprise.com"
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />

          <div style={{ marginTop: 16 }}>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              style={{ width: '100%' }}
            >
              Sign in
            </Button>
          </div>
        </form>

        {/* Demo Credentials Switcher */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 14,
            borderTop: '1px solid var(--border-color)',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Preconfigured Accounts
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ flex: 1, height: 26, fontSize: 11 }}
              onClick={() => fillCredentials('admin@demo.com')}
            >
              admin@demo.com
            </button>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ flex: 1, height: 26, fontSize: 11 }}
              onClick={() => fillCredentials('manager@demo.com')}
            >
              manager@demo.com
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          fontSize: 11,
          color: 'var(--text-subtle)',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
        }}
      >
        ChainSight Operations Suite · v2.4.1 (Build 2026.10)
      </div>
    </div>
  );
}
