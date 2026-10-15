import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { shipmentAPI, warehouseAPI, productAPI } from '../services/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusChip from '../components/ui/StatusChip';
import Drawer from '../components/ui/Drawer';
import Timeline from '../components/ui/Timeline';
import DefinitionList from '../components/ui/DefinitionList';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import {
  Plus,
  RefreshCw,
  Search,
  ArrowRight,
  Sparkles,
  ChevronDown,
  X,
} from 'lucide-react';

export default function Shipments() {
  const [searchParams] = useSearchParams();
  const [shipments, setShipments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter Tabs & Search
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState(searchParams.get('q') || '');

  // Detail Drawer
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // AI Unstructured Note state
  const [nlpNote, setNlpNote] = useState('');
  const [nlpParsing, setNlpParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState(null);
  const [loggingEvent, setLoggingEvent] = useState(false);

  // New Shipment Drawer
  const [newShipmentDrawerOpen, setNewShipmentDrawerOpen] = useState(false);
  const [newShipmentForm, setNewShipmentForm] = useState({
    supplier: '',
    origin: '',
    destination_warehouse_id: '',
    eta: '',
    items: [{ product_id: '', quantity: 100 }],
  });
  const [submittingShipment, setSubmittingShipment] = useState(false);

  const numFormat = new Intl.NumberFormat('en-IN');

  const loadData = async () => {
    setLoading(true);
    try {
      const [shipRes, whRes, prodRes] = await Promise.all([
        shipmentAPI.list(),
        warehouseAPI.list(),
        productAPI.list(),
      ]);
      setShipments(shipRes.data || []);
      setWarehouses(whRes.data || []);
      setProducts(prodRes.data || []);
    } catch {
      toast.error('Could not load shipments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const tabCounts = useMemo(() => {
    return {
      all: shipments.length,
      in_transit: shipments.filter((s) => s.status === 'in_transit').length,
      delayed: shipments.filter((s) => s.status === 'delayed' || s.delay_days > 0).length,
      ordered: shipments.filter((s) => s.status === 'ordered').length,
      delivered: shipments.filter((s) => s.status === 'delivered').length,
    };
  }, [shipments]);

  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      const matchesTab =
        statusTab === 'all' ||
        (statusTab === 'delayed' ? (s.status === 'delayed' || s.delay_days > 0) : s.status === statusTab);

      const matchesSearch =
        !search ||
        s.supplier?.toLowerCase().includes(search.toLowerCase()) ||
        s.origin?.toLowerCase().includes(search.toLowerCase()) ||
        s.id?.toLowerCase().includes(search.toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [shipments, statusTab, search]);

  // Open Detail Drawer
  const openDetail = async (shipmentId) => {
    setLoadingDetail(true);
    setDetailDrawerOpen(true);
    setParsedResult(null);
    setNlpNote('');
    setStatusMenuOpen(false);
    try {
      const res = await shipmentAPI.get(shipmentId);
      setSelectedShipment(res.data);
    } catch {
      toast.error('Could not load shipment details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Status Change Dropdown Action
  const handleStatusChange = async (newStatus, delayDays = 0) => {
    if (!selectedShipment) return;
    setStatusMenuOpen(false);
    try {
      await shipmentAPI.updateStatus(selectedShipment.id, newStatus, delayDays);
      toast.success(`Shipment status set to ${newStatus.replace('_', ' ')}.`);
      setSelectedShipment((prev) => ({ ...prev, status: newStatus, delay_days: delayDays }));
      loadData();
    } catch {
      toast.error('Status transition failed.');
    }
  };

  // AI Parse Note
  const handleParseNote = async () => {
    if (!nlpNote.trim() || !selectedShipment) return;
    setNlpParsing(true);
    try {
      const res = await shipmentAPI.parseNote(selectedShipment.id, nlpNote);
      setParsedResult(res.data);
      toast.success('Logistics note parsed.');
    } catch {
      toast.error('Could not extract logistics event from note.');
    } finally {
      setNlpParsing(false);
    }
  };

  // Confirm Parsed Event
  const handleApplyParsedEvent = async () => {
    if (!parsedResult || !selectedShipment) return;
    setLoggingEvent(true);
    try {
      await shipmentAPI.addEvent(selectedShipment.id, {
        location: parsedResult.location || 'In Transit',
        status: parsedResult.status || selectedShipment.status,
        note: parsedResult.note || nlpNote,
        delay_days: parsedResult.delay_days || 0,
      });
      toast.success('Checkpoint logged to tracking timeline.');
      setParsedResult(null);
      setNlpNote('');
      openDetail(selectedShipment.id);
      loadData();
    } catch {
      toast.error('Failed to append checkpoint.');
    } finally {
      setLoggingEvent(false);
    }
  };

  // Create Shipment
  const handleCreateShipment = async (e) => {
    e.preventDefault();
    if (!newShipmentForm.supplier || !newShipmentForm.destination_warehouse_id || !newShipmentForm.eta) {
      toast.error('All mandatory fields are required.');
      return;
    }
    setSubmittingShipment(true);
    try {
      await shipmentAPI.create({
        supplier: newShipmentForm.supplier,
        origin: newShipmentForm.origin,
        destination_warehouse_id: newShipmentForm.destination_warehouse_id,
        eta: newShipmentForm.eta,
        items: newShipmentForm.items.map((it) => ({
          product_id: it.product_id,
          quantity: parseInt(it.quantity, 10) || 1,
        })),
      });
      toast.success('Inbound shipment registered.');
      setNewShipmentDrawerOpen(false);
      loadData();
    } catch {
      toast.error('Failed to register shipment.');
    } finally {
      setSubmittingShipment(false);
    }
  };

  const columns = [
    {
      header: 'Shipment ID',
      accessor: 'id',
      sortable: true,
      mono: true,
      width: '130px',
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-accent">
          SHP-{r.id.slice(-6).toUpperCase()}
        </span>
      ),
    },
    {
      header: 'Supplier / Consignor',
      accessor: 'supplier',
      sortable: true,
      render: (r) => <div style={{ fontWeight: 500 }}>{r.supplier}</div>,
    },
    {
      header: 'Route (Origin -> Destination)',
      sortable: true,
      render: (r) => {
        const destWh = warehouses.find((w) => w.id === r.destination_warehouse_id);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span>{r.origin || 'Origin'}</span>
            <ArrowRight size={12} strokeWidth={1.5} color="var(--text-subtle)" />
            <span style={{ fontWeight: 500 }}>{destWh?.name || 'Distribution Hub'}</span>
          </div>
        );
      },
    },
    {
      header: 'Carrier',
      accessor: 'created_by',
      width: '130px',
      render: (r) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {r.created_by?.split('@')[0] || 'Roadways Express'}
        </span>
      ),
    },
    {
      header: 'Current ETA',
      accessor: 'eta',
      sortable: true,
      width: '120px',
      render: (r) => {
        const formatted = r.eta
          ? new Date(r.eta).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
          : '—';
        return <span className="font-mono text-xs tabular-nums">{formatted}</span>;
      },
    },
    {
      header: 'Variance',
      accessor: 'delay_days',
      sortable: true,
      width: '100px',
      render: (r) => {
        if (r.delay_days > 0) {
          return (
            <span
              className="font-mono text-xs tabular-nums font-semibold"
              style={{ color: 'var(--status-amber-text)' }}
            >
              +{r.delay_days}d
            </span>
          );
        }
        return <span className="font-mono text-xs text-muted">0d</span>;
      },
    },
    {
      header: 'Status',
      accessor: 'status',
      width: '120px',
      render: (r) => <StatusChip status={r.status} />,
    },
    {
      header: '',
      align: 'right',
      width: '80px',
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={() => openDetail(r.id)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Operations' }, { label: 'Shipments' }]}
        title="Inbound Shipments"
        subtitle="Freight transit tracking, customs milestones, and carrier variance auditing."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={loadData}>
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                setNewShipmentForm({
                  supplier: '',
                  origin: '',
                  destination_warehouse_id: warehouses[0]?.id || '',
                  eta: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
                  items: [{ product_id: products[0]?.id || '', quantity: 100 }],
                });
                setNewShipmentDrawerOpen(true);
              }}
            >
              New shipment
            </Button>
          </div>
        }
      />

      <div className="page-content-scroll">
        {/* Status Filter Tabs Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: 12,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 2 }}>
            {[
              { id: 'all', label: 'All', count: tabCounts.all },
              { id: 'in_transit', label: 'In transit', count: tabCounts.in_transit },
              { id: 'delayed', label: 'Delayed', count: tabCounts.delayed },
              { id: 'ordered', label: 'Ordered', count: tabCounts.ordered },
              { id: 'delivered', label: 'Delivered', count: tabCounts.delivered },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusTab(tab.id)}
                style={{
                  height: 36,
                  padding: '0 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: statusTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: statusTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: statusTab === tab.id ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{tab.label}</span>
                <span
                  className="font-mono text-xs tabular-nums"
                  style={{
                    backgroundColor: statusTab === tab.id ? 'var(--bg-subtle)' : '#ECEEF2',
                    padding: '1px 5px',
                    borderRadius: 2,
                    fontSize: 11,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', width: 260 }}>
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
              placeholder="Search supplier, route, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredShipments}
          loading={loading}
          pageSize={25}
          pagination={true}
          emptyMessage="No shipments match the selected status filter."
          onRowClick={(row) => openDetail(row.id)}
        />
      </div>

      {/* Screen 5: Shipment Detail Slide-In Drawer */}
      <Drawer
        isOpen={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        title={selectedShipment ? `Shipment SHP-${selectedShipment.id.slice(-6).toUpperCase()}` : 'Shipment Detail'}
        subtitle={selectedShipment ? `${selectedShipment.supplier} · Manifest Details & Audit Trail` : ''}
        width={580}
        footer={
          <Button variant="secondary" onClick={() => setDetailDrawerOpen(false)}>
            Close
          </Button>
        }
      >
        {loadingDetail || !selectedShipment ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading shipment record...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status Change Dropdown Action Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: '#F8FAFC',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  CURRENT STATUS:
                </span>
                <StatusChip status={selectedShipment.status} />
              </div>

              {/* Status Action Dropdown */}
              <div style={{ position: 'relative' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                >
                  <span>Update status</span>
                  <ChevronDown size={13} strokeWidth={1.5} />
                </Button>

                {statusMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 32,
                      width: 170,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid var(--border-color)',
                      borderRadius: 4,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      zIndex: 30,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', height: 30, borderRadius: 0, fontSize: 12 }}
                      onClick={() => handleStatusChange('in_transit', 0)}
                    >
                      In transit (on-time)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', height: 30, borderRadius: 0, fontSize: 12, color: 'var(--status-amber-text)' }}
                      onClick={() => handleStatusChange('delayed', selectedShipment.delay_days || 3)}
                    >
                      Flag delayed (+3d)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', height: 30, borderRadius: 0, fontSize: 12, color: 'var(--status-green-text)' }}
                      onClick={() => handleStatusChange('delivered', 0)}
                    >
                      Mark delivered
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 2-Column Definition List of Key Facts */}
            <DefinitionList
              columns={2}
              items={[
                { label: 'Shipment ID', value: `SHP-${selectedShipment.id.slice(-6).toUpperCase()}`, mono: true },
                { label: 'Supplier', value: selectedShipment.supplier },
                { label: 'Origin Point', value: selectedShipment.origin || 'Factory Direct' },
                { label: 'Destination Hub', value: selectedShipment.destination_warehouse?.name || 'Warehouse' },
                {
                  label: 'Estimated Arrival',
                  value: selectedShipment.eta
                    ? new Date(selectedShipment.eta).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                    : '—',
                  mono: true,
                },
                {
                  label: 'Delay Variance',
                  value: selectedShipment.delay_days > 0 ? `+${selectedShipment.delay_days} days` : '0 days on schedule',
                  color: selectedShipment.delay_days > 0 ? 'var(--status-amber-text)' : 'var(--status-green-text)',
                  mono: true,
                },
              ]}
            />

            {/* Manifest Cargo Line Items */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 6,
                }}
              >
                Manifest Cargo Items ({selectedShipment.items?.length || 0})
              </div>
              <div className="table-container">
                <table className="dense-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedShipment.items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td className="font-mono text-xs font-semibold text-accent">
                          {it.product?.sku || it.product_id}
                        </td>
                        <td style={{ fontSize: 13 }}>{it.product?.name || 'General Inventory'}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-xs tabular-nums font-semibold">
                          {numFormat.format(it.quantity || 0)} units
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Logistics Note Parser (Operational Layout) */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Sparkles size={14} strokeWidth={1.5} color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>
                  Extract Logistics Checkpoint (Gemini AI)
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Paste driver SMS, customs notice, or freight broker email to parse structured milestones.
              </div>

              <textarea
                className="input-base"
                style={{ height: 60, padding: 8, fontSize: 12, resize: 'vertical' }}
                placeholder="e.g. Truck breakdown near Nashik Highway on NH48. Waiting for spare alternator. Delayed 3 days."
                value={nlpNote}
                onChange={(e) => setNlpNote(e.target.value)}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="primary"
                  loading={nlpParsing}
                  onClick={handleParseNote}
                  disabled={!nlpNote.trim()}
                >
                  Extract checkpoint
                </Button>
              </div>

              {parsedResult && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Detected location: </span>
                      <strong>{parsedResult.location || 'In transit'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Status / Delay: </span>
                      <strong style={{ color: parsedResult.delay_days > 0 ? 'var(--status-amber-text)' : 'inherit' }}>
                        {parsedResult.status} (+{parsedResult.delay_days || 0}d)
                      </strong>
                    </div>
                  </div>
                  <div style={{ marginBottom: 8, color: 'var(--text-muted)' }}>
                    Summary: {parsedResult.note}
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={loggingEvent}
                    onClick={handleApplyParsedEvent}
                  >
                    Commit checkpoint to timeline
                  </Button>
                </div>
              )}
            </div>

            {/* Tracking Milestones Timeline */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 10,
                }}
              >
                Tracking Milestones ({selectedShipment.tracking_events?.length || 0})
              </div>
              <Timeline events={selectedShipment.tracking_events || []} />
            </div>
          </div>
        )}
      </Drawer>

      {/* New Shipment Drawer */}
      <Drawer
        isOpen={newShipmentDrawerOpen}
        onClose={() => setNewShipmentDrawerOpen(false)}
        title="Register Inbound Cargo Shipment"
        subtitle="Create carrier consignment order with associated manifest line items"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewShipmentDrawerOpen(false)} disabled={submittingShipment}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateShipment} loading={submittingShipment}>
              Register shipment
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateShipment}>
          <Input
            label="Supplier / Consignor Name"
            id="ship-supplier"
            placeholder="e.g. Alpha Electronics Pvt Ltd"
            value={newShipmentForm.supplier}
            onChange={(e) => setNewShipmentForm({ ...newShipmentForm, supplier: e.target.value })}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Origin City / Port"
              id="ship-origin"
              placeholder="e.g. Shenzhen, China or Pune, MH"
              value={newShipmentForm.origin}
              onChange={(e) => setNewShipmentForm({ ...newShipmentForm, origin: e.target.value })}
            />
            <Select
              label="Destination Warehouse"
              id="ship-dest"
              value={newShipmentForm.destination_warehouse_id}
              onChange={(e) => setNewShipmentForm({ ...newShipmentForm, destination_warehouse_id: e.target.value })}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.location.split(',')[0]})
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Estimated Arrival (ETA)"
            id="ship-eta"
            type="date"
            value={newShipmentForm.eta}
            onChange={(e) => setNewShipmentForm({ ...newShipmentForm, eta: e.target.value })}
            required
          />

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                Cargo Manifest Line Items
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setNewShipmentForm({
                    ...newShipmentForm,
                    items: [...newShipmentForm.items, { product_id: products[0]?.id || '', quantity: 100 }],
                  })
                }
              >
                + Add item
              </Button>
            </div>

            {newShipmentForm.items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ flex: 2 }}>
                  <select
                    className="select-base"
                    style={{ width: '100%' }}
                    value={it.product_id}
                    onChange={(e) => {
                      const updated = [...newShipmentForm.items];
                      updated[idx].product_id = e.target.value;
                      setNewShipmentForm({ ...newShipmentForm, items: updated });
                    }}
                    required
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 100 }}>
                  <input
                    type="number"
                    min="1"
                    className="input-base"
                    placeholder="Qty"
                    value={it.quantity}
                    onChange={(e) => {
                      const updated = [...newShipmentForm.items];
                      updated[idx].quantity = e.target.value;
                      setNewShipmentForm({ ...newShipmentForm, items: updated });
                    }}
                    required
                  />
                </div>
                {newShipmentForm.items.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 28, height: 28, padding: 0 }}
                    onClick={() => {
                      const updated = newShipmentForm.items.filter((_, i) => i !== idx);
                      setNewShipmentForm({ ...newShipmentForm, items: updated });
                    }}
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </form>
      </Drawer>
    </>
  );
}
