import React, { useState, useEffect, useMemo } from 'react';
import { Briefcase, Sparkles, Loader2, AlertTriangle, X } from 'lucide-react';
import { Transaction, SummaryStats } from './types';
import { TransactionForm } from './components/TransactionForm';
import { TransactionList } from './components/TransactionList';
import { DashboardStats } from './components/DashboardStats';
import { analyzeSalesData } from './services/geminiService';

// --- Internal Component: Custom Confirmation Modal ---
interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
}

const DeleteConfirmModal: React.FC<ModalProps> = ({ isOpen, title, message, onConfirm, onCancel, isDangerous }) => {
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

          {/* Right Column: List */}
          <div className="lg:col-span-2">
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