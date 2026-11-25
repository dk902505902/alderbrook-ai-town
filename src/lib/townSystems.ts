import {
  ALL_BIOME_IDS,
  ALL_PLOT_IDS,
  ALL_STRUCTURE_TYPES,
  computeTownHousingCapacity,
  createInitialAgents,
  createInitialLogs,
  DEFAULT_TOWN_METRICS,
  generateFallbackBuildingBlueprint,
  generateFallbackTrainBlueprint,
  getStructureDisplayLabel,
  MAX_TOWN_AGENTS,
  normalizeTownTheme,
  normalizeWeatherMode,
  PLOT_META,
  sanitizeBuildingBlueprint,
  sanitizeTrainBlueprint,
  STRUCTURE_META,
  type ActiveFestivalState,
  type AgentId,
  type AgentRecord,
  type AgentShiftMode,
  type BiomeId,
  type BuildingBlueprint,
  type BuildingEconomyRow,
  type CitizenSentimentItem,
  type CivicQuestItem,
  type CouncilDebateProposal,
  type CouncilProposal,
  type CreditRatingSummary,
  type CustomBuildingStyle,
  type DecorPackId,
  type DecorPackMeta,
  type DistrictZoneType,
  type EmergencyEventState,
  type FestivalKind,
  type LocationId,
  type MarketPricesState,
  type MilestoneId,
  type MunicipalLoanState,
  type PlotId,
  type PolicyId,
  type PriceTrend,
  type ShareCodePayload,
  type StructureType,
  type TechUpgradeId,
  type TechUpgradeMeta,
  type TimeOfDay,
  type TourismSummary,
  type TownEconomySummary,
  type TownEvent,
  type TownGazetteEdition,
  type TownHistoryPoint,
  type TownLogItem,
  type TownMetrics,
  type TownMilestone,
  type TownNeedsSummary,
  type TownPolicyMeta,
  type TownRankInfo,
  type TownRelationship,
  type TownResourceRates,
  type TownResources,
  type TownStructure,
  type TownTheme,
  type TrainBlueprint,
  type UtilityGridSummary,
  type WeatherMode,
} from '../types/town.ts';

export const DEFAULT_TREASURY_GOLD = 250;

export const DEFAULT_TOWN_RESOURCES: TownResources = {
  timber: 24,
  stone: 20,
  harvest: 18,
  crystal: 4,
};

export const ALL_POLICY_IDS: PolicyId[] = [
  'open_trade',
  'night_shift',
  'free_bread',
  'green_charter',
];

export const TOWN_POLICIES: TownPolicyMeta[] = [
  {
    id: 'open_trade',
    label: 'Open Trade Tariffs',
    benefit: '+18g Steam Railway trade per turn',
    tradeoff: '-1 Order on trade turns',
  },
  {
    id: 'night_shift',
    label: 'Night-Shift Builders',
    benefit: '+35% faster construction progress',
    tradeoff: '-2 Morale when building',
  },
  {
    id: 'free_bread',
    label: 'Free Bakery Bread',
    benefit: '+3 Morale every turn',
    tradeoff: '-10g civic upkeep per turn',
  },
  {
    id: 'green_charter',
    label: 'Green Charter',
    benefit: '+50% Timber & Harvest · +15% Greenhouse/Windmill gold',
    tradeoff: '-4g conservation stipend',
  },
];

export const ALL_DECOR_PACK_IDS: DecorPackId[] = [
  'lantern_boulevard',
  'flower_gardens',
  'market_bunting',
  'fountain_statues',
];

export const DECOR_PACKS: DecorPackMeta[] = [
  {
    id: 'lantern_boulevard',
    label: 'Lantern Boulevards',
    costGold: 45,
    moraleBonus: 3,
    summary: '12 wrought-iron streetlamps lining the cardinal avenues of Town Square',
  },
  {
    id: 'flower_gardens',
    label: 'Flower Gardens',
    costGold: 35,
    moraleBonus: 3,
    summary: '24 sunlit stone planters and seasonal blossoms framing the plaza',
  },
  {
    id: 'market_bunting',
    label: 'Market Bunting Banners',
    costGold: 40,
    moraleBonus: 2,
    summary: 'Festive overhead pennant garlands across Market, Plaza, and Workshop',
  },
  {
    id: 'fountain_statues',
    label: 'Fountain Statues',
    costGold: 60,
    moraleBonus: 4,
    summary: '4 sculpted bronze & limestone civic monuments guarding the square corners',
  },
];

// ============================================================================
// 1. Building Economy & Town Treasury Engine
// ============================================================================

const BASE_GOLD_PER_TURN: Record<StructureType, number> = {
  bakery: 18,
  watchtower: 8,
  greenhouse: 16,
  windmill: 24,
  library: 14,
  granary: 20,
  pavilion: 12,
  clock_tower: 16,
  hospital: 15,
  defense_wall: 12,
  triple_gun_tower: 16,
  apartment: 26,
  custom: 22,
};

export function getDemolishSalvageGold(structure: TownStructure): number {
  const base = BASE_GOLD_PER_TURN[structure.structureType] ?? 16;
  const tierFactor = structure.status === 'complete' ? structure.tier : 0.6;
  return Math.round(base * 2.5 * tierFactor);
}

export function computeTownEconomy(
  structures: TownStructure[],
  agents: AgentRecord[],
  weather: WeatherMode,
  railSpurBuilt: boolean,
  treasuryGold: number,
  activePolicies: PolicyId[] = [],
  decorPacks: DecorPackId[] = [],
  taxRate = 8,
  trainCount = 1,
  unlockedTechs: TechUpgradeId[] = [],
  zoneMap: Partial<Record<PlotId, DistrictZoneType>> = {},
  activeLoan: MunicipalLoanState | null = null,
  agentShifts: Partial<Record<AgentId, AgentShiftMode>> = {},
  activeFestival: ActiveFestivalState | null = null,
  tourismBonus = 0,
): TownEconomySummary {
  const rows: BuildingEconomyRow[] = [];
  let buildingRevenue = 0;
  const hasGreenCharter = activePolicies.includes('green_charter');
  const hasOpenTrade = activePolicies.includes('open_trade');
  const hasFreeBread = activePolicies.includes('free_bread');
  const hasHighSpeedBogies = unlockedTechs.includes('high_speed_bogies');
  const hasPrefabFloors = unlockedTechs.includes('prefab_floors');
  const hasTradeTariffs = unlockedTechs.includes('trade_tariffs');
  const cleanTax = Math.max(0, Math.min(20, Math.round(taxRate)));
  const taxMult = 0.65 + (cleanTax / 20) * 0.95;
  const taxMoraleEffect =
    cleanTax <= 5 ? 3 : cleanTax <= 9 ? 1 : cleanTax <= 13 ? 0 : cleanTax <= 16 ? -2 : -4;

  const overtimeCount = Object.values(agentShifts).filter((m) => m === 'overtime').length;
  const shiftBonusMult = 1 + Math.min(0.35, overtimeCount * 0.07);

  for (const s of structures) {
    if (s.status !== 'complete') continue;
    const base = BASE_GOLD_PER_TURN[s.structureType] ?? 16;
    const tierBonus = 1 + (Math.max(1, s.tier) - 1) * 0.55;
    let weatherMult = 1.0;
    let note = `Tier ${s.tier}`;

    if (weather === 'rain' && (s.structureType === 'greenhouse' || s.structureType === 'granary')) {
      weatherMult = 1.25;
      note = `Tier ${s.tier} · Rain +25%`;
    } else if (weather === 'summer' && s.structureType === 'windmill') {
      weatherMult = 1.35;
      note = `Tier ${s.tier} · Summer +35%`;
    } else if (weather === 'winter' && s.structureType === 'bakery') {
      weatherMult = 1.3;
      note = `Tier ${s.tier} · Winter warmth +30%`;
    }

    if (hasGreenCharter && (s.structureType === 'greenhouse' || s.structureType === 'windmill')) {
      weatherMult *= 1.15;
      note += ' · Charter +15%';
    }

    const zone = zoneMap[s.plotId] ?? 'mixed';
    let zoneMult = 1.0;
    if (zone === 'commercial') {
      zoneMult = 1.3;
      note += ' · Commercial +30%';
    } else if (zone === 'tech') {
      zoneMult = 1.2;
      note += ' · Tech +20%';
    } else if (zone === 'residential' && (s.structureType === 'apartment' || (s.blueprint?.apartmentCapacity ?? 0) > 0)) {
      zoneMult = 1.25;
      note += ' · Residential +25%';
    }

    const staffed = agents.some(
      (a) => a.assignedPlotId === s.plotId || a.activePlotId === s.plotId,
    );
    const staffMult = staffed ? 1.2 : 1.0;
    if (staffed) {
      note += ' · Staffed +20%';
    }

    const goldPerTurn = Math.round(
      base * tierBonus * weatherMult * staffMult * zoneMult * shiftBonusMult,
    );
    buildingRevenue += goldPerTurn;
    rows.push({
      plotId: s.plotId,
      label: getStructureDisplayLabel(s),
      district: PLOT_META[s.plotId]?.label ?? 'Town Plot',
      tier: s.tier,
      goldPerTurn,
      staffed,
      note,
    });
  }

  rows.sort((a, b) => b.goldPerTurn - a.goldPerTurn);

  const housing = computeTownHousingCapacity(structures);
  const resBonus = Object.values(zoneMap).filter((z) => z === 'residential').length * 0.06;
  const apartmentRent = Math.round(
    housing.dummyPopulation *
      (0.45 + cleanTax * 0.04) *
      (1 + resBonus) *
      (hasPrefabFloors ? 1.25 : 1.0),
  );
  const trainTicketRevenue = Math.round(
    (Math.max(1, Math.min(3, trainCount)) * (railSpurBuilt ? 14 : 7) +
      housing.dummyPopulation * 0.14) *
      (hasHighSpeedBogies ? 1.35 : 1.0),
  );
  const decorTourism = decorPacks.length * 3;
  const civicBaseTax = Math.round(
    (12 + Math.min(20, Math.round(agents.length * 1.5)) + decorTourism) * taxMult,
  );
  const railwayBonus = Math.round(
    ((railSpurBuilt ? 24 : 8) + (hasOpenTrade ? 18 : 0)) * (hasTradeTariffs ? 1.25 : 1.0),
  );
  const festivalGold = activeFestival ? activeFestival.goldBonusPerTurn : 0;
  const grossIncome =
    civicBaseTax +
    apartmentRent +
    trainTicketRevenue +
    railwayBonus +
    buildingRevenue +
    festivalGold +
    Math.max(0, Math.round(tourismBonus));
  const policyUpkeep = (hasFreeBread ? 10 : 0) + (hasGreenCharter ? 4 : 0);
  const loanPayment = activeLoan && activeLoan.remaining > 0 ? activeLoan.perTurnPayment : 0;
  const workerUpkeep = Math.max(0, agents.length - 5) * 4 + 8 + policyUpkeep + loanPayment;
  const netPerTurn = grossIncome - workerUpkeep;

  return {
    treasuryGold,
    civicBaseTax,
    apartmentRent,
    trainTicketRevenue,
    taxRate: cleanTax,
    taxMoraleEffect,
    railwayBonus,
    buildingRevenue,
    workerUpkeep,
    netPerTurn,
    topBuildings: rows,
  };
}

// ============================================================================
// 1b. 4-Resource Supply Chain (Timber, Stone, Harvest, Crystal)
// ============================================================================

