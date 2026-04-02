# Entrupy Engineering - Product Price Monitoring System

This is a full-stack solution for monitoring competitor pricing across e-commerce marketplaces.

## 🚀 How to Run It

### Prerequisites
- Python 3.9+
- Node.js 18+

### 1. Start the Backend API
1. Open a terminal and navigate to the project root.
2. Initialize and activate the virtual environment:
   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate
   
   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. Start the FastAPI server (runs on `http://localhost:8000`):
   ```bash
   # Start from the project root directory
   # Since main.py is in the backend module:
   uvicorn backend.main:app --reload
   ```

### 2. Start the Frontend Dashboard
1. Open a new terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server (runs on `http://localhost:5173`):
   ```bash
   npm run dev
   ```

### 3. Usage
1. Open the frontend in your browser at `http://localhost:5173`.
2. Click **"Connect to API"** to auto-register your client and receive an API Key.
3. Click **"Trigger Data Refresh"** heavily populated the SQLite database with mockup scraped data.
4. Browse products, their price histories, and market statistics!

---

## 📖 API Documentation

The API uses API-Key authentication. Add `X-API-KEY: <your-key>` to all secure requests.
Automatic Swagger UI docs can be accessed at `http://localhost:8000/docs` while the server is running.

### Key Endpoints:

- `POST /consumers/register?name={name}`
  - Registers a new consumer and returns an `api_key`. (No auth needed)
- `POST /data/refresh`
  - Triggers the async ingestion/scraping script to poll upstream sources.
  - Returns `{"status": "success", "message": "..."}`
- `GET /stats`
  - Returns aggregate data (counts, averages by category).
- `GET /products`
  - Returns a paginated list of tracked products.
- `GET /products/{id}`
  - Returns product details, including full `price_history`.
- `POST /webhooks`
  - Registers a webhook URL. Body: `{"target_url": "https://yourapp.com/hook"}`.

---

## 📐 Design Decisions

### 1. Scaling the Price History Table
**How does price history scale with millions of rows?**
- Currently, it's stored in SQLite as a relational table `price_history` with foreign keys to `products`. 
- To scale to millions of rows, we would migrate from SQLite to **PostgreSQL**.
- We'd apply **Table Partitioning** by time (e.g., partitioning `price_history` monthly) so that recent data lookups are fast.
- We would also add an index on `(product_id, timestamp)`.

### 2. Notifications Architecture
**How are notifications implemented?**
- A **Webhook dispatch system** was chosen. The system loops over registered consumers listening for changes.
- Upon a data refresh, any price difference detected triggers a background task (`asyncio.create_task` combined with `tenacity` retries).
- Why this over polling? Webhooks push data securely only when an event occurs, minimizing load on the database compared to clients constantly polling the `/products` endpoint.

### 3. Extending to 100+ Data Sources
**How would you extend this system?**
- To accommodate 100+ sources, the `scraper.py` module should be spun off into distributed worker queues (e.g., Celery or AWS SQS / Lambdas).
- The central API would simply ingest payloads published by these remote scrapers.
- We'd implement an overarching abstract `ScraperNode` strategy pattern, where each API source maintains its own mapping parser for fields.

---

## 🛠 Known Limitations & Enhancements

- **Data Models**: Because the dataset wasn't provided, the schemas assume basic e-commerce strings. Real parsing might require more nested JSON extraction.
- **SQLite Concurrency**: SQLite locks the whole database during writes. Under high ingestion loads from 100+ sources, it WILL bottleneck. PostgreSQL is strictly necessary for production.
- **Auth Robustness**: API Keys are currently stored in plain text and checked raw. In a fully robust system, keys should be hashed.
