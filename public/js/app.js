// ==========================================================================
// PulseLead — Enterprise Meta Lead Ads Real-Time Controller
// ==========================================================================

let socket;
let leadsData = [];
let logsData = [];
let audioEnabled = true;
let activeFilter = 'all';

// Presets Data
const PRESETS = {
  solar: {
    name: 'Alexander Morgan',
    email: 'alex.morgan@greenenergy.com',
    phone: '+1 (555) 839-2041',
    formName: 'Residential Solar Savings Calculator',
    source: 'Meta Instagram Feed'
  },
  realestate: {
    name: 'Sophia Chen',
    email: 'sophia.chen@luxuryproperties.io',
    phone: '+1 (555) 492-1188',
    formName: 'Waterfront Penthouse VIP Showing',
    source: 'Meta Facebook Feed'
  },
  b2b: {
    name: 'Marcus Vance',
    email: 'marcus.v@cloudscale.tech',
    phone: '+1 (555) 720-9452',
    formName: 'Enterprise Cloud Migration Whitepaper',
    source: 'Meta Ads - B2B Audience'
  },
  auto: {
    name: 'Elena Rostova',
    email: 'elena.rostova@premierauto.com',
    phone: '+1 (555) 319-6402',
    formName: '2026 Electric SUV Test Drive',
    source: 'Meta Instant Lead Form'
  }
};

// DOM Elements
const statTotalCount = document.getElementById('statTotalCount');
const countAll = document.getElementById('countAll');
const leadsTableBody = document.getElementById('leadsTableBody');
const emptyStateContainer = document.getElementById('emptyStateContainer');
const leadSearchInput = document.getElementById('leadSearchInput');
const logsCountBadge = document.getElementById('logsCountBadge');

// Drawer Elements
const drawerBackdrop = document.getElementById('drawerBackdrop');
const drawerContent = document.getElementById('drawerContent');
const drawerLeadName = document.getElementById('drawerLeadName');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

// Modals
const simulateModalBackdrop = document.getElementById('simulateModalBackdrop');
const openSimulateModalBtn = document.getElementById('openSimulateModalBtn');
const closeSimulateModalBtn = document.getElementById('closeSimulateModalBtn');
const mobilePreviewModal = document.getElementById('mobilePreviewModal');
const openMobileModalBtn = document.getElementById('openMobileModalBtn');
const closeMobilePreviewBtn = document.getElementById('closeMobilePreviewBtn');
const mobileLeadsContainer = document.getElementById('mobileLeadsContainer');
const mobileEmptyState = document.getElementById('mobileEmptyState');
const mobileCountPill = document.getElementById('mobileCountPill');

// Bottom Terminal
const bottomTerminal = document.getElementById('bottomTerminal');
const toggleLogsBtn = document.getElementById('toggleLogsBtn');
const closeTerminalBtn = document.getElementById('closeTerminalBtn');
const clearTerminalBtn = document.getElementById('clearTerminalBtn');
const terminalLogsContainer = document.getElementById('terminalLogsContainer');

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
    osc.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.65);
  } catch (e) {
    console.warn('Audio notice:', e);
  }
}

// Toast Hub
function showToast(message, type = 'info') {
  const hub = document.getElementById('toastHub');
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : (type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
  hub.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
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

// Socket Initialization
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    showToast('Connected to live webhook engine', 'success');
  });

  socket.on('disconnect', () => {
    showToast('Real-time connection lost', 'warn');
  });

  // MAIN REAL-TIME INGESTION LISTENER
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
    renderTerminalEntry(log, true);
    logsCountBadge.textContent = logsData.length;
  });

  // Reset event
  socket.on('leads_cleared', () => {
    leadsData = [];
    logsData = [];
    updateCounters();
    renderAllLeads();
    terminalLogsContainer.innerHTML = '';
    logsCountBadge.textContent = '0';
    showToast('Workspace reset completed', 'info');
  });
}

