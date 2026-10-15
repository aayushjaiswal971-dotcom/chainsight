import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PageHeader({
  breadcrumbs = [],
  title,
  subtitle,
  actions,
}) {
  return (
    <div className="page-header-container">
      <div>
        {breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--text-subtle)',
              marginBottom: 2,
            }}
          >
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {crumb.to ? (
                  <Link
                    to={crumb.to}
                    style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                    className="hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
                {idx < breadcrumbs.length - 1 && (
                  <ChevronRight size={11} strokeWidth={1.5} color="var(--text-subtle)" />
                )}
              </span>
            ))}
          </nav>
        )}
        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-main)',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
