import { PageContainer, EmptyState, Button } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page Not Found');

  return (
    <PageContainer>
      <EmptyState
        icon="404"
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={<Button to="/">Return home</Button>}
      />
    </PageContainer>
  );
}
