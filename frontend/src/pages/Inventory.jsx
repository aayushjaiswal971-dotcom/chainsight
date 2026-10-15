import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inventoryAPI, warehouseAPI, productAPI } from '../services/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import FilterBar from '../components/ui/FilterBar';
import StatusChip from '../components/ui/StatusChip';
import Drawer from '../components/ui/Drawer';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Download, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';

export default function Inventory() {
  const [searchParams] = useSearchParams();
  const [stocks, setStocks] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'low', 'normal'

  // Right-side Drawer: Adjust Stock
  const [adjustDrawerOpen, setAdjustDrawerOpen] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    product_id: '',
    warehouse_id: '',
    direction: 'add', // 'add' or 'subtract'
    quantity: '',
    reason: '',
  });
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  // Right-side Drawer: Create SKU
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [productForm, setProductForm] = useState({
    sku: '',
    name: '',
    category: '',
    unit_cost: '',
    reorder_level: '',
    daily_usage: '',
  });
  const [productSubmitting, setProductSubmitting] = useState(false);

  const numFormat = new Intl.NumberFormat('en-IN');
  const currencyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockRes, whRes, prodRes] = await Promise.all([
        inventoryAPI.list(),
        warehouseAPI.list(),
        productAPI.list(),
      ]);
      setStocks(stockRes.data || []);
      setWarehouses(whRes.data || []);
      setProducts(prodRes.data || []);
    } catch {
      toast.error('Could not load inventory records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set);
  }, [products]);

  const filteredStocks = useMemo(() => {
    return stocks.filter((s) => {
      const prod = s.product || {};
      const wh = s.warehouse || {};

      const matchesSearch =
        !search ||
        prod.sku?.toLowerCase().includes(search.toLowerCase()) ||
        prod.name?.toLowerCase().includes(search.toLowerCase()) ||
        wh.name?.toLowerCase().includes(search.toLowerCase());

      const matchesWarehouse = selectedWarehouse === 'all' || s.warehouse_id === selectedWarehouse;
      const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;

      let matchesStatus = true;
      if (statusFilter === 'low') matchesStatus = s.is_low_stock;
      else if (statusFilter === 'normal') matchesStatus = !s.is_low_stock;

      return matchesSearch && matchesWarehouse && matchesCategory && matchesStatus;
    });
  }, [stocks, search, selectedWarehouse, selectedCategory, statusFilter]);

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const response = await inventoryAPI.exportCSV();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_master_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Inventory report exported.');
    } catch {
      toast.error('Export failed.');
    }
  };

  // Open adjust stock drawer
  const openAdjustDrawer = (item = null) => {
    setSelectedStockItem(item);
    setAdjustForm({
      product_id: item?.product_id || (products[0]?.id || ''),
      warehouse_id: item?.warehouse_id || (warehouses[0]?.id || ''),
      direction: 'add',
      quantity: '',
      reason: item ? `Cycle count adjustment for SKU ${item.product?.sku}` : 'ASN inbound receipt',
    });
    setAdjustDrawerOpen(true);
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    const qty = parseInt(adjustForm.quantity, 10);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid non-zero adjustment quantity.');
      return;
    }
    const delta = adjustForm.direction === 'add' ? qty : -qty;
    setAdjustSubmitting(true);
    try {
      await inventoryAPI.adjust({
        product_id: adjustForm.product_id,
        warehouse_id: adjustForm.warehouse_id,
        quantity_change: delta,
        reason: adjustForm.reason,
      });
      toast.success('Inventory balance updated.');
      setAdjustDrawerOpen(false);
      loadData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not adjust inventory balance.';
      toast.error(msg);
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!productForm.sku || !productForm.name) {
      toast.error('SKU and description are required.');
      return;
    }
    setProductSubmitting(true);
    try {
      await productAPI.create({
        sku: productForm.sku.toUpperCase(),
        name: productForm.name,
        category: productForm.category,
        unit_cost: parseFloat(productForm.unit_cost) || 0,
        reorder_level: parseInt(productForm.reorder_level, 10) || 10,
        daily_usage: parseFloat(productForm.daily_usage) || 1,
      });
      toast.success(`SKU ${productForm.sku.toUpperCase()} created.`);
      setProductDrawerOpen(false);
      setProductForm({ sku: '', name: '', category: '', unit_cost: '', reorder_level: '', daily_usage: '' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create product SKU.');
    } finally {
      setProductSubmitting(false);
    }
  };

  // Table Columns (Density & Operational)
  const columns = [
    {
      header: 'SKU',
      accessor: 'product.sku',
      sortable: true,
      mono: true,
      width: '120px',
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-accent">
          {r.product?.sku || 'N/A'}
        </span>
      ),
    },
    {
      header: 'Description',
      accessor: 'product.name',
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.product?.name || 'Unnamed SKU'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Category: {r.product?.category || 'General'} · Cost: {currencyFormat.format(r.product?.unit_cost || 0)}
          </div>
        </div>
      ),
    },
    {
      header: 'Warehouse',
      accessor: 'warehouse.name',
      sortable: true,
      width: '180px',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.warehouse?.name || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.warehouse?.location?.split(',')[0]}</div>
        </div>
      ),
    },
    {
      header: 'On hand',
      accessor: 'quantity',
      sortable: true,
      align: 'right',
      mono: true,
      width: '100px',
      render: (r) => (
        <span
          className="font-mono text-xs tabular-nums font-semibold"
          style={{ color: r.is_low_stock ? 'var(--status-red-text)' : 'inherit' }}
        >
          {numFormat.format(r.quantity || 0)}
        </span>
      ),
    },
    {
      header: 'Daily usage',
      accessor: 'product.daily_usage',
      sortable: true,
      align: 'right',
      mono: true,
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums text-muted">
          {r.product?.daily_usage || 1} / day
        </span>
      ),
    },
    {
      header: 'Days of cover',
      sortable: true,
      width: '140px',
      render: (r) => {
        const qty = r.quantity || 0;
        const daily = r.product?.daily_usage || 1;
        const days = (qty / daily).toFixed(1);
        const numDays = parseFloat(days);

        // Subtle inline bar
        const barWidth = Math.min(100, Math.max(8, (numDays / 30) * 100));
        let barColor = '#16A34A';
        if (numDays < 3) barColor = '#DC2626';
        else if (numDays < 7) barColor = '#D97706';

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span
              className="font-mono text-xs tabular-nums font-semibold"
              style={{ color: numDays < 7 ? barColor : 'var(--text-main)' }}
            >
              {days}d
            </span>
            <div
              style={{
                height: 3,
                width: 70,
                backgroundColor: '#E2E8F0',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${barWidth}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Reorder point',
      accessor: 'product.reorder_level',
      sortable: true,
      align: 'right',
      mono: true,
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums text-muted">
          {numFormat.format(r.product?.reorder_level || 0)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'is_low_stock',
      width: '110px',
      render: (r) => (
        <StatusChip
          status={r.is_low_stock ? 'critical' : 'healthy'}
          label={r.is_low_stock ? 'Low stock' : 'Healthy'}
        />
      ),
    },
    {
      header: '',
      align: 'right',
      width: '80px',
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openAdjustDrawer(r); }}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Operations' }, { label: 'Inventory' }]}
        title="Inventory Master"
        subtitle="SKU balances across distribution network, burn rates, and replenishment thresholds."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={loadData}>
              Refresh
            </Button>
            <Button variant="secondary" icon={Download} onClick={handleExportCSV}>
              Export CSV
            </Button>
            <Button variant="secondary" icon={Plus} onClick={() => setProductDrawerOpen(true)}>
              New SKU
            </Button>
            <Button variant="primary" icon={SlidersHorizontal} onClick={() => openAdjustDrawer()}>
              Adjust stock
            </Button>
          </div>
        }
      />

      <div className="page-content-scroll">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Filter by SKU, description, or hub..."
          filters={[
            {
              label: 'Warehouse',
              value: selectedWarehouse,
              onChange: setSelectedWarehouse,
              options: [
                { label: 'All Warehouses', value: 'all' },
                ...warehouses.map((w) => ({ label: w.name, value: w.id })),
              ],
            },
            {
              label: 'Category',
              value: selectedCategory,
              onChange: setSelectedCategory,
              options: [
                { label: 'All Categories', value: 'all' },
                ...categories.map((c) => ({ label: c, value: c })),
              ],
            },
            {
              label: 'Stock Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { label: 'All Statuses', value: 'all' },
                { label: 'Low stock only', value: 'low' },
                { label: 'Healthy stock only', value: 'normal' },
              ],
            },
          ]}
          onClear={() => {
            setSearch('');
            setSelectedWarehouse('all');
            setSelectedCategory('all');
            setStatusFilter('all');
          }}
        />

        <DataTable
          columns={columns}
          data={filteredStocks}
          loading={loading}
          pageSize={25}
          pagination={true}
          emptyMessage="No inventory rows match the selected filters."
          onRowClick={(row) => openAdjustDrawer(row)}
        />
      </div>

      {/* Right-side Flyout Drawer: Stock Adjustment */}
      <Drawer
        isOpen={adjustDrawerOpen}
        onClose={() => setAdjustDrawerOpen(false)}
        title="Adjust Stock Level"
        subtitle={
          selectedStockItem
            ? `SKU: ${selectedStockItem.product?.sku} · ${selectedStockItem.warehouse?.name}`
            : 'Execute atomic inventory adjustment'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustDrawerOpen(false)} disabled={adjustSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAdjustSubmit} loading={adjustSubmitting}>
              Commit adjustment
            </Button>
          </>
        }
      >
        <form onSubmit={handleAdjustSubmit}>
          <Select
            label="Product SKU"
            id="adjust-product"
            value={adjustForm.product_id}
            onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })}
            required
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </Select>

          <Select
            label="Target Warehouse Hub"
            id="adjust-wh"
            value={adjustForm.warehouse_id}
            onChange={(e) => setAdjustForm({ ...adjustForm, warehouse_id: e.target.value })}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.location.split(',')[0]})
              </option>
            ))}
          </Select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select
              label="Transaction Type"
              id="adjust-dir"
              value={adjustForm.direction}
              onChange={(e) => setAdjustForm({ ...adjustForm, direction: e.target.value })}
            >
              <option value="add">Receipt (+) Inbound</option>
              <option value="subtract">Deduction (-) Loss/Damage</option>
            </Select>

            <Input
              label="Units"
              id="adjust-qty"
              type="number"
              min="1"
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
              placeholder="e.g. 50"
              required
            />
          </div>

          <Input
            label="Audit Justification / Reference"
            id="adjust-reason"
            type="text"
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
            placeholder="e.g. ASN PO-88213 inbound or cycle count variance"
            required
          />

          <div
            style={{
              padding: '10px 12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 12,
            }}
          >
            <strong>Note:</strong> Adjustments execute as an atomic database transaction. Balances cannot drop below zero.
          </div>
        </form>
      </Drawer>

      {/* Right-side Flyout Drawer: New SKU Creation */}
      <Drawer
        isOpen={productDrawerOpen}
        onClose={() => setProductDrawerOpen(false)}
        title="Create Product Catalog SKU"
        subtitle="Register new master inventory item and baseline reorder targets"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProductDrawerOpen(false)} disabled={productSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateProduct} loading={productSubmitting}>
              Create SKU
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateProduct}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="SKU Code"
              id="sku-code"
              placeholder="e.g. ELE-007"
              value={productForm.sku}
              onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
              required
            />
            <Input
              label="Category"
              id="sku-cat"
              placeholder="e.g. Electronics, Tools"
              value={productForm.category}
              onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
            />
          </div>

          <Input
            label="Product Description"
            id="sku-name"
            placeholder="e.g. High-speed USB-C Braided Cable 1m"
            value={productForm.name}
            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Unit Cost (INR)"
              id="sku-cost"
              type="number"
              step="0.01"
              placeholder="₹ 450.00"
              value={productForm.unit_cost}
              onChange={(e) => setProductForm({ ...productForm, unit_cost: e.target.value })}
            />
            <Input
              label="Reorder Threshold"
              id="sku-reorder"
              type="number"
              placeholder="30"
              value={productForm.reorder_level}
              onChange={(e) => setProductForm({ ...productForm, reorder_level: e.target.value })}
            />
          </div>

          <Input
            label="Average Daily Burn Rate"
            id="sku-daily"
            type="number"
            step="0.1"
            placeholder="5.0"
            value={productForm.daily_usage}
            onChange={(e) => setProductForm({ ...productForm, daily_usage: e.target.value })}
          />
        </form>
      </Drawer>
    </>
  );
}
