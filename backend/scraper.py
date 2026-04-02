import asyncio
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
import random

SOURCES = ["Grailed", "Fashionphile", "1stdibs"]
CATEGORIES = ["Bags", "Shoes", "Accessories", "Clothing"]

# Initial state for mock data
mock_db = [
    {
        "external_id": f"item_{i}",
        "source": random.choice(SOURCES),
        "category": random.choice(CATEGORIES),
        "brand": "Chanel" if i % 2 == 0 else "Hermes",
        "title": f"Vintage Item {i}",
        "url": f"http://example.com/item/{i}",
        "current_price": round(random.uniform(500, 5000), 2)
    } for i in range(1, 101)
]

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
async def fetch_data_from_source(source: str):
    # simulate network delay
    await asyncio.sleep(random.uniform(0.1, 0.5))
    # simulate occasional network failure
    if random.random() < 0.1:
        raise Exception(f"Failed to fetch data from {source}")
    
    data = [item.copy() for item in mock_db if item["source"] == source]
    # randomly mutate some prices to simulate changes
    for item in data:
        if random.random() < 0.3:
            item["current_price"] += random.uniform(-100, 100)
            item["current_price"] = round(max(item["current_price"], 10.0), 2)
    return data
    
async def fetch_all_data():
    results = []
    # Fetch concurrently for performance
    tasks = [fetch_data_from_source(source) for source in SOURCES]
    res_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    for res in res_list:
        if isinstance(res, Exception):
            print(f"Error fetching from source: {res}")
        else:
            results.extend(res)
    return results
