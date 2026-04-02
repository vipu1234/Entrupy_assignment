import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import Base, engine

# Make sure tables are created
Base.metadata.create_all(bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module")
def api_key():
    response = client.post("/consumers/register?name=TestUser")
    assert response.status_code == 200
    return response.json()["api_key"]

def test_get_stats_unauthorized():
    response = client.get("/stats")
    assert response.status_code == 403

def test_data_refresh(api_key):
    headers = {"X-API-KEY": api_key}
    response = client.post("/data/refresh", headers=headers)
    assert response.status_code == 200
    assert "Data refresh triggered" in response.json()["message"]

def test_get_stats(api_key):
    headers = {"X-API-KEY": api_key}
    response = client.get("/stats", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_products" in data

def test_get_products(api_key):
    headers = {"X-API-KEY": api_key}
    response = client.get("/products", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
