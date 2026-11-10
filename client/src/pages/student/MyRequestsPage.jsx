import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Filter, PlusCircle, FileText, RotateCcw } from 'lucide-react';
import { requestService } from '../../services/request.service';
import RequestCard from '../../components/requests/RequestCard';
import Pagination from '../../components/common/Pagination';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { REQUEST_TYPES } from '../../utils/constants';
import { getErrorMessage } from '../../utils/formatters';
import toast from 'react-hot-toast';

export default function MyRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);

  const status = searchParams.get('status') || '';
  const requestType = searchParams.get('type') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await requestService.getAll({
        status: status || undefined,
        requestType: requestType || undefined,
        page,
        limit: 8,
      });
      setRequests(res.data.requests);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, requestType, page]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleFilterChange = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', newPage.toString());
    setSearchParams(newParams);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="page-title">My Requests</h1>
          <p className="page-subtitle">Track status and review history of all submitted requests.</p>
        </div>
        <Link to="/requests/new" className="btn-primary">
          <PlusCircle size={16} />
          New Request
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Filter by Status</label>
            <select
              value={status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="input text-xs py-1.5"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="returned">Returned for Correction</option>
            </select>
          </div>

          <div>
            <label className="label text-xs">Filter by Category</label>
            <select
              value={requestType}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="input text-xs py-1.5"
            >
              <option value="">All Categories</option>
              {Object.entries(REQUEST_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            {(status || requestType) && (
              <button
                onClick={() => setSearchParams({})}
                className="btn-secondary btn-sm w-full h-[38px] flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={13} />
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <LoadingSpinner text="Fetching requests..." />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No requests match your criteria"
          message="Try adjusting filters or submit a new request."
          icon={FileText}
          action={
            <Link to="/requests/new" className="btn-primary btn-sm">
              Submit New Request
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard key={req._id} request={req} />
          ))}
          <Pagination pagination={pagination} onPageChange={handlePageChange} />
        </div>
      )}
    </div>
  );
}
