/**
 * Approval Workflow Service
 *
 * This service is the single source of truth for workflow progression.
 * No other part of the code should directly modify request.status or
 * request.currentApproverId without going through this service.
 *
 * Medical Leave chain: coordinator → mentor → hod → dean
 * Attendance Correction: teacher (direct)
 * Event Attendance: teacher (direct)
 * Other Grievance: configurable (defaults to hod)
 */

const Request = require('../models/Request');
const ApprovalHistory = require('../models/ApprovalHistory');
const User = require('../models/User');
const { notifyStudent, notifyApprover } = require('./notification.service');

// ─────────────────────────────────────────────────────────────────────────────
// Routing helpers
// ─────────────────────────────────────────────────────────────────────────────

const createWorkflowError = (message, statusCode = 503) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sameId = (left, right) =>
  left && right && left.toString() === right.toString();

/**
 * Find teacher assigned to a subject for a given student.
 */
const findTeacherForSubject = async (subjectName, branch, year, section) => {
  const teacher = await User.findOne({
    role: { $in: ['teacher', 'coordinator', 'mentor', 'hod', 'dean'] },
    isActive: true,
    assignedSubjects: {
      $elemMatch: {
        subjectName: { $regex: new RegExp(subjectName, 'i') },
        branch,
        year: Number(year),
        section,
      },
    },
  });
  return teacher;
};

/**
 * Find Class Coordinator for a given class.
 * Note: A Class Coordinator may have the specific role 'coordinator' or the general
 * faculty role 'teacher' with an assigned class responsibility (assignedClass).
 */
const findCoordinator = async (branch, year, section) => {
  const coordinator = await User.findOne({
    role: { $in: ['coordinator', 'teacher'] },
    isActive: true,
    assignedClass: { branch, year: Number(year), section },
  });
  return coordinator;
};

/**
 * Find Mentor for a given class.
 * Note: A Mentor may have role 'mentor' or general faculty role 'teacher' with mentoringClasses.
 */
const findMentor = async (branch, year, section) => {
  const mentor = await User.findOne({
    role: { $in: ['mentor', 'teacher'] },
    isActive: true,
    mentoringClasses: {
      $elemMatch: { branch, year: Number(year), section },
    },
  });
  return mentor;
};

/**
 * Find HOD for a department.
 */
const findHOD = async (department, requireDepartmentAssignment = false) => {
  const hod = await User.findOne({
    role: 'hod',
    isActive: true,
    headOfDepartments: { $in: [department] },
  });
  if (!hod && !requireDepartmentAssignment) {
    return User.findOne({ role: 'hod', isActive: true });
  }
  return hod;
};

/**
 * Find the Dean.
 */
const findDean = async () => {
  return User.findOne({ role: 'dean', isActive: true });
};

const getMedicalLeaveApprover = async (stage, requester) => {
  const { branch, year, section } = requester;
  let approver;
  let roleLabel;

  if (stage === 'coordinator') {
    approver = await findCoordinator(branch, year, section);
    roleLabel = 'Class Coordinator';
  } else if (stage === 'mentor') {
    approver = await findMentor(branch, year, section);
    roleLabel = 'Mentor';
  } else if (stage === 'hod') {
    approver = await findHOD(requester.department || branch, true);
    roleLabel = 'HOD assigned to the student department';
  } else if (stage === 'dean') {
    approver = await findDean();
    roleLabel = 'Dean';
  } else {
    throw createWorkflowError(`Invalid medical leave approval stage: ${stage}.`, 409);
  }

  if (!approver) {
    throw createWorkflowError(
      `No active ${roleLabel} is assigned. Contact the administrator before proceeding.`
    );
  }

  return approver;
};

