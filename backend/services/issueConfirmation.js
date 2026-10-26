/**
 * Decisions for complaints whose AI image result is not usable or not reliable
 * enough for automatic routing.
 *
 * A complaint with an attached image is classified by the Teachable Machine model. A photo
 * that the model cannot classify, or whose prediction is not reliable enough,
 * is saved as needs_confirmation until the owning citizen confirms or corrects
 * the issue type. This file holds only the rules, so they can be tested without
 * a database.
 */

const { DEPARTMENT_MAP } = require('./departmentRouter');

// The application's issue types are the keys of DEPARTMENT_MAP. Confirmed types
// must be one of these, so the department and SLA lookups always resolve.
const SUPPORTED_ISSUE_TYPES = Object.keys(DEPARTMENT_MAP);

const isSupportedIssueType = (issueType) => SUPPORTED_ISSUE_TYPES.includes(issueType);

// PROVISIONAL automatic-routing threshold. It is applied to the Teachable Machine
// top-class probability (a softmax score from teachableMachineClassifier.js). That
// score is not a measured probability of being correct. The value was picked
// during the earlier YOLO work and has NOT been validated for this model. It must
// be re-checked against labelled data for the Teachable Machine classes.
const AUTO_ROUTE_MIN_CONFIDENCE = 0.5;

// Issue types that may be routed without the citizen's confirmation. Every other
// supported type always needs confirmation for now, whatever the confidence:
//   'water_leakage' - too few labelled examples (12 validation, 5 test).
//   'other'         - the model's fallen_tree class, which has very low precision.
const AUTO_ROUTABLE_ISSUE_TYPES = ['pothole', 'garbage', 'streetlight'];

const isImageDetectionUsable = (imageClassification) =>
  Boolean(imageClassification) &&
  imageClassification.modelAvailable === true &&
  imageClassification.detected === true &&
  isSupportedIssueType(imageClassification.issueType);

// True only when the detection is usable AND its type is eligible for automatic
// routing AND its confidence is a finite number at or above the threshold. A
// missing, non-numeric, or below-threshold confidence is not auto-routable.
const isAutoRoutableDetection = (imageClassification) =>
  isImageDetectionUsable(imageClassification) &&
  AUTO_ROUTABLE_ISSUE_TYPES.includes(imageClassification.issueType) &&
  typeof imageClassification.confidence === 'number' &&
  Number.isFinite(imageClassification.confidence) &&
  imageClassification.confidence >= AUTO_ROUTE_MIN_CONFIDENCE;

// A complaint with a photo needs citizen confirmation unless its photo result
// is auto-routable. A complaint without a photo is not affected by this rule.
const needsIssueConfirmation = ({ hasImage, imageClassification }) =>
  Boolean(hasImage) && !isAutoRoutableDetection(imageClassification);

// Chooses the issue type for a new complaint from the description and photo.
//
//   hasImage            - whether a photo was attached.
//   textResult          - { issueType, confidence } from classifyIssue(), or null
//                         when no description was given.
//   imageClassification - the result from classifyImage(), or undefined.
//
// Returns { issueType, confidence, needsConfirmation }:
//   - No photo: the description's type is used, as before.
//   - No usable photo detection (no detection, model unavailable, error): the
//     description's type (or 'other') is only a suggestion, so the citizen must
//     confirm. No confidence is returned.
//   - A usable detection that is not auto-routable (type not eligible, or
//     confidence missing or below AUTO_ROUTE_MIN_CONFIDENCE): the citizen must
//     confirm. The description's type is the suggestion when there is a specific
//     one, otherwise the photo's type is.
//   - An auto-routable detection that disagrees with a specific description
//     type: the two inputs conflict, so the citizen must confirm. The
//     description's type is the suggestion.
//   - Otherwise the photo's type is used, with the model's own confidence. A
//     'other' description never overrides an auto-routable photo result.
const resolveIssueType = ({ hasImage, textResult, imageClassification }) => {
  const textIssueType = textResult ? textResult.issueType : null;

  if (!hasImage) {
    return {
      issueType: textIssueType || 'other',
      confidence: textResult ? textResult.confidence : undefined,
      needsConfirmation: false,
    };
  }

  if (!isImageDetectionUsable(imageClassification)) {
    return { issueType: textIssueType || 'other', confidence: undefined, needsConfirmation: true };
  }

  const imageIssueType = imageClassification.issueType;
  const textIsSpecific = Boolean(textIssueType) && textIssueType !== 'other';

  if (!isAutoRoutableDetection(imageClassification)) {
    return {
      issueType: textIsSpecific ? textIssueType : imageIssueType,
      confidence: undefined,
      needsConfirmation: true,
    };
  }

  if (textIsSpecific && textIssueType !== imageIssueType) {
    return { issueType: textIssueType, confidence: undefined, needsConfirmation: true };
  }

  return { issueType: imageIssueType, confidence: imageClassification.confidence, needsConfirmation: false };
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
