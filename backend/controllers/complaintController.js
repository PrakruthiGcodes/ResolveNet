const fs = require('fs');
const path = require('path');
const Complaint = require('../models/Complaint');
const { UPLOAD_DIR } = require('../middleware/uploadMiddleware');
const { classifyIssue } = require('../services/issueClassifier');
// Referenced through the module object (not destructured) so tests can stub
// classifyImage without running the Teachable Machine model.
const imageClassifier = require('../services/teachableMachineClassifier');
const { getDepartment } = require('../services/departmentRouter');
const { calculateDueAt, calculateReworkDueAt } = require('../services/slaConfig');
const { createNotification } = require('../services/notificationService');
const { parseComplaintLocation } = require('../services/complaintLocation');
const { STATUS, WORK_STATUS } = require('../services/complaintStatus');
const { getNextEscalation } = require('../services/escalationLevels');
const { notifyEscalation } = require('../services/escalationNotifications');
const {
  SUPPORTED_ISSUE_TYPES,
  isSupportedIssueType,
  resolveIssueType,
} = require('../services/issueConfirmation');

// A failed or unavailable classifier must never fail the whole submission.
// The result is reported as unavailable, so the citizen is asked to confirm.
const classifyUploadedImage = async (imagePath) => {
  try {
    return await imageClassifier.classifyImage(imagePath);
  } catch (error) {
    return {
      issueType: 'other',
      confidence: null,
      detected: false,
      modelAvailable: false,
      message: 'Image classification failed',
    };
  }
};

const createComplaint = async (req, res) => {
  try {
    const body = req.body || {};
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const hasImage = Boolean(req.file);

    // A complaint needs something to classify: a description, a photo, or both.
    if (!description && !hasImage) {
      return res.status(400).json({ message: 'Please describe the issue or attach a photo' });
    }

    // Optional. multipart/form-data sends it as a JSON string; the validator
    // accepts that and a plain object, and drops any unexpected keys.
    const locationResult = parseComplaintLocation(body.location);
    if (!locationResult.ok) {
      return res.status(400).json({ message: locationResult.message });
    }
    const { location } = locationResult;

    // Null when there is no description, so no text score is invented.
    const textResult = description ? classifyIssue(description) : null;

    let image;
    let imageClassification;
    if (hasImage) {
      image = {
        filename: req.file.filename,
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      };

      // Image classification (see services/imageClassifier.js). The full result
      // is always stored as diagnostic data.
      imageClassification = await classifyUploadedImage(req.file.path);
    }

    const { issueType, confidence, needsConfirmation } = resolveIssueType({
      hasImage,
      textResult,
      imageClassification,
    });

    // An uncertain result (photo unusable or not auto-routable, or photo and
    // description disagree) means the complaint cannot be routed yet. It is saved without a department
    // or SLA. The citizen confirms the issue type with confirmIssueType, and that
    // is when the department and SLA are calculated. The AI result is kept in
    // imageClassification.
    if (needsConfirmation) {
      const complaint = await Complaint.create({
        user: req.user.id,
        description,
        location,
        issueType,
        status: STATUS.NEEDS_CONFIRMATION,
        image,
        imageClassification,
      });

      await createNotification({
        user: req.user.id,
        type: 'complaint_created',
        title: 'Please Confirm the Issue Type',
        message:
          'Your complaint was submitted, but its issue type could not be confirmed automatically. Please confirm it so it can be routed.',
        complaint: complaint._id,
      });

      return res.status(201).json({ complaint });
    }

    const department = getDepartment(issueType);
    const dueAt = calculateDueAt(issueType);

    const complaint = await Complaint.create({
      user: req.user.id,
      description,
      location,
      issueType,
      confidence,
      department,
      dueAt,
      image,
      imageClassification,
    });

    // Two distinct events from this one request: the complaint was created,
    // and a department was assigned to it. createNotification() never
    // throws, so a notification failure here can never turn a successful
    // complaint creation into an error response.
    await Promise.all([
      createNotification({
        user: req.user.id,
        type: 'complaint_created',
        title: 'Complaint Submitted',
        message: 'Your civic complaint has been successfully submitted.',
        complaint: complaint._id,
      }),
      createNotification({
        user: req.user.id,
        type: 'department_assigned',
        title: 'Department Assigned',
        message: `Your complaint has been assigned to the ${department}.`,
        complaint: complaint._id,
      }),
    ]);

    return res.status(201).json({ complaint });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create complaint', error: error.message });
  }
};

