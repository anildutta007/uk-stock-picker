/**
 * UK & Global Stock Picker - Core Application Logic
 * Supports multi-market universe: FTSE 100, FTSE 250, FTSE 350, NASDAQ 100, Dow Jones 30, and NIFTY 50.
 * Dynamic tabs: Trending, Value Gainers, Value Decliners, Volume, Dividends, Guide & Methodology, and Watchlist.
 */

// Application State
const state = {
  market: 'ftse100',          // 'ftse100' | 'ftse250' | 'ftse350' | 'nasdaq' | 'dow' | 'nifty' | 'all'
  tab: 'trending',            // 'trending' | 'gainers' | 'losers' | 'volume' | 'dividends' | 'india' | 'guide' | 'watchlist'
  period: '1d',               // '1d' | '1w' | '1m'
  viewMode: 'cards',          // 'cards' | 'table'
  search: '',
  sector: 'all',
  minGainPct: 2.0,
  maxLossPct: -2.0,
  volumeMetric: 'volume',     // 'volume' | 'turnover' | 'rvol'
  divTimeframe: 'all',
  divMinYield: 0.0,
  stocks: [],
  dividends: [],
  filteredStocks: [],
  filteredDividends: [],
  // Indian Market Hub (16 Indices) State
  indiaIndex: 'nifty50',
  indiaCategory: 'all',
  indiaSubTab: 'trending',
  indiaPeriod: '1d',
  indiaMinGainPct: 2.0,
  indiaMaxLossPct: -2.0,
  indiaSearch: '',
  indiaViewMode: 'cards',
  indiaIndices: [],
  indiaStocks: [],
  watchlist: new Set(JSON.parse(localStorage.getItem('uk_stock_watchlist') || '["SHEL", "AZN", "AAPL", "NVDA", "RELIANCE"]')),
  activeStock: null,
  chartInstance: null,
  debounceTimer: null
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateWatchlistBadge();
  fetchMarketSummary();
  loadData();

  setInterval(fetchMarketSummary, 30000);
});

// ================= THEME HANDLING =================
function initTheme() {
  const isDark = localStorage.getItem('theme') === 'dark' || 
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeIcon();
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
  if (state.activeStock && state.chartInstance) {
    renderModalChart(state.activeStock);
  }
}

function updateThemeIcon() {
  const icon = document.getElementById('themeIcon');
  if (icon) {
    const isDark = document.documentElement.classList.contains('dark');
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

// ================= WATCHLIST LOCALSTORAGE =================
function toggleWatchlist(ticker, event) {
  if (event) event.stopPropagation();
  if (state.watchlist.has(ticker)) {
    state.watchlist.delete(ticker);
  } else {
    state.watchlist.add(ticker);
  }
  localStorage.setItem('uk_stock_watchlist', JSON.stringify(Array.from(state.watchlist)));
  updateWatchlistBadge();
  if (state.tab === 'watchlist') {
    applyFilters();
  } else {
    updateCardWatchlistButtons();
  }
}

function updateWatchlistBadge() {
  const badge = document.getElementById('watchlistCount');
  if (badge) badge.textContent = state.watchlist.size;
}

function updateCardWatchlistButtons() {
  document.querySelectorAll('.watchlist-btn').forEach(btn => {
    const ticker = btn.getAttribute('data-ticker');
    if (ticker) {
      const isStarred = state.watchlist.has(ticker);
      btn.innerHTML = `<i data-lucide="star" class="w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>`;
    }
  });
  lucide.createIcons();
}

// ================= MARKET & TAB SWITCHERS =================
function setMarket(marketName) {
  state.market = marketName;

  // Sync mobile select
  const mobSelect = document.getElementById('mobileMarketSelect');
  if (mobSelect) mobSelect.value = marketName;

  // Highlight desktop buttons
  const marketBtnIds = {
    ftse100: 'btnMarketFtse100',
    ftse250: 'btnMarketFtse250',
    ftse350: 'btnMarketFtse350',
    nasdaq: 'btnMarketNasdaq',
    dow: 'btnMarketDow',
    nifty: 'btnMarketNifty',
    all: 'btnMarketAll'
  };

  Object.keys(marketBtnIds).forEach(m => {
    const btn = document.getElementById(marketBtnIds[m]);
    if (!btn) return;
    if (m === marketName) {
      btn.className = "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 shadow-sm bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap";
    } else {
      btn.className = "px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center space-x-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap";
    }
  });

  fetchMarketSummary();
  if (state.tab !== 'guide') {
    loadData();
  }
}

function setTab(tabName) {
  state.tab = tabName;

  // Update tab button styles
  const tabIds = ['tabTrending', 'tabGainers', 'tabLosers', 'tabVolume', 'tabDividends', 'tabIndia', 'tabGuide', 'tabWatchlist'];
  const tabMap = {
    trending: 'tabTrending',
    gainers: 'tabGainers',
    losers: 'tabLosers',
    volume: 'tabVolume',
    dividends: 'tabDividends',
    india: 'tabIndia',
    guide: 'tabGuide',
    watchlist: 'tabWatchlist'
  };

  tabIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (id === tabMap[tabName]) {
      if (id === 'tabIndia') {
        btn.className = "tab-button flex items-center justify-center space-x-1.5 px-2.5 py-3 rounded-xl text-xs font-bold transition-all bg-amber-600 text-white shadow-md shadow-amber-500/20";
      } else {
        btn.className = "tab-button flex items-center justify-center space-x-1.5 px-2.5 py-3 rounded-xl text-xs font-bold transition-all bg-brand-600 text-white shadow-md shadow-brand-500/20";
      }
    } else {
      if (id === 'tabIndia') {
        btn.className = "tab-button flex items-center justify-center space-x-1.5 px-2.5 py-3 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all border border-amber-200 dark:border-amber-800";
      } else {
        btn.className = "tab-button flex items-center justify-center space-x-1.5 px-2.5 py-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all";
      }
    }
  });

  // Views references
  const indiaView = document.getElementById('indiaView');
  const guideView = document.getElementById('guideView');
  const controlsCard = document.getElementById('controlsCard');
  const dataContainer = document.getElementById('dataContainer');
  const exDivNotice = document.getElementById('exDivNoticeBanner');

  if (tabName === 'india') {
    if (indiaView) indiaView.classList.remove('hidden');
    if (guideView) guideView.classList.add('hidden');
    if (controlsCard) controlsCard.classList.add('hidden');
    if (dataContainer) dataContainer.classList.add('hidden');
    if (exDivNotice) exDivNotice.classList.add('hidden');
    loadIndiaIndices();
    lucide.createIcons();
    return;
  }

  // Not india tab
  if (indiaView) indiaView.classList.add('hidden');

  if (tabName === 'guide') {
    if (guideView) guideView.classList.remove('hidden');
    if (controlsCard) controlsCard.classList.add('hidden');
    if (dataContainer) dataContainer.classList.add('hidden');
    if (exDivNotice) exDivNotice.classList.add('hidden');
    lucide.createIcons();
    return;
  }

  // Not guide tab
  if (guideView) guideView.classList.add('hidden');
  if (controlsCard) controlsCard.classList.remove('hidden');
  if (dataContainer) dataContainer.classList.remove('hidden');

  // Toggle specific control rows
  const gainersBox = document.getElementById('gainersThresholdBox');
  const losersBox = document.getElementById('losersThresholdBox');
  const volBox = document.getElementById('volumeMetricBox');
  const divBox = document.getElementById('dividendControlsBox');
  const timeframeBox = document.getElementById('timeframeSelectorBox');

  if (gainersBox) gainersBox.classList.add('hidden');
  if (losersBox) losersBox.classList.add('hidden');
  if (volBox) volBox.classList.add('hidden');
  if (divBox) divBox.classList.add('hidden');
  if (exDivNotice) exDivNotice.classList.add('hidden');
  if (timeframeBox) timeframeBox.classList.remove('hidden');

  const title = document.getElementById('tabHeaderTitle');
  const subtitle = document.getElementById('tabHeaderSubtitle');

  if (tabName === 'trending') {
    title.textContent = "Trending Stocks & Breakouts";
    subtitle.textContent = "Ranked by unusual relative trading volume, price momentum surges, and technical breakouts";
  } else if (tabName === 'gainers') {
    title.textContent = "Shares Value Increase (Gainers)";
    subtitle.textContent = `Filtered by customizable minimum gain % over ${state.period.toUpperCase()} period`;
    if (gainersBox) gainersBox.classList.remove('hidden');
  } else if (tabName === 'losers') {
    title.textContent = "Shares Value Decline (Dip Finder)";
    subtitle.textContent = `Filtered by customizable drop % over ${state.period.toUpperCase()} period`;
    if (losersBox) losersBox.classList.remove('hidden');
  } else if (tabName === 'volume') {
    title.textContent = "Highest Trading Volume & Liquidity";
    subtitle.textContent = `Top traded global shares by volume, value turnover, and unusual institutional activity`;
    if (volBox) volBox.classList.remove('hidden');
  } else if (tabName === 'dividends') {
    title.textContent = "Upcoming Dividends & Ex-Dividend Cutoff Dates";
    subtitle.textContent = "Key purchase cutoff deadlines, expected dividend payouts, and current yields";
    if (timeframeBox) timeframeBox.classList.add('hidden');
    if (divBox) divBox.classList.remove('hidden');
    if (exDivNotice) exDivNotice.classList.remove('hidden');
  } else if (tabName === 'watchlist') {
    title.textContent = "Personal Watchlist";
    subtitle.textContent = "Your pinned favorite stocks for rapid portfolio monitoring";
  }

  loadData();
}

