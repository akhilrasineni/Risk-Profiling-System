export const ALLOCATION_MODELS = {
  Conservative: {
    Equity: 30,
    Debt: 60,
    Alternatives: 10,
    Rebalance: 'Semi-Annual'
  },
  Moderate: {
    Equity: 50,
    Debt: 40,
    Alternatives: 10,
    Rebalance: 'Quarterly'
  },
  Aggressive: {
    Equity: 70,
    Debt: 20,
    Alternatives: 10,
    Rebalance: 'Quarterly'
  }
} as const;

export type RiskCategory = keyof typeof ALLOCATION_MODELS;
