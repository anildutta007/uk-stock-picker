"""
UK Stock Picker - Application Server
Serves the modern responsive web application and provides high-speed REST APIs
for FTSE 100 & FTSE 250 stock analysis, 1D/1W/1M price changes & volumes,
trending momentum scoring, and upcoming dividend calendars.

Exports top-level `app`, `application`, and `handler` for seamless deployment on Vercel,
AWS Lambda, Docker, or standalone local execution via `python server.py`.
"""

import os
import sys
import json
import time
import socket
import csv
import io
import urllib.parse
import threading
import webbrowser
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configure utf-8 console output for Windows compatibility
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import data_fetcher

PORT = 8088
HOST = "127.0.0.1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
CACHE_FILE = os.path.join(DATA_DIR, "stocks_cache.json")
DIVIDENDS_FILE = os.path.join(DATA_DIR, "dividends_calendar.json")

# In-memory storage for sub-millisecond API response
CACHE_DATA = {"stocks": [], "updated_at": None, "count": 0}
DIVIDEND_DATA = {"calendar": [], "updated_at": None, "count": 0}
IS_REFRESHING = False


def load_memory_cache():
    global CACHE_DATA, DIVIDEND_DATA
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                CACHE_DATA = json.load(f)
        except Exception as e:
            print(f"[WARN] Failed to load stocks cache: {e}")

    if os.path.exists(DIVIDENDS_FILE):
        try:
            with open(DIVIDENDS_FILE, "r", encoding="utf-8") as f:
                DIVIDEND_DATA = json.load(f)
        except Exception as e:
            print(f"[WARN] Failed to load dividends cache: {e}")

    # If cache is empty, refresh now
    if not CACHE_DATA.get("stocks"):
        print("[INFO] No cached stock data found. Generating baseline cache...")
        stocks, calendar = data_fetcher.refresh_market_data()
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                CACHE_DATA = json.load(f)
        if os.path.exists(DIVIDENDS_FILE):
            with open(DIVIDENDS_FILE, "r", encoding="utf-8") as f:
                DIVIDEND_DATA = json.load(f)


def background_refresh():
    global IS_REFRESHING
    if IS_REFRESHING:
        return
    IS_REFRESHING = True
    def _run():
        global IS_REFRESHING
        try:
            print("[INFO] Background market refresh started...")
            data_fetcher.refresh_market_data()
            load_memory_cache()
            print("[INFO] Background market refresh finished successfully.")
        except Exception as e:
            print(f"[ERROR] Background refresh error: {e}")
        finally:
            IS_REFRESHING = False
    t = threading.Thread(target=_run, daemon=True)
    t.start()


# ================= DATA EXTRACTION LOGIC (CORE HANDLERS) =================

def filter_by_market(items, market_filter):
    mf = (market_filter or "all").lower()
    if mf == "ftse100":
        return [s for s in items if s.get("market") == "FTSE 100"]
    elif mf == "ftse250":
        return [s for s in items if s.get("market") == "FTSE 250"]
    elif mf == "ftse350":
        return [s for s in items if s.get("market") in ["FTSE 100", "FTSE 250"]]
    elif mf == "nasdaq":
        return [s for s in items if s.get("market") == "NASDAQ 100"]
    elif mf == "dow":
        return [s for s in items if s.get("market") == "Dow Jones 30"]
    elif mf in ["nifty", "india"]:
        return [s for s in items if "NIFTY" in s.get("market", "") or s.get("currency") == "INR"]
    return items


def get_status_payload():
    stocks = CACHE_DATA.get("stocks", [])
    f100_count = sum(1 for s in stocks if s.get("market") == "FTSE 100")
    f250_count = sum(1 for s in stocks if s.get("market") == "FTSE 250")
    f350_count = sum(1 for s in stocks if s.get("market") in ["FTSE 100", "FTSE 250"])
    nasdaq_count = sum(1 for s in stocks if s.get("market") == "NASDAQ 100")
    dow_count = sum(1 for s in stocks if s.get("market") == "Dow Jones 30")
    nifty_count = sum(1 for s in stocks if "NIFTY" in s.get("market", ""))

    return {
        "status": "online",
        "is_refreshing": IS_REFRESHING,
        "last_updated": CACHE_DATA.get("updated_at"),
        "total_stocks": len(stocks),
        "ftse100_count": f100_count,
        "ftse250_count": f250_count,
        "ftse350_count": f350_count,
        "nasdaq_count": nasdaq_count,
        "dow_count": dow_count,
        "nifty_count": nifty_count,
        "dividend_count": len(DIVIDEND_DATA.get("calendar", [])),
        "server_time": datetime.now().isoformat()
    }