const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ user: req.user.id }).sort({ createdAt: -1 });
    return res.status(200).json({ complaints });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch complaints', error: error.message });
  }
};

const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findOne({ _id: req.params.id, user: req.user.id });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    return res.status(200).json({ complaint });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    return res.status(500).json({ message: 'Failed to fetch complaint', error: error.message });
  }
};

const COMPLAINT_ID_PATTERN = /^[a-f\d]{24}$/i;
// The names uploadMiddleware generates: <timestamp>-<32 hex chars><extension>.
const STORED_IMAGE_NAME_PATTERN = /^\d+-[a-f\d]{32}\.(jpg|png|gif|webp)$/;

// Returns the full path of a stored photo, or null if the name is not one the
// upload middleware could have produced. Anything with a directory part, such
// as "../", is rejected by the pattern and by the relative-path check.
const resolveStoredImagePath = (filename, uploadDir = UPLOAD_DIR) => {
  if (typeof filename !== 'string' || !STORED_IMAGE_NAME_PATTERN.test(filename)) {
    return null;
  }
  const fullPath = path.join(uploadDir, filename);
  if (path.relative(uploadDir, fullPath) !== filename) {
    return null;
  }
  return fullPath;
};

// Same rules as the complaint itself: a citizen sees their own complaints, a
// department account sees complaints assigned to its department (see
// getDepartmentComplaints), and a monitor sees every complaint (see
// getAllComplaintsForMonitor).
const canViewComplaintImage = (user, complaint) => {
  if (user.role === 'citizen') {
    return String(complaint.user) === String(user.id);
  }
  if (user.role === 'department') {
    return Boolean(user.department) && complaint.department === user.department;
  }
  if (user.role === 'monitor') {
    return true;
  }
  return false;
};

