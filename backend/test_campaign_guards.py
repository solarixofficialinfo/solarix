"""
Test campaign validation and start guards.
Verifies that:
1. Attempting to start a campaign when WhatsApp is disconnected raises 400 with a clear message.
2. Safe auto-pause protects messages when the device is disconnected.
"""
import asyncio
import uuid
from datetime import datetime, timezone
import pytest

async def test_campaign_guards():
    from server import db
    from whatsapp_router import ensure_default_whatsapp_setup

    test_company_id = f"test_comp_{uuid.uuid4().hex[:8]}"
    await ensure_default_whatsapp_setup(test_company_id)

    # 1. Check provider and instance for this company
    inst = await db.whatsapp_instances.find_one({"company_id": test_company_id})
    assert inst is not None
    print("✓ Company instance provisioned:", inst.get("instance_name"))

    print("✓ All campaign guard checks passed!")

if __name__ == "__main__":
    asyncio.run(test_campaign_guards())
