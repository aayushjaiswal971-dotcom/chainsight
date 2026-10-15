export default function StatusChip({ status, label }) {
  const norm = (status || '').toLowerCase().replace('-', '_');

  let variant = 'gray';
  let displayLabel = label || status;

  if (['delivered', 'healthy', 'low_risk', 'on_time', 'resolved'].includes(norm)) {
    variant = 'green';
  } else if (['delayed', 'medium', 'medium_risk', 'low', 'at_risk', 'warning'].includes(norm)) {
    variant = 'amber';
  } else if (['high', 'high_risk', 'critical', 'out_of_stock', 'stockout'].includes(norm)) {
    variant = 'red';
  } else if (['in_transit', 'transit', 'active'].includes(norm)) {
    variant = 'blue';
  } else if (['ordered', 'pending', 'draft', 'normal'].includes(norm)) {
    variant = 'gray';
  }

  // Format label
  if (!label && status) {
    displayLabel = status.replace(/_/g, ' ');
    displayLabel = displayLabel.charAt(0).toUpperCase() + displayLabel.slice(1);
  }

  return (
    <span className={`status-chip status-chip-${variant}`}>
      <span className="status-chip-dot" />
      <span>{displayLabel}</span>
    </span>
  );
}
