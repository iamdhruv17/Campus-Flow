const Request = require('../models/Request');
const ApprovalHistory = require('../models/ApprovalHistory');
const User = require('../models/User');
const { uploadFile, tryDeleteFileRecord } = require('../services/storage.service');
const workflowService = require('../services/workflow.service');
const { notifyStudent, notifyApprover } = require('../services/notification.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// POST /api/requests — student submits a new request
const createRequest = async (req, res, next) => {
  try {
    const requester = req.user;
    const {
      requestType, description, subject, subjectCode, attendanceDate, lectureNumber,
      eventName, eventDate, eventOrganizer, participationDetails,
      leaveStartDate, leaveEndDate, medicalDescription,
      grievanceCategory, targetDepartment,
    } = req.body;

    if (!requestType || !description) {
      return sendError(res, 400, 'Request type and description are required.');
    }

    // Medical leave requires documents
    if (requestType === 'medical_leave' && (!req.files || req.files.length === 0)) {
      return sendError(res, 400, 'Medical leave requests require at least one supporting document.');
    }
    if (requestType === 'medical_leave' && requester.role !== 'student') {
      return sendError(res, 403, 'Only students can submit medical leave requests.');
    }

    // Build requester snapshot
    const requesterInfo = {
      name: requester.name,
      email: requester.email,
      branch: requester.branch,
      year: requester.year,
      section: requester.section,
      rollNumber: requester.rollNumber,
      department: requester.department,
    };

    // Create request first (without files) to get _id
    const requestData = {
      requesterId: requester._id,
      requestType,
      description,
      requesterInfo,
      status: 'pending',
    };

    // Attach type-specific fields
    if (requestType === 'attendance_correction') {
      Object.assign(requestData, { subject, subjectCode, attendanceDate, lectureNumber });
    } else if (requestType === 'event_attendance') {
      Object.assign(requestData, { subject, eventName, eventDate, eventOrganizer, participationDetails });
    } else if (requestType === 'medical_leave') {
      Object.assign(requestData, { leaveStartDate, leaveEndDate, medicalDescription });
    } else if (requestType === 'other_grievance') {
      Object.assign(requestData, { grievanceCategory, targetDepartment });
    }

    // Resolve the mandatory first stage before creating a request or uploading files.
    let medicalCoordinator = null;
    if (requestType === 'medical_leave') {
      const route = await workflowService.routeNewRequest(requestData, requester);
      medicalCoordinator = route.approver;
      requestData.currentApproverId = medicalCoordinator._id;
      requestData.currentApprovalStage = route.stage;
      requestData.status = 'under_review';
    }

    const request = await Request.create(requestData);

    // Upload files to Cloudinary
    const fileIds = [];
    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const record = await uploadFile({
            buffer: file.buffer,
            mimetype: file.mimetype,
            originalname: file.originalname,
            uploaderId: requester._id,
            requestId: request._id,
          });
          fileIds.push(record._id);
        }
        request.attachments = fileIds;
      } catch (uploadError) {
        // Cleanup any partial files uploaded prior to the failure
        for (const fId of fileIds) {
          await tryDeleteFileRecord(fId);
        }
        await Request.findByIdAndDelete(request._id);
        throw uploadError;
      }
    }

    // Route the request to the appropriate approver
    const { approver, stage } = requestType === 'medical_leave'
      ? { approver: medicalCoordinator, stage: 'coordinator' }
      : await workflowService.routeNewRequest(request, requester);

    if (requestType !== 'medical_leave' && approver) {
      request.currentApproverId = approver._id;
      request.currentApprovalStage = stage;
      request.status = 'under_review';
    } else if (requestType !== 'medical_leave') {
      // No approver found — flag as pending (admin to resolve)
      request.status = 'pending';
      request.currentApprovalStage = stage;
    }

    try {
      await workflowService.saveRequestWithHistory(request, {
        requestId: request._id,
        actorId: requester._id,
        actorRole: requester.role,
        actorName: requester.name,
        action: 'submitted',
        remarks: '',
        previousStage: null,
        nextStage: stage,
      });
    } catch (saveError) {
      for (const fileId of fileIds) {
        await tryDeleteFileRecord(fileId);
      }
      await Request.findByIdAndDelete(request._id);
      throw saveError;
    }

    // Notify student
    await notifyStudent(
      request,
      `Your request has been submitted successfully.`,
      'request_submitted'
    );

    // Notify approver
    if (approver) {
      await notifyApprover(
        approver._id,
        request,
        `A new ${requestType.replace(/_/g, ' ')} request has been assigned to you from ${requester.name}.`
      );
    }

    const populated = await Request.findById(request._id)
      .populate('currentApproverId', 'name role email')
      .populate('attachments');

    sendSuccess(res, 201, 'Request submitted successfully.', { request: populated });
  } catch (error) {
    next(error);
  }
};

