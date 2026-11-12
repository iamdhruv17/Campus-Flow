const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const ApprovalHistory = require('../models/ApprovalHistory');
const { protect } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { authorize } = require('../middleware/role.middleware');
const { uploadFile, tryDeleteFileRecord } = require('../services/storage.service');
const workflowService = require('../services/workflow.service');
const { notifyStudent, notifyApprover } = require('../services/notification.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  approveRequest,
  rejectRequest,
  returnRequest,
} = require('../controllers/request.controller');

router.get('/stats', protect, async (req, res, next) => {
  try {
    let matchFilter = {};

    if (req.user.role === 'student') {
      matchFilter.requesterId = req.user._id;
    } else if (req.user.role !== 'admin') {
      const historicalIds = await ApprovalHistory.distinct('requestId', {
        actorId: req.user._id,
      });
      matchFilter = {
        $or: [
          { currentApproverId: req.user._id },
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
});

router.post('/', protect, authorize('student'), upload.array('files', 5), async (req, res, next) => {
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
    if (requestType === 'medical_leave' && (!req.files || req.files.length === 0)) {
      return sendError(res, 400, 'Medical leave requests require at least one supporting document.');
    }

    const requestData = {
      requesterId: requester._id,
      requestType,
      description,
      requesterInfo: {
        name: requester.name,
        email: requester.email,
        branch: requester.branch,
        year: requester.year,
        section: requester.section,
        rollNumber: requester.rollNumber,
        department: requester.department,
      },
      status: 'pending',
    };

    if (requestType === 'attendance_correction') {
      Object.assign(requestData, { subject, subjectCode, attendanceDate, lectureNumber });
    } else if (requestType === 'event_attendance') {
      Object.assign(requestData, { subject, eventName, eventDate, eventOrganizer, participationDetails });
    } else if (requestType === 'medical_leave') {
      Object.assign(requestData, { leaveStartDate, leaveEndDate, medicalDescription });
    } else if (requestType === 'other_grievance') {
      Object.assign(requestData, { grievanceCategory, targetDepartment });
    }

    // Resolve the mandatory first medical stage before creating the request or uploading files.
    let route;
    try {
      route = await workflowService.routeNewRequest(requestData, requester);
    } catch (error) {
      if (requestType !== 'medical_leave') throw error;
      return sendError(res, error.statusCode || 503, error.message);
    }

    const { approver, stage } = route;
    if (approver) {
      requestData.currentApproverId = approver._id;
      requestData.currentApprovalStage = stage;
      requestData.status = 'under_review';
    } else {
      requestData.currentApprovalStage = stage;
    }

    const request = await Request.create(requestData);
    const fileIds = [];

    try {
      for (const file of req.files || []) {
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
      await workflowService.saveRequestWithHistory(request, {
        requestId: request._id,
        actorId: requester._id,
        actorRole: requester.role,
        actorName: requester.name,
        action: 'submitted',
        previousStage: null,
        nextStage: stage,
      });
    } catch (error) {
      for (const fileId of fileIds) {
        await tryDeleteFileRecord(fileId);
      }
      await Request.findByIdAndDelete(request._id);
      throw error;
    }

    await notifyStudent(request, 'Your request has been submitted successfully.', 'request_submitted');
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
});

router.get('/', protect, async (req, res, next) => {
  try {
    const { status, requestType, page = 1, limit = 10, search } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 10));
    const filter = {};

    if (req.user.role === 'student') {
      filter.requesterId = req.user._id;
    } else if (req.user.role !== 'admin') {
      const historicalIds = await ApprovalHistory.distinct('requestId', {
        actorId: req.user._id,
      });
      filter.$or = [
        { currentApproverId: req.user._id },
        { _id: { $in: historicalIds } },
      ];
    }

    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;
    if (search) {
      const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { description: { $regex: escapedSearch, $options: 'i' } },
            { 'requesterInfo.name': { $regex: escapedSearch, $options: 'i' } },
            { 'requesterInfo.rollNumber': { $regex: escapedSearch, $options: 'i' } },
          ],
        },
      ];
    }

    const skip = (pageNumber - 1) * pageSize;
    const [total, requests] = await Promise.all([
      Request.countDocuments(filter),
      Request.find(filter)
        .populate('requesterId', 'name email branch year section rollNumber')
        .populate('currentApproverId', 'name role email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
    ]);

    sendSuccess(res, 200, 'Requests retrieved.', {
      requests,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/history', protect, async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return sendError(res, 404, 'Request not found.');

    if (req.user.role === 'student') {
      if (request.requesterId.toString() !== req.user._id.toString()) {
        return sendError(res, 403, 'Access denied.');
      }
    } else if (req.user.role !== 'admin') {
      const isCurrentApprover =
        request.currentApproverId?.toString() === req.user._id.toString();
      const hasActed = await ApprovalHistory.exists({
        requestId: request._id,
        actorId: req.user._id,
      });
      if (!isCurrentApprover && !hasActed) {
        return sendError(res, 403, 'Access denied.');
      }
    }

    const history = await ApprovalHistory.find({ requestId: request._id })
      .sort({ timestamp: 1 })
      .populate('actorId', 'name email role');
    sendSuccess(res, 200, 'History retrieved.', { history });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', protect, async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('requesterId', 'name email branch year section rollNumber department')
      .populate('currentApproverId', 'name role email')
      .populate('attachments');

    if (!request) return sendError(res, 404, 'Request not found.');

    if (req.user.role === 'student') {
      if (request.requesterId._id.toString() !== req.user._id.toString()) {
        return sendError(res, 403, 'Access denied.');
      }
    } else if (req.user.role !== 'admin') {
      const isCurrentApprover =
        request.currentApproverId?._id.toString() === req.user._id.toString();
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
});

router.put('/:id/approve', protect, approveRequest);
router.put('/:id/reject', protect, rejectRequest);
router.put('/:id/return', protect, returnRequest);

router.put('/:id/resubmit', protect, upload.array('files', 5), async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return sendError(res, 404, 'Request not found.');
    if (request.status !== 'returned') {
      return sendError(res, 400, 'Only returned requests can be resubmitted.');
    }
    if (request.requesterId.toString() !== req.user._id.toString()) {
      return sendError(res, 403, 'You can only resubmit your own requests.');
    }

    const fileIds = [];
    try {
      for (const file of req.files || []) {
        const record = await uploadFile({
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: file.originalname,
          uploaderId: req.user._id,
          requestId: request._id,
        });
        fileIds.push(record._id);
      }

      const updates = { ...req.body };
      if (fileIds.length > 0) updates.attachments = fileIds;
      await workflowService.processResubmit(request, req.user, updates);
    } catch (error) {
      for (const fileId of fileIds) {
        await tryDeleteFileRecord(fileId);
      }
      throw error;
    }

    const populated = await Request.findById(request._id)
      .populate('currentApproverId', 'name role')
      .populate('attachments');
    sendSuccess(res, 200, 'Request resubmitted successfully.', { request: populated });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
