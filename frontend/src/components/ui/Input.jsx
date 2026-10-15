export function Input({
  label,
  error,
  icon: Icon,
  className = '',
  id,
  ...props
}) {
  return (
    <div style={{ marginBottom: label ? 12 : 0, width: '100%' }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            marginBottom: '4px',
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        {Icon && (
          <span
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-subtle)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Icon size={14} strokeWidth={1.5} />
          </span>
        )}
        <input
          id={id}
          className={`input-base ${className}`}
          style={Icon ? { paddingLeft: 30 } : {}}
          {...props}
        />
      </div>
      {error && (
        <span style={{ fontSize: '11px', color: 'var(--status-red-text)', marginTop: '3px', display: 'block' }}>
          {error}
        </span>
      )}
    </div>
  );
}

export function Select({
  label,
  options = [],
  children,
  className = '',
  id,
  ...props
}) {
  return (
    <div style={{ marginBottom: label ? 12 : 0, width: '100%' }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            marginBottom: '4px',
          }}
        >
          {label}
        </label>
      )}
      <select id={id} className={`select-base ${className}`} {...props}>
        {children ||
          options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
      </select>
    </div>
  );
}