const assertMedicalLeaveApprover = (request, actor, requester) => {
  const stage = request.currentApprovalStage;
  const { branch, year, section } = requester;
  const assignedClass = actor.assignedClass;
  let isAssigned = false;

  if (actor.isActive === false || !sameId(request.currentApproverId, actor._id)) {
    throw createWorkflowError('You are not the active assigned approver for this request.', 403);
  }

  if (stage === 'coordinator') {
    isAssigned =
      ['coordinator', 'teacher'].includes(actor.role) &&
      assignedClass?.branch === branch &&
      Number(assignedClass?.year) === Number(year) &&
      assignedClass?.section === section;
  } else if (stage === 'mentor') {
    isAssigned =
      ['mentor', 'teacher'].includes(actor.role) &&
      actor.mentoringClasses?.some(
        (assignment) =>
          assignment.branch === branch &&
          Number(assignment.year) === Number(year) &&
          assignment.section === section
      );
  } else if (stage === 'hod') {
    isAssigned =
      actor.role === 'hod' &&
      actor.headOfDepartments?.includes(requester.department || branch);
  } else if (stage === 'dean') {
    isAssigned = actor.role === 'dean';
  }

  if (!isAssigned) {
    throw createWorkflowError(
      `The current user is not assigned to the ${stage} stage of this request.`,
      403
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Initial routing — called when a new request is submitted
// ─────────────────────────────────────────────────────────────────────────────

const routeNewRequest = async (request, requester) => {
  const { requestType, subject, branch, year, section, department } = request;
  const { branch: rb, year: ry, section: rs, department: rd } = requester;

  let approver = null;
  let stage = 'teacher';

  if (requestType === 'attendance_correction') {
    approver = await findTeacherForSubject(subject, rb, ry, rs);
    if (!approver) {
      // Fallback to HOD
      approver = await findHOD(rd || department);
      stage = 'hod';
    }
    stage = approver ? (approver.role === 'hod' ? 'hod' : 'teacher') : 'hod';
  } else if (requestType === 'event_attendance') {
    approver = await findTeacherForSubject(request.subject || '', rb, ry, rs);
    if (!approver) {
      approver = await findCoordinator(rb, ry, rs);
      stage = 'coordinator';
    }
    if (!approver) {
      approver = await findHOD(rd || department);
      stage = 'hod';
    }
    if (approver) {
      stage = approver.role;
    }
  } else if (requestType === 'medical_leave') {
    approver = await getMedicalLeaveApprover('coordinator', requester);
    stage = 'coordinator';
  } else if (requestType === 'other_grievance') {
    approver = await findHOD(rd || department);
    stage = 'hod';
    if (!approver) {
      approver = await findDean();
      stage = 'dean';
    }
  }

  return { approver, stage };
};

// ─────────────────────────────────────────────────────────────────────────────
// Next approver — called after each approval in a multi-stage chain
// ─────────────────────────────────────────────────────────────────────────────

const getNextApproverForMedicalLeave = async (currentStage, requester) => {
  if (currentStage === 'dean') {
    return { approver: null, stage: 'completed' };
  }

  const nextStages = {
    coordinator: 'mentor',
    mentor: 'hod',
    hod: 'dean',
  };
  const nextStage = nextStages[currentStage];
  if (!nextStage) {
    throw createWorkflowError(
      `Cannot advance medical leave from approval stage "${currentStage}".`,
      409
    );
  }

  return {
    approver: await getMedicalLeaveApprover(nextStage, requester),
    stage: nextStage,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Core actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record an action in ApprovalHistory.
 */
const saveRequestWithHistory = async (request, {
  requestId,
  actorId,
  actorRole,
  actorName,
  action,
  remarks,
  previousStage,
  nextStage,
}) => {
  const history = await ApprovalHistory.create({
    requestId: requestId || request._id,
    actorId,
    actorRole,
    actorName,
    action,
    remarks: remarks || '',
    previousStage,
    nextStage,
  });

  try {
    await request.save();
  } catch (error) {
    try {
      await ApprovalHistory.deleteOne({ _id: history._id });
    } catch (cleanupError) {
      console.error(
        `[Workflow] Failed to remove uncommitted history ${history._id}: ${cleanupError.message}`
      );
    }
    throw error;
  }
};

/**
 * Process APPROVE action by an authorized approver.
 */
const processApprove = async (request, actor, remarks) => {
  // Fetch the requester to use their class info for routing
  const requester = await User.findById(request.requesterId);
  if (!requester) throw new Error('Requester not found.');

  const previousStage = request.currentApprovalStage;

  if (request.requestType === 'medical_leave') {
    if (!['pending', 'under_review'].includes(request.status)) {
      throw createWorkflowError(`Request is already ${request.status}.`, 409);
    }
    assertMedicalLeaveApprover(request, actor, requester);

    const { approver: nextApprover, stage: nextStage } =
      await getNextApproverForMedicalLeave(previousStage, requester);

    if (previousStage === 'dean') {
      // Final approval
      request.status = 'approved';
      request.currentApprovalStage = 'completed';
      request.currentApproverId = null;
      request.resolvedAt = new Date();

      await saveRequestWithHistory(request, {
        requestId: request._id,
        actorId: actor._id,
        actorRole: actor.role,
        actorName: actor.name,
        action: 'approved',
        remarks,
        previousStage,
        nextStage: 'completed',
      });

      await notifyStudent(
        request,
        `Your medical leave request has been finally approved by the ${actor.role.toUpperCase()}.`,
        'request_approved'
      );
    } else {
      // Forward to next stage
      request.status = 'under_review';
      request.currentApprovalStage = nextStage;
      request.currentApproverId = nextApprover._id;

      await saveRequestWithHistory(request, {
        requestId: request._id,
        actorId: actor._id,
        actorRole: actor.role,
        actorName: actor.name,
        action: 'forwarded',
        remarks,
        previousStage,
        nextStage,
      });

      await notifyStudent(
        request,
        `Your medical leave request has been approved by the ${previousStage.toUpperCase()} and forwarded to the ${nextStage.toUpperCase()}.`,
        'request_forwarded'
      );

      await notifyApprover(
        nextApprover._id,
        request,
        `A medical leave request has been assigned to you (forwarded from ${previousStage.toUpperCase()}).`
      );
    }
  } else {
    // Single-stage workflows (attendance, event, other)
    request.status = 'approved';
    request.currentApprovalStage = 'completed';
    request.currentApproverId = null;
    request.resolvedAt = new Date();

    await saveRequestWithHistory(request, {
      requestId: request._id,
      actorId: actor._id,
      actorRole: actor.role,
      actorName: actor.name,
      action: 'approved',
      remarks,
      previousStage,
      nextStage: 'completed',
    });

    const typeLabels = {
      attendance_correction: 'Attendance Correction',
      event_attendance: 'Event Attendance',
      other_grievance: 'Academic Grievance',
    };

    await notifyStudent(
      request,
      `Your ${typeLabels[request.requestType] || 'request'} has been approved.`,
      'request_approved'
    );
  }

  return request;
};

/**
 * Process REJECT action.
 */
const processReject = async (request, actor, remarks) => {
  if (!remarks || remarks.trim() === '') {
    throw new Error('Remarks are required when rejecting a request.');
  }

  const previousStage = request.currentApprovalStage;

  if (request.requestType === 'medical_leave') {
    if (!['pending', 'under_review'].includes(request.status)) {
      throw createWorkflowError(`Request is already ${request.status}.`, 409);
    }
    const requester = await User.findById(request.requesterId);
    if (!requester) throw new Error('Requester not found.');
    assertMedicalLeaveApprover(request, actor, requester);
  }

  request.status = 'rejected';
  request.currentApprovalStage = 'rejected';
  request.currentApproverId = null;
  request.resolvedAt = new Date();

  await saveRequestWithHistory(request, {
    requestId: request._id,
    actorId: actor._id,
    actorRole: actor.role,
    actorName: actor.name,
    action: 'rejected',
    remarks,
    previousStage,
    nextStage: 'rejected',
  });

  await notifyStudent(
    request,
    `Your request has been rejected by the ${actor.role.toUpperCase()}. Reason: ${remarks}`,
    'request_rejected'
  );

  return request;
};

/**
 * Process RETURN FOR CORRECTION action.
 */
const processReturn = async (request, actor, remarks) => {
  if (!remarks || remarks.trim() === '') {
    throw new Error('Remarks are required when returning a request.');
  }

  const previousStage = request.currentApprovalStage;

  if (request.requestType === 'medical_leave') {
    if (!['pending', 'under_review'].includes(request.status)) {
      throw createWorkflowError(`Request is already ${request.status}.`, 409);
    }
    const requester = await User.findById(request.requesterId);
    if (!requester) throw new Error('Requester not found.');
    assertMedicalLeaveApprover(request, actor, requester);
  }

  request.status = 'returned';
  // Keep currentApprovalStage so we know where to send it back after resubmission
  if (request.requestType !== 'medical_leave') {
    request.currentApproverId = null;
  }

  await saveRequestWithHistory(request, {
    requestId: request._id,
    actorId: actor._id,
    actorRole: actor.role,
    actorName: actor.name,
    action: 'returned',
    remarks,
    previousStage,
    nextStage: 'student',
  });

  await notifyStudent(
    request,
    `Your request has been returned for correction by the ${actor.role.toUpperCase()}. Please review and resubmit. Remarks: ${remarks}`,
    'request_returned'
  );

  return request;
};

/**
 * Process RESUBMIT action by student after a return.
 * Sends request back to the stage where it was returned.
 */
const processResubmit = async (request, requester, updates) => {
  if (request.status !== 'returned') {
    throw new Error('Only returned requests can be resubmitted.');
  }
  if (request.requesterId.toString() !== requester._id.toString()) {
    throw new Error('You can only resubmit your own requests.');
  }
  if (request.requestType === 'medical_leave' && requester.role !== 'student') {
    throw createWorkflowError('Only the student who submitted this request can resubmit it.', 403);
  }

  const returnedFromStage = request.currentApprovalStage;
  const previousApproverId = request.currentApproverId;
  let nextApprover = null;

  if (request.requestType === 'medical_leave') {
    nextApprover = await getMedicalLeaveApprover(returnedFromStage, requester);
  }

  // Apply updates (description, attachments, etc.)
  const allowedUpdates = [
    'description', 'subject', 'attendanceDate', 'lectureNumber',
    'eventName', 'eventDate', 'eventOrganizer', 'participationDetails',
    'leaveStartDate', 'leaveEndDate', 'medicalDescription',
    'grievanceCategory', 'targetDepartment',
  ];
  allowedUpdates.forEach((field) => {
    if (updates[field] !== undefined) request[field] = updates[field];
  });

  if (updates.attachments && Array.isArray(updates.attachments)) {
    request.attachments.push(...updates.attachments);
  }

  // Determine who should review it now (same stage it was returned from)
  if (request.requestType !== 'medical_leave') {
    if (returnedFromStage === 'teacher' || returnedFromStage === 'coordinator') {
      if (request.requestType === 'attendance_correction' || request.requestType === 'event_attendance') {
        nextApprover = await findTeacherForSubject(
          request.subject || '', requester.branch, requester.year, requester.section
        );
        if (!nextApprover) nextApprover = await findHOD(requester.department);
      }
    } else if (returnedFromStage === 'mentor') {
      nextApprover = await findMentor(requester.branch, requester.year, requester.section);
    } else if (returnedFromStage === 'hod') {
      nextApprover = await findHOD(requester.department);
    } else if (returnedFromStage === 'dean') {
      nextApprover = await findDean();
    }
  }

  if (request.requestType === 'medical_leave' && !nextApprover) {
    throw createWorkflowError(
      `No active approver is assigned to the ${returnedFromStage} stage. The request remains returned.`
    );
  }

  request.status = 'under_review';
  request.currentApproverId = nextApprover ? nextApprover._id : null;
  request.resubmissionCount += 1;

  const reassignmentRemark =
    request.requestType === 'medical_leave' &&
    previousApproverId &&
    !sameId(previousApproverId, nextApprover._id)
      ? ' The request was assigned to the active approver currently responsible for this stage.'
      : '';
  await saveRequestWithHistory(request, {
    requestId: request._id,
    actorId: requester._id,
    actorRole: 'student',
    actorName: requester.name,
    action: 'resubmitted',
    remarks: `Student resubmitted after correction.${reassignmentRemark}`,
    previousStage: 'student',
    nextStage: returnedFromStage,
  });

  if (nextApprover) {
    await notifyApprover(
      nextApprover._id,
      request,
      `A request has been resubmitted by ${requester.name} and is awaiting your review.`
    );
  }

  await notifyStudent(
    request,
    `Your request has been resubmitted and is now under review.`,
    'request_resubmitted'
  );

  return request;
};

module.exports = {
  routeNewRequest,
  processApprove,
  processReject,
  processReturn,
  processResubmit,
  saveRequestWithHistory,
};
