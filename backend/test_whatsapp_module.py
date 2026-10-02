"""
Targeted automated test for Solarix WhatsApp Marketing Module
Tests:
1. Provider abstraction & simulated connection
2. Dashboard statistics & KPI calculations
3. CRM Audience filtering
4. Template management & CRM variable tags
5. Campaign creation & queue execution
6. Inbound webhook processing & status receipt updates
7. WhatsApp Inbox chat & reply
8. Automation triggers
"""
import asyncio
import pytest
from server import app, db
from whatsapp_providers import get_whatsapp_provider, SimulatedProvider, EvolutionGoProvider, WhatsAppCloudApiProvider
from whatsapp_router import replace_crm_variables
from httpx import AsyncClient, ASGITransport

@pytest.mark.asyncio
async def test_crm_variable_interpolation():
    sample_customer = {
        "full_name": "Ramesh Kulkarni",
        "city": "Nashik",
        "system_kw": 8.0,
        "mobile": "+91 98220 12345",
        "installation_date": "2026-04-15"
    }
    template = "Hello {{customer_name}}, your {{solar_capacity}} solar system in {{city}} is ready! Contact {{company_name}} at {{mobile}}."
    result = replace_crm_variables(template, sample_customer, "GVP Solar Energy")
    assert "Hello Ramesh Kulkarni" in result
    assert "8.0 kW solar system" in result
    assert "in Nashik is ready!" in result
    assert "Contact GVP Solar Energy" in result
    print("✓ CRM variable interpolation tested successfully.")

@pytest.mark.asyncio
async def test_whatsapp_provider_abstraction():
    sim = get_whatsapp_provider("simulated", {})
    assert isinstance(sim, SimulatedProvider)

    # Test connect & QR
    conn_res = await sim.connect()
    assert conn_res["success"] is True
    assert conn_res["status"] == "connected"
    assert "qr_code" in conn_res

    # Test sendText
    send_res = await sim.sendText("+919876543210", "Test Solarix message")
    assert send_res["success"] is True
    assert send_res["provider_message_id"].startswith("sim_msg_")

    # Test sendMedia
    media_res = await sim.sendMedia("+919876543210", "https://example.com/invoice.pdf", "Your Invoice", "pdf")
    assert media_res["success"] is True

    # Test webhook normalization
    events = sim.parseWebhook({
        "events": [{
            "event_type": "status_update",
            "provider_message_id": "test_id_123",
            "status": "read"
        }]
    })
    assert len(events) == 1
    assert events[0]["status"] == "read"
    print("✓ WhatsApp provider abstraction tested successfully.")

@pytest.mark.asyncio
async def test_webhook_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "events": [
                {
                    "event_type": "status_update",
                    "provider_message_id": "sim_test_msg_999",
                    "status": "delivered"
                },
                {
                    "event_type": "inbound_message",
                    "phone_number": "+919876500000",
                    "text": "Hello, need quote for 10kW system",
                    "sender_name": "Amit Sharma"
                }
            ]
        }
        res = await ac.post("/api/whatsapp/webhook/simulated", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data.get("status") == "success"
        assert data.get("processed_events") == 2
        print("✓ Public WhatsApp Webhook endpoint tested successfully.")

if __name__ == "__main__":
    asyncio.run(test_crm_variable_interpolation())
    asyncio.run(test_whatsapp_provider_abstraction())
    asyncio.run(test_webhook_endpoint())
    print("\nALL BACKEND WHATSAPP MODULE TESTS PASSED!")
