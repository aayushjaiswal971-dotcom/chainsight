import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import Button from './Button';

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No records found.',
  onRowClick,
  pageSize = 25,
  pagination = true,
  actionButton,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (key) => {
    if (sortKey === key) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else {
        setSortKey(null);
        setSortOrder('asc');
      }
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (aVal === undefined || aVal === null) aVal = '';
      if (bVal === undefined || bVal === null) bVal = '';

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortOrder === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [data, sortKey, sortOrder]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, pagination]);

  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, sortedData.length);

  return (
    <div className="table-container">
      <div style={{ overflowX: 'auto', width: '100%', maxHeight: '680px' }}>
        <table className="dense-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    cursor: col.sortable ? 'pointer' : 'default',
                    textAlign: col.align || 'left',
                    width: col.width || 'auto',
                  }}
                  onClick={() => col.sortable && handleSort(col.accessor)}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                      width: '100%',
                    }}
                  >
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span style={{ color: sortKey === col.accessor ? 'var(--text-main)' : 'var(--text-subtle)' }}>
                        {sortKey === col.accessor ? (
                          sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, rIdx) => (
                <tr key={rIdx}>
                  {columns.map((_, cIdx) => (
                    <td key={cIdx}>
                      <div
                        style={{
                          height: 14,
                          backgroundColor: 'var(--bg-subtle)',
                          borderRadius: 2,
                          width: `${50 + (cIdx * 15) % 45}%`,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{emptyMessage}</div>
                  {actionButton && (
                    <div style={{ marginTop: 10 }}>{actionButton}</div>
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={row.id || rIdx}
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {columns.map((col, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        textAlign: col.align || 'left',
                        fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                      }}
                    >
                      {col.render ? col.render(row) : row[col.accessor]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && !loading && sortedData.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-subtle)',
          }}
        >
          <div>
            Showing <span className="tabular-nums font-semibold">{startRecord}</span>–
            <span className="tabular-nums font-semibold">{endRecord}</span> of{' '}
            <span className="tabular-nums font-semibold">{sortedData.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
