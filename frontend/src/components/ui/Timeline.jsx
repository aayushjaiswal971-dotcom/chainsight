export default function Timeline({ events = [] }) {
  if (!events || events.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>
        No tracking checkpoints recorded yet.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      {/* Continuous vertical line */}
      <div
        style={{
          position: 'absolute',
          left: 5,
          top: 8,
          bottom: 12,
          width: 1,
          backgroundColor: 'var(--border-color)',
        }}
      />

      {events.map((evt, idx) => {
        const isLatest = idx === events.length - 1 || idx === 0; // whichever is most recent
        const isDelayed = evt.status === 'delayed' || evt.delay_days > 0;
        const isDelivered = evt.status === 'delivered';

        let dotColor = '#94A3B8';
        if (isDelayed) dotColor = '#D97706';
        else if (isDelivered) dotColor = '#16A34A';
        else if (isLatest) dotColor = 'var(--accent)';

        const formattedTime = evt.timestamp
          ? new Date(evt.timestamp).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          : '—';

        return (
          <div
            key={idx}
            style={{
              position: 'relative',
              paddingBottom: idx === events.length - 1 ? 0 : 20,
            }}
          >
            {/* Dot */}
            <div
              style={{
                position: 'absolute',
                left: -19,
                top: 4,
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: dotColor,
                border: isLatest ? '2px solid #FFFFFF' : 'none',
                boxShadow: isLatest ? '0 0 0 1px var(--accent)' : 'none',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span
                className="font-mono text-xs tabular-nums"
                style={{ color: 'var(--text-muted)', fontSize: 11 }}
              >
                {formattedTime}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isLatest ? 600 : 500,
                  color: 'var(--text-main)',
                }}
              >
                {evt.location || 'Location Unspecified'}
              </span>
              {evt.status && (
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: isDelayed ? 'var(--status-amber-text)' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  [{evt.status.replace(/_/g, ' ')}]
                </span>
              )}
              {evt.delay_days > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--status-red-text)',
                    fontWeight: 600,
                  }}
                >
                  +{evt.delay_days}d delay
                </span>
              )}
            </div>

            {evt.note && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginTop: 3,
                  lineHeight: 1.4,
                }}
              >
                {evt.note}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
