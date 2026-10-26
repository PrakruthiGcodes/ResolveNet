import { Card, CardHeader } from '../ui';
import { formatComplaintLocation, formatCoordinates, getMapUrl, hasCoordinates } from '../../utils/complaintLocation';

// Where the issue is, as the citizen attached it. Used on both the citizen and
// department detail pages. Styles come from ComplaintDetailPage.css, which both
// pages import.
export function IssueLocation({ location }) {
  const text = formatComplaintLocation(location);
  const mapUrl = getMapUrl(location);

  return (
    <Card>
      <CardHeader title="Issue Location" />
      {text ? (
        <p className="rn-detail-side-note">{text}</p>
      ) : (
        <p className="rn-detail-side-note">No location was given for this issue.</p>
      )}
      {location?.address && hasCoordinates(location) && (
        <p className="rn-detail-side-note">
          Coordinates: {formatCoordinates(location.latitude, location.longitude)}
        </p>
      )}
      {mapUrl && (
        <p className="rn-detail-side-note">
          <a href={mapUrl} target="_blank" rel="noopener noreferrer">
            View on map
          </a>
        </p>
      )}
    </Card>
  );
}
