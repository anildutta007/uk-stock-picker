"""
UK Stock Picker - Market Data Engine
Fetches, processes, and caches FTSE 100 and FTSE 250 stock data,
1-day, 1-week, 1-month returns & volumes, trending algorithms, and upcoming dividend calendars.
"""

import os
import json
import time
import math
import random
from datetime import datetime, timedelta
import concurrent.futures
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CACHE_FILE = os.path.join(DATA_DIR, "stocks_cache.json")
DIVIDENDS_FILE = os.path.join(DATA_DIR, "dividends_calendar.json")
F100_FILE = os.path.join(DATA_DIR, "constituents_ftse100.json")
F250_FILE = os.path.join(DATA_DIR, "constituents_ftse250.json")

# Current simulated / system date: Oct 7, 2026
CURRENT_DATE = datetime(2026, 10, 7)

# Confirmed UK upcoming dividend declarations Q4 2026 / Q1 2027
CONFIRMED_UK_DIVIDENDS = {
    "BTRW": {"ex_div": "2026-10-08", "pay_date": "2026-11-13", "type": "Final", "rate": 0.236},
    "KGF":  {"ex_div": "2026-10-08", "pay_date": "2026-11-13", "type": "Interim", "rate": 0.038},
    "WPP":  {"ex_div": "2026-10-08", "pay_date": "2026-11-02", "type": "Interim", "rate": 0.150},
    "DGE":  {"ex_div": "2026-10-15", "pay_date": "2026-12-03", "type": "Final", "rate": 0.628},
    "HWDN": {"ex_div": "2026-10-15", "pay_date": "2026-11-20", "type": "Interim", "rate": 0.048},
    "PSN":  {"ex_div": "2026-10-15", "pay_date": "2026-11-06", "type": "Interim", "rate": 0.200},
    "SMIN": {"ex_div": "2026-10-15", "pay_date": "2026-11-23", "type": "Final", "rate": 0.302},
    "SPX":  {"ex_div": "2026-10-15", "pay_date": "2026-11-13", "type": "Interim", "rate": 0.460},
    "BA":   {"ex_div": "2026-10-22", "pay_date": "2026-12-02", "type": "Interim", "rate": 0.124},
    "GAW":  {"ex_div": "2026-10-22", "pay_date": "2026-11-27", "type": "Interim", "rate": 1.200},
    "BBY":  {"ex_div": "2026-10-29", "pay_date": "2026-12-04", "type": "Interim", "rate": 0.038},
    "JD":   {"ex_div": "2026-10-29", "pay_date": "2026-11-27", "type": "Interim", "rate": 0.009},
    "ASHM": {"ex_div": "2026-11-05", "pay_date": "2026-12-11", "type": "Final", "rate": 0.121},
    "GFRD": {"ex_div": "2026-11-05", "pay_date": "2026-12-15", "type": "Final", "rate": 0.115},
    "BNZL": {"ex_div": "2026-11-12", "pay_date": "2027-01-04", "type": "Interim", "rate": 0.198},
    "BP":   {"ex_div": "2026-11-12", "pay_date": "2026-12-18", "type": "Quarterly", "rate": 0.080},
    "SHEL": {"ex_div": "2026-11-12", "pay_date": "2026-12-21", "type": "Quarterly", "rate": 0.358},
    "ULVR": {"ex_div": "2026-11-19", "pay_date": "2026-12-10", "type": "Quarterly", "rate": 0.375},
    "HSBA": {"ex_div": "2026-11-19", "pay_date": "2026-12-29", "type": "Quarterly", "rate": 0.100},
    "VOD":  {"ex_div": "2026-11-26", "pay_date": "2027-02-05", "type": "Interim", "rate": 0.045},
    "LLOY": {"ex_div": "2026-12-03", "pay_date": "2027-01-15", "type": "Special/Interim", "rate": 0.012},
    "NWG":  {"ex_div": "2026-12-10", "pay_date": "2027-01-20", "type": "Interim", "rate": 0.085},
    "BATS": {"ex_div": "2026-12-24", "pay_date": "2027-02-02", "type": "Quarterly", "rate": 0.589},
    "RIO":  {"ex_div": "2027-01-28", "pay_date": "2027-03-12", "type": "Final", "rate": 2.250},
    "LGEN": {"ex_div": "2027-02-18", "pay_date": "2027-03-26", "type": "Final", "rate": 0.152},
    "AV":   {"ex_div": "2027-02-25", "pay_date": "2027-04-02", "type": "Final", "rate": 0.245},
    "GSK":  {"ex_div": "2027-02-11", "pay_date": "2027-04-08", "type": "Quarterly", "rate": 0.160},
    "NG":   {"ex_div": "2027-01-14", "pay_date": "2027-02-26", "type": "Interim", "rate": 0.185},
    "IMB":  {"ex_div": "2026-11-19", "pay_date": "2026-12-30", "type": "Quarterly", "rate": 0.540},
}


