import { Search, X } from 'lucide-react';
import Button from './Button';

export default function FilterBar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [], // { label, value, onChange, options: [{ label, value }] }
  onClear,
  children,
}) {
  const hasActiveFilters = search || filters.some((f) => f.value && f.value !== 'all');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 12,
      }}
    >
      {onSearchChange && (
        <div style={{ position: 'relative', width: 240 }}>
          <Search
            size={14}
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
            className="input-base"
            style={{ paddingLeft: 28 }}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      {filters.map((f, idx) => (
        <div key={idx} style={{ minWidth: 140 }}>
          <select
            className="select-base"
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            style={{ width: '100%' }}
          >
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {hasActiveFilters && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} icon={X}>
          Clear filters
        </Button>
      )}

      {children && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {children}
        </div>
      )}
    </div>
  );
}
