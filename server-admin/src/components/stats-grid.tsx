export interface MetricCardItem {
  label: string;
  value: string;
  detail: string;
}

export function StatsGrid({ metrics }: { metrics: MetricCardItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-3xl border border-border/80 bg-white/72 p-5 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.42)] backdrop-blur">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</div>
          <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{metric.value}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{metric.detail}</p>
        </div>
      ))}
    </div>
  );
}