def get_market_summary_payload(query):
    stocks = CACHE_DATA.get("stocks", [])
    market_filter = query.get("market", ["all"])[0].lower()
    filtered = filter_by_market(stocks, market_filter)

    if not filtered:
        return {}

    advancers = sum(1 for s in filtered if s.get("change_1d_pct", 0) > 0)
    decliners = sum(1 for s in filtered if s.get("change_1d_pct", 0) < 0)
    unchanged = sum(1 for s in filtered if s.get("change_1d_pct", 0) == 0)

    total_volume_1d = sum(s.get("volume_1d", 0) for s in filtered)
    total_turnover_1d = sum(s.get("turnover_1d_gbp", 0) for s in filtered)

    avg_1d = round(sum(s.get("change_1d_pct", 0) for s in filtered) / len(filtered), 2)
    avg_1w = round(sum(s.get("change_1w_pct", 0) for s in filtered) / len(filtered), 2)
    avg_1m = round(sum(s.get("change_1m_pct", 0) for s in filtered) / len(filtered), 2)

    yields = [s.get("dividend_yield_pct", 0) for s in filtered if s.get("dividend_yield_pct", 0) > 0]
    avg_yield = round(sum(yields) / len(yields), 2) if yields else 0.0

    sorted_by_gain = sorted(filtered, key=lambda s: s.get("change_1d_pct", 0), reverse=True)
    top_gainer = sorted_by_gain[0] if sorted_by_gain else None
    top_loser = sorted_by_gain[-1] if sorted_by_gain else None

    sorted_by_vol = sorted(filtered, key=lambda s: s.get("volume_1d", 0), reverse=True)
    most_active = sorted_by_vol[0] if sorted_by_vol else None

    return {
        "market": market_filter,
        "count": len(filtered),
        "advancers": advancers,
        "decliners": decliners,
        "unchanged": unchanged,
        "avg_change_1d_pct": avg_1d,
        "avg_change_1w_pct": avg_1w,
        "avg_change_1m_pct": avg_1m,
        "total_volume_1d": total_volume_1d,
        "total_turnover_1d_gbp": round(total_turnover_1d, 0),
        "avg_dividend_yield_pct": avg_yield,
        "top_gainer": {
            "ticker": top_gainer["ticker"],
            "name": top_gainer["name"],
            "change_1d_pct": top_gainer["change_1d_pct"],
            "price_pence": top_gainer["price_pence"]
        } if top_gainer else None,
        "top_loser": {
            "ticker": top_loser["ticker"],
            "name": top_loser["name"],
            "change_1d_pct": top_loser["change_1d_pct"],
            "price_pence": top_loser["price_pence"]
        } if top_loser else None,
        "most_active": {
            "ticker": most_active["ticker"],
            "name": most_active["name"],
            "volume_1d": most_active["volume_1d"],
            "turnover_1d_gbp": most_active["turnover_1d_gbp"]
        } if most_active else None
    }


