/**
 * Department routing.
 *
 * Maps the application-level Complaint.issueType (NOT raw YOLO class names)
 * to the department responsible for handling it. See
 * backend/services/issueClassifier.js and backend/services/imageClassifier.js
 * for how issueType is determined.
 */

const DEFAULT_DEPARTMENT = 'General/Municipal Department';

const DEPARTMENT_MAP = {
  pothole: 'Road Department',
  garbage: 'Sanitation Department',
  water_leakage: 'Water Department',
  streetlight: 'Electrical Department',
  other: DEFAULT_DEPARTMENT,
};

const getDepartment = (issueType) => DEPARTMENT_MAP[issueType] || DEFAULT_DEPARTMENT;

module.exports = { getDepartment, DEPARTMENT_MAP, DEFAULT_DEPARTMENT };
