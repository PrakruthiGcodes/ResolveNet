import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} — ResolveNet` : 'ResolveNet';
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