// Initial Hydration
async function loadInitialData() {
  try {
    const [leadsRes, logsRes] = await Promise.all([
      fetch('/leads'),
      fetch('/api/logs')
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
      terminalLogsContainer.innerHTML = '';
      logsData.forEach(l => renderTerminalEntry(l, false));
      logsCountBadge.textContent = logsData.length;
    }
  } catch (err) {
    console.error('Failed initial hydration:', err);
  }
}

// Update Counters
function updateCounters() {
  const count = leadsData.length;
  statTotalCount.textContent = count;
  countAll.textContent = count;
  mobileCountPill.textContent = count;
}

// Render Lead Table Row
function renderLeadRow(lead, isNew = false) {
  if (emptyStateContainer) emptyStateContainer.style.display = 'none';
  if (mobileEmptyState) mobileEmptyState.style.display = 'none';

  const initials = lead.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'LD';

  const tr = document.createElement('tr');
  tr.className = isNew ? 'lead-row-animated' : '';
  tr.setAttribute('data-id', lead.leadId);
  tr.setAttribute('data-source', lead.source || '');

  tr.innerHTML = `
    <td>
      <div class="lead-profile-cell">
        <div class="lead-avatar">${initials}</div>
        <div>
          <span class="lead-name-text">${escapeHtml(lead.name)}</span>
          <div class="lead-contact-line">
            <span><i class="fa-regular fa-envelope"></i> ${escapeHtml(lead.email)}</span>
            <span><i class="fa-solid fa-phone"></i> ${escapeHtml(lead.phone)}</span>
          </div>
        </div>
      </div>
    </td>
    <td>
      <span class="form-badge-pill"><i class="fa-solid fa-rectangle-list text-muted"></i> ${escapeHtml(lead.formName || 'Meta Form')}</span>
    </td>
    <td>
      <span class="channel-tag-pill"><i class="fa-brands fa-meta"></i> ${escapeHtml(lead.source || 'Meta Lead Ads')}</span>
    </td>
    <td>
      <span class="time-cell" data-time="${lead.receivedAt}"><i class="fa-regular fa-clock"></i> ${timeAgo(lead.receivedAt)}</span>
    </td>
    <td>
      <span class="id-code-tag">${escapeHtml(lead.leadId)}</span>
    </td>
    <td class="text-right">
      <button class="table-action-btn" onclick="openLeadDrawer('${lead.leadId}')">
        <i class="fa-solid fa-arrow-right"></i> Details
      </button>
    </td>
  `;

  // Row click opens drawer
  tr.addEventListener('click', (e) => {
    if (!e.target.closest('button')) {
      openLeadDrawer(lead.leadId);
    }
  });

  leadsTableBody.insertBefore(tr, leadsTableBody.firstChild);

  // Render on Mobile Device
  const mobileCard = document.createElement('div');
  mobileCard.className = `device-card-item ${isNew ? 'flash-new' : ''}`;
  mobileCard.innerHTML = `
    <h5>${escapeHtml(lead.name)}</h5>
    <p><i class="fa-regular fa-envelope"></i> ${escapeHtml(lead.email)}</p>
    <p><i class="fa-solid fa-phone"></i> ${escapeHtml(lead.phone)}</p>
    <span class="device-time-tag"><i class="fa-regular fa-clock"></i> ${timeAgo(lead.receivedAt)}</span>
  `;
  mobileLeadsContainer.insertBefore(mobileCard, mobileLeadsContainer.firstChild);

  if (isNew) {
    setTimeout(() => {
      tr.classList.remove('lead-row-animated');
      mobileCard.classList.remove('flash-new');
    }, 3500);
  }
}

// Render All Leads
function renderAllLeads() {
  leadsTableBody.innerHTML = '';
  mobileLeadsContainer.innerHTML = '';

  if (leadsData.length === 0) {
    emptyStateContainer.style.display = 'flex';
    mobileEmptyState.style.display = 'block';
    return;
  }

  emptyStateContainer.style.display = 'none';
  mobileEmptyState.style.display = 'none';
  leadsData.forEach(l => renderLeadRow(l, false));
}

// Open Lead Drawer
window.openLeadDrawer = function(leadId) {
  const lead = leadsData.find(l => l.leadId === leadId);
  if (!lead) return;

  drawerLeadName.textContent = lead.name;
  drawerContent.innerHTML = `
    <div>
      <span class="drawer-section-title">Contact & Attribution</span>
      <div class="drawer-key-val-grid">
        <div class="drawer-item">
          <label>Full Name</label>
          <span>${escapeHtml(lead.name)}</span>
        </div>
        <div class="drawer-item">
          <label>Phone Number</label>
          <span>${escapeHtml(lead.phone)}</span>
        </div>
        <div class="drawer-item full-width">
          <label>Email Address</label>
          <span>${escapeHtml(lead.email)}</span>
        </div>
        <div class="drawer-item">
          <label>Campaign Source</label>
          <span>${escapeHtml(lead.source)}</span>
        </div>
        <div class="drawer-item">
          <label>Meta Form Name</label>
          <span>${escapeHtml(lead.formName)}</span>
        </div>
        <div class="drawer-item">
          <label>Leadgen ID</label>
          <code>${escapeHtml(lead.leadId)}</code>
        </div>
        <div class="drawer-item">
          <label>Received Timestamp</label>
          <span>${new Date(lead.receivedAt).toLocaleString()}</span>
        </div>
      </div>
    </div>

    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="drawer-section-title" style="margin-bottom: 0;">Raw Normalized Payload</span>
        <button class="table-action-btn" onclick="copyRawJson('${lead.leadId}')">
          <i class="fa-regular fa-copy"></i> Copy JSON
        </button>
      </div>
      <pre class="drawer-json-block" id="rawJson_${lead.leadId}"><code>${escapeHtml(JSON.stringify(lead, null, 2))}</code></pre>
    </div>
  `;

  drawerBackdrop.classList.add('active');
};

// Copy Raw JSON helper
window.copyRawJson = function(leadId) {
  const el = document.getElementById(`rawJson_${leadId}`);
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => {
      showToast('Payload copied to clipboard', 'info');
    });
  }
};

