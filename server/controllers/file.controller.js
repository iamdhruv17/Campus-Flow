/**
 * File Controller
 *
 * Handles authenticated document access via Cloudinary signed URLs.
 *
 * Security model:
 * - Every request is authenticated (JWT cookie checked by protect middleware)
 * - Authorization is checked against the associated Request document
 * - A signed URL is generated on the backend using the API secret
 * - The signed URL is time-limited (5 minutes) and returned as JSON
 * - No binary file contents are streamed through this server
 * - No permanent public URLs are stored or returned
 */

const FileRecord = require('../models/FileRecord');
const Request = require('../models/Request');
const ApprovalHistory = require('../models/ApprovalHistory');
const { generateSignedDownloadUrl } = require('../services/storage.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * GET /api/files/:id
 *
 * Returns a time-limited signed Cloudinary download URL for the requested file,
 * or JSON metadata if ?meta=true is provided.
 *
 * Authorization rules:
 *   Student  — own requests only
 *   Staff    — currently assigned as approver OR has acted on the request (ApprovalHistory)
 *   Admin    — requests they are associated with (not unconditional access)
 *
 * The signed URL returned is a temporary bearer link (5-minute expiry).
 * The application performs its own authorization check before generating it.
 * Never trust the file ID from the frontend without verifying ownership.
 */
const getFile = async (req, res, next) => {
  try {
    const fileRecord = await FileRecord.findById(req.params.id);
    if (!fileRecord) return sendError(res, 404, 'File not found.');

    // Retrieve the associated request to verify authorization
    const request = await Request.findById(fileRecord.requestId);
    if (!request) return sendError(res, 404, 'Associated request not found.');

    const userId = req.user._id.toString();
    const userRole = req.user.role;

    // Authorization check — multiple valid paths to access
    const isOwner = request.requesterId.toString() === userId;
    const isCurrentApprover =
      request.currentApproverId &&
      request.currentApproverId.toString() === userId;
    const isUploader = fileRecord.uploaderId.toString() === userId;

    // Admin access: limited to requests they are specifically associated with
    // (not unconditional access to all medical documents)
    const isAdminWithContext =
      userRole === 'admin' &&
      (isUploader || isCurrentApprover);

    let authorized = isOwner || isCurrentApprover || isUploader || isAdminWithContext;

    if (!authorized) {
      // Check if the user has historically acted on this request
      const hasActed = await ApprovalHistory.exists({
        requestId: request._id,
        actorId: req.user._id,
      });
      if (hasActed) authorized = true;
    }

    if (!authorized) {
      return sendError(res, 403, 'Access denied.');
    }

    // Return JSON metadata only (no signed URL) when ?meta=true
    if (req.query.meta === 'true') {
      return sendSuccess(res, 200, 'File metadata retrieved.', {
        file: {
          id: fileRecord._id,
          originalName: fileRecord.originalName,
          mimeType: fileRecord.mimeType,
          fileSize: fileRecord.fileSize,
          format: fileRecord.format,
          uploadedAt: fileRecord.createdAt,
        },
      });
    }

    // Generate a time-limited signed download URL on the backend
    // This uses the API secret — never exposed to the frontend
    const { signedUrl, expiresAt } = generateSignedDownloadUrl(fileRecord);

    return sendSuccess(res, 200, 'Signed download URL generated.', {
      signedUrl,
      expiresAt,       // Unix timestamp — frontend can show expiry if needed
      fileName: fileRecord.originalName,
      mimeType: fileRecord.mimeType,
      fileSize: fileRecord.fileSize,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getFile };
