import { useRef, useState } from 'react';
import { PageContainer, Card, Button, Textarea, Input, Alert, Badge } from '../../components/ui';
import { IssueTypeConfirmation } from '../../components/complaints/IssueTypeConfirmation';
import { createComplaint } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  describeImageAnalysis,
  hasImageDetection,
  isNeedsConfirmation,
} from '../../utils/complaintHelpers';
import { formatIssueType, formatDateTime, formatComplaintRef } from '../../utils/formatters';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES } from '../../utils/constants';
import { buildLocationPayload, formatCoordinates, validateAddress } from '../../utils/complaintLocation';
import { IssueLocationPicker } from '../../components/complaints/IssueLocationPicker';
import './ReportComplaintPage.css';

const MAX_IMAGE_SIZE_MB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);

// GeolocationPositionError.PERMISSION_DENIED. Written as a number so the code
// does not depend on the error object's constants.
const PERMISSION_DENIED_CODE = 1;

const LOCATION_NOTICES = {
  requesting: 'Getting your location…',
  captured: 'Location captured from your device. Only this issue’s coordinates are sent.',
  picked: 'Pin placed on the map. Click elsewhere on the map to move it.',
  denied: 'Location permission was denied. You can type the address of the issue instead.',
  unavailable: 'Your location could not be found. You can type the address of the issue instead.',
};

