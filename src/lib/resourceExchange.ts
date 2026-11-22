import {
  addResources,
  canAfford,
  spendResources,
  type TownResources,
} from './economy.ts';
import type { ResourceId } from './economy.ts';

export interface ExchangeOffer {
  id: string;
  label: string;
  from: ResourceId;
  to: ResourceId;
  rateFrom: number;
  rateTo: number;
  summary: string;
}

export const EXCHANGE_OFFERS: ExchangeOffer[] = [
  {
    id: 'timber-stone',
    label: 'Timber → Stone',
    from: 'timber',
    to: 'stone',
    rateFrom: 1,
    rateTo: 1,
    summary: 'Trade timber for stone, one for one.',
  },
  {
    id: 'stone-timber',
    label: 'Stone → Timber',
    from: 'stone',
    to: 'timber',
    rateFrom: 1,
    rateTo: 1,
    summary: 'Trade stone for timber, one for one.',
  },
  {
    id: 'food-gold',
    label: 'Food → Gold',
    from: 'food',
    to: 'gold',
    rateFrom: 2,
    rateTo: 1,
    summary: 'Sell surplus food for gold (2 food → 1 gold).',
  },
  {
    id: 'gold-food',
    label: 'Gold → Food',
    from: 'gold',
    to: 'food',
    rateFrom: 1,
    rateTo: 2,
    summary: 'Buy food with gold (1 gold → 2 food).',
  },
  {
    id: 'timber-gold',
    label: 'Timber → Gold',
    from: 'timber',
    to: 'gold',
    rateFrom: 3,
    rateTo: 1,
    summary: 'Sell timber for gold (3 timber → 1 gold).',
  },
  {
    id: 'stone-gold',
    label: 'Stone → Gold',
    from: 'stone',
    to: 'gold',
    rateFrom: 3,
    rateTo: 1,
    summary: 'Sell stone for gold (3 stone → 1 gold).',
  },
];

export function applyExchange(
  resources: TownResources,
  caps: TownResources,
  offer: ExchangeOffer,
  bundles: number,
): TownResources | null {
  const safeBundles = Math.max(1, Math.round(bundles));
  const cost: TownResources = { timber: 0, stone: 0, food: 0, gold: 0 };
  const gain: TownResources = { timber: 0, stone: 0, food: 0, gold: 0 };
  cost[offer.from] = offer.rateFrom * safeBundles;
  gain[offer.to] = offer.rateTo * safeBundles;

  if (resources[offer.to] + gain[offer.to] > caps[offer.to]) return null;
  if (!canAfford(resources, cost)) return null;
  const afterSpend = spendResources(resources, cost, caps);
  return addResources(afterSpend, gain, caps);
}
