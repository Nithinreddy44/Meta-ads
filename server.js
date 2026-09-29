require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 4000;
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'meta_lead_ads_secret_token_2026';
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v20.0';

// In-memory data store
const leads = [];
const processedLeadIds = new Set();
const systemLogs = [];

// Helper to push system logs
function addLog(type, message, details = null) {
  const logItem = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    type, // 'INFO' | 'WEBHOOK' | 'GRAPH_API' | 'SOCKET' | 'WARN' | 'ERROR'
    message,
    details
  };
  systemLogs.unshift(logItem);
  if (systemLogs.length > 100) systemLogs.pop();
  io.emit('log_event', logItem);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    activeSockets: io.engine.clientsCount,
    totalLeadsReceived: leads.length,
    processedIdsCount: processedLeadIds.size,
    metaGraphConfigured: Boolean(META_PAGE_ACCESS_TOKEN)
  });
});

// 2. Get All Leads Endpoint
app.get('/leads', (req, res) => {
  res.status(200).json({
    success: true,
    count: leads.length,
    data: leads
  });
});

// 3. Get Logs Endpoint
app.get('/api/logs', (req, res) => {
  res.status(200).json({
    success: true,
    count: systemLogs.length,
    data: systemLogs
  });
});

// 4. Get System Config / Status
app.get('/api/config', (req, res) => {
  res.status(200).json({
    verifyToken: META_VERIFY_TOKEN,
    graphApiVersion: META_GRAPH_API_VERSION,
    hasPageAccessToken: Boolean(META_PAGE_ACCESS_TOKEN),
    port: PORT
  });
});

// 5. Clear All Leads & Logs (Demo reset)
app.post('/api/clear', (req, res) => {
  leads.length = 0;
  processedLeadIds.clear();
  systemLogs.length = 0;
  addLog('INFO', 'Store reset: cleared all leads, logs, and deduplication cache');
  io.emit('leads_cleared');
  res.status(200).json({ success: true, message: 'All data cleared' });
});

// 6. Meta Webhook Verification Handshake (GET /webhook/meta)
app.get('/webhook/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  addLog('WEBHOOK', 'Meta Webhook Handshake Verification Request Received', {
    mode,
    receivedToken: token ? `${token.slice(0, 4)}...${token.slice(-3)}` : 'null',
    challengeReceived: Boolean(challenge)
  });

  if (mode && token) {
    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      addLog('INFO', 'Webhook Verification SUCCESS! Returned hub.challenge to Meta');
      return res.status(200).send(challenge);
    } else {
      addLog('WARN', 'Webhook Verification FAILED: Verify token mismatch', {
        expected: META_VERIFY_TOKEN,
        received: token
      });
      return res.sendStatus(403);
    }
  }

  res.status(400).json({ error: 'Missing hub.mode or hub.verify_token' });
});

// Helper: Fetch lead details from Meta Graph API
async function fetchMetaLeadDetails(leadgenId) {
  if (!META_PAGE_ACCESS_TOKEN) {
    addLog('WARN', `No META_PAGE_ACCESS_TOKEN found. Generating enriched mock payload for leadgen_id: ${leadgenId}`);
    return {
      id: leadgenId,
      created_time: new Date().toISOString(),
      name: 'Jane Smith (Meta Lead)',
      email: 'jane.smith.demo@gmail.com',
      phone: '+1 (555) 349-8210',
      formName: 'Meta Instant Form - Demo Lead',
      source: 'Meta Lead Ads (Simulated Details)'
    };
  }

  const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${leadgenId}?access_token=${META_PAGE_ACCESS_TOKEN}`;
  addLog('GRAPH_API', `Fetching Lead Details from Meta Graph API: ${leadgenId}`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      addLog('ERROR', `Meta Graph API returned error: ${data.error.message}`, data.error);
      throw new Error(data.error.message);
    }

    addLog('GRAPH_API', `Successfully retrieved details from Graph API for ${leadgenId}`, data);

    let name = 'Unknown Name';
    let email = 'unknown@example.com';
    let phone = 'N/A';

    if (Array.isArray(data.field_data)) {
      data.field_data.forEach(field => {
        const key = field.name ? field.name.toLowerCase() : '';
        const val = (field.values && field.values[0]) || '';
        if (key.includes('name') || key.includes('full_name') || key.includes('first_name')) name = val;
        if (key.includes('email')) email = val;
        if (key.includes('phone')) phone = val;
      });
    }

    return {
      id: data.id || leadgenId,
      created_time: data.created_time || new Date().toISOString(),
      name,
      email,
      phone,
      formName: `Form #${data.form_id || 'Meta Form'}`,
      source: 'Meta Lead Ads'
    };
  } catch (err) {
    addLog('ERROR', `Failed Graph API retrieval: ${err.message}. Using fallback lead data.`);
    return {
      id: leadgenId,
      created_time: new Date().toISOString(),
      name: 'Meta Lead (' + leadgenId.slice(-4) + ')',
      email: `lead_${leadgenId.slice(-4)}@example.com`,
      phone: '+1 (555) ' + Math.floor(100 + Math.random() * 900) + '-' + Math.floor(1000 + Math.random() * 9000),
      formName: 'Meta Lead Form',
      source: 'Meta Lead Ads'
    };
  }
}

