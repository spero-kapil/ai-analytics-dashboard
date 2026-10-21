import { useEffect, useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { useUsageData } from './hooks/useUsageData.js';
import { useNow } from './hooks/useNow.js';
import { formatRelative } from './lib/format.js';
import Sidebar from './components/Sidebar.jsx';
import ProviderLogo from './components/ProviderLogo.jsx';
import ProviderOverview from './components/ProviderOverview.jsx';
import AccountCard from './components/AccountCard.jsx';
import { EmptyView, ErrorBanner, ErrorView, LoadingView } from './components/StatusViews.jsx';

export default function App() {
  const { providers, loading, refreshing, error, fetchedAt, refresh } = useUsageData();
  const now = useNow();
  const [selectedId, setSelectedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Default to the first provider that has accounts.
  const selected =
    providers.find((provider) => provider.id === selectedId) ??
    providers.find((provider) => provider.accounts.length > 0) ??
    providers[0] ??
    null;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const selectProvider = (id) => {
    setSelectedId(id);
    setMenuOpen(false);
  };

  const hasData = fetchedAt !== null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      <Sidebar
        providers={providers}
        selectedId={selected?.id}
        onSelect={selectProvider}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        loading={loading}
      />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Open provider menu"
              aria-controls="provider-sidebar"
              aria-expanded={menuOpen}
            >
              <Menu size={20} />
            </button>
            {selected && <ProviderLogo provider={selected} size="md" />}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
                {selected ? selected.name : 'Usage & Availability'}
              </h1>
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {selected?.vendor ? `${selected.vendor} · ` : ''}Usage and availability across your accounts
              </p>
            </div>
            <div className="flex items-center gap-3">
              {fetchedAt && (
                <span className="hidden text-xs text-slate-500 sm:inline">
                  Synced {formatRelative(Math.min(fetchedAt, now), now)}
                </span>
              )}
              <button
                type="button"
                onClick={refresh}
                disabled={loading || refreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                aria-label="Refresh usage data"
              >
                <RefreshCw size={15} className={loading || refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {loading && !hasData && <LoadingView />}
          {!hasData && !loading && error && <ErrorView message={error} onRetry={refresh} retrying={refreshing} />}

          {hasData && selected && (
            <>
              {error && <ErrorBanner message={error} />}
              {selected.accounts.length === 0 ? (
                <EmptyView providerName={selected.name} />
              ) : (
                <>
                  <ProviderOverview provider={selected} />
                  <section aria-label={`${selected.name} accounts`}>
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">
                      Accounts <span className="font-normal text-slate-400">({selected.accounts.length})</span>
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
                      {selected.accounts.map((account, index) => (
                        <AccountCard key={account.id} account={account} index={index} now={now} />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
