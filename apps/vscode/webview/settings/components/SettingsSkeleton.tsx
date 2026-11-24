export function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading settings" className="grid gap-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="h-48 animate-breathe rounded-xl bg-ink/[0.04] motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