def compute_dynamic_trending_score(s, period):
    pct_key = f"change_{period}_pct"
    chg = s.get(pct_key, 0) or 0
    rvol = s.get("rvol", 1.0) or 1.0
    base_score = s.get("trending_score", 10.0) or 10.0

    # Period-specific price momentum weighting
    if period == "1d":
        chg_weight = 25 if chg >= 3.0 else (15 if chg >= 1.5 else (0 if chg >= 0 else -15))
    elif period == "1w":
        chg_weight = 30 if chg >= 5.0 else (18 if chg >= 2.5 else (0 if chg >= 0 else -20))
    else:  # 1m
        chg_weight = 35 if chg >= 8.0 else (20 if chg >= 4.0 else (0 if chg >= 0 else -25))

    vol_weight = 35 if rvol >= 2.0 else (22 if rvol >= 1.4 else (12 if rvol >= 1.15 else 0))
    breakout_weight = 15 if s.get("high_52_diff_pct", -10) >= -4.0 else 0
    dma_weight = 15 if s.get("above_50ma") and s.get("above_200ma") else (8 if s.get("above_50ma") else 0)

    total = max(5.0, min(100.0, base_score * 0.25 + chg_weight + vol_weight + breakout_weight + dma_weight))
    return round(total, 1)


def get_stocks_payload(query):
    stocks = CACHE_DATA.get("stocks", [])

    market = query.get("market", ["all"])[0].lower()
    stocks = filter_by_market(stocks, market)

    # Indian Index Filter support
    index_filter = query.get("index", ["all"])[0].strip().lower()
    if index_filter and index_filter != "all":
        stocks = [s for s in stocks if index_filter in [idx.lower() for idx in s.get("indices", [])]]

    total_market_count = len(stocks)

    search = query.get("search", [""])[0].strip().lower()
    if search:
        stocks = [
            s for s in stocks
            if search in s.get("ticker", "").lower()
            or search in s.get("name", "").lower()
            or search in s.get("sector", "").lower()
        ]

    sector = query.get("sector", [""])[0].strip()
    if sector and sector.lower() != "all":
        stocks = [s for s in stocks if s.get("sector", "").lower() == sector.lower()]

    tab = query.get("tab", ["all"])[0].lower()
    period = query.get("period", ["1d"])[0].lower()

    pct_key = f"change_{period}_pct"
    vol_key = f"volume_{period}"
    turnover_key = f"turnover_{period}_gbp"

    if tab == "trending":
        trending_filter = query.get("trending_filter", ["top20"])[0].lower()
        trending_candidates = []
        for s in stocks:
            sc = compute_dynamic_trending_score(s, period)
            p_chg = s.get(pct_key, 0) or 0
            rvol = s.get("rvol", 1.0) or 1.0

            # Selective qualification criteria
            if trending_filter == "high_vol":
                passes = rvol >= 1.4 and (sc >= 35 or p_chg > -1.0)
            elif trending_filter == "breakouts":
                min_breakout = 2.0 if period == "1d" else (3.5 if period == "1w" else 5.0)
                passes = p_chg >= min_breakout
            elif trending_filter == "all_qualifying":
                passes = sc >= 35 and (p_chg > 0 or rvol >= 1.2)
            elif trending_filter == "all":
                passes = True
            else:  # default curated top20
                passes = sc >= 35 and (p_chg > 0 or rvol >= 1.2)

            if passes:
                s_copy = dict(s)
                s_copy["dynamic_trending_score"] = sc
                trending_candidates.append(s_copy)

        trending_candidates.sort(key=lambda s: s.get("dynamic_trending_score", 0), reverse=True)

        if trending_filter == "top20":
            stocks = trending_candidates[:20]
        elif trending_filter == "all_qualifying":
            stocks = trending_candidates[:60]
        elif trending_filter == "all":
            stocks = trending_candidates
        else:
            stocks = trending_candidates[:30]
    elif tab == "gainers":
        min_gain = float(query.get("min_gain_pct", [0.0])[0])
        stocks = [s for s in stocks if s.get(pct_key, 0) >= min_gain]
        stocks = sorted(stocks, key=lambda s: s.get(pct_key, 0), reverse=True)
    elif tab == "losers":
        max_loss = float(query.get("max_loss_pct", [0.0])[0])
        if max_loss > 0:
            max_loss = -max_loss
        stocks = [s for s in stocks if s.get(pct_key, 0) <= max_loss]
        stocks = sorted(stocks, key=lambda s: s.get(pct_key, 0))
    elif tab == "volume":
        vol_metric = query.get("volume_metric", ["volume"])[0].lower()
        if vol_metric == "turnover":
            stocks = sorted(stocks, key=lambda s: s.get(turnover_key, 0), reverse=True)
        elif vol_metric == "rvol":
            stocks = sorted(stocks, key=lambda s: s.get("rvol", 0), reverse=True)
        else:
            stocks = sorted(stocks, key=lambda s: s.get(vol_key, 0), reverse=True)

    sort_by = query.get("sort_by", [""])[0]
    sort_order = query.get("sort_order", ["desc"])[0].lower()
    if sort_by and tab not in ["gainers", "losers", "trending"] or query.get("force_sort", ["false"])[0] == "true":
        reverse = (sort_order == "desc")
        stocks = sorted(stocks, key=lambda s: s.get(sort_by, 0) or 0, reverse=reverse)

    limit = int(query.get("limit", [150])[0])
    return {
        "market": market,
        "tab": tab,
        "period": period,
        "index": index_filter,
        "total_market_count": total_market_count,
        "count": len(stocks),
        "stocks": stocks[:limit]
    }


