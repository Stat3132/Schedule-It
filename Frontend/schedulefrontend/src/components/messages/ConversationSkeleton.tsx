type ConversationSkeletonProps = {
  rows?: number;
  label?: string;
};

export function ConversationSkeleton({ rows = 4, label = "Loading conversation" }: ConversationSkeletonProps) {
  const placeholders = Array.from({ length: rows });

  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {placeholders.map((_, index) => {
        const alignStart = index % 2 === 0;
        return (
          <div
            key={`skeleton-${index}`}
            className={`flex w-full ${alignStart ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`flex max-w-[80%] items-start gap-3 ${alignStart ? "" : "flex-row-reverse"}`}
            >
              <div className="h-8 w-8 rounded-full bg-muted/50 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 rounded bg-muted/40 animate-pulse" />
                <div className="h-12 rounded-2xl bg-muted/30 animate-pulse" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
