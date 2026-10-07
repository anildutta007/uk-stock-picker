/**
 * UK Stock Picker - Core Application Logic
 * Supports FTSE 100 & FTSE 250 markets, customizable % gainers/losers thresholds over 1D/1W/1M,
 * trading volume metrics, trending algorithms, and upcoming dividend calendars.
 */

// Application State
const state = {
  market: 'ftse100',          // 'ftse100' | 'ftse250' | 'all'
  tab: 'trending',            // 'trending' | 'gainers' | 'losers' | 'volume' | 'dividends' | 'watchlist'
  period: '1d',               // '1d' | '1w' | '1m'
  viewMode: 'cards',          // 'cards' | 'table'
  search: '',
  sector: 'all',
  // Gainers / Losers Thresholds (Requirements 2 & 3)
  minGainPct: 2.0,
  maxLossPct: -2.0,
  // Volume Metric (Requirement 4)
  volumeMetric: 'volume',     // 'volume' | 'turnover' | 'rvol'
  // Dividend Filters (Requirement 5)
  divTimeframe: 'all',
  divMinYield: 0.0,
  // Data caches
  stocks: [],
  dividends: [],
  filteredStocks: [],
  filteredDividends: [],
  watchlist: new Set(JSON.parse(localStorage.getItem('uk_stock_watchlist') || '["SHEL", "AZN", "BATS", "BA"]')),
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

  // Periodically update summary
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
  
  // Highlight active button
  ['ftse100', 'ftse250', 'all'].forEach(m => {
    const btn = document.getElementById(`btnMarket${m.charAt(0).toUpperCase() + m.slice(1)}`);
    if (!btn) return;
    if (m === marketName) {
      btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shadow-sm bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 border border-slate-200 dark:border-slate-700";
    } else {
      btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all flex items-center space-x-1.5";
    }
  });

  fetchMarketSummary();
  loadData();
}

function setTab(tabName) {
  state.tab = tabName;

  // Update tab button styles
  const tabIds = ['tabTrending', 'tabGainers', 'tabLosers', 'tabVolume', 'tabDividends', 'tabWatchlist'];
  const tabMap = {
    trending: 'tabTrending',
    gainers: 'tabGainers',
    losers: 'tabLosers',
    volume: 'tabVolume',
    dividends: 'tabDividends',
    watchlist: 'tabWatchlist'
  };

  tabIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (id === tabMap[tabName]) {
      btn.className = "tab-button flex items-center justify-center space-x-2 px-3 py-3 rounded-xl text-xs font-bold transition-all bg-brand-600 text-white shadow-md shadow-brand-500/20";
    } else {
      btn.className = "tab-button flex items-center justify-center space-x-2 px-3 py-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all";
    }
  });

  // Toggle specific control rows
  const gainersBox = document.getElementById('gainersThresholdBox');
  const losersBox = document.getElementById('losersThresholdBox');
  const volBox = document.getElementById('volumeMetricBox');
  const divBox = document.getElementById('dividendControlsBox');
  const timeframeBox = document.getElementById('timeframeSelectorBox');
  const exDivNotice = document.getElementById('exDivNoticeBanner');

  if (gainersBox) gainersBox.classList.add('hidden');
  if (losersBox) losersBox.classList.add('hidden');
  if (volBox) volBox.classList.add('hidden');
  if (divBox) divBox.classList.add('hidden');
  if (exDivNotice) exDivNotice.classList.add('hidden');
  if (timeframeBox) timeframeBox.classList.remove('hidden');

  const title = document.getElementById('tabHeaderTitle');
  const subtitle = document.getElementById('tabHeaderSubtitle');

  if (tabName === 'trending') {
    title.textContent = "Trending UK Stocks";
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
    subtitle.textContent = `Top traded UK stocks by shares, value turnover (£), and unusual volume surges`;
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

  // Update subtitle text if in Gainers/Losers
  if (state.tab === 'gainers') {
    document.getElementById('tabHeaderSubtitle').textContent = `Filtered by customizable minimum gain % over ${state.period.toUpperCase()} period`;
  } else if (state.tab === 'losers') {
    document.getElementById('tabHeaderSubtitle').textContent = `Filtered by customizable drop % over ${state.period.toUpperCase()} period`;
  }

  loadData();
}

// ================= THRESHOLD FILTER CONTROLS =================
// Gainers
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

// Losers
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

// Volume Metric
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

// Dividend Timeframe
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

// View Mode (Cards vs Table)
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

