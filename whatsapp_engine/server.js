/**
 * SOLARIX CRM — LIVE NATIVE WHATSAPP MULTI-DEVICE GATEWAY ENGINE
 * Powered by @whiskeysockets/baileys.
 * Generates REAL WhatsApp Multi-Device QR codes and 8-digit Pairing Codes
 * that connect directly to the official WhatsApp mobile application.
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
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
const SOLRIX_WEBHOOK_URL = process.env.SOLRIX_WEBHOOK_URL || 'http://127.0.0.1:8000/api/whatsapp/webhook/native';

let sock = null;
let currentQR = null;
let currentQRDataUrl = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let connectedPhone = null;
let connectedName = null;
let connectionStartTime = null;
let reconnectAttempts = 0;
let isInitializing = false;

// Ensure auth dir exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function cleanPhoneNumber(raw) {
  if (!raw) return null;
  const numOnly = raw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (!numOnly) return null;
  return numOnly.startsWith('+') ? numOnly : `+${numOnly}`;
}

async function forwardToSolarix(events) {
  try {
    await fetch(SOLRIX_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
  } catch (err) {
    // Backend may be starting or offline
  }
}

async function initWhatsApp(forceNew = false) {
  if (isInitializing) return;
  isInitializing = true;

  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end();
      } catch (e) {}
      sock = null;
    }

    if (forceNew) {
      currentQR = null;
      currentQRDataUrl = null;
      connectedPhone = null;
      connectedName = null;
      connectionStatus = 'disconnected';
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
    }

    connectionStatus = 'connecting';
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        try {
          currentQRDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 8,
            color: { dark: '#0f172a', light: '#ffffff' }
          });
          connectionStatus = 'qr_ready';
          console.log('[WhatsApp Engine] Real QR Code Generated! Ready for WhatsApp App scan.');
        } catch (e) {
          console.error('[WhatsApp Engine] Failed to generate QR data URL:', e);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WhatsApp Engine] Connection closed. Reason: ${statusCode}, shouldReconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = 'disconnected';
          connectedPhone = null;
          connectedName = null;
          currentQR = null;
          currentQRDataUrl = null;
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
        } else if (shouldReconnect) {
          connectionStatus = 'connecting';
          reconnectAttempts++;
          setTimeout(() => initWhatsApp(false), Math.min(reconnectAttempts * 2000, 10000));
        } else {
          connectionStatus = 'disconnected';
        }
      } else if (connection === 'open') {
        reconnectAttempts = 0;
        connectionStatus = 'connected';
        currentQR = null;
        currentQRDataUrl = null;
        connectionStartTime = Date.now();

        const rawUser = sock.user?.id || '';
        connectedPhone = cleanPhoneNumber(rawUser);
        connectedName = sock.user?.name || 'Solarix User';

        console.log(`[WhatsApp Engine] ✓ LIVE WHATSAPP CONNECTED! Phone Number: ${connectedPhone}`);

        // Notify Solarix activity log
        forwardToSolarix([{
          event_type: 'status_update',
          provider_message_id: 'connection_open',
          status: 'connected',
          phone_number: connectedPhone
        }]);
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
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

            console.log(`[WhatsApp Engine] Inbound message from ${phone}: ${text}`);

            forwardToSolarix([{
              event_type: 'inbound_message',
              provider_message_id: msg.key.id,
              phone_number: phone,
              text,
              sender_name: senderName
            }]);
          }
        }
      }
    });

    // Handle delivery & read receipts
    sock.ev.on('messages.update', async (updates) => {
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
          timestamp: new Date().toISOString()
        });
      }
      if (events.length > 0) {
        forwardToSolarix(events);
      }
    });

  } catch (err) {
    console.error('[WhatsApp Engine] Init error:', err);
    connectionStatus = 'disconnected';
  } finally {
    isInitializing = false;
  }
}

// ─── API ENDPOINTS ──────────────────────────────────────────────────────────

// 1. Get Live Gateway Status
app.get('/status', (req, res) => {
  const isConn = connectionStatus === 'connected' && sock?.user != null;
  const uptime = isConn && connectionStartTime ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0;

  res.json({
    connected: isConn,
    status: isConn ? 'connected' : connectionStatus,
    phone_number: isConn ? connectedPhone : null,
    user_name: isConn ? connectedName : null,
    qr_code: currentQRDataUrl,
    uptime_seconds: uptime,
    instance_name: 'solarix_primary',
    engine: 'Baileys Multi-Device Native Engine v7.0'
  });
});

// 2. Connect / Refresh QR
app.post('/connect', async (req, res) => {
  if (connectionStatus === 'connected' && sock?.user) {
    return res.json({
      success: true,
      status: 'connected',
      phone_number: connectedPhone,
      message: 'Already connected to WhatsApp.'
    });
  }

  const force = req.body && req.body.force === true;
  initWhatsApp(force);

  // Poll up to 10 seconds for the live QR to be emitted
  let waited = 0;
  while (waited < 10000 && !currentQRDataUrl && connectionStatus !== 'connected') {
    await delay(300);
    waited += 300;
  }

  return res.json({
    success: true,
    status: connectionStatus,
    phone_number: connectedPhone,
    qr_code: currentQRDataUrl,
    instance: 'solarix_primary'
  });
});

// 3. Request Official 8-Digit Pairing Code (Alternative to QR scan)
app.post('/pairing-code', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number is required.' });
  }

  const cleanNum = phone.replace(/[^0-9]/g, '');
  if (!cleanNum || cleanNum.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid mobile number. Include country code without +, e.g. 919876543210' });
  }

  try {
    if (connectionStatus === 'connected' && sock?.user) {
      return res.json({
        success: true,
        status: 'connected',
        phone_number: connectedPhone,
        message: 'Already connected to WhatsApp.'
      });
    }

    if (!sock || connectionStatus === 'disconnected') {
      await initWhatsApp(true);
      await delay(1500);
    }

    if (sock && !sock.authState.creds.registered) {
      console.log(`[WhatsApp Engine] Generating pairing code for: ${cleanNum}`);
      const code = await sock.requestPairingCode(cleanNum);
      return res.json({
        success: true,
        pairing_code: code,
        phone: cleanNum,
        message: 'Pairing code generated successfully.'
      });
    } else {
      return res.status(400).json({ success: false, error: 'Socket is already registered or in active state.' });
    }
  } catch (err) {
    console.error('[WhatsApp Engine] Error requesting pairing code:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to request pairing code' });
  }
});

// 4. Disconnect / Logout
app.post('/disconnect', async (req, res) => {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
      sock.ev.removeAllListeners();
      sock.end();
    }
  } catch (e) {}

  sock = null;
  currentQR = null;
  currentQRDataUrl = null;
  connectionStatus = 'disconnected';
  connectedPhone = null;
  connectedName = null;

  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  res.json({ success: true, status: 'disconnected', message: 'WhatsApp instance disconnected.' });
});

// 5. Send Real Text Message
app.post('/send-text', async (req, res) => {
  const { phone, text } = req.body;
  if (!sock || connectionStatus !== 'connected') {
    return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Scan QR code first.' });
  }
  if (!phone || !text) {
    return res.status(400).json({ success: false, error: 'Phone and text are required.' });
  }

  try {
    const cleanNum = phone.replace(/[^0-9]/g, '');
    const jid = `${cleanNum}@s.whatsapp.net`;
    const sent = await sock.sendMessage(jid, { text });
    const msgId = sent?.key?.id;

    res.json({
      success: true,
      provider_message_id: msgId,
      status: 'sent',
      phone: cleanNum
    });
  } catch (err) {
    console.error('[WhatsApp Engine] Send error:', err);
    res.status(500).json({ success: false, error: err.message || 'Send message failed' });
  }
});

// 6. Send Real Media Message (URL or PDF)
app.post('/send-media', async (req, res) => {
  const { phone, media_url, caption, media_type } = req.body;
  if (!sock || connectionStatus !== 'connected') {
    return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Scan QR code first.' });
  }

  try {
    const cleanNum = phone.replace(/[^0-9]/g, '');
    const jid = `${cleanNum}@s.whatsapp.net`;
    let messageContent = {};

    if (media_type === 'image') {
      messageContent = { image: { url: media_url }, caption: caption || '' };
    } else if (media_type === 'document' || media_type === 'pdf') {
      messageContent = {
        document: { url: media_url },
        mimetype: 'application/pdf',
        fileName: 'Solar_Proposal.pdf',
        caption: caption || ''
      };
    } else {
      messageContent = { text: `${caption || ''}\n${media_url}` };
    }

    const sent = await sock.sendMessage(jid, messageContent);
    res.json({
      success: true,
      provider_message_id: sent?.key?.id,
      status: 'sent'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[WhatsApp Engine] Solarix Live WhatsApp Gateway listening on port ${PORT}`);
  // If previously saved session credentials exist, auto-reconnect
  const credsFile = path.join(AUTH_DIR, 'creds.json');
  if (fs.existsSync(credsFile)) {
    console.log('[WhatsApp Engine] Found existing credentials, restoring WhatsApp connection...');
    initWhatsApp(false);
  }
});