def get_india_indices_payload():
    stocks = CACHE_DATA.get("stocks", [])
    india_stocks = [s for s in stocks if "NIFTY" in s.get("market", "") or s.get("currency") == "INR"]

    indices_list = []
    for meta in getattr(data_fetcher, "INDIAN_INDICES_METADATA", []):
        idx_id = meta["id"]
        constituents = [s for s in india_stocks if idx_id in [i.lower() for i in s.get("indices", [])]]
        if not constituents and idx_id == "nifty500":
            constituents = india_stocks
        elif not constituents and idx_id == "nifty50":
            constituents = [s for s in india_stocks if "NIFTY 50" in s.get("market", "")][:50]

        count = len(constituents)
        if count > 0:
            avg_1d = round(sum(s.get("change_1d_pct", 0) for s in constituents) / count, 2)
            avg_1w = round(sum(s.get("change_1w_pct", 0) for s in constituents) / count, 2)
            avg_1m = round(sum(s.get("change_1m_pct", 0) for s in constituents) / count, 2)
            adv = sum(1 for s in constituents if s.get("change_1d_pct", 0) > 0)
            dec = sum(1 for s in constituents if s.get("change_1d_pct", 0) < 0)
            unc = count - adv - dec
            turnover_inr = sum(s.get("turnover_1d_gbp", 0) for s in constituents)
            sorted_gain = sorted(constituents, key=lambda x: x.get("change_1d_pct", 0), reverse=True)
            top_gainer = {"ticker": sorted_gain[0]["ticker"], "name": sorted_gain[0]["name"], "change_1d_pct": sorted_gain[0]["change_1d_pct"], "price_pence": sorted_gain[0]["price_pence"]} if sorted_gain else None
            top_loser = {"ticker": sorted_gain[-1]["ticker"], "name": sorted_gain[-1]["name"], "change_1d_pct": sorted_gain[-1]["change_1d_pct"], "price_pence": sorted_gain[-1]["price_pence"]} if sorted_gain else None
            sorted_vol = sorted(constituents, key=lambda x: x.get("volume_1d", 0), reverse=True)
            most_active = {"ticker": sorted_vol[0]["ticker"], "name": sorted_vol[0]["name"], "volume_1d": sorted_vol[0]["volume_1d"]} if sorted_vol else None
        else:
            avg_1d = avg_1w = avg_1m = 0.0
            adv = dec = unc = 0
            turnover_inr = 0
            top_gainer = top_loser = most_active = None

        cat_type = "headline" if "Headline" in meta.get("category", "") else ("broad" if "Broad" in meta.get("category", "") else "sectoral")

        indices_list.append({
            "id": meta["id"],
            "name": meta["name"],
            "short_name": meta["short_name"],
            "category": meta["category"],
            "category_label": meta["category"],
            "category_badge": meta["category_badge"],
            "category_type": cat_type,
            "exchange": meta["exchange"],
            "description": meta["description"],
            "count": count,
            "stock_count": count,
            "avg_change_1d_pct": avg_1d,
            "avg_1d_pct": avg_1d,
            "avg_change_1w_pct": avg_1w,
            "avg_1w_pct": avg_1w,
            "avg_change_1m_pct": avg_1m,
            "avg_1m_pct": avg_1m,
            "advancers": adv,
            "decliners": dec,
            "unchanged": unc,
            "turnover_inr": turnover_inr,
            "total_turnover_inr": turnover_inr,
            "top_gainer": top_gainer,
            "top_loser": top_loser,
            "most_active": most_active
        })

    total_count = len(india_stocks)
    adv_tot = sum(1 for s in india_stocks if s.get("change_1d_pct", 0) > 0)
    dec_tot = sum(1 for s in india_stocks if s.get("change_1d_pct", 0) < 0)
    avg_1d_tot = round(sum(s.get("change_1d_pct", 0) for s in india_stocks) / total_count, 2) if total_count else 0.0
    tot_to_inr = sum(s.get("turnover_1d_gbp", 0) for s in india_stocks)

    return {
        "status": "online",
        "market": "Indian Market (NSE/BSE)",
        "indices_count": len(indices_list),
        "total_indian_stocks": total_count,
        "summary": {
            "total_stocks": total_count,
            "advancers": adv_tot,
            "decliners": dec_tot,
            "avg_1d_pct": avg_1d_tot,
            "total_turnover_inr": tot_to_inr
        },
        "indices": indices_list
    }


