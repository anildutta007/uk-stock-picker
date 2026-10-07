"""
UK Stock Picker - Application Server
Serves the modern responsive web application and provides high-speed REST APIs
for FTSE 100 & FTSE 250 stock analysis, 1D/1W/1M price changes & volumes,
trending momentum scoring, and upcoming dividend calendars.
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
        load_memory_cache()


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

        # 1. API: /api/status
        if path == "/api/status":
            self.handle_api_status()
            return

        # 2. API: /api/market-summary
        if path == "/api/market-summary":
            self.handle_api_market_summary(query)
            return

        # 3. API: /api/stocks
        if path == "/api/stocks":
            self.handle_api_stocks(query)
            return

        # 4. API: /api/dividends
        if path == "/api/dividends":
            self.handle_api_dividends(query)
            return

        # 5. API: /api/stock/<ticker>
        if path.startswith("/api/stock/"):
            ticker = path.replace("/api/stock/", "").strip().upper()
            self.handle_api_single_stock(ticker)
            return

        # 6. API: /api/export
        if path == "/api/export":
            self.handle_api_export(query)
            return

        # 7. Static Files
        self.handle_static_files(path)

    def handle_api_status(self):
        stocks = CACHE_DATA.get("stocks", [])
        f100_count = sum(1 for s in stocks if s.get("market") == "FTSE 100")
        f250_count = sum(1 for s in stocks if s.get("market") == "FTSE 250")
        payload = {
            "status": "online",
            "is_refreshing": IS_REFRESHING,
            "last_updated": CACHE_DATA.get("updated_at"),
            "total_stocks": len(stocks),
            "ftse100_count": f100_count,
            "ftse250_count": f250_count,
            "dividend_count": len(DIVIDEND_DATA.get("calendar", [])),
            "server_time": datetime.now().isoformat()
        }
        self.send_json_response(payload)

    def handle_api_market_summary(self, query):
        stocks = CACHE_DATA.get("stocks", [])
        market_filter = query.get("market", ["all"])[0].lower()

        filtered = stocks
        if market_filter == "ftse100":
            filtered = [s for s in stocks if s.get("market") == "FTSE 100"]
        elif market_filter == "ftse250":
            filtered = [s for s in stocks if s.get("market") == "FTSE 250"]

        if not filtered:
            self.send_json_response({})
            return

        advancers = sum(1 for s in filtered if s.get("change_1d_pct", 0) > 0)
        decliners = sum(1 for s in filtered if s.get("change_1d_pct", 0) < 0)
        unchanged = sum(1 for s in filtered if s.get("change_1d_pct", 0) == 0)

        total_volume_1d = sum(s.get("volume_1d", 0) for s in filtered)
        total_turnover_1d = sum(s.get("turnover_1d_gbp", 0) for s in filtered)

        # Average returns
        avg_1d = round(sum(s.get("change_1d_pct", 0) for s in filtered) / len(filtered), 2)
        avg_1w = round(sum(s.get("change_1w_pct", 0) for s in filtered) / len(filtered), 2)
        avg_1m = round(sum(s.get("change_1m_pct", 0) for s in filtered) / len(filtered), 2)

        # Yields
        yields = [s.get("dividend_yield_pct", 0) for s in filtered if s.get("dividend_yield_pct", 0) > 0]
        avg_yield = round(sum(yields) / len(yields), 2) if yields else 0.0

        # Top mover
        sorted_by_gain = sorted(filtered, key=lambda s: s.get("change_1d_pct", 0), reverse=True)
        top_gainer = sorted_by_gain[0] if sorted_by_gain else None
        top_loser = sorted_by_gain[-1] if sorted_by_gain else None

        # Most active by volume
        sorted_by_vol = sorted(filtered, key=lambda s: s.get("volume_1d", 0), reverse=True)
        most_active = sorted_by_vol[0] if sorted_by_vol else None

        summary = {
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
        self.send_json_response(summary)

    def handle_api_stocks(self, query):
        stocks = CACHE_DATA.get("stocks", [])

        # Filter: market
        market = query.get("market", ["all"])[0].lower()
        if market == "ftse100":
            stocks = [s for s in stocks if s.get("market") == "FTSE 100"]
        elif market == "ftse250":
            stocks = [s for s in stocks if s.get("market") == "FTSE 250"]

        # Filter: search query
        search = query.get("search", [""])[0].strip().lower()
        if search:
            stocks = [
                s for s in stocks
                if search in s.get("ticker", "").lower()
                or search in s.get("name", "").lower()
                or search in s.get("sector", "").lower()
            ]

        # Filter: sector
        sector = query.get("sector", [""])[0].strip()
        if sector and sector.lower() != "all":
            stocks = [s for s in stocks if s.get("sector", "").lower() == sector.lower()]

        # Active Tab & Period
        tab = query.get("tab", ["all"])[0].lower()
        period = query.get("period", ["1d"])[0].lower()  # 1d, 1w, 1m

        # Dynamic Field Keys based on period
        pct_key = f"change_{period}_pct"
        vol_key = f"volume_{period}"
        turnover_key = f"turnover_{period}_gbp"

        # Tab Logic
        if tab == "trending":
            # Trending stocks: high trending score or volume surge
            stocks = sorted(stocks, key=lambda s: s.get("trending_score", 0), reverse=True)
            # Default sort is score

        elif tab == "gainers":
            # Requirement 2: Shares that have increased in value (customized by user) % over 1d, 1w, 1m
            min_gain = float(query.get("min_gain_pct", [0.0])[0])
            stocks = [s for s in stocks if s.get(pct_key, 0) >= min_gain]
            stocks = sorted(stocks, key=lambda s: s.get(pct_key, 0), reverse=True)

        elif tab == "losers":
            # Requirement 3: Shares that have lost value in % (customized by user) over 1d, 1w, 1m
            max_loss = float(query.get("max_loss_pct", [0.0])[0])
            # If user provided a positive number e.g. 5, treat as -5.0
            if max_loss > 0:
                max_loss = -max_loss
            stocks = [s for s in stocks if s.get(pct_key, 0) <= max_loss]
            stocks = sorted(stocks, key=lambda s: s.get(pct_key, 0))  # Most negative first

        elif tab == "volume":
            # Requirement 4: Shares with highest volume in trading over 1d, 1w, 1m
            vol_metric = query.get("volume_metric", ["volume"])[0].lower()
            if vol_metric == "turnover":
                stocks = sorted(stocks, key=lambda s: s.get(turnover_key, 0), reverse=True)
            elif vol_metric == "rvol":
                stocks = sorted(stocks, key=lambda s: s.get("rvol", 0), reverse=True)
            else:
                stocks = sorted(stocks, key=lambda s: s.get(vol_key, 0), reverse=True)

        # Custom Sorting Override if specified
        sort_by = query.get("sort_by", [""])[0]
        sort_order = query.get("sort_order", ["desc"])[0].lower()
        if sort_by and tab not in ["gainers", "losers"] or query.get("force_sort", ["false"])[0] == "true":
            reverse = (sort_order == "desc")
            stocks = sorted(stocks, key=lambda s: s.get(sort_by, 0) or 0, reverse=reverse)

        limit = int(query.get("limit", [150])[0])
        response_data = {
            "market": market,
            "tab": tab,
            "period": period,
            "count": len(stocks),
            "stocks": stocks[:limit]
        }
        self.send_json_response(response_data)

    def handle_api_dividends(self, query):
        calendar = DIVIDEND_DATA.get("calendar", [])

        # Filter: market
        market = query.get("market", ["all"])[0].lower()
        if market == "ftse100":
            calendar = [d for d in calendar if d.get("market") == "FTSE 100"]
        elif market == "ftse250":
            calendar = [d for d in calendar if d.get("market") == "FTSE 250"]

        # Filter: search query
        search = query.get("search", [""])[0].strip().lower()
        if search:
            calendar = [
                d for d in calendar
                if search in d.get("ticker", "").lower()
                or search in d.get("name", "").lower()
                or search in d.get("sector", "").lower()
            ]

        # Filter: timeframe
        timeframe = query.get("timeframe", ["all"])[0].lower()
        if timeframe == "30d":
            calendar = [d for d in calendar if d.get("days_remaining", 0) <= 30]
        elif timeframe == "60d":
            calendar = [d for d in calendar if d.get("days_remaining", 0) <= 60]
        elif timeframe == "90d":
            calendar = [d for d in calendar if d.get("days_remaining", 0) <= 90]
        elif timeframe == "imminent":
            calendar = [d for d in calendar if d.get("days_remaining", 0) <= 7]

        # Filter: min yield %
        min_yield = float(query.get("min_yield", [0.0])[0])
        if min_yield > 0:
            calendar = [d for d in calendar if d.get("dividend_yield_pct", 0) >= min_yield]

        # Sorting
        sort_by = query.get("sort_by", ["days_remaining"])[0]
        sort_order = query.get("sort_order", ["asc"])[0].lower()
        reverse = (sort_order == "desc")
        calendar = sorted(calendar, key=lambda d: d.get(sort_by, 0), reverse=reverse)

        self.send_json_response({
            "market": market,
            "timeframe": timeframe,
            "count": len(calendar),
            "calendar": calendar
        })

    def handle_api_single_stock(self, ticker):
        stocks = CACHE_DATA.get("stocks", [])
        found = next((s for s in stocks if s.get("ticker", "").upper() == ticker), None)
        if not found:
            self.send_error(404, "Stock not found")
            return
        # Also attach upcoming dividend info if any
        div_calendar = DIVIDEND_DATA.get("calendar", [])
        div_item = next((d for d in div_calendar if d.get("ticker", "").upper() == ticker), None)
        self.send_json_response({
            "stock": found,
            "dividend_details": div_item
        })

    def handle_api_export(self, query):
        stocks = CACHE_DATA.get("stocks", [])
        market = query.get("market", ["all"])[0].lower()
        tab = query.get("tab", ["all"])[0].lower()
        period = query.get("period", ["1d"])[0].lower()

        if market == "ftse100":
            stocks = [s for s in stocks if s.get("market") == "FTSE 100"]
        elif market == "ftse250":
            stocks = [s for s in stocks if s.get("market") == "FTSE 250"]

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
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/csv")
        self.send_header("Content-Disposition", f'attachment; filename="uk_stock_picker_{market}_{tab}_{period}.csv"')
        self.send_header("Content-Length", str(len(csv_bytes)))
        self.end_headers()
        self.wfile.write(csv_bytes)

    def handle_static_files(self, path):
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
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", content_type)
            with open(file_path, "rb") as f:
                data = f.read()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            # Fallback to index.html for SPA routing
            fallback_index = os.path.join(STATIC_DIR, "index.html")
            if os.path.exists(fallback_index):
                self.send_response(200)
                self.send_cors_headers()
                self.send_header("Content-Type", "text/html; charset=utf-8")
                with open(fallback_index, "rb") as f:
                    data = f.read()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
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
        # Concise logging
        pass


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
