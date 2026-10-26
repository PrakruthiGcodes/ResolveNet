const express = require('express');
const {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  getComplaintImage,
  confirmIssueType,
  getDepartmentComplaints,
  updateDepartmentComplaintStatus,
  updateDepartmentWorkStatus,
  getPendingVerificationComplaints,
  getAllComplaintsForMonitor,
  reviewCompletion,
} = require('../controllers/complaintController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { uploadComplaintImage } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post('/', protect, uploadComplaintImage, createComplaint);
router.get('/', protect, getMyComplaints);

// Citizen-only. The handler scopes the lookup to the requesting user, so a
// citizen can only confirm their own complaint. Registered before '/:id' so
// the literal sub-path is not captured by the wildcard.
router.patch('/:id/confirm-issue-type', protect, requireRole('citizen'), confirmIssueType);

// Authority-only routes. Registered before '/:id' so literal paths like
// '/department' are never captured by the ':id' wildcard.
router.get('/department', protect, requireRole('department'), getDepartmentComplaints);
router.patch('/department/:id/status', protect, requireRole('department'), updateDepartmentComplaintStatus);
router.patch('/department/:id/work-status', protect, requireRole('department'), updateDepartmentWorkStatus);

// Monitor-only routes. Same pattern: protect (verifies the JWT and reloads the
// user's role from the database) then requireRole.
router.get('/monitor', protect, requireRole('monitor'), getAllComplaintsForMonitor);
router.get('/monitor/pending-verification', protect, requireRole('monitor'), getPendingVerificationComplaints);
router.patch('/monitor/:id/review', protect, requireRole('monitor'), reviewCompletion);

// Complaint photo. Authenticated, and the handler applies the same ownership and
// department rules as the complaint itself. Admin accounts have no complaint access.
router.get('/:id/image', protect, requireRole('citizen', 'department', 'monitor'), getComplaintImage);

router.get('/:id', protect, getComplaintById);

module.exports = router;