def get_dividends_payload(query):
    calendar = DIVIDEND_DATA.get("calendar", [])

    market = query.get("market", ["all"])[0].lower()
    calendar = filter_by_market(calendar, market)

    search = query.get("search", [""])[0].strip().lower()
    if search:
        calendar = [
            d for d in calendar
            if search in d.get("ticker", "").lower()
            or search in d.get("name", "").lower()
            or search in d.get("sector", "").lower()
        ]

    timeframe = query.get("timeframe", ["all"])[0].lower()
    if timeframe == "30d":
        calendar = [d for d in calendar if d.get("days_remaining", 0) <= 30]
    elif timeframe == "60d":
        calendar = [d for d in calendar if d.get("days_remaining", 0) <= 60]
    elif timeframe == "90d":
        calendar = [d for d in calendar if d.get("days_remaining", 0) <= 90]
    elif timeframe == "imminent":
        calendar = [d for d in calendar if d.get("days_remaining", 0) <= 7]

    min_yield = float(query.get("min_yield", [0.0])[0])
    if min_yield > 0:
        calendar = [d for d in calendar if d.get("dividend_yield_pct", 0) >= min_yield]

    sort_by = query.get("sort_by", ["days_remaining"])[0]
    sort_order = query.get("sort_order", ["asc"])[0].lower()
    reverse = (sort_order == "desc")
    calendar = sorted(calendar, key=lambda d: d.get(sort_by, 0), reverse=reverse)

    return {
        "market": market,
        "timeframe": timeframe,
        "count": len(calendar),
        "calendar": calendar
    }


def get_single_stock_payload(ticker):
    stocks = CACHE_DATA.get("stocks", [])
    found = next((s for s in stocks if s.get("ticker", "").upper() == ticker.upper()), None)
    if not found:
        return None
    div_calendar = DIVIDEND_DATA.get("calendar", [])
    div_item = next((d for d in div_calendar if d.get("ticker", "").upper() == ticker.upper()), None)
    
    # Enrich with latest price driver explanation, news articles, and famous institutional ratings
    intel = data_fetcher.fetch_stock_intelligence(found)
    
    return {
        "stock": found,
        "dividend_details": div_item,
        "price_driver": intel.get("price_driver", {}),
        "news": intel.get("news", []),
        "analyst_ratings": intel.get("analyst_ratings", {})
    }


