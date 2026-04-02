import httpx
import logging
import asyncio
from tenacity import retry, wait_exponential, stop_after_attempt

logger = logging.getLogger(__name__)

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
async def _send_webhook(url: str, payload: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=5.0)
        response.raise_for_status()

async def notify_webhooks(webhooks, price_changes):
    if not price_changes or not webhooks:
        return
    
    payload = {
        "event": "price_change_detected",
        "changes": price_changes
    }
    
    # We could send payload individually or batched. Here we batch them.
    for webhook in webhooks:
        try:
            # Create async task so it doesn't block
            asyncio.create_task(_send_webhook(webhook.target_url, payload))
        except Exception as e:
            logger.error(f"Failed to initiate webhook for {webhook.target_url}: {e}")