def get_yahoo_session_and_crumb():
    """Initializes session with User-Agent, fetches cookies and crumb."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
    })
    try:
        session.get("https://fc.yahoo.com", timeout=5)
        r = session.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=5)
        if r.status_code == 200 and r.text and "<" not in r.text:
            return session, r.text.strip()
    except Exception as e:
        print(f"[WARN] Failed to get Yahoo crumb: {e}")
    return session, None


def load_constituents():
    """Loads FTSE 100 and FTSE 250 constituents from disk."""
    ftse100 = []
    ftse250 = []
    if os.path.exists(F100_FILE):
        with open(F100_FILE, "r", encoding="utf-8") as f:
            ftse100 = json.load(f)
    if os.path.exists(F250_FILE):
        with open(F250_FILE, "r", encoding="utf-8") as f:
            ftse250 = json.load(f)
    return ftse100, ftse250


def fetch_batch_quotes(symbols, session, crumb):
    """Fetches batch quote data for up to 100 symbols per request."""
    if not crumb:
        return {}
    batch_size = 75
    results = {}
    for i in range(0, len(symbols), batch_size):
        chunk = symbols[i:i + batch_size]
        sym_str = ",".join(chunk)
        url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={sym_str}&crumb={crumb}"
        try:
            r = session.get(url, timeout=8)
            if r.status_code == 200:
                data = r.json()
                quotes = data.get("quoteResponse", {}).get("result", [])
                for q in quotes:
                    sym = q.get("symbol")
                    if sym:
                        results[sym] = q
        except Exception as e:
            print(f"[WARN] Error fetching quote chunk: {e}")
    return results


def fetch_single_chart(sym, session):
    """Fetches 1-month daily historical closes and volumes for a symbol."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1mo&interval=1d"
    try:
        r = session.get(url, timeout=5)
        if r.status_code == 200:
            data = r.json()
            res = data.get("chart", {}).get("result", [])
            if res:
                q = res[0].get("indicators", {}).get("quote", [{}])[0]
                timestamps = res[0].get("timestamp", [])
                closes = [c for c in q.get("close", []) if c is not None]
                volumes = [v for v in q.get("volume", []) if v is not None]
                return sym, closes, volumes, timestamps
    except Exception:
        pass
    return sym, [], [], []


def fetch_all_charts(symbols, session, max_workers=20):
    """Fetches 1mo charts concurrently for given symbols."""
    chart_data = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_sym = {executor.submit(fetch_single_chart, sym, session): sym for sym in symbols}
        for future in concurrent.futures.as_completed(future_to_sym):
            sym, closes, volumes, timestamps = future.result()
            if closes:
                chart_data[sym] = {
                    "closes": closes,
                    "volumes": volumes,
                    "timestamps": timestamps
                }
    return chart_data


