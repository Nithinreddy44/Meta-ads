// ==========================================================================
// PulseLead — Meta Lead Ads Real-Time Ingestion Engine
// ==========================================================================

let socket;
let leadsData = [];
let logsData = [];
let audioEnabled = true;
let activeFilter = 'all';
let timerInterval = null;
let timerSeconds = 300;

// Presets Data
const PRESETS = {
  solar: {
    name: 'Alexander Morgan',
    email: 'alex.morgan@greenenergy.com',
    phone: '+1 (555) 839-2041',
    formName: 'Residential Solar Savings Calculator',
    source: 'Meta Instagram Feed - Spring 2026 Promo'
  },
  realestate: {
    name: 'Sophia Chen',
    email: 'sophia.chen@luxuryproperties.io',
    phone: '+1 (555) 492-1188',
    formName: 'Waterfront Penthouse VIP Showing Request',
    source: 'Meta Facebook Feed - High Net Worth'
  },
  b2b: {
    name: 'Marcus Vance',
    email: 'marcus.v@cloudscale.tech',
    phone: '+1 (555) 720-9452',
    formName: 'Enterprise Cloud Migration Whitepaper & Demo',
    source: 'Meta Ads - B2B Tech Decision Makers'
  },
  auto: {
    name: 'Elena Rostova',
    email: 'elena.rostova@premierauto.com',
    phone: '+1 (555) 319-6402',
    formName: '2026 Electric SUV Test Drive Reservation',
    source: 'Meta Instant Lead Form - Auto Expo'
  }
};

// DOM Elements
const socketStatusChip = document.getElementById('socketStatusChip');
const socketStatusText = document.getElementById('socketStatusText');
const activeClientsCount = document.getElementById('activeClientsCount');
const totalLeadsCount = document.getElementById('totalLeadsCount');
const allCount = document.getElementById('allCount');
const leadsContainer = document.getElementById('leadsContainer');
const emptyState = document.getElementById('emptyState');
const logStream = document.getElementById('logStream');
const logDot = document.getElementById('logDot');
const leadSearchInput = document.getElementById('leadSearchInput');

// Mobile Modal
const mobileModal = document.getElementById('mobileModal');
const mobileMockToggleBtn = document.getElementById('mobileMockToggleBtn');
const closeMobileModalBtn = document.getElementById('closeMobileModalBtn');
const mobileLeadsList = document.getElementById('mobileLeadsList');
const mobileEmpty = document.getElementById('mobileEmpty');
const mobileCountBadge = document.getElementById('mobileCountBadge');

// Audio Chime Synthesizer
function playLeadChime() {
  if (!audioEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.12); // C6
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.65);
  } catch (e) {
    console.warn('Audio feedback notice:', e);
  }
}