export function computeResourceRates(
  structures: TownStructure[],
  unlockedBiomes: BiomeId[],
  activePolicies: PolicyId[],
): TownResourceRates {
  let timber =
    3 +
    (unlockedBiomes.includes('forest') ? 6 : 0) +
    (unlockedBiomes.includes('river') ? 4 : 0);
  let stone =
    3 +
    (unlockedBiomes.includes('desert') ? 4 : 0) +
    (unlockedBiomes.includes('cave') ? 3 : 0) +
    (unlockedBiomes.includes('alpine') ? 5 : 0) +
    (unlockedBiomes.includes('canyon') ? 5 : 0);
  let harvest = 3 + (unlockedBiomes.includes('river') ? 5 : 0);
  let crystal =
    (unlockedBiomes.includes('cave') ? 4 : 0) +
    (unlockedBiomes.includes('alpine') ? 3 : 0) +
    (unlockedBiomes.includes('canyon') ? 2 : 0);

  for (const s of structures) {
    if (s.status !== 'complete') continue;
    const t = Math.max(1, s.tier);
    if (s.structureType === 'bakery' || s.structureType === 'windmill' || s.structureType === 'granary' || s.structureType === 'greenhouse') {
      harvest += 3 * t;
    }
    if (
      s.structureType === 'watchtower' ||
      s.structureType === 'clock_tower' ||
      s.structureType === 'library' ||
      s.structureType === 'defense_wall' ||
      s.structureType === 'triple_gun_tower'
    ) {
      stone += 2 * t;
    }
    if (s.structureType === 'hospital') {
      harvest += 2 * t;
    }
    if (s.structureType === 'pavilion' || s.structureType === 'granary') {
      timber += 2 * t;
    }
    if (s.structureType === 'custom') {
      if (s.customStyle === 'lab' || s.customStyle === 'observatory') {
        crystal += 2 * t;
      } else if (s.customStyle === 'forge' || s.customStyle === 'tower') {
        stone += 3 * t;
      } else {
        timber += 2 * t;
        harvest += 1 * t;
      }
    }
  }

  if (activePolicies.includes('green_charter')) {
    timber = Math.round(timber * 1.5);
    harvest = Math.round(harvest * 1.5);
  }

  return { timber, stone, harvest, crystal };
}

export function computeTradeTrainPayout(
  resources: TownResources,
  railSpurBuilt: boolean,
): { goldEarned: number; shipped: TownResources } {
  const shipped: TownResources = {
    timber: Math.min(resources.timber, 18),
    stone: Math.min(resources.stone, 16),
    harvest: Math.min(resources.harvest, 18),
    crystal: Math.min(resources.crystal, 10),
  };
  const baseValue =
    shipped.timber * 1.4 +
    shipped.stone * 1.8 +
    shipped.harvest * 1.6 +
    shipped.crystal * 5.2;
  const loopBonus = railSpurBuilt ? 1.35 : 1.0;
  const goldEarned = Math.max(55, Math.round(baseValue * loopBonus + 28));
  return { goldEarned, shipped };
}

// ============================================================================
// 1c. Town Milestones, Badges & Civic Rank Progression
// ============================================================================

export function computeTownRank(params: {
  structures: TownStructure[];
  agents: AgentRecord[];
  unlockedBiomes: BiomeId[];
  railSpurBuilt: boolean;
  treasuryGold: number;
}): TownRankInfo {
  const completed = params.structures.filter((s) => s.status === 'complete').length;
  const score =
    completed * 18 +
    Math.max(0, params.agents.length - 5) * 14 +
    params.unlockedBiomes.length * 32 +
    (params.railSpurBuilt ? 30 : 0) +
    Math.min(40, Math.floor(params.treasuryGold / 40));

  const tiers: Array<{ level: number; title: string; minScore: number; req: string }> = [
    { level: 1, title: 'Hamlet', minScore: 0, req: 'Complete 2 buildings or recruit a villager' },
    { level: 2, title: 'Village', minScore: 36, req: 'Build 4 structures & grow your treasury' },
    { level: 3, title: 'Market Town', minScore: 90, req: 'Unlock an outer biome or extend the rail loop' },
    { level: 4, title: 'Rail Hub', minScore: 165, req: 'Unlock 3 biomes, rail loop & 8+ buildings' },
    { level: 5, title: 'Frontier Metropolis', minScore: 260, req: 'Highest civic rank achieved!' },
  ];

  let current = tiers[0];
  let next: (typeof tiers)[number] | null = tiers[1];
  for (let i = 0; i < tiers.length; i++) {
    if (score >= tiers[i].minScore) {
      current = tiers[i];
      next = tiers[i + 1] ?? null;
    }
  }

  const progressPct = next
    ? Math.max(
        4,
        Math.min(
          100,
          Math.round(((score - current.minScore) / (next.minScore - current.minScore)) * 100),
        ),
      )
    : 100;

  return {
    level: current.level,
    title: current.title,
    nextTitle: next ? next.title : null,
    progressPct,
    nextRequirement: current.req,
  };
}

export function evaluateTownMilestones(params: {
  structures: TownStructure[];
  agents: AgentRecord[];
  unlockedBiomes: BiomeId[];
  railSpurBuilt: boolean;
  treasuryGold: number;
  relationships: TownRelationship[];
  alreadyUnlocked: MilestoneId[];
}): { milestones: TownMilestone[]; newlyUnlocked: TownMilestone[] } {
  const completed = params.structures.filter((s) => s.status === 'complete');
  const hasTier3 = completed.some((s) => s.tier >= 3);
  const maxBond = params.relationships.reduce((mx, r) => Math.max(mx, r.score), 0);

  const defs: Array<{
    id: MilestoneId;
    title: string;
    description: string;
    rewardGold: number;
    met: boolean;
  }> = [
    {
      id: 'first_building',
      title: 'First Cornerstone',
      description: 'Complete your first civic structure on any town plot.',
      rewardGold: 50,
      met: completed.length >= 1,
    },
    {
      id: 'masterwork_t3',
      title: 'Tier 3 Masterwork',
      description: 'Upgrade any building to prestigious Tier 3.',
      rewardGold: 90,
      met: hasTier3,
    },
    {
      id: 'frontier_biome',
      title: 'Frontier Explorer',
      description: 'Expand map borders into Forest, Desert, or Crystal Cave.',
      rewardGold: 75,
      met: params.unlockedBiomes.length >= 1,
    },
    {
      id: 'all_biomes',
      title: 'Tri-Biome Dominion',
      description: 'Unlock all 3 outer frontier biomes around town.',
      rewardGold: 150,
      met: params.unlockedBiomes.length >= 3,
    },
    {
      id: 'steam_loop',
      title: 'Steam Express Pioneer',
      description: 'Build the connected Outer Railway Loop & Frontier Station.',
      rewardGold: 100,
      met: params.railSpurBuilt,
    },
    {
      id: 'treasury_1000',
      title: 'Golden Vault',
      description: 'Accumulate 1,000g or more in the Town Treasury.',
      rewardGold: 120,
      met: params.treasuryGold >= 1000,
    },
    {
      id: 'bustling_council',
      title: 'Bustling Town Roster',
      description: 'Grow your community to 8 or more active villagers.',
      rewardGold: 80,
      met: params.agents.length >= 8,
    },
    {
      id: 'trusted_partners',
      title: 'Trusted Partners',
      description: 'Deepen any villager friendship bond to 85/100 or higher.',
      rewardGold: 65,
      met: maxBond >= 85,
    },
  ];

  const unlockedSet = new Set<MilestoneId>(params.alreadyUnlocked);
  const newlyUnlocked: TownMilestone[] = [];
  const milestones: TownMilestone[] = defs.map((d) => {
    const isUnlocked = unlockedSet.has(d.id) || d.met;
    const item: TownMilestone = {
      id: d.id,
      title: d.title,
      description: d.description,
      rewardGold: d.rewardGold,
      unlocked: isUnlocked,
    };
    if (d.met && !unlockedSet.has(d.id)) {
      newlyUnlocked.push(item);
    }
    return item;
  });

  return { milestones, newlyUnlocked };
}

// ============================================================================
// 1d. Town Council Proposals & Voting Board
// ============================================================================

export function generateCouncilProposals(params: {
  agents: AgentRecord[];
  structures: TownStructure[];
  unlockedBiomes: BiomeId[];
  railSpurBuilt: boolean;
  turnCount: number;
}): CouncilProposal[] {
  const proposals: CouncilProposal[] = [];
  const lyra = params.agents.find((a) => a.id === 'architect_lyra') ?? params.agents[0];
  const vance = params.agents.find((a) => a.id === 'commander_vance') ?? params.agents[0];
  const pip =
    params.agents.find((a) => a.isHired) ??
    params.agents.find((a) => a.id === 'worker_pip') ??
    params.agents[0];

  const builtTypes = new Set(params.structures.map((s) => s.structureType));
  const nextLockedBiome = ALL_BIOME_IDS.find((b) => !params.unlockedBiomes.includes(b));
  const upgradable = params.structures.find((s) => s.status === 'complete' && s.tier < 3);

  // Proposal 1 (Architect Lyra): Build high-value landmark or upgrade
  if (!builtTypes.has('greenhouse')) {
    proposals.push({
      id: `prop_greenhouse_${params.turnCount}`,
      proposerId: lyra.id,
      proposerName: lyra.name,
      proposerRole: lyra.role,
      title: 'Construct Glass Greenhouse',
      summary: 'Boosts botanical Morale (+4) and Harvest output every turn, with +25% rain yield.',
      actionType: 'build',
      structureType: 'greenhouse',
      costGold: 55,
      votes: 3,
      supporters: [lyra.name, 'Worker Pip', 'Mayor Sterling'],
    });
  } else if (!builtTypes.has('bakery')) {
    proposals.push({
      id: `prop_bakery_${params.turnCount}`,
      proposerId: lyra.id,
      proposerName: lyra.name,
      proposerRole: lyra.role,
      title: 'Open Artisan Bakery',
      summary: 'Warms town Morale in winter and adds +18g/turn steady revenue.',
      actionType: 'build',
      structureType: 'bakery',
      costGold: 50,
      votes: 3,
      supporters: [lyra.name, 'Worker Pip', 'Mayor Sterling'],
    });
  } else if (upgradable) {
    const lbl = getStructureDisplayLabel(upgradable);
    proposals.push({
      id: `prop_upgrade_${upgradable.plotId}_${params.turnCount}`,
      proposerId: lyra.id,
      proposerName: lyra.name,
      proposerRole: lyra.role,
      title: `Elevate ${lbl} to Tier ${upgradable.tier + 1}`,
      summary: `Multiplies ${lbl}'s gold & resource yield by +55% and raises civic prestige.`,
      actionType: 'upgrade',
      structureType: upgradable.structureType,
      customLabel: upgradable.customLabel,
      costGold: 75,
      votes: 3,
      supporters: [lyra.name, 'Mayor Sterling', 'Worker Pip'],
    });
  } else {
    proposals.push({
      id: `prop_lab_${params.turnCount}`,
      proposerId: lyra.id,
      proposerName: lyra.name,
      proposerRole: lyra.role,
      title: 'Build Civic Research Lab',
      summary: 'Custom science wing generating Crystal resources and +22g/turn base output.',
      actionType: 'build',
      structureType: 'custom',
      customLabel: 'Research Lab',
      costGold: 65,
      votes: 3,
      supporters: [lyra.name, 'Mayor Sterling'],
    });
  }

  // Proposal 2 (Commander Vance): Outer Rail Loop, Watchtower, or Frontier Biome
  if (!params.railSpurBuilt) {
    proposals.push({
      id: `prop_rail_${params.turnCount}`,
      proposerId: vance.id,
      proposerName: vance.name,
      proposerRole: vance.role,
      title: 'Extend Outer Railway Loop',
      summary: 'Adds Outer Frontier Station, increases train trade by +18g/turn and boosts cargo payouts +35%.',
      actionType: 'extend_rail',
      costGold: 80,
      votes: 2,
      supporters: [vance.name, 'Worker Kai'],
    });
  } else if (nextLockedBiome) {
    const biomeLabelMap: Record<BiomeId, string> = {
      forest: 'Dense Forest',
      desert: 'Desert Dunes',
      cave: 'Crystal Mountain Cave',
      alpine: 'Alpine Snow Peaks',
      river: 'Turquoise River Crossing',
      canyon: 'Red-Rock Canyon',
    };
    const bLabel = biomeLabelMap[nextLockedBiome] ?? 'Frontier District';
    proposals.push({
      id: `prop_biome_${nextLockedBiome}_${params.turnCount}`,
      proposerId: vance.id,
      proposerName: vance.name,
      proposerRole: vance.role,
      title: `Expedition to ${bLabel}`,
      summary: `Opens new frontier build plots, widens map bounds, and adds biome resource streams.`,
      actionType: 'expand_biome',
      biome: nextLockedBiome,
      costGold: 70,
      votes: 2,
      supporters: [vance.name, 'Worker Kai'],
    });
  } else {
    proposals.push({
      id: `prop_watchtower_${params.turnCount}`,
      proposerId: vance.id,
      proposerName: vance.name,
      proposerRole: vance.role,
      title: 'Commission Guard Watchtower',
      summary: 'Shields winter builders, reinforces Civic Order (+5), and supplies Quarry Stone.',
      actionType: 'build',
      structureType: 'watchtower',
      costGold: 55,
      votes: 2,
      supporters: [vance.name, 'Worker Kai'],
    });
  }

  // Proposal 3 (Worker Pip / Hired Specialist): Plaza Sky Lantern Festival or Cafe
  proposals.push({
    id: `prop_festival_${params.turnCount}`,
    proposerId: pip.id,
    proposerName: pip.name,
    proposerRole: pip.role,
    title: 'Host Plaza Sky Lantern Festival',
    summary: 'Launches live 3D sky lanterns & fireworks over Town Square, boosting +10 Morale & friendships!',
    actionType: 'festival',
    costGold: 45,
    votes: params.agents.length >= 6 ? 3 : 2,
    supporters: [pip.name, ...params.agents.slice(5, 7).map((a) => a.name)],
  });

  return proposals;
}