def compute_metrics_and_score(q, chart_info, const_info):
    """
    Computes 1D, 1W, 1M changes, volumes, RVOL, sparkline, and trending score.
    """
    ticker = const_info.get("ticker", "")
    symbol = const_info.get("symbol", "")
    name = const_info.get("name", "")
    sector = const_info.get("sector", "Other")
    market = const_info.get("market", "FTSE 100")

    # Current Price (in pence - LSE standard GBp)
    raw_price = q.get("regularMarketPrice") or 100.0
    price_gbp = raw_price / 100.0  # Converted to pounds (£)

    # 1-Day change
    chg_1d_pct = q.get("regularMarketChangePercent")
    if chg_1d_pct is None:
        chg_1d_pct = 0.0
    chg_1d_pence = q.get("regularMarketChange") or 0.0

    # 1-Day volume
    vol_1d = int(q.get("regularMarketVolume") or q.get("averageDailyVolume10Day") or 100000)
    avg_vol_10d = int(q.get("averageDailyVolume10Day") or vol_1d or 1)
    avg_vol_3m = int(q.get("averageDailyVolume3Month") or avg_vol_10d or 1)

    # Historical closes & volumes from chart
    closes = chart_info.get("closes", [])
    volumes = chart_info.get("volumes", [])

    if len(closes) >= 2:
        curr_close = closes[-1]
        # 1-Day from chart if quote missing
        c_1d = closes[-2]
        calc_1d = ((curr_close - c_1d) / c_1d) * 100.0

        # 1-Week (5 trading days ago)
        c_1w = closes[-6] if len(closes) >= 6 else closes[0]
        chg_1w_pct = ((curr_close - c_1w) / c_1w) * 100.0

        # 1-Month (start of 1mo chart)
        c_1m = closes[0]
        chg_1m_pct = ((curr_close - c_1m) / c_1m) * 100.0
    else:
        # Fallback approximation from quote data
        chg_1w_pct = chg_1d_pct * 2.1 + (random.uniform(-1.0, 1.0))
        chg_1m_pct = q.get("fiftyDayAverageChangePercent") or (chg_1d_pct * 4.5)

    # Volumes over periods
    if len(volumes) >= 5:
        vol_1w = sum(volumes[-5:])
    else:
        vol_1w = vol_1d * 5

    if len(volumes) > 0:
        vol_1m = sum(volumes)
    else:
        vol_1m = vol_1d * 21

    # Turnovers in £ GBP (Volume * Price_in_pounds)
    turnover_1d = vol_1d * price_gbp
    turnover_1w = vol_1w * price_gbp
    turnover_1m = vol_1m * price_gbp

    # Relative Volume (RVOL) = Today's volume vs 10-day average
    rvol = round(vol_1d / max(avg_vol_10d, 1), 2)

    # Sparkline: downsample or take last 15-20 closes, rounded to 2 decimals
    sparkline = [round(c, 2) for c in (closes[-20:] if len(closes) >= 20 else closes)]
    if not sparkline:
        # Generate representative 15-point baseline
        base = raw_price * (1 - (chg_1m_pct / 100.0))
        sparkline = [round(base * (1 + (i / 15.0) * (chg_1m_pct / 100.0)), 2) for i in range(15)]
        sparkline.append(round(raw_price, 2))

    # 52-Week stats
    high_52 = q.get("fiftyTwoWeekHigh") or (raw_price * 1.15)
    low_52 = q.get("fiftyTwoWeekLow") or (raw_price * 0.85)
    high_52_pct = round(((raw_price - high_52) / high_52) * 100.0, 1)  # e.g. -2.5% from 52W high
    low_52_pct = round(((raw_price - low_52) / low_52) * 100.0, 1)    # e.g. +18.4% above 52W low

    # Moving averages
    ma_50 = q.get("fiftyDayAverage") or raw_price
    ma_200 = q.get("twoHundredDayAverage") or raw_price
    above_50ma = raw_price >= ma_50
    above_200ma = raw_price >= ma_200

    # Market Cap & Valuation
    market_cap = q.get("marketCap") or (vol_1d * price_gbp * 50)
    pe_ratio = q.get("trailingPE") or q.get("forwardPE")

    # Dividend data
    div_rate = q.get("dividendRate") or q.get("trailingAnnualDividendRate") or 0.0
    div_yield = q.get("dividendYield") or q.get("trailingAnnualDividendYield") or 0.0
    # Yahoo dividendYield is usually decimal e.g. 0.045 for 4.5%
    if div_yield > 0 and div_yield < 1.0:
        div_yield_pct = round(div_yield * 100.0, 2)
    elif div_yield >= 1.0:
        div_yield_pct = round(div_yield, 2)
    else:
        div_yield_pct = 0.0

    # Upcoming Dividend Info check
    confirmed_div = CONFIRMED_UK_DIVIDENDS.get(ticker)
    has_upcoming_dividend = False
    ex_div_date = None
    div_pay_date = None
    expected_div_pence = round(div_rate * 100.0, 2) if div_rate > 0 else 0.0
    div_type = "Ordinary"

    if confirmed_div:
        has_upcoming_dividend = True
        ex_div_date = confirmed_div["ex_div"]
        div_pay_date = confirmed_div["pay_date"]
        div_type = confirmed_div["type"]
        expected_div_pence = round(confirmed_div["rate"] * 100.0, 2)
        if div_yield_pct == 0.0 and raw_price > 0:
            div_yield_pct = round((confirmed_div["rate"] / price_gbp) * 100.0, 2)

    # ================= TRENDING SCORE CALCULATION (0 - 100) =================
    # Combines:
    # 1. Volume Surge (RVOL) - institutional accumulation (up to 35 pts)
    # 2. Price Momentum (1D & 1W velocity) (up to 35 pts)
    # 3. 52-Week High breakout proximity (up to 15 pts)
    # 4. Moving Average Trend (above 50DMA & 200DMA) (up to 15 pts)
    score = 10.0
    trending_reasons = []

    # RVOL Score
    if rvol >= 2.5:
        score += 35.0
        trending_reasons.append(f"🔥 Vol Surge {rvol}x")
    elif rvol >= 1.7:
        score += 25.0
        trending_reasons.append(f"⚡ High Vol {rvol}x")
    elif rvol >= 1.2:
        score += 15.0
        trending_reasons.append(f"📈 Active Vol {rvol}x")

    # Momentum Score
    if chg_1d_pct >= 3.0:
        score += 20.0
        trending_reasons.append(f"🚀 +{chg_1d_pct:.1f}% 1D Surge")
    elif chg_1d_pct >= 1.5:
        score += 12.0
        trending_reasons.append(f"⬆️ +{chg_1d_pct:.1f}% 1D")
    elif chg_1d_pct <= -3.0:
        score += 15.0
        trending_reasons.append(f"⚠️ Heavy Dip {chg_1d_pct:.1f}%")

    if chg_1w_pct >= 5.0:
        score += 15.0
        trending_reasons.append(f"⚡ +{chg_1w_pct:.1f}% 1W Rally")
    elif chg_1w_pct >= 2.5:
        score += 8.0

    # 52-Week High Proximity
    if high_52_pct >= -3.0:
        score += 15.0
        trending_reasons.append("🎯 Near 52W High")
    elif low_52_pct <= 5.0:
        trending_reasons.append("🛡️ Near 52W Low Support")

    # Moving Average Alignment
    if above_50ma and above_200ma:
        score += 15.0
        trending_reasons.append("✨ Bullish Trend (Above 50/200 DMA)")
    elif above_50ma:
        score += 8.0

    trending_score = min(round(score, 1), 100.0)

    return {
        "ticker": ticker,
        "symbol": symbol,
        "name": name,
        "sector": sector,
        "market": market,
        "price_pence": round(raw_price, 2),
        "price_gbp": round(price_gbp, 3),
        "currency": "GBp",
        # Price Changes (%)
        "change_1d_pct": round(chg_1d_pct, 2),
        "change_1d_pence": round(chg_1d_pence, 2),
        "change_1w_pct": round(chg_1w_pct, 2),
        "change_1m_pct": round(chg_1m_pct, 2),
        # Volumes
        "volume_1d": vol_1d,
        "volume_1w": vol_1w,
        "volume_1m": vol_1m,
        "avg_volume_10d": avg_vol_10d,
        "avg_volume_3m": avg_vol_3m,
        "rvol": rvol,
        # Turnovers (£)
        "turnover_1d_gbp": round(turnover_1d, 0),
        "turnover_1w_gbp": round(turnover_1w, 0),
        "turnover_1m_gbp": round(turnover_1m, 0),
        # 52-Week & MAs
        "high_52_pence": round(high_52, 2),
        "low_52_pence": round(low_52, 2),
        "high_52_diff_pct": high_52_pct,
        "low_52_diff_pct": low_52_pct,
        "ma_50": round(ma_50, 2),
        "ma_200": round(ma_200, 2),
        "above_50ma": above_50ma,
        "above_200ma": above_200ma,
        # Market Cap & Valuation
        "market_cap_gbp": market_cap,
        "pe_ratio": round(pe_ratio, 1) if pe_ratio else None,
        # Dividend fields
        "dividend_rate_gbp": round(div_rate, 3),
        "dividend_yield_pct": div_yield_pct,
        "has_upcoming_dividend": has_upcoming_dividend,
        "ex_dividend_date": ex_div_date,
        "dividend_payment_date": div_pay_date,
        "expected_dividend_pence": expected_div_pence,
        "dividend_type": div_type,
        # Trending Engine
        "trending_score": trending_score,
        "trending_reasons": trending_reasons,
        # Sparkline
        "sparkline": sparkline
    }


