# 🇬🇧 UK Stock Picker: FTSE 100 & FTSE 250 Market Intelligence Hub

An advanced UK stock screening and market intelligence web application built by **Anil Dutta**. Designed for investors and researchers to analyze real-time performance across the London Stock Exchange (LSE).

---

## 🌟 Key Features

### 1. 🔥 Trending UK Stocks
- Identifies unusual relative trading volume surges (RVOL > 1.5x – 3.0x).
- Flags momentum breakouts, stocks nearing 52-week highs, and moving average crossovers (50-day and 200-day DMA).
- Visual trend indicator tags (`🔥 Vol Surge 2.5x`, `🚀 52W High Breakout`, `⚡ +6.4% 1W Run`).

### 2. 📈 Customizable Value Gainers
- Screen shares that have appreciated in value over **1 Day (1D)**, **1 Week (1W)**, or **1 Month (1M)**.
- **Customizable Threshold Filter**:
  - Quick presets: `All Gainers (>0%)`, `+2%`, `+5%`, `+10%`, `+15%`.
  - **Dynamic slider & exact numerical input box**: Type or drag any target percentage (e.g. `+3.5%` or `+7.2%`).

### 3. 📉 Customizable Value Decliners (Dip Finder)
- Screen shares that have pulled back over **1 Day (1D)**, **1 Week (1W)**, or **1 Month (1M)**.
- **Customizable Threshold Filter**:
  - Quick presets: `All Decliners (<0%)`, `-2%`, `-5%`, `-10%`, `-15%`.
  - **Dynamic slider & exact numerical input box**: Type or drag any target drop percentage (e.g. `-4.0%` or `-8.5%`).
  - Identifies quality high-yield dividend payers trading near 52-week support.

### 4. 📊 Highest Trading Volume & Liquidity
- Rank top traded UK stocks over **1 Day**, **1 Week**, or **1 Month**.
- Switch between:
  - **Shares Volume** (Total volume of shares exchanged)
  - **Turnover (£ GBP Value)** (`Volume × Price`) to follow institutional capital flow.
  - **Relative Volume (RVOL)** to identify unusual activity.

### 5. 💰 Upcoming Dividends & Ex-Dividend Cutoff Calendar
- Comprehensive tracker for UK shares with scheduled dividend payouts in coming months.
- **Ex-Dividend Cutoff Alert**:
  - Clear guidance explaining: *"To qualify for the dividend, you MUST own the share before the Ex-Dividend Date (by close of trading on the prior business day)."*
- Shows:
  - **Ex-Dividend Date** (with countdown badge: *Imminent, This Month, Next 60 Days*)
  - **Last Day to Buy**
  - **Expected Dividend Value** in pence (`p`) and pounds (`£`)
  - **Annual Dividend Yield %**
  - **Payment Date**
- **Interactive Dividend Cash Calculator**:
  - Enter your investment capital (e.g., £5,000) or share count.
  - Instantly computes upcoming cash payout, annual income, and effective yield.

### 6. 🏛️ Market Universe Selector
- **FTSE 100** (UK Blue Chips - top 100 large-caps)
- **FTSE 250** (UK Mid-Cap Champions - 250 mid-caps)
- **Combined UK 350** (Full universe of 350 shares)

---

## 🚀 How to Run

### Method 1: Desktop Batch Launcher (Easiest)
Double-click `run_stock_picker.bat` in the root folder `c:\Anil Google Projects`.

### Method 2: Command Line
```powershell
cd "c:\Anil Google Projects\uk-stock-picker"
python server.py
```
Then navigate to:
**[http://127.0.0.1:8088](http://127.0.0.1:8088)**

---

## 🛠️ Architecture & Tech Stack
- **Backend**: Python standard library `http.server`, `requests`, `concurrent.futures`, `json`, `csv`.
- **Data Engine**: Parallel asynchronous batch quote fetcher and 1-month daily chart analyzer with instant local caching (`data/stocks_cache.json`).
- **Frontend**: Modern SPA built with Tailwind CSS, Lucide Icons, Chart.js, and custom SVG sparklines.
- **Offline / Zero-Crash Resilience**: Loads pre-cached market universe in sub-50ms with on-demand background refresh.