// ============================================================================
// 1e. Town Growth Analytics History
// ============================================================================

export function createStarterHistory(
  treasuryGold: number,
  metrics: TownMetrics,
  population: number,
  buildings: number,
  turn = 0,
): TownHistoryPoint[] {
  return [
    {
      turn,
      treasuryGold,
      prosperity: metrics.prosperity,
      orderLevel: metrics.orderLevel,
      morale: metrics.morale,
      population,
      buildings,
    },
  ];
}

export function appendHistoryPoint(
  history: TownHistoryPoint[],
  point: TownHistoryPoint,
): TownHistoryPoint[] {
  const last = history[history.length - 1];
  if (last && last.turn === point.turn) {
    return [...history.slice(0, -1), point].slice(-30);
  }
  return [...history, point].slice(-30);
}

// ============================================================================
// 2. Villager Relationships & Social Memory Engine
// ============================================================================

export function makeRelationshipPairKey(a: AgentId, b: AgentId): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function getRelationshipTierLabel(score: number): string {
  if (score >= 80) return 'Trusted Partner';
  if (score >= 58) return 'Close Friend';
  if (score >= 35) return 'Teammate';
  return 'Acquaintance';
}

export function createStarterRelationships(): TownRelationship[] {
  const now = Date.now();
  return [
    {
      pairKey: makeRelationshipPairKey('mayor_sterling', 'architect_lyra'),
      agentA: 'mayor_sterling',
      agentB: 'architect_lyra',
      score: 64,
      interactions: 3,
      lastNote: 'Co-planning town expansion',
      updatedAtMs: now,
    },
    {
      pairKey: makeRelationshipPairKey('architect_lyra', 'worker_pip'),
      agentA: 'architect_lyra',
      agentB: 'worker_pip',
      score: 72,
      interactions: 4,
      lastNote: 'Trusted building partners',
      updatedAtMs: now,
    },
    {
      pairKey: makeRelationshipPairKey('commander_vance', 'worker_kai'),
      agentA: 'commander_vance',
      agentB: 'worker_kai',
      score: 68,
      interactions: 3,
      lastNote: 'Supply & patrol squad',
      updatedAtMs: now,
    },
  ];
}

export function recordSocialInteraction(
  relationships: TownRelationship[],
  agentA: AgentId,
  agentB: AgentId,
  delta: number,
  note: string,
): TownRelationship[] {
  if (!agentA || !agentB || agentA === agentB) return relationships;
  const pairKey = makeRelationshipPairKey(agentA, agentB);
  const now = Date.now();
  const idx = relationships.findIndex((r) => r.pairKey === pairKey);

  if (idx === -1) {
    const next: TownRelationship = {
      pairKey,
      agentA: agentA < agentB ? agentA : agentB,
      agentB: agentA < agentB ? agentB : agentA,
      score: Math.max(10, Math.min(100, 28 + delta)),
      interactions: 1,
      lastNote: note.slice(0, 80),
      updatedAtMs: now,
    };
    return [next, ...relationships].slice(0, 60);
  }

  return relationships.map((r, i) =>
    i === idx
      ? {
          ...r,
          score: Math.max(5, Math.min(100, r.score + delta)),
          interactions: r.interactions + 1,
          lastNote: note.slice(0, 80) || r.lastNote,
          updatedAtMs: now,
        }
      : r,
  );
}

export function getAgentTopBonds(
  agentId: AgentId,
  relationships: TownRelationship[],
  agents: AgentRecord[],
  maxCount = 3,
): Array<{ partnerId: AgentId; partnerName: string; score: number; tier: string; lastNote: string }> {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const matched: Array<{
    partnerId: AgentId;
    partnerName: string;
    score: number;
    tier: string;
    lastNote: string;
  }> = [];

  for (const rel of relationships) {
    if (rel.agentA !== agentId && rel.agentB !== agentId) continue;
    const partnerId = rel.agentA === agentId ? rel.agentB : rel.agentA;
    const partner = byId.get(partnerId);
    if (!partner) continue;
    matched.push({
      partnerId,
      partnerName: partner.name,
      score: rel.score,
      tier: getRelationshipTierLabel(rel.score),
      lastNote: rel.lastNote,
    });
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, maxCount);
}

export function formatAgentBondsForPrompt(
  agentId: AgentId,
  relationships: TownRelationship[],
  agents: AgentRecord[],
): string {
  const bonds = getAgentTopBonds(agentId, relationships, agents, 3);
  if (bonds.length === 0) return '';
  return bonds.map((b) => `${b.partnerName} (${b.tier}, ${b.score}/100)`).join(', ');
}

// ============================================================================
// 3. Dynamic Town Events & Visiting Trade Train
// ============================================================================

export function pickTownEvent(
  townName: string,
  turnCount: number,
  unlockedBiomes: BiomeId[],
  railSpurBuilt: boolean,
  recentEventIds: string[],
): TownEvent {
  const candidates: TownEvent[] = [
    {
      id: 'visiting_trade_train',
      title: 'Visiting Steam Trade Caravan',
      summary: `A merchant express just whistled outside ${townName} carrying exotic timber, spices, and blueprints.`,
      category: 'trade',
      options: [
        {
          id: 'open_market_fair',
          label: 'Host Station Market Fair',
          effectSummary: '+85g Treasury · +5 Prosperity · Summon Train',
          goldDelta: 85,
          metricsDelta: { prosperity: 5, orderLevel: 1, morale: 4 },
          triggerTrain: true,
          logOutcome: 'Hosted a bustling station trade fair with the visiting Steam Express!',
        },
        {
          id: 'buy_civic_supplies',
          label: 'Purchase Surplus Stone (-35g)',
          effectSummary: '-35g · +6 Order · +4 Prosperity',
          goldDelta: -35,
          metricsDelta: { prosperity: 4, orderLevel: 6, morale: 2 },
          triggerTrain: true,
          logOutcome: 'Acquired premium merchant stone and timber off the Steam Express.',
        },
      ],
    },
    {
      id: 'harvest_festival',
      title: 'Town Square Harvest Festival',
      summary: `Villagers want to hang warm lanterns across ${townName} Square for an evening music and pastry celebration.`,
      category: 'festival',
      options: [
        {
          id: 'sponsor_feast',
          label: 'Sponsor Lantern Feast (-40g)',
          effectSummary: '-40g · +10 Morale · Deepen Friendships',
          goldDelta: -40,
          metricsDelta: { prosperity: 2, orderLevel: 2, morale: 10 },
          boostAllBonds: 6,
          logOutcome: 'Lanterns lit the square as villagers celebrated and grew closer together!',
        },
        {
          id: 'potluck_gathering',
          label: 'Community Potluck (Free)',
          effectSummary: '+25g Donations · +5 Morale',
          goldDelta: 25,
          metricsDelta: { prosperity: 1, orderLevel: 1, morale: 5 },
          boostAllBonds: 3,
          logOutcome: 'Villagers shared homemade pastries around the fountain in warm spirits.',
        },
      ],
    },
    {
      id: 'guild_grant',
      title: 'Regional Architecture Grant',
      summary: `Envoys from the valley guild are impressed by ${townName}'s growth and offer funding for civic upgrades.`,
      category: 'civic',
      options: [
        {
          id: 'accept_treasury_grant',
          label: 'Deposit Into Town Treasury',
          effectSummary: '+110g Treasury · +4 Prosperity',
          goldDelta: 110,
          metricsDelta: { prosperity: 4, orderLevel: 2, morale: 1 },
          logOutcome: 'Accepted the regional architecture grant directly into the town treasury.',
        },
        {
          id: 'fund_worker_bonuses',
          label: 'Share Bonus With Villagers',
          effectSummary: '+45g Treasury · +8 Morale · +4 Order',
          goldDelta: 45,
          metricsDelta: { prosperity: 2, orderLevel: 4, morale: 8 },
          boostAllBonds: 5,
          logOutcome: 'Shared the civic grant as bonuses across every hardworking villager!',
        },
      ],
    },
    {
      id: 'storm_repair',
      title: 'Gusty Valley Squall Alert',
      summary: `High winds rattled several roof shingles and lantern brackets around ${townName}. Commander Vance awaits your call.`,
      category: 'weather',
      options: [
        {
          id: 'emergency_crew',
          label: 'Deploy Rapid Repair Crew (-25g)',
          effectSummary: '-25g · +7 Order · +4 Morale',
          goldDelta: -25,
          metricsDelta: { prosperity: 1, orderLevel: 7, morale: 4 },
          boostAllBonds: 4,
          logOutcome: 'Repair teams secured every shingle before dusk with zero damage.',
        },
        {
          id: 'volunteer_watch',
          label: 'Organize Neighbor Watch (Free)',
          effectSummary: '+3 Order · +2 Morale',
          goldDelta: 0,
          metricsDelta: { prosperity: 0, orderLevel: 3, morale: 2 },
          logOutcome: 'Neighbors pitched in together to tie down awnings and clear branches.',
        },
      ],
    },
    {
      id: 'frontier_survey',
      title: unlockedBiomes.includes('cave')
        ? 'Luminous Crystal Vein Discovered'
        : 'Frontier Scout Report',
      summary: unlockedBiomes.includes('cave')
        ? `Scouts inside Crystal Mountain Cave uncovered a shimmering quartz vein glowing under the arch!`
        : `Scouts returned from the outer ridges beyond ${townName} with mineral samples and trail maps.`,
      category: 'discovery',
      options: [
        {
          id: 'export_crystals',
          label: railSpurBuilt ? 'Ship via Outer Frontier Rail' : 'Auction Samples at Market',
          effectSummary: railSpurBuilt
            ? '+135g Treasury · +6 Prosperity · Summon Train'
            : '+90g Treasury · +5 Prosperity',
          goldDelta: railSpurBuilt ? 135 : 90,
          metricsDelta: { prosperity: railSpurBuilt ? 6 : 5, orderLevel: 2, morale: 3 },
          triggerTrain: railSpurBuilt,
          logOutcome: railSpurBuilt
            ? 'Loaded glowing frontier samples onto the Outer Frontier Express for record revenue!'
            : 'Sold frontier mineral samples at Alderbrook Market for a healthy profit.',
        },
        {
          id: 'study_specimens',
          label: 'Archive for Research & Lanterns',
          effectSummary: '+35g · +5 Order · +6 Morale',
          goldDelta: 35,
          metricsDelta: { prosperity: 2, orderLevel: 5, morale: 6 },
          logOutcome: 'Catalogued the luminous frontier specimens to brighten town lanterns.',
        },
      ],
    },
    {
      id: 'traveling_bards',
      title: 'Traveling Acoustic Ensemble',
      summary: `A cheerful quartet of wandering musicians arrived at the Park fountain offering an evening concert.`,
      category: 'festival',
      options: [
        {
          id: 'book_concert',
          label: 'Book Square Concert (-20g)',
          effectSummary: '-20g · +9 Morale · +5 Bonds',
          goldDelta: -20,
          metricsDelta: { prosperity: 2, orderLevel: 1, morale: 9 },
          boostAllBonds: 5,
          logOutcome: 'Warm folk melodies echoed through the square as villagers cheered.',
        },
        {
          id: 'pass_the_hat',
          label: 'Open-Tip Busking Stage',
          effectSummary: '+30g Local Trade · +4 Morale',
          goldDelta: 30,
          metricsDelta: { prosperity: 3, orderLevel: 0, morale: 4 },
          logOutcome: 'Busking music drew lively foot traffic to nearby shops and bakeries.',
        },
      ],
    },
  ];

  const freshPool = candidates.filter((e) => !recentEventIds.includes(e.id));
  const pool = freshPool.length > 0 ? freshPool : candidates;
  const pick = pool[(turnCount + Math.floor(Math.random() * pool.length)) % pool.length];
  return { ...pick, triggeredAtMs: Date.now() };
}

