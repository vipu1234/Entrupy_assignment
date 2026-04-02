import sqlite3
import json
import logging
import asyncio
import threading
import random
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH = "sql_app.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS consumers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            api_key TEXT UNIQUE,
            request_count INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            external_id TEXT UNIQUE,
            source TEXT,
            category TEXT,
            brand TEXT,
            title TEXT,
            description TEXT,
            url TEXT,
            current_price REAL,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            price REAL,
            timestamp TEXT,
            FOREIGN KEY(product_id) REFERENCES products(id)
        );
        CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            consumer_id INTEGER,
            target_url TEXT,
            active INTEGER DEFAULT 1,
            failure_count INTEGER DEFAULT 0,
            FOREIGN KEY(consumer_id) REFERENCES consumers(id)
        );
        CREATE TABLE IF NOT EXISTS wishlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            consumer_id INTEGER,
            product_id INTEGER,
            FOREIGN KEY(consumer_id) REFERENCES consumers(id),
            FOREIGN KEY(product_id) REFERENCES products(id),
            UNIQUE(consumer_id, product_id)
        );
    """)
    conn.commit()
    
    # Check if we need to seed
    c.execute("SELECT COUNT(*) FROM products")
    if c.fetchone()[0] == 0:
        seed_mock_data(conn)
        
    conn.close()

def seed_mock_data(conn):
    c = conn.cursor()
    SOURCES = ["Grailed", "Fashionphile", "1stdibs"]
    CATEGORIES = ["Bags", "Shoes", "Accessories", "Clothing"]
    BRANDS = ["Chanel", "Hermes", "Louis Vuitton", "Gucci", "Prada"]
    
    now = datetime.now(timezone.utc)
    for i in range(1, 101):
        ext_id = f"item_{i}"
        source = random.choice(SOURCES)
        cat = random.choice(CATEGORIES)
        brand = random.choice(BRANDS)
        price = round(random.uniform(500, 5000), 2)
        created = now - timedelta(days=30)
        
        c.execute("""
            INSERT INTO products (external_id, source, category, brand, title, url, current_price, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (ext_id, source, cat, brand, f"Vintage {brand} {cat[:-1]}", f"http://example.com/item/{i}", price, created.isoformat(), now.isoformat()))
        p_id = c.lastrowid
        
        # Generate 30 days of price history
        curr_p = price
        for day in range(30, -1, -1):
            if random.random() < 0.2: # 20% chance to change price on a given day
                curr_p += random.uniform(-50, 50)
                curr_p = max(10, round(curr_p, 2))
            
            p_time = now - timedelta(days=day)
            c.execute("INSERT INTO price_history (product_id, price, timestamp) VALUES (?, ?, ?)", 
                      (p_id, curr_p, p_time.isoformat()))
            
        c.execute("UPDATE products SET current_price = ? WHERE id = ?", (curr_p, p_id))

    conn.commit()

init_db()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def check_auth(req):
    api_key = req.headers.get("X-API-KEY")
    if not api_key:
        return None, {"error": "API Key is missing"}, 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM consumers WHERE api_key = ?", (api_key,))
    consumer = c.fetchone()
    if not consumer:
        conn.close()
        return None, {"error": "Invalid API Key"}, 403
    
    c.execute("UPDATE consumers SET request_count = request_count + 1 WHERE id = ?", (consumer["id"],))
    conn.commit()
    return dict(consumer), None, 200

@app.route("/consumers/register", methods=["POST"])
def register_consumer():
    name = request.args.get("name")
    if not name:
        return jsonify({"error": "name is required"}), 400
    import secrets
    api_key = secrets.token_hex(16)
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute("INSERT INTO consumers (name, api_key) VALUES (?, ?)", (name, api_key))
        conn.commit()
        consumer_id = c.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Consumer name already exists"}), 400
    conn.close()
    return jsonify({"id": consumer_id, "name": name, "api_key": api_key})

@app.route("/stats", methods=["GET"])
def get_stats():
    consumer, err, status = check_auth(request)
    if err: return jsonify(err), status
    
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(id) FROM products")
    total = c.fetchone()[0]

    c.execute("SELECT source, COUNT(id) FROM products GROUP BY source")
    by_source = {row["source"]: row[1] for row in c.fetchall()}

    c.execute("SELECT category, AVG(current_price) as avg_p FROM products GROUP BY category")
    avg_price_by_category = {row["category"]: row["avg_p"] for row in c.fetchall()}
    
    try:
        # Group by date for the area chart
        c.execute('''
            SELECT p.category, 
                   AVG(ph.price) as avg_price, 
                   date(ph.timestamp) as tdate
            FROM price_history ph 
            JOIN products p ON p.id = ph.product_id
            GROUP BY p.category, date(ph.timestamp)
            ORDER BY tdate ASC
        ''')
        trend_rows = c.fetchall()
        dates_map = {}
        for row in trend_rows:
            d = row["tdate"]
            if d not in dates_map: dates_map[d] = {"date": d}
            dates_map[d][row["category"]] = round(row["avg_price"], 2)
        trend_data = list(dates_map.values())
    except Exception:
        trend_data = []

    conn.close()
    return jsonify({
        "total_products": total,
        "by_source": by_source,
        "avg_price_by_category": avg_price_by_category,
        "category_trends": trend_data
    })