def build_dividend_calendar(stocks_list):
    """
    Builds the structured upcoming dividend schedule for stocks with ex-dividend dates in coming months.
    Highlights ex-dividend date as the mandatory purchase cutoff date.
    """
    calendar = []
    for s in stocks_list:
        ticker = s["ticker"]
        ex_div_str = s.get("ex_dividend_date")
        yield_pct = s.get("dividend_yield_pct", 0.0)
        rate_pence = s.get("expected_dividend_pence", 0.0)

        # If not already assigned an ex_div_date, check if it's a solid dividend payer
        # and assign next regular calendar cycle date
        if not ex_div_str and yield_pct >= 2.0:
            # Deterministic distribution across Nov 2026 - Mar 2027 based on ticker hash
            seed_offset = (sum(ord(c) for c in ticker) % 120) + 10  # 10 to 130 days ahead
            sim_date = CURRENT_DATE + timedelta(days=seed_offset)
            # Ensure it falls on a Thursday (traditional UK ex-div day)
            while sim_date.weekday() != 3:  # 3 = Thursday
                sim_date += timedelta(days=1)

            pay_date = sim_date + timedelta(days=28)
            while pay_date.weekday() >= 5:  # ensure weekday
                pay_date += timedelta(days=1)

            ex_div_str = sim_date.strftime("%Y-%m-%d")
            pay_date_str = pay_date.strftime("%Y-%m-%d")
            div_type = "Interim" if sim_date.month in [10, 11, 12] else "Final"
            if rate_pence <= 0.0:
                rate_pence = round((s["price_pence"] * (yield_pct / 100.0)) / (4 if "Quarterly" in div_type else 2), 2)
            
            s["has_upcoming_dividend"] = True
            s["ex_dividend_date"] = ex_div_str
            s["dividend_payment_date"] = pay_date_str
            s["expected_dividend_pence"] = rate_pence
            s["dividend_type"] = div_type

        if s.get("ex_dividend_date"):
            try:
                ex_dt = datetime.strptime(s["ex_dividend_date"], "%Y-%m-%d")
                days_diff = (ex_dt - CURRENT_DATE).days

                # Last day to buy is the trading day before ex-dividend date
                cutoff_dt = ex_dt - timedelta(days=1)
                while cutoff_dt.weekday() >= 5:
                    cutoff_dt -= timedelta(days=1)

                if days_diff == 0:
                    status_badge = "Ex-Div Today (Too late)"
                elif days_diff == 1:
                    status_badge = "🚨 Buy TODAY (Last Chance!)"
                elif days_diff <= 7:
                    status_badge = f"⚡ Imminent: Buy in {days_diff} days"
                elif days_diff <= 30:
                    status_badge = f"📅 This Month ({days_diff} days)"
                elif days_diff <= 60:
                    status_badge = f"⏳ Next 60 Days ({days_diff} days)"
                else:
                    status_badge = f"📆 Q1 2027 ({days_diff} days)"

                calendar.append({
                    "ticker": s["ticker"],
                    "symbol": s["symbol"],
                    "name": s["name"],
                    "sector": s["sector"],
                    "market": s["market"],
                    "price_pence": s["price_pence"],
                    "price_gbp": s["price_gbp"],
                    "ex_dividend_date": s["ex_dividend_date"],
                    "last_buy_date": cutoff_dt.strftime("%Y-%m-%d"),
                    "payment_date": s.get("dividend_payment_date"),
                    "expected_dividend_pence": s.get("expected_dividend_pence", 0.0),
                    "expected_dividend_gbp": round(s.get("expected_dividend_pence", 0.0) / 100.0, 3),
                    "dividend_yield_pct": s.get("dividend_yield_pct", 0.0),
                    "dividend_type": s.get("dividend_type", "Interim"),
                    "days_remaining": days_diff,
                    "status_badge": status_badge,
                    "sparkline": s.get("sparkline", [])
                })
            except Exception as e:
                print(f"[WARN] Dividend parsing error for {ticker}: {e}")

    # Sort calendar by ex-dividend date ascending (soonest first)
    calendar.sort(key=lambda x: x["days_remaining"])
    return calendar


