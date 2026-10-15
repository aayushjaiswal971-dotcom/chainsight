import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAPI } from '../services/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader';
import StatusChip from '../components/ui/StatusChip';
import DataTable from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import {
  Play,
  Copy,
  Check,
} from 'lucide-react';

export default function RiskAnalysis() {
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState(0); // 0: Collecting inventory, 1: Evaluating shipments, 2: Generating assessment
  const [reviewedItems, setReviewedItems] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const navigate = useNavigate();

  const numFormat = new Intl.NumberFormat('en-IN');

  const progressSteps = [
    'Collecting warehouse inventory balances...',
    'Evaluating in-transit carrier lane variances...',
    'Synthesizing disruption vectors with Gemini...',
  ];

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await aiAPI.history();
      const list = res.data || [];
      setHistory(list);
      if (list.length > 0 && !currentAnalysis) {
        setCurrentAnalysis(list[0]);
      }
    } catch {
      toast.error('Could not load analysis records.');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setProgressStep(0);

    const stepInterval = setInterval(() => {
      setProgressStep((prev) => (prev < 2 ? prev + 1 : prev));
    }, 1100);

    try {
      const res = await aiAPI.analyze();
      setCurrentAnalysis(res.data);
      toast.success('Risk assessment synthesized.');
      fetchHistory();
    } catch (err) {
      toast.error('Assessment service unavailable. Switched to rule-based fallback.');
    } finally {
      clearInterval(stepInterval);
      setAnalyzing(false);
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Directive copied.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReviewed = (sku) => {
    setReviewedItems((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const atRiskColumns = [
    {
      header: 'SKU',
      accessor: 'sku',
      mono: true,
      width: '120px',
      render: (r) => (
        <span
          className="font-mono text-xs font-semibold"
          style={{
            textDecoration: reviewedItems.has(r.sku) ? 'line-through' : 'none',
            color: reviewedItems.has(r.sku) ? 'var(--text-subtle)' : 'var(--accent)',
          }}
        >
          {r.sku}
        </span>
      ),
    },
    {
      header: 'Days to stockout',
      accessor: 'days_until_stockout',
      mono: true,
      width: '130px',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums font-semibold" style={{ color: 'var(--status-red-text)' }}>
          {r.days_until_stockout} days
        </span>
      ),
    },
    {
      header: 'Disruption Root Cause',
      accessor: 'cause',
      render: (r) => <span style={{ fontSize: 13 }}>{r.cause}</span>,
    },
    {
      header: 'Severity',
      accessor: 'severity',
      width: '100px',
      render: (r) => <StatusChip status={r.severity} />,
    },
    {
      header: 'Prescribed Directive',
      accessor: 'recommended_action',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12 }}>{r.recommended_action}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleCopy(`${r.sku}: ${r.recommended_action} (Qty: ${r.suggested_reorder_qty})`, r.sku)}
              title="Copy recommendation"
            >
              {copiedId === r.sku ? <Check size={12} color="#16A34A" /> : <Copy size={12} />}
            </Button>
            <Button
              size="sm"
              variant={reviewedItems.has(r.sku) ? 'secondary' : 'ghost'}
              onClick={() => toggleReviewed(r.sku)}
            >
              {reviewedItems.has(r.sku) ? 'Reviewed' : 'Review'}
            </Button>
          </div>
        </div>
      ),
    },
    {
      header: 'Reorder Qty',
      accessor: 'suggested_reorder_qty',
      mono: true,
      align: 'right',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums font-semibold">
          {numFormat.format(r.suggested_reorder_qty || 0)} units
        </span>
      ),
    },
  ];

  const shipmentActionColumns = [
    {
      header: 'Consignment ID',
      accessor: 'shipment_id',
      mono: true,
      width: '140px',
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-accent">
          SHP-{r.shipment_id.slice(-6).toUpperCase()}
        </span>
      ),
    },
    {
      header: 'Required Intervention',
      accessor: 'action',
      width: '140px',
      render: (r) => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: r.action === 'expedite' ? 'var(--status-red-text)' : 'var(--status-amber-text)',
          }}
        >
          {r.action}
        </span>
      ),
    },
    {
      header: 'Operational Justification',
      accessor: 'reason',
      render: (r) => <span style={{ fontSize: 13 }}>{r.reason}</span>,
    },
    {
      header: '',
      align: 'right',
      width: '100px',
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={() => navigate('/shipments')}>
          Open lane
        </Button>
      ),
    },
  ];

  const historyColumns = [
    {
      header: 'Timestamp',
      accessor: 'created_at',
      mono: true,
      width: '160px',
      render: (r) => {
        const time = r.created_at
          ? new Date(r.created_at).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          : '—';
        return <span className="font-mono text-xs tabular-nums text-muted">{time}</span>;
      },
    },
    {
      header: 'System Risk',
      accessor: 'overall_risk',
      width: '120px',
      render: (r) => <StatusChip status={r.overall_risk} />,
    },
    {
      header: 'Inference Engine',
      accessor: 'source',
      width: '140px',
      render: (r) => (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {r.source === 'gemini' ? 'Gemini 2.5 Flash' : 'Rule-based fallback'}
        </span>
      ),
    },
    {
      header: 'Assessment Summary',
      accessor: 'summary',
      render: (r) => <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.summary}</div>,
    },
    {
      header: '',
      align: 'right',
      width: '80px',
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setCurrentAnalysis(r);
            toast.success('Loaded historical assessment.');
          }}
        >
          Load
        </Button>
      ),
    },
  ];

  const lastRunTime = currentAnalysis?.created_at
    ? new Date(currentAnalysis.created_at).toLocaleString('en-IN', {
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
        breadcrumbs={[{ label: 'Operations' }, { label: 'Risk Analysis' }]}
        title="Supply Chain Risk Intelligence"
        subtitle="Predictive stockout modeling, carrier lane variance analysis, and automated mitigation directives."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastRunTime && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Last evaluated: {lastRunTime}
              </span>
            )}
            <Button
              variant="primary"
              icon={Play}
              loading={analyzing}
              onClick={runAnalysis}
            >
              Run analysis
            </Button>
          </div>
        }
      />

      <div className="page-content-scroll">
        {/* Progress State when Running (Step text + skeleton rows, not a blank page) */}
        {analyzing && (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: '3px solid var(--accent)',
              borderRadius: 4,
              padding: '16px 20px',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid var(--accent)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                {progressSteps[progressStep]}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                Step {progressStep + 1} of 3
              </span>
            </div>
            <div style={{ height: 3, backgroundColor: 'var(--border-color)', borderRadius: 1, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${((progressStep + 1) / 3) * 100}%`,
                  backgroundColor: 'var(--accent)',
                  transition: 'width 300ms ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Current Assessment Display */}
        {currentAnalysis && (
          <>
            {/* Thin Bordered Risk Banner with Colored Left Edge */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderLeft:
                  currentAnalysis.overall_risk === 'high'
                    ? '3px solid var(--status-red-dot)'
                    : currentAnalysis.overall_risk === 'medium'
                      ? '3px solid var(--status-amber-dot)'
                      : '3px solid var(--status-green-dot)',
                borderRadius: 4,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    System Disruption Risk:
                  </span>
                  <StatusChip status={currentAnalysis.overall_risk} />
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-subtle)',
                      padding: '1px 6px',
                      borderRadius: 2,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Engine: {currentAnalysis.source === 'gemini' ? 'Gemini 2.5 Flash' : 'Rule-based fallback'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-main)', lineHeight: 1.45 }}>
                  {currentAnalysis.summary}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    At-risk SKUs
                  </div>
                  <div className="font-mono text-base font-semibold" style={{ color: 'var(--status-red-text)' }}>
                    {currentAnalysis.at_risk_skus?.length || 0}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Carrier Expedites
                  </div>
                  <div className="font-mono text-base font-semibold" style={{ color: 'var(--status-amber-text)' }}>
                    {currentAnalysis.shipment_actions?.length || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Ranked At-Risk SKUs Table */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                  Ranked Impending Stockouts ({currentAnalysis.at_risk_skus?.length || 0})
                </h2>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Items sorted by depletion trajectory
                </span>
              </div>

              <DataTable
                columns={atRiskColumns}
                data={currentAnalysis.at_risk_skus || []}
                loading={false}
                pagination={false}
                emptyMessage="No immediate stockout risks detected in the active horizon."
              />
            </div>

            {/* Prescribed Carrier Interventions */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                  Prescribed Carrier Expedite Directives ({currentAnalysis.shipment_actions?.length || 0})
                </h2>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Required logistics lane adjustments
                </span>
              </div>

              <DataTable
                columns={shipmentActionColumns}
                data={currentAnalysis.shipment_actions || []}
                loading={false}
                pagination={false}
                emptyMessage="No urgent lane expedite orders required."
              />
            </div>

            {/* Analysis History */}
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
                  Assessment Audit History ({history.length})
                </h2>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Prior automated and manual synthesis runs
                </span>
              </div>

              <DataTable
                columns={historyColumns}
                data={history}
                loading={loadingHistory}
                pageSize={5}
                pagination={true}
                emptyMessage="No historical runs stored."
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
