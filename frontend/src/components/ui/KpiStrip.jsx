export default function KpiStrip({ items = [] }) {
  return (
    <div className="kpi-strip">
      {items.map((item, index) => (
        <div key={index} className="kpi-strip-item">
          <div className="kpi-strip-label">{item.label}</div>
          <div
            className="kpi-strip-value"
            style={item.color ? { color: item.color } : {}}
          >
            {item.value}
          </div>
          {item.subtext && (
            <div className="kpi-strip-sub">{item.subtext}</div>
          )}
        </div>
      ))}
    </div>
  );
}