// Close Drawer
closeDrawerBtn.addEventListener('click', () => drawerBackdrop.classList.remove('active'));
drawerBackdrop.addEventListener('click', (e) => {
  if (e.target === drawerBackdrop) drawerBackdrop.classList.remove('active');
});

// Render Terminal Log Entry
function renderTerminalEntry(log, prepend = true) {
  const div = document.createElement('div');
  div.className = 'term-entry';
  const t = new Date(log.timestamp).toLocaleTimeString();
  div.innerHTML = `
    <span class="term-t">[${t}]</span>
    <span class="term-tag ${log.type}">${log.type}</span>
    <span class="term-msg">${escapeHtml(log.message)}</span>
  `;

  if (prepend) {
    terminalLogsContainer.insertBefore(div, terminalLogsContainer.firstChild);
  } else {
    terminalLogsContainer.appendChild(div);
  }
}

// Quick Preset Trigger from Top Bar
window.triggerQuickPreset = async function(presetKey) {
  const p = PRESETS[presetKey] || PRESETS.solar;
  try {
    const res = await fetch('/api/simulate-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    await res.json();
  } catch (err) {
    showToast('Simulation error: ' + err.message, 'warn');
  }
};

// Simulate Modal Controls
window.openSimulateModal = function() {
  simulateModalBackdrop.classList.add('active');
};
openSimulateModalBtn.addEventListener('click', openSimulateModal);
closeSimulateModalBtn.addEventListener('click', () => simulateModalBackdrop.classList.remove('active'));
simulateModalBackdrop.addEventListener('click', (e) => {
  if (e.target === simulateModalBackdrop) simulateModalBackdrop.classList.remove('active');
});

// Preset Card Click in Modal
document.querySelectorAll('.preset-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    const key = card.getAttribute('data-preset');
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

// Simulate Form Submit
document.getElementById('simulateLeadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitSimulateBtn');
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
    simulateModalBackdrop.classList.remove('active');
  } catch (err) {
    showToast('Simulation error: ' + err.message, 'warn');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Dispatch Webhook';
  }
});

