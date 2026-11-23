export function TicketSkeleton() {
  return (
    <div className="grid max-w-[1180px] gap-4 p-5" aria-busy="true" aria-label="Loading ticket">
      <div className="h-[230px] animate-breathe rounded-2xl bg-ink/[0.05] motion-reduce:animate-none" />
      <div className="h-[200px] animate-breathe rounded-xl bg-ink/[0.04] motion-reduce:animate-none" />
    </div>
  );
}
