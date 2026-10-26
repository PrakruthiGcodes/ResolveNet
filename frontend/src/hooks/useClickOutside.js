import { useEffect } from 'react';

export function useClickOutside(ref, onOutsideClick, isActive) {
  useEffect(() => {
    if (!isActive) return undefined;

    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        onOutsideClick();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onOutsideClick();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, onOutsideClick, isActive]);
}
