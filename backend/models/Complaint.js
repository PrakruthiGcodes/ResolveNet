const mongoose = require('mongoose');
const { COMPLAINT_STATUSES, STATUS, WORK_STATUSES, WORK_STATUS } = require('../services/complaintStatus');

const complaintSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Required unless a photo is attached. A photo-only complaint is classified
    // from the image (see services/issueConfirmation.js resolveIssueType).
    description: {
      type: String,
      required: [
        function () {
          return !(this.image && this.image.filename);
        },
        'Description is required when no photo is attached',
      ],
      trim: true,
    },
    issueType: {
      type: String,
      trim: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    severity: {
      type: String,
      trim: true,
    },
    // The place where the issue is, chosen by the citizen. Validated in
    // services/complaintLocation.js; the limits here are a second check.
    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      address: { type: String, trim: true, maxlength: 300 },
    },
    image: {
      filename: { type: String },
      url: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
      size: { type: Number },
    },
    // Result of the image-based classifier (see backend/services/imageClassifier.js).
    // This is a separate foundation layer from the text classifier above -
    // modelAvailable is false until a real trained model is wired in.
    // `confidence` is null when the model produced no prediction, and `message`
    // keeps the reason (e.g. "no known issue detected"). Both are stored as-is
    // so the original AI result stays available after a citizen corrects it.
    imageClassification: {
      issueType: { type: String },
      confidence: { type: Number, min: 0, max: 1 },
      detected: { type: Boolean },
      modelAvailable: { type: Boolean },
      message: { type: String, trim: true },
    },
    // Set when the citizen confirms or corrects the issue type of a
    // needs_confirmation complaint. `suggestedIssueType` is what the
    // complaint was shown with before the citizen answered.
    issueConfirmation: {
      suggestedIssueType: { type: String },
      confirmedIssueType: { type: String },
      action: { type: String, enum: ['confirmed', 'corrected'] },
      at: { type: Date },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    // See backend/services/complaintStatus.js for the lifecycle.
    status: {
      type: String,
      enum: COMPLAINT_STATUSES,
      default: STATUS.SUBMITTED,
    },
    department: {
      type: String,
      trim: true,
    },
    // Whether the assigned department has started work. Only meaningful while
    // status is 'submitted'. Documents from before this field existed have no
    // value, which is read as not_started. See backend/services/complaintStatus.js.
    workStatus: {
      type: String,
      enum: WORK_STATUSES,
      default: WORK_STATUS.NOT_STARTED,
    },
    workStartedAt: {
      type: Date,
    },
    // Automatic escalation (see backend/services/slaConfig.js and
    // backend/services/escalationService.js). dueAt is computed once at
    // creation from the SLA for the complaint's issueType. escalationLevel
    // starts at 0 and is bumped by the background scheduler if the
    // complaint is still unresolved past dueAt; escalatedAt records when
    // that happened. All three are optional so existing documents created
    // before this feature remain valid without a migration.
    dueAt: {
      type: Date,
    },
    escalationLevel: {
      type: Number,
      default: 0,
    },
    escalatedAt: {
      type: Date,
    },
    // Completion verification. `verification` holds the most recent
    // submission and review; `verificationHistory` is the append-only record
    // of issue-type confirmations and corrections, completion submissions,
    // approvals and rejections.
    verification: {
      submittedAt: { type: Date },
      submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      // Reason for the most recent rejection. Previous reasons remain in
      // verificationHistory.
      rejectionReason: { type: String, trim: true },
    },
    verificationHistory: [
      {
        action: {
          type: String,
          enum: ['issue_confirmed', 'issue_corrected', 'work_started', 'completion_submitted', 'approved', 'rejected'],
          required: true,
        },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, required: true },
        reason: { type: String, trim: true },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
