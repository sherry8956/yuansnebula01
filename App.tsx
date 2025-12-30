import React, { useState, useEffect, useMemo } from 'react';
import { 
  Briefcase, Sparkles, Loader2, AlertTriangle, X,
  HandCoins, DollarSign, ShoppingBag, CreditCard,
  Plus, Save, Globe, Calendar,
  Trash2, Download, Copy, Check, RotateCcw
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// ==========================================
// 1. TYPES
// ==========================================

export type Country = 'JP' | 'KR' | 'OTHER';

export interface Transaction {
  id: string;
  country: Country;
  customerName: string;
  itemName: string;
  quantity: number;
  costJpy: number;     // Cost per unit in Foreign Currency
  exchangeRate: number; // Current Rate (Cost Rate)
  sellingExchangeRate?: number; // Selling Rate (Reference)
  priceSold: number;   // Sold price per unit in Local Currency
  date: string;
}

export interface SummaryStats {
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  itemCount: number;
}

// ==========================================
// 2. SERVICE (Gemini AI)
// ==========================================

const analyzeSalesData = async (transactions: Transaction[]): Promise<string> => {
  if (transactions.length === 0) {
    return "尚無銷售數據可供分析。請先新增一些交易紀錄。";
  }

  // Initialize Gemini Client inside the function to ensure it picks up the latest key if env changes
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const dataSummary = transactions.map(t => ({
    country: t.country || 'JP',
    item: t.itemName,
    qty: t.quantity,
    cost: t.costJpy,
    rate: t.exchangeRate,
    sold: t.priceSold,
    profit: (t.priceSold - (t.costJpy * t.exchangeRate)) * t.quantity
  }));

  const prompt = `
    你是一位專業的代購銷售分析師。以下是目前的銷售數據 (JSON 格式)，包含不同國家 (JP=日本, KR=韓國, OTHER=其他) 的代購紀錄：
    ${JSON.stringify(dataSummary)}

    請用繁體中文 (Traditional Chinese) 為我提供一份簡短的分析報告 (約 150-200 字)。
    重點包含：
    1. 最賺錢的商品是什麼？(請考慮國家來源)
    2. 不同國家的代購效益分析（例如日本 vs 韓國哪個利潤較好）。
    3. 給予賣家的經營建議 (例如匯率波動應對或選品建議)。
    
    請使用條列式呈現，語氣專業且正面。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "無法產生分析報告。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "分析過程中發生錯誤，請檢查您的 API Key 或稍後再試。";
  }
};

// ==========================================
// 3. COMPONENTS
// ==========================================

// --- DashboardStats Component ---
const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; colorClass: string; bgClass: string }> = ({ 
  title, value, icon, colorClass, bgClass
}) => (
  <div className={`rounded-xl shadow-sm p-6 border flex items-center justify-between transition-transform hover:scale-[1.01] ${bgClass}`}>
    <div>
      <p className="text-xs font-bold opacity-60 mb-1 tracking-wider uppercase">{title}</p>
      <h3 className="text-2xl font-black">{value}</h3>
    </div>
    <div className={`p-3 rounded-full bg-white bg-opacity-80 shadow-sm`}>
      {React.isValidElement(icon) 
        ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `w-5 h-5 ${colorClass}` })
        : icon
      }
    </div>
  </div>
);

const DashboardStats: React.FC<{ stats: SummaryStats }> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard 
        title="總銷售額" 
        value={`$${stats.totalSales.toLocaleString()}`} 
        icon={<DollarSign />} 
        colorClass="text-yellow-600"
        bgClass="bg-white border-yellow-200 text-yellow-900"
      />
      <StatCard 
        title="總成本 (依匯率)" 
        value={`$${stats.totalCost.toLocaleString()}`} 
        icon={<CreditCard />} 
        colorClass="text-stone-500"
        bgClass="bg-white border-stone-200 text-stone-700"
      />
      <StatCard 
        title="淨利潤" 
        value={`$${stats.totalProfit.toLocaleString()}`} 
        icon={<HandCoins />} 
        colorClass="text-orange-500"
        bgClass="bg-white border-orange-200 text-orange-900"
      />
      <StatCard 
        title="總售出商品數" 
        value={`${stats.itemCount} 件`} 
        icon={<ShoppingBag />} 
        colorClass="text-amber-500"
        bgClass="bg-white border-amber-100 text-amber-900"
      />
    </div>
  );
};

// --- TransactionForm Component ---
const COUNTRY_CONFIG: Record<Country, { label: string; rate: number; sellingRate: number; currency: string }> = {
  JP: { label: '日本', rate: 0.2, sellingRate: 0.28, currency: '¥' },
  KR: { label: '韓國', rate: 0.02, sellingRate: 0.035, currency: '₩' },
  OTHER: { label: '其他', rate: 1.0, sellingRate: 1.0, currency: '$' },
};

const TransactionForm: React.FC<{ onAddTransaction: (t: Transaction) => void; defaultExchangeRate: number }> = ({ onAddTransaction }) => {
  const [country, setCountry] = useState<Country>('JP');
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    itemName: '',
    quantity: '1',
    costForeign: '',
    exchangeRate: String(COUNTRY_CONFIG['JP'].rate),
    sellingExchangeRate: String(COUNTRY_CONFIG['JP'].sellingRate),
    priceSold: '',
  });

  const handleCountryChange = (newCountry: Country) => {
    setCountry(newCountry);
    const config = COUNTRY_CONFIG[newCountry];
    
    const currentCost = parseFloat(formData.costForeign) || 0;
    const newPriceSold = currentCost > 0 ? String(Math.round(currentCost * config.sellingRate)) : formData.priceSold;

    setFormData(prev => ({
      ...prev,
      exchangeRate: String(config.rate),
      sellingExchangeRate: String(config.sellingRate),
      priceSold: newPriceSold,
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'costForeign' || name === 'sellingExchangeRate') {
        const cost = name === 'costForeign' ? parseFloat(value) : parseFloat(prev.costForeign);
        const sRate = name === 'sellingExchangeRate' ? parseFloat(value) : parseFloat(prev.sellingExchangeRate);
        
        if (!isNaN(cost) && !isNaN(sRate)) {
          updated.priceSold = String(Math.round(cost * sRate));
        } else {
            if (name === 'costForeign' && value === '') {
                 updated.priceSold = '';
            }
        }
      }
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.itemName) return;

    const quantity = parseInt(formData.quantity) || 1;
    const costForeign = parseFloat(formData.costForeign) || 0;
    const exchangeRate = parseFloat(formData.exchangeRate) || 0;
    const sellingExchangeRate = parseFloat(formData.sellingExchangeRate) || 0;
    const priceSold = parseFloat(formData.priceSold) || 0;

    const newTransaction: Transaction = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2),
      country: country,
      customerName: formData.customerName,
      itemName: formData.itemName,
      quantity: quantity,
      costJpy: costForeign,
      exchangeRate: exchangeRate,
      sellingExchangeRate: sellingExchangeRate,
      priceSold: priceSold,
      date: formData.date || new Date().toISOString(),
    };

    onAddTransaction(newTransaction);
    
    setFormData(prev => ({
      ...prev,
      customerName: '',
      itemName: '',
      quantity: '1',
      costForeign: '',
      priceSold: '',
    }));
  };

  const quantity = parseInt(formData.quantity) || 0;
  const costForeign = parseFloat(formData.costForeign) || 0;
  const exchangeRate = parseFloat(formData.exchangeRate) || 0;
  const priceSold = parseFloat(formData.priceSold) || 0;
  const localCostUnit = Math.round(costForeign * exchangeRate);
  const estimatedProfit = (priceSold - localCostUnit) * quantity;
  const profitMargin = priceSold > 0 ? Math.round(((priceSold - localCostUnit) / priceSold) * 100) : 0;
  const currentConfig = COUNTRY_CONFIG[country];

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-yellow-50">
      <div className="flex items-center gap-2 mb-4 text-gray-700">
        <Plus className="w-5 h-5 text-yellow-500" />
        <h2 className="text-lg font-bold">新增銷售紀錄</h2>
      </div>

      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> 交易日期
          </label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-600"
            required
          />
        </div>

        <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" /> 選擇代購國家
            </label>
            <div className="flex gap-2">
            {(Object.keys(COUNTRY_CONFIG) as Country[]).map((c) => (
                <button
                key={c}
                type="button"
                onClick={() => handleCountryChange(c)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all border ${
                    country === c
                    ? 'bg-yellow-100 text-yellow-800 border-yellow-200 shadow-sm'
                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'
                }`}
                >
                {COUNTRY_CONFIG[c].label}
                </button>
            ))}
            </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-x-4 gap-y-5">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">客人名字</label>
          <input
            type="text"
            name="customerName"
            value={formData.customerName}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-700 placeholder-gray-300"
            placeholder="例如: 王小明"
            required
          />
        </div>
        
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">商品名稱</label>
          <input
            type="text"
            name="itemName"
            value={formData.itemName}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-700 placeholder-gray-300"
            placeholder="例如: 合力他命"
            required
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">數量</label>
          <input
            type="number"
            name="quantity"
            min="1"
            value={formData.quantity}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-700"
          />
        </div>

        <div className="lg:col-span-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">當日匯率 (成本)</label>
            <input
              type="number"
              step="0.0001"
              name="exchangeRate"
              value={formData.exchangeRate}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-700 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">賣出匯率 (參考)</label>
            <input
              type="number"
              step="0.0001"
              name="sellingExchangeRate"
              value={formData.sellingExchangeRate}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-500"
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">單件外幣成本 ({currentConfig.label})</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-400 text-xs">{currentConfig.currency}</span>
            <input
              type="number"
              name="costForeign"
              value={formData.costForeign}
              onChange={handleChange}
              className="w-full pl-8 pr-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-700"
              placeholder="0"
            />
          </div>
        </div>

        <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1 text-yellow-700">單件台幣成本 (自動計算)</label>
            <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-xs">$</span>
                <input
                type="text"
                value={localCostUnit}
                readOnly
                className="w-full pl-8 pr-3 py-2 border border-yellow-200 bg-yellow-50/50 rounded-lg text-gray-800 font-bold focus:outline-none"
                />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
                外幣成本 x 當日匯率
            </p>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">單件賣出價格</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-400 text-xs">$</span>
            <input
              type="number"
              name="priceSold"
              value={formData.priceSold}
              onChange={handleChange}
              className="w-full pl-8 pr-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-yellow-100 focus:border-yellow-200 transition-all outline-none bg-gray-50/50 focus:bg-white text-gray-700"
              placeholder="自動計算"
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
             預設：外幣成本 x 賣出匯率
          </p>
        </div>

        <div className="lg:col-span-6 flex items-end mt-2">
          <button
            type="submit"
            className="w-full bg-yellow-200 hover:bg-yellow-300 text-yellow-800 font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 h-[42px] active:transform active:scale-95"
          >
            <Save className="w-5 h-5" />
            記錄交易
          </button>
        </div>
      </form>

      {(costForeign > 0 && priceSold > 0) && (
        <div className={`mt-5 p-3 rounded-lg flex items-center justify-between text-sm ${estimatedProfit >= 0 ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          <div className="flex gap-4">
             <span>單件利潤: <strong>${Math.round(priceSold - localCostUnit)}</strong></span>
             <span>總利潤: <strong>${Math.round(estimatedProfit)}</strong></span>
          </div>
          <span className="font-semibold">利潤率: {profitMargin}%</span>
        </div>
      )}
    </div>
  );
};

// --- TransactionList Component ---
const getCountryLabel = (c: Country | undefined): string => {
  switch (c) {
    case 'JP': return '日本';
    case 'KR': return '韓國';
    case 'OTHER': return '其他';
    default: return '日本';
  }
};

const getCurrencySymbol = (c: Country | undefined): string => {
  switch (c) {
    case 'JP': return '¥';
    case 'KR': return '₩';
    case 'OTHER': return '$';
    default: return '¥';
  }
};

const getCountryColor = (c: Country | undefined): string => {
  switch (c) {
    case 'JP': return 'bg-red-50 text-red-600 border-red-100';
    case 'KR': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'OTHER': return 'bg-gray-50 text-gray-600 border-gray-200';
    default: return 'bg-red-50 text-red-600 border-red-100';
  }
};

const TransactionList: React.FC<{ transactions: Transaction[]; onDelete: (id: string) => void; onClearAll: () => void; onExport: () => void; }> = ({ transactions, onDelete, onClearAll, onExport }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyToClipboard = async () => {
    const headers = ['日期', '國家', '客人名字', '商品名稱', '數量', '外幣成本(單件)', '當日匯率', '賣出匯率', '台幣成本(單件)', '售價(單件)', '總利潤'];
    
    const rows = transactions.slice().reverse().map(t => {
      const localCostUnit = Math.round(t.costJpy * t.exchangeRate);
      const totalProfit = (t.priceSold - localCostUnit) * t.quantity;
      const sellingRate = t.sellingExchangeRate || '-';
      const currency = getCurrencySymbol(t.country);
      
      return [
        new Date(t.date).toLocaleDateString(),
        getCountryLabel(t.country),
        t.customerName,
        t.itemName,
        t.quantity,
        `${currency}${t.costJpy}`,
        t.exchangeRate,
        sellingRate,
        `$${localCostUnit}`,
        `$${t.priceSold}`,
        `$${totalProfit}`
      ].join('\t');
    });

    const textToCopy = [headers.join('\t'), ...rows].join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
      alert('複製失敗，請手動匯出 CSV');
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
        <div className="text-gray-400 mb-2">尚無交易紀錄</div>
        <p className="text-sm text-gray-500">請從上方表單新增您的第一筆代購訂單。</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-[#fbfaf8]">
        <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h3 className="font-bold text-gray-700">交易明細 ({transactions.length})</h3>
                
                <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                        type="button"
                        onClick={handleCopyToClipboard}
                        className={`flex-1 sm:flex-none justify-center sm:justify-start flex items-center gap-2 text-sm px-3 py-1.5 rounded-md transition-all border ${
                        copied 
                            ? 'bg-green-50 text-green-700 border-green-200' 
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? '已複製！' : '複製到 Sheets'}
                    </button>
                    
                    <button 
                        type="button"
                        onClick={onExport}
                        className="flex-1 sm:flex-none justify-center sm:justify-start flex items-center gap-2 text-sm text-yellow-800 bg-yellow-100 hover:bg-yellow-200 px-3 py-1.5 rounded-md transition-colors border border-yellow-200 font-medium"
                    >
                        <Download className="w-4 h-4" />
                        匯出 Excel
                    </button>
                </div>
            </div>

            <div className="flex justify-end pt-1">
                <button 
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onClearAll();
                    }}
                    className="flex items-center gap-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors cursor-pointer"
                    title="清空所有資料"
                >
                    <RotateCcw className="w-3 h-3" />
                    刪除全部
                </button>
            </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#fbfaf8] text-gray-500 text-xs border-b border-gray-100">
              <th className="p-4 font-semibold">日期</th>
              <th className="p-4 font-semibold">國家</th>
              <th className="p-4 font-semibold">客人</th>
              <th className="p-4 font-semibold">商品</th>
              <th className="p-4 font-semibold text-center">數量</th>
              <th className="p-4 font-semibold text-right">外幣(單)</th>
              <th className="p-4 font-semibold text-right">當日匯率</th>
              <th className="p-4 font-semibold text-right">賣出匯率</th>
              <th className="p-4 font-semibold text-right">台幣成本(單)</th>
              <th className="p-4 font-semibold text-right">售價(單)</th>
              <th className="p-4 font-semibold text-right">總利潤</th>
              <th className="p-4 font-semibold text-center">操作</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {transactions.slice().reverse().map((t) => {
              const localCostUnit = Math.round(t.costJpy * t.exchangeRate); 
              const totalProfit = (t.priceSold - localCostUnit) * t.quantity;
              const sellingRate = t.sellingExchangeRate || '-';
              
              const isProfitable = totalProfit >= 0;
              const currency = getCurrencySymbol(t.country);

              return (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-yellow-50/20 transition-colors">
                  <td className="p-4 text-gray-400 whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-medium border ${getCountryColor(t.country)}`}>
                      {getCountryLabel(t.country)}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-gray-600">{t.customerName}</td>
                  <td className="p-4 text-gray-600">{t.itemName}</td>
                  <td className="p-4 text-center text-gray-500">{t.quantity}</td>
                  <td className="p-4 text-right text-gray-400">{currency}{t.costJpy.toLocaleString()}</td>
                  <td className="p-4 text-right text-gray-400">{t.exchangeRate}</td>
                  <td className="p-4 text-right text-gray-400">{sellingRate}</td>
                  <td className="p-4 text-right text-gray-500">${localCostUnit.toLocaleString()}</td>
                  <td className="p-4 text-right font-medium text-gray-700">${t.priceSold.toLocaleString()}</td>
                  <td className={`p-4 text-right font-bold ${isProfitable ? 'text-orange-400' : 'text-red-400'}`}>
                    {totalProfit > 0 ? '+' : ''}{totalProfit.toLocaleString()}
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      type="button"
                      onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onDelete(t.id);
                      }}
                      className="p-2 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all active:scale-95 z-10 relative cursor-pointer"
                      title="刪除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// 4. MAIN APP COMPONENT
// ==========================================

// --- DeleteConfirmModal ---
const DeleteConfirmModal: React.FC<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; isDangerous?: boolean }> = ({ isOpen, title, message, onConfirm, onCancel, isDangerous }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${isDangerous ? 'bg-red-100' : 'bg-yellow-100'}`}>
            <AlertTriangle className={`w-6 h-6 ${isDangerous ? 'text-red-600' : 'text-yellow-600'}`} />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>
        <div className="flex border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onCancel}
            className="flex-1 py-4 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors border-r border-gray-100 active:bg-gray-200"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-4 text-sm font-bold transition-colors active:bg-opacity-90 ${
              isDangerous ? 'text-red-600 hover:bg-red-50' : 'text-yellow-600 hover:bg-yellow-50'
            }`}
          >
            確認刪除
          </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // --- State ---
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('daigou_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load transactions", e);
      return [];
    }
  });
  
  const [defaultRate, setDefaultRate] = useState<number>(() => {
    return parseFloat(localStorage.getItem('daigou_default_rate') || '0.28');
  });

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- Modal State ---
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'single' | 'all' | null;
    targetId?: string;
  }>({ isOpen: false, type: null });

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('daigou_transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('daigou_default_rate', defaultRate.toString());
  }, [defaultRate]);

  // --- Logic Handlers (Executed after confirmation) ---
  const executeDelete = () => {
    if (modalConfig.type === 'single' && modalConfig.targetId) {
      setTransactions(prev => prev.filter(t => String(t.id) !== String(modalConfig.targetId)));
    } else if (modalConfig.type === 'all') {
      setTransactions([]);
    }
    setModalConfig({ isOpen: false, type: null });
  };

  // --- UI Handlers (Triggers modal) ---
  const handleAddTransaction = (newTransaction: Transaction) => {
    setTransactions(prev => [...prev, newTransaction]);
  };

  const handleDeleteTransaction = (id: string) => {
    setModalConfig({
      isOpen: true,
      type: 'single',
      targetId: id
    });
  };

  const handleClearAllTransactions = () => {
    setModalConfig({
      isOpen: true,
      type: 'all'
    });
  };

  const handleExportCSV = () => {
    const headers = ['日期', '國家', '客人名字', '商品名稱', '數量', '外幣成本(單件)', '當日匯率', '賣出匯率', '台幣成本(單件)', '售價', '單件利潤', '總利潤'];
    
    const csvRows = transactions.map(t => {
      const localCostPerUnit = Math.round(t.costJpy * t.exchangeRate);
      const localCostTotal = localCostPerUnit * t.quantity;
      const totalSales = t.priceSold * t.quantity;
      const totalProfit = totalSales - localCostTotal;
      const profitPerUnit = t.priceSold - localCostPerUnit;
      const sellingRate = t.sellingExchangeRate || '';
      
      const countryLabel = t.country === 'KR' ? '韓國' : (t.country === 'OTHER' ? '其他' : '日本');
      const currencySymbol = t.country === 'KR' ? '₩' : (t.country === 'OTHER' ? '$' : '¥');
      
      return [
        new Date(t.date).toLocaleDateString(),
        countryLabel,
        `"${t.customerName}"`,
        `"${t.itemName}"`,
        t.quantity,
        `"${currencySymbol}${t.costJpy}"`,
        t.exchangeRate,
        sellingRate,
        `"$${localCostPerUnit}"`,
        `"$${t.priceSold}"`,
        `"$${profitPerUnit}"`,
        `"$${totalProfit}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `代購銷售紀錄_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAiAnalysis = async () => {
    if (!process.env.API_KEY) {
      alert("請先設定 API Key 才能使用 AI 分析功能。");
      return;
    }
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const result = await analyzeSalesData(transactions);
      setAiAnalysis(result);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Derived State (Stats) ---
  const stats: SummaryStats = useMemo(() => {
    return transactions.reduce((acc, t) => {
      const unitCostTwd = Math.round(t.costJpy * t.exchangeRate);
      const totalCost = unitCostTwd * t.quantity;
      const totalSales = t.priceSold * t.quantity;
      const profit = totalSales - totalCost;

      return {
        totalSales: acc.totalSales + totalSales,
        totalCost: acc.totalCost + totalCost,
        totalProfit: acc.totalProfit + profit,
        itemCount: acc.itemCount + t.quantity,
      };
    }, { totalSales: 0, totalCost: 0, totalProfit: 0, itemCount: 0 });
  }, [transactions]);

  return (
    <div className="min-h-screen pb-20 font-sans bg-[#fdfdf9]">
      {/* Modal */}
      <DeleteConfirmModal 
        isOpen={modalConfig.isOpen}
        title={modalConfig.type === 'all' ? '清空所有資料' : '刪除交易紀錄'}
        message={modalConfig.type === 'all' 
          ? '警告：此動作將「永久刪除」所有交易紀錄，無法復原！\n\n您確定要清空嗎？' 
          : '您確定要刪除這筆交易紀錄嗎？'}
        onConfirm={executeDelete}
        onCancel={() => setModalConfig({ isOpen: false, type: null })}
        isDangerous={true}
      />

      {/* Header */}
      <header className="bg-[#fffef0]/90 backdrop-blur-sm border-b border-yellow-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 relative flex items-center justify-center">
          
          {/* Centered Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-yellow-100 p-2 rounded-full border border-yellow-200">
              <Briefcase className="w-6 h-6 text-yellow-600" />
            </div>
            <h1 className="text-xl font-bold text-yellow-800 tracking-wide">代購管家</h1>
          </div>

          {/* Right-aligned Action */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:block">
             <button
              onClick={handleAiAnalysis}
              disabled={isAnalyzing || transactions.length === 0}
              className="flex items-center gap-2 bg-white hover:bg-yellow-50 text-yellow-800 border border-yellow-200 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-yellow-500" />}
              AI 銷售分析
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Mobile AI Button */}
        <div className="sm:hidden mb-6 flex justify-center">
             <button
              onClick={handleAiAnalysis}
              disabled={isAnalyzing || transactions.length === 0}
              className="w-full flex justify-center items-center gap-2 bg-white text-yellow-900 border border-yellow-200 px-4 py-2 rounded-lg text-sm font-bold shadow-sm"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-yellow-600" />}
              AI 銷售分析
            </button>
        </div>

        {/* Stats Row */}
        <DashboardStats stats={stats} />

        {/* AI Analysis Result */}
        {aiAnalysis && (
          <div className="mb-8 bg-white border border-yellow-100 rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Sparkles className="w-32 h-32 text-yellow-500" />
            </div>
            <h3 className="flex items-center gap-2 text-yellow-800 font-bold mb-3 text-lg">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              智能銷售分析報告
            </h3>
            <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap">
              {aiAnalysis}
            </div>
            <button 
              onClick={() => setAiAnalysis(null)}
              className="mt-4 text-xs text-yellow-600 hover:text-yellow-800 underline font-medium"
            >
              關閉分析
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Form */}
          <div className="lg:col-span-1 space-y-8">
            <TransactionForm 
              onAddTransaction={handleAddTransaction} 
              defaultExchangeRate={defaultRate}
            />
          </div>

          {/* Right Column: List (Chart removed) */}
          <div className="lg:col-span-2 space-y-8">
            <TransactionList 
              transactions={transactions} 
              onDelete={handleDeleteTransaction}
              onClearAll={handleClearAllTransactions}
              onExport={handleExportCSV}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
