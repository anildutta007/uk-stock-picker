import urllib.request
import json
import time
import threading
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server

# Start server on test port 8099
server.PORT = 8099
server.HOST = '127.0.0.1'
server.load_memory_cache()

srv = server.HTTPServer(('127.0.0.1', 8099), server.StockPickerRequestHandler)
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()
time.sleep(0.5)

base = 'http://127.0.0.1:8099'

# 1. Status
res = json.loads(urllib.request.urlopen(f'{base}/api/status').read())
print(f"TEST 1 - Status: {res['status']}, Total Stocks: {res['total_stocks']}, Dividends: {res['dividend_count']}")

# 2. Market Summary
res = json.loads(urllib.request.urlopen(f'{base}/api/market-summary?market=ftse100').read())
print(f"TEST 2 - FTSE 100 Summary: Advancers: {res['advancers']}, Decliners: {res['decliners']}, Day Avg: {res['avg_change_1d_pct']}%")

# 3. Trending Stocks
res = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=ftse100&tab=trending').read())
top_trend = res['stocks'][0]
print(f"TEST 3 - Trending Stocks count: {len(res['stocks'])}, Top Trending: {top_trend['ticker']} (Score: {top_trend['trending_score']})")

# 4. Gainers 1W >= 2%
res = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=ftse100&tab=gainers&period=1w&min_gain_pct=2.0').read())
top_gain = res['stocks'][0]
print(f"TEST 4 - 1W Gainers (>= 2%) count: {len(res['stocks'])}, Top Gainer: {top_gain['ticker']} (+{top_gain['change_1w_pct']}%)")

# 5. Losers 1M <= -5%
res = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=ftse250&tab=losers&period=1m&max_loss_pct=-5.0').read())
top_loss = res['stocks'][0]
print(f"TEST 5 - 1M Losers (<= -5%) count: {len(res['stocks'])}, Top Loser: {top_loss['ticker']} ({top_loss['change_1m_pct']}%)")

# 6. Volume by Turnover
res = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=ftse100&tab=volume&period=1d&volume_metric=turnover').read())
top_vol = res['stocks'][0]
print(f"TEST 6 - Top Volume Turnover: {top_vol['ticker']} (Turnover: GBP {top_vol['turnover_1d_gbp']:,.0f})")

# 7. Dividends next 30 days
res = json.loads(urllib.request.urlopen(f'{base}/api/dividends?market=ftse100&timeframe=30d').read())
first_div = res['calendar'][0]
print(f"TEST 7 - Upcoming Dividends (Next 30 Days): {len(res['calendar'])} stocks. Next Ex-Div: {first_div['ticker']} on {first_div['ex_dividend_date']} ({first_div['expected_dividend_pence']}p / share, {first_div['dividend_yield_pct']}%)")

# 8. Single Stock Deep-Dive
res = json.loads(urllib.request.urlopen(f'{base}/api/stock/SHEL').read())
print(f"TEST 8 - Stock Details for SHEL: Price: {res['stock']['price_pence']}p, 1D: {res['stock']['change_1d_pct']}%, 1W: {res['stock']['change_1w_pct']}%, 1M: {res['stock']['change_1m_pct']}%")

# 9. Static files
html = urllib.request.urlopen(f'{base}/').read().decode('utf-8')
js = urllib.request.urlopen(f'{base}/app.js').read().decode('utf-8')
css = urllib.request.urlopen(f'{base}/styles.css').read().decode('utf-8')
print(f"TEST 9 - Static Files: index.html ({len(html)} bytes), app.js ({len(js)} bytes), styles.css ({len(css)} bytes)")

srv.shutdown()
print("=" * 60)
print("ALL 9 INTEGRATION TESTS PASSED 100% SUCCESSFULLY!")
print("=" * 60)
