# 🌍 Global & UK Stock Picker: FTSE 100/250/350, NASDAQ, Dow Jones & NIFTY 50 Intelligence Hub

An advanced multi-market stock screening and market intelligence web application built by **Anil Dutta**. Designed for investors and researchers to analyze real-time performance across the **London Stock Exchange (LSE)**, **US Wall Street (NASDAQ & NYSE)**, and the **National Stock Exchange of India (NSE)**.

---

## 🌟 Key Features & Tabs

### 1. 🔥 Trending Stocks & Breakouts
- Identifies unusual relative trading volume surges (RVOL > 1.5x – 3.0x).
- Flags momentum breakouts, stocks nearing 52-week highs, and moving average crossovers (50 DMA & 200 DMA).
- Visual trend indicator tags (`🔥 Vol Surge 2.5x`, `🚀 52W High Breakout`, `⚡ +6.4% 1W Run`, `✨ Bullish Trend`).

### 2. 📈 Value Gainers (% Increase Customized by User)
- Screen shares that have appreciated in value over **1 Day (1D)**, **1 Week (1W)**, or **1 Month (1M)**.
- **Customizable Threshold Filter**:
  - Quick presets: `All Gainers (>0%)`, `+2%`, `+5%`, `+10%`.
  - **Dynamic slider & exact numerical input box**: Type or drag any target percentage (e.g. `+3.5%` or `+7.2%`).

### 3. 📉 Value Decliners (% Loss / Dip Finder)
- Screen shares that have pulled back over **1 Day (1D)**, **1 Week (1W)**, or **1 Month (1M)**.
- **Customizable Threshold Filter**:
  - Quick presets: `All Decliners (<0%)`, `-2%`, `-5%`, `-10%`.
  - **Dynamic slider & exact numerical input box**: Type or drag any target drop percentage (e.g. `-4.0%` or `-8.5%`).
  - Identifies quality high-yield dividend payers trading near 52-week support.

### 4. 📊 Highest Trading Volume & Liquidity
- Rank top traded shares over **1 Day**, **1 Week**, or **1 Month**.
- Switch between:
  - **Shares Volume** (Total volume of shares exchanged)
  - **Turnover (£ / $ / ₹ Cash Value)** (`Volume × Price`) to follow institutional capital flow.
  - **Relative Volume (RVOL)** to identify unusual activity.

### 5. 💰 Upcoming Dividends & Ex-Dividend Cutoff Calendar
- Comprehensive tracker for shares with scheduled dividend payouts in coming months.
- **Ex-Dividend Cutoff Alert**:
  - Clear guidance explaining: *"To qualify for the dividend, you MUST own the share before the Ex-Dividend Date (by close of trading on the prior business day)."*
- Shows:
  - **Ex-Dividend Date** (with countdown badge: *🚨 Buy TODAY*, *⚡ Imminent*, *📅 This Month*)
  - **Last Day to Buy**
  - **Expected Dividend Value** in pence (`p`), dollars (`$`), or rupees (`₹`)
  - **Annual Dividend Yield %**
  - **Payment Date**
- **Interactive Dividend Cash Calculator**:
  - Enter your investment capital (e.g., £5,000 or $10,000).
  - Instantly computes upcoming cash payout, annual income, and effective yield.

### 6. 📖 Tab Guide & Methodology (New Dedicated Tab)
- In-depth interactive guide explaining the financial mechanics of every tab.
- Breakdown of the 4-factor trending score, volume turnover vs raw volume, contrarian dip buying, and ex-dividend purchase rules.

### 7. 🏛️ Multi-Market Universe Selector
- 🇬🇧 **FTSE 100** (UK Blue Chips - top 100 large-caps)
- 🏢 **FTSE 250** (UK Mid-Cap Champions - 250 mid-caps)
- 🇬🇧 **FTSE 350** (Combined UK 350 Blue Chips + Mid-Caps)
- 🇺🇸 **NASDAQ 100** (US Tech & Innovation Leaders - Apple, Microsoft, NVIDIA, Amazon, Alphabet, Meta, Broadcom, Tesla)
- 🇺🇸 **DOW JONES 30** (US Mega-Cap Titans - JPMorgan, Caterpillar, UnitedHealth, Boeing, Goldman Sachs, Home Depot)
- 🇮🇳 **NIFTY 50 (India)** (National Stock Exchange of India Blue Chips - Reliance, TCS, HDFC Bank, Infosys, Bharti Airtel, Tata Motors, L&T)
### 8. 🔍 Stock Deep-Dive: Price Movement Drivers, Latest News & Famous Institutional Ratings (HOLD, BUY, SELL)
- **Why It's Moving Today**: Real-time momentum catalyst synthesis, sentiment badge (`🟢 Bullish Momentum`, `🔴 Selling Pressure`, `🟡 Consolidation`), Relative Volume (RVOL) multiples, and sector drivers.
- **Verified Financial News Feed**: Articles from Financial Times, Bloomberg, Reuters, Wall Street Journal, Zacks, CNBC with relative timestamps and direct links.
- **Ratings from Famous Financial Institutions**:
  - Consensus rating and score (`STRONG BUY`, `BUY`, `HOLD`, `SELL` on a 1.0 to 5.0 scale).
  - Target Price in local currency (`£`, `$`, or `₹`) with implied upside percentage.
  - Institutional Analyst Breakdown bar (`% Buy`, `% Hold`, `% Sell`).
  - Institutional Research Feed from **Goldman Sachs, JPMorgan Chase, Morgan Stanley, Barclays Capital, Citigroup, UBS Investment Bank, Jefferies, HSBC Global Research, Bank of America** with Action badges (`Target Raised`, `Reiterated`, `Upgraded`), Target Prices, and Analyst Rationale commentary.

---

## 🚀 How to Run

### Method 1: Desktop Batch Launcher
Double-click `run_stock_picker.bat` in `c:\Anil Google Projects`.

### Method 2: Command Line
```powershell
cd "c:\Anil Google Projects\uk-stock-picker"
python server.py
```
Then navigate to **[http://127.0.0.1:8088](http://127.0.0.1:8088)**.
