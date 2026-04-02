from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class PriceHistoryResponse(BaseModel):
    id: int
    price: float
    timestamp: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ProductBase(BaseModel):
    external_id: str
    source: str
    category: str
    brand: str
    title: str
    description: Optional[str] = None
    url: str
    current_price: Optional[float] = None

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
    
class ProductDetailResponse(ProductResponse):
    price_history: List[PriceHistoryResponse] = []

class StatsResponse(BaseModel):
    total_products: int
    by_source: dict[str, int]
    avg_price_by_category: dict[str, float]

class WebhookRegister(BaseModel):
    target_url: str

class ConsumerResponse(BaseModel):
    id: int
    name: str
    api_key: str
    
    model_config = ConfigDict(from_attributes=True)