// Send Raw Meta JSON
document.getElementById('sendRawJsonBtn').addEventListener('click', async () => {
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
    showToast(`Dispatched Meta JSON packet (${randId})`, 'success');
    simulateModalBackdrop.classList.remove('active');
  } catch (err) {
    showToast('Webhook failed: ' + err.message, 'warn');
  }
});

// Mobile Preview Modal Controls
openMobileModalBtn.addEventListener('click', () => mobilePreviewModal.classList.add('active'));
closeMobilePreviewBtn.addEventListener('click', () => mobilePreviewModal.classList.remove('active'));
mobilePreviewModal.addEventListener('click', (e) => {
  if (e.target === mobilePreviewModal) mobilePreviewModal.classList.remove('active');
});

// Bottom Terminal Controls
toggleLogsBtn.addEventListener('click', () => bottomTerminal.classList.toggle('active'));
closeTerminalBtn.addEventListener('click', () => bottomTerminal.classList.remove('active'));
clearTerminalBtn.addEventListener('click', () => {
  terminalLogsContainer.innerHTML = '';
  logsData = [];
  logsCountBadge.textContent = '0';
});

// Reset Data
document.getElementById('resetDataBtn').addEventListener('click', async () => {
  if (confirm('Clear all leads and logs for a clean demonstration?')) {
    await fetch('/api/clear', { method: 'POST' });
  }
});

// Audio Toggle
const toggleSoundBtn = document.getElementById('toggleSoundBtn');
const soundIcon = document.getElementById('soundIcon');
toggleSoundBtn.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  soundIcon.className = audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  showToast(audioEnabled ? 'Audio alerts enabled' : 'Audio alerts muted', 'info');
});

// Search Filter
leadSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  document.querySelectorAll('#leadsTableBody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
});

// Channel Filter Buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.getAttribute('data-filter');

    document.querySelectorAll('#leadsTableBody tr').forEach(row => {
      const source = (row.getAttribute('data-source') || '').toLowerCase();
      if (activeFilter === 'all') {
        row.style.display = '';
      } else if (activeFilter === 'meta') {
        row.style.display = source.includes('meta') || source.includes('facebook') || source.includes('instagram') ? '' : 'none';
      } else if (activeFilter === 'instant') {
        row.style.display = source.includes('instant') || source.includes('form') ? '' : 'none';
      }
    });
  });
});

// Global Keyboard Shortcuts: '/' for search, 'N' for new lead
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== leadSearchInput) {
    e.preventDefault();
    leadSearchInput.focus();
  }
  if ((e.key === 'n' || e.key === 'N') && document.activeElement.tagName !== 'INPUT' && !simulateModalBackdrop.classList.contains('active')) {
    e.preventDefault();
    openSimulateModal();
  }
});

// Relative Time Refresh Loop
setInterval(() => {
  document.querySelectorAll('.time-cell[data-time]').forEach(el => {
    const t = el.getAttribute('data-time');
    el.innerHTML = `<i class="fa-regular fa-clock"></i> ${timeAgo(t)}`;
  });
  document.querySelectorAll('.device-time-tag[data-time]').forEach(el => {
    const t = el.getAttribute('data-time');
    el.innerHTML = `<i class="fa-regular fa-clock"></i> ${timeAgo(t)}`;
  });
}, 10000);

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadInitialData();
});
