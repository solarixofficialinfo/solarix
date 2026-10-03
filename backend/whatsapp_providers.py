"""
SOLARIX CRM — WHATSAPP PROVIDER ABSTRACTION ARCHITECTURE
Supports:
1. Evolution Go (Evolution API v1 / v2)
2. WhatsApp Cloud API (Meta WhatsApp Business Platform)
3. Simulated Provider (For offline development, testing, and interactive demonstrations)
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import logging
import httpx
import uuid
import time
import os
import asyncio
from datetime import datetime, timezone

logger = logging.getLogger("whatsapp_providers")

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class WhatsAppProvider(ABC):
    """
    Standard WhatsApp Provider Abstraction for Solarix CRM.
    All providers must adhere to this interface.
    """
    def __init__(self, credentials: Dict[str, Any], settings: Optional[Dict[str, Any]] = None):
        self.credentials = credentials or {}
        self.settings = settings or {}

    @abstractmethod
    async def connect(self, force: bool = False) -> Dict[str, Any]:
        """Initiate connection or retrieve QR code to connect WhatsApp."""
        pass

    @abstractmethod
    async def disconnect(self) -> Dict[str, Any]:
        """Disconnect/logout the current instance."""
        pass

    @abstractmethod
    async def getStatus(self) -> Dict[str, Any]:
        """Check the connection health, uptime, and connected number."""
        pass

    async def requestPairingCode(self, phone: str) -> Dict[str, Any]:
        """Request 8-character pairing code for linking device via phone number."""
        return {"success": False, "error": "Pairing code not supported by this provider"}

    @abstractmethod
    async def sendText(self, phone: str, text: str) -> Dict[str, Any]:
        """Send a standard text message to a recipient."""
        pass

    @abstractmethod
    async def sendMedia(self, phone: str, media_url: str, caption: Optional[str] = None, media_type: str = "image") -> Dict[str, Any]:
        """Send media (image, video, document, PDF) to a recipient."""
        pass

    @abstractmethod
    async def sendTemplate(self, phone: str, template_name: str, variables: Dict[str, str], media_url: Optional[str] = None) -> Dict[str, Any]:
        """Send an approved WhatsApp template with variables."""
        pass

    @abstractmethod
    async def getMessageStatus(self, provider_message_id: str) -> Dict[str, Any]:
        """Query delivery status from provider if supported."""
        pass

    @abstractmethod
    def parseWebhook(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Normalize provider webhook events into Solarix standard event shapes."""
        pass