function setPeriod(p) {
  state.period = p;
  ['1d', '1w', '1m'].forEach(period => {
    const btn = document.getElementById(`btnPeriod${period}`);
    if (!btn) return;
    if (period === p) {
      btn.className = "px-3 py-1 rounded-lg text-xs font-bold transition bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200 dark:border-slate-700";
    } else {
      btn.className = "px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition";
    }
  });

  if (state.tab === 'gainers') {
    document.getElementById('tabHeaderSubtitle').textContent = `Filtered by customizable minimum gain % over ${state.period.toUpperCase()} period`;
  } else if (state.tab === 'losers') {
    document.getElementById('tabHeaderSubtitle').textContent = `Filtered by customizable drop % over ${state.period.toUpperCase()} period`;
  }

  loadData();
}

// ================= THRESHOLD FILTER CONTROLS =================
function updateGainSlider(val) {
  state.minGainPct = parseFloat(val);
  document.getElementById('gainInput').value = parseFloat(val).toFixed(1);
  debounceFilter();
}

function updateGainInput(val) {
  const num = parseFloat(val) || 0;
  state.minGainPct = num;
  document.getElementById('gainSlider').value = Math.min(num, 30);
  debounceFilter();
}

function setGainPreset(pct) {
  state.minGainPct = pct;
  document.getElementById('gainSlider').value = Math.min(pct, 30);
  document.getElementById('gainInput').value = pct.toFixed(1);
  loadData();
}

function updateLossSlider(val) {
  const num = -Math.abs(parseFloat(val));
  state.maxLossPct = num;
  document.getElementById('lossInput').value = num.toFixed(1);
  debounceFilter();
}

function updateLossInput(val) {
  const num = -Math.abs(parseFloat(val) || 0);
  state.maxLossPct = num;
  document.getElementById('lossSlider').value = Math.min(Math.abs(num), 30);
  debounceFilter();
}

function setLossPreset(pct) {
  state.maxLossPct = pct;
  document.getElementById('lossSlider').value = Math.min(Math.abs(pct), 30);
  document.getElementById('lossInput').value = pct.toFixed(1);
  loadData();
}

function setVolumeMetric(metric) {
  state.volumeMetric = metric;
  ['Shares', 'Turnover', 'Rvol'].forEach(m => {
    const btn = document.getElementById(`btnVol${m}`);
    if (!btn) return;
    if (m.toLowerCase() === metric.toLowerCase() || (metric === 'volume' && m === 'Shares')) {
      btn.className = "px-3 py-1 rounded-lg text-xs font-bold transition bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm border border-slate-200 dark:border-slate-700";
    } else {
      btn.className = "px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition";
    }
  });
  loadData();
}

function setDivTimeframe(tf) {
  state.divTimeframe = tf;
  const map = { all: 'btnDivAll', '30d': 'btnDiv30', '60d': 'btnDiv60', '90d': 'btnDiv90' };
  Object.keys(map).forEach(key => {
    const btn = document.getElementById(map[key]);
    if (!btn) return;
    if (key === tf) {
      btn.className = "px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm";
    } else {
      btn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400";
    }
  });
  loadData();
}

function setViewMode(mode) {
  state.viewMode = mode;
  const btnCards = document.getElementById('viewModeCards');
  const btnTable = document.getElementById('viewModeTable');
  const cardGrid = document.getElementById('cardGrid');
  const tableView = document.getElementById('tableView');

  if (mode === 'cards') {
    btnCards.className = "p-1.5 rounded text-xs text-brand-600 dark:text-brand-400 bg-white dark:bg-slate-900 shadow-sm";
    btnTable.className = "p-1.5 rounded text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white";
    cardGrid.classList.remove('hidden');
    tableView.classList.add('hidden');
  } else {
    btnCards.className = "p-1.5 rounded text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white";
    btnTable.className = "p-1.5 rounded text-xs text-brand-600 dark:text-brand-400 bg-white dark:bg-slate-900 shadow-sm";
    cardGrid.classList.add('hidden');
    tableView.classList.remove('hidden');
  }
  renderContent();
}

function debounceFilter() {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    loadData();
  }, 250);
}

function applyFilters() {
  loadData();
}

function resetFilters() {
  state.search = '';
  state.sector = 'all';
  state.minGainPct = 2.0;
  state.maxLossPct = -2.0;
  document.getElementById('searchInput').value = '';
  document.getElementById('sectorSelect').value = 'all';
  document.getElementById('gainSlider').value = 2;
  document.getElementById('gainInput').value = '2.0';
  document.getElementById('lossSlider').value = 2;
  document.getElementById('lossInput').value = '-2.0';
  loadData();
}