def get_export_csv_bytes(query):
    stocks = CACHE_DATA.get("stocks", [])
    market = query.get("market", ["all"])[0].lower()
    tab = query.get("tab", ["all"])[0].lower()
    period = query.get("period", ["1d"])[0].lower()

    stocks = filter_by_market(stocks, market)

    pct_key = f"change_{period}_pct"
    vol_key = f"volume_{period}"
    turnover_key = f"turnover_{period}_gbp"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Ticker", "Name", "Market", "Sector", "Price (p)", "Price (£)",
        f"Change {period.upper()} (%)", "1D Change (%)", "1W Change (%)", "1M Change (%)",
        f"Volume {period.upper()}", f"Turnover {period.upper()} (£)", "RVOL",
        "52W High (p)", "52W Low (p)", "PE Ratio", "Dividend Yield (%)", "Ex-Div Date", "Trending Score"
    ])

    for s in stocks:
        writer.writerow([
            s.get("ticker"), s.get("name"), s.get("market"), s.get("sector"),
            s.get("price_pence"), s.get("price_gbp"),
            s.get(pct_key), s.get("change_1d_pct"), s.get("change_1w_pct"), s.get("change_1m_pct"),
            s.get(vol_key), s.get(turnover_key), s.get("rvol"),
            s.get("high_52_pence"), s.get("low_52_pence"), s.get("pe_ratio"),
            s.get("dividend_yield_pct"), s.get("ex_dividend_date") or "", s.get("trending_score")
        ])

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"uk_stock_picker_{market}_{tab}_{period}.csv"
    return csv_bytes, filename


def get_static_file_content(path):
    if path in ["/", "/index.html"]:
        file_path = os.path.join(STATIC_DIR, "index.html")
        content_type = "text/html; charset=utf-8"
    elif path == "/app.js":
        file_path = os.path.join(STATIC_DIR, "app.js")
        content_type = "application/javascript; charset=utf-8"
    elif path == "/styles.css":
        file_path = os.path.join(STATIC_DIR, "styles.css")
        content_type = "text/css; charset=utf-8"
    else:
        rel = path.lstrip("/")
        file_path = os.path.join(STATIC_DIR, rel)
        content_type = "text/plain"
        if rel.endswith(".html"): content_type = "text/html; charset=utf-8"
        elif rel.endswith(".js"): content_type = "application/javascript; charset=utf-8"
        elif rel.endswith(".css"): content_type = "text/css; charset=utf-8"
        elif rel.endswith(".svg"): content_type = "image/svg+xml"
        elif rel.endswith(".json"): content_type = "application/json"

    if os.path.exists(file_path) and os.path.isfile(file_path):
        with open(file_path, "rb") as f:
            return f.read(), content_type

    # Fallback to index.html
    fallback = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(fallback):
        with open(fallback, "rb") as f:
            return f.read(), "text/html; charset=utf-8"

    return None, "text/plain"


# ================= WSGI ENTRY POINT (FOR VERCEL / GUNICORN / AWS LAMBDA) =================

def app(environ, start_response):
    """
    Standard WSGI callable.
    Exported as `app` and `application` for Vercel's Python runtime.
    """
    load_memory_cache()
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = environ.get("PATH_INFO", "/")
    query_string = environ.get("QUERY_STRING", "")
    query = urllib.parse.parse_qs(query_string)

    cors_headers = [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type"),
    ]

    if method == "OPTIONS":
        start_response("200 OK", cors_headers)
        return [b""]

    if method == "POST" and path == "/api/refresh":
        background_refresh()
        body = json.dumps({"status": "started", "message": "Live market data refresh initiated."}).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path == "/api/status":
        body = json.dumps(get_status_payload(), ensure_ascii=False).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path == "/api/market-summary":
        body = json.dumps(get_market_summary_payload(query), ensure_ascii=False).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path == "/api/stocks":
        body = json.dumps(get_stocks_payload(query), ensure_ascii=False).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path == "/api/dividends":
        body = json.dumps(get_dividends_payload(query), ensure_ascii=False).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path == "/api/india/indices":
        body = json.dumps(get_india_indices_payload(), ensure_ascii=False).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path == "/api/india/stocks":
        query["market"] = ["india"]
        body = json.dumps(get_stocks_payload(query), ensure_ascii=False).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path.startswith("/api/stock/"):
        ticker = path.replace("/api/stock/", "").strip().upper()
        stock_data = get_single_stock_payload(ticker)
        if not stock_data:
            start_response("404 Not Found", [("Content-Type", "text/plain")])
            return [b"Stock not found"]
        body = json.dumps(stock_data, ensure_ascii=False).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))] + cors_headers
        start_response("200 OK", headers)
        return [body]

    if path == "/api/export":
        csv_bytes, filename = get_export_csv_bytes(query)
        headers = [
            ("Content-Type", "text/csv"),
            ("Content-Disposition", f'attachment; filename="{filename}"'),
            ("Content-Length", str(len(csv_bytes)))
        ] + cors_headers
        start_response("200 OK", headers)
        return [csv_bytes]

    # Static file fallback
    file_bytes, content_type = get_static_file_content(path)
    if file_bytes is not None:
        headers = [("Content-Type", content_type), ("Content-Length", str(len(file_bytes)))] + cors_headers
        start_response("200 OK", headers)
        return [file_bytes]

    start_response("404 Not Found", [("Content-Type", "text/plain")])
    return [b"404 Not Found"]


