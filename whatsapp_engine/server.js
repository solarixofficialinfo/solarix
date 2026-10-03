/**
 * SOLARIX CRM — MULTI-TENANT EVOLUTION-COMPATIBLE WHATSAPP GATEWAY
 * Powered by @whiskeysockets/baileys.
 *
 * Features:
 * 1. Multi-Tenant Instance Management:
 *    - Each client / company gets an isolated instance (e.g. solarix_a1b2c3d4)
 *    - Dedicated auth directory per instance (auth_info_baileys/<instance_name>)
 *    - Independent Baileys WebSocket connection
 *    - Independent QR code & 8-digit pairing code generation
 *    - Per-client API key validation
 * 2. Full Evolution Go & Evolution API v1/v2 compatibility:
 *    - POST /instance/create
 *    - GET /instance/all
 *    - GET /instance/status & /instance/connectionState/:instance
 *    - POST /instance/connect & /instance/connect/:instance
 *    - GET /instance/qr & /instance/qr/:instance
 *    - POST /instance/pair & /instance/pairing-code
 *    - POST /instance/disconnect & DELETE /instance/logout/:instance
 *    - DELETE /instance/delete/:instance
 *    - POST /send/text & /message/sendText/:instance & /send-text
 *    - POST /send/media & /message/sendMedia/:instance & /send-media
 * 3. Inbound Webhooks forwarded to Solarix backend with instance_name metadata.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  delay
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.WHATSAPP_ENGINE_PORT || 8085;
const AUTH_BASE_DIR = path.join(__dirname, 'auth_info_baileys');
const SOLRIX_WEBHOOK_URL = process.env.SOLRIX_WEBHOOK_URL || 'http://127.0.0.1:8000/api/whatsapp/webhook/native';

if (!fs.existsSync(AUTH_BASE_DIR)) {
  fs.mkdirSync(AUTH_BASE_DIR, { recursive: true });
}

function cleanPhoneNumber(raw) {
  if (!raw) return null;
  const numOnly = raw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (!numOnly) return null;
  return numOnly.startsWith('+') ? numOnly : `+${numOnly}`;
}

async function forwardToSolarix(instanceName, events) {
  try {
    await fetch(SOLRIX_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_name: instanceName, events }),
    });
  } catch (err) {
    // Backend may be offline or starting up
  }
}

// ─── INSTANCE CLASS ─────────────────────────────────────────────────────────

class WhatsAppInstance {
  constructor(name, token = '') {
    this.name = name;
    this.token = token;
    this.authDir = path.join(AUTH_BASE_DIR, name);
    this.sock = null;
    this.currentQR = null;
    this.currentQRDataUrl = null;
    this.connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
    this.connectedPhone = null;
    this.connectedName = null;
    this.connectionStartTime = null;
    this.reconnectAttempts = 0;
    this.isInitializing = false;

    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  hasStoredCredentials() {
    const credsPath = path.join(this.authDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      return !!(data && data.registered === true && data.me?.id);
    } catch (e) {
      return false;
    }
  }

  async init(forceNew = false) {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end();
        } catch (e) {}
        this.sock = null;
        await delay(500);
      }

      // If forceNew requested OR existing session is unverified / incomplete, purge clean
      const hasValidSession = this.hasStoredCredentials();
      if (forceNew || !hasValidSession) {
        this.currentQR = null;
        this.currentQRDataUrl = null;
        this.connectedPhone = null;
        this.connectedName = null;
        this.connectionStatus = 'disconnected';
        if (fs.existsSync(this.authDir)) {
          fs.rmSync(this.authDir, { recursive: true, force: true });
          fs.mkdirSync(this.authDir, { recursive: true });
        }
      }

      this.connectionStatus = 'connecting';
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1043857760] }));

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => ({ conversation: '' }),
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.currentQR = qr;
          try {
            this.currentQRDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              scale: 8,
              color: { dark: '#0f172a', light: '#ffffff' }
            });
            this.connectionStatus = 'qr_ready';
            console.log(`[WhatsApp Engine][${this.name}] Live QR Code Generated for WhatsApp scan.`);
          } catch (e) {
            console.error(`[WhatsApp Engine][${this.name}] QR DataURL error:`, e);
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`[WhatsApp Engine][${this.name}] Connection closed (${statusCode}), reconnecting=${shouldReconnect}`);

          if (statusCode === DisconnectReason.loggedOut) {
            // Explicit logout — clear everything and stop
            this.connectionStatus = 'disconnected';
            this.connectedPhone = null;
            this.connectedName = null;
            this.currentQR = null;
            this.currentQRDataUrl = null;
            if (fs.existsSync(this.authDir)) {
              fs.rmSync(this.authDir, { recursive: true, force: true });
              fs.mkdirSync(this.authDir, { recursive: true });
            }
          } else if (shouldReconnect) {
            // QR expired (408), connection error, or reconnect needed — always retry
            // so a fresh QR is generated even before a phone has been linked
            this.connectionStatus = 'qr_ready';
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectAttempts * 1500, 8000);
            setTimeout(() => this.init(false), delay);
          }
        } else if (connection === 'open') {
          this.reconnectAttempts = 0;
          this.connectionStatus = 'connected';
          this.currentQR = null;
          this.currentQRDataUrl = null;
          this.connectionStartTime = Date.now();

          const rawUser = this.sock.user?.id || '';
          this.connectedPhone = cleanPhoneNumber(rawUser);
          this.connectedName = this.sock.user?.name || 'Solarix User';

          console.log(`[WhatsApp Engine][${this.name}] ✓ CONNECTED! Number: ${this.connectedPhone}`);

          forwardToSolarix(this.name, [{
            event_type: 'status_update',
            provider_message_id: 'connection_open',
            status: 'connected',
            phone_number: this.connectedPhone,
            instance_name: this.name
          }]);
        }
      });

      // Inbound Messages
      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify' || m.type === 'append') {
          for (const msg of m.messages) {
            if (!msg.key.fromMe && msg.message) {
              const fromJid = msg.key.remoteJid || '';
              const phone = cleanPhoneNumber(fromJid);
              const text = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                '';
              const senderName = msg.pushName || 'Customer';

              console.log(`[WhatsApp Engine][${this.name}] Inbound msg from ${phone}: ${text}`);

              forwardToSolarix(this.name, [{
                event_type: 'inbound_message',
                provider_message_id: msg.key.id,
                phone_number: phone,
                text,
                sender_name: senderName,
                instance_name: this.name
              }]);
            }
          }
        }
      });

      // Delivery and Read Updates
      this.sock.ev.on('messages.update', async (updates) => {
        const events = [];
        for (const u of updates) {
          const msgId = u.key?.id;
          let mappedStatus = 'sent';
          if (u.update?.status === 3) mappedStatus = 'delivered';
          if (u.update?.status === 4) mappedStatus = 'read';

          events.push({
            event_type: 'status_update',
            provider_message_id: msgId,
            status: mappedStatus,
            timestamp: new Date().toISOString(),
            instance_name: this.name
          });
        }
        if (events.length > 0) {
          forwardToSolarix(this.name, events);
        }
      });

    } catch (err) {
      console.error(`[WhatsApp Engine][${this.name}] Init error:`, err);
      this.connectionStatus = 'disconnected';
    } finally {
      this.isInitializing = false;
    }
  }

  async disconnect() {
    try {
      if (this.sock) {
        await this.sock.logout().catch(() => {});
        this.sock.ev.removeAllListeners();
        this.sock.end();
      }
    } catch (e) {}

    this.sock = null;
    this.currentQR = null;
    this.currentQRDataUrl = null;
    this.connectionStatus = 'disconnected';
    this.connectedPhone = null;
    this.connectedName = null;

    if (fs.existsSync(this.authDir)) {
      fs.rmSync(this.authDir, { recursive: true, force: true });
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  getStatusPayload() {
    const isConn = this.connectionStatus === 'connected' && this.sock?.user != null;
    const uptime = isConn && this.connectionStartTime ? Math.floor((Date.now() - this.connectionStartTime) / 1000) : 0;

    return {
      instance_name: this.name,
      connected: isConn,
      status: isConn ? 'connected' : this.connectionStatus,
      state: isConn ? 'open' : (this.connectionStatus === 'connecting' ? 'connecting' : 'close'),
      phone_number: isConn ? this.connectedPhone : null,
      user_name: isConn ? this.connectedName : null,
      qr_code: this.currentQRDataUrl,
      raw_qr: this.currentQR,
      uptime_seconds: uptime,
      engine: 'Solarix Multi-Tenant Evolution Gateway v7.0'
    };
  }
}

// ─── INSTANCE MANAGER ───────────────────────────────────────────────────────

const instances = new Map();

function getOrCreateInstance(name = 'solarix_primary', token = '') {
  const cleanName = (name || 'solarix_primary').trim();
  if (!instances.has(cleanName)) {
    const inst = new WhatsAppInstance(cleanName, token);
    instances.set(cleanName, inst);
  }
  const inst = instances.get(cleanName);
  if (token && !inst.token) {
    inst.token = token;
  }
  return inst;
}

function resolveInstance(req) {
  // Try route params, query, headers, or body
  const name =
    req.params?.instanceName ||
    req.params?.instanceId ||
    req.params?.instance ||
    req.query?.instance ||
    req.query?.instanceName ||
    req.body?.instanceName ||
    req.body?.instance ||
    req.body?.name ||
    'solarix_primary';

  const token = req.headers?.apikey || req.headers?.['x-api-key'] || req.body?.token || '';
  return getOrCreateInstance(name, token);
}

// Auto-restore all existing instances from disk on boot
function restoreInstancesFromDisk() {
  if (!fs.existsSync(AUTH_BASE_DIR)) return;

  // 1. Ensure default instance exists
  getOrCreateInstance('solarix_primary');

  // 2. Scan auth subdirectories
  const entries = fs.readdirSync(AUTH_BASE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const instName = entry.name;
      const inst = getOrCreateInstance(instName);
      if (inst.hasStoredCredentials()) {
        console.log(`[WhatsApp Engine] Found saved session for instance [${instName}], connecting...`);
        inst.init(false);
      }
    }
  }
}

// ─── EVOLUTION API & SOLARIX ENDPOINTS ──────────────────────────────────────

// Server Health
app.get('/server/ok', (req, res) => res.json({ status: 200, message: 'Solarix Evolution Gateway Online' }));

// 1. Create Instance (Evolution compatible: POST /instance/create)
app.post('/instance/create', async (req, res) => {
  const instanceName = req.body.instanceName || req.body.name;
  const token = req.body.token || req.body.apiKey || '';
  const qrcode = req.body.qrcode !== false;

  if (!instanceName) {
    return res.status(400).json({ error: 'instanceName is required' });
  }

  const inst = getOrCreateInstance(instanceName, token);

  if (qrcode && inst.connectionStatus === 'disconnected') {
    inst.init(false);
  }

  return res.json({
    message: 'Instance created successfully',
    instance: {
      instanceName: inst.name,
      status: inst.connectionStatus,
      token: inst.token
    }
  });
});

// 2. List All Instances (Evolution compatible: GET /instance/all)
app.get('/instance/all', (req, res) => {
  const all = [];
  for (const [name, inst] of instances.entries()) {
    all.push(inst.getStatusPayload());
  }
  res.json({ instances: all });
});

// 3. Instance Status & Connection State
const handleStatus = (req, res) => {
  const inst = resolveInstance(req);
  const payload = inst.getStatusPayload();
  // Evolution format compatibility
  res.json({
    ...payload,
    instance: {
      instanceName: inst.name,
      state: payload.state
    }
  });
};

app.get('/status', handleStatus);
app.get('/instance/status', handleStatus);
app.get('/instance/connectionState/:instance', handleStatus);
app.get('/instance/info/:instance', handleStatus);

// 4. Connect & Generate Live QR Code
const handleConnect = async (req, res) => {
  const inst = resolveInstance(req);
  const force = req.body && req.body.force === true;

  if (inst.connectionStatus === 'connected' && inst.sock?.user) {
    return res.json({
      success: true,
      status: 'connected',
      state: 'open',
      phone_number: inst.connectedPhone,
      instance: inst.name,
      message: 'Already connected to WhatsApp.'
    });
  }

  // If forced, or if socket is not running, or if we have no QR, initialize
  if (force || !inst.sock || !inst.currentQRDataUrl || inst.connectionStatus === 'disconnected') {
    inst.init(force);
  }

  // Poll up to 10s for the live QR
  let waited = 0;
  while (waited < 10000 && !inst.currentQRDataUrl && inst.connectionStatus !== 'connected') {
    await delay(300);
    waited += 300;
  }

  return res.json({
    success: true,
    status: inst.connectionStatus,
    state: inst.connectionStatus === 'connected' ? 'open' : 'connecting',
    phone_number: inst.connectedPhone,
    qr_code: inst.currentQRDataUrl,
    base64: inst.currentQRDataUrl,
    code: inst.currentQR,
    instance: inst.name
  });
};

app.post('/connect', handleConnect);
app.post('/instance/connect', handleConnect);
app.post('/instance/connect/:instance', handleConnect);
app.get('/instance/connect/:instance', handleConnect);

// 5. Get Live QR
const handleQR = (req, res) => {
  const inst = resolveInstance(req);
  res.json({
    success: !!inst.currentQRDataUrl,
    qr_code: inst.currentQRDataUrl,
    code: inst.currentQR,
    instance: inst.name
  });
};
app.get('/instance/qr', handleQR);
app.get('/instance/qr/:instance', handleQR);

// 6. Request 8-Digit Pairing Code (Phone-based linking)
const handlePair = async (req, res) => {
  const inst = resolveInstance(req);
  const rawPhone = req.body?.phone || req.body?.number || req.body?.phoneNumber || req.body?.phone_number;

  if (!rawPhone) {
    return res.status(400).json({ success: false, error: 'Phone number is required.' });
  }

  const cleanNum = rawPhone.replace(/[^0-9]/g, '');
  if (!cleanNum || cleanNum.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid phone number format. Must include country code without +.' });
  }

  try {
    if (inst.connectionStatus === 'connected' && inst.sock?.user) {
      return res.json({
        success: true,
        status: 'connected',
        phone_number: inst.connectedPhone,
        message: 'Already connected to WhatsApp.'
      });
    }

    // Always reset socket to pure state to avoid QR collision during pairing code handshake
    await inst.init(true);

    // Wait until socket is ready to receive requests
    let waited = 0;
    while (waited < 15000 && (!inst.sock || inst.connectionStatus === 'disconnected')) {
      await delay(250);
      waited += 250;
    }

    if (!inst.sock) {
      return res.status(500).json({ success: false, error: 'WhatsApp gateway socket not ready. Please try again.' });
    }

    // Give 1 second for initial handshake
    await delay(1000);

    console.log(`[WhatsApp Engine][${inst.name}] Generating official pairing code for phone: ${cleanNum}`);
    const code = await inst.sock.requestPairingCode(cleanNum);
    const formattedCode = code && code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

    return res.json({
      success: true,
      pairing_code: code,
      formatted_code: formattedCode,
      code: code,
      phone: cleanNum,
      instance: inst.name,
      message: 'Pairing code generated successfully. Enter this code in WhatsApp > Linked Devices > Link with phone number.'
    });
  } catch (err) {
    console.error(`[WhatsApp Engine][${inst.name}] Pairing code error:`, err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to request pairing code' });
  }
};

app.post('/pairing-code', handlePair);
app.post('/instance/pairing-code', handlePair);
app.post('/instance/pairing-code/:instance', handlePair);
app.post('/instance/pair', handlePair);
app.post('/instance/pair/:instance', handlePair);

// 7. Disconnect / Logout
const handleDisconnect = async (req, res) => {
  const inst = resolveInstance(req);
  await inst.disconnect();
  return res.json({ success: true, status: 'disconnected', instance: inst.name, message: 'Instance disconnected.' });
};

app.post('/disconnect', handleDisconnect);
app.post('/instance/disconnect', handleDisconnect);
app.post('/instance/disconnect/:instance', handleDisconnect);
app.delete('/instance/logout', handleDisconnect);
app.delete('/instance/logout/:instance', handleDisconnect);

// 8. Delete Instance (Evolution compatible: DELETE /instance/delete/:instance)
app.delete('/instance/delete/:instance', async (req, res) => {
  const inst = resolveInstance(req);
  await inst.disconnect();
  instances.delete(inst.name);
  if (fs.existsSync(inst.authDir)) {
    fs.rmSync(inst.authDir, { recursive: true, force: true });
  }
  return res.json({ success: true, message: `Instance ${inst.name} deleted successfully.` });
});

// 9. Send Text Message
const handleSendText = async (req, res) => {
  const inst = resolveInstance(req);
  const rawPhone = req.body.number || req.body.phone || req.body.to;
  const text = req.body.textMessage?.text || req.body.text || req.body.message;

  if (!inst.sock || inst.connectionStatus !== 'connected') {
    return res.status(400).json({
      success: false,
      error: `WhatsApp instance [${inst.name}] is not connected. Scan QR code or link device first.`
    });
  }
  if (!rawPhone || !text) {
    return res.status(400).json({ success: false, error: 'Phone number and text message are required.' });
  }

  try {
    const cleanNum = rawPhone.replace(/[^0-9]/g, '');
    const jid = `${cleanNum}@s.whatsapp.net`;
    const sent = await inst.sock.sendMessage(jid, { text });
    const msgId = sent?.key?.id;

    return res.json({
      success: true,
      provider_message_id: msgId,
      key: { id: msgId, remoteJid: jid, fromMe: true },
      status: 'sent',
      phone: cleanNum,
      instance: inst.name
    });
  } catch (err) {
    console.error(`[WhatsApp Engine][${inst.name}] Send error:`, err);
    return res.status(500).json({ success: false, error: err.message || 'Send message failed' });
  }
};

app.post('/send-text', handleSendText);
app.post('/send/text', handleSendText);
app.post('/message/sendText/:instance', handleSendText);

// 10. Send Media Message
const handleSendMedia = async (req, res) => {
  const inst = resolveInstance(req);
  const rawPhone = req.body.number || req.body.phone || req.body.to;
  const mediaUrl = req.body.media || req.body.media_url || req.body.url;
  const caption = req.body.caption || req.body.text || '';
  const mediaType = (req.body.mediatype || req.body.media_type || 'image').toLowerCase();

  if (!inst.sock || inst.connectionStatus !== 'connected') {
    return res.status(400).json({
      success: false,
      error: `WhatsApp instance [${inst.name}] is not connected. Scan QR code or link device first.`
    });
  }
  if (!rawPhone || !mediaUrl) {
    return res.status(400).json({ success: false, error: 'Phone number and media URL are required.' });
  }

  try {
    const cleanNum = rawPhone.replace(/[^0-9]/g, '');
    const jid = `${cleanNum}@s.whatsapp.net`;
    let messageContent = {};

    if (mediaType === 'image') {
      messageContent = { image: { url: mediaUrl }, caption };
    } else if (mediaType === 'document' || mediaType === 'pdf') {
      messageContent = {
        document: { url: mediaUrl },
        mimetype: 'application/pdf',
        fileName: 'Solar_Proposal.pdf',
        caption
      };
    } else {
      messageContent = { text: `${caption}\n${mediaUrl}`.trim() };
    }

    const sent = await inst.sock.sendMessage(jid, messageContent);
    return res.json({
      success: true,
      provider_message_id: sent?.key?.id,
      key: { id: sent?.key?.id, remoteJid: jid, fromMe: true },
      status: 'sent',
      instance: inst.name
    });
  } catch (err) {
    console.error(`[WhatsApp Engine][${inst.name}] Send media error:`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/send-media', handleSendMedia);
app.post('/send/media', handleSendMedia);
app.post('/message/sendMedia/:instance', handleSendMedia);

// ─── START SERVER ───────────────────────────────────────────────────────────
const primaryServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[WhatsApp Engine] Solarix Multi-Tenant Evolution Gateway running on port ${PORT}`);
  restoreInstancesFromDisk();
});

// Dual-port listening: also bind 8080/8085 so callers to Evolution Go (8080) and Baileys (8085) are both serviced seamlessly
const ALT_PORT = Number(PORT) === 8080 ? 8085 : 8080;
try {
  const altServer = app.listen(ALT_PORT, '0.0.0.0', () => {
    console.log(`[WhatsApp Engine] Also listening on port ${ALT_PORT} for Evolution Go compatibility`);
  });
  altServer.on('error', (err) => {
    console.log(`[WhatsApp Engine] Note: secondary port ${ALT_PORT} not bound: ${err.message}`);
  });
} catch (e) {
  console.log(`[WhatsApp Engine] Could not bind secondary port: ${e.message}`);
}