// Every refusal returns the same 404, so a caller cannot tell a photo that
// exists but is not theirs from one that does not exist.
const getComplaintImage = async (req, res) => {
  const notFound = () => res.status(404).json({ message: 'Image not found' });

  try {
    if (!COMPLAINT_ID_PATTERN.test(req.params.id)) {
      return notFound();
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint || !canViewComplaintImage(req.user, complaint)) {
      return notFound();
    }

    const imagePath = resolveStoredImagePath(complaint.image?.filename);
    if (!imagePath || !fs.existsSync(imagePath)) {
      return notFound();
    }

    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.sendFile(imagePath, (error) => {
      if (error && !res.headersSent) {
        notFound();
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch image' });
  }
};

// Citizen-only, and only for the complaint's owner. Confirms or corrects the
// issue type of a needs_confirmation complaint. The department and SLA are
// calculated here from the confirmed type, using the existing department map
// and SLA config. After this the complaint is 'submitted' and follows the
// normal assignment and completion-verification workflow.
const confirmIssueType = async (req, res) => {
  try {
    const { issueType } = req.body;

    if (!isSupportedIssueType(issueType)) {
      return res.status(400).json({
        message: `Invalid issue type. Must be one of: ${SUPPORTED_ISSUE_TYPES.join(', ')}`,
      });
    }

    // Scoped to the owner, so another citizen's complaint is simply not found,
    // the same as getComplaintById.
    const complaint = await Complaint.findOne({ _id: req.params.id, user: req.user.id });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (complaint.status !== STATUS.NEEDS_CONFIRMATION) {
      return res.status(409).json({
        message: `Only a complaint with status "${STATUS.NEEDS_CONFIRMATION}" can have its issue type confirmed (current status: ${complaint.status})`,
      });
    }

    const now = new Date();
    const actor = req.user.id;
    // The type the complaint was saved with, shown to the citizen as the
    // suggestion. Confirming it unchanged is 'confirmed', anything else is a
    // 'corrected'.
    const suggestedIssueType = complaint.issueType;
    const action = issueType === suggestedIssueType ? 'confirmed' : 'corrected';

    const department = getDepartment(issueType);

    // The status guard in the filter stops a concurrent request from
    // confirming the same complaint twice.
    const updated = await Complaint.findOneAndUpdate(
      { _id: complaint._id, user: actor, status: STATUS.NEEDS_CONFIRMATION },
      {
        $set: {
          issueType,
          department,
          dueAt: calculateDueAt(issueType, now),
          status: STATUS.SUBMITTED,
          issueConfirmation: {
            suggestedIssueType,
            confirmedIssueType: issueType,
            action,
            at: now,
            by: actor,
          },
        },
        $push: {
          verificationHistory: {
            action: action === 'confirmed' ? 'issue_confirmed' : 'issue_corrected',
            actor,
            at: now,
          },
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({ message: 'Complaint was changed by another request. Please reload and try again.' });
    }

    await createNotification({
      user: actor,
      type: 'department_assigned',
      title: 'Department Assigned',
      message: `Your complaint has been assigned to the ${department}.`,
      complaint: updated._id,
    });

    return res.status(200).json({ complaint: updated });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    return res.status(500).json({ message: 'Failed to confirm issue type', error: error.message });
  }
};

// The only status a department authority may request is 'resolved', meaning
// "work is complete, please verify". It does not resolve the complaint; it
// moves it to pending_verification for a monitor to approve or reject.
// 'submitted' is no longer accepted here, so a department cannot reset or
// reopen a complaint without verification.
const VALID_AUTHORITY_STATUSES = ['resolved'];

// The only work status a department may set is 'in_progress'. Work status is
// a separate field from status (see backend/services/complaintStatus.js), so
// setting it never changes the verification workflow.
const VALID_AUTHORITY_WORK_STATUSES = [WORK_STATUS.IN_PROGRESS];

const REJECTION_REASON_MAX_LENGTH = 1000;
const MONITOR_DECISIONS = ['approve', 'reject'];

// image/imageClassification were originally left out of this projection.
// That meant an authority could never see the citizen's uploaded photo or
// its AI classification, even though neither field reveals anything about
// the citizen (image.filename/url only point at the uploaded file itself,
// same as what any citizen already sees for their own complaint). Adding
// them is the smallest change that closes that gap.
// `location` is included so a department can find where the issue is. It holds
// only the place the citizen attached to this complaint, never a stored home
// address. `user` stays excluded, since it identifies the citizen.
// verification.rejectionReason is included so a department can see why its
// completion was returned. Reviewer and submitter ids are not included.
const DEPARTMENT_COMPLAINT_FIELDS =
  'description issueType confidence department status workStatus workStartedAt dueAt escalationLevel escalatedAt createdAt updatedAt image imageClassification location verification.submittedAt verification.reviewedAt verification.rejectionReason';

// Monitors see the same complaint fields as departments, plus the verification
// trail. `user` stays excluded, as for departments.
const MONITOR_COMPLAINT_FIELDS =
  'description issueType confidence department status workStatus workStartedAt dueAt escalationLevel escalatedAt createdAt updatedAt image imageClassification verification verificationHistory';

const getDepartmentComplaints = async (req, res) => {
  try {
    const { department } = req.user;

    // Guard against Mongoose stripping an `undefined` query value (which
    // would turn `{ department: undefined }` into `{}` and match every
    // complaint in the system) if a department-role account somehow has no
    // department assigned.
    if (!department) {
      return res.status(403).json({ message: 'Your account is not assigned to a department' });
    }

    const complaints = await Complaint.find({ department })
      .select(DEPARTMENT_COMPLAINT_FIELDS)
      .sort({ createdAt: -1 });

    return res.status(200).json({ complaints });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch department complaints', error: error.message });
  }
};

const updateDepartmentComplaintStatus = async (req, res) => {
  try {
    const { department } = req.user;

    // Same guard as above - never let a missing department turn into an
    // unscoped query.
    if (!department) {
      return res.status(403).json({ message: 'Your account is not assigned to a department' });
    }

    const { status } = req.body;

    if (!status || !VALID_AUTHORITY_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${VALID_AUTHORITY_STATUSES.join(', ')}`,
      });
    }

    // Scoping the lookup by department (not just _id) is what prevents an
    // authority from updating another department's complaint - a mismatched
    // complaint simply isn't found, same 404 pattern as getComplaintById.
    const complaint = await Complaint.findOne({ _id: req.params.id, department });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Only a complaint that is currently 'submitted' can be sent for
    // verification. This rejects a repeat request while the complaint is
    // pending, and any attempt to change one already resolved or rejected
    // back and forth.
    if (complaint.status !== STATUS.SUBMITTED) {
      return res.status(409).json({
        message: `Only a complaint with status "${STATUS.SUBMITTED}" can be submitted for completion (current status: ${complaint.status})`,
      });
    }

    const now = new Date();
    const actor = req.user.id;

    const update = {
      status: STATUS.PENDING_VERIFICATION,
      'verification.submittedAt': now,
      'verification.submittedBy': actor,
    };

    // The escalation check only looks at 'submitted' complaints. If the next
    // escalation level is already due when the department submits, it must be
    // applied now. Otherwise the breach would be lost while the complaint waits
    // for review. Only one level is applied here, the same as the scheduler.
    const nextEscalation = getNextEscalation(complaint, now);
    if (nextEscalation) {
      update.escalationLevel = nextEscalation.level;
      update.escalatedAt = now;
    }

    // The status guard in the filter stops a concurrent request from
    // submitting the same complaint twice.
    const updated = await Complaint.findOneAndUpdate(
      { _id: complaint._id, status: STATUS.SUBMITTED },
      {
        $set: update,
        $push: { verificationHistory: { action: 'completion_submitted', actor, at: now } },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({ message: 'Complaint was changed by another request. Please reload and try again.' });
    }

    // Notifies the citizen, the department and monitors. Never throws, so a
    // notification problem cannot fail the submission. A failure here is logged
    // and not retried, because the scheduler only checks 'submitted' complaints.
    if (nextEscalation) {
      await notifyEscalation(updated, nextEscalation, now);
    }

    return res.status(200).json({ complaint: updated });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    return res.status(500).json({ message: 'Failed to update complaint status', error: error.message });
  }
};

// Department-only, and only for a complaint assigned to the requesting
// department. Marks a 'submitted' complaint as in progress. Status is not
// changed, so the SLA, escalation and monitor verification are unaffected.
// Submitting for verification does not require this step.
const updateDepartmentWorkStatus = async (req, res) => {
  try {
    const { department } = req.user;

    // Same guard as the other department handlers: never let a missing
    // department turn into an unscoped query.
    if (!department) {
      return res.status(403).json({ message: 'Your account is not assigned to a department' });
    }

    const { workStatus } = req.body;

    if (!workStatus || !VALID_AUTHORITY_WORK_STATUSES.includes(workStatus)) {
      return res.status(400).json({
        message: `Invalid work status. Must be one of: ${VALID_AUTHORITY_WORK_STATUSES.join(', ')}`,
      });
    }

    // Scoped by department, so another department's complaint is not found.
    const complaint = await Complaint.findOne({ _id: req.params.id, department });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (complaint.status !== STATUS.SUBMITTED) {
      return res.status(409).json({
        message: `Work can only be started on a complaint with status "${STATUS.SUBMITTED}" (current status: ${complaint.status})`,
      });
    }

    if (complaint.workStatus === WORK_STATUS.IN_PROGRESS) {
      return res.status(409).json({ message: 'Work on this complaint is already in progress' });
    }

    const now = new Date();
    const actor = req.user.id;

    // The status and work status guards in the filter stop a concurrent
    // request from starting the same complaint twice, and stop a change
    // after the complaint has left 'submitted'.
    const updated = await Complaint.findOneAndUpdate(
      {
        _id: complaint._id,
        department,
        status: STATUS.SUBMITTED,
        workStatus: { $ne: WORK_STATUS.IN_PROGRESS },
      },
      {
        $set: {
          workStatus: WORK_STATUS.IN_PROGRESS,
          workStartedAt: now,
        },
        $push: { verificationHistory: { action: 'work_started', actor, at: now } },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({ message: 'Complaint was changed by another request. Please reload and try again.' });
    }

    // Sent only after the status change has been saved. createNotification()
    // never throws and the unique {complaint, type} index allows one
    // notification per complaint, so a failed or repeated notification
    // cannot undo or duplicate the update. Work can start only once per
    // complaint: a monitor rejection returns it to in_progress, so it can
    // never go back to not_started.
    await createNotification({
      user: updated.user,
      type: 'complaint_work_started',
      title: 'Work Started',
      message: `The ${updated.department} has started work on your complaint.`,
      complaint: updated._id,
    });

    return res.status(200).json({ complaint: updated });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    return res.status(500).json({ message: 'Failed to update work status', error: error.message });
  }
};

// Monitor-only. Returns complaints waiting for verification, oldest
// submission first.
const getPendingVerificationComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ status: STATUS.PENDING_VERIFICATION })
      .select(MONITOR_COMPLAINT_FIELDS)
      .sort({ 'verification.submittedAt': 1 });

    return res.status(200).json({ complaints });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch pending verifications', error: error.message });
  }
};

// Monitor-only, read-only. Returns complaints in every status, newest first,
// with the same field selection as the pending list (no `user`, location, or
// reviewer/submitter ids), so the monitor can view recorded history.
const getAllComplaintsForMonitor = async (req, res) => {
  try {
    const complaints = await Complaint.find({})
      .select(MONITOR_COMPLAINT_FIELDS)
      .sort({ createdAt: -1 });

    return res.status(200).json({ complaints });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch complaints', error: error.message });
  }
};

// Monitor-only. Route-level requireRole('monitor') enforces the role; this
// handler does not trust the client for anything beyond the decision and
// reason.
//
// approve -> status 'resolved'.
// reject  -> status 'submitted' with a reason and a new rework deadline. The
//            escalation level is kept, and verificationHistory keeps a record.
const reviewCompletion = async (req, res) => {
  try {
    const { decision } = req.body;
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    if (!MONITOR_DECISIONS.includes(decision)) {
      return res.status(400).json({
        message: `Invalid decision. Must be one of: ${MONITOR_DECISIONS.join(', ')}`,
      });
    }

    if (decision === 'reject') {
      if (!reason) {
        return res.status(400).json({ message: 'A rejection reason is required' });
      }
      if (reason.length > REJECTION_REASON_MAX_LENGTH) {
        return res.status(400).json({
          message: `Rejection reason must be ${REJECTION_REASON_MAX_LENGTH} characters or fewer`,
        });
      }
    }

    const complaint = await Complaint.findOne({ _id: req.params.id });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (complaint.status !== STATUS.PENDING_VERIFICATION) {
      return res.status(409).json({
        message: `Only a complaint with status "${STATUS.PENDING_VERIFICATION}" can be reviewed (current status: ${complaint.status})`,
      });
    }

    const now = new Date();
    const actor = req.user.id;

    // Which rejection this is for the complaint (1, 2, ...). Each rework cycle
    // ends in one rejection, so this numbers the rejection notifications.
    const verificationRound =
      (complaint.verificationHistory || []).filter((entry) => entry.action === 'rejected').length + 1;

    const update =
      decision === 'approve'
        ? {
            status: STATUS.RESOLVED,
            'verification.reviewedAt': now,
            'verification.reviewedBy': actor,
          }
        : {
            status: STATUS.SUBMITTED,
            // The department is reworking the complaint, so it is back in progress.
            workStatus: WORK_STATUS.IN_PROGRESS,
            dueAt: calculateReworkDueAt(now),
            'verification.reviewedAt': now,
            'verification.reviewedBy': actor,
            'verification.rejectionReason': reason,
          };

    const historyEntry =
      decision === 'approve'
        ? { action: 'approved', actor, at: now }
        : { action: 'rejected', actor, at: now, reason };

    // The status guard in the filter means only one monitor's decision can
    // apply to a pending completion.
    const updated = await Complaint.findOneAndUpdate(
      { _id: complaint._id, status: STATUS.PENDING_VERIFICATION },
      { $set: update, $push: { verificationHistory: historyEntry } },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({ message: 'Complaint was changed by another request. Please reload and try again.' });
    }

    // Sent only after the guarded update has saved the decision, so a repeated
    // or losing request never reaches this point. createNotification() never
    // throws, so a failed notification cannot undo the decision.
    if (decision === 'approve') {
      await createNotification({
        user: updated.user,
        type: 'complaint_resolved',
        title: 'Complaint Resolved',
        message: 'Your complaint has been verified by a monitor and marked as resolved.',
        complaint: updated._id,
      });
    } else {
      await createNotification({
        user: updated.user,
        type: 'complaint_verification_failed',
        title: 'Verification Failed',
        message: `A monitor could not verify the work on your complaint and returned it to the department for rework. Reason: ${reason}`,
        complaint: updated._id,
        verificationRound,
      });
    }

    return res.status(200).json({ complaint: updated });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    return res.status(500).json({ message: 'Failed to review complaint', error: error.message });
  }
};

module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  getComplaintImage,
  resolveStoredImagePath,
  canViewComplaintImage,
  confirmIssueType,
  getDepartmentComplaints,
  updateDepartmentComplaintStatus,
  updateDepartmentWorkStatus,
  getPendingVerificationComplaints,
  getAllComplaintsForMonitor,
  reviewCompletion,
};
