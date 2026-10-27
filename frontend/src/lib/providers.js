import { Asterisk, Bot, Boxes, MousePointer2 } from 'lucide-react';
import ChatGPTIcon from '../components/ChatGPTIcon.jsx';

// Supported providers, in sidebar order. Tailwind classes are spelled out in
// full so the compiler can detect them.
export const PROVIDERS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    vendor: 'OpenAI',
    aliases: ['chatgpt', 'chat-gpt', 'openai', 'gpt'],
    icon: ChatGPTIcon,
    logoClass: 'bg-[#10A37F] text-white',
    color: '#10A37F',
  },
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    aliases: ['claude', 'claude code', 'claude-code', 'anthropic'],
    icon: Asterisk,
    logoClass: 'bg-orange-500 text-white',
    color: '#f97316',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    vendor: 'Anysphere',
    aliases: ['cursor', 'anysphere'],
    icon: MousePointer2,
    logoClass: 'bg-slate-900 text-white',
    color: '#0f172a',
  },
  {
    id: 'devin',
    name: 'Devin',
    vendor: 'Cognition',
    aliases: ['devin', 'cognition'],
    icon: Bot,
    logoClass: 'bg-sky-600 text-white',
    color: '#0284c7',
  },
];

const compact = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIAS_INDEX = new Map(
  PROVIDERS.flatMap((provider) => provider.aliases.map((alias) => [compact(alias), provider])),
);

// Maps a provider name from the API to a known provider, or describes an
// unknown one so it can still be listed.
export const resolveProvider = (rawName) => {
  const name = String(rawName ?? '').trim();
  const known = ALIAS_INDEX.get(compact(name));
  if (known) return known;

  return {
    id: `other-${compact(name) || 'unknown'}`,
    name: name || 'Unknown provider',
    vendor: null,
    aliases: [],
    icon: Boxes,
    logoClass: 'bg-violet-600 text-white',
    color: '#7c3aed',
  };
};