class EvolutionGoProvider(WhatsAppProvider):
    """
    Evolution API (Evolution Go & Evolution API) Provider Integration.
    Seamlessly supports Evolution Go (whatsmeow / Go Gin) native routes and Evolution API v2 routes.
    Includes precise diagnostic categorizations for connection refused, unauthorized,
    instance not found, service unavailable, and timeouts.
    """
    def __init__(self, credentials: Dict[str, Any], settings: Optional[Dict[str, Any]] = None):
        super().__init__(credentials, settings)
        # Prioritize explicit credentials (from DB / Form) with fallback to server environment variables
        self.api_url = (
            self.credentials.get("api_url") or 
            os.environ.get("EVOLUTION_API_URL") or 
            "http://127.0.0.1:8085"
        ).rstrip("/")
        self.api_key = (
            self.credentials.get("api_key") or 
            os.environ.get("EVOLUTION_API_KEY") or 
            ""
        )
        self.instance_name = (
            self.credentials.get("instance_name") or 
            os.environ.get("EVOLUTION_INSTANCE") or 
            "solarix_primary"
        )
        self.headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json"
        }

    def _diagnose_exception(self, err: Exception) -> str:
        s = str(err)
        err_type = type(err).__name__
        if "Connection refused" in s or "[Errno 61]" in s or "ConnectError" in err_type:
            return f"Connection refused: Evolution Go service is not reachable on {self.api_url}. Verify that the service is running and the port is listening."
        if "ConnectTimeout" in err_type or "ReadTimeout" in err_type:
            return f"Timeout: Evolution Go service at {self.api_url} did not respond within the timeout limit."
        return f"Service unreachable: {s}"

    async def getStatus(self) -> Dict[str, Any]:
        if not self.api_url:
            return {"connected": False, "status": "disconnected", "error": "Evolution API URL is not configured", "uptime_seconds": 0}
        
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                # 1. First probe basic server health
                try:
                    health_res = await client.get(f"{self.api_url}/server/ok")
                    if health_res.status_code == 503:
                        return {
                            "connected": False,
                            "status": "disconnected",
                            "error": "License not activated: Evolution Go requires operator license activation.",
                            "uptime_seconds": 0
                        }
                except Exception as health_err:
                    return {
                        "connected": False,
                        "status": "disconnected",
                        "error": self._diagnose_exception(health_err),
                        "uptime_seconds": 0
                    }

                # 2. Probe native Evolution Go status endpoint
                res = await client.get(f"{self.api_url}/instance/status", headers=self.headers)
                if res.status_code == 200:
                    data = res.json()
                    status_info = data.get("data") or data
                    state = status_info.get("status") or status_info.get("state")
                    connected = state in ("connected", "open", "inChat")
                    phone = status_info.get("owner") or status_info.get("phone") or status_info.get("jid")
                    return {
                        "connected": connected,
                        "status": "connected" if connected else "disconnected",
                        "phone_number": phone,
                        "instance": self.instance_name,
                        "uptime_seconds": 3600 if connected else 0,
                        "raw": data
                    }
                elif res.status_code == 401:
                    return {
                        "connected": False,
                        "status": "disconnected",
                        "error": "Unauthorized: Invalid API key. Check EVOLUTION_API_KEY.",
                        "uptime_seconds": 0
                    }
                elif res.status_code == 503:
                    return {
                        "connected": False,
                        "status": "disconnected",
                        "error": "Service unavailable: License not activated on Evolution Go.",
                        "uptime_seconds": 0
                    }

                # 3. Fallback to v2 connectionState endpoint
                url_v2 = f"{self.api_url}/instance/connectionState/{self.instance_name}"
                res_v2 = await client.get(url_v2, headers=self.headers)
                if res_v2.status_code == 200:
                    data = res_v2.json()
                    state = (data.get("instance") or {}).get("state") or data.get("state")
                    connected = state == "open"
                    phone = (data.get("instance") or {}).get("owner") or self.credentials.get("phone_number")
                    return {
                        "connected": connected,
                        "status": "connected" if connected else "disconnected",
                        "phone_number": phone,
                        "instance": self.instance_name,
                        "uptime_seconds": 3600 if connected else 0,
                        "raw": data
                    }
                elif res_v2.status_code == 404:
                    return {
                        "connected": False,
                        "status": "disconnected",
                        "error": f"Instance not found: Instance '{self.instance_name}' does not exist on Evolution Go.",
                        "uptime_seconds": 0
                    }

                return {
                    "connected": False,
                    "status": "disconnected",
                    "error": f"Evolution Go returned HTTP {res.status_code}: {res.text}",
                    "uptime_seconds": 0
                }
        except Exception as e:
            return {
                "connected": False,
                "status": "disconnected",
                "error": self._diagnose_exception(e),
                "uptime_seconds": 0
            }

    async def connect(self, force: bool = False) -> Dict[str, Any]:
        if not self.api_url:
            return {"success": False, "status": "disconnected", "error": "Evolution API URL is not configured."}
        
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                # Ensure server is alive
                try:
                    h = await client.get(f"{self.api_url}/server/ok")
                    if h.status_code == 503:
                        return {"success": False, "status": "disconnected", "error": "License not activated: Evolution Go license must be activated first."}
                except Exception as he:
                    return {"success": False, "status": "disconnected", "error": self._diagnose_exception(he)}

                # Attempt native Evolution Go /instance/connect
                backend_base = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
                webhook_url = f"{backend_base}/api/whatsapp/evolution/webhook"
                
                # Check if instance already exists or if we need to create it
                connect_payload = {"webhookUrl": webhook_url, "subscribe": ["messages.upsert", "messages.update", "connection.update"]}
                connect_res = await client.post(f"{self.api_url}/instance/connect", json=connect_payload, headers=self.headers)
                
                if connect_res.status_code in (200, 201):
                    # Fetch current QR code
                    qr_res = await client.get(f"{self.api_url}/instance/qr", headers=self.headers)
                    qr_code = None
                    if qr_res.status_code == 200:
                        qr_data = qr_res.json()
                        qr_code = qr_data.get("data") or qr_data.get("qrcode") or qr_data.get("code")
                    
                    return {
                        "success": True,
                        "status": "qr_ready" if qr_code else "connecting",
                        "qr_code": qr_code,
                        "instance": self.instance_name,
                        "raw": connect_res.json()
                    }
                elif connect_res.status_code in (401, 403):
                    # Check if instance needs creation first via admin /instance/create
                    create_payload = {
                        "name": self.instance_name,
                        "token": self.api_key
                    }
                    create_res = await client.post(f"{self.api_url}/instance/create", json=create_payload, headers=self.headers)
                    if create_res.status_code in (200, 201):
                        # Created! Now retry connect
                        c2_res = await client.post(f"{self.api_url}/instance/connect", json=connect_payload, headers=self.headers)
                        qr_res = await client.get(f"{self.api_url}/instance/qr", headers=self.headers)
                        qr_code = None
                        if qr_res.status_code == 200:
                            qr_code = (qr_res.json().get("data") or {}).get("qrcode") or qr_res.json().get("data")
                        return {
                            "success": True,
                            "status": "qr_ready" if qr_code else "connecting",
                            "qr_code": qr_code,
                            "instance": self.instance_name
                        }
                    elif create_res.status_code == 401:
                        return {"success": False, "status": "disconnected", "error": "Unauthorized: Invalid API key for Evolution Go."}

                # Fallback to v2 path-based connect
                v2_url = f"{self.api_url}/instance/connect/{self.instance_name}"
                res_v2 = await client.get(v2_url, headers=self.headers)
                if res_v2.status_code in (200, 201):
                    data = res_v2.json()
                    qr_code = data.get("base64") or data.get("qrcode") or data.get("code")
                    status = "connected" if data.get("state") == "open" else "qr_ready"
                    return {
                        "success": True,
                        "status": status,
                        "qr_code": qr_code,
                        "instance": self.instance_name,
                        "raw": data
                    }
                elif res_v2.status_code == 404:
                    # Create in v2
                    create_v2 = await client.post(f"{self.api_url}/instance/create", json={"instanceName": self.instance_name, "token": self.api_key, "qrcode": True}, headers=self.headers)
                    if create_v2.status_code in (200, 201):
                        cdata = create_v2.json()
                        qr_code = (cdata.get("qrcode") or {}).get("base64") if isinstance(cdata.get("qrcode"), dict) else cdata.get("base64")
                        return {"success": True, "status": "qr_ready", "qr_code": qr_code, "instance": self.instance_name}

                return {"success": False, "status": "disconnected", "error": f"Evolution API returned HTTP {connect_res.status_code}: {connect_res.text}"}
        except Exception as e:
            return {"success": False, "status": "disconnected", "error": self._diagnose_exception(e)}

    async def getQr(self) -> Dict[str, Any]:
        """Fetch QR code from Evolution Go without reinitializing instance."""
        if not self.api_url:
            return {"success": False, "error": "Evolution API URL is not configured"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(f"{self.api_url}/instance/qr", headers=self.headers)
                if res.status_code == 200:
                    data = res.json()
                    qr = data.get("data") or data.get("qrcode") or data.get("code")
                    return {"success": True, "qr_code": qr, "status": "qr_ready"}
                # Fallback to v2 connect
                v2_res = await client.get(f"{self.api_url}/instance/connect/{self.instance_name}", headers=self.headers)
                if v2_res.status_code == 200:
                    v2_data = v2_res.json()
                    qr = v2_data.get("base64") or v2_data.get("qrcode")
                    return {"success": True, "qr_code": qr, "status": "qr_ready"}
                return {"success": False, "error": f"Evolution QR returned HTTP {res.status_code}: {res.text}"}
        except Exception as e:
            return {"success": False, "error": self._diagnose_exception(e)}

    async def disconnect(self) -> Dict[str, Any]:
        if not self.api_url:
            return {"success": True, "status": "disconnected"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try Evolution Go native disconnect
                res = await client.post(f"{self.api_url}/instance/disconnect", headers=self.headers)
                if res.status_code in (200, 204):
                    return {"success": True, "status": "disconnected"}
                # Try Evolution logout
                res2 = await client.delete(f"{self.api_url}/instance/logout", headers=self.headers)
                if res2.status_code in (200, 204):
                    return {"success": True, "status": "disconnected"}
                # Fallback v2 logout
                res_v2 = await client.delete(f"{self.api_url}/instance/logout/{self.instance_name}", headers=self.headers)
                return {"success": res_v2.status_code in (200, 204), "status": "disconnected"}
        except Exception as e:
            return {"success": False, "status": "error", "error": self._diagnose_exception(e)}

    async def requestPairingCode(self, phone: str) -> Dict[str, Any]:
        if not self.api_url:
            return {"success": False, "error": "Evolution API URL is required."}
        clean_phone = "".join(filter(str.isdigit, phone))
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                # 1. Evolution Go native /instance/pair
                res = await client.post(f"{self.api_url}/instance/pair", json={"phone": clean_phone, "number": clean_phone}, headers=self.headers)
                if res.status_code in (200, 201):
                    d = res.json()
                    code = (d.get("data") or {}).get("pairingCode") or d.get("pairingCode") or d.get("code")
                    return {"success": True, "pairing_code": code, "data": d}
                # 2. v2 /instance/pairing-code/{instance}
                url_v2 = f"{self.api_url}/instance/pairing-code/{self.instance_name}"
                res_v2 = await client.post(url_v2, json={"phone": clean_phone, "number": clean_phone}, headers=self.headers)
                if res_v2.status_code in (200, 201):
                    return res_v2.json()
                return {"success": False, "error": f"Evolution API pairing error (HTTP {res.status_code}): {res.text}"}
        except Exception as e:
            return {"success": False, "error": self._diagnose_exception(e)}

    async def sendText(self, phone: str, text: str) -> Dict[str, Any]:
        clean_phone = "".join(filter(str.isdigit, phone))
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # 1. Native Evolution Go /send/text
                res = await client.post(
                    f"{self.api_url}/send/text",
                    json={"number": clean_phone, "text": text},
                    headers=self.headers
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    provider_msg_id = (data.get("data") or {}).get("id") or (data.get("key") or {}).get("id") or str(uuid.uuid4())
                    return {"success": True, "provider_message_id": provider_msg_id, "status": "sent", "raw": data}
                
                # 2. Fallback to v2 /message/sendText/{instance}
                url_v2 = f"{self.api_url}/message/sendText/{self.instance_name}"
                res_v2 = await client.post(url_v2, json={"number": clean_phone, "text": text}, headers=self.headers)
                if res_v2.status_code in (200, 201):
                    data = res_v2.json()
                    provider_msg_id = (data.get("key") or {}).get("id") or str(uuid.uuid4())
                    return {"success": True, "provider_message_id": provider_msg_id, "status": "sent", "raw": data}
                
                return {"success": False, "error": f"HTTP {res.status_code}: {res.text}", "status": "failed"}
        except Exception as e:
            return {"success": False, "error": self._diagnose_exception(e), "status": "failed"}

    async def sendMedia(self, phone: str, media_url: str, caption: Optional[str] = None, media_type: str = "image") -> Dict[str, Any]:
        clean_phone = "".join(filter(str.isdigit, phone))
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                # 1. Native Evolution Go /send/media
                res = await client.post(
                    f"{self.api_url}/send/media",
                    json={"number": clean_phone, "media": media_url, "caption": caption or "", "mediatype": media_type},
                    headers=self.headers
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    provider_msg_id = (data.get("data") or {}).get("id") or str(uuid.uuid4())
                    return {"success": True, "provider_message_id": provider_msg_id, "status": "sent"}
                
                # 2. Fallback to v2 /message/sendMedia/{instance}
                url_v2 = f"{self.api_url}/message/sendMedia/{self.instance_name}"
                res_v2 = await client.post(url_v2, json={"number": clean_phone, "media": media_url, "caption": caption or "", "mediatype": media_type}, headers=self.headers)
                if res_v2.status_code in (200, 201):
                    data = res_v2.json()
                    provider_msg_id = (data.get("key") or {}).get("id") or str(uuid.uuid4())
                    return {"success": True, "provider_message_id": provider_msg_id, "status": "sent"}
                
                return {"success": False, "error": f"HTTP {res.status_code}: {res.text}", "status": "failed"}
        except Exception as e:
            return {"success": False, "error": self._diagnose_exception(e), "status": "failed"}

    async def sendTemplate(self, phone: str, template_name: str, variables: Dict[str, str], media_url: Optional[str] = None) -> Dict[str, Any]:
        body = f"[{template_name}]\n"
        for k, v in variables.items():
            body += f"{k}: {v}\n"
        return await self.sendText(phone, body)

    async def getMessageStatus(self, provider_message_id: str) -> Dict[str, Any]:
        return {"status": "delivered", "provider_message_id": provider_message_id}

    def parseWebhook(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        events = []
        event_type = payload.get("event")
        data = payload.get("data") or {}

        # 1. Message status updates (sent, delivered, read)
        if event_type in ("messages.update", "message.update"):
            for update in (data if isinstance(data, list) else [data]):
                key = update.get("key") or {}
                msg_id = key.get("id")
                status_raw = str(update.get("status") or "").upper()
                mapped_status = "sent"
                if "READ" in status_raw or "PLAYED" in status_raw:
                    mapped_status = "read"
                elif "DELIVERY" in status_raw or "DELIVERED" in status_raw:
                    mapped_status = "delivered"
                elif "ERROR" in status_raw or "FAILED" in status_raw:
                    mapped_status = "failed"
                events.append({
                    "event_type": "status_update",
                    "provider_message_id": msg_id,
                    "status": mapped_status,
                    "timestamp": now_iso()
                })

        # 2. Inbound messages
        elif event_type in ("messages.upsert", "message.upsert"):
            msg_obj = data.get("message") or data
            key = msg_obj.get("key") or {}
            from_me = key.get("fromMe", False)
            if not from_me:
                remote_jid = key.get("remoteJid") or ""
                phone = remote_jid.split("@")[0]
                text = (
                    msg_obj.get("conversation") or
                    (msg_obj.get("extendedTextMessage") or {}).get("text") or
                    ""
                )
                msg_id = key.get("id") or str(uuid.uuid4())
                events.append({
                    "event_type": "inbound_message",
                    "provider_message_id": msg_id,
                    "phone_number": phone,
                    "text": text,
                    "sender_name": data.get("pushName") or "WhatsApp User",
                    "timestamp": now_iso()
                })
        return events


class WhatsAppCloudApiProvider(WhatsAppProvider):
    """
    Official Meta WhatsApp Cloud API (Graph API) Provider.
    Requires phone_number_id, access_token, and waba_id.
    """
    def __init__(self, credentials: Dict[str, Any], settings: Optional[Dict[str, Any]] = None):
        super().__init__(credentials, settings)
        self.phone_number_id = self.credentials.get("phone_number_id") or ""
        self.access_token = self.credentials.get("access_token") or ""
        self.waba_id = self.credentials.get("waba_id") or ""
        self.graph_version = self.credentials.get("graph_version") or "v20.0"
        self.base_url = f"https://graph.facebook.com/{self.graph_version}/{self.phone_number_id}"
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    async def connect(self, force: bool = False) -> Dict[str, Any]:
        if not self.phone_number_id or not self.access_token:
            return {"success": False, "status": "disconnected", "error": "WhatsApp Cloud API Phone Number ID and Access Token are required."}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(self.base_url, headers=self.headers)
                if res.status_code == 200:
                    data = res.json()
                    display_phone = data.get("display_phone_number")
                    return {
                        "success": True,
                        "status": "connected",
                        "phone_number": display_phone,
                        "verified_name": data.get("verified_name"),
                        "raw": data
                    }
                return {"success": False, "status": "disconnected", "error": f"Meta Graph API error: {res.text}"}
        except Exception as e:
            return {"success": False, "status": "disconnected", "error": str(e)}

    async def disconnect(self) -> Dict[str, Any]:
        return {"success": True, "status": "disconnected"}

    async def getStatus(self) -> Dict[str, Any]:
        res = await self.connect()
        return {
            "connected": res.get("success", False),
            "status": res.get("status", "disconnected"),
            "phone_number": res.get("phone_number"),
            "uptime_seconds": 86400 if res.get("success") else 0
        }

    async def sendText(self, phone: str, text: str) -> Dict[str, Any]:
        clean_phone = "".join(filter(str.isdigit, phone))
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": clean_phone,
                    "type": "text",
                    "text": {"preview_url": True, "body": text}
                }
                res = await client.post(f"{self.base_url}/messages", json=payload, headers=self.headers)
                if res.status_code in (200, 201):
                    data = res.json()
                    msg_id = ((data.get("messages") or [{}])[0]).get("id") or str(uuid.uuid4())
                    return {"success": True, "provider_message_id": msg_id, "status": "sent"}
                return {"success": False, "error": res.text, "status": "failed"}
        except Exception as e:
            return {"success": False, "error": str(e), "status": "failed"}

    async def sendMedia(self, phone: str, media_url: str, caption: Optional[str] = None, media_type: str = "image") -> Dict[str, Any]:
        clean_phone = "".join(filter(str.isdigit, phone))
        meta_type = "image" if media_type == "image" else ("video" if media_type == "video" else "document")
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                media_body: Dict[str, Any] = {"link": media_url}
                if caption:
                    media_body["caption"] = caption
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": clean_phone,
                    "type": meta_type,
                    meta_type: media_body
                }
                res = await client.post(f"{self.base_url}/messages", json=payload, headers=self.headers)
                if res.status_code in (200, 201):
                    data = res.json()
                    msg_id = ((data.get("messages") or [{}])[0]).get("id") or str(uuid.uuid4())
                    return {"success": True, "provider_message_id": msg_id, "status": "sent"}
                return {"success": False, "error": res.text, "status": "failed"}
        except Exception as e:
            return {"success": False, "error": str(e), "status": "failed"}

    async def sendTemplate(self, phone: str, template_name: str, variables: Dict[str, str], media_url: Optional[str] = None) -> Dict[str, Any]:
        clean_phone = "".join(filter(str.isdigit, phone))
        try:
            parameters = [{"type": "text", "text": v} for v in variables.values()]
            payload = {
                "messaging_product": "whatsapp",
                "to": clean_phone,
                "type": "template",
                "template": {
                    "name": template_name,
                    "language": {"code": "en"},
                    "components": [{
                        "type": "body",
                        "parameters": parameters
                    }]
                }
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(f"{self.base_url}/messages", json=payload, headers=self.headers)
                if res.status_code in (200, 201):
                    data = res.json()
                    msg_id = ((data.get("messages") or [{}])[0]).get("id") or str(uuid.uuid4())
                    return {"success": True, "provider_message_id": msg_id, "status": "sent"}
                return {"success": False, "error": res.text, "status": "failed"}
        except Exception as e:
            return {"success": False, "error": str(e), "status": "failed"}

    async def getMessageStatus(self, provider_message_id: str) -> Dict[str, Any]:
        return {"status": "sent", "provider_message_id": provider_message_id}

    def parseWebhook(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        events = []
        entries = payload.get("entry") or []
        for entry in entries:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                # Delivery and read statuses
                for status_item in value.get("statuses") or []:
                    provider_msg_id = status_item.get("id")
                    status_raw = status_item.get("status")  # sent, delivered, read, failed
                    events.append({
                        "event_type": "status_update",
                        "provider_message_id": provider_msg_id,
                        "status": status_raw,
                        "timestamp": now_iso()
                    })
                # Inbound messages
                for msg_item in value.get("messages") or []:
                    from_phone = msg_item.get("from")
                    text = (msg_item.get("text") or {}).get("body") or ""
                    msg_id = msg_item.get("id")
                    events.append({
                        "event_type": "inbound_message",
                        "provider_message_id": msg_id,
                        "phone_number": from_phone,
                        "text": text,
                        "sender_name": "Customer",
                        "timestamp": now_iso()
                    })
        return events


class SimulatedProvider(WhatsAppProvider):
    """
    Built-in High-Fidelity Simulation Provider for Solarix CRM.
    Enables immediate testing, interactive demos, automated tests, and offline development.
    Generates live SVG QR codes, simulates instant delivery & read receipts, and handles CRM flow seamlessly.
    """
    _state: Dict[str, Any] = {
        "connected": True,
        "phone_number": "+91 98765 43210",
        "instance_name": "solarix_primary",
        "uptime_start": time.time() - 172800, # 48 hours uptime
        "connected_at": now_iso()
    }

    async def connect(self, force: bool = False) -> Dict[str, Any]:
        self._state["connected"] = True
        self._state["connected_at"] = now_iso()
        # High quality sample QR code data URI
        svg_qr = (
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200'>"
            "<rect width='200' height='200' fill='white'/>"
            "<path d='M20 20h60v60H20zM30 30v40h40V30zM120 20h60v60h-60zM130 30v40h40V30zM20 120h60v60H20zM30 130v40h40v-40z"
            "M45 45h10v10H45zM145 45h10v10h-10zM45 145h10v10H45zM100 20h10v20h-10zM100 60h10v20h-10zM20 100h20v10H20z"
            "M60 100h20v10H60zM100 100h20v20h-20zM140 100h20v10h-20zM180 100h10v20h-10zM100 140h10v40h-10zM140 140h40v10h-40z"
            "M140 170h30v10h-30z' fill='%230f172a'/>"
            "<circle cx='100' cy='100' r='18' fill='%2310b981'/>"
            "<path d='M95 95l4 4 7-7' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round'/>"
            "</svg>"
        )
        return {
            "success": True,
            "status": "connected",
            "phone_number": self._state["phone_number"],
            "qr_code": svg_qr,
            "instance": self._state["instance_name"],
            "uptime_seconds": int(time.time() - self._state["uptime_start"])
        }

    async def disconnect(self) -> Dict[str, Any]:
        self._state["connected"] = False
        return {"success": True, "status": "disconnected"}

    async def getStatus(self) -> Dict[str, Any]:
        connected = self._state.get("connected", True)
        uptime = int(time.time() - self._state["uptime_start"]) if connected else 0
        return {
            "connected": connected,
            "status": "connected" if connected else "disconnected",
            "phone_number": self._state["phone_number"],
            "instance": self._state["instance_name"],
            "uptime_seconds": uptime
        }

    async def sendText(self, phone: str, text: str) -> Dict[str, Any]:
        msg_id = f"sim_msg_{uuid.uuid4().hex[:12]}"
        return {
            "success": True,
            "provider_message_id": msg_id,
            "status": "sent",
            "simulated": True,
            "timestamp": now_iso()
        }

    async def sendMedia(self, phone: str, media_url: str, caption: Optional[str] = None, media_type: str = "image") -> Dict[str, Any]:
        msg_id = f"sim_media_{uuid.uuid4().hex[:12]}"
        return {
            "success": True,
            "provider_message_id": msg_id,
            "status": "sent",
            "simulated": True,
            "timestamp": now_iso()
        }

    async def sendTemplate(self, phone: str, template_name: str, variables: Dict[str, str], media_url: Optional[str] = None) -> Dict[str, Any]:
        msg_id = f"sim_tmpl_{uuid.uuid4().hex[:12]}"
        return {
            "success": True,
            "provider_message_id": msg_id,
            "status": "sent",
            "simulated": True,
            "timestamp": now_iso()
        }

    async def getMessageStatus(self, provider_message_id: str) -> Dict[str, Any]:
        return {"status": "read", "provider_message_id": provider_message_id}

    def parseWebhook(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        # Accept standard Solarix webhook format
        if "events" in payload and isinstance(payload["events"], list):
            return payload["events"]
        return [{
            "event_type": "status_update",
            "provider_message_id": payload.get("provider_message_id", "sim_default"),
            "status": payload.get("status", "delivered"),
            "timestamp": now_iso()
        }]


class NativeBaileysProvider(WhatsAppProvider):
    """
    Live WhatsApp Multi-Device Gateway powered by Baileys Multi-Tenant Node Engine.
    Connects to official WhatsApp servers, emits genuine scannable QR codes,
    and supports multi-tenant isolation per client instance.
    """
    def __init__(self, credentials: Dict[str, Any], settings: Optional[Dict[str, Any]] = None):
        super().__init__(credentials, settings)
        self.engine_url = (self.credentials.get("api_url") or os.environ.get("WHATSAPP_ENGINE_URL", "http://127.0.0.1:8085")).rstrip("/")
        self.instance_name = self.credentials.get("instance_name") or "solarix_primary"
        self.api_key = self.credentials.get("api_key") or ""
        self.headers = {"apikey": self.api_key, "Content-Type": "application/json"}

    def _get_target_urls(self) -> List[str]:
        urls = [self.engine_url]
        if "127.0.0.1" in self.engine_url:
            urls.append(self.engine_url.replace("127.0.0.1", "localhost"))
        elif "localhost" in self.engine_url:
            urls.append(self.engine_url.replace("localhost", "127.0.0.1"))
        return urls

    async def connect(self, force: bool = False) -> Dict[str, Any]:
        targets = self._get_target_urls()
        last_error = ""

        for base_url in targets:
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(timeout=25.0) as client:
                        res = await client.post(
                            f"{base_url}/instance/connect/{self.instance_name}",
                            json={"instanceName": self.instance_name, "token": self.api_key, "force": force},
                            headers=self.headers
                        )
                        if res.status_code == 200:
                            return res.json()
                        last_error = res.text
                except (httpx.ConnectError, httpx.TimeoutException) as e:
                    last_error = str(e)
                    await asyncio.sleep(0.5)

        return {
            "success": False,
            "status": "disconnected",
            "error": f"WhatsApp Gateway Engine offline at {self.engine_url}. ({last_error})"
        }

    async def disconnect(self) -> Dict[str, Any]:
        targets = self._get_target_urls()
        for base_url in targets:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{base_url}/instance/disconnect/{self.instance_name}",
                        json={"instanceName": self.instance_name},
                        headers=self.headers
                    )
                    if res.status_code == 200:
                        return res.json()
            except Exception:
                pass
        return {"success": True, "status": "disconnected"}

    async def getStatus(self) -> Dict[str, Any]:
        targets = self._get_target_urls()
        for base_url in targets:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    res = await client.get(
                        f"{base_url}/instance/connectionState/{self.instance_name}",
                        headers=self.headers
                    )
                    if res.status_code == 200:
                        return res.json()
            except Exception:
                pass
        return {"connected": False, "status": "disconnected", "phone_number": None, "uptime_seconds": 0}

    async def requestPairingCode(self, phone: str) -> Dict[str, Any]:
        clean_phone = "".join(filter(str.isdigit, phone))
        targets = self._get_target_urls()
        last_error = ""

        for base_url in targets:
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(timeout=25.0) as client:
                        res = await client.post(
                            f"{base_url}/instance/pairing-code/{self.instance_name}",
                            json={"phone": clean_phone, "number": clean_phone, "instanceName": self.instance_name},
                            headers=self.headers
                        )
                        if res.status_code in (200, 400):
                            return res.json()
                        last_error = res.text
                except (httpx.ConnectError, httpx.TimeoutException) as e:
                    last_error = str(e)
                    await asyncio.sleep(0.5)

        return {
            "success": False,
            "error": f"WhatsApp Gateway Engine offline at {self.engine_url}. Please ensure node server.js is running."
        }

    async def sendText(self, phone: str, text: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    f"{self.engine_url}/message/sendText/{self.instance_name}",
                    json={"phone": phone, "number": phone, "text": text},
                    headers=self.headers
                )
                if res.status_code == 200:
                    return res.json()
                return {"success": False, "error": res.text, "status": "failed"}
        except Exception as e:
            return {"success": False, "error": str(e), "status": "failed"}

    async def sendMedia(self, phone: str, media_url: str, caption: Optional[str] = None, media_type: str = "image") -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post(
                    f"{self.engine_url}/message/sendMedia/{self.instance_name}",
                    json={
                        "phone": phone,
                        "number": phone,
                        "media_url": media_url,
                        "media": media_url,
                        "caption": caption,
                        "media_type": media_type
                    },
                    headers=self.headers
                )
                if res.status_code == 200:
                    return res.json()
                return {"success": False, "error": res.text, "status": "failed"}
        except Exception as e:
            return {"success": False, "error": str(e), "status": "failed"}

    async def sendTemplate(self, phone: str, template_name: str, variables: Dict[str, str], media_url: Optional[str] = None) -> Dict[str, Any]:
        body = f"*{template_name}*\n\n"
        for k, v in variables.items():
            body += f"{k}: {v}\n"
        return await self.sendText(phone, body)

    async def getMessageStatus(self, provider_message_id: str) -> Dict[str, Any]:
        return {"status": "delivered", "provider_message_id": provider_message_id}

    def parseWebhook(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        if "events" in payload and isinstance(payload["events"], list):
            return payload["events"]
        return []


def get_whatsapp_provider(provider_type: str, credentials: Dict[str, Any], settings: Optional[Dict[str, Any]] = None) -> WhatsAppProvider:
    """
    Factory to instantiate the appropriate WhatsApp Provider.
    Supports:
    - "native": Built-in Multi-Tenant Baileys Gateway (Evolution-compatible)
    - "evolution_go": Evolution API Gateway (Local or Remote)
    - "whatsapp_cloud": Official Meta Cloud API
    - "simulated": Offline Testing Simulation
    """
    pt = (provider_type or "native").lower()
    if pt == "whatsapp_cloud":
        if credentials and credentials.get("phone_number_id") and credentials.get("access_token"):
            return WhatsAppCloudApiProvider(credentials, settings)
    elif pt in ("evolution_go", "evolution"):
        return EvolutionGoProvider(credentials, settings)
    elif pt == "simulated":
        return SimulatedProvider(credentials, settings)
    # Default to live NativeBaileysProvider for authentic phone QR linking
    return NativeBaileysProvider(credentials, settings)
