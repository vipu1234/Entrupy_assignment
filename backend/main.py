from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager

from . import models, schemas, crud, scraper, tasks
from .database import engine, Base, SessionLocal
from .dependencies import get_db, get_current_consumer

# Create DB tables
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Optional: startup logic, initial data fetch etc.
    yield

app = FastAPI(title="Price Monitoring API", lifespan=lifespan)

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/consumers/register", response_model=schemas.ConsumerResponse)
def register_consumer(name: str, db: Session = Depends(get_db)):
    import secrets
    api_key = secrets.token_hex(16)
    return crud.create_consumer(db, name, api_key)

@app.post("/webhooks", response_model=dict)
def register_webhook(
    webhook: schemas.WebhookRegister,
    db: Session = Depends(get_db),
    current_consumer: models.Consumer = Depends(get_current_consumer)
):
    crud.register_webhook(db, current_consumer.id, webhook.target_url)
    return {"status": "success", "message": "Webhook registered"}

@app.post("/data/refresh")
async def trigger_refresh(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_consumer: models.Consumer = Depends(get_current_consumer)
):
    # 1. Fetch from mock api
    items_data = await scraper.fetch_all_data()
    
    # 2. Update database and collect changes
    price_changes = []
    for item in items_data:
        product_in = schemas.ProductCreate(**item)
        db_product, changed = crud.update_or_create_product(db, product_in)
        if changed:
            price_changes.append(db_product.external_id)
            
    # 3. Trigger webhooks if there are changes
    if price_changes:
        webhooks = crud.get_webhooks(db)
        background_tasks.add_task(tasks.notify_webhooks, webhooks, price_changes)
        
    return {"status": "success", "message": f"Data refresh triggered. {len(price_changes)} price changes detected."}

@app.get("/products", response_model=List[schemas.ProductResponse])
def get_products(
    skip: int = 0, limit: int = 100,
    category: str = None, source: str = None,
    min_price: float = None, max_price: float = None,
    db: Session = Depends(get_db),
    current_consumer: models.Consumer = Depends(get_current_consumer)
):
    products = crud.get_products(
        db, skip=skip, limit=limit, 
        category=category, source=source, 
        min_price=min_price, max_price=max_price
    )
    return products

@app.get("/products/{product_id}", response_model=schemas.ProductDetailResponse)
def get_product(
    product_id: int, 
    db: Session = Depends(get_db),
    current_consumer: models.Consumer = Depends(get_current_consumer)
):
    product = crud.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.get("/stats", response_model=schemas.StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    current_consumer: models.Consumer = Depends(get_current_consumer)
):
    return crud.get_stats(db)