// GET /api/requests — get requests (filtered by role)
const getRequests = async (req, res, next) => {
  try {
    const { status, requestType, page = 1, limit = 10, search } = req.query;
    const filter = {};
    const skip = (Number(page) - 1) * Number(limit);

    if (req.user.role === 'student') {
      // Students only see their own requests
      filter.requesterId = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admin sees all
    } else {
      // Staff see requests currently assigned to them OR previously handled
      filter.$or = [
        { currentApproverId: req.user._id },
      ];
      // Also show historical requests this approver acted on
      const historicalRequestIds = await ApprovalHistory.distinct('requestId', { actorId: req.user._id });
      if (historicalRequestIds.length > 0) {
        filter.$or.push({ _id: { $in: historicalRequestIds } });
      }
    }

    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;

    const total = await Request.countDocuments(filter);
    const requests = await Request.find(filter)
      .populate('requesterId', 'name email branch year section rollNumber')
      .populate('currentApproverId', 'name role email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    sendSuccess(res, 200, 'Requests retrieved.', {
      requests,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/requests/:id — get single request
const getRequestById = async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('requesterId', 'name email branch year section rollNumber department')
      .populate('currentApproverId', 'name role email')
      .populate('attachments');

    if (!request) return sendError(res, 404, 'Request not found.');

    // Authorization check
    if (req.user.role === 'student') {
      if (request.requesterId._id.toString() !== req.user._id.toString()) {
        return sendError(res, 403, 'Access denied.');
      }
    } else if (req.user.role !== 'admin') {
      // Staff: must be current approver OR have acted on this request
      const isCurrentApprover =
        request.currentApproverId &&
        request.currentApproverId._id.toString() === req.user._id.toString();
      const hasActed = await ApprovalHistory.exists({
        requestId: request._id,
        actorId: req.user._id,
      });
      if (!isCurrentApprover && !hasActed) {
        return sendError(res, 403, 'Access denied.');
      }
    }

    sendSuccess(res, 200, 'Request retrieved.', { request });
  } catch (error) {
    next(error);
  }
};

// PUT /api/requests/:id/approve
const approveRequest = async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return sendError(res, 404, 'Request not found.');

    // Only the current assigned approver can approve
    if (
      !request.currentApproverId ||
      request.currentApproverId.toString() !== req.user._id.toString()
    ) {
      return sendError(res, 403, 'You are not authorized to approve this request.');
    }

    if (!['pending', 'under_review'].includes(request.status)) {
      return sendError(res, 400, `Request is already ${request.status}.`);
    }

    const updated = await workflowService.processApprove(request, req.user, req.body.remarks || '');
    const populated = await Request.findById(updated._id)
      .populate('requesterId', 'name email')
      .populate('currentApproverId', 'name role');

    sendSuccess(res, 200, 'Request approved.', { request: populated });
  } catch (error) {
    next(error);
  }
};

// PUT /api/requests/:id/reject
const rejectRequest = async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return sendError(res, 404, 'Request not found.');

    if (
      !request.currentApproverId ||
      request.currentApproverId.toString() !== req.user._id.toString()
    ) {
      return sendError(res, 403, 'You are not authorized to reject this request.');
    }

    if (!['pending', 'under_review'].includes(request.status)) {
      return sendError(res, 400, `Request is already ${request.status}.`);
    }

    if (!req.body.remarks || req.body.remarks.trim() === '') {
      return sendError(res, 400, 'Remarks are required when rejecting a request.');
    }

    const updated = await workflowService.processReject(request, req.user, req.body.remarks);
    const populated = await Request.findById(updated._id).populate('requesterId', 'name email');

    sendSuccess(res, 200, 'Request rejected.', { request: populated });
  } catch (error) {
    next(error);
  }
};