// ============================================================================
// 4. Town Gazette Digest Compiler
// ============================================================================

export function compileTownGazette(params: {
  townName: string;
  turnCount: number;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  metrics: TownMetrics;
  economy: TownEconomySummary;
  structures: TownStructure[];
  agents: AgentRecord[];
  relationships: TownRelationship[];
  unlockedBiomes: BiomeId[];
  railSpurBuilt: boolean;
  logs: TownLogItem[];
}): TownGazetteEdition {
  const completed = params.structures.filter((s) => s.status === 'complete');
  const latestLog = params.logs[0];
  const topBuilding = params.economy.topBuildings[0];
  const strongestRel = [...params.relationships].sort((a, b) => b.score - a.score)[0];
  const agentById = new Map(params.agents.map((a) => [a.id, a]));

  const headline =
    completed.length >= 6
      ? `${params.townName} Booms Into a Thriving ${completed.length}-District Hub`
      : params.railSpurBuilt
        ? `Steam Express Connects ${params.townName} to Outer Frontier Station`
        : completed.length > 0
          ? `${getStructureDisplayLabel(completed[0])} Anchors Growth in ${params.townName}`
          : `${params.townName} Council Prepares New Frontier Blueprints`;

  const subheadline = `Edition #${Math.max(1, Math.floor(params.turnCount / 2) + 1)} · ${params.agents.length} Citizens · Treasury ${params.economy.treasuryGold}g (${params.economy.netPerTurn >= 0 ? '+' : ''}${params.economy.netPerTurn}g/turn)`;

  const stories: Array<{ title: string; body: string; meta: string }> = [];

  if (latestLog) {
    stories.push({
      title: `Latest Dispatch from ${latestLog.agentName}`,
      body: latestLog.dialogue || latestLog.thought,
      meta: `Turn ${latestLog.turnNumber} · ${latestLog.newTask || 'Town Business'}`,
    });
  }

  if (topBuilding) {
    stories.push({
      title: `Economic Spotlight: ${topBuilding.label}`,
      body: `${topBuilding.label} in ${topBuilding.district} leads local production at +${topBuilding.goldPerTurn}g per turn (${topBuilding.note}).`,
      meta: `${completed.length} Completed Buildings · ${params.economy.buildingRevenue}g/turn Total Output`,
    });
  } else {
    stories.push({
      title: 'Open Plots Await Civic Builders',
      body: `Treasury holds ${params.economy.treasuryGold}g in startup reserves. Construct Bakeries, Windmills, or Research Labs to multiply per-turn gold.`,
      meta: `${params.unlockedBiomes.length}/3 Outer Biomes Unlocked`,
    });
  }

  if (strongestRel) {
    const a = agentById.get(strongestRel.agentA);
    const b = agentById.get(strongestRel.agentB);
    if (a && b) {
      stories.push({
        title: `Community Ties: ${a.name} & ${b.name}`,
        body: `Townspeople note the ${getRelationshipTierLabel(strongestRel.score).toLowerCase()} bond between ${a.name} and ${b.name} (${strongestRel.score}/100): ${strongestRel.lastNote}.`,
        meta: `${params.relationships.length} Tracked Villager Bonds`,
      });
    }
  }

  const notableLogs = params.logs.slice(1, 4).map((l) => ({
    title: `${l.agentName} · Turn ${l.turnNumber}`,
    body: l.dialogue || l.thought,
    meta: l.newTask || 'Civic Update',
  }));

  return {
    editionNumber: Math.max(1, Math.floor(params.turnCount / 2) + 1),
    townName: params.townName,
    headline,
    subheadline,
    weatherSummary: `${params.weather.charAt(0).toUpperCase() + params.weather.slice(1)} skies · ${params.timeOfDay}`,
    stories: [...stories, ...notableLogs].slice(0, 5),
  };
}

// ============================================================================
// 5. Activity / Work Icon Classifier for 3D Floating Villager Badges
// ============================================================================

export type AgentActivityIcon =
  | 'build'
  | 'research'
  | 'harvest'
  | 'cafe'
  | 'guard'
  | 'council'
  | 'rest'
  | 'chat'
  | 'injured'
  | 'medic';

export function classifyAgentActivity(
  agent: AgentRecord,
  timeOfDay: TimeOfDay,
  structures: TownStructure[],
): { icon: AgentActivityIcon; shortLabel: string } {
  if (agent.healthStatus === 'injured') {
    return { icon: 'injured', shortLabel: 'Injured (Needs Hospital)' };
  }

  if (timeOfDay === 'night' && agent.id !== 'commander_vance' && !/watch|guard|patrol|medic|nurse|doctor/i.test(agent.role)) {
    return { icon: 'rest', shortLabel: 'Resting' };
  }

  const assignedStruct = agent.activePlotId
    ? structures.find((s) => s.plotId === agent.activePlotId)
    : null;
  if (assignedStruct?.status === 'building') {
    return { icon: 'build', shortLabel: `Building ${assignedStruct.progress}%` };
  }

  const hay = `${agent.role} ${agent.currentTask} ${assignedStruct ? getStructureDisplayLabel(assignedStruct) : ''}`.toLowerCase();

  if (/(medic|nurse|doctor|hospital|clinic|heal|triage|infirmary)/i.test(hay)) {
    return { icon: 'medic', shortLabel: 'Healing' };
  }
  if (/(research|lab|observatory|science|archive|library|study)/i.test(hay)) {
    return { icon: 'research', shortLabel: 'Researching' };
  }
  if (/(bakery|cafe|coffee|barista|tavern|pastry|bake|brew)/i.test(hay)) {
    return { icon: 'cafe', shortLabel: 'Serving' };
  }
  if (/(build|construct|hammer|blueprint|mason|architect|upgrade|scaffold|road|rail)/i.test(hay)) {
    return { icon: 'build', shortLabel: 'Building' };
  }
  if (/(farm|greenhouse|windmill|granary|harvest|gather|stone|timber|haul)/i.test(hay)) {
    return { icon: 'harvest', shortLabel: 'Gathering' };
  }
  if (/(guard|patrol|watch|security|commander|secure|shield|turret|defense|raider|defend)/i.test(hay)) {
    return { icon: 'guard', shortLabel: 'Defending' };
  }
  if (agent.rank === 1 || /(mayor|decree|council|charter|survey)/i.test(hay)) {
    return { icon: 'council', shortLabel: 'Leading' };
  }
  return { icon: 'chat', shortLabel: 'Active' };
}

// ============================================================================
// 6. Export / Import Town Save File (.json)
// ============================================================================

export interface ExportedTownFile {
  format: 'alderbrook_town_backup_v1';
  exportedAtIso: string;
  townName: string;
  turnCount: number;
  activeAgentIndex: number;
  activeDecree: string;
  metrics: TownMetrics;
  treasuryGold: number;
  autoDayNight: boolean;
  timeOfDay: TimeOfDay;
  weather: WeatherMode;
  theme: TownTheme;
  unlockedBiomes: BiomeId[];
  roads: string[];
  railSpurBuilt: boolean;
  autoMode: boolean;
  agents: AgentRecord[];
  structures: TownStructure[];
  relationships: TownRelationship[];
  resources?: TownResources;
  activePolicies?: PolicyId[];
  decorPacks?: DecorPackId[];
  unlockedMilestones?: MilestoneId[];
  history?: TownHistoryPoint[];
  logs: TownLogItem[];
}

const VALID_PLOT_SET = new Set<string>(ALL_PLOT_IDS);
const VALID_BIOME_SET = new Set<string>(ALL_BIOME_IDS);
const VALID_STRUCT_SET = new Set<string>([...ALL_STRUCTURE_TYPES, 'custom']);
const VALID_CUSTOM_STYLES = new Set<CustomBuildingStyle>([
  'lab',
  'observatory',
  'cafe',
  'tavern',
  'forge',
  'guild',
  'cabin',
  'tower',
]);
const VALID_LOCATIONS = new Set<LocationId>(['town_hall', 'workshop', 'market', 'park']);
const VALID_TOD = new Set<TimeOfDay>(['dawn', 'day', 'twilight', 'night']);

export function serializeTownExport(payload: Omit<ExportedTownFile, 'format' | 'exportedAtIso'>): string {
  const doc: ExportedTownFile = {
    format: 'alderbrook_town_backup_v1',
    exportedAtIso: new Date().toISOString(),
    ...payload,
  };
  return JSON.stringify(doc, null, 2);
}

