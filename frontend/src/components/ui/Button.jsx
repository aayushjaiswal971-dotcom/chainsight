export default function Button({
  children,
  variant = 'secondary', // 'primary', 'secondary', 'ghost', 'danger'
  size = 'md', // 'sm', 'md'
  icon: Icon,
  disabled = false,
  loading = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) {
  const variantClass = `btn-${variant}`;
  const sizeStyle = size === 'sm' ? { height: '28px', padding: '0 8px', fontSize: '12px' } : {};

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${className}`}
      style={sizeStyle}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: 13,
            height: 13,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      ) : Icon ? (
        <Icon size={15} strokeWidth={1.5} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