@app.route("/products", methods=["GET"])
def get_products():
    consumer, err, status = check_auth(request)
    if err: return jsonify(err), status
    
    min_price = request.args.get("min_price", type=float)
    max_price = request.args.get("max_price", type=float)
    source = request.args.get("source")
    category = request.args.get("category")
    search = request.args.get("search", "")
    sort_by = request.args.get("sort_by", "highest_price")
    wishlist_only = request.args.get("wishlist", "false") == "true"

    query = "SELECT p.*, (SELECT COUNT(*) FROM wishlists w WHERE w.product_id = p.id AND w.consumer_id = ?) as is_wishlisted FROM products p"
    if wishlist_only:
        query += " JOIN wishlists w2 ON w2.product_id = p.id AND w2.consumer_id = ?"
    query += " WHERE 1=1"
    
    params = [consumer["id"]]
    if wishlist_only:
        params.append(consumer["id"])
    
    if min_price is not None:
        query += " AND p.current_price >= ?"
        params.append(min_price)
    if max_price is not None:
        query += " AND p.current_price <= ?"
        params.append(max_price)
    if source:
        query += " AND p.source = ?"
        params.append(source)
    if category:
        query += " AND p.category = ?"
        params.append(category)
    if search:
        query += " AND (p.title LIKE ? OR p.brand LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
        
    if sort_by == "highest_price":
        query += " ORDER BY p.current_price DESC"
    elif sort_by == "lowest_price":
        query += " ORDER BY p.current_price ASC"
    elif sort_by == "recent":
        query += " ORDER BY p.updated_at DESC"
    else:
        query += " ORDER BY p.id DESC"
        
    query += " LIMIT 100"
    
    conn = get_db()
    c = conn.cursor()
    c.execute(query, tuple(params))
    
    products = []
    for row in c.fetchall():
        d = dict(row)
        d["is_wishlisted"] = bool(d["is_wishlisted"])
        
        # Smart Feature: AI Prediction Mock heuristic
        if d["current_price"] < 1000:
            d["ai_prediction"] = "Price is optimal. High probability of increasing soon."
            d["ai_sentiment"] = "BUY"
        elif d["current_price"] > 3000:
            d["ai_prediction"] = "Price anomaly detected. Expected to drop in 48 hours."
            d["ai_sentiment"] = "WAIT"
        else:
            d["ai_prediction"] = "Stable pricing. Routine market evaluation."
            d["ai_sentiment"] = "NEUTRAL"
            
        products.append(d)

    conn.close()
    return jsonify(products)

@app.route("/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    consumer, err, status = check_auth(request)
    if err: return jsonify(err), status

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    product = c.fetchone()
    if not product:
        conn.close()
        return jsonify({"error": "Product not found"}), 404
    product = dict(product)
    
    c.execute("SELECT * FROM price_history WHERE product_id = ? ORDER BY timestamp DESC", (product_id,))
    product["price_history"] = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(product)

@app.route("/wishlist/<int:product_id>", methods=["POST"])
def toggle_wishlist(product_id):
    consumer, err, status = check_auth(request)
    if err: return jsonify(err), status

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM wishlists WHERE consumer_id = ? AND product_id = ?", (consumer["id"], product_id))
    entry = c.fetchone()
    if entry:
        c.execute("DELETE FROM wishlists WHERE id = ?", (entry["id"],))
        action = "removed"
    else:
        c.execute("INSERT INTO wishlists (consumer_id, product_id) VALUES (?, ?)", (consumer["id"], product_id))
        action = "added"
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "action": action})

def run_async_scrape_and_notify(consumer_id):
    # Simulate a fetch updating existing item prices
    now = datetime.now(timezone.utc)
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM products ORDER BY RANDOM() LIMIT 20")
    items = c.fetchall()
    
    price_changes = []
    for item in items:
        # Mutate price
        new_price = item["current_price"] + random.uniform(-200, 200)
        new_price = max(10, round(new_price, 2))
        
        if new_price != item["current_price"]:
            price_changes.append(item["external_id"])
            c.execute("UPDATE products SET current_price = ?, updated_at = ? WHERE id = ?", 
                      (new_price, now.isoformat(), item["id"]))
            c.execute("INSERT INTO price_history (product_id, price, timestamp) VALUES (?, ?, ?)", 
                      (item["id"], new_price, now.isoformat()))
    
    conn.commit()

    if price_changes:
        c.execute("SELECT target_url FROM webhooks WHERE active = 1")
        webhooks = [dict(row) for row in c.fetchall()]
        # We're skipping the actual webhook dispatching for mock
    conn.close()

@app.route("/data/refresh", methods=["POST"])
def trigger_refresh():
    consumer, err, status = check_auth(request)
    if err: return jsonify(err), status
    t = threading.Thread(target=run_async_scrape_and_notify, args=(consumer["id"],))
    t.start()
    return jsonify({"status": "success", "message": "Data refresh triggered. Tracking 20 new changes."})

if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=8000)
