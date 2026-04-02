from sqlalchemy.orm import Session
from sqlalchemy import func
from . import models, schemas
import datetime

def get_product(db: Session, product_id: int):
    return db.query(models.Product).filter(models.Product.id == product_id).first()

def get_product_by_external_id(db: Session, external_id: str):
    return db.query(models.Product).filter(models.Product.external_id == external_id).first()

def get_products(db: Session, skip: int = 0, limit: int = 100, category: str = None, source: str = None, min_price: float = None, max_price: float = None):
    query = db.query(models.Product)
    if category:
        query = query.filter(models.Product.category == category)
    if source:
        query = query.filter(models.Product.source == source)
    if min_price is not None:
        query = query.filter(models.Product.current_price >= min_price)
    if max_price is not None:
        query = query.filter(models.Product.current_price <= max_price)
    return query.offset(skip).limit(limit).all()

def update_or_create_product(db: Session, product_in: schemas.ProductCreate):
    # fallback if model_dump not available in pydantic 2.5
    data = product_in.model_dump()
    db_product = get_product_by_external_id(db, data["external_id"])
    price_changed = False
    
    if db_product:
        if db_product.current_price != data["current_price"]:
            price_changed = True
            db_product.current_price = data["current_price"]
            db_product.updated_at = datetime.datetime.utcnow()
            
            # create price history
            history = models.PriceHistory(product_id=db_product.id, price=data["current_price"])
            db.add(history)
            
        for key, value in data.items():
            if key != "current_price":
                setattr(db_product, key, value)
    else:
        db_product = models.Product(**data)
        db.add(db_product)
        db.commit() # commit to get id
        db.refresh(db_product)
        
        history = models.PriceHistory(product_id=db_product.id, price=data["current_price"])
        db.add(history)
        price_changed = True
        
    db.commit()
    db.refresh(db_product)
    
    return db_product, price_changed

def get_stats(db: Session):
    total = db.query(models.Product).count()
    by_source = dict(db.query(models.Product.source, func.count(models.Product.id)).group_by(models.Product.source).all())
    avg_price_by_category = dict(db.query(models.Product.category, func.avg(models.Product.current_price)).group_by(models.Product.category).all())
    
    return {
        "total_products": total,
        "by_source": {k: v for k, v in by_source.items() if k},
        "avg_price_by_category": {k: (v if v is not None else 0.0) for k, v in avg_price_by_category.items() if k}
    }

def get_consumer_by_api_key(db: Session, api_key: str):
    return db.query(models.Consumer).filter(models.Consumer.api_key == api_key).first()

def increment_consumer_usage(db: Session, consumer: models.Consumer):
    consumer.request_count += 1
    db.commit()

def create_consumer(db: Session, name: str, api_key: str):
    db_consumer = models.Consumer(name=name, api_key=api_key)
    db.add(db_consumer)
    db.commit()
    db.refresh(db_consumer)
    return db_consumer

def get_webhooks(db: Session):
    return db.query(models.Webhook).filter(models.Webhook.active == True).all()

def register_webhook(db: Session, consumer_id: int, target_url: str):
    webhook = models.Webhook(consumer_id=consumer_id, target_url=target_url)
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    return webhook
