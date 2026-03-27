import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { UploadProvider } from "../contexts/UploadContext";
import Layout from "../components/Layout";
import { Logo } from "../components/ui/logo";
import { Button } from "../components/ui/button";

function NotFoundContent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-2 text-2xl font-semibold text-foreground">
          Page Not Found
        </h1>
        <p className="mb-6 text-text-secondary">
          The page you are looking for does not exist.
        </p>
        <Button
          asChild
          className="bg-[var(--color-brand-accent)] text-primary-foreground hover:bg-[var(--color-brand-accent)]/90 dark:bg-[var(--color-brand-accent-dark)] dark:text-primary-foreground dark:hover:bg-[var(--color-brand-accent-dark)]/90"
        >
          <Link to="/projects">Go to Projects</Link>
        </Button>
      </div>
    </div>
  );
}

function UnauthenticatedNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <Logo size="heading" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-foreground">
          Page Not Found
        </h1>
        <p className="mb-6 text-text-secondary">
          The page you are looking for does not exist.
        </p>
        <Button
          asChild
          className="bg-[var(--color-brand-accent)] text-primary-foreground hover:bg-[var(--color-brand-accent)]/90 dark:bg-[var(--color-brand-accent-dark)] dark:text-primary-foreground dark:hover:bg-[var(--color-brand-accent-dark)]/90"
        >
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    </div>
  );
}

export default function NotFoundPage() {
  const { isSignedIn: isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <UploadProvider>
        <Layout>
          <NotFoundContent />
        </Layout>
      </UploadProvider>
    );
  }

  return <UnauthenticatedNotFound />;
}