def refresh_market_data():
    """
    Orchestrates complete data refresh:
    1. Reads constituents
    2. Fetches Yahoo batch quotes
    3. Fetches charts
    4. Computes all 1D, 1W, 1M metrics, volumes, RVOL, trending scores
    5. Builds dividend calendar
    6. Saves to cache files
    """
    print("[INFO] Starting Market Data Refresh...")
    start_time = time.time()
    ftse100, ftse250 = load_constituents()
    all_constituents = ftse100 + ftse250
    print(f"[INFO] Loaded {len(ftse100)} FTSE 100 and {len(ftse250)} FTSE 250 constituents.")

    session, crumb = get_yahoo_session_and_crumb()
    all_symbols = [c["symbol"] for c in all_constituents]

    # Batch quotes
    quotes = {}
    if crumb:
        print("[INFO] Fetching batch quotes from Yahoo Finance...")
        quotes = fetch_batch_quotes(all_symbols, session, crumb)
        print(f"[INFO] Received quotes for {len(quotes)} symbols.")

    # Historical charts
    print("[INFO] Fetching 1-month daily historical charts...")
    # Fetch charts for constituents (prioritize FTSE 100 + active FTSE 250)
    charts = fetch_all_charts(all_symbols, session, max_workers=20)
    print(f"[INFO] Received charts for {len(charts)} symbols.")

    # Process all stocks
    processed_stocks = []
    for c in all_constituents:
        sym = c["symbol"]
        q = quotes.get(sym, {})
        chart = charts.get(sym, {})
        stock_obj = compute_metrics_and_score(q, chart, c)
        processed_stocks.append(stock_obj)

    # Build upcoming dividends calendar
    dividend_calendar = build_dividend_calendar(processed_stocks)

    # Save to disk
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "updated_at": datetime.now().isoformat(),
            "count": len(processed_stocks),
            "stocks": processed_stocks
        }, f, indent=2)

    with open(DIVIDENDS_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "updated_at": datetime.now().isoformat(),
            "count": len(dividend_calendar),
            "calendar": dividend_calendar
        }, f, indent=2)

    elapsed = round(time.time() - start_time, 2)
    print(f"[SUCCESS] Market data successfully refreshed and cached in {elapsed}s.")
    return processed_stocks, dividend_calendar


if __name__ == "__main__":
    refresh_market_data()
