import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  ArrowRight,
  Clock,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { importAPI } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';

const ENTITIES = [
  { id: 'warehouses', label: 'Warehouses', desc: 'Storage facilities, locations, and capacities' },
  { id: 'products', label: 'Products', desc: 'SKUs, descriptions, reorder levels, categories' },
  { id: 'inventory', label: 'Inventory Snapshot', desc: 'Stock quantities per product and warehouse' },
  { id: 'shipments', label: 'Shipments', desc: 'Shipment orders, routes, origin, destination' },
  { id: 'tracking_events', label: 'Tracking Events', desc: 'Shipment event history, checkpoints, locations' },
];

export default function ImportCenter() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1); // 1: Select/Upload, 2: Mapping & Preview, 3: Validation, 4: Success
  const [selectedEntity, setSelectedEntity] = useState('warehouses');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Preview & Mapping State
  const [previewData, setPreviewData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});

  // Validation State
  const [validationResult, setValidationResult] = useState(null);
  const [removeDemo, setRemoveDemo] = useState(false);

  // Commit State
  const [commitResult, setCommitResult] = useState(null);

  // History State
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const loadHistory = async () => {
    setLoadingJobs(true);
    try {
      const res = await importAPI.getJobs();
      setJobs(res.data || []);
    } catch {
      // silently handle
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDownloadTemplate = async (format) => {
    try {
      const res = await importAPI.downloadTemplate(selectedEntity, format);
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedEntity}_template.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Downloaded ${selectedEntity} template (${format.toUpperCase()})`);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      toast.error('Only CSV and XLSX files are supported');
      return;
    }
    setFile(selectedFile);
  };

  const handleUploadAndPreview = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await importAPI.preview(selectedEntity, formData);
      setPreviewData(res.data);
      setColumnMapping(res.data.mapping || {});
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to parse file';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    setLoading(true);
    try {
      const payload = {
        file_token: previewData.file_token,
        mapping: columnMapping,
      };
      const res = await importAPI.validate(selectedEntity, payload);
      setValidationResult(res.data);
      setStep(3);
    } catch (err) {
      const msg = err.response?.data?.error || 'Validation request failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setLoading(true);
    try {
      const payload = {
        file_token: previewData.file_token,
        mapping: columnMapping,
        remove_demo: removeDemo,
      };
      const res = await importAPI.commit(selectedEntity, payload);
      setCommitResult(res.data);
      setStep(4);
      toast.success('Data imported successfully');
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.error || 'Commit failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadErrors = async (jobId) => {
    try {
      const res = await importAPI.downloadJobErrors(jobId);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `import_errors_${jobId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      toast.error('Failed to download error log');
    }
  };

  const resetImport = () => {
    setStep(1);
    setFile(null);
    setPreviewData(null);
    setColumnMapping({});
    setValidationResult(null);
    setCommitResult(null);
    setRemoveDemo(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title="Import Center"
        subtitle="Upload your organization's CSV or Excel files to populate or replace operational data"
      >
        {step > 1 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetImport}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={14} />
            Start Over
          </button>
        )}
      </PageHeader>

      <div className="page-content-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Step Progress Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: '12px 20px',
            gap: 24,
          }}
        >
          {[
            { num: 1, title: 'Upload & Template' },
            { num: 2, title: 'Column Mapping' },
            { num: 3, title: 'Validation' },
            { num: 4, title: 'Complete' },
          ].map((s, idx, arr) => {
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: isCompleted
                      ? 'var(--status-green-dot)'
                      : isActive
                      ? 'var(--accent)'
                      : 'var(--bg-subtle)',
                    color: isCompleted || isActive ? '#FFFFFF' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {isCompleted ? <Check size={14} strokeWidth={2.5} /> : s.num}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                    }}
                  >
                    {s.title}
                  </span>
                </div>
                {idx < arr.length - 1 && (
                  <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-color)', marginLeft: 8 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* STEP 1: Select Entity & Upload */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Left Card: Select Entity & Download Templates */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                1. Select Data Type
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ENTITIES.map((ent) => (
                  <div
                    key={ent.id}
                    onClick={() => setSelectedEntity(ent.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 4,
                      border: `1px solid ${selectedEntity === ent.id ? 'var(--accent)' : 'var(--border-color)'}`,
                      backgroundColor: selectedEntity === ent.id ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{ent.label}</span>
                      {selectedEntity === ent.id && <Check size={14} color="var(--accent)" />}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ent.desc}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Download Blank Schema Templates:
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleDownloadTemplate('csv')}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Download size={14} /> CSV Template
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleDownloadTemplate('xlsx')}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <FileSpreadsheet size={14} /> Excel Template
                  </button>
                </div>
              </div>
            </div>

            {/* Right Card: Upload Box */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                2. Upload Spreadsheet
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  minHeight: 200,
                  border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-dark)'}`,
                  borderRadius: 4,
                  backgroundColor: dragOver ? 'var(--accent-subtle)' : 'var(--bg-app)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  padding: 24,
                  textAlign: 'center',
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".csv,.xlsx"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                  }}
                />
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Upload size={20} color="var(--accent)" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                    {file ? file.name : 'Click to select or drag and drop file'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Supports .CSV and .XLSX files up to 5MB (max 10,000 rows)
                  </div>
                </div>
              </div>

              {file && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    style={{ padding: 4 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                disabled={!file || loading}
                onClick={handleUploadAndPreview}
                style={{
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {loading ? 'Analyzing File...' : 'Upload & Match Columns'}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Column Mapping & Data Preview */}
        {step === 2 && previewData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Column Auto-Mapping</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
                Verify and map the columns in your file to the system fields for {selectedEntity}.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {previewData.target_fields?.map((field) => {
                  const currentMapped = columnMapping[field.name] || '';
                  return (
                    <div
                      key={field.name}
                      style={{
                        padding: 12,
                        backgroundColor: 'var(--bg-app)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>
                          {field.label || field.name}
                          {field.required && <span style={{ color: 'var(--status-red-dot)', marginLeft: 4 }}>*</span>}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          {field.type}
                        </span>
                      </div>
                      <select
                        value={currentMapped}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                        className="filter-input"
                        style={{ height: 32, fontSize: 12 }}
                      >
                        <option value="">-- Do Not Import --</option>
                        {previewData.file_headers?.map((hdr) => (
                          <option key={hdr} value={hdr}>
                            {hdr}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading}
                  onClick={handleValidate}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {loading ? 'Validating...' : 'Validate Records'}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Row Preview Table */}
            {previewData.sample_rows?.length > 0 && (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Raw File Preview (First {previewData.sample_rows.length} rows)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="dense-table">
                    <thead>
                      <tr>
                        {previewData.file_headers?.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.sample_rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {previewData.file_headers?.map((h) => (
                            <td key={h}>{row[h] !== undefined ? String(row[h]) : '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Validation Results & Commit Options */}
        {step === 3 && validationResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Stats Card */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Records</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-main)', marginTop: 4 }}>
                  {validationResult.total_rows}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Valid Records</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--status-green-dot)', marginTop: 4 }}>
                  {validationResult.valid_count}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Errors Found</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: validationResult.error_count > 0 ? 'var(--status-red-dot)' : 'var(--text-muted)',
                    marginTop: 4,
                  }}
                >
                  {validationResult.error_count}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Warnings</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--status-amber-dot)', marginTop: 4 }}>
                  {validationResult.warnings_count || 0}
                </div>
              </div>
            </div>

            {/* Error Listing if any */}
            {validationResult.errors?.length > 0 && (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--status-red-border)',
                  borderRadius: 4,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <AlertTriangle size={16} color="var(--status-red-dot)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-red-text)' }}>
                    Row Validation Errors ({validationResult.errors.length})
                  </span>
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>Row #</th>
                        <th style={{ width: 140 }}>Field</th>
                        <th>Error Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.errors.map((err, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{err.row}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{err.field}</td>
                          <td style={{ color: 'var(--status-red-text)' }}>{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Commit Options Box */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>Import Options</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={removeDemo}
                  onChange={(e) => setRemoveDemo(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                <span>
                  <strong>Purge seeded demo data</strong> before importing (replaces sample demo records with your uploaded data)
                </span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={validationResult.valid_count === 0 || loading}
                  onClick={handleCommit}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {loading ? 'Committing...' : `Commit ${validationResult.valid_count} Records`}
                  <CheckCircle2 size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Success & Confirmation */}
        {step === 4 && commitResult && (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--status-green-border)',
              borderRadius: 4,
              padding: 24,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'var(--status-green-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={24} color="var(--status-green-dot)" />
            </div>

            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-main)' }}>
                Import Completed Successfully
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {commitResult.inserted_count || 0} inserted, {commitResult.updated_count || 0} updated.
                {commitResult.demo_purged && ' Demo data was cleanly purged.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetImport}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <RotateCcw size={14} />
                Import Another File
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (selectedEntity === 'warehouses' || selectedEntity === 'products' || selectedEntity === 'inventory') {
                    navigate('/inventory');
                  } else {
                    navigate('/shipments');
                  }
                }}
              >
                View Operational Data
              </button>
            </div>
          </div>
        )}

        {/* Recent Import Activity History */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: 16,
            marginTop: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} color="var(--text-muted)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Recent Imports</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={loadHistory}
              style={{ fontSize: 11, padding: '4px 8px' }}
            >
              Refresh
            </button>
          </div>

          {jobs.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              No import operations recorded yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Entity</th>
                    <th>File Name</th>
                    <th>Imported</th>
                    <th>Errors</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job._id || job.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {job.created_at ? new Date(job.created_at).toLocaleString() : '-'}
                      </td>
                      <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{job.entity}</td>
                      <td>{job.filename}</td>
                      <td style={{ color: 'var(--status-green-dot)', fontWeight: 600 }}>{job.valid_count || 0}</td>
                      <td style={{ color: job.error_count > 0 ? 'var(--status-red-dot)' : 'var(--text-muted)' }}>
                        {job.error_count || 0}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 3,
                            backgroundColor:
                              job.status === 'completed'
                                ? 'var(--status-green-bg)'
                                : job.status === 'failed'
                                ? 'var(--status-red-bg)'
                                : 'var(--bg-subtle)',
                            color:
                              job.status === 'completed'
                                ? 'var(--status-green-text)'
                                : job.status === 'failed'
                                ? 'var(--status-red-text)'
                                : 'var(--text-muted)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td>
                        {job.error_count > 0 && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleDownloadErrors(job._id || job.id)}
                            style={{ fontSize: 11, padding: '2px 6px', color: 'var(--accent)' }}
                          >
                            <Download size={12} style={{ marginRight: 4 }} />
                            Error CSV
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