export function ReportComplaintPage() {
  useDocumentTitle('Report an Issue');
  const fileInputRef = useRef(null);

  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [fieldError, setFieldError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Location is optional. `coordinates` is set only from the device. `address`
  // is the typed fallback, or an extra note next to the coordinates.
  const [coordinates, setCoordinates] = useState(null);
  const [address, setAddress] = useState('');
  const [locationStatus, setLocationStatus] = useState('idle');
  const [showAddressField, setShowAddressField] = useState(false);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setFieldError('');

    if (!file) {
      setImageFile(null);
      setImagePreviewUrl(null);
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setFieldError('Please choose a JPEG, PNG, GIF, or WEBP image.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setFieldError(`Image must be smaller than ${MAX_IMAGE_SIZE_MB}MB.`);
      event.target.value = '';
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      setShowAddressField(true);
      return;
    }

    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationStatus('captured');
      },
      (error) => {
        setCoordinates(null);
        setLocationStatus(error.code === PERMISSION_DENIED_CODE ? 'denied' : 'unavailable');
        setShowAddressField(true);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // Called by the map on each click. The address field opens so the citizen can
  // confirm or add a landmark for the pinned spot.
  const handleMapSelect = (point) => {
    setCoordinates(point);
    setLocationStatus('picked');
    setShowAddressField(true);
  };

  const handleClearLocation = () => {
    setCoordinates(null);
    setAddress('');
    setLocationStatus('idle');
    setShowAddressField(false);
  };

  const resetForm = () => {
    setDescription('');
    handleRemoveImage();
    handleClearLocation();
    setResult(null);
    setSubmitError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    // A description or a photo is enough. Both are optional on their own.
    if (!description.trim() && !imageFile) {
      setFieldError('Please describe the issue or attach a photo.');
      return;
    }

    const addressError = validateAddress(address);
    if (addressError) {
      setFieldError(addressError);
      return;
    }

    setIsSubmitting(true);
    try {
      const location = buildLocationPayload({ ...coordinates, address });
      const data = await createComplaint({ description: description.trim(), imageFile, location });
      setResult(data.complaint);
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Unable to submit your report. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // The photo could not be classified, so no department is assigned yet. The
  // citizen confirms the issue type here; the response then shows as submitted.
  if (result && isNeedsConfirmation(result)) {
    return (
      <PageContainer
        title="One More Step"
        subtitle="Your report is saved. Confirm its issue type so it can be routed to the right department."
      >
        <Card className="rn-report-result">
          <div className="rn-report-result__row">
            <span className="rn-report-result__label">Complaint reference</span>
            <span className="rn-report-result__ref">{formatComplaintRef(result._id)}</span>
          </div>

          <IssueTypeConfirmation complaint={result} onConfirmed={setResult} />

          <div className="rn-report-result__actions">
            <Button variant="outline" to={`/citizen/complaints/${result._id}`}>
              View This Complaint
            </Button>
            <Button variant="ghost" onClick={resetForm}>
              Report Another Issue
            </Button>
          </div>
        </Card>
      </PageContainer>
    );
  }

  if (result) {
    return (
      <PageContainer title="Report Submitted" subtitle="ResolveNet has classified and routed your report.">
        <Card className="rn-report-result">
          <div className="rn-report-result__row">
            <span className="rn-report-result__label">Complaint reference</span>
            <span className="rn-report-result__ref">{formatComplaintRef(result._id)}</span>
          </div>
          <div className="rn-report-result__row">
            <span className="rn-report-result__label">Issue type</span>
            <span>
              <Badge variant="neutral">{formatIssueType(result.issueType)}</Badge>
              {typeof result.confidence === 'number' && (
                <span className="rn-report-result__confidence">
                  {' '}
                  {Math.round(result.confidence * 100)}% confidence
                </span>
              )}
            </span>
          </div>
          <div className="rn-report-result__row">
            <span className="rn-report-result__label">Assigned department</span>
            <Badge variant="info">{result.department}</Badge>
          </div>
          <div className="rn-report-result__row">
            <span className="rn-report-result__label">Resolution deadline (SLA)</span>
            <span>{formatDateTime(result.dueAt)}</span>
          </div>

          {result.imageClassification && (
            <div className="rn-report-result__image-note">
              {hasImageDetection(result.imageClassification) ? (
                <p>
                  Image analysis detected <strong>{formatIssueType(result.imageClassification.issueType)}</strong>{' '}
                  ({Math.round(result.imageClassification.confidence * 100)}% confidence).
                </p>
              ) : (
                <p>{describeImageAnalysis(result.imageClassification)}</p>
              )}
            </div>
          )}

          <div className="rn-report-result__actions">
            <Button to={`/citizen/complaints/${result._id}`}>View This Complaint</Button>
            <Button variant="outline" onClick={resetForm}>
              Report Another Issue
            </Button>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Report a New Issue"
      subtitle="Describe the issue, attach a photo, or both. ResolveNet will classify it and route it to the responsible department."
    >
      <Card>
        {submitError && <Alert variant="error">{submitError}</Alert>}

        <form className="rn-report-form" onSubmit={handleSubmit} noValidate>
          <Textarea
            label="Description (optional if you attach a photo)"
            hint="Describe the issue, or attach a photo below instead."
            placeholder="Describe the issue - e.g. 'There is a large pothole on Main Street near the school.'"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              if (fieldError) setFieldError('');
            }}
          />

          <div className="rn-field">
            <span className="rn-field__label">Photo (optional)</span>

            {imagePreviewUrl ? (
              <div className="rn-report-form__preview">
                <img src={imagePreviewUrl} alt="Selected issue" />
                <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage}>
                  Remove photo
                </Button>
              </div>
            ) : (
              <label className="rn-report-form__upload" htmlFor="report-image-input">
                <span>Click to attach a photo</span>
                <span className="rn-report-form__upload-hint">JPEG, PNG, GIF, or WEBP · up to {MAX_IMAGE_SIZE_MB}MB</span>
              </label>
            )}
            <input
              ref={fileInputRef}
              id="report-image-input"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={handleFileChange}
              className="rn-visually-hidden"
            />
            <p className="rn-field__hint">
              If we cannot analyse the photo, we will ask you to confirm the issue type after you submit.
            </p>
            {fieldError && (
              <p className="rn-field__error" role="alert">
                {fieldError}
              </p>
            )}
          </div>

          <div className="rn-field">
            <span className="rn-field__label">Where is the issue? (optional)</span>
            <p className="rn-field__hint">
              Give the location of the problem itself, not your home address. Departments use it to find the issue.
            </p>

            <div className="rn-report-form__location-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUseCurrentLocation}
                isLoading={locationStatus === 'requesting'}
              >
                Use my current location
              </Button>
              {!showAddressField && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddressField(true)}>
                  Type an address instead
                </Button>
              )}
              {(coordinates || address) && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearLocation}>
                  Clear location
                </Button>
              )}
            </div>

            {locationStatus !== 'idle' && (
              <p className="rn-report-form__location-status">
                {LOCATION_NOTICES[locationStatus]}
                {(locationStatus === 'captured' || locationStatus === 'picked') && coordinates && (
                  <> ({formatCoordinates(coordinates.latitude, coordinates.longitude)})</>
                )}
              </p>
            )}

            <IssueLocationPicker coordinates={coordinates} onSelect={handleMapSelect} />

            {showAddressField && (
              <Input
                label="Address or landmark of the issue"
                hint="For example: Main Street, opposite the school gate."
                placeholder="Street, area, or nearby landmark"
                value={address}
                maxLength={300}
                onChange={(event) => setAddress(event.target.value)}
              />
            )}
          </div>

          <div className="rn-report-form__actions">
            <Button type="submit" isLoading={isSubmitting}>
              Submit Report
            </Button>
            <Button variant="ghost" to="/citizen/dashboard">
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </PageContainer>
  );
}
