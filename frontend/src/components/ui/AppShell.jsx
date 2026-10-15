import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { warehouseAPI } from '../../services/api';
import {
  LayoutDashboard,
  Package,
  Truck,
  BrainCircuit,
  Search,
  LogOut,
  Building2,
  ChevronDown,
  User,
  Menu,
  Upload,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/shipments', label: 'Shipments', icon: Truck },
  { to: '/risk-analysis', label: 'Risk Analysis', icon: BrainCircuit },
  { to: '/import', label: 'Import data', icon: Upload },
];

const themeOptions = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [globalSearch, setGlobalSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    warehouseAPI
      .list()
      .then((res) => setWarehouses(res.data || []))
      .catch(() => { });
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handle = (e) => {
      if (!e.target.closest('[data-user-menu]')) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [userMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleGlobalSearch = (e) => {
    if (e.key === 'Enter' && globalSearch.trim()) {
      const q = globalSearch.trim().toLowerCase();
      if (q.startsWith('shp-') || q.includes('ship')) {
        navigate(`/shipments?q=${encodeURIComponent(q)}`);
      } else {
        navigate(`/inventory?q=${encodeURIComponent(q)}`);
      }
    }
  };

  return (
    <div className="app-container">
      {/* 48px Enterprise Top Bar */}
      <header className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 28, height: 28, padding: 0 }}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="Toggle navigation"
          >
            <Menu size={16} strokeWidth={1.5} />
          </button>

          {/* Simple Monochrome Logo Mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="20" height="20" rx="3" stroke="var(--accent)" strokeWidth="2" fill="none" />
              <path d="M7 12H17M12 7V17" stroke="var(--accent)" strokeWidth="2" strokeLinecap="square" />
            </svg>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '-0.3px',
                color: 'var(--text-main)',
              }}
            >
              ChainSight
            </span>
          </div>

          <span style={{ color: 'var(--border-color)', margin: '0 4px' }}>|</span>

          {/* Warehouse Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={14} strokeWidth={1.5} color="var(--text-muted)" />
            <select
              className="select-base"
              style={{ height: 28, fontSize: 12, paddingRight: 24, paddingLeft: 6, borderColor: 'transparent' }}
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
            >
              <option value="all">All Warehouses ({warehouses.length || 3})</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({(w.location || '').split(',')[0]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: Global Search (SKU / Shipment ID) */}
        <div style={{ position: 'relative', width: 340 }}>
          <Search
            size={13}
            strokeWidth={1.5}
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-subtle)',
            }}
          />
          <input
            type="text"
            className="input-base font-mono"
            style={{ height: 28, fontSize: 12, paddingLeft: 28 }}
            placeholder="Search SKU, lot number, shipment ID (press Enter)..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onKeyDown={handleGlobalSearch}
          />
        </div>

        {/* Right: User Menu */}
        <div style={{ position: 'relative' }} data-user-menu>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ height: 32, padding: '0 8px', gap: 6 }}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 3,
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-main)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-main)' }}>
              {user?.email?.split('@')[0]}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-subtle)',
                padding: '1px 5px',
                borderRadius: 2,
                textTransform: 'uppercase',
              }}
            >
              {user?.role || 'manager'}
            </span>
            <ChevronDown size={13} strokeWidth={1.5} color="var(--text-muted)" />
          </button>

          {userMenuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 36,
                width: 220,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 50,
                padding: '6px 0',
              }}
            >
              <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-color)', fontSize: 11 }}>
                <div style={{ color: 'var(--text-muted)' }}>Signed in as</div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', wordBreak: 'break-all' }}>{user?.email}</div>
              </div>

              {/* Theme Toggle */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-subtle)', marginBottom: 6 }}>
                  Appearance
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {themeOptions.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTheme(value)}
                      title={label}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        padding: '5px 4px',
                        borderRadius: 4,
                        border: `1px solid ${theme === value ? 'var(--accent)' : 'var(--border-color)'}`,
                        backgroundColor: theme === value ? 'var(--accent-subtle)' : 'transparent',
                        color: theme === value ? 'var(--accent)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 500,
                      }}
                    >
                      <Icon size={13} strokeWidth={1.5} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', height: 30, borderRadius: 0, fontSize: 12 }}
                onClick={handleLogout}
              >
                <LogOut size={13} strokeWidth={1.5} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Layout (Sidebar + Content) */}
      <div className="app-main-layout">
        {/* 220px Left Sidebar */}
        <aside
          className="left-sidebar"
          style={{
            width: sidebarCollapsed ? 56 : 220,
            transition: 'width 120ms ease-in-out',
          }}
        >
          <div style={{ padding: '8px 0', flex: 1 }}>
            {!sidebarCollapsed && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-subtle)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  padding: '8px 16px 4px',
                }}
              >
                Operational Workspaces
              </div>
            )}

            {navItems.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname.startsWith(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  title={sidebarCollapsed ? label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: sidebarCollapsed ? '8px 0' : '7px 16px',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    marginBottom: 1,
                  }}
                >
                  <Icon size={16} strokeWidth={1.5} color={isActive ? 'var(--accent)' : 'var(--text-muted)'} />
                  {!sidebarCollapsed && <span>{label}</span>}
                </NavLink>
              );
            })}
          </div>

          {!sidebarCollapsed && (
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border-color)',
                fontSize: 11,
                color: 'var(--text-subtle)',
              }}
            >
              <div>ChainSight Enterprise v2.4.1</div>
              <div className="font-mono text-xs" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                ENV: PROD-LOCAL
              </div>
            </div>
          )}
        </aside>

        {/* Content Area */}
        <main className="app-content-area">{children}</main>
      </div>
    </div>
  );
}
