import { CheckCircle, XCircle } from "lucide-react";

interface ExampleProps {
  label: string;
  children: React.ReactNode;
}

export function DoExample({ label, children }: ExampleProps) {
  return (
    <div className="border-l-4 border-success rounded-lg p-4 bg-success-subtle/50">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle className="size-4 text-success" />
        <span className="text-sm font-medium text-success">Do</span>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function DontExample({ label, children }: ExampleProps) {
  return (
    <div className="border-l-4 border-destructive rounded-lg p-4 bg-destructive-subtle/50">
      <div className="flex items-center gap-2 mb-3">
        <XCircle className="size-4 text-destructive" />
        <span className="text-sm font-medium text-destructive">Don't</span>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function DoAndDontGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">{children}</div>
  );
}