// PUT /api/requests/:id/return
const returnRequest = async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return sendError(res, 404, 'Request not found.');

    if (
      !request.currentApproverId ||
      request.currentApproverId.toString() !== req.user._id.toString()
    ) {
      return sendError(res, 403, 'You are not authorized to return this request.');
    }

    if (!['pending', 'under_review'].includes(request.status)) {
      return sendError(res, 400, `Request is already ${request.status}.`);
    }

    if (!req.body.remarks || req.body.remarks.trim() === '') {
      return sendError(res, 400, 'Remarks are required when returning a request.');
    }

    const updated = await workflowService.processReturn(request, req.user, req.body.remarks);
    const populated = await Request.findById(updated._id).populate('requesterId', 'name email');

    sendSuccess(res, 200, 'Request returned for correction.', { request: populated });
  } catch (error) {
    next(error);
  }
};

// PUT /api/requests/:id/resubmit — student resubmits a returned request
const resubmitRequest = async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return sendError(res, 404, 'Request not found.');

    if (request.status !== 'returned') {
      return sendError(res, 400, 'Only returned requests can be resubmitted.');
    }

    if (request.requesterId.toString() !== req.user._id.toString()) {
      return sendError(res, 403, 'You can only resubmit your own requests.');
    }

    // Handle new file attachments for resubmission
    const newFileIds = [];
    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const record = await uploadFile({
            buffer: file.buffer,
            mimetype: file.mimetype,
            originalname: file.originalname,
            uploaderId: req.user._id,
            requestId: request._id,
          });
          newFileIds.push(record._id);
        }
      } catch (uploadError) {
        for (const fId of newFileIds) {
          await tryDeleteFileRecord(fId);
        }
        throw uploadError;
      }
    }

    const updates = { ...req.body };
    if (newFileIds.length > 0) updates.attachments = newFileIds;

    let updated;
    try {
      updated = await workflowService.processResubmit(request, req.user, updates);
    } catch (workflowError) {
      for (const fileId of newFileIds) {
        await tryDeleteFileRecord(fileId);
      }
      throw workflowError;
    }
    const populated = await Request.findById(updated._id)
      .populate('currentApproverId', 'name role')
      .populate('attachments');

    sendSuccess(res, 200, 'Request resubmitted successfully.', { request: populated });
  } catch (error) {
    next(error);
  }
};

// GET /api/requests/:id/history
const getRequestHistory = async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return sendError(res, 404, 'Request not found.');

    // Auth: student only sees their own, staff only see those they're involved with
    if (req.user.role === 'student') {
      if (request.requesterId.toString() !== req.user._id.toString()) {
        return sendError(res, 403, 'Access denied.');
      }
    } else if (req.user.role !== 'admin') {
      const isCurrentApprover =
        request.currentApproverId &&
        request.currentApproverId.toString() === req.user._id.toString();
      const hasActed = await ApprovalHistory.exists({ requestId: request._id, actorId: req.user._id });
      if (!isCurrentApprover && !hasActed) {
        return sendError(res, 403, 'Access denied.');
      }
    }

    const history = await ApprovalHistory.find({ requestId: req.params.id })
      .sort({ timestamp: 1 })
      .populate('actorId', 'name email role');

    sendSuccess(res, 200, 'History retrieved.', { history });
  } catch (error) {
    next(error);
  }
};

// GET /api/requests/stats — student dashboard stats
const getMyStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    let matchFilter = {};

    if (req.user.role === 'student') {
      matchFilter = { requesterId: userId };
    } else if (req.user.role !== 'admin') {
      // Staff: count assigned + historical
      const historicalIds = await ApprovalHistory.distinct('requestId', { actorId: userId });
      matchFilter = {
        $or: [
          { currentApproverId: userId },
          { _id: { $in: historicalIds } },
        ],
      };
    }

    const [total, pending, approved, rejected, returned, under_review] = await Promise.all([
      Request.countDocuments(matchFilter),
      Request.countDocuments({ ...matchFilter, status: 'pending' }),
      Request.countDocuments({ ...matchFilter, status: 'approved' }),
      Request.countDocuments({ ...matchFilter, status: 'rejected' }),
      Request.countDocuments({ ...matchFilter, status: 'returned' }),
      Request.countDocuments({ ...matchFilter, status: 'under_review' }),
    ]);

    sendSuccess(res, 200, 'Stats retrieved.', {
      stats: { total, pending, approved, rejected, returned, under_review },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRequest,
  getRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  returnRequest,
  resubmitRequest,
  getRequestHistory,
  getMyStats,
};