// Toast Helper
function showToast(msg, type = 'info') {
  const stack = document.getElementById('toastStack');
  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : (type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${msg}</span>`;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Format Relative Time
function timeAgo(dateString) {
  const diff = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (diff < 4) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// XSS Sanitizer
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize Socket.IO Client
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    socketStatusChip.className = 'telemetry-chip active';
    socketStatusText.textContent = 'Pipeline Active';
  });

  socket.on('disconnect', () => {
    socketStatusChip.className = 'telemetry-chip';
    socketStatusText.textContent = 'Socket Disconnected';
  });

  socket.on('connection_ready', (data) => {
    if (data && data.socketId) {
      activeClientsCount.textContent = '1 Client';
    }
  });

  // THE REAL-TIME LEAD EVENT LISTENER
  socket.on('new_lead', (lead) => {
    leadsData.unshift(lead);
    updateCounters();
    renderLeadRow(lead, true);
    playLeadChime();
    showToast(`New Lead Ingested: ${lead.name}`, 'success');
  });

  // Log events
  socket.on('log_event', (log) => {
    logsData.unshift(log);
    renderLogEntry(log, true);
    if (logDot) logDot.style.display = 'block';
  });

  // Data reset
  socket.on('leads_cleared', () => {
    leadsData = [];
    logsData = [];
    updateCounters();
    renderAllLeads();
    logStream.innerHTML = '';
    showToast('Reset completed', 'info');
  });
}

// Initial Data Fetch
async function loadInitialData() {
  try {
    const [leadsRes, logsRes, cfgRes] = await Promise.all([
      fetch('/leads'),
      fetch('/api/logs'),
      fetch('/api/config')
    ]);

    const leadsJson = await leadsRes.json();
    if (leadsJson.success && Array.isArray(leadsJson.data)) {
      leadsData = leadsJson.data;
      updateCounters();
      renderAllLeads();
    }

    const logsJson = await logsRes.json();
    if (logsJson.success && Array.isArray(logsJson.data)) {
      logsData = logsJson.data;
      logStream.innerHTML = '';
      logsData.forEach(l => renderLogEntry(l, false));
    }

    const cfgJson = await cfgRes.json();
    if (cfgJson && cfgJson.verifyToken) {
      const cfgTokenEl = document.getElementById('cfgToken');
      if (cfgTokenEl) cfgTokenEl.textContent = cfgJson.verifyToken;
    }
  } catch (err) {
    console.error('Initial load failed:', err);
  }
}

// Update Counters
function updateCounters() {
  const count = leadsData.length;
  totalLeadsCount.textContent = count;
  allCount.textContent = count;
  mobileCountBadge.textContent = count;
}

// Render Individual Lead Card
function renderLeadRow(lead, isNew = false) {
  if (emptyState) emptyState.style.display = 'none';
  if (mobileEmpty) mobileEmpty.style.display = 'none';

  const initials = lead.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'LD';

  const row = document.createElement('div');
  row.className = `lead-row ${isNew ? 'flash-new' : ''}`;
  row.setAttribute('data-id', lead.leadId);
  row.setAttribute('data-source', lead.source || '');
  row.innerHTML = `
    <div class="lead-left-block">
      <div class="lead-avatar-bubble">${initials}</div>
      <div class="lead-core-info">
        <h4>
          ${escapeHtml(lead.name)}
          <span class="channel-tag">${escapeHtml(lead.source || 'Meta Lead Ads')}</span>
        </h4>
        <div class="lead-meta-strip">
          <span class="meta-token"><i class="fa-regular fa-envelope"></i> ${escapeHtml(lead.email)}</span>
          <span class="meta-token"><i class="fa-solid fa-phone"></i> ${escapeHtml(lead.phone)}</span>
          <span class="meta-token"><i class="fa-regular fa-rectangle-list"></i> ${escapeHtml(lead.formName || 'Lead Form')}</span>
        </div>
      </div>
    </div>
    <div class="lead-right-block">
      <span class="time-badge" data-time="${lead.receivedAt}">
        <i class="fa-regular fa-clock"></i> ${timeAgo(lead.receivedAt)}
      </span>
      <span class="lead-id-code">ID: ${escapeHtml(lead.leadId)}</span>
    </div>
  `;

  leadsContainer.insertBefore(row, leadsContainer.firstChild);

  // Render on Mobile Mock Screen
  const mobileCard = document.createElement('div');
  mobileCard.className = `device-lead-card ${isNew ? 'flash-new' : ''}`;
  mobileCard.innerHTML = `
    <h5>${escapeHtml(lead.name)}</h5>
    <p><i class="fa-regular fa-envelope"></i> ${escapeHtml(lead.email)}</p>
    <p><i class="fa-solid fa-phone"></i> ${escapeHtml(lead.phone)}</p>
    <span class="device-lead-time"><i class="fa-regular fa-clock"></i> ${timeAgo(lead.receivedAt)}</span>
  `;
  mobileLeadsList.insertBefore(mobileCard, mobileLeadsList.firstChild);

  if (isNew) {
    setTimeout(() => {
      row.classList.remove('flash-new');
      mobileCard.classList.remove('flash-new');
    }, 3500);
  }
}

// Render All Leads
function renderAllLeads() {
  leadsContainer.innerHTML = '';
  mobileLeadsList.innerHTML = '';

  if (leadsData.length === 0) {
    leadsContainer.appendChild(emptyState);
    emptyState.style.display = 'flex';
    mobileLeadsList.appendChild(mobileEmpty);
    mobileEmpty.style.display = 'block';
    return;
  }

  leadsData.forEach(l => renderLeadRow(l, false));
}

// Render Log Entry
function renderLogEntry(log, prepend = true) {
  const el = document.createElement('div');
  el.className = `log-entry ${log.type}`;
  const t = new Date(log.timestamp).toLocaleTimeString();
  const rawDetails = log.details ? JSON.stringify(log.details, null, 2) : '';

  el.innerHTML = `
    <div class="log-header">
      <span class="log-t">[${t}]</span>
      <span class="log-lbl">${log.type}</span>
      <span class="log-txt">${escapeHtml(log.message)}</span>
    </div>
    ${rawDetails ? `<pre class="log-meta-raw">${escapeHtml(rawDetails)}</pre>` : ''}
  `;

  if (prepend) {
    logStream.insertBefore(el, logStream.firstChild);
  } else {
    logStream.appendChild(el);
  }
}

// Trigger Quick Lead Helper
window.triggerQuickLead = function(presetKey) {
  const p = PRESETS[presetKey] || PRESETS.solar;
  document.getElementById('simName').value = p.name;
  document.getElementById('simEmail').value = p.email;
  document.getElementById('simPhone').value = p.phone;
  document.getElementById('simFormName').value = p.formName;
  document.getElementById('simSource').value = p.source;

  document.getElementById('simulatorForm').dispatchEvent(new Event('submit'));
};

// Copy Code Utility
window.copyCode = function(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard', 'info');
  });
};

// Global Keyboard Shortcut: '/' to focus search
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== leadSearchInput) {
    e.preventDefault();
    leadSearchInput.focus();
  }
});

// Search Filter
leadSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  document.querySelectorAll('.lead-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? 'flex' : 'none';
  });
});

// Channel Filter Chips
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.getAttribute('data-filter');

    document.querySelectorAll('.lead-row').forEach(row => {
      const source = (row.getAttribute('data-source') || '').toLowerCase();
      if (activeFilter === 'all') {
        row.style.display = 'flex';
      } else if (activeFilter === 'meta') {
        row.style.display = source.includes('meta') || source.includes('facebook') || source.includes('instagram') ? 'flex' : 'none';
      } else if (activeFilter === 'instant') {
        row.style.display = source.includes('instant') || source.includes('form') ? 'flex' : 'none';
      }
    });
  });
});

// Console Tab Navigation
document.querySelectorAll('.console-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.console-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.console-view').forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.getAttribute('data-target');
    const targetPanel = document.getElementById(targetId);
    if (targetPanel) targetPanel.classList.add('active');

    if (targetId === 'panel-inspector' && logDot) {
      logDot.style.display = 'none';
    }
  });
});

// Preset Card Click Handler
document.querySelectorAll('.preset-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const key = btn.getAttribute('data-preset');
    const p = PRESETS[key];
    if (p) {
      document.getElementById('simName').value = p.name;
      document.getElementById('simEmail').value = p.email;
      document.getElementById('simPhone').value = p.phone;
      document.getElementById('simFormName').value = p.formName;
      document.getElementById('simSource').value = p.source;
    }
  });
});

// Simulator Form Submission
document.getElementById('simulatorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitSimBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Emitting...';

  const payload = {
    name: document.getElementById('simName').value,
    email: document.getElementById('simEmail').value,
    phone: document.getElementById('simPhone').value,
    formName: document.getElementById('simFormName').value,
    source: document.getElementById('simSource').value
  };

  try {
    const res = await fetch('/api/simulate-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await res.json();
  } catch (err) {
    showToast('Simulation error: ' + err.message, 'warn');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Dispatch Webhook Lead';
  }
});

// Raw Webhook Dispatcher
document.getElementById('sendRawWebhookBtn').addEventListener('click', async () => {
  const randId = 'meta_lead_' + Math.floor(10000000 + Math.random() * 90000000);
  const payload = {
    object: 'page',
    entry: [
      {
        id: '104928374829104',
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'leadgen',
            value: {
              created_time: Math.floor(Date.now() / 1000),
              page_id: '104928374829104',
              form_id: '938271049281726',
              leadgen_id: randId
            }
          }
        ]
      }
    ]
  };

  try {
    await fetch('/webhook/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    showToast(`Dispatched raw Meta packet (${randId})`, 'success');
  } catch (err) {
    showToast('Webhook delivery failed: ' + err.message, 'warn');
  }
});

// Clear Logs
document.getElementById('clearLogsBtn').addEventListener('click', () => {
  logStream.innerHTML = '';
  logsData = [];
});

// Reset All Data
document.getElementById('clearDataBtn').addEventListener('click', async () => {
  if (confirm('Reset all leads and logs?')) {
    await fetch('/api/clear', { method: 'POST' });
  }
});

// Audio Toggle
const audioToggleBtn = document.getElementById('audioToggleBtn');
const audioIcon = document.getElementById('audioIcon');
audioToggleBtn.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  audioIcon.className = audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  showToast(audioEnabled ? 'Audio feedback enabled' : 'Audio feedback muted', 'info');
});

// Mobile Mock Toggle
mobileMockToggleBtn.addEventListener('click', () => mobileModal.classList.add('active'));
closeMobileModalBtn.addEventListener('click', () => mobileModal.classList.remove('active'));

// Loom 5-min Countdown Timer
const loomTimer = document.getElementById('loomTimer');
const startTimerBtn = document.getElementById('startTimerBtn');
const pauseTimerBtn = document.getElementById('pauseTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');

function updateLoomDisplay() {
  const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
  const s = (timerSeconds % 60).toString().padStart(2, '0');
  loomTimer.textContent = `${m}:${s}`;
}

startTimerBtn.addEventListener('click', () => {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    if (timerSeconds > 0) {
      timerSeconds--;
      updateLoomDisplay();
    } else {
      clearInterval(timerInterval);
      timerInterval = null;
      showToast('5-minute presentation time limit reached', 'warn');
    }
  }, 1000);
});

pauseTimerBtn.addEventListener('click', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
});

resetTimerBtn.addEventListener('click', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerSeconds = 300;
  updateLoomDisplay();
});

// Relative time refresher
setInterval(() => {
  document.querySelectorAll('.time-badge[data-time]').forEach(el => {
    const t = el.getAttribute('data-time');
    el.innerHTML = `<i class="fa-regular fa-clock"></i> ${timeAgo(t)}`;
  });
  document.querySelectorAll('.device-lead-time[data-time]').forEach(el => {
    const t = el.getAttribute('data-time');
    el.innerHTML = `<i class="fa-regular fa-clock"></i> ${timeAgo(t)}`;
  });
}, 10000);

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadInitialData();
});
