import { lazy, Suspense } from "react";
import { ArrowUpRight, CircleAlert, RefreshCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, CardHeader, cx } from "../../components/ui";
import { LEAK_META, TONE_CLASSES } from "../../domain/leaks";
import { LEAK_TYPES, type DashboardSummary, type PriorityItem } from "../../domain/types";
import { useDashboardSummary } from "../../data/useDashboardSummary";
import { formatChange, formatDue, formatMoney, formatPercent } from "../../lib/format";

// Three.js ships in its own chunk so the worklist never waits on it.
const RecoveryFlow = lazy(() => import("../../components/three/RecoveryFlow"));

export const DashboardPage = () => {
  const { data, isPending, isError, error, refetch, isFetching } = useDashboardSummary();

  if (isPending) return <DashboardSkeleton />;
  if (isError) {
    return (
      <Card className="flex items-center gap-3 p-5 text-rr-missed">
        <CircleAlert size={18} />
        <p className="text-sm">{error.message}</p>
        <Button variant="ghost" className="ml-auto" onClick={() => refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <RecoveredHero summary={data} onRefresh={() => refetch()} refreshing={isFetching} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {LEAK_TYPES.map((type) => (
          <LeakCard key={type} type={type} summary={data} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <RecoveredTrend summary={data} />
        <PriorityList items={data.topItems} currency={data.currency} />
      </div>
    </div>
  );
};

const RecoveredHero = ({
  summary,
  onRefresh,
  refreshing,
}: {
  summary: DashboardSummary;
  onRefresh: () => void;
  refreshing: boolean;
}) => {
  const change = formatChange(summary.recoveredValue, summary.recoveredPreviousValue);

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_40%,var(--color-rr-primary-soft),transparent_60%)]" />
      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col justify-between gap-6 p-6 lg:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-rr-recovered-soft px-2.5 py-1 text-xs font-medium text-rr-recovered">
              This month
            </span>
            <Button variant="ghost" onClick={onRefresh} disabled={refreshing} aria-label="Refresh numbers">
              <RefreshCw size={15} className={cx(refreshing && "animate-spin")} />
            </Button>
          </div>
          <div>
            <p className="text-sm text-rr-ink-soft">Revenue recovered</p>
            <p className="rr-tabular mt-1 font-rr-display text-4xl font-bold tracking-tight text-rr-ink sm:text-[44px]">
              {formatMoney(summary.recoveredValue, summary.currency)}
            </p>
            {change && (
              <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-rr-recovered">
                <ArrowUpRight size={16} />
                {change} vs same point last month
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-4 border-t border-rr-line pt-4">
            <HeroStat label="Bookings won back" value={String(summary.recoveredBookings)} />
            <HeroStat label="Recovery rate" value={formatPercent(summary.recoveryRate)} />
            <HeroStat
              label="Still at risk"
              value={formatMoney(summary.atRiskValue, summary.currency)}
              valueClass="text-rr-risk"
            />
          </dl>
        </div>
        <div className="relative h-56 lg:h-auto lg:min-h-72">
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <RecoveryFlow />
            </Suspense>
          </div>
        </div>
      </div>
    </Card>
  );
};

const HeroStat = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
  <div>
    <dt className="text-xs text-rr-ink-faint">{label}</dt>
    <dd className={cx("rr-tabular mt-0.5 text-lg font-semibold text-rr-ink", valueClass)}>{value}</dd>
  </div>
);

const LeakCard = ({ type, summary }: { type: (typeof LEAK_TYPES)[number]; summary: DashboardSummary }) => {
  const meta = LEAK_META[type];
  const tone = TONE_CLASSES[meta.tone];
  const leak = summary.leaks[type];
  const share = summary.atRiskValue > 0 ? leak.atRiskValue / summary.atRiskValue : 0;
  const Icon = meta.icon;

  return (
    <Card className="flex flex-col gap-4 p-5 transition-shadow duration-200 hover:shadow-rr-lift">
      <div className="flex items-center gap-3">
        <span className={cx("grid size-9 place-items-center rounded-xl", tone.soft, tone.text)}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{meta.label}</h3>
          <p className="truncate text-xs text-rr-ink-faint">{meta.description}</p>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <p className="rr-tabular font-rr-display text-3xl font-bold">{leak.openCount}</p>
        <p className="rr-tabular text-sm text-rr-ink-soft">{formatMoney(leak.atRiskValue, summary.currency)}</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-rr-bg" aria-hidden>
        <div className={cx("h-full rounded-full", tone.bar)} style={{ width: `${Math.max(share * 100, 4)}%` }} />
      </div>
    </Card>
  );
};

const weekLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const RecoveredTrend = ({ summary }: { summary: DashboardSummary }) => (
  <Card className="flex flex-col xl:col-span-3">
    <CardHeader title="Recovered revenue" subtitle="Bookings credited to outreach, by week" />
    <div className="h-64 px-2 pt-4 pb-3 xl:h-auto xl:min-h-64 xl:flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={summary.weekly} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="rr-recovered-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e3ecee" />
          <XAxis
            dataKey="weekStart"
            tickFormatter={weekLabel}
            minTickGap={20}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#8193a3" }}
          />
          <YAxis
            tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fontSize: 12, fill: "#8193a3" }}
          />
          <Tooltip
            formatter={(value) => [formatMoney(Number(value), summary.currency), "Recovered"]}
            labelFormatter={(label) => `Week of ${weekLabel(String(label))}`}
            contentStyle={{ borderRadius: 12, border: "1px solid #e3ecee", fontSize: 13 }}
          />
          <Area
            type="monotone"
            dataKey="recoveredValue"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#rr-recovered-fill)"
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </Card>
);

const PriorityList = ({ items, currency }: { items: PriorityItem[]; currency: string }) => (
  <Card className="xl:col-span-2">
    <CardHeader title="Recover first" subtitle="Highest value × urgency" />
    {items.length === 0 ? (
      <p className="px-5 py-10 text-center text-sm text-rr-ink-faint">Nothing slipping right now.</p>
    ) : (
      <ul className="mt-3 divide-y divide-rr-line">
        {items.map((item) => {
          const meta = LEAK_META[item.leakType];
          const tone = TONE_CLASSES[meta.tone];
          return (
            <li key={item.id} className="flex items-start gap-3 px-5 py-3">
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", tone.bar)} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium">{item.patientName}</p>
                  <p className="rr-tabular shrink-0 text-sm font-semibold">{formatMoney(item.estimatedValue, currency)}</p>
                </div>
                <p className="truncate text-xs text-rr-ink-soft">{item.reason}</p>
                <p className={cx("mt-0.5 text-xs", tone.text)}>
                  {meta.label} · {formatDue(item.dueAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);

const DashboardSkeleton = () => (
  <div className="flex animate-pulse flex-col gap-5" aria-busy="true" aria-label="Loading recovery dashboard">
    <div className="h-72 rounded-rr-card bg-rr-line/60" />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {LEAK_TYPES.map((type) => (
        <div key={type} className="h-36 rounded-rr-card bg-rr-line/60" />
      ))}
    </div>
  </div>
);
