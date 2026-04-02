import sqlite3
import json
import logging
import asyncio
import threading
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
from .scraper import fetch_all_data

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
    """)
    conn.commit()
    conn.close()

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
    return consumer, None, 200

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
    by_source = {row[0]: row[1] for row in c.fetchall()}

    c.execute("SELECT category, AVG(current_price) FROM products GROUP BY category")
    avg_price_by_category = {row[0]: row[1] for row in c.fetchall()}
    conn.close()

    return jsonify({
        "total_products": total,
        "by_source": by_source,
        "avg_price_by_category": avg_price_by_category
    })

@app.route("/products", methods=["GET"])
def get_products():
    consumer, err, status = check_auth(request)
    if err: return jsonify(err), status
    
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM products ORDER BY id DESC LIMIT 100")
    products = [dict(row) for row in c.fetchall()]
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

def run_async_scrape_and_notify(consumer_id):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Run fetch_all_data inside the loop
    from .scraper import fetch_all_data
    from .tasks import notify_webhooks, _send_webhook
    items_data = loop.run_until_complete(fetch_all_data())
    
    conn = get_db()
    c = conn.cursor()
    price_changes = []
    
    for item in items_data:
        now = datetime.now(timezone.utc).isoformat()
        c.execute("SELECT id, current_price FROM products WHERE external_id = ?", (item["external_id"],))
        existing = c.fetchone()
        if existing:
            if existing["current_price"] != item["current_price"]:
                price_changes.append(item["external_id"])
                c.execute("UPDATE products SET current_price = ?, updated_at = ? WHERE id = ?", 
                          (item["current_price"], now, existing["id"]))
                c.execute("INSERT INTO price_history (product_id, price, timestamp) VALUES (?, ?, ?)", 
                          (existing["id"], item["current_price"], now))
        else:
            price_changes.append(item["external_id"])
            c.execute("""
                INSERT INTO products (external_id, source, category, brand, title, url, current_price, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (item["external_id"], item["source"], item["category"], item["brand"], item["title"], item["url"], item["current_price"], now, now))
            db_product_id = c.lastrowid
            c.execute("INSERT INTO price_history (product_id, price, timestamp) VALUES (?, ?, ?)", 
                      (db_product_id, item["current_price"], now))
    conn.commit()

    if price_changes:
        c.execute("SELECT target_url FROM webhooks WHERE active = 1")
        webhooks = [dict(row) for row in c.fetchall()]
        
        payload = {"event": "price_change_detected", "changes": price_changes}
        for wh in webhooks:
            try:
                loop.run_until_complete(_send_webhook(wh["target_url"], payload))
            except Exception:
                pass
    conn.close()
    loop.close()

@app.route("/data/refresh", methods=["POST"])
def trigger_refresh():
    consumer, err, status = check_auth(request)
    if err: return jsonify(err), status
    
    # Start background thread
    t = threading.Thread(target=run_async_scrape_and_notify, args=(consumer["id"],))
    t.start()
    return jsonify({"status": "success", "message": "Data refresh triggered in the background."})

if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=8000)
