import { useEffect } from 'react';
import { X } from 'lucide-react';
import Button from './Button';

export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 480,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose} aria-modal="true" role="dialog">
      <div
        className="drawer-panel"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 28, height: 28, padding: 0 }}
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="drawer-body">{children}</div>

        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </div>
  );
}
