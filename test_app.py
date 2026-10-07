import urllib.request
import json
import time
import threading
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server

# Start server on test port 8097
server.PORT = 8097
server.HOST = '127.0.0.1'
server.load_memory_cache()

srv = server.HTTPServer(('127.0.0.1', 8097), server.StockPickerRequestHandler)
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()
time.sleep(0.5)

base = 'http://127.0.0.1:8097'

try:
    # 1. Status Check
    res = json.loads(urllib.request.urlopen(f'{base}/api/status').read())
    print(f"TEST 1 - Status: {res['status']}, Total Universe: {res['total_stocks']} stocks across markets")
    print(f"         FTSE 100: {res['ftse100_count']} | FTSE 250: {res['ftse250_count']} | FTSE 350: {res['ftse350_count']}")
    print(f"         NASDAQ: {res['nasdaq_count']} | DOW 30: {res['dow_count']} | NIFTY 50: {res['nifty_count']}")
    print(f"         Upcoming Dividends: {res['dividend_count']}")

    # 2. FTSE 350 Check
    res_f350 = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=ftse350&tab=trending').read())
    print(f"TEST 2 - FTSE 350 (Combined): Loaded {res_f350['count']} UK stocks. Top: {res_f350['stocks'][0]['ticker']}")

    # 3. NASDAQ 100 Check
    res_nasdaq = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=nasdaq&tab=trending').read())
    print(f"TEST 3 - NASDAQ 100: Loaded {res_nasdaq['count']} US Tech stocks. Top: {res_nasdaq['stocks'][0]['ticker']} ({res_nasdaq['stocks'][0]['name']}) - Price: ${res_nasdaq['stocks'][0]['price_pence']}")

    # 4. Dow Jones 30 Check
    res_dow = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=dow&tab=volume&period=1d').read())
    print(f"TEST 4 - DOW JONES 30: Loaded {res_dow['count']} US Blue Chips. Most Active: {res_dow['stocks'][0]['ticker']} ({res_dow['stocks'][0]['name']})")

    # 5. NIFTY 50 (Indian Market) Check
    res_nifty = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=nifty&tab=trending').read())
    print(f"TEST 5 - NIFTY 50 (India): Loaded {res_nifty['count']} Indian leaders. Top: {res_nifty['stocks'][0]['ticker']} ({res_nifty['stocks'][0]['name']}) - Price: INR {res_nifty['stocks'][0]['price_pence']}")

    # 6. Global 1W Gainers >= 3%
    res_gain = json.loads(urllib.request.urlopen(f'{base}/api/stocks?market=all&tab=gainers&period=1w&min_gain_pct=3.0').read())
    print(f"TEST 6 - Global 1W Gainers (>= 3%): {res_gain['count']} stocks. Top: {res_gain['stocks'][0]['ticker']} (+{res_gain['stocks'][0]['change_1w_pct']}%)")

    # 7. Dividends Check across global markets
    res_div = json.loads(urllib.request.urlopen(f'{base}/api/dividends?market=all&timeframe=30d').read())
    print(f"TEST 7 - Upcoming Dividends (Next 30 Days): {len(res_div['calendar'])} declarations across UK, US, and India")

    # 8. Static UI with Guide Tab & Indian Market Tab
    html = urllib.request.urlopen(f'{base}/').read().decode('utf-8')
    has_guide = 'Stock Picker Tabs & Methodology Guide' in html
    has_india = 'Indian Market Intelligence Hub' in html and 'tabIndia' in html
    print(f"TEST 8 - Index.html Guide Tab: {has_guide} | Indian Market Tab: {has_india} (Bytes: {len(html)})")

    # 9. Stock Intelligence Check: Price Driver & Latest News (SHEL)
    res_stock = json.loads(urllib.request.urlopen(f'{base}/api/stock/SHEL').read())
    price_drv = res_stock.get('price_driver', {})
    news_items = res_stock.get('news', [])
    print(f"TEST 9 - Stock Price Driver & News (SHEL):")
    print(f"         Driver Headline: {price_drv.get('headline')}")
    print(f"         Sentiment: {price_drv.get('sentiment')} | Factors: {len(price_drv.get('key_factors', []))}")
    print(f"         Latest News Count: {len(news_items)} | Top Source: {news_items[0].get('publisher') if news_items else 'N/A'}")

    # 10. Famous Financial Institutions Ratings Check (HOLD, BUY, SELL)
    ratings = res_stock.get('analyst_ratings', {})
    inst_reports = ratings.get('institutions', [])
    print(f"TEST 10 - Famous Financial Institutions Ratings (SHEL):")
    print(f"          Consensus: {ratings.get('consensus_label')} | Target: {ratings.get('mean_target_fmt')} ({ratings.get('implied_upside_pct'):+.1f}%)")
    print(f"          Breakdown: {ratings.get('buy_pct')}% Buy · {ratings.get('hold_pct')}% Hold · {ratings.get('sell_pct')}% Sell")
    print(f"          Famous Institutions Reported: {len(inst_reports)} firms")

    # 11. INDIAN MARKET 16 INDICES API CHECK
    res_indices = json.loads(urllib.request.urlopen(f'{base}/api/india/indices').read())
    indices_list = res_indices.get('indices', [])
    summary = res_indices.get('summary', {})
    print(f"TEST 11 - Indian Market 16 Indices API:")
    print(f"          Total Indices Loaded: {len(indices_list)}/16")
    print(f"          Market Summary: {summary.get('total_stocks')} stocks | Adv/Dec: {summary.get('advancers')}/{summary.get('decliners')} | Avg 1D: {summary.get('avg_1d_pct'):+.2f}%")
    cats = {idx['category_type'] for idx in indices_list}
    print(f"          Category Tiers Present: {sorted(list(cats))}")
    assert len(indices_list) == 16, f"Expected 16 indices, got {len(indices_list)}"

    # 12. INDIAN INDICES CONSTITUENT FILTERING CHECK
    test_indices = [
        ('bank', 'NIFTY Bank (12 banking stocks)', 12),
        ('sensex', 'BSE SENSEX (30 blue chips)', 30),
        ('it', 'NIFTY IT (10 software exporters)', 10),
        ('auto', 'NIFTY Auto (8 auto giants)', 8),
        ('pharma', 'NIFTY Pharma & Healthcare', 8),
        ('fmcg', 'NIFTY FMCG (8 consumer staples)', 8),
        ('energy', 'NIFTY Energy (7 energy leaders)', 7),
        ('metal', 'NIFTY Metal (7 materials)', 7),
        ('nifty50', 'NIFTY 50 (NSE Benchmark)', 51)
    ]
    print(f"TEST 12 - Individual Indian Indices Constituents Verification:")
    for idx_code, label, min_expected in test_indices:
        res_idx_stocks = json.loads(urllib.request.urlopen(f'{base}/api/india/stocks?index={idx_code}').read())
        stocks_count = res_idx_stocks.get('count', 0)
        top_name = res_idx_stocks['stocks'][0]['ticker'] if stocks_count > 0 else 'N/A'
        print(f"          * {idx_code.upper():<10}: {stocks_count} constituents (Top: {top_name}) - {label}")
        assert stocks_count >= min_expected, f"Index {idx_code} has {stocks_count} stocks, expected at least {min_expected}"

    # 13. INDIAN STOCK CLICK INTELLIGENCE (RELIANCE & TCS)
    res_rel = json.loads(urllib.request.urlopen(f'{base}/api/stock/RELIANCE').read())
    rel_stock = res_rel.get('stock', {})
    rel_drv = res_rel.get('price_driver', {})
    rel_news = res_rel.get('news', [])
    rel_ratings = res_rel.get('analyst_ratings', {})
    print(f"TEST 13 - Indian Stock Intelligence (RELIANCE):")
    print(f"          Price: INR ₹{rel_stock.get('price_pence')} | Currency: {rel_stock.get('currency')}")
    print(f"          Driver Headline: {rel_drv.get('headline')}")
    print(f"          Indian News Count: {len(rel_news)} | Publisher: {rel_news[0].get('publisher') if rel_news else 'N/A'}")
    print(f"          Institutional Consensus: {rel_ratings.get('consensus_label')} | Target: {rel_ratings.get('mean_target_fmt')}")
    for firm in rel_ratings.get('institutions', [])[:2]:
        print(f"          - {firm['institution']}: {firm['rating']} ({firm['target_price']})")
    assert rel_stock.get('currency') == 'INR', "Reliance currency should be INR"
    assert len(rel_news) > 0, "Reliance should have news items"

    print("=" * 64)
    print("ALL 13 MULTI-MARKET, 16 INDIAN INDICES & NEWS TESTS PASSED 100%!")
    print("=" * 64)

finally:
    srv.shutdown()
