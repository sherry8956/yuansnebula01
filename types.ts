export type Country = 'JP' | 'KR' | 'OTHER';

export interface Transaction {
  id: string;
  country: Country;    // Origin country
  customerName: string;
  itemName: string;
  quantity: number;
  costJpy: number;     // Cost per unit in Foreign Currency
  exchangeRate: number; // Current Rate (Cost Rate) used at time of purchase
  sellingExchangeRate?: number; // Selling Rate (Reference/Pricing)
  priceSold: number;   // Sold price per unit in Local Currency
  date: string;
}

export interface SummaryStats {
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  itemCount: number;
}