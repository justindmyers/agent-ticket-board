export function QueueSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tickets" className="grid gap-1 pt-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="grid gap-2 rounded-xl px-3 py-2.5">
          <span className="h-2.5 w-16 animate-breathe rounded bg-ink/[0.07] motion-reduce:animate-none" />
          <span
            className="h-3 animate-breathe rounded bg-ink/[0.07] motion-reduce:animate-none"
            style={{ width: `${45 + ((i * 37) % 45)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