# ================= BaseHTTPRequestHandler ENTRY POINT (FOR LOCAL SERVER & VERCEL HANDLER) =================

class StockPickerRequestHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/refresh":
            background_refresh()
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = json.dumps({"status": "started", "message": "Live market data refresh initiated."})
            self.wfile.write(resp.encode("utf-8"))
            return
        self.send_error(404, "Not Found")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/status":
            self.send_json_response(get_status_payload())
            return
        if path == "/api/market-summary":
            self.send_json_response(get_market_summary_payload(query))
            return
        if path == "/api/stocks":
            self.send_json_response(get_stocks_payload(query))
            return
        if path == "/api/dividends":
            self.send_json_response(get_dividends_payload(query))
            return
        if path == "/api/india/indices":
            self.send_json_response(get_india_indices_payload())
            return
        if path == "/api/india/stocks":
            query["market"] = ["india"]
            self.send_json_response(get_stocks_payload(query))
            return
        if path.startswith("/api/stock/"):
            ticker = path.replace("/api/stock/", "").strip().upper()
            data = get_single_stock_payload(ticker)
            if not data:
                self.send_error(404, "Stock not found")
                return
            self.send_json_response(data)
            return
        if path == "/api/export":
            csv_bytes, filename = get_export_csv_bytes(query)
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "text/csv")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(csv_bytes)))
            self.end_headers()
            self.wfile.write(csv_bytes)
            return

        # Static files
        file_bytes, content_type = get_static_file_content(path)
        if file_bytes is not None:
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(file_bytes)))
            self.end_headers()
            self.wfile.write(file_bytes)
        else:
            self.send_error(404, "File Not Found")

    def send_json_response(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


# ================= TOP-LEVEL EXPORTS REQUIRED BY VERCEL =================
# Vercel checks for: "app", "application", or "handler"
app = app
application = app
handler = StockPickerRequestHandler


# ================= LOCAL STANDALONE SERVER EXECUTION =================

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, port)) == 0


def find_free_port(start_port=8088):
    port = start_port
    while is_port_in_use(port) and port < start_port + 20:
        port += 1
    return port


def open_browser(url):
    time.sleep(1.2)
    try:
        webbrowser.open_new_tab(url)
    except Exception as e:
        print(f"[WARN] Could not auto-launch browser: {e}")


def main():
    global PORT
    load_memory_cache()

    actual_port = find_free_port(PORT)
    PORT = actual_port
    server_address = (HOST, PORT)
    httpd = HTTPServer(server_address, StockPickerRequestHandler)

    url = f"http://{HOST}:{PORT}"
    print("=" * 64)
    print("  [UK] ANIL DUTTA - FTSE 100 & FTSE 250 STOCK PICKER [UK]")
    print("=" * 64)
    print(f"  Serving at: {url}")
    print(f"  Total Stocks: {CACHE_DATA.get('count', 0)}")
    print(f"  Upcoming Dividends: {DIVIDEND_DATA.get('count', 0)}")
    print("  Press Ctrl+C to stop the server.")
    print("=" * 64)

    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Server shutting down gracefully.")
        httpd.server_close()


if __name__ == "__main__":
    main()
