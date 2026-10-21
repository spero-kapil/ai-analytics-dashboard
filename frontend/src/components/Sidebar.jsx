import { Activity, X } from 'lucide-react';
import { LEVEL_STYLES, remainingLevel } from '../lib/format.js';
import ProviderLogo from './ProviderLogo.jsx';

const providerHealth = (provider) => {
  const values = provider.accounts
    .flatMap((account) => account.meters.map((meter) => meter.remainingPercent))
    .filter((value) => typeof value === 'number');
  return values.length > 0 ? remainingLevel(Math.min(...values)) : null;
};

function ProviderButton({ provider, selected, onSelect }) {
  const count = provider.accounts.length;
  const health = providerHealth(provider);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(provider.id)}
        aria-current={selected ? 'page' : undefined}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
          selected ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
        }`}
      >
        <span className={`h-6 w-1 shrink-0 rounded-full ${selected ? 'bg-indigo-500' : 'bg-transparent'}`} aria-hidden="true" />
        <ProviderLogo provider={provider} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{provider.name}</span>
          <span className="block truncate text-xs text-slate-400">
            {count === 0 ? 'No accounts' : `${count} account${count === 1 ? '' : 's'}`}
          </span>
        </span>
        {health && (
          <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLES[health].dot}`} title={`Lowest remaining usage: ${health}`} aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

export default function Sidebar({ providers, selectedId, onSelect, open, onClose, loading }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity md:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="provider-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-slate-50 transition-transform duration-300 md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:max-w-none md:translate-x-0 lg:w-1/5 lg:min-w-60 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Providers"
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Activity size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">Usage Tracker</p>
              <p className="text-xs text-slate-500">AI provider dashboard</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 md:hidden"
            aria-label="Close provider menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6" aria-label="Provider selection">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Providers</p>
          {loading && providers.length === 0 ? (
            <ul className="space-y-2" aria-hidden="true">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-2.5">
                  <span className="ml-4 h-8 w-8 rounded-lg bg-slate-200" />
                  <span className="h-3 flex-1 rounded bg-slate-200" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1">
              {providers.map((provider) => (
                <ProviderButton key={provider.id} provider={provider} selected={provider.id === selectedId} onSelect={onSelect} />
              ))}
            </ul>
          )}
        </nav>
      </aside>
    </>
  );
}
