import { CheckCircle2, Clock, XCircle, RotateCcw, ArrowRight, UserCheck } from 'lucide-react';
import { APPROVAL_STAGES, MEDICAL_LEAVE_STAGES } from '../../utils/constants';
import { formatDateTime } from '../../utils/formatters';

export default function ApprovalTimeline({ request, history = [] }) {
  const isMedicalLeave = request.requestType === 'medical_leave';

  // For medical leave, show the 4-stage progression: coordinator -> mentor -> hod -> dean
  const stages = isMedicalLeave
    ? ['coordinator', 'mentor', 'hod', 'dean']
    : [request.currentApprovalStage === 'completed' ? 'completed' : (request.currentApprovalStage || 'teacher')];

  const getStageStatus = (stage) => {
    if (request.status === 'rejected') {
      const rejectRecord = history.find(h => h.action === 'rejected');
      if (rejectRecord && (rejectRecord.previousStage === stage || rejectRecord.nextStage === stage)) {
        return 'rejected';
      }
    }
    if (request.status === 'returned') {
      const returnRecord = history.find(h => h.action === 'returned');
      if (returnRecord && returnRecord.previousStage === stage) {
        return 'returned';
      }
    }
    if (request.status === 'approved') return 'approved';

    const stageOrder = ['coordinator', 'mentor', 'hod', 'dean'];
    const currentIdx = stageOrder.indexOf(request.currentApprovalStage);
    const thisIdx = stageOrder.indexOf(stage);

    if (thisIdx < currentIdx) return 'approved';
    if (thisIdx === currentIdx) return 'current';
    return 'pending';
  };

  return (
    <div className="space-y-6">
      {/* Visual Stage Tracker (especially for Medical Leave) */}
      {isMedicalLeave && (
        <div className="card p-5 bg-gradient-to-r from-slate-50 to-indigo-50/40">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Approval Progression Chain
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative">
            {stages.map((stage, idx) => {
              const status = getStageStatus(stage);
              return (
                <div
                  key={stage}
                  className={`p-3 rounded-lg border transition-all ${
                    status === 'approved'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : status === 'current'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/20 shadow-sm'
                      : status === 'rejected'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : status === 'returned'
                      ? 'bg-orange-50 border-orange-200 text-orange-800'
                      : 'bg-white/80 border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Stage {idx + 1}
                    </span>
                    {status === 'approved' && <CheckCircle2 size={15} className="text-emerald-600" />}
                    {status === 'current' && <Clock size={15} className="text-indigo-600 animate-pulse" />}
                    {status === 'rejected' && <XCircle size={15} className="text-red-600" />}
                    {status === 'returned' && <RotateCcw size={15} className="text-orange-600" />}
                  </div>
                  <p className="text-sm font-semibold capitalize">
                    {APPROVAL_STAGES[stage] || stage}
                  </p>
                  <p className="text-[11px] mt-0.5 opacity-80 capitalize">
                    {status === 'current' ? 'Under Review' : status}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Audit History Log */}
      <div className="card p-5">
        <h3 className="section-title text-base mb-4 flex items-center gap-2">
          <UserCheck size={18} className="text-indigo-600" />
          Approval & Action History
        </h3>

        {history.length === 0 ? (
          <p className="text-sm text-slate-400 py-3">No activity recorded yet.</p>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {history.map((record, i) => {
              const isActionApprove = record.action === 'approved';
              const isActionReject = record.action === 'rejected';
              const isActionReturn = record.action === 'returned';
              const isActionForward = record.action === 'forwarded';
              const isActionResubmit = record.action === 'resubmitted';

              return (
                <div key={record._id || i} className="relative group">
                  {/* Indicator Dot */}
                  <span
                    className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-white ring-2 ${
                      isActionApprove
                        ? 'bg-emerald-500 ring-emerald-200'
                        : isActionReject
                        ? 'bg-red-500 ring-red-200'
                        : isActionReturn
                        ? 'bg-orange-500 ring-orange-200'
                        : isActionForward
                        ? 'bg-blue-500 ring-blue-200'
                        : isActionResubmit
                        ? 'bg-purple-500 ring-purple-200'
                        : 'bg-slate-400 ring-slate-200'
                    }`}
                  />

                  <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200/80">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          {record.actorName || record.actorId?.name || 'User'}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5 uppercase">
                          {record.actorRole}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatDateTime(record.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs font-semibold capitalize text-slate-700">
                      Action: <span className="font-bold text-slate-900">{record.action}</span>
                      {record.nextStage && (
                        <span className="ml-1 text-slate-500 font-normal">
                          (Target: {APPROVAL_STAGES[record.nextStage] || record.nextStage})
                        </span>
                      )}
                    </p>

                    {record.remarks && (
                      <div className="mt-2 text-xs bg-white p-2.5 rounded border border-slate-200 text-slate-700">
                        <span className="font-semibold text-slate-900">Remarks: </span>
                        {record.remarks}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