// Search debounce
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

    const mName = state.market === 'ftse100' ? 'FTSE 100 Overview:' : (state.market === 'ftse250' ? 'FTSE 250 Overview:' : 'UK 350 Universe:');
    document.getElementById('summaryMarketName').textContent = mName;

    // Day Avg
    const dayAvg = document.getElementById('summaryDayAvg');
    dayAvg.textContent = `${data.avg_change_1d_pct >= 0 ? '+' : ''}${data.avg_change_1d_pct}%`;
    dayAvg.className = `font-mono font-bold ${data.avg_change_1d_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    // 1W & 1M Avg
    const wAvg = document.getElementById('summaryWeekAvg');
    wAvg.textContent = `${data.avg_change_1w_pct >= 0 ? '+' : ''}${data.avg_change_1w_pct}%`;
    wAvg.className = `font-mono font-bold ${data.avg_change_1w_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    const mAvg = document.getElementById('summaryMonthAvg');
    mAvg.textContent = `${data.avg_change_1m_pct >= 0 ? '+' : ''}${data.avg_change_1m_pct}%`;
    mAvg.className = `font-mono font-bold ${data.avg_change_1m_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    // Advancers / Decliners
    document.getElementById('summaryAdvancers').textContent = data.advancers || 0;
    document.getElementById('summaryDecliners').textContent = data.decliners || 0;

    // Turnover & Yield
    const turnoverM = ((data.total_turnover_1d_gbp || 0) / 1000000).toFixed(1);
    document.getElementById('summaryTurnover').textContent = `£${turnoverM}M`;
    document.getElementById('summaryYield').textContent = `${data.avg_dividend_yield_pct || 0}%`;

  } catch (e) {
    console.error("Market summary fetch error:", e);
  }
}

async function loadData() {
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
    const colorClass = isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const bgBadgeClass = isUp ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';

    const sparklineSvg = generateSparklineSvg(s.sparkline || [], isUp);
    const volFormatted = formatNumber(s[volKey]);
    const turnoverFormatted = formatTurnover(s[turnoverKey]);

    // Trending pill
    let trendingBadge = '';
    if (s.trending_reasons && s.trending_reasons.length > 0) {
      trendingBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">${s.trending_reasons[0]}</span>`;
    }

    return `
      <div onclick="openStockModal('${s.ticker}')" class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 hover:border-brand-500/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between">
        
        <!-- Header: Ticker, Name, Star -->
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-2">
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
            <div class="text-base font-extrabold font-mono text-slate-900 dark:text-white">${s.price_pence.toFixed(1)}p</div>
            <div class="text-[11px] font-mono text-slate-400">£${s.price_gbp.toFixed(2)}</div>
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
    const sparklineSvg = generateSparklineSvg(d.sparkline || [], true);
    
    // Status urgency color
    let urgencyClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (d.days_remaining <= 1) {
      urgencyClass = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold animate-pulse";
    } else if (d.days_remaining <= 7) {
      urgencyClass = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold";
    } else if (d.days_remaining <= 30) {
      urgencyClass = "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300";
    }

    return `
      <div onclick="openStockModal('${d.ticker}')" class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between">
        
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-2">
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

        <!-- EX-DIVIDEND CUTOFF BOX (KEY REQUIREMENT 5) -->
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

          <!-- Highlight Date & Last Day to Buy -->
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
            <span class="font-bold font-mono text-slate-900 dark:text-white">${d.expected_dividend_pence}p</span>
            <span class="text-[10px] text-slate-400 block font-mono">£${d.expected_dividend_gbp}</span>
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
          <div class="font-mono text-slate-500 text-[11px]">Price: ${d.price_pence}p</div>
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
    const colorClass = isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const sparklineSvg = generateSparklineSvg(s.sparkline || [], isUp);

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
          <div class="font-bold text-slate-900 dark:text-white">${s.price_pence.toFixed(1)}p</div>
          <div class="text-[10px] text-slate-400">£${s.price_gbp.toFixed(2)}</div>
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
          ${formatTurnover(s[turnoverKey])}
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
    return `
      <tr onclick="openStockModal('${d.ticker}')" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
        <td class="py-3 px-4">
          <span class="font-bold text-slate-900 dark:text-white">${d.ticker}</span>
          <span class="text-[9px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">${d.market}</span>
          <div class="text-[11px] text-slate-500 truncate max-w-[140px] font-sans">${d.name}</div>
        </td>
        <td class="py-3 px-3 font-mono font-bold">${d.price_pence}p</td>
        <td class="py-3 px-3 font-mono font-black text-indigo-700 dark:text-indigo-300">${formatDatePretty(d.ex_dividend_date)}</td>
        <td class="py-3 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">${formatDatePretty(d.last_buy_date)}</td>
        <td class="py-3 px-3 text-right font-mono font-bold">${d.expected_dividend_pence}p</td>
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

// ================= STOCK DEEP-DIVE MODAL & CHART =================
async function openStockModal(ticker) {
  try {
    const res = await fetch(`/api/stock/${ticker}`);
    if (!res.ok) return;
    const data = await res.json();
    const s = data.stock;
    const div = data.dividend_details;
    state.activeStock = s;

    document.getElementById('mTicker').textContent = s.ticker;
    document.getElementById('mName').textContent = s.name;
    document.getElementById('mMarket').textContent = s.market;
    document.getElementById('mSector').textContent = s.sector;

    document.getElementById('mPricePence').textContent = `${s.price_pence.toFixed(1)}p`;
    document.getElementById('mPriceGbp').textContent = `£${s.price_gbp.toFixed(2)}`;

    // 1D Return
    const m1D = document.getElementById('m1DChange');
    m1D.textContent = `${s.change_1d_pct >= 0 ? '+' : ''}${s.change_1d_pct}%`;
    m1D.className = `text-base font-extrabold font-mono ${s.change_1d_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
    document.getElementById('m1DChangePence').textContent = `${s.change_1d_pence >= 0 ? '+' : ''}${s.change_1d_pence}p`;

    // 1W & 1M Return
    const m1W = document.getElementById('m1WChange');
    m1W.textContent = `${s.change_1w_pct >= 0 ? '+' : ''}${s.change_1w_pct}%`;
    m1W.className = `text-base font-extrabold font-mono ${s.change_1w_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    const m1M = document.getElementById('m1MChange');
    m1M.textContent = `${s.change_1m_pct >= 0 ? '+' : ''}${s.change_1m_pct}%`;
    m1M.className = `text-base font-extrabold font-mono ${s.change_1m_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

    // 52W Range
    document.getElementById('m52Low').textContent = `${s.low_52_pence}p`;
    document.getElementById('m52High').textContent = `${s.high_52_pence}p`;
    const range52 = s.high_52_pence - s.low_52_pence || 1;
    const progress52 = Math.min(Math.max(((s.price_pence - s.low_52_pence) / range52) * 100, 0), 100);
    document.getElementById('m52ProgressBar').style.width = `${progress52}%`;

    // Valuation & MAs
    document.getElementById('mMarketCap').textContent = s.market_cap_gbp ? `£${(s.market_cap_gbp / 1e9).toFixed(1)}B` : 'N/A';
    document.getElementById('mPE').textContent = s.pe_ratio ? `${s.pe_ratio}x` : 'N/A';
    document.getElementById('mRVOL').textContent = `${s.rvol}x`;
    document.getElementById('mMA50').textContent = `${s.ma_50}p`;

    // Dividend Profile
    const divCard = document.getElementById('mDividendCard');
    if (s.dividend_yield_pct > 0 || div) {
      divCard.classList.remove('hidden');
      document.getElementById('mDivYield').textContent = `${s.dividend_yield_pct}% Yield`;
      document.getElementById('mExDivDate').textContent = div ? formatDatePretty(div.ex_dividend_date) : (s.ex_dividend_date ? formatDatePretty(s.ex_dividend_date) : 'Announced in broker filings');
      document.getElementById('mDivAmount').textContent = `${s.expected_dividend_pence}p / share (£${s.dividend_rate_gbp})`;
      document.getElementById('mPayDate').textContent = div && div.payment_date ? formatDatePretty(div.payment_date) : 'Scheduled';
    } else {
      divCard.classList.add('hidden');
    }

    // Watchlist text
    const isStarred = state.watchlist.has(s.ticker);
    document.getElementById('mWatchlistText').textContent = isStarred ? 'Remove from Watchlist' : 'Add to Watchlist';

    // Render 30-day Chart
    renderModalChart(s);

    // Show modal
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

  state.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Close Price (p)',
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
            label: (ctx) => ` Price: ${ctx.parsed.y.toFixed(1)}p`
          }
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          grid: {
            color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
          },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            callback: (v) => `${v}p`
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

  // Use stocks from dividend calendar or all stocks with yield
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

  const priceGbp = stock.price_gbp || (stock.price_pence / 100);
  const shares = Math.floor(investment / priceGbp);
  const divPerShareGbp = (stock.expected_dividend_pence || 0) / 100;
  const upcomingCash = shares * divPerShareGbp;
  const annualIncome = investment * ((stock.dividend_yield_pct || 0) / 100);

  document.getElementById('calcSharesCount').textContent = `${formatNumber(shares)} shares`;
  document.getElementById('calcExDivCutoff').textContent = formatDatePretty(stock.ex_dividend_date || 'Upcoming');
  document.getElementById('calcUpcomingPayout').textContent = `£${upcomingCash.toFixed(2)}`;
  document.getElementById('calcAnnualIncome').textContent = `£${annualIncome.toFixed(2)} / yr`;
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

// ================= UTILITIES =================
function formatNumber(num) {
  if (!num && num !== 0) return '0';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return num.toLocaleString();
}

function formatTurnover(num) {
  if (!num) return '£0';
  if (num >= 1e9) return '£' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '£' + (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return '£' + (num / 1e3).toFixed(0) + 'k';
  return '£' + Math.round(num).toLocaleString();
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
