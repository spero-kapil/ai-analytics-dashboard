const SIZES = {
  sm: { box: 'h-8 w-8 rounded-lg', icon: 16 },
  md: { box: 'h-10 w-10 rounded-xl', icon: 20 },
  lg: { box: 'h-12 w-12 rounded-xl', icon: 24 },
};

export default function ProviderLogo({ provider, size = 'md' }) {
  const Icon = provider.icon;
  const { box, icon } = SIZES[size];

  return (
    <span className={`inline-flex shrink-0 items-center justify-center shadow-sm ${box} ${provider.logoClass}`} aria-hidden="true">
      <Icon size={icon} strokeWidth={2.25} />
    </span>
  );
}
