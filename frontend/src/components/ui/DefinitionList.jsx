export default function DefinitionList({ items = [], columns = 2 }) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '12px 24px',
        margin: 0,
        padding: '12px 16px',
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderRadius: 4,
      }}
    >
      {items.map((item, idx) => (
        <div key={idx}>
          <dt
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 3,
            }}
          >
            {item.label}
          </dt>
          <dd
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: item.weight || 500,
              color: item.color || 'var(--text-main)',
              fontFamily: item.mono ? 'var(--font-mono)' : 'inherit',
            }}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
