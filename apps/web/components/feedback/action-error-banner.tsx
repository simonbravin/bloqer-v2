export function ActionErrorBanner({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <div
      className={
        className
          ? `rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive ${className}`
          : "rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      }
      role="alert"
    >
      {message}
    </div>
  );
}
