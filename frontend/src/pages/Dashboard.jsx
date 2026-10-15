import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, aiAPI } from '../services/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader';
import KpiStrip from '../components/ui/KpiStrip';
import DataTable from '../components/ui/DataTable';
import StatusChip from '../components/ui/StatusChip';
import Button from '../components/ui/Button';
import { useTheme } from '../hooks/useTheme';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

export default function Dashboard() {
  const { isDark } = useTheme();
  const [data, setData] = useState(null);
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, historyRes] = await Promise.all([
        dashboardAPI.summary(),
        aiAPI.history().catch(() => ({ data: [] })),
      ]);
      setData(summaryRes.data);
      if (historyRes.data?.length > 0) {
        setLatestAnalysis(historyRes.data[0]);
      }
    } catch {
      toast.error('Could not load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const {
    total_skus = 0,
    total_warehouses = 0,
    low_stock_count = 0,
    in_transit_count = 0,
    delayed_count = 0,
    stock_chart = [],
    recent_shipments = [],
    low_stock_skus = [],
  } = data || {};

  const numFormat = new Intl.NumberFormat('en-IN');

  // KPI Items in single bar
  const kpiItems = [
    {
      label: 'Active SKUs',
      value: numFormat.format(total_skus),
      subtext: `${total_warehouses} distribution hubs online`,
    },
    {
      label: 'Shipments in transit',
      value: numFormat.format(in_transit_count),
      subtext: `${delayed_count} delayed variance flagged`,
    },
    {
      label: 'Delayed shipments',
      value: numFormat.format(delayed_count),
      color: delayed_count > 0 ? 'var(--status-amber-text)' : 'inherit',
      subtext: delayed_count > 0 ? 'Requires carrier expedite' : 'All lanes on schedule',
    },
    {
      label: 'Low stock alerts',
      value: numFormat.format(low_stock_count),
      color: low_stock_count > 0 ? 'var(--status-red-text)' : 'inherit',
      subtext: low_stock_count > 0 ? 'Below safety reorder threshold' : 'Inventories within bounds',
    },
  ];

  // Combined Exceptions Table: Delayed shipments + Low stock SKUs
  const exceptions = [];

  // Add low-stock exceptions
  low_stock_skus.forEach((item) => {
    exceptions.push({
      id: `EXC-SKU-${item.sku}`,
      type: 'Inventory',
      entity: item.sku,
      description: item.name,
      severity: 'critical',
      detail: `On hand: ${item.quantity} (Reorder: ${item.reorder_level})`,
      targetRoute: '/inventory',
    });
  });

  // Add delayed shipments
  recent_shipments
    .filter((s) => s.status === 'delayed' || s.delay_days > 0)
    .forEach((s) => {
      exceptions.push({
        id: `EXC-SHP-${s.id}`,
        type: 'Shipment',
        entity: `SHP-${s.id.slice(-6).toUpperCase()}`,
        description: s.supplier,
        severity: 'warning',
        detail: `Delay variance: +${s.delay_days}d (ETA ${s.eta ? s.eta.slice(0, 10) : '—'})`,
        targetRoute: '/shipments',
      });
    });

  const exceptionColumns = [
    {
      header: 'Type',
      accessor: 'type',
      width: '90px',
      render: (r) => (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          {r.type}
        </span>
      ),
    },
    {
      header: 'Identifier',
      accessor: 'entity',
      width: '130px',
      mono: true,
      render: (r) => <span className="font-mono text-xs font-semibold text-accent">{r.entity}</span>,
    },
    {
      header: 'Description',
      accessor: 'description',
      render: (r) => <span style={{ fontSize: 13 }}>{r.description}</span>,
    },
    {
      header: 'Condition / Variance',
      accessor: 'detail',
      render: (r) => (
        <span
          className="font-mono text-xs"
          style={{ color: r.severity === 'critical' ? 'var(--status-red-text)' : 'var(--status-amber-text)' }}
        >
          {r.detail}
        </span>
      ),
    },
    {
      header: 'Severity',
      accessor: 'severity',
      width: '100px',
      render: (r) => <StatusChip status={r.severity === 'critical' ? 'critical' : 'delayed'} label={r.severity === 'critical' ? 'Critical' : 'Delayed'} />,
    },
  ];

  // Flat Recharts Data (no rounded corners, horizontal layout)
  const barChartData = (stock_chart || []).slice(0, 7).map((item) => ({
    sku: item.sku,
    onHand: item.quantity,
    reorder: item.reorder_level,
  }));

  const formattedAnalysisTime = latestAnalysis?.created_at
    ? new Date(latestAnalysis.created_at).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Operations' }, { label: 'Overview' }]}
        title="Operations Overview"
        subtitle="Network inventory levels, active lane delays, and critical supply exceptions."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={loadData}>
              Refresh
            </Button>
            <Button variant="primary" icon={ArrowUpRight} onClick={() => navigate('/risk-analysis')}>
              Risk Analysis
            </Button>
          </div>
        }
      />

      <div className="page-content-scroll">
        {/* KPI Strip */}
        <KpiStrip items={kpiItems} />

        {/* AI Risk Summary Notice */}
        {latestAnalysis && (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: latestAnalysis.overall_risk === 'high' ? '3px solid var(--status-red-dot)' : '3px solid var(--accent)',
              borderRadius: 4,
              padding: '10px 14px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  backgroundColor: 'var(--bg-subtle)',
                  padding: '2px 6px',
                  borderRadius: 2,
                  color: 'var(--text-muted)',
                }}
              >
                AI-generated
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-main)' }}>
                {latestAnalysis.summary}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Evaluated: {formattedAnalysisTime || 'Recent'}
              </span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/risk-analysis')}>
                View details
              </Button>
            </div>
          </div>
        )}

        {/* Main 2/3 and 1/3 Split */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          {/* Left 2/3: Exceptions requiring attention */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                Exceptions requiring attention ({exceptions.length})
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Click row to navigate to workspace
              </span>
            </div>

            <DataTable
              columns={exceptionColumns}
              data={exceptions}
              loading={loading}
              pagination={false}
              emptyMessage="No active supply chain exceptions detected."
              onRowClick={(row) => navigate(row.targetRoute)}
            />
          </div>

          {/* Right 1/3: Stock vs reorder level */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                Stock vs reorder level
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Top critical SKUs
              </span>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: '14px 12px 6px',
                height: 380,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 24, bottom: 4 }}
                >
                  <CartesianGrid stroke="var(--chart-grid)" horizontal={true} vertical={false} />
                  <XAxis
                    type="number"
                    stroke="var(--chart-axis)"
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--chart-axis)' }}
                    axisLine={{ stroke: 'var(--border-color)' }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="sku"
                    type="category"
                    stroke="var(--chart-axis)"
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }}
                    axisLine={{ stroke: 'var(--border-color)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--chart-tooltip-bg)',
                      border: '1px solid var(--chart-tooltip-border)',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-main)',
                      boxShadow: 'none',
                    }}
                    labelStyle={{ color: 'var(--text-main)' }}
                    formatter={(val, name) => [
                      numFormat.format(val),
                      name === 'onHand' ? 'On hand' : 'Reorder level',
                    ]}
                  />
                  {/* Flat fills, thin bars, no rounded corners */}
                  <Bar dataKey="onHand" name="On hand" barSize={8} fill="var(--chart-bar-primary)" />
                  <Bar dataKey="reorder" name="Reorder" barSize={8} fill="var(--chart-bar-secondary)" />
                </BarChart>
              </ResponsiveContainer>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 16,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, backgroundColor: 'var(--chart-bar-primary)', display: 'inline-block' }} />
                  <span>On hand inventory</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, backgroundColor: 'var(--chart-bar-secondary)', display: 'inline-block' }} />
                  <span>Safety threshold</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