export function parseTownImport(
  rawJson: string,
): { ok: true; data: Omit<ExportedTownFile, 'format' | 'exportedAtIso'> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(rawJson) as Partial<ExportedTownFile>;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'File does not contain a valid JSON town object.' };
    }
    const townName =
      typeof parsed.townName === 'string' && parsed.townName.trim()
        ? parsed.townName.trim().slice(0, 60)
        : 'Imported Town';

    const clampMetric = (v: unknown, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fb;
    };

    const rawAgents = Array.isArray(parsed.agents) && parsed.agents.length >= 5
      ? parsed.agents
      : createInitialAgents();
    const agents: AgentRecord[] = rawAgents.slice(0, MAX_TOWN_AGENTS).map((a, idx) => ({
      id: typeof a.id === 'string' && a.id.trim() ? a.id.slice(0, 40) : `villager_${idx}`,
      name: typeof a.name === 'string' && a.name.trim() ? a.name.slice(0, 60) : `Villager ${idx + 1}`,
      rank: (a.rank === 1 || a.rank === 2 || a.rank === 3 ? a.rank : 3) as 1 | 2 | 3,
      role: typeof a.role === 'string' ? a.role.slice(0, 60) : 'Specialist',
      department: typeof a.department === 'string' ? a.department.slice(0, 60) : 'Civic Works',
      supervisor: typeof a.supervisor === 'string' ? a.supervisor.slice(0, 60) : null,
      subordinates: Array.isArray(a.subordinates) ? a.subordinates.map(String).slice(0, 10) : [],
      accentColor: typeof a.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.accentColor)
        ? a.accentColor
        : '#14b8a6',
      personality: typeof a.personality === 'string' ? a.personality.slice(0, 160) : undefined,
      assignedPlotId:
        typeof a.assignedPlotId === 'string' && VALID_PLOT_SET.has(a.assignedPlotId)
          ? (a.assignedPlotId as PlotId)
          : null,
      hatStyle: a.hatStyle,
      outfitColors: a.outfitColors,
      isHired: Boolean(a.isHired),
      location: VALID_LOCATIONS.has(a.location as LocationId) ? (a.location as LocationId) : 'town_hall',
      activePlotId:
        typeof a.activePlotId === 'string' && VALID_PLOT_SET.has(a.activePlotId)
          ? (a.activePlotId as PlotId)
          : null,
      targetAgent: typeof a.targetAgent === 'string' ? a.targetAgent.slice(0, 60) : null,
      thought: typeof a.thought === 'string' ? a.thought.slice(0, 500) : '',
      dialogue: typeof a.dialogue === 'string' ? a.dialogue.slice(0, 240) : '',
      currentTask: typeof a.currentTask === 'string' ? a.currentTask.slice(0, 240) : '',
      userNote: typeof a.userNote === 'string' ? a.userNote.slice(0, 200) : '',
      updatedAtMs: Number(a.updatedAtMs) || Date.now(),
    }));

    const structures: TownStructure[] = Array.isArray(parsed.structures)
      ? parsed.structures
          .filter(
            (s) =>
              s &&
              typeof s.plotId === 'string' &&
              VALID_PLOT_SET.has(s.plotId) &&
              typeof s.structureType === 'string' &&
              VALID_STRUCT_SET.has(s.structureType),
          )
          .map((s) => ({
            plotId: s.plotId as PlotId,
            structureType: s.structureType as StructureType,
            status: s.status === 'complete' ? 'complete' : 'building',
            progress: clampMetric(s.progress, s.status === 'complete' ? 100 : 0),
            tier: Math.max(1, Math.min(3, Math.round(Number(s.tier ?? 1)))),
            proposedBy: typeof s.proposedBy === 'string' ? s.proposedBy.slice(0, 60) : 'Architect Lyra',
            lastBuilder: typeof s.lastBuilder === 'string' ? s.lastBuilder.slice(0, 60) : '',
            updatedAtMs: Number(s.updatedAtMs) || Date.now(),
            customLabel:
              typeof s.customLabel === 'string' && s.customLabel.trim()
                ? s.customLabel.trim().slice(0, 40)
                : undefined,
            customStyle:
              typeof s.customStyle === 'string' && VALID_CUSTOM_STYLES.has(s.customStyle as CustomBuildingStyle)
                ? (s.customStyle as CustomBuildingStyle)
                : undefined,
          }))
      : [];

    const unlockedBiomes: BiomeId[] = Array.isArray(parsed.unlockedBiomes)
      ? Array.from(
          new Set(
            parsed.unlockedBiomes.filter(
              (b): b is BiomeId => typeof b === 'string' && VALID_BIOME_SET.has(b),
            ),
          ),
        ).slice(0, 3)
      : [];

    const roads: string[] = Array.isArray(parsed.roads)
      ? Array.from(
          new Set(
            parsed.roads
              .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
              .map((r) => r.trim().slice(0, 48)),
          ),
        ).slice(0, 40)
      : [];

    const relationships: TownRelationship[] = Array.isArray(parsed.relationships)
      ? parsed.relationships
          .filter((r) => r && typeof r.agentA === 'string' && typeof r.agentB === 'string')
          .slice(0, 60)
          .map((r) => ({
            pairKey: makeRelationshipPairKey(r.agentA, r.agentB),
            agentA: r.agentA.slice(0, 40),
            agentB: r.agentB.slice(0, 40),
            score: clampMetric(r.score, 40),
            interactions: Math.max(1, Math.round(Number(r.interactions ?? 1))),
            lastNote: typeof r.lastNote === 'string' ? r.lastNote.slice(0, 80) : 'Town acquaintance',
            updatedAtMs: Number(r.updatedAtMs) || Date.now(),
          }))
      : createStarterRelationships();

    const logs: TownLogItem[] =
      Array.isArray(parsed.logs) && parsed.logs.length > 0
        ? parsed.logs.slice(0, 50)
        : createInitialLogs();

    const treasuryGold = Number.isFinite(Number(parsed.treasuryGold))
      ? Math.max(0, Math.min(999999, Math.round(Number(parsed.treasuryGold))))
      : DEFAULT_TREASURY_GOLD;

    const validPolicies = new Set<string>(ALL_POLICY_IDS);
    const activePolicies: PolicyId[] = Array.isArray(parsed.activePolicies)
      ? Array.from(
          new Set(
            parsed.activePolicies.filter(
              (p): p is PolicyId => typeof p === 'string' && validPolicies.has(p),
            ),
          ),
        )
      : [];

    const validDecors = new Set<string>(ALL_DECOR_PACK_IDS);
    const decorPacks: DecorPackId[] = Array.isArray(parsed.decorPacks)
      ? Array.from(
          new Set(
            parsed.decorPacks.filter(
              (d): d is DecorPackId => typeof d === 'string' && validDecors.has(d),
            ),
          ),
        )
      : [];

    const resources: TownResources = {
      timber: Math.max(0, Math.round(Number(parsed.resources?.timber ?? DEFAULT_TOWN_RESOURCES.timber))),
      stone: Math.max(0, Math.round(Number(parsed.resources?.stone ?? DEFAULT_TOWN_RESOURCES.stone))),
      harvest: Math.max(0, Math.round(Number(parsed.resources?.harvest ?? DEFAULT_TOWN_RESOURCES.harvest))),
      crystal: Math.max(0, Math.round(Number(parsed.resources?.crystal ?? DEFAULT_TOWN_RESOURCES.crystal))),
    };

    const metrics: TownMetrics = {
      prosperity: clampMetric(parsed.metrics?.prosperity, DEFAULT_TOWN_METRICS.prosperity),
      orderLevel: clampMetric(parsed.metrics?.orderLevel, DEFAULT_TOWN_METRICS.orderLevel),
      morale: clampMetric(parsed.metrics?.morale, DEFAULT_TOWN_METRICS.morale),
    };

    const turnCount = Math.max(0, Math.round(Number(parsed.turnCount ?? 0)));
    const history: TownHistoryPoint[] =
      Array.isArray(parsed.history) && parsed.history.length > 0
        ? parsed.history.slice(-30).map((h) => ({
            turn: Math.max(0, Math.round(Number(h.turn ?? 0))),
            treasuryGold: Math.max(0, Math.round(Number(h.treasuryGold ?? treasuryGold))),
            prosperity: clampMetric(h.prosperity, metrics.prosperity),
            orderLevel: clampMetric(h.orderLevel, metrics.orderLevel),
            morale: clampMetric(h.morale, metrics.morale),
            population: Math.max(1, Math.round(Number(h.population ?? agents.length))),
            buildings: Math.max(0, Math.round(Number(h.buildings ?? structures.length))),
          }))
        : createStarterHistory(treasuryGold, metrics, agents.length, structures.length, turnCount);

    const unlockedMilestones: MilestoneId[] = Array.isArray(parsed.unlockedMilestones)
      ? (parsed.unlockedMilestones.filter((m): m is MilestoneId => typeof m === 'string') as MilestoneId[])
      : [];

    return {
      ok: true,
      data: {
        townName,
        turnCount,
        activeAgentIndex: Math.max(0, Math.round(Number(parsed.activeAgentIndex ?? 0))) % agents.length,
        activeDecree: typeof parsed.activeDecree === 'string' ? parsed.activeDecree.slice(0, 300) : '',
        metrics,
        treasuryGold,
        autoDayNight: Boolean(parsed.autoDayNight),
        timeOfDay: VALID_TOD.has(parsed.timeOfDay as TimeOfDay) ? (parsed.timeOfDay as TimeOfDay) : 'day',
        weather: normalizeWeatherMode(parsed.weather),
        theme: normalizeTownTheme(parsed.theme),
        unlockedBiomes,
        roads,
        railSpurBuilt: Boolean(parsed.railSpurBuilt),
        autoMode: Boolean(parsed.autoMode),
        agents,
        structures,
        relationships,
        resources,
        activePolicies,
        decorPacks,
        unlockedMilestones,
        history,
        logs,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Invalid JSON file: ${err.message}` : 'Could not parse save file.',
    };
  }
}

// ============================================================================
// 11. Citizen Needs & 3D Happiness Heatmap Calculator
// ============================================================================

export function computeTownNeedsMetrics(
  structures: TownStructure[],
  agents: AgentRecord[],
  unlockedBiomes: BiomeId[],
  taxRate = 8,
): TownNeedsSummary {
  const completed = structures.filter((s) => s.status === 'complete');
  const housingStats = computeTownHousingCapacity(structures);

  const housingCount = completed.filter(
    (s) => s.structureType === 'apartment' || (s.blueprint?.apartmentCapacity ?? 0) > 0,
  ).length;
  const foodCount = completed.filter((s) =>
    ['bakery', 'greenhouse', 'granary', 'windmill'].includes(s.structureType),
  ).length;
  const safetyCount = completed.filter((s) =>
    ['watchtower', 'defense_wall', 'triple_gun_tower', 'hospital'].includes(s.structureType),
  ).length;
  const recCount = completed.filter((s) =>
    ['pavilion', 'library', 'clock_tower', 'custom'].includes(s.structureType),
  ).length;

  const taxMod = taxRate <= 6 ? 8 : taxRate >= 15 ? -10 : 0;
  const housing = Math.max(
    18,
    Math.min(100, Math.round(35 + housingCount * 22 + Math.min(25, housingStats.housingCapacity * 0.25) + taxMod)),
  );
  const food = Math.max(
    22,
    Math.min(100, Math.round(42 + foodCount * 20 + (unlockedBiomes.includes('river') ? 8 : 0))),
  );
  const safety = Math.max(
    20,
    Math.min(
      100,
      Math.round(
        36 +
          safetyCount * 20 +
          (agents.some((a) => /medic|guard|commander/i.test(a.role)) ? 10 : 0),
      ),
    ),
  );
  const recreation = Math.max(
    25,
    Math.min(100, Math.round(44 + recCount * 16 + unlockedBiomes.length * 4 + taxMod)),
  );
  const overall = Math.round((housing + food + safety + recreation) / 4);

  const plotScores: TownNeedsSummary['plotScores'] = {};
  for (const plotId of ALL_PLOT_IDS) {
    const meta = PLOT_META[plotId];
    let hScore = housing;
    let fScore = food;
    let sScore = safety;
    let rScore = recreation;
    for (const s of completed) {
      const sMeta = PLOT_META[s.plotId];
      if (!sMeta) continue;
      const dist = Math.hypot(meta.x - sMeta.x, meta.z - sMeta.z);
      if (dist > 18) continue;
      const proximity = Math.max(0, 1 - dist / 18);
      if (s.structureType === 'apartment' || (s.blueprint?.apartmentCapacity ?? 0) > 0) {
        hScore += Math.round(28 * proximity);
      }
      if (['bakery', 'greenhouse', 'granary', 'windmill'].includes(s.structureType)) {
        fScore += Math.round(28 * proximity);
      }
      if (['watchtower', 'defense_wall', 'triple_gun_tower', 'hospital'].includes(s.structureType)) {
        sScore += Math.round(32 * proximity);
      }
      if (['pavilion', 'library', 'clock_tower', 'custom'].includes(s.structureType)) {
        rScore += Math.round(24 * proximity);
      }
    }
    plotScores[plotId] = {
      housing: Math.min(100, hScore),
      food: Math.min(100, fScore),
      safety: Math.min(100, sScore),
      recreation: Math.min(100, rScore),
    };
  }

  const lowest = [
    { key: 'Housing', val: housing, hint: 'Build a multi-story Apartment to grow crowd housing' },
    { key: 'Food', val: food, hint: 'Add a Bakery, Greenhouse, or Windmill near the square' },
    { key: 'Safety', val: safety, hint: 'Place a Town Hospital or Triple-Gun Tower for coverage' },
    { key: 'Recreation', val: recreation, hint: 'Build a Pavilion, Library, or Sky-Cafe' },
  ].sort((a, b) => a.val - b.val)[0];

  return {
    housing,
    food,
    safety,
    recreation,
    overall,
    shortageHint: lowest.val >= 82 ? 'All citizen districts are thriving!' : `${lowest.key} priority: ${lowest.hint}`,
    plotScores,
  };
}

// ============================================================================
// 12. AI Town Council Debates & Competing Leader Proposals
// ============================================================================

export function generateCouncilDebate(
  structures: TownStructure[],
  agents: AgentRecord[],
  trainBlueprints: TrainBlueprint[],
  turnCount: number,
): CouncilDebateProposal {
  const lyra = agents.find((a) => a.id === 'architect_lyra');
  const vance = agents.find((a) => a.id === 'commander_vance');
  const kai = agents.find((a) => a.id === 'worker_kai');
  const pip = agents.find((a) => a.id === 'worker_pip');

  const variants: Array<() => CouncilDebateProposal> = [
    () => ({
      id: `debate-skyline-${Date.now()}`,
      topic: 'Skyline Growth vs. Perimeter Defense',
      createdAtMs: Date.now(),
      optionA: {
        id: 'opt_sky_tower',
        leaderName: lyra?.name ?? 'Architect Lyra',
        leaderRole: lyra?.role ?? 'Builder & Economy',
        accentColor: '#14b8a6',
        title: 'Build 5-Story Sky-Apartments',
        pitch: 'Expand housing right now so 30+ new crowd citizens move in and pay rent!',
        actionKind: 'build',
        structureType: 'apartment',
        blueprint: generateFallbackBuildingBlueprint('5-Story Emerald Sky-Apartments'),
        goldCost: 60,
        moraleDelta: 6,
        orderDelta: 2,
      },
      optionB: {
        id: 'opt_triple_turret',
        leaderName: vance?.name ?? 'Commander Vance',
        leaderRole: vance?.role ?? 'Security & Logistics',
        accentColor: '#3b82f6',
        title: 'Erect Triple-Gun Defense Tower',
        pitch: 'Ironhold Bastion is watching — reinforce our defenses before we expand upward.',
        actionKind: 'build',
        structureType: 'triple_gun_tower',
        goldCost: 50,
        moraleDelta: 2,
        orderDelta: 8,
      },
    }),
    () => ({
      id: `debate-transit-${Date.now()}`,
      topic: 'Express Rail Upgrade vs. Crystal Landmark',
      createdAtMs: Date.now(),
      optionA: {
        id: 'opt_bullet_train',
        leaderName: kai?.name ?? 'Worker Kai',
        leaderRole: kai?.role ?? 'Guard & Hauler',
        accentColor: '#f59e0b',
        title:
          trainBlueprints.length < 3
            ? 'Commission Neon Bullet Train'
            : 'Upgrade Lead Express Train',
        pitch: 'High-speed rail brings bigger freight payouts and boosts ticket revenue every turn.',
        actionKind: 'train',
        trainBlueprint: generateFallbackTrainBlueprint('Starlight Neon Bullet Train'),
        goldCost: 55,
        moraleDelta: 5,
        orderDelta: 3,
      },
      optionB: {
        id: 'opt_crystal_temple',
        leaderName: pip?.name ?? 'Worker Pip',
        leaderRole: pip?.role ?? 'Artisan & Gatherer',
        accentColor: '#ea580c',
        title: 'Construct Crystal Dome Temple',
        pitch: 'Give our citizens a radiant civic landmark that lifts town morale and tourism.',
        actionKind: 'build',
        structureType: 'custom',
        blueprint: generateFallbackBuildingBlueprint('Crystal Dome Temple'),
        goldCost: 45,
        moraleDelta: 8,
        orderDelta: 2,
      },
    }),
    () => ({
      id: `debate-civic-${Date.now()}`,
      topic: 'Medical Wing vs. Pagoda Grand Market',
      createdAtMs: Date.now(),
      optionA: {
        id: 'opt_hospital',
        leaderName: vance?.name ?? 'Commander Vance',
        leaderRole: vance?.role ?? 'Security & Logistics',
        accentColor: '#ef4444',
        title: 'Open Town Hospital Wing',
        pitch: 'Guarantee rapid medic response during raids and winter storms.',
        actionKind: 'build',
        structureType: 'hospital',
        goldCost: 40,
        moraleDelta: 5,
        orderDelta: 7,
      },
      optionB: {
        id: 'opt_pagoda_plaza',
        leaderName: lyra?.name ?? 'Architect Lyra',
        leaderRole: lyra?.role ?? 'Builder & Economy',
        accentColor: '#14b8a6',
        title: 'Build 4-Story Pagoda Flats',
        pitch: 'Blend scenic pagoda terraces with apartment housing for bustling street life.',
        actionKind: 'build',
        structureType: 'apartment',
        blueprint: generateFallbackBuildingBlueprint('4-Story Pagoda Residence'),
        goldCost: 55,
        moraleDelta: 7,
        orderDelta: 2,
      },
    }),
  ];

  const idx = (turnCount + structures.length) % variants.length;
  return variants[idx]();
}

// ============================================================================
// 13. Live Disaster & Emergency Response Events
// ============================================================================

export function pickEmergencyEvent(
  weather: WeatherMode,
  unlockedBiomes: BiomeId[],
  structures: TownStructure[],
): EmergencyEventState {
  const hasHospital = structures.some((s) => s.structureType === 'hospital' && s.status === 'complete');
  const events: EmergencyEventState[] = [
    {
      id: `emerg-blizzard-${Date.now()}`,
      kind: 'blizzard',
      title: 'Sudden Blizzard Heating Surge',
      description:
        'An icy squall swept across the valley! Apartment boilers need extra timber and civic hearth checks.',
      severity: 'alert',
      options: [
        {
          id: 'distribute_timber',
          label: 'Distribute Reserve Timber (-6 Timber)',
          detail: '+8 Morale · Apartments stay cozy',
          goldDelta: 0,
          timberDelta: -6,
          stoneDelta: 0,
          moraleDelta: 8,
          orderDelta: 4,
          prosperityDelta: 2,
          responseNote: 'Emergency timber wagons warmed every apartment block before nightfall!',
        },
        {
          id: 'fund_heaters',
          label: 'Emergency Coal Subsidy (-35g)',
          detail: '+6 Morale · +5 Order',
          goldDelta: -35,
          timberDelta: 0,
          stoneDelta: 0,
          moraleDelta: 6,
          orderDelta: 5,
          prosperityDelta: 3,
          responseNote: 'Town Hall funded steam heating along the square and railway depot.',
        },
      ],
      triggeredAtMs: Date.now(),
    },
    {
      id: `emerg-wildfire-${Date.now()}`,
      kind: 'wildfire',
      title: 'Forest Edge Spark Alert',
      description:
        'Dry winds ignited brush near the timber perimeter. Rangers and medics await your containment order.',
      severity: 'alert',
      biomeHint: unlockedBiomes.includes('forest') ? 'forest' : undefined,
      options: [
        {
          id: 'stone_firebreak',
          label: 'Build Stone Firebreak (-6 Stone)',
          detail: '+9 Order · Zero damage',
          goldDelta: 0,
          timberDelta: 0,
          stoneDelta: -6,
          moraleDelta: 4,
          orderDelta: 9,
          prosperityDelta: 2,
          responseNote: 'Builders cut a rapid stone trench and halted the brushfire cleanly!',
        },
        {
          id: 'medic_bucket_line',
          label: hasHospital ? 'Deploy Medics & Bucket Line' : 'Mobilize Volunteers (-20g)',
          detail: hasHospital ? 'Hospital Bonus: +8 Morale' : '+5 Morale · +5 Order',
          goldDelta: hasHospital ? 0 : -20,
          timberDelta: 0,
          stoneDelta: 0,
          moraleDelta: hasHospital ? 8 : 5,
          orderDelta: 5,
          prosperityDelta: 1,
          responseNote: 'Villagers and crowd volunteers doused every ember together!',
        },
      ],
      triggeredAtMs: Date.now(),
    },
    {
      id: `emerg-bridge-${Date.now()}`,
      kind: 'bridge_outage',
      title: 'Outer Rail & Bridge Outage',
      description:
        'Heavy freight loosened bridge bolts near the crossing. Repair crews can reinforce it or run a quick patch.',
      severity: 'alert',
      biomeHint: unlockedBiomes.includes('river') ? 'river' : undefined,
      options: [
        {
          id: 'reinforce_bridge',
          label: 'Reinforce Steel Span (-4 Timber, -4 Stone)',
          detail: '+45g Freight Bonus · +7 Order',
          goldDelta: 45,
          timberDelta: -4,
          stoneDelta: -4,
          moraleDelta: 3,
          orderDelta: 7,
          prosperityDelta: 6,
          responseNote: 'The reinforced bridge now carries heavier express freight at top speed!',
        },
        {
          id: 'express_patch',
          label: 'Quick Crew Patch (-25g)',
          detail: '+4 Order · Trains resume fast',
          goldDelta: -25,
          timberDelta: 0,
          stoneDelta: 0,
          moraleDelta: 2,
          orderDelta: 4,
          prosperityDelta: 2,
          responseNote: 'Track engineers bolted the span and cleared the next express train.',
        },
      ],
      triggeredAtMs: Date.now(),
    },
    {
      id: `emerg-tourists-${Date.now()}`,
      kind: 'tourist_rush',
      title: 'Grand Express Tourist Rush!',
      description:
        'Travelers poured off the morning train to admire your procedural skyline and bustling square!',
      severity: 'boom',
      options: [
        {
          id: 'host_street_fair',
          label: 'Host Skyline Street Fair (-20g)',
          detail: '+95g Revenue · +9 Morale',
          goldDelta: 75,
          timberDelta: 0,
          stoneDelta: 0,
          moraleDelta: 9,
          orderDelta: 2,
          prosperityDelta: 8,
          responseNote: 'Cafes, apartments, and train platforms buzzed with delighted visitors!',
        },
        {
          id: 'guided_rail_tickets',
          label: 'Sell Scenic Train Passes (Free)',
          detail: '+55g Revenue · +5 Prosperity',
          goldDelta: 55,
          timberDelta: 0,
          stoneDelta: 0,
          moraleDelta: 4,
          orderDelta: 3,
          prosperityDelta: 5,
          responseNote: 'Express ticket booths sold out within the hour!',
        },
      ],
      triggeredAtMs: Date.now(),
    },
  ];

  if (weather === 'winter') return events[0];
  return events[Math.floor(Math.random() * events.length)];
}

// ============================================================================
// 14. Compact Share & Import Codes (Buildings, Trains & Full Towns)
// ============================================================================

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Utf8(code: string): string {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeBlueprintShareCode(payload: ShareCodePayload): string {
  const prefix =
    payload.kind === 'building'
      ? 'ALDER-BLDG:'
      : payload.kind === 'train'
        ? 'ALDER-TRAIN:'
        : 'ALDER-TOWN:';
  return `${prefix}${toBase64Utf8(JSON.stringify(payload))}`;
}

export function decodeBlueprintShareCode(
  rawCode: string,
): { ok: true; payload: ShareCodePayload } | { ok: false; error: string } {
  try {
    const trimmed = rawCode.trim();
    const match = trimmed.match(/^ALDER-(BLDG|TRAIN|TOWN):([A-Za-z0-9_-]+)$/);
    if (!match) {
      return { ok: false, error: 'Code must start with ALDER-BLDG:, ALDER-TRAIN:, or ALDER-TOWN:' };
    }
    const parsed = JSON.parse(fromBase64Utf8(match[2])) as Record<string, unknown>;
    if (match[1] === 'BLDG') {
      return {
        ok: true,
        payload: {
          kind: 'building',
          blueprint: sanitizeBuildingBlueprint(parsed.blueprint ?? parsed),
        },
      };
    }
    if (match[1] === 'TRAIN') {
      return {
        ok: true,
        payload: {
          kind: 'train',
          blueprint: sanitizeTrainBlueprint(parsed.blueprint ?? parsed),
        },
      };
    }
    const townName =
      typeof parsed.townName === 'string' && parsed.townName.trim()
        ? parsed.townName.trim().slice(0, 48)
        : 'Imported Town';
    const rawBps = Array.isArray(parsed.blueprints) ? parsed.blueprints : [];
    const rawTrains = Array.isArray(parsed.trains) ? parsed.trains : [];
    const rawBiomes = Array.isArray(parsed.unlockedBiomes)
      ? parsed.unlockedBiomes.filter((b): b is BiomeId =>
          ALL_BIOME_IDS.includes(b as BiomeId),
        )
      : [];
    return {
      ok: true,
      payload: {
        kind: 'town',
        townName,
        theme: normalizeTownTheme(parsed.theme),
        weather: normalizeWeatherMode(parsed.weather),
        timeOfDay:
          parsed.timeOfDay === 'dawn' ||
          parsed.timeOfDay === 'day' ||
          parsed.timeOfDay === 'twilight' ||
          parsed.timeOfDay === 'night'
            ? parsed.timeOfDay
            : 'day',
        unlockedBiomes: rawBiomes,
        blueprints: rawBps.slice(0, 8).map((b) => sanitizeBuildingBlueprint(b)),
        trains: rawTrains.slice(0, 3).map((t) => sanitizeTrainBlueprint(t)),
      },
    };
  } catch {
    return { ok: false, error: 'Could not decode share code. Make sure the full code was pasted.' };
  }
}

// ============================================================================
// 15. District Zoning, Power/Water Utilities & Civic Tech Tree
// ============================================================================

export const DISTRICT_ZONE_META: Record<
  DistrictZoneType,
  { label: string; shortLabel: string; hex: string; bonus: string }
> = {
  mixed: {
    label: 'Mixed Civic',
    shortLabel: 'Mixed',
    hex: '#94a3b8',
    bonus: 'Balanced default district',
  },
  residential: {
    label: 'Residential',
    shortLabel: 'Res',
    hex: '#10b981',
    bonus: '+25% apartment rent & housing appeal',
  },
  commercial: {
    label: 'Commercial',
    shortLabel: 'Comm',
    hex: '#f59e0b',
    bonus: '+30% building revenue per turn',
  },
  civic: {
    label: 'Civic & Safety',
    shortLabel: 'Civic',
    hex: '#3b82f6',
    bonus: '+15% safety, morale & emergency resilience',
  },
  tech: {
    label: 'Tech & Research',
    shortLabel: 'Tech',
    hex: '#06b6d4',
    bonus: '+20% building yield & +1 Crystal/turn',
  },
};

export const TECH_UPGRADES: TechUpgradeMeta[] = [
  {
    id: 'smart_grid',
    label: 'Smart Power Grid',
    costGold: 120,
    costCrystal: 3,
    effect: '-30% town power consumption',
  },
  {
    id: 'solar_roofs',
    label: 'Solar Rooftops',
    costGold: 140,
    costCrystal: 4,
    effect: '+24 MW clean power capacity',
  },
  {
    id: 'high_speed_bogies',
    label: 'High-Speed Rail Bogies',
    costGold: 150,
    costCrystal: 4,
    effect: '+35% train ticket revenue',
  },
  {
    id: 'prefab_floors',
    label: 'Modular Prefab Floors',
    costGold: 160,
    costCrystal: 5,
    effect: '+25% apartment rent yield',
  },
  {
    id: 'hydroponics',
    label: 'Hydroponic Towers',
    costGold: 130,
    costCrystal: 4,
    effect: '+30 kL water recycling & Harvest boost',
  },
  {
    id: 'auto_turrets',
    label: 'Autonomous Defense AI',
    costGold: 170,
    costCrystal: 5,
    effect: '+15% Town Safety & rapid repair',
  },
  {
    id: 'trade_tariffs',
    label: 'Inter-Town Trade Charter',
    costGold: 180,
    costCrystal: 6,
    effect: '+25% rail trade & market sell prices',
  },
  {
    id: 'civic_transit',
    label: 'Free Electric Tram Pass',
    costGold: 140,
    costCrystal: 3,
    effect: '+8 Morale floor & faster crowd commute',
  },
];

export function computeUtilityGrid(
  structures: TownStructure[],
  unlockedBiomes: BiomeId[],
  unlockedTechs: TechUpgradeId[] = [],
): UtilityGridSummary {
  const completed = structures.filter((s) => s.status === 'complete');
  let powerProducedMW = 32 + (unlockedTechs.includes('solar_roofs') ? 24 : 0);
  let waterProducedKL = 40 + (unlockedBiomes.includes('river') ? 35 : 0) + (unlockedTechs.includes('hydroponics') ? 30 : 0);
  let powerUsedMW = 8;
  let waterUsedKL = 10;

  for (const s of completed) {
    const floors = s.blueprint?.floors ?? 1;
    if (s.structureType === 'windmill') {
      powerProducedMW += 18 * s.tier;
    } else if (s.structureType === 'clock_tower') {
      powerProducedMW += 10 * s.tier;
    } else if (s.structureType === 'greenhouse' || s.structureType === 'granary') {
      waterProducedKL += 16 * s.tier;
      powerUsedMW += 4;
    } else if (s.structureType === 'apartment' || (s.blueprint?.apartmentCapacity ?? 0) > 0) {
      powerUsedMW += 4 + floors * 2;
      waterUsedKL += 6 + floors * 3;
    } else {
      powerUsedMW += 5 + floors;
      waterUsedKL += 4 + floors;
    }
  }

  if (unlockedTechs.includes('smart_grid')) {
    powerUsedMW = Math.max(4, Math.round(powerUsedMW * 0.7));
  }

  const powerSurplusMW = powerProducedMW - powerUsedMW;
  const waterSurplusKL = waterProducedKL - waterUsedKL;
  const status: UtilityGridSummary['status'] =
    powerSurplusMW < 0 || waterSurplusKL < 0
      ? 'shortage'
      : powerSurplusMW < 8 || waterSurplusKL < 10
        ? 'strained'
        : 'optimal';
  const efficiencyMult = status === 'optimal' ? 1.05 : status === 'strained' ? 1.0 : 0.85;

  return {
    powerProducedMW,
    powerUsedMW,
    powerSurplusMW,
    waterProducedKL,
    waterUsedKL,
    waterSurplusKL,
    status,
    efficiencyMult,
  };
}

// ============================================================================
// 16. Dynamic Resource Market Exchange & Active Civic Quests
// ============================================================================

export function stepMarketPrices(
  prev: MarketPricesState,
  resources: TownResources,
  weather: WeatherMode,
  turnCount: number,
  unlockedTechs: TechUpgradeId[] = [],
): MarketPricesState {
  const tariffBoost = unlockedTechs.includes('trade_tariffs') ? 2 : 0;
  const calc = (
    key: 'timber' | 'stone' | 'harvest' | 'crystal',
    base: number,
    minP: number,
    maxP: number,
    phase: number,
  ): { price: number; trend: PriceTrend } => {
    const wave = Math.round(Math.sin(turnCount * 0.65 + phase) * 2.4);
    const weatherMod =
      (weather === 'winter' && key === 'timber') || (weather === 'rain' && key === 'harvest')
        ? 2
        : 0;
    const scarcityMod = resources[key] < 10 ? 2 : resources[key] > 45 ? -1 : 0;
    const next = Math.max(minP, Math.min(maxP, base + wave + weatherMod + scarcityMod + tariffBoost));
    const trend: PriceTrend = next > prev[key] ? 'up' : next < prev[key] ? 'down' : 'flat';
    return { price: next, trend };
  };

  const t = calc('timber', 9, 5, 18, 0.4);
  const s = calc('stone', 11, 6, 20, 1.7);
  const h = calc('harvest', 10, 6, 19, 3.1);
  const c = calc('crystal', 18, 12, 34, 4.6);
  return {
    timber: t.price,
    stone: s.price,
    harvest: h.price,
    crystal: c.price,
    trends: {
      timber: t.trend,
      stone: s.trend,
      harvest: h.trend,
      crystal: c.trend,
    },
  };
}

export function evaluateCivicQuests(params: {
  structures: TownStructure[];
  unlockedBiomes: BiomeId[];
  trainBlueprints: TrainBlueprint[];
  townNeeds: TownNeedsSummary;
  unlockedTechs: TechUpgradeId[];
  cargoDispatchedCount: number;
  claimedQuestIds: string[];
}): CivicQuestItem[] {
  const housing = computeTownHousingCapacity(params.structures);
  const maxFloors = params.structures.reduce(
    (mx, s) => Math.max(mx, s.blueprint?.floors ?? 1),
    0,
  );
  const claimed = new Set(params.claimedQuestIds);

  const defs = [
    {
      id: 'q_crowd_45',
      title: 'Grow Bustling Crowd (45+ Citizens)',
      detail: 'Build multi-story Apartments to attract 45 crowd citizens',
      progress: housing.dummyPopulation,
      target: 45,
      rewardGold: 140,
      rewardCrystal: 3,
    },
    {
      id: 'q_tall_tower',
      title: 'Reach the Skyline (5+ Floors)',
      detail: 'Construct any 5- or 6-story procedural building',
      progress: maxFloors,
      target: 5,
      rewardGold: 120,
      rewardCrystal: 4,
    },
    {
      id: 'q_fleet_2',
      title: 'Expand Express Rail Fleet',
      detail: 'Operate at least 2 custom trains on your railway',
      progress: Math.max(1, params.trainBlueprints.length),
      target: 2,
      rewardGold: 150,
      rewardCrystal: 3,
    },
    {
      id: 'q_cargo_2',
      title: 'Inter-Town Freight Trader',
      detail: 'Dispatch 2 cargo shipments from the Rail tab',
      progress: params.cargoDispatchedCount,
      target: 2,
      rewardGold: 130,
      rewardCrystal: 4,
    },
    {
      id: 'q_needs_80',
      title: 'Thriving Citizen Happiness (80%)',
      detail: 'Achieve 80% average coverage across Housing, Food, Safety & Rec',
      progress: params.townNeeds.overall,
      target: 80,
      rewardGold: 180,
      rewardCrystal: 5,
    },
    {
      id: 'q_tech_2',
      title: 'Modern Civic Innovation',
      detail: 'Research 2 permanent upgrades in the Civic Tech Tree',
      progress: params.unlockedTechs.length,
      target: 2,
      rewardGold: 160,
      rewardCrystal: 6,
    },
  ];

  return defs.map((d) => ({
    ...d,
    progress: Math.min(d.target, d.progress),
    completed: d.progress >= d.target,
    claimed: claimed.has(d.id),
  }));
}

// ============================================================================
// 17. Live Citizen Sentiment Feed & CSV Ledger Export
// ============================================================================

export function generateCitizenSentiments(params: {
  taxRate: number;
  townNeeds: TownNeedsSummary;
  utilities: UtilityGridSummary;
  weather: WeatherMode;
  structures: TownStructure[];
  metrics: TownMetrics;
}): CitizenSentimentItem[] {
  const items: CitizenSentimentItem[] = [];

  if (params.utilities.status === 'shortage') {
    items.push({
      id: 'sent-util-low',
      mood: 'concern',
      speaker: 'Grid Engineer',
      text:
        params.utilities.powerSurplusMW < 0
          ? `Power grid is short by ${Math.abs(params.utilities.powerSurplusMW)} MW — build a Windmill or research Solar Roofs.`
          : `Water pressure dropped (${params.utilities.waterSurplusKL} kL) — unlock River biome or add a Greenhouse.`,
      fixAction: 'utilities',
    });
  } else {
    items.push({
      id: 'sent-util-ok',
      mood: 'happy',
      speaker: 'Square Resident',
      text: `Steady power (+${params.utilities.powerSurplusMW} MW) and fresh water keep every apartment glowing.`,
    });
  }

  if (params.taxRate >= 15) {
    items.push({
      id: 'sent-tax-high',
      mood: 'concern',
      speaker: 'Market Baker',
      text: `${params.taxRate}% taxes feel steep this week — lowering toward 8–10% would lift morale fast.`,
      fixAction: 'tax',
    });
  } else if (params.taxRate <= 6) {
    items.push({
      id: 'sent-tax-low',
      mood: 'happy',
      speaker: 'Commuter',
      text: `Low ${params.taxRate}% civic tax has everyone spending freely along Market Square!`,
    });
  }

  if (params.townNeeds.housing < 65) {
    items.push({
      id: 'sent-housing',
      mood: 'concern',
      speaker: 'New Arrival',
      text: 'Apartments are filling up fast — a 5-story residential tower would welcome more commuters.',
      fixAction: 'housing',
    });
  }
  if (params.townNeeds.food < 65) {
    items.push({
      id: 'sent-food',
      mood: 'concern',
      speaker: 'Plaza Grocer',
      text: 'Fresh bread and produce queues are long. Another Bakery or Greenhouse would help.',
      fixAction: 'food',
    });
  }
  if (params.townNeeds.safety < 65) {
    items.push({
      id: 'sent-safety',
      mood: 'concern',
      speaker: 'Night Watch',
      text: 'Outer lanes feel quiet at night — a Hospital, Watchtower, or Patrol Drone keeps citizens safe.',
      fixAction: 'safety',
    });
  }

  if (items.length < 3) {
    const latest = params.structures[params.structures.length - 1];
    items.push({
      id: 'sent-skyline',
      mood: 'happy',
      speaker: 'Skyline Visitor',
      text: latest
        ? `Everyone is talking about the new ${getStructureDisplayLabel(latest)} — great skyline addition!`
        : `Pleasant ${params.weather} weather and ${params.metrics.morale}% morale across town today.`,
    });
  }

  return items.slice(0, 4);
}

export function exportHistoryToCsv(townName: string, history: TownHistoryPoint[]): string {
  const header = 'Turn,TreasuryGold,Prosperity,Order,Morale,Agents,Buildings';
  const rows = history.map(
    (h) =>
      `${h.turn},${h.treasuryGold},${h.prosperity},${h.orderLevel},${h.morale},${h.population},${h.buildings}`,
  );
  return `# ${townName} Economic Ledger\n${header}\n${rows.join('\n')}\n`;
}

// ============================================================================
// 18. Festival Calendar, Tourism Engine, Credit Rating & Report Card
// ============================================================================

export const FESTIVAL_CATALOG: Array<{
  kind: FestivalKind;
  label: string;
  costGold: number;
  turns: number;
  goldBonusPerTurn: number;
  moraleBonusPerTurn: number;
  crystalBonusPerTurn: number;
  summary: string;
}> = [
  {
    kind: 'harvest_fair',
    label: 'Harvest Fair',
    costGold: 45,
    turns: 5,
    goldBonusPerTurn: 28,
    moraleBonusPerTurn: 3,
    crystalBonusPerTurn: 0,
    summary: '+28g & +3 Morale/turn for 5 turns',
  },
  {
    kind: 'lantern_night',
    label: 'Lantern & Fireworks Week',
    costGold: 55,
    turns: 5,
    goldBonusPerTurn: 18,
    moraleBonusPerTurn: 5,
    crystalBonusPerTurn: 1,
    summary: '+18g, +5 Morale & +1 Crystal/turn',
  },
  {
    kind: 'rail_expo',
    label: 'Grand Rail Expo',
    costGold: 65,
    turns: 5,
    goldBonusPerTurn: 42,
    moraleBonusPerTurn: 2,
    crystalBonusPerTurn: 0,
    summary: '+42g ticket surge & +2 Morale/turn',
  },
  {
    kind: 'tech_summit',
    label: 'Civic Tech Summit',
    costGold: 70,
    turns: 5,
    goldBonusPerTurn: 22,
    moraleBonusPerTurn: 2,
    crystalBonusPerTurn: 3,
    summary: '+22g & +3 Crystal/turn for research',
  },
];

export function computeTourismSummary(params: {
  structures: TownStructure[];
  unlockedBiomes: BiomeId[];
  decorPacks: DecorPackId[];
  balloonsEnabled: boolean;
  fireworksCount: number;
  activeFestival: ActiveFestivalState | null;
}): TourismSummary {
  const completed = params.structures.filter((s) => s.status === 'complete');
  const tallTowers = completed.filter((s) => (s.blueprint?.floors ?? 1) >= 4).length;
  const dailyVisitors =
    18 +
    completed.length * 6 +
    tallTowers * 14 +
    params.unlockedBiomes.length * 12 +
    params.decorPacks.length * 15 +
    (params.balloonsEnabled ? 22 : 0) +
    Math.min(30, params.fireworksCount * 6) +
    (params.activeFestival ? 38 : 0);

  const revenuePerTurn = Math.round(dailyVisitors * 0.24);
  const starRating = Math.min(5, Number((2.2 + dailyVisitors / 75).toFixed(1)));

  let topAttraction = 'Alderbrook Town Square';
  if (params.activeFestival) {
    topAttraction = params.activeFestival.label;
  } else if (tallTowers > 0) {
    const tallest = [...completed].sort(
      (a, b) => (b.blueprint?.floors ?? 1) - (a.blueprint?.floors ?? 1),
    )[0];
    if (tallest) topAttraction = getStructureDisplayLabel(tallest);
  } else if (params.balloonsEnabled) {
    topAttraction = 'Skyline Hot Air Balloons';
  } else if (params.unlockedBiomes.includes('river')) {
    topAttraction = 'River Crossing Ferry';
  }

  return {
    dailyVisitors,
    revenuePerTurn,
    starRating,
    topAttraction,
  };
}

export function computeCreditRating(params: {
  treasuryGold: number;
  netPerTurn: number;
  utilityStatus: 'optimal' | 'strained' | 'shortage';
  activeLoan: MunicipalLoanState | null;
  morale: number;
}): CreditRatingSummary {
  let score = 55;
  if (params.treasuryGold >= 400) score += 18;
  else if (params.treasuryGold >= 200) score += 10;
  else if (params.treasuryGold < 60) score -= 14;

  if (params.netPerTurn >= 80) score += 18;
  else if (params.netPerTurn >= 30) score += 10;
  else if (params.netPerTurn < 0) score -= 22;

  if (params.utilityStatus === 'optimal') score += 8;
  else if (params.utilityStatus === 'shortage') score -= 14;

  if (params.activeLoan) score -= 8;
  if (params.morale >= 80) score += 6;
  else if (params.morale < 50) score -= 10;

  if (score >= 90) {
    return {
      grade: 'AAA',
      label: 'Prime Municipal Credit',
      interestRatePct: 8,
      advice: 'Top solvency — municipal bonds qualify for 8% low interest.',
    };
  }
  if (score >= 76) {
    return {
      grade: 'AA',
      label: 'Strong Treasury Standing',
      interestRatePct: 10,
      advice: 'Healthy surplus — keep utilities optimal to reach AAA.',
    };
  }
  if (score >= 62) {
    return {
      grade: 'A',
      label: 'Stable Civic Credit',
      interestRatePct: 12,
      advice: 'Steady finances — upgrade Tier 1 plots to expand surplus.',
    };
  }
  if (score >= 46) {
    return {
      grade: 'B',
      label: 'Watchlist Credit',
      interestRatePct: 15,
      advice: 'Balance taxes or resolve utility shortages before borrowing.',
    };
  }
  return {
    grade: 'C',
    label: 'High-Risk Municipal Debt',
    interestRatePct: 18,
    advice: 'Boost revenue via Market trades or cargo dispatches first.',
  };
}

export function formatTownReportCard(params: {
  townName: string;
  motto: string;
  turnCount: number;
  treasuryGold: number;
  netPerTurn: number;
  morale: number;
  prosperity: number;
  aiAgents: number;
  crowdPop: number;
  crowdCap: number;
  buildings: number;
  trains: number;
  tourism: TourismSummary;
  credit: CreditRatingSummary;
}): string {
  return [
    `${params.townName} — Town Report Card (Turn ${params.turnCount})`,
    `"${params.motto}"`,
    `Credit Rating: ${params.credit.grade} (${params.credit.label})`,
    `Treasury: ${params.treasuryGold}g (${params.netPerTurn >= 0 ? '+' : ''}${params.netPerTurn}g/turn)`,
    `Population: ${params.aiAgents} AI Council · ${params.crowdPop}/${params.crowdCap} Crowd Citizens`,
    `Skyline: ${params.buildings} Buildings · ${params.trains} Custom Train(s)`,
    `Tourism: ${params.tourism.starRating}/5.0 Stars · ${params.tourism.dailyVisitors} Visitors/day · Top: ${params.tourism.topAttraction}`,
    `Civic Pulse: ${params.prosperity}% Prosperity · ${params.morale}% Morale`,
  ].join('\n');
}


