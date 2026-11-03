import { useState } from 'react';
import { ArrowRight, ChevronDown, Inbox } from 'lucide-react';
import AccountCard from './AccountCard.jsx';
import ProviderLogo from './ProviderLogo.jsx';

function ProviderGroup({ provider, now, onSelectProvider, view }) {
  const [collapsed, setCollapsed] = useState(false);
  // Per-card collapse state, keyed by account id. Owned here so the provider
  // header can collapse/expand all cards and each card still toggles on its own.
  const [collapsedCards, setCollapsedCards] = useState({});
  const count = provider.accounts.length;
  const cardsId = `provider-${provider.id}-cards`;

  const toggleGroup = () => {
    const next = !collapsed;
    setCollapsed(next);
    setCollapsedCards(Object.fromEntries(provider.accounts.map((account) => [account.id, next])));
  };

  const toggleCard = (id) => setCollapsedCards((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <section className="w-full space-y-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8" aria-label={`${provider.name} usage`}>
      <header className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-50/70 to-slate-50 px-4 py-4 sm:gap-4 sm:px-5">
        <button
          type="button"
          onClick={toggleGroup}
          aria-expanded={!collapsed}
          aria-controls={cardsId}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <ProviderLogo provider={provider} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-900">{provider.name}</h2>
            <p className="truncate text-xs text-slate-500">
              {provider.vendor ? `${provider.vendor} • ` : ''}
              {`${count} account${count === 1 ? '' : 's'}`}
            </p>
          </div>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 text-slate-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
        {/* {onSelectProvider && (
          <button
            type="button"
            onClick={() => onSelectProvider(provider.id)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            View details
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        )} */}
      </header>

      <div id={cardsId} className={view === 'grid' ? 'grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-2' : 'grid grid-cols-1 gap-4'}>
        {provider.accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            now={now}
            variant="dashboard"
            collapsed={Boolean(collapsedCards[account.id])}
            onToggle={() => toggleCard(account.id)}
          />
        ))}
      </div>
    </section>
  );
}

export default function Dashboard({ providers, now, onSelectProvider, view = 'list' }) {
  const withAccounts = providers.filter((provider) => provider.accounts.length > 0);

  if (withAccounts.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[20px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Inbox size={22} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-900">No usage data yet</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Aggregated usage appears here once accounts report data to the API.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {withAccounts.map((provider) => (
        <ProviderGroup key={provider.id} provider={provider} now={now} onSelectProvider={onSelectProvider} view={view} />
      ))}
    </div>
  );
}
