import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

export function Modal({ isOpen, onClose, title, children, footer }) {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="rn-modal-overlay" onMouseDown={onClose}>
      <div
        className="rn-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="rn-modal__header">
          <h2 id={titleId} className="rn-modal__title">
            {title}
          </h2>
          <button type="button" className="rn-modal__close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="rn-modal__body">{children}</div>
        {footer && <div className="rn-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
