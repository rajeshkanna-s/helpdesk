import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet, Download, Search, RefreshCw, Clock,
  CheckCircle2, AlertTriangle, Layers,
  ArrowDownToLine, Zap, CheckCircle
} from 'lucide-react';
import { apiService } from '../services/api';
import type { MisTrackItem, MisSummary, DepartmentDetail, Company } from '../types';

interface MisTrackingViewProps {
  activeCompany: Company;
}

export const MisTrackingView: React.FC<MisTrackingViewProps> = ({ activeCompany }) => {
  const [items, setItems] = useState<MisTrackItem[]>([]);
  const [summary, setSummary] = useState<MisSummary | null>(null);
  const [departments, setDepartments] = useState<DepartmentDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Export Modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportRows, setExportRows] = useState<number>(100000);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  useEffect(() => {
    loadData();
  }, [activeCompany.id, deptFilter, statusFilter, priorityFilter, channelFilter, page]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sumData, trackData, deptsData] = await Promise.all([
        apiService.getMisSummary(activeCompany.id),
        apiService.getMisTracking({
          companyId: activeCompany.id,
          departmentId: deptFilter,
          status: statusFilter,
          priority: priorityFilter,
          channel: channelFilter,
          search: search.trim() ? search.trim() : undefined,
          page,
          size: 15,
        }),
        apiService.getDepartmentsWithDetails(activeCompany.id),
      ]);
      setSummary(sumData);
      setItems(trackData.content || []);
      setTotalElements(trackData.totalElements || 0);
      setDepartments(deptsData || []);
    } catch (err) {
      console.error('Failed to load MIS tracking data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    loadData();
  };

  const handleTriggerExport = (format: 'xlsx' | 'csv', rows: number) => {
    setIsExporting(true);
    setExportNotice(`Preparing high-performance streaming ${format.toUpperCase()} export (${rows.toLocaleString()} rows)...`);

    const url = format === 'xlsx'
      ? apiService.getMisExcelDownloadUrl(activeCompany.id, rows, deptFilter, statusFilter)
      : apiService.getMisCsvDownloadUrl(activeCompany.id, rows, deptFilter, statusFilter);

    // Create invisible anchor to trigger browser download
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Kuwy_MIS_Report_${activeCompany.companyCode}_${rows}_rows.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => {
      setIsExporting(false);
      setExportNotice(`Download initiated! Streamed ${rows.toLocaleString()} rows directly to Excel.`);
      setTimeout(() => setExportNotice(null), 7000);
    }, 2000);

    setShowExportModal(false);
  };

  return (
    <div className="container-fluid p-0">
      {/* 1. Header Banner & MIS Downloader */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3 bg-white p-3.5 rounded-3 border shadow-sm">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="p-2 rounded bg-primary-subtle text-primary">
              <FileSpreadsheet size={22} />
            </span>
            <h4 className="fw-bold mb-0">Track & MIS Reports</h4>
            <span className="badge bg-primary ms-1">{activeCompany.name}</span>
          </div>
          <p className="text-muted small mb-0">
            Real-time ticket tracking, SLA monitoring, and enterprise streaming Excel/CSV downloads supporting up to <strong>100,000+ rows</strong>.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1.5"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {/* Quick 100k Benchmark Download */}
          <button
            className="btn btn-outline-success btn-sm d-flex align-items-center gap-1.5 fw-semibold"
            onClick={() => handleTriggerExport('csv', 100000)}
            disabled={isExporting}
            title="Instant download of 100,000 rows in Excel-ready UTF-8 CSV"
          >
            <Zap size={15} />
            <span>Instant 100k CSV</span>
          </button>

          {/* Full Custom Excel Download Modal */}
          <button
            className="btn btn-primary btn-sm d-flex align-items-center gap-1.5 fw-semibold shadow-sm"
            onClick={() => setShowExportModal(true)}
            disabled={isExporting}
          >
            <Download size={15} />
            <span>Download MIS Report</span>
          </button>
        </div>
      </div>

      {/* Export Status Notice */}
      {exportNotice && (
        <div className="alert alert-success d-flex align-items-center gap-2 py-2 mb-3 shadow-sm border-0" role="alert">
          <CheckCircle size={18} />
          <span className="small fw-semibold">{exportNotice}</span>
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      {summary && (
        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card d-flex align-items-center gap-3">
              <div className="stat-icon bg-primary-subtle text-primary">
                <Layers size={22} />
              </div>
              <div>
                <small className="text-muted fw-semibold">Total Tracked Tickets</small>
                <h4 className="fw-bold mb-0">{summary.totalTickets}</h4>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card d-flex align-items-center gap-3">
              <div className="stat-icon bg-info-subtle text-info">
                <Clock size={22} />
              </div>
              <div>
                <small className="text-muted fw-semibold">Open & In Progress</small>
                <h4 className="fw-bold mb-0">{summary.openTickets + summary.inProgressTickets}</h4>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card d-flex align-items-center gap-3">
              <div className="stat-icon bg-success-subtle text-success">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <small className="text-muted fw-semibold">SLA Compliance Rate</small>
                <h4 className="fw-bold mb-0 text-success">{summary.slaCompliancePercentage}%</h4>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card d-flex align-items-center gap-3">
              <div className="stat-icon bg-danger-subtle text-danger">
                <AlertTriangle size={22} />
              </div>
              <div>
                <small className="text-muted fw-semibold">SLA Breached Tickets</small>
                <h4 className="fw-bold mb-0 text-danger">{summary.breachedTickets}</h4>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Comprehensive Filter Toolbar */}
      <div className="card shadow-sm border-0 mb-3">
        <div className="card-body p-3">
          <div className="row g-2 align-items-center">
            {/* Search */}
            <div className="col-12 col-md-4">
              <form onSubmit={handleSearchSubmit}>
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white border-end-0">
                    <Search size={14} className="text-muted" />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0"
                    placeholder="Search ticket #, subject, requester..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <button type="submit" className="btn btn-outline-secondary">Search</button>
                </div>
              </form>
            </div>

            {/* Department Category Filter */}
            <div className="col-6 col-md-2">
              <select
                className="form-select form-select-sm"
                value={deptFilter || ''}
                onChange={e => {
                  setDeptFilter(e.target.value ? Number(e.target.value) : undefined);
                  setPage(0);
                }}
              >
                <option value="">All Categories / Depts</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="col-6 col-md-2">
              <select
                className="form-select form-select-sm"
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div className="col-6 col-md-2">
              <select
                className="form-select form-select-sm"
                value={priorityFilter}
                onChange={e => { setPriorityFilter(e.target.value); setPage(0); }}
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            {/* Channel Filter */}
            <div className="col-6 col-md-2">
              <select
                className="form-select form-select-sm"
                value={channelFilter}
                onChange={e => { setChannelFilter(e.target.value); setPage(0); }}
              >
                <option value="ALL">All Channels</option>
                <option value="MICROSOFT_365">Microsoft 365</option>
                <option value="WEB_PORTAL">Web Portal</option>
                <option value="API">API Gateway</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Live Tracking Table */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0">Live Ticket Track Queue ({totalElements} Records)</h6>
          <small className="text-muted">Showing page {page + 1}</small>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr style={{ fontSize: '0.8rem' }}>
                  <th>Ticket #</th>
                  <th>Department / Category</th>
                  <th>Subject</th>
                  <th>Requester</th>
                  <th>Assigned Engineer</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>SLA Status</th>
                  <th>Created At</th>
                  <th>Turnaround</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-4 text-muted">
                      No records matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id} style={{ fontSize: '0.85rem' }}>
                      <td>
                        <span className="ticket-code">#{item.ticketNumber}</span>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border px-2 py-1">
                          {item.departmentName || 'General'}
                        </span>
                      </td>
                      <td className="fw-semibold text-truncate" style={{ maxWidth: '280px' }} title={item.subject}>
                        {item.subject}
                      </td>
                      <td>
                        <div className="fw-medium text-dark">{item.requesterName}</div>
                        <small className="text-muted">{item.requesterEmail}</small>
                      </td>
                      <td>
                        <span className="fw-semibold text-secondary">
                          {item.assignedAgentName || 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge-status badge-${item.status.toLowerCase()}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`badge-status badge-${item.priority.toLowerCase()}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`badge-status ${item.slaStatus === 'BREACHED' ? 'badge-urgent' : 'badge-resolved'}`}>
                          <span className={`pulse-dot ${item.slaStatus === 'BREACHED' ? 'pulse-dot-danger' : 'pulse-dot-success'}`} />
                          <span>{item.slaStatus === 'BREACHED' ? 'Breached' : 'Within SLA'}</span>
                        </span>
                      </td>
                      <td className="text-muted small">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border px-2 py-1 font-monospace">
                          {item.turnaroundHours ? `${item.turnaroundHours}h` : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Footer */}
        <div className="card-footer bg-white border-top p-3 d-flex justify-content-between align-items-center">
          <span className="text-muted small">
            Total {totalElements} tracked records in database
          </span>
          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary btn-sm"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn btn-outline-secondary btn-sm"
              disabled={items.length < 15}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 5. MIS EXPORT MODAL */}
      {showExportModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header">
                <div className="d-flex align-items-center gap-2">
                  <FileSpreadsheet className="text-primary" size={22} />
                  <h5 className="modal-title fw-bold">Download MIS Report</h5>
                </div>
                <button type="button" className="btn-close" onClick={() => setShowExportModal(false)}></button>
              </div>

              <div className="modal-body">
                <p className="text-muted small mb-3">
                  Export high-volume MIS tracking datasets with department categories, turnarounds, timestamps, and SLA metrics.
                  Powered by <strong>Apache POI SXSSFWorkbook</strong> streaming to guarantee zero memory spikes even for <strong>100,000+ rows</strong>.
                </p>

                {/* Row Volume Selection */}
                <div className="mb-3">
                  <label className="form-label fw-bold small">Export Volume (Rows)</label>
                  <div className="d-grid gap-2">
                    {[
                      { label: 'Current Filter Records', val: 1000 },
                      { label: '10,000 Rows (Monthly Aggregate)', val: 10000 },
                      { label: '50,000 Rows (Quarterly Audit)', val: 50000 },
                      { label: '100,000 Rows (Enterprise MIS Stress Test)', val: 100000 },
                    ].map(opt => (
                      <div
                        key={opt.val}
                        className={`p-2.5 rounded-3 border d-flex justify-content-between align-items-center cursor-pointer ${exportRows === opt.val ? 'border-primary bg-primary-subtle text-primary fw-bold' : 'bg-light'}`}
                        onClick={() => setExportRows(opt.val)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span>{opt.label}</span>
                        <span className="badge bg-secondary">{opt.val.toLocaleString()} rows</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* File Format Selection */}
                <div className="mb-3">
                  <label className="form-label fw-bold small">File Format</label>
                  <div className="row g-2">
                    <div className="col-6">
                      <div
                        className={`p-2.5 rounded-3 border text-center ${exportFormat === 'xlsx' ? 'border-primary bg-primary-subtle text-primary fw-bold' : 'bg-light'}`}
                        onClick={() => setExportFormat('xlsx')}
                        style={{ cursor: 'pointer' }}
                      >
                        <FileSpreadsheet size={20} className="mb-1 d-block mx-auto" />
                        <div>Excel (.xlsx)</div>
                        <small className="text-muted" style={{ fontSize: '0.7rem' }}>SXSSFWorkbook Styled</small>
                      </div>
                    </div>
                    <div className="col-6">
                      <div
                        className={`p-2.5 rounded-3 border text-center ${exportFormat === 'csv' ? 'border-primary bg-primary-subtle text-primary fw-bold' : 'bg-light'}`}
                        onClick={() => setExportFormat('csv')}
                        style={{ cursor: 'pointer' }}
                      >
                        <Zap size={20} className="mb-1 d-block mx-auto text-success" />
                        <div>CSV (Excel-Ready)</div>
                        <small className="text-muted" style={{ fontSize: '0.7rem' }}>UTF-8 BOM Streaming</small>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-light p-2.5 rounded-3 border text-muted small">
                  <strong>Active Company:</strong> {activeCompany.name} ({activeCompany.companyCode})<br />
                  <strong>Current Filter:</strong> Status: {statusFilter} | Priority: {priorityFilter}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowExportModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm fw-semibold d-flex align-items-center gap-1.5"
                  onClick={() => handleTriggerExport(exportFormat, exportRows)}
                >
                  <ArrowDownToLine size={16} />
                  <span>Start Streaming Download</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