// ================= API FETCHING =================
async function fetchMarketSummary() {
  try {
    const res = await fetch(`/api/market-summary?market=${state.market}`);
    if (!res.ok) return;
    const data = await res.json();

    const marketNames = {
      ftse100: 'FTSE 100 Overview:',
      ftse250: 'FTSE 250 Overview:',
      ftse350: 'FTSE 350 Overview:',
      nasdaq: 'NASDAQ 100 Overview:',
      dow: 'Dow Jones 30 Overview:',
      nifty: 'NIFTY 50 (India) Overview:',
      all: 'Global Universe Overview:'
    };
    document.getElementById('summaryMarketName').textContent = marketNames[state.market] || 'Market Overview:';

    const dayAvg = document.getElementById('summaryDayAvg');
    dayAvg.textContent = `${data.avg_change_1d_pct >= 0 ? '+' : ''}${data.avg_change_1d_pct}%`;
    dayAvg.className = `font-mono font-bold ${data.avg_change_1d_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    const wAvg = document.getElementById('summaryWeekAvg');
    wAvg.textContent = `${data.avg_change_1w_pct >= 0 ? '+' : ''}${data.avg_change_1w_pct}%`;
    wAvg.className = `font-mono font-bold ${data.avg_change_1w_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    const mAvg = document.getElementById('summaryMonthAvg');
    mAvg.textContent = `${data.avg_change_1m_pct >= 0 ? '+' : ''}${data.avg_change_1m_pct}%`;
    mAvg.className = `font-mono font-bold ${data.avg_change_1m_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    document.getElementById('summaryAdvancers').textContent = data.advancers || 0;
    document.getElementById('summaryDecliners').textContent = data.decliners || 0;

    const turnoverM = ((data.total_turnover_1d_gbp || 0) / 1000000).toFixed(1);
    const sym = state.market === 'nifty' ? '₹' : (['nasdaq', 'dow'].includes(state.market) ? '$' : '£');
    document.getElementById('summaryTurnover').textContent = `${sym}${turnoverM}M`;
    document.getElementById('summaryYield').textContent = `${data.avg_dividend_yield_pct || 0}%`;

  } catch (e) {
    console.error("Market summary fetch error:", e);
  }
}

async function loadData() {
  if (state.tab === 'guide') return;

  state.search = document.getElementById('searchInput')?.value.trim() || '';
  state.sector = document.getElementById('sectorSelect')?.value || 'all';

  if (state.tab === 'dividends') {
    await loadDividendCalendar();
  } else {
    await loadStocksData();
  }
}

async function loadStocksData() {
  try {
    const params = new URLSearchParams({
      market: state.market,
      tab: state.tab === 'watchlist' ? 'all' : state.tab,
      period: state.period,
      search: state.search,
      sector: state.sector,
      min_gain_pct: state.minGainPct,
      max_loss_pct: state.maxLossPct,
      volume_metric: state.volumeMetric,
      limit: 150
    });

    const res = await fetch(`/api/stocks?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch stock list");
    const json = await res.json();

    let items = json.stocks || [];
    if (state.tab === 'watchlist') {
      items = items.filter(s => state.watchlist.has(s.ticker));
    }

    state.filteredStocks = items;
    document.getElementById('resultCountBadge').textContent = `${items.length} shares`;

    renderContent();
  } catch (err) {
    console.error("Error loading stocks:", err);
  }
}

async function loadDividendCalendar() {
  try {
    const minYield = parseFloat(document.getElementById('divMinYieldSelect')?.value || 0);
    const params = new URLSearchParams({
      market: state.market,
      timeframe: state.divTimeframe,
      search: state.search,
      min_yield: minYield
    });

    const res = await fetch(`/api/dividends?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch dividend calendar");
    const json = await res.json();

    state.filteredDividends = json.calendar || [];
    document.getElementById('resultCountBadge').textContent = `${state.filteredDividends.length} ex-div dates`;

    renderContent();
  } catch (err) {
    console.error("Error loading dividends:", err);
  }
}

// ================= RENDERING ENGINE =================
function renderContent() {
  if (state.tab === 'guide') return;

  const cardGrid = document.getElementById('cardGrid');
  const tableBody = document.getElementById('tableBody');
  const tableHeaderRow = document.getElementById('tableHeaderRow');
  const emptyState = document.getElementById('emptyState');

  const isDivTab = state.tab === 'dividends';
  const items = isDivTab ? state.filteredDividends : state.filteredStocks;

  if (!items || items.length === 0) {
    cardGrid.innerHTML = '';
    tableBody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  if (state.viewMode === 'cards') {
    cardGrid.innerHTML = isDivTab ? renderDividendCards(items) : renderStockCards(items);
  } else {
    tableHeaderRow.innerHTML = isDivTab ? getDividendTableHeaders() : getStockTableHeaders();
    tableBody.innerHTML = isDivTab ? renderDividendTableRows(items) : renderStockTableRows(items);
  }

  lucide.createIcons();
}

// ================= STOCK CARDS RENDERING =================
function renderStockCards(stocks) {
  const p = state.period;
  const pctKey = `change_${p}_pct`;
  const volKey = `volume_${p}`;
  const turnoverKey = `turnover_${p}_gbp`;

  return stocks.map(s => {
    const changePct = s[pctKey] || 0;
    const isUp = changePct >= 0;
    const isStarred = state.watchlist.has(s.ticker);
    const bgBadgeClass = isUp ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';

    const sparklineSvg = generateSparklineSvg(s.sparkline || [], isUp);
    const volFormatted = formatNumber(s[volKey]);
    const turnoverFormatted = formatCurrencyTurnover(s[turnoverKey], s.currency);
    const priceObj = formatPrice(s);

    let trendingBadge = '';
    if (s.trending_reasons && s.trending_reasons.length > 0) {
      trendingBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">${s.trending_reasons[0]}</span>`;
    }

    return `
      <div onclick="openStockModal('${s.ticker}')" class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 hover:border-brand-500/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between">
        
        <!-- Header: Ticker, Name, Star -->
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-1.5 flex-wrap">
              <span class="font-mono font-black text-base text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition">${s.ticker}</span>
              <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">${s.market}</span>
              ${trendingBadge}
            </div>
            <button onclick="toggleWatchlist('${s.ticker}', event)" data-ticker="${s.ticker}" class="watchlist-btn p-1 rounded-lg text-slate-400 hover:text-amber-400 transition">
              <i data-lucide="star" class="w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>
            </button>
          </div>

          <div class="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate mt-0.5" title="${s.name}">${s.name}</div>
          <div class="text-[11px] text-slate-400 dark:text-slate-500 truncate">${s.sector}</div>
        </div>

        <!-- Middle: Price, Returns & Sparkline -->
        <div class="my-3 py-2 border-y border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div class="text-base font-extrabold font-mono text-slate-900 dark:text-white">${priceObj.main}</div>
            <div class="text-[11px] font-mono text-slate-400">${priceObj.sub}</div>
          </div>

          <!-- Sparkline -->
          <div class="w-24 h-8 flex items-center justify-center">
            ${sparklineSvg}
          </div>

          <!-- Selected Period Return Badge -->
          <div class="text-right">
            <div class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-extrabold font-mono border ${bgBadgeClass}">
              <i data-lucide="${isUp ? 'arrow-up' : 'arrow-down'}" class="w-3.5 h-3.5 mr-0.5"></i>
              <span>${isUp ? '+' : ''}${changePct.toFixed(2)}%</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${p.toUpperCase()} return</div>
          </div>
        </div>

        <!-- Comparison Returns Strip: 1D | 1W | 1M -->
        <div class="grid grid-cols-3 gap-1 py-1 px-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-[11px] font-mono text-center mb-3">
          <div>
            <span class="text-[9px] block text-slate-400 uppercase">1 Day</span>
            <span class="font-bold ${s.change_1d_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${s.change_1d_pct >= 0 ? '+' : ''}${s.change_1d_pct.toFixed(1)}%</span>
          </div>
          <div class="border-x border-slate-200/60 dark:border-slate-700/60">
            <span class="text-[9px] block text-slate-400 uppercase">1 Week</span>
            <span class="font-bold ${s.change_1w_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${s.change_1w_pct >= 0 ? '+' : ''}${s.change_1w_pct.toFixed(1)}%</span>
          </div>
          <div>
            <span class="text-[9px] block text-slate-400 uppercase">1 Month</span>
            <span class="font-bold ${s.change_1m_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${s.change_1m_pct >= 0 ? '+' : ''}${s.change_1m_pct.toFixed(1)}%</span>
          </div>
        </div>

        <!-- Footer: Volume & Dividend / RVOL -->
        <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <div class="flex items-center space-x-1 font-mono">
            <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>${volFormatted} (${turnoverFormatted})</span>
          </div>
          <div class="flex items-center space-x-1.5 font-mono">
            ${s.dividend_yield_pct > 0 ? `<span class="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold font-mono">Div ${s.dividend_yield_pct}%</span>` : ''}
            <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">${s.rvol}x vol</span>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

// ================= DIVIDEND CARDS RENDERING =================
function renderDividendCards(divList) {
  return divList.map(d => {
    const isStarred = state.watchlist.has(d.ticker);
    const priceObj = formatPrice(d);
    
    let urgencyClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (d.days_remaining <= 1) {
      urgencyClass = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold animate-pulse";
    } else if (d.days_remaining <= 7) {
      urgencyClass = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold";
    } else if (d.days_remaining <= 30) {
      urgencyClass = "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300";
    }

    const divAmountLabel = d.currency === 'GBp' ? `${d.expected_dividend_pence}p` : `${d.currency_symbol || '$'}${d.expected_dividend_pence}`;

    return `
      <div onclick="openStockModal('${d.ticker}')" class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between">
        
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-1.5 flex-wrap">
              <span class="font-mono font-black text-base text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">${d.ticker}</span>
              <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">${d.market}</span>
            </div>
            <button onclick="toggleWatchlist('${d.ticker}', event)" data-ticker="${d.ticker}" class="watchlist-btn p-1 rounded-lg text-slate-400 hover:text-amber-400 transition">
              <i data-lucide="star" class="w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>
            </button>
          </div>

          <div class="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate mt-0.5">${d.name}</div>
          <div class="text-[11px] text-slate-400 truncate">${d.sector}</div>
        </div>

        <!-- EX-DIVIDEND CUTOFF BOX -->
        <div class="my-3 p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] uppercase tracking-wider font-bold text-indigo-700 dark:text-indigo-300 flex items-center">
              <i data-lucide="calendar" class="w-3 h-3 mr-1 inline"></i>
              Ex-Dividend Date
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] ${urgencyClass}">
              ${d.status_badge}
            </span>
          </div>

          <div class="flex items-baseline justify-between">
            <span class="text-base font-extrabold font-mono text-indigo-950 dark:text-indigo-100">${formatDatePretty(d.ex_dividend_date)}</span>
            <span class="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">Buy by: ${formatDatePretty(d.last_buy_date)}</span>
          </div>
          <div class="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1">
            ⚠️ Must buy before market close on ${formatDatePretty(d.last_buy_date)}
          </div>
        </div>

        <!-- Payout Value & Yield -->
        <div class="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs mb-3">
          <div>
            <span class="text-[10px] text-slate-400 block">Expected Div</span>
            <span class="font-bold font-mono text-slate-900 dark:text-white">${divAmountLabel}</span>
          </div>
          <div class="border-x border-slate-200/60 dark:border-slate-700/60 px-2 text-center">
            <span class="text-[10px] text-slate-400 block">Yield</span>
            <span class="font-bold font-mono text-amber-600 dark:text-amber-400">${d.dividend_yield_pct}%</span>
            <span class="text-[10px] text-slate-400 block">${d.dividend_type}</span>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block">Pay Date</span>
            <span class="font-bold font-mono text-slate-900 dark:text-white">${formatDatePretty(d.payment_date || '-')}</span>
          </div>
        </div>

        <!-- Bottom Action: Quick Calculate -->
        <div class="flex items-center justify-between text-xs pt-1">
          <div class="font-mono text-slate-500 text-[11px]">Price: ${priceObj.main}</div>
          <button onclick="openCalcForStock('${d.ticker}', event)" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition flex items-center space-x-1">
            <i data-lucide="calculator" class="w-3 h-3"></i>
            <span>Calculate Payout</span>
          </button>
        </div>

      </div>
    `;
  }).join('');
}

// ================= TABLE VIEW RENDERING =================
function getStockTableHeaders() {
  const p = state.period.toUpperCase();
  return `
    <th class="py-3 px-4">Stock / Market</th>
    <th class="py-3 px-3">Price</th>
    <th class="py-3 px-3 text-right">${p} Return</th>
    <th class="py-3 px-3 text-center">Trend (30D)</th>
    <th class="py-3 px-3 text-right">1D %</th>
    <th class="py-3 px-3 text-right">1W %</th>
    <th class="py-3 px-3 text-right">1M %</th>
    <th class="py-3 px-3 text-right">${p} Volume</th>
    <th class="py-3 px-3 text-right">${p} Turnover</th>
    <th class="py-3 px-3 text-center">RVOL</th>
    <th class="py-3 px-3 text-right">Yield</th>
    <th class="py-3 px-2 text-center">⭐</th>
  `;
}

function renderStockTableRows(stocks) {
  const p = state.period;
  const pctKey = `change_${p}_pct`;
  const volKey = `volume_${p}`;
  const turnoverKey = `turnover_${p}_gbp`;

  return stocks.map(s => {
    const changePct = s[pctKey] || 0;
    const isUp = changePct >= 0;
    const isStarred = state.watchlist.has(s.ticker);
    const sparklineSvg = generateSparklineSvg(s.sparkline || [], isUp);
    const priceObj = formatPrice(s);

    return `
      <tr onclick="openStockModal('${s.ticker}')" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
        <td class="py-3 px-4">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-slate-900 dark:text-white">${s.ticker}</span>
            <span class="text-[9px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">${s.market}</span>
          </div>
          <div class="text-[11px] text-slate-500 truncate max-w-[140px] font-sans">${s.name}</div>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-900 dark:text-white">${priceObj.main}</div>
          <div class="text-[10px] text-slate-400">${priceObj.sub}</div>
        </td>
        <td class="py-3 px-3 text-right">
          <span class="px-2 py-0.5 rounded font-extrabold ${isUp ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'}">
            ${isUp ? '+' : ''}${changePct.toFixed(2)}%
          </span>
        </td>
        <td class="py-3 px-3 text-center">
          <div class="w-20 h-6 mx-auto">${sparklineSvg}</div>
        </td>
        <td class="py-3 px-3 text-right font-bold ${s.change_1d_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
          ${s.change_1d_pct >= 0 ? '+' : ''}${s.change_1d_pct.toFixed(1)}%
        </td>
        <td class="py-3 px-3 text-right font-bold ${s.change_1w_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
          ${s.change_1w_pct >= 0 ? '+' : ''}${s.change_1w_pct.toFixed(1)}%
        </td>
        <td class="py-3 px-3 text-right font-bold ${s.change_1m_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
          ${s.change_1m_pct >= 0 ? '+' : ''}${s.change_1m_pct.toFixed(1)}%
        </td>
        <td class="py-3 px-3 text-right text-slate-600 dark:text-slate-300 font-mono">
          ${formatNumber(s[volKey])}
        </td>
        <td class="py-3 px-3 text-right text-slate-600 dark:text-slate-300 font-mono">
          ${formatCurrencyTurnover(s[turnoverKey], s.currency)}
        </td>
        <td class="py-3 px-3 text-center">
          <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">${s.rvol}x</span>
        </td>
        <td class="py-3 px-3 text-right text-amber-600 dark:text-amber-400 font-bold">
          ${s.dividend_yield_pct > 0 ? `${s.dividend_yield_pct}%` : '-'}
        </td>
        <td class="py-3 px-2 text-center" onclick="event.stopPropagation()">
          <button onclick="toggleWatchlist('${s.ticker}', event)" class="p-1 text-slate-400 hover:text-amber-400">
            <i data-lucide="star" class="w-3.5 h-3.5 ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function getDividendTableHeaders() {
  return `
    <th class="py-3 px-4">Stock</th>
    <th class="py-3 px-3">Price</th>
    <th class="py-3 px-3">Ex-Dividend Cutoff Date</th>
    <th class="py-3 px-3">Last Day to Buy</th>
    <th class="py-3 px-3 text-right">Expected Div</th>
    <th class="py-3 px-3 text-right">Yield (%)</th>
    <th class="py-3 px-3 text-center">Payment Date</th>
    <th class="py-3 px-3 text-center">Status</th>
    <th class="py-3 px-3 text-center">Calculator</th>
  `;
}

function renderDividendTableRows(divList) {
  return divList.map(d => {
    const priceObj = formatPrice(d);
    const divAmountLabel = d.currency === 'GBp' ? `${d.expected_dividend_pence}p` : `${d.currency_symbol || '$'}${d.expected_dividend_pence}`;

    return `
      <tr onclick="openStockModal('${d.ticker}')" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
        <td class="py-3 px-4">
          <span class="font-bold text-slate-900 dark:text-white">${d.ticker}</span>
          <span class="text-[9px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">${d.market}</span>
          <div class="text-[11px] text-slate-500 truncate max-w-[140px] font-sans">${d.name}</div>
        </td>
        <td class="py-3 px-3 font-mono font-bold">${priceObj.main}</td>
        <td class="py-3 px-3 font-mono font-black text-indigo-700 dark:text-indigo-300">${formatDatePretty(d.ex_dividend_date)}</td>
        <td class="py-3 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">${formatDatePretty(d.last_buy_date)}</td>
        <td class="py-3 px-3 text-right font-mono font-bold">${divAmountLabel}</td>
        <td class="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">${d.dividend_yield_pct}%</td>
        <td class="py-3 px-3 text-center font-mono text-slate-500">${formatDatePretty(d.payment_date || '-')}</td>
        <td class="py-3 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${d.days_remaining <= 1 ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'}">
            ${d.status_badge}
          </span>
        </td>
        <td class="py-3 px-3 text-center" onclick="event.stopPropagation()">
          <button onclick="openCalcForStock('${d.ticker}', event)" class="px-2 py-1 rounded text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition">
            Calculate
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ================= SPARKLINE SVG GENERATOR =================
function generateSparklineSvg(data, isUp) {
  if (!data || data.length < 2) return '';
  const width = 96;
  const height = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const strokeColor = isUp ? '#10b981' : '#f43f5e';

  return `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" class="sparkline-svg">
      <polyline
        fill="none"
        stroke="${strokeColor}"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points}"
      />
    </svg>
  `;
}

// ================= STOCK DEEP-DIVE MODAL & INTELLIGENCE =================
function setModalSection(section) {
  const tabs = ['all', 'moving', 'ratings', 'chart'];
  const pills = {
    all: document.getElementById('modalTabAll'),
    moving: document.getElementById('modalTabMoving'),
    ratings: document.getElementById('modalTabRatings'),
    chart: document.getElementById('modalTabChart')
  };

  const sections = {
    moving: document.getElementById('mSectionMoving'),
    ratings: document.getElementById('mSectionRatings'),
    chart: document.getElementById('mSectionChart')
  };

  tabs.forEach(t => {
    if (pills[t]) {
      if (t === section) {
        pills[t].className = "modal-nav-pill px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 transition flex items-center space-x-1.5 shadow-sm font-bold text-xs";
      } else {
        pills[t].className = "modal-nav-pill px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center space-x-1.5 font-bold text-xs";
      }
    }
  });

  if (section === 'all') {
    if (sections.moving) sections.moving.classList.remove('hidden');
    if (sections.ratings) sections.ratings.classList.remove('hidden');
    if (sections.chart) sections.chart.classList.remove('hidden');
  } else if (section === 'moving') {
    if (sections.moving) sections.moving.classList.remove('hidden');
    if (sections.ratings) sections.ratings.classList.add('hidden');
    if (sections.chart) sections.chart.classList.add('hidden');
  } else if (section === 'ratings') {
    if (sections.moving) sections.moving.classList.add('hidden');
    if (sections.ratings) sections.ratings.classList.remove('hidden');
    if (sections.chart) sections.chart.classList.add('hidden');
  } else if (section === 'chart') {
    if (sections.moving) sections.moving.classList.add('hidden');
    if (sections.ratings) sections.ratings.classList.add('hidden');
    if (sections.chart) sections.chart.classList.remove('hidden');
    if (state.activeStock) renderModalChart(state.activeStock);
  }
}

async function openStockModal(ticker) {
  try {
    const res = await fetch(`/api/stock/${ticker}`);
    if (!res.ok) return;
    const data = await res.json();
    const s = data.stock;
    const div = data.dividend_details;
    state.activeStock = s;

    // Reset view to 'all' intel
    setModalSection('all');

    document.getElementById('mTicker').textContent = s.ticker;
    document.getElementById('mName').textContent = s.name;
    document.getElementById('mMarket').textContent = s.market;
    document.getElementById('mSector').textContent = s.sector;

    const priceObj = formatPrice(s);
    document.getElementById('mPricePence').textContent = priceObj.main;
    document.getElementById('mPriceGbp').textContent = priceObj.sub;

    const m1D = document.getElementById('m1DChange');
    m1D.textContent = `${s.change_1d_pct >= 0 ? '+' : ''}${s.change_1d_pct}%`;
    m1D.className = `text-base font-extrabold font-mono ${s.change_1d_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
    document.getElementById('m1DChangePence').textContent = `${s.change_1d_pence >= 0 ? '+' : ''}${s.change_1d_pence}`;

    const m1W = document.getElementById('m1WChange');
    m1W.textContent = `${s.change_1w_pct >= 0 ? '+' : ''}${s.change_1w_pct}%`;
    m1W.className = `text-base font-extrabold font-mono ${s.change_1w_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    const m1M = document.getElementById('m1MChange');
    m1M.textContent = `${s.change_1m_pct >= 0 ? '+' : ''}${s.change_1m_pct}%`;
    m1M.className = `text-base font-extrabold font-mono ${s.change_1m_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    // 1. Render Price Driver (Why It's Moving Today)
    if (data.price_driver) {
      const drv = data.price_driver;
      document.getElementById('mDriverHeadline').textContent = drv.headline || `${s.ticker} Momentum Analysis`;
      document.getElementById('mDriverSummary').textContent = drv.summary || 'Analyzing real-time order books and institutional flows...';

      const sBadge = document.getElementById('mDriverSentimentBadge');
      if (sBadge) {
        sBadge.textContent = drv.sentiment || 'Momentum Analysis';
        if (drv.badge_color === 'emerald') {
          sBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
        } else if (drv.badge_color === 'rose') {
          sBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800';
        } else if (drv.badge_color === 'amber') {
          sBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
        } else {
          sBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-800';
        }
      }

      const factorsContainer = document.getElementById('mDriverFactors');
      if (factorsContainer) {
        factorsContainer.innerHTML = (drv.key_factors || []).map(f => `
          <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            ${f}
          </span>
        `).join('');
      }
    }

    // 2. Render News List & Bulletins
    const newsList = data.news || [];
    const newsContainer = document.getElementById('mNewsList');
    document.getElementById('mNewsCount').textContent = `${newsList.length} articles`;
    if (newsContainer) {
      if (newsList.length === 0) {
        newsContainer.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No verified articles found for ${s.name}.</div>`;
      } else {
        newsContainer.innerHTML = newsList.map(n => `
          <a href="${n.link}" target="_blank" rel="noopener noreferrer" class="block p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800/80 transition group">
            <div class="flex items-center justify-between text-[11px] mb-1">
              <div class="flex items-center space-x-1.5 font-bold">
                <span class="px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">${n.publisher}</span>
                <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">${n.tag || 'Market'}</span>
              </div>
              <span class="text-slate-400 font-mono text-[10px]">${n.time_ago || 'Recent'}</span>
            </div>
            <div class="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition leading-snug">
              ${n.title}
              <i data-lucide="external-link" class="inline w-3 h-3 ml-1 text-slate-400 group-hover:text-brand-500"></i>
            </div>
            ${n.snippet ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">${n.snippet}</p>` : ''}
          </a>
        `).join('');
      }
    }

    // 3. Render Famous Financial Institutions Ratings (HOLD, BUY, SELL)
    if (data.analyst_ratings) {
      const ar = data.analyst_ratings;
      
      const cBadge = document.getElementById('mConsensusBadge');
      if (cBadge) {
        cBadge.textContent = ar.consensus || 'BUY';
        if (ar.consensus_color === 'emerald') {
          cBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
        } else if (ar.consensus_color === 'amber') {
          cBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
        } else {
          cBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800';
        }
      }

      document.getElementById('mConsensusScore').textContent = ar.consensus_label || `${ar.consensus} (${ar.consensus_score} / 5.0)`;
      document.getElementById('mTotalAnalystsText').textContent = `Based on ${ar.total_analysts || 24} Wall St & City equity research desks`;

      document.getElementById('mTargetPrice').textContent = ar.mean_target_fmt || 'N/A';
      const upsideVal = ar.implied_upside_pct || 0;
      const isUpsidePositive = upsideVal >= 0;
      document.getElementById('mTargetUpside').textContent = `${isUpsidePositive ? '+' : ''}${upsideVal.toFixed(1)}% Implied ${isUpsidePositive ? 'Upside' : 'Downside'}`;
      
      const upBadge = document.getElementById('mTargetUpsideBadge');
      if (upBadge) {
        upBadge.className = `inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-extrabold font-mono mt-0.5 ${isUpsidePositive ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`;
      }

      document.getElementById('mBuyPct').textContent = `${ar.buy_pct}% Buy`;
      document.getElementById('mHoldPct').textContent = `${ar.hold_pct}% Hold`;
      document.getElementById('mSellPct').textContent = `${ar.sell_pct}% Sell`;

      document.getElementById('mBarBuy').style.width = `${ar.buy_pct}%`;
      document.getElementById('mBarHold').style.width = `${ar.hold_pct}%`;
      document.getElementById('mBarSell').style.width = `${ar.sell_pct}%`;

      document.getElementById('mTargetLow').textContent = ar.low_target_fmt || 'N/A';
      document.getElementById('mTargetMean').textContent = ar.mean_target_fmt || 'N/A';
      document.getElementById('mTargetHigh').textContent = ar.high_target_fmt || 'N/A';

      // Feed of Institutional Cards (Goldman Sachs, JPMorgan, Morgan Stanley, Barclays, Citi, UBS, Jefferies)
      const instContainer = document.getElementById('mInstitutionsList');
      if (instContainer) {
        const instList = ar.institutions || [];
        instContainer.innerHTML = instList.map(inst => {
          const rType = inst.rating_type || 'buy';
          let ratingPillClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
          if (rType === 'hold') {
            ratingPillClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
          } else if (rType === 'sell') {
            ratingPillClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
          }

          return `
            <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-xs">
              <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div class="flex items-center space-x-2">
                  <div class="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold text-xs">
                    🏛️
                  </div>
                  <div>
                    <span class="text-xs font-extrabold text-slate-900 dark:text-white">${inst.institution}</span>
                    <span class="text-[10px] text-slate-400 block">${inst.date || 'Recent'}</span>
                  </div>
                </div>

                <div class="flex items-center space-x-2">
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase border ${ratingPillClass}">
                    ${inst.rating}
                  </span>
                  <div class="text-right">
                    <span class="text-xs font-mono font-black text-slate-900 dark:text-white">${inst.target_price}</span>
                    <span class="text-[10px] text-slate-400 block">${inst.action || 'Target'}</span>
                  </div>
                </div>
              </div>

              <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed italic">
                "${inst.analyst_note}"
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 4. Render Chart & 52-Week & Dividend Stats
    document.getElementById('m52Low').textContent = `${s.currency_symbol || ''}${s.low_52_pence}`;
    document.getElementById('m52High').textContent = `${s.currency_symbol || ''}${s.high_52_pence}`;
    const range52 = s.high_52_pence - s.low_52_pence || 1;
    const progress52 = Math.min(Math.max(((s.price_pence - s.low_52_pence) / range52) * 100, 0), 100);
    document.getElementById('m52ProgressBar').style.width = `${progress52}%`;

    const capSym = s.currency === 'INR' ? '₹' : (['USD'].includes(s.currency) ? '$' : '£');
    document.getElementById('mMarketCap').textContent = s.market_cap_gbp ? `${capSym}${(s.market_cap_gbp / 1e9).toFixed(1)}B` : 'N/A';
    document.getElementById('mPE').textContent = s.pe_ratio ? `${s.pe_ratio}x` : 'N/A';
    document.getElementById('mRVOL').textContent = `${s.rvol}x`;
    document.getElementById('mMA50').textContent = `${s.currency_symbol || ''}${s.ma_50}`;

    const divCard = document.getElementById('mDividendCard');
    if (s.dividend_yield_pct > 0 || div) {
      divCard.classList.remove('hidden');
      document.getElementById('mDivYield').textContent = `${s.dividend_yield_pct}% Yield`;
      document.getElementById('mExDivDate').textContent = div ? formatDatePretty(div.ex_dividend_date) : (s.ex_dividend_date ? formatDatePretty(s.ex_dividend_date) : 'Announced');
      const divPerShare = s.currency === 'GBp' ? `${s.expected_dividend_pence}p / share` : `${s.currency_symbol || '$'}${s.expected_dividend_pence} / share`;
      document.getElementById('mDivAmount').textContent = divPerShare;
      document.getElementById('mPayDate').textContent = div && div.payment_date ? formatDatePretty(div.payment_date) : 'Scheduled';
    } else {
      divCard.classList.add('hidden');
    }

    const isStarred = state.watchlist.has(s.ticker);
    document.getElementById('mWatchlistText').textContent = isStarred ? 'Remove from Watchlist' : 'Add to Watchlist';

    renderModalChart(s);
    document.getElementById('stockModal').classList.remove('hidden');
    lucide.createIcons();
  } catch (e) {
    console.error("Stock details error:", e);
  }
}

function closeStockModal() {
  document.getElementById('stockModal').classList.add('hidden');
}

function toggleWatchlistCurrentModal() {
  if (!state.activeStock) return;
  toggleWatchlist(state.activeStock.ticker);
  const isStarred = state.watchlist.has(state.activeStock.ticker);
  document.getElementById('mWatchlistText').textContent = isStarred ? 'Remove from Watchlist' : 'Add to Watchlist';
  lucide.createIcons();
}

function renderModalChart(stock) {
  const ctx = document.getElementById('stockDetailChart');
  if (!ctx) return;
  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  const closes = stock.sparkline || [];
  const labels = closes.map((_, idx) => `Day ${idx + 1}`);
  const isUp = closes[closes.length - 1] >= closes[0];
  const isDark = document.documentElement.classList.contains('dark');

  const strokeColor = isUp ? '#10b981' : '#f43f5e';
  const fillColor = isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';
  const curSymbol = stock.currency_symbol || (stock.currency === 'GBp' ? 'p' : '$');

  state.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `Close Price (${curSymbol})`,
        data: closes,
        borderColor: strokeColor,
        backgroundColor: fillColor,
        fill: true,
        tension: 0.25,
        borderWidth: 2.2,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (ctx) => ` Price: ${stock.currency === 'GBp' ? ctx.parsed.y.toFixed(1) + 'p' : curSymbol + ctx.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          grid: {
            color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
          },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            callback: (v) => stock.currency === 'GBp' ? `${v}p` : `${curSymbol}${v}`
          }
        }
      }
    }
  });
}

// ================= INTERACTIVE DIVIDEND INCOME CALCULATOR =================
function openDividendCalculatorModal() {
  populateCalculatorDropdown();
  recalculateDividend();
  document.getElementById('calculatorModal').classList.remove('hidden');
}

function closeDividendCalculatorModal() {
  document.getElementById('calculatorModal').classList.add('hidden');
}

function openCalcForStock(ticker, event) {
  if (event) event.stopPropagation();
  populateCalculatorDropdown();
  const select = document.getElementById('calcStockSelect');
  if (select) {
    select.value = ticker;
  }
  recalculateDividend();
  document.getElementById('calculatorModal').classList.remove('hidden');
}

function populateCalculatorDropdown() {
  const select = document.getElementById('calcStockSelect');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '';

  const candidates = state.filteredDividends.length > 0 ? state.filteredDividends : state.filteredStocks.filter(s => s.dividend_yield_pct > 0);

  candidates.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.ticker;
    opt.textContent = `${c.ticker} - ${c.name} (${c.dividend_yield_pct}% yield, ex-div ${formatDatePretty(c.ex_dividend_date || '-')})`;
    select.appendChild(opt);
  });

  if (currentVal) select.value = currentVal;
}

function recalculateDividend() {
  const select = document.getElementById('calcStockSelect');
  const input = document.getElementById('calcInvestmentInput');
  const ticker = select?.value;
  const investment = parseFloat(input?.value) || 0;

  const stock = state.filteredStocks.find(s => s.ticker === ticker) || 
                state.filteredDividends.find(d => d.ticker === ticker);

  if (!stock || investment <= 0) return;

  const curSym = stock.currency_symbol || (stock.currency === 'GBp' ? '£' : (stock.currency === 'INR' ? '₹' : '$'));
  document.getElementById('calcCurrencyPrefix').textContent = curSym;
  document.getElementById('calcCurrencyHint').textContent = `in ${stock.currency || 'local'}`;

  const priceMajor = stock.price_gbp || (stock.currency === 'GBp' ? stock.price_pence / 100 : stock.price_pence);
  const shares = Math.floor(investment / priceMajor);
  const divPerShare = stock.currency === 'GBp' ? (stock.expected_dividend_pence || 0) / 100 : (stock.expected_dividend_pence || 0);
  const upcomingCash = shares * divPerShare;
  const annualIncome = investment * ((stock.dividend_yield_pct || 0) / 100);

  document.getElementById('calcSharesCount').textContent = `${formatNumber(shares)} shares`;
  document.getElementById('calcExDivCutoff').textContent = formatDatePretty(stock.ex_dividend_date || 'Upcoming');
  document.getElementById('calcUpcomingPayout').textContent = `${curSym}${upcomingCash.toFixed(2)}`;
  document.getElementById('calcAnnualIncome').textContent = `${curSym}${annualIncome.toFixed(2)} / yr`;
}

// ================= LIVE REFRESH & CSV EXPORT =================
async function refreshData() {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.classList.add('animate-spin');
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    if (res.ok) {
      setTimeout(async () => {
        await fetchMarketSummary();
        await loadData();
        if (icon) icon.classList.remove('animate-spin');
      }, 3500);
    }
  } catch (e) {
    if (icon) icon.classList.remove('animate-spin');
  }
}

function exportCurrentView() {
  const params = new URLSearchParams({
    market: state.market,
    tab: state.tab,
    period: state.period
  });
  window.location.href = `/api/export?${params.toString()}`;
}

// ================= FORMATTING UTILITIES =================
function formatPrice(stock) {
  const cur = stock.currency || 'GBp';
  if (cur === 'GBp') {
    return {
      main: `${stock.price_pence.toFixed(1)}p`,
      sub: `£${stock.price_gbp.toFixed(2)}`
    };
  } else if (cur === 'INR') {
    return {
      main: `₹${stock.price_pence.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`,
      sub: `INR ₹${stock.price_pence.toFixed(1)}`
    };
  } else {
    return {
      main: `$${stock.price_pence.toFixed(2)}`,
      sub: `USD $${stock.price_pence.toFixed(2)}`
    };
  }
}

function formatNumber(num) {
  if (!num && num !== 0) return '0';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return num.toLocaleString();
}

function formatCurrencyTurnover(val, currency) {
  const sym = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : '£');
  if (!val) return `${sym}0`;
  if (currency === 'INR') {
    if (val >= 1e7) return `${sym}${(val / 1e7).toFixed(1)} Cr`;
    if (val >= 1e5) return `${sym}${(val / 1e5).toFixed(1)} L`;
  }
  if (val >= 1e9) return `${sym}${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${sym}${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `${sym}${(val / 1e3).toFixed(0)}k`;
  return `${sym}${Math.round(val).toLocaleString()}`;
}

function formatDatePretty(iso) {
  if (!iso || iso === '-') return '-';
  try {
    const parts = iso.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return iso;
  } catch (e) {
    return iso;
  }
}

// ================= INDIAN MARKET HUB LOGIC (16 INDICES - USER REQUEST) =================

async function loadIndiaIndices() {
  try {
    const res = await fetch('/api/india/indices');
    if (!res.ok) throw new Error("Failed to load India indices");
    const data = await res.json();

    state.indiaIndices = data.indices || [];

    // Overall summary header
    const summary = data.summary || {};
    const totStocks = document.getElementById('indiaTotalStocks');
    if (totStocks) totStocks.textContent = summary.total_stocks || 113;

    const advDec = document.getElementById('indiaAdvDec');
    if (advDec) advDec.textContent = `${summary.advancers || 0} / ${summary.decliners || 0}`;
    
    const dayAvg = document.getElementById('indiaDayAvg');
    if (dayAvg) {
      const avg1d = summary.avg_1d_pct || 0;
      dayAvg.textContent = `${avg1d >= 0 ? '+' : ''}${avg1d.toFixed(2)}%`;
      dayAvg.className = `text-base font-extrabold font-mono ${avg1d >= 0 ? 'text-emerald-300' : 'text-rose-300'}`;
    }

    const totTo = document.getElementById('indiaTotalTurnover');
    if (totTo) {
      const turnoverCr = summary.total_turnover_inr ? (summary.total_turnover_inr / 1e7).toFixed(1) : '0';
      totTo.textContent = `₹${turnoverCr} Cr`;
    }

    renderIndiaIndicesGrid();
    renderActiveIndiaIndexBanner();
    await loadIndiaStocks();
  } catch (err) {
    console.error("Error loading India indices:", err);
  }
}

function setIndiaCategory(cat) {
  state.indiaCategory = cat;
  const cats = ['all', 'headline', 'broad', 'sectoral'];
  cats.forEach(c => {
    const btn = document.getElementById(`catBtn-${c}`);
    if (!btn) return;
    if (c === cat) {
      btn.className = "px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-amber-600 text-white shadow-sm";
    } else {
      btn.className = "px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-700";
    }
  });
  renderIndiaIndicesGrid();
}

function selectIndiaIndex(idxId) {
  state.indiaIndex = idxId;
  renderIndiaIndicesGrid();
  renderActiveIndiaIndexBanner();
  loadIndiaStocks();
}

function renderIndiaIndicesGrid() {
  const container = document.getElementById('indiaIndicesGrid');
  if (!container) return;

  const filtered = state.indiaIndices.filter(idx => {
    if (state.indiaCategory === 'all') return true;
    return idx.category_type === state.indiaCategory;
  });

  container.innerHTML = filtered.map(idx => {
    const isActive = idx.id === state.indiaIndex;
    const isUp = (idx.avg_1d_pct || 0) >= 0;
    const returnColor = isUp ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/40' : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-800/40';
    const turnoverCr = idx.total_turnover_inr ? (idx.total_turnover_inr / 1e7).toFixed(1) : '0';

    const activeRing = isActive
      ? 'border-amber-500 ring-2 ring-amber-500/40 bg-amber-50/50 dark:bg-amber-950/25 shadow-md'
      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-400/50 hover:shadow-sm';

    return `
      <div onclick="selectIndiaIndex('${idx.id}')" class="rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${activeRing}">
        <div>
          <div class="flex items-center justify-between gap-1 mb-1.5">
            <div class="flex items-center space-x-1 flex-wrap">
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">${idx.exchange}</span>
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">${idx.category_label}</span>
            </div>
            ${isActive ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white">ACTIVE</span>' : ''}
          </div>
          <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-snug line-clamp-1" title="${idx.name}">${idx.name}</h4>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-normal">${idx.description}</p>
        </div>

        <div class="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[11px] font-bold text-slate-600 dark:text-slate-300 font-mono">${idx.stock_count} stocks</span>
            <span class="text-xs font-mono font-black px-2 py-0.5 rounded-lg border ${returnColor}">
              ${isUp ? '+' : ''}${(idx.avg_1d_pct || 0).toFixed(2)}%
            </span>
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Adv/Dec: <strong class="text-slate-700 dark:text-slate-300">${idx.advancers || 0}/${idx.decliners || 0}</strong></span>
            <span>Turnover: <strong class="text-slate-700 dark:text-slate-300">₹${turnoverCr} Cr</strong></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderActiveIndiaIndexBanner() {
  const active = state.indiaIndices.find(i => i.id === state.indiaIndex);
  if (!active) return;

  const nameEl = document.getElementById('aiName');
  if (nameEl) nameEl.textContent = active.name;

  const catEl = document.getElementById('aiCategory');
  if (catEl) catEl.textContent = active.category_label || 'Benchmark';

  const exchEl = document.getElementById('aiExchange');
  if (exchEl) exchEl.textContent = active.exchange || 'NSE';

  const idEl = document.getElementById('aiId');
  if (idEl) idEl.textContent = `Index: ${active.id}`;

  const descEl = document.getElementById('aiDescription');
  if (descEl) descEl.textContent = active.description || '';

  const ret1d = document.getElementById('aiReturn1D');
  if (ret1d) {
    const isUp = (active.avg_1d_pct || 0) >= 0;
    ret1d.textContent = `${isUp ? '+' : ''}${(active.avg_1d_pct || 0).toFixed(2)}%`;
    ret1d.className = `text-sm font-extrabold font-mono px-2.5 py-1 rounded-xl ${isUp ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'}`;
  }

  const countEl = document.getElementById('aiCount');
  if (countEl) countEl.textContent = active.stock_count || 0;

  const advDecEl = document.getElementById('aiAdvDec');
  if (advDecEl) advDecEl.textContent = `${active.advancers || 0} / ${active.decliners || 0}`;

  const ret1w = document.getElementById('aiReturn1W');
  if (ret1w) {
    const isUpW = (active.avg_1w_pct || 0) >= 0;
    ret1w.textContent = `${isUpW ? '+' : ''}${(active.avg_1w_pct || 0).toFixed(2)}%`;
    ret1w.className = `text-sm font-black font-mono ${isUpW ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
  }

  const ret1m = document.getElementById('aiReturn1M');
  if (ret1m) {
    const isUpM = (active.avg_1m_pct || 0) >= 0;
    ret1m.textContent = `${isUpM ? '+' : ''}${(active.avg_1m_pct || 0).toFixed(2)}%`;
    ret1m.className = `text-sm font-black font-mono ${isUpM ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
  }

  // Leaders
  const tg = document.getElementById('aiTopGainer');
  if (tg) {
    if (active.top_gainer) {
      tg.textContent = `${active.top_gainer.ticker} (+${(active.top_gainer.change_1d_pct || 0).toFixed(2)}%)`;
      tg.setAttribute('data-ticker', active.top_gainer.ticker);
    } else {
      tg.textContent = 'None';
      tg.removeAttribute('data-ticker');
    }
  }

  const tl = document.getElementById('aiTopLoser');
  if (tl) {
    if (active.top_loser) {
      tl.textContent = `${active.top_loser.ticker} (${(active.top_loser.change_1d_pct || 0).toFixed(2)}%)`;
      tl.setAttribute('data-ticker', active.top_loser.ticker);
    } else {
      tl.textContent = 'None';
      tl.removeAttribute('data-ticker');
    }
  }

  const ma = document.getElementById('aiMostActive');
  if (ma) {
    if (active.most_active) {
      const toCr = active.most_active.turnover_1d_gbp ? (active.most_active.turnover_1d_gbp / 1e7).toFixed(1) : '0';
      ma.textContent = `${active.most_active.ticker} (₹${toCr} Cr)`;
      ma.setAttribute('data-ticker', active.most_active.ticker);
    } else {
      ma.textContent = 'None';
      ma.removeAttribute('data-ticker');
    }
  }
}

function openStockModalFromText(el) {
  const ticker = el.getAttribute('data-ticker');
  if (ticker) openStockModal(ticker);
}

function setIndiaSubTab(subTab) {
  state.indiaSubTab = subTab;
  const subTabs = ['trending', 'gainers', 'losers', 'volume', 'dividends'];
  subTabs.forEach(st => {
    const btn = document.getElementById(`indiaSub${st.charAt(0).toUpperCase() + st.slice(1)}`);
    if (!btn) return;
    if (st === subTab) {
      btn.className = "px-3 py-1.5 rounded-xl bg-amber-600 text-white shadow-sm flex items-center space-x-1 whitespace-nowrap font-bold";
    } else {
      btn.className = "px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center space-x-1 whitespace-nowrap font-bold";
    }
  });

  const gainBox = document.getElementById('indiaGainersBox');
  const lossBox = document.getElementById('indiaLosersBox');
  const timeBox = document.getElementById('indiaTimeframeBox');

  if (gainBox) gainBox.classList.toggle('hidden', subTab !== 'gainers');
  if (lossBox) lossBox.classList.toggle('hidden', subTab !== 'losers');
  if (timeBox) timeBox.classList.toggle('hidden', subTab === 'dividends');

  loadIndiaStocks();
}

function setIndiaPeriod(p) {
  state.indiaPeriod = p;
  ['1d', '1w', '1m'].forEach(period => {
    const btn = document.getElementById(`btnIndiaPeriod${period}`);
    if (!btn) return;
    if (period === p) {
      btn.className = "px-2.5 py-1 rounded-lg font-bold bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm";
    } else {
      btn.className = "px-2.5 py-1 rounded-lg font-semibold text-slate-600 dark:text-slate-400";
    }
  });
  loadIndiaStocks();
}

function updateIndiaGainSlider(val) {
  state.indiaMinGainPct = parseFloat(val) || 0;
  const inp = document.getElementById('indiaGainInput');
  if (inp) inp.value = state.indiaMinGainPct.toFixed(1);
  debounceIndiaFilter();
}

function updateIndiaGainInput(val) {
  state.indiaMinGainPct = parseFloat(val) || 0;
  const slider = document.getElementById('indiaGainSlider');
  if (slider) slider.value = Math.min(state.indiaMinGainPct, 30);
  debounceIndiaFilter();
}

function setIndiaGainPreset(pct) {
  state.indiaMinGainPct = pct;
  const slider = document.getElementById('indiaGainSlider');
  if (slider) slider.value = Math.min(pct, 30);
  const inp = document.getElementById('indiaGainInput');
  if (inp) inp.value = pct.toFixed(1);
  loadIndiaStocks();
}

function updateIndiaLossSlider(val) {
  const num = -Math.abs(parseFloat(val) || 0);
  state.indiaMaxLossPct = num;
  const inp = document.getElementById('indiaLossInput');
  if (inp) inp.value = num.toFixed(1);
  debounceIndiaFilter();
}

function updateIndiaLossInput(val) {
  const num = -Math.abs(parseFloat(val) || 0);
  state.indiaMaxLossPct = num;
  const slider = document.getElementById('indiaLossSlider');
  if (slider) slider.value = Math.min(Math.abs(num), 30);
  debounceIndiaFilter();
}

function setIndiaLossPreset(pct) {
  state.indiaMaxLossPct = pct;
  const slider = document.getElementById('indiaLossSlider');
  if (slider) slider.value = Math.min(Math.abs(pct), 30);
  const inp = document.getElementById('indiaLossInput');
  if (inp) inp.value = pct.toFixed(1);
  loadIndiaStocks();
}

function debounceIndiaFilter() {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    loadIndiaStocks();
  }, 250);
}

function setIndiaViewMode(mode) {
  state.indiaViewMode = mode;
  const btnCards = document.getElementById('indiaViewCards');
  const btnTable = document.getElementById('indiaViewTable');
  const cardGrid = document.getElementById('indiaCardGrid');
  const tableView = document.getElementById('indiaTableView');

  if (mode === 'cards') {
    if (btnCards) btnCards.className = "p-1 rounded text-xs text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-900 shadow-sm";
    if (btnTable) btnTable.className = "p-1 rounded text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white";
    if (cardGrid) cardGrid.classList.remove('hidden');
    if (tableView) tableView.classList.add('hidden');
  } else {
    if (btnCards) btnCards.className = "p-1 rounded text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white";
    if (btnTable) btnTable.className = "p-1 rounded text-xs text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-900 shadow-sm";
    if (cardGrid) cardGrid.classList.add('hidden');
    if (tableView) tableView.classList.remove('hidden');
  }
  renderIndiaStocksContent();
}

async function loadIndiaStocks() {
  try {
    state.indiaSearch = document.getElementById('indiaSearchInput')?.value.trim() || '';

    const params = new URLSearchParams({
      market: 'india',
      index: state.indiaIndex,
      tab: state.indiaSubTab === 'dividends' ? 'all' : state.indiaSubTab,
      period: state.indiaPeriod,
      search: state.indiaSearch,
      min_gain_pct: state.indiaMinGainPct,
      max_loss_pct: state.indiaMaxLossPct,
      volume_metric: 'volume',
      limit: 150
    });

    const res = await fetch(`/api/india/stocks?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load India stocks");
    const data = await res.json();

    let items = data.stocks || [];
    if (state.indiaSubTab === 'dividends') {
      items = items.filter(s => (s.dividend_yield_pct || 0) > 0);
      items.sort((a, b) => (b.dividend_yield_pct || 0) - (a.dividend_yield_pct || 0));
    }

    state.indiaStocks = items;

    const active = state.indiaIndices.find(i => i.id === state.indiaIndex);
    const indexName = active ? active.name : state.indiaIndex.toUpperCase();
    const badge = document.getElementById('indiaConstituentBadge');
    if (badge) {
      badge.textContent = `Showing ${items.length} stocks in ${indexName}`;
    }

    renderIndiaStocksContent();
  } catch (err) {
    console.error("Error loading India stocks:", err);
  }
}

function renderIndiaStocksContent() {
  const cardGrid = document.getElementById('indiaCardGrid');
  const tableBody = document.getElementById('indiaTableBody');
  const emptyState = document.getElementById('indiaEmptyState');
  const items = state.indiaStocks;

  if (items.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (cardGrid) cardGrid.innerHTML = '';
    if (tableBody) tableBody.innerHTML = '';
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  if (state.indiaViewMode === 'cards') {
    if (cardGrid) cardGrid.innerHTML = renderIndiaStockCards(items);
  } else {
    if (tableBody) tableBody.innerHTML = renderIndiaStockTableRows(items);
  }

  lucide.createIcons();
}

function renderIndiaStockCards(stocks) {
  const p = state.indiaPeriod;
  const pctKey = `change_${p}_pct`;
  const volKey = `volume_${p}`;
  const turnoverKey = `turnover_${p}_gbp`;

  return stocks.map(s => {
    const changePct = s[pctKey] || 0;
    const isUp = changePct >= 0;
    const isStarred = state.watchlist.has(s.ticker);
    const bgBadgeClass = isUp ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';

    const sparklineSvg = generateSparklineSvg(s.sparkline || [], isUp);
    const volFormatted = formatNumber(s[volKey]);
    const turnoverFormatted = formatCurrencyTurnover(s[turnoverKey], 'INR');
    const priceFormatted = `₹${(s.price_pence || 0).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;

    const indicesBadges = (s.indices || []).slice(0, 3).map(idx => 
      `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50">${idx.toUpperCase()}</span>`
    ).join(' ');

    let ratingBadge = '';
    if (s.analyst_ratings) {
      const consensus = s.analyst_ratings.consensus_label || 'BUY';
      const color = consensus.includes('BUY') ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : (consensus.includes('SELL') ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40' : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40');
      ratingBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${color}">${consensus}</span>`;
    }

    return `
      <div onclick="openStockModal('${s.ticker}')" class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between">
        
        <!-- Header -->
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-1.5 flex-wrap">
              <span class="font-mono font-black text-base text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">${s.ticker}</span>
              <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">NSE/BSE</span>
              ${ratingBadge}
            </div>
            <button onclick="toggleWatchlist('${s.ticker}', event)" data-ticker="${s.ticker}" class="watchlist-btn p-1 rounded-lg text-slate-400 hover:text-amber-400 transition">
              <i data-lucide="star" class="w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>
            </button>
          </div>

          <div class="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate mt-0.5" title="${s.name}">${s.name}</div>
          <div class="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            <span class="truncate">${s.sector}</span>
            <div class="flex items-center space-x-1">${indicesBadges}</div>
          </div>
        </div>

        <!-- Price & Sparkline -->
        <div class="my-3 py-2 border-y border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div class="text-base font-extrabold font-mono text-slate-900 dark:text-white">${priceFormatted}</div>
            <div class="text-[11px] font-mono text-slate-400">P/E: ${s.pe_ratio || '-'} • 52W: ₹${s.low_52w_pence || 0} - ₹${s.high_52w_pence || 0}</div>
          </div>

          <div class="w-24 h-8 flex items-center justify-center">
            ${sparklineSvg}
          </div>

          <div class="text-right">
            <div class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-extrabold font-mono border ${bgBadgeClass}">
              <i data-lucide="${isUp ? 'arrow-up' : 'arrow-down'}" class="w-3.5 h-3.5 mr-0.5"></i>
              <span>${isUp ? '+' : ''}${changePct.toFixed(2)}%</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${p.toUpperCase()} return</div>
          </div>
        </div>

        <!-- 1D | 1W | 1M Multi-Period Strip -->
        <div class="grid grid-cols-3 gap-1 py-1 px-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-[11px] font-mono text-center mb-3">
          <div>
            <span class="text-[9px] block text-slate-400 uppercase">1 Day</span>
            <span class="font-bold ${s.change_1d_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${s.change_1d_pct >= 0 ? '+' : ''}${s.change_1d_pct.toFixed(1)}%</span>
          </div>
          <div class="border-x border-slate-200/60 dark:border-slate-700/60">
            <span class="text-[9px] block text-slate-400 uppercase">1 Week</span>
            <span class="font-bold ${s.change_1w_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${s.change_1w_pct >= 0 ? '+' : ''}${s.change_1w_pct.toFixed(1)}%</span>
          </div>
          <div>
            <span class="text-[9px] block text-slate-400 uppercase">1 Month</span>
            <span class="font-bold ${s.change_1m_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${s.change_1m_pct >= 0 ? '+' : ''}${s.change_1m_pct.toFixed(1)}%</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <div class="flex items-center space-x-1 font-mono">
            <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>${volFormatted} (${turnoverFormatted})</span>
          </div>
          <div class="flex items-center space-x-1.5 font-mono">
            ${s.dividend_yield_pct > 0 ? `<span class="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold font-mono">Div ${s.dividend_yield_pct}%</span>` : ''}
            <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">${s.rvol}x</span>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

function renderIndiaStockTableRows(stocks) {
  const p = state.indiaPeriod;
  const turnoverKey = `turnover_${p}_gbp`;

  return stocks.map(s => {
    const priceFormatted = `₹${(s.price_pence || 0).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
    const turnoverFormatted = formatCurrencyTurnover(s[turnoverKey], 'INR');

    const indicesBadges = (s.indices || []).slice(0, 3).map(idx => 
      `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">${idx.toUpperCase()}</span>`
    ).join(' ');

    const consensus = s.analyst_ratings ? s.analyst_ratings.consensus_label : 'BUY';
    const topInst = s.analyst_ratings && s.analyst_ratings.institutions && s.analyst_ratings.institutions[0] ? s.analyst_ratings.institutions[0].institution : 'Goldman Sachs';

    return `
      <tr onclick="openStockModal('${s.ticker}')" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
        <td class="py-3 px-3">
          <div class="flex items-center space-x-1.5">
            <span class="font-bold text-slate-900 dark:text-white">${s.ticker}</span>
            <span class="text-[9px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">NSE</span>
          </div>
          <div class="text-[11px] text-slate-500 truncate max-w-[150px] font-sans">${s.name}</div>
        </td>
        <td class="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">${priceFormatted}</td>
        <td class="py-3 px-3 font-mono font-bold ${s.change_1d_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
          ${s.change_1d_pct >= 0 ? '+' : ''}${s.change_1d_pct.toFixed(2)}%
        </td>
        <td class="py-3 px-3 font-mono font-bold ${s.change_1w_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
          ${s.change_1w_pct >= 0 ? '+' : ''}${s.change_1w_pct.toFixed(1)}%
        </td>
        <td class="py-3 px-3 font-mono font-bold ${s.change_1m_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
          ${s.change_1m_pct >= 0 ? '+' : ''}${s.change_1m_pct.toFixed(1)}%
        </td>
        <td class="py-3 px-3 font-mono text-slate-700 dark:text-slate-300 font-bold">${turnoverFormatted}</td>
        <td class="py-3 px-3 font-sans">
          <div class="flex items-center space-x-1">${indicesBadges}</div>
        </td>
        <td class="py-3 px-3 font-sans">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">${consensus}</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">${topInst}</span>
        </td>
      </tr>
    `;
  }).join('');
}
