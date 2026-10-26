import { useEffect, useState } from 'react';
import apiClient from '../../services/apiClient';

// Shows the photo for a complaint. The image endpoint needs the Bearer token,
// which an <img src> cannot send, so the photo is fetched through the API client
// and shown from a blob URL. That URL is revoked when the photo changes or the
// component unmounts.
export function ComplaintPhoto({ complaintId, hasImage }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!hasImage || !complaintId) {
      return undefined;
    }

    let objectUrl = null;
    let cancelled = false;

    apiClient
      .get(`/complaints/${complaintId}/image`, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setSrc(objectUrl);
      })
      .catch(() => {
        // The photo is optional on the page. If it cannot load, nothing is shown.
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setSrc(null);
    };
  }, [complaintId, hasImage]);

  if (!src) {
    return null;
  }

  return (
    <div className="rn-detail-image">
      <img src={src} alt="Photo submitted with this report" />
    </div>
  );
}