// 7. Meta Webhook Ingestion Endpoint (POST /webhook/meta)
app.post('/webhook/meta', async (req, res) => {
  const payload = req.body;

  addLog('WEBHOOK', 'Incoming POST /webhook/meta Payload Received', payload);

  // Acknowledge Meta immediately with 200 OK
  res.status(200).send('EVENT_RECEIVED');

  if (payload.object !== 'page' || !Array.isArray(payload.entry)) {
    addLog('WARN', 'Ignored webhook payload: object is not "page" or entry is invalid');
    return;
  }

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (change.field === 'leadgen' && change.value) {
        const leadgenId = change.value.leadgen_id;
        const formId = change.value.form_id || 'DEFAULT_FORM';
        const pageId = change.value.page_id || 'DEFAULT_PAGE';

        if (!leadgenId) {
          addLog('WARN', 'Received leadgen change event without leadgen_id');
          continue;
        }

        // Deduplication Check
        if (processedLeadIds.has(leadgenId)) {
          addLog('WARN', `Deduplication: Skipped already processed leadgen_id: ${leadgenId}`);
          continue;
        }

        processedLeadIds.add(leadgenId);
        addLog('INFO', `Processing new leadgen_id: ${leadgenId} from Page: ${pageId}, Form: ${formId}`);

        // Fetch Lead Details from Meta Graph API
        const details = await fetchMetaLeadDetails(leadgenId);

        const newLead = {
          leadId: leadgenId,
          name: details.name,
          email: details.email,
          phone: details.phone,
          formId,
          pageId,
          formName: details.formName,
          source: details.source || 'Meta Lead Ads',
          receivedAt: new Date().toISOString(),
          createdTime: details.created_time || new Date().toISOString(),
          status: 'New'
        };

        // Prepend to in-memory store
        leads.unshift(newLead);
        if (leads.length > 200) leads.pop();

        addLog('SOCKET', `Broadcasting new lead to ${io.engine.clientsCount} connected clients: ${newLead.name}`, newLead);

        // Real-time Push to Mobile and Web clients
        io.emit('new_lead', newLead);
      }
    }
  }
});

// 8. Interactive Lead Simulator Endpoint (Allows testing without Meta API keys or external tools)
app.post('/api/simulate-lead', async (req, res) => {
  const { name, email, phone, formName, source } = req.body;
  const leadgenId = 'sim_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  if (processedLeadIds.has(leadgenId)) {
    return res.status(400).json({ error: 'Duplicate lead generated' });
  }

  processedLeadIds.add(leadgenId);

  const newLead = {
    leadId: leadgenId,
    name: name || 'Demo Prospect',
    email: email || 'prospect@business.com',
    phone: phone || '+1 (555) 789-0123',
    formId: 'FORM_' + Math.floor(1000 + Math.random() * 9000),
    pageId: 'PAGE_DEMO_BUSINESS',
    formName: formName || 'Instant Quote Form',
    source: source || 'Meta Lead Ads (Testing Tool)',
    receivedAt: new Date().toISOString(),
    createdTime: new Date().toISOString(),
    status: 'New'
  };

  leads.unshift(newLead);
  if (leads.length > 200) leads.pop();

  addLog('WEBHOOK', `[SIMULATED TEST] Webhook triggered for lead: ${newLead.name} (${newLead.leadId})`, newLead);
  addLog('SOCKET', `[SIMULATED TEST] Broadcasted lead to ${io.engine.clientsCount} active client(s)`, newLead);

  io.emit('new_lead', newLead);

  res.status(201).json({
    success: true,
    message: 'Lead simulated & broadcasted via WebSocket',
    data: newLead
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  addLog('SOCKET', `Client connected: ${socket.id} (Total active: ${io.engine.clientsCount})`);

  // Send initial handshake with current stats
  socket.emit('connection_ready', {
    socketId: socket.id,
    leadsCount: leads.length,
    serverTime: new Date().toISOString()
  });

  socket.on('disconnect', (reason) => {
    addLog('SOCKET', `Client disconnected: ${socket.id} (Reason: ${reason})`);
  });
});

// Start Server
server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Meta Lead Ads Real-Time Server running on port ${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/health`);
  console.log(`📥 Leads REST API: http://localhost:${PORT}/leads`);
  console.log(`🔗 Webhook Endpoint: http://localhost:${PORT}/webhook/meta`);
  console.log(`💻 Web Dashboard: http://localhost:${PORT}`);
  console.log('====================================================');
  addLog('INFO', `Server initialized on port ${PORT}. Ready to ingest Meta webhooks.`);
});
