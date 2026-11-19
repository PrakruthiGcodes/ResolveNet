
/**
 * Decisions for complaints whose AI image result is not usable or reliable
 * enough for automatic routing.
 */

const { DEPARTMENT_MAP } = require('./departmentRouter');

const SUPPORTED_ISSUE_TYPES = Object.keys(DEPARTMENT_MAP);

const AUTO_ROUTE_MIN_CONFIDENCE = 0.5;

const AUTO_ROUTABLE_ISSUE_TYPES = [
  'pothole',
  'garbage',
  'streetlight',
];

const isSupportedIssueType = (issueType) =>
  SUPPORTED_ISSUE_TYPES.includes(issueType);

/**
 * An image result is usable only when the classifier explicitly confirms
 * that the model is available and a detection was made.
 */
const isImageDetectionUsable = (imageClassification) =>
  Boolean(imageClassification) &&
  imageClassification.modelAvailable === true &&
  imageClassification.detected === true &&
  isSupportedIssueType(imageClassification.issueType);

/**
 * Only sufficiently confident supported detections can be auto-routed.
 */
const isAutoRoutableDetection = (imageClassification) =>
  isImageDetectionUsable(imageClassification) &&
  AUTO_ROUTABLE_ISSUE_TYPES.includes(imageClassification.issueType) &&
  typeof imageClassification.confidence === 'number' &&
  Number.isFinite(imageClassification.confidence) &&
  imageClassification.confidence >= AUTO_ROUTE_MIN_CONFIDENCE;

/**
 * Images that cannot be safely auto-routed require user confirmation.
 */
const needsIssueConfirmation = ({ hasImage, imageClassification }) =>
  Boolean(hasImage) &&
  !isAutoRoutableDetection(imageClassification);

/**
 * Resolves the issue type using text and image classification results.
 */
const resolveIssueType = ({
  hasImage,
  textResult,
  imageClassification,
}) => {
  const textIssueType = textResult?.issueType || null;

  // Description-only complaint.
  if (!hasImage) {
    return {
      issueType: textIssueType || 'other',
      confidence: textResult?.confidence,
      needsConfirmation: false,
    };
  }

  // Missing, unavailable, undetected, or unsupported image result.
  if (!isImageDetectionUsable(imageClassification)) {
    return {
      issueType: textIssueType || 'other',
      confidence: undefined,
      needsConfirmation: true,
    };
  }

  const imageIssueType = imageClassification.issueType;
  const imageConfidence = imageClassification.confidence;

  const textIsSpecific =
    Boolean(textIssueType) && textIssueType !== 'other';

  // Image result is usable but not confident enough for auto-routing.
  if (!isAutoRoutableDetection(imageClassification)) {
    return {
      issueType: textIsSpecific ? textIssueType : imageIssueType,
      confidence: undefined,
      needsConfirmation: true,
    };
  }

  // Text and image classifications disagree.
  if (textIsSpecific && textIssueType !== imageIssueType) {
    return {
      issueType: textIssueType,
      confidence: undefined,
      needsConfirmation: true,
    };
  }

  // Reliable image result.
  return {
    issueType: imageIssueType,
    confidence: imageConfidence,
    needsConfirmation: false,
  };
};

module.exports = {
  SUPPORTED_ISSUE_TYPES,
  AUTO_ROUTE_MIN_CONFIDENCE,
  AUTO_ROUTABLE_ISSUE_TYPES,
  isSupportedIssueType,
  isImageDetectionUsable,
  isAutoRoutableDetection,
  needsIssueConfirmation,
  resolveIssueType,
};
