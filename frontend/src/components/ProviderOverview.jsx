import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { sortCursorMeters } from '../lib/cursor.js';
import { formatPercent, USAGE_BANDS, usageBand } from '../lib/format.js';

const shortEmail = (email) => (email ? email.split('@')[0] : 'Account');

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{row.email}</p>
      <p className="mb-1 text-slate-500">{row.meter}</p>
      <p className={usageBand(row.used).text}>Used: {formatPercent(row.used)}</p>
      <p className="text-slate-600">Remaining: {formatPercent(row.remaining)}</p>
    </div>
  );
}

export default function ProviderOverview({ provider }) {
  const isCursor = provider.id === 'cursor';
  const rows = provider.accounts.flatMap((account) => {
    const meters = isCursor ? sortCursorMeters(account.meters) : account.meters;
    return meters
      .filter((meter) => typeof meter.remainingPercent === 'number')
      .map((meter) => ({
        key: `${account.id}-${meter.id}`,
        email: account.email ?? 'Unnamed account',
        meter: isCursor ? meter.label : meter.period ? `${meter.period} usage` : meter.label,
        name: meters.length > 1
          ? `${shortEmail(account.email)} · ${isCursor ? meter.label : meter.period ?? meter.label}`
          : shortEmail(account.email),
        used: typeof meter.usedPercent === 'number' ? meter.usedPercent : 100 - meter.remainingPercent,
        remaining: meter.remainingPercent,
      }));
  });

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={`${provider.name} overview`}>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Usage by account</h2>
        <p className="text-xs text-slate-500">Consumed versus remaining share of each usage limit</p>
      </div>
      <div className="min-w-0" style={{ height: Math.max(160, rows.length * 44 + 70) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={isCursor ? 168 : 120} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="used" name="Used" stackId="usage" fill={USAGE_BANDS[1].hex} radius={[4, 0, 0, 4]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.key} fill={usageBand(row.used).hex} />
              ))}
            </Bar>
            <Bar dataKey="remaining" name="Remaining" stackId="usage" fill="#cbd5e1" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
