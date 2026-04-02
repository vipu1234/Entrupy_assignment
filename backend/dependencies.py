from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from . import database, crud

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_consumer(x_api_key: str = Header(None), db: Session = Depends(get_db)):
    if not x_api_key:
        raise HTTPException(status_code=403, detail="API Key is missing")
    consumer = crud.get_consumer_by_api_key(db, api_key=x_api_key)
    if not consumer:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    # Track usage per request
    crud.increment_consumer_usage(db, consumer)
    return consumer
