interface CardViewProps {
  children: React.ReactNode;
  columns?: 2 | 3;
}

export function CardView({ children, columns = 2 }: CardViewProps) {
  return (
    <div className={`grid gap-3 ${
      columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2"
    }`}>
      {children}
    </div>
  );
}
