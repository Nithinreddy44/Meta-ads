// ==========================================================================
// Meta Lead Center — Real-Time Controller (Meta Business Suite Style)
// ==========================================================================

let socket;
let leadsData = [];
let logsData = [];
let audioEnabled = true;
let activeFilter = 'all';

// Preset Scenarios
const PRESETS = {
  solar: {
    name: 'Alexander Morgan',
    email: 'alex.morgan@greenenergy.com',
    phone: '+1 (555) 839-2041',
    formName: 'Residential Solar Savings Calculator',
    source: 'Instagram Feed Ad'
  },
  realestate: {
    name: 'Sophia Chen',
    email: 'sophia.chen@luxuryproperties.io',
    phone: '+1 (555) 492-1188',
    formName: 'Waterfront Penthouse VIP Showing',
    source: 'Facebook Feed Ad'
  },
  b2b: {
    name: 'Marcus Vance',
    email: 'marcus.v@cloudscale.tech',
    phone: '+1 (555) 720-9452',
    formName: 'Enterprise Cloud Migration Whitepaper',
    source: 'Instagram Story Ad'
  },
  auto: {
    name: 'Elena Rostova',
    email: 'elena.rostova@premierauto.com',
    phone: '+1 (555) 319-6402',
    formName: '2026 Electric SUV Test Drive',
    source: 'Facebook Instant Form'
  }
};

// DOM Elements
const kpiTotalCount = document.getElementById('kpiTotalCount');
const sidebarLeadsCount = document.getElementById('sidebarLeadsCount');
const pillCountAll = document.getElementById('pillCountAll');
const leadsTableBody = document.getElementById('leadsTableBody');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');

// Drawer Elements
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerPanel = document.getElementById('drawerPanel');
const drawerLeadName = document.getElementById('drawerLeadName');
const drawerBody = document.getElementById('drawerBody');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

// Modals
const simulatorModal = document.getElementById('simulatorModal');
const openSimulatorBtn = document.getElementById('openSimulatorBtn');
const closeSimulatorBtn = document.getElementById('closeSimulatorBtn');
const configModal = document.getElementById('configModal');
const openConfigModalBtn = document.getElementById('openConfigModalBtn');
const closeConfigModalBtn = document.getElementById('closeConfigModalBtn');

// Bottom Terminal
const terminalDrawer = document.getElementById('terminalDrawer');
const navLogsBtn = document.getElementById('navLogsBtn');
const closeLogsBtn = document.getElementById('closeLogsBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const terminalLogStream = document.getElementById('terminalLogStream');
const sidebarLogDot = document.getElementById('sidebarLogDot');

// Audio Synthesizer for Lead Chime
function playMetaChime() {
  if (!audioEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
  } catch (e) {
    console.warn('Audio notice:', e);
  }
}

// Meta Toast System
function showMetaToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `meta-toast ${type}`;
  const icon = type === 'success' ? 'fa-circle-check text-green' : (type === 'warn' ? 'fa-triangle-exclamation text-meta' : 'fa-circle-info text-meta');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);
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

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize Socket.IO
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    showMetaToast('Connected to Meta Webhook stream', 'success');
  });

  socket.on('disconnect', () => {
    showMetaToast('Disconnected from server', 'warn');
  });

  // REAL-TIME NEW LEAD EVENT
  socket.on('new_lead', (lead) => {
    leadsData.unshift(lead);
    updateCounts();
    renderLeadTableRow(lead, true);
    playMetaChime();
    showMetaToast(`New Lead Received: ${lead.name}`, 'success');
  });

  // Log event
  socket.on('log_event', (log) => {
    logsData.unshift(log);
    renderLogLine(log, true);
    if (sidebarLogDot) sidebarLogDot.style.display = 'block';
  });

  // Leads cleared
  socket.on('leads_cleared', () => {
    leadsData = [];
    logsData = [];
    updateCounts();
    renderAllLeadRows();
    terminalLogStream.innerHTML = '';
    showMetaToast('All leads and logs reset', 'info');
  });
}

// Load Initial Data
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
      updateCounts();
      renderAllLeadRows();
    }

    const logsJson = await logsRes.json();
    if (logsJson.success && Array.isArray(logsJson.data)) {
      logsData = logsJson.data;
      terminalLogStream.innerHTML = '';
      logsData.forEach(l => renderLogLine(l, false));
    }

    const cfgJson = await cfgRes.json();
    if (cfgJson && cfgJson.verifyToken) {
      document.getElementById('cfgVerifyToken').textContent = cfgJson.verifyToken;
    }
  } catch (err) {
    console.error('Initial load failed:', err);
  }
}

// Update Counters
function updateCounts() {
  const count = leadsData.length;
  kpiTotalCount.textContent = count;
  sidebarLeadsCount.textContent = count;
  pillCountAll.textContent = count;
}

// Render Table Row (Meta Style)
function renderLeadTableRow(lead, isNew = false) {
  if (emptyState) emptyState.style.display = 'none';

  const initials = lead.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'LD';
  const isInstagram = (lead.source || '').toLowerCase().includes('instagram');

  const tr = document.createElement('tr');
  tr.className = isNew ? 'row-new-arrival' : '';
  tr.setAttribute('data-id', lead.leadId);
  tr.setAttribute('data-source', lead.source || '');

  tr.innerHTML = `
    <td>
      <div class="lead-identity">
        <div class="lead-avatar">${initials}</div>
        <div>
          <span class="lead-name">${escapeHtml(lead.name)}</span>
          <div class="lead-subcontacts">
            <a href="mailto:${escapeHtml(lead.email)}"><i class="fa-regular fa-envelope"></i> ${escapeHtml(lead.email)}</a>
            <a href="tel:${escapeHtml(lead.phone)}"><i class="fa-solid fa-phone"></i> ${escapeHtml(lead.phone)}</a>
          </div>
        </div>
      </div>
    </td>
    <td>
      <span class="form-tag"><i class="fa-solid fa-rectangle-list text-secondary"></i> ${escapeHtml(lead.formName || 'Meta Instant Form')}</span>
    </td>
    <td>
      <span class="platform-pill ${isInstagram ? 'ig' : 'fb'}">
        <i class="fa-brands ${isInstagram ? 'fa-instagram' : 'fa-facebook'}"></i>
        ${escapeHtml(lead.source || 'Meta Lead Ads')}
      </span>
    </td>
    <td>
      <span class="stage-pill">
        <i class="fa-solid fa-circle" style="font-size: 6px;"></i> New Lead
      </span>
    </td>
    <td>
      <span class="time-stamp" data-time="${lead.receivedAt}">${timeAgo(lead.receivedAt)}</span>
    </td>
    <td>
      <span class="lead-id-pill">${escapeHtml(lead.leadId)}</span>
    </td>
    <td class="text-right">
      <button class="btn-view-lead" onclick="openLeadDrawer('${lead.leadId}')">
        View Details
      </button>
    </td>
  `;

  tr.addEventListener('click', (e) => {
    if (!e.target.closest('button') && !e.target.closest('a')) {
      openLeadDrawer(lead.leadId);
    }
  });

  leadsTableBody.insertBefore(tr, leadsTableBody.firstChild);

  if (isNew) {
    setTimeout(() => {
      tr.classList.remove('row-new-arrival');
    }, 3500);
  }
}

// Render All Leads
function renderAllLeadRows() {
  leadsTableBody.innerHTML = '';

  if (leadsData.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  leadsData.forEach(l => renderLeadTableRow(l, false));
}

// Open Lead Drawer (Meta Style)
window.openLeadDrawer = function(leadId) {
  const lead = leadsData.find(l => l.leadId === leadId);
  if (!lead) return;

  drawerLeadName.textContent = lead.name;
  drawerBody.innerHTML = `
    <div>
      <span class="drawer-section-heading">Contact Information</span>
      <div class="drawer-field-grid">
        <div class="drawer-field-card">
          <label>Full Name</label>
          <span>${escapeHtml(lead.name)}</span>
        </div>
        <div class="drawer-field-card">
          <label>Phone Number</label>
          <span><a href="tel:${escapeHtml(lead.phone)}" style="color:#0866ff;text-decoration:none;">${escapeHtml(lead.phone)}</a></span>
        </div>
        <div class="drawer-field-card full">
          <label>Email Address</label>
          <span><a href="mailto:${escapeHtml(lead.email)}" style="color:#0866ff;text-decoration:none;">${escapeHtml(lead.email)}</a></span>
        </div>
      </div>
    </div>

    <div>
      <span class="drawer-section-heading">Meta Ad Attribution</span>
      <div class="drawer-field-grid">
        <div class="drawer-field-card">
          <label>Campaign / Placement</label>
          <span>${escapeHtml(lead.source)}</span>
        </div>
        <div class="drawer-field-card">
          <label>Instant Form Name</label>
          <span>${escapeHtml(lead.formName)}</span>
        </div>
        <div class="drawer-field-card">
          <label>Leadgen ID</label>
          <code>${escapeHtml(lead.leadId)}</code>
        </div>
        <div class="drawer-field-card">
          <label>Received Timestamp</label>
          <span>${new Date(lead.receivedAt).toLocaleString()}</span>
        </div>
      </div>
    </div>

    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="drawer-section-heading" style="margin-bottom: 0;">Graph API Normalized Payload</span>
        <button class="btn-view-lead" onclick="copyDrawerJson('${lead.leadId}')">
          <i class="fa-regular fa-copy"></i> Copy JSON
        </button>
      </div>
      <pre class="drawer-json-box" id="json_${lead.leadId}"><code>${escapeHtml(JSON.stringify(lead, null, 2))}</code></pre>
    </div>
  `;

  drawerOverlay.classList.add('active');
};

// Copy JSON helper
window.copyDrawerJson = function(leadId) {
  const el = document.getElementById(`json_${leadId}`);
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => {
      showMetaToast('JSON copied to clipboard', 'info');
    });
  }
};

// Close Drawer
closeDrawerBtn.addEventListener('click', () => drawerOverlay.classList.remove('active'));
drawerOverlay.addEventListener('click', (e) => {
  if (e.target === drawerOverlay) drawerOverlay.classList.remove('active');
});

// Render Log Line in Terminal
function renderLogLine(log, prepend = true) {
  const div = document.createElement('div');
  div.className = 'term-line';
  const t = new Date(log.timestamp).toLocaleTimeString();
  div.innerHTML = `
    <span class="term-timestamp">[${t}]</span>
    <span class="term-badge ${log.type}">${log.type}</span>
    <span class="term-text">${escapeHtml(log.message)}</span>
  `;

  if (prepend) {
    terminalLogStream.insertBefore(div, terminalLogStream.firstChild);
  } else {
    terminalLogStream.appendChild(div);
  }
}

// Quick Preset from Toolbar
window.quickSubmit = async function(key) {
  const p = PRESETS[key] || PRESETS.solar;
  try {
    const res = await fetch('/api/simulate-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    await res.json();
  } catch (err) {
    showMetaToast('Simulation failed: ' + err.message, 'warn');
  }
};

// Modal Controls
window.openSimulatorModal = function() {
  simulatorModal.classList.add('active');
};
openSimulatorBtn.addEventListener('click', openSimulatorModal);
closeSimulatorBtn.addEventListener('click', () => simulatorModal.classList.remove('active'));
simulatorModal.addEventListener('click', (e) => {
  if (e.target === simulatorModal) simulatorModal.classList.remove('active');
});

document.getElementById('navTestingToolBtn').addEventListener('click', (e) => {
  e.preventDefault();
  openSimulatorModal();
});

// Preset Card Click in Modal
document.querySelectorAll('.scenario-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.scenario-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const key = pill.getAttribute('data-preset');
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

// Simulator Form Submit
document.getElementById('simulatorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('dispatchSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatched...';

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
    simulatorModal.classList.remove('active');
  } catch (err) {
    showMetaToast('Simulation failed: ' + err.message, 'warn');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Dispatch Test Lead';
  }
});

// Raw JSON dispatch
document.getElementById('sendRawMetaJsonBtn').addEventListener('click', async () => {
  const randId = 'meta_test_' + Math.floor(10000000 + Math.random() * 90000000);
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
    showMetaToast(`Dispatched raw Meta packet (${randId})`, 'success');
    simulatorModal.classList.remove('active');
  } catch (err) {
    showMetaToast('Webhook failed: ' + err.message, 'warn');
  }
});

// Config Modal
openConfigModalBtn.addEventListener('click', () => configModal.classList.add('active'));
closeConfigModalBtn.addEventListener('click', () => configModal.classList.remove('active'));
configModal.addEventListener('click', (e) => {
  if (e.target === configModal) configModal.classList.remove('active');
});

// Bottom Terminal Controls
navLogsBtn.addEventListener('click', (e) => {
  e.preventDefault();
  terminalDrawer.classList.toggle('active');
  if (sidebarLogDot) sidebarLogDot.style.display = 'none';
});
closeLogsBtn.addEventListener('click', () => terminalDrawer.classList.remove('active'));
clearLogsBtn.addEventListener('click', () => {
  terminalLogStream.innerHTML = '';
  logsData = [];
});

// Reset Data
document.getElementById('clearDataBtn').addEventListener('click', async () => {
  if (confirm('Reset all leads and logs for a clean demonstration?')) {
    await fetch('/api/clear', { method: 'POST' });
  }
});

// Audio Toggle
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
soundToggleBtn.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  soundIcon.className = audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  showMetaToast(audioEnabled ? 'Sound alerts enabled' : 'Sound alerts muted', 'info');
});

// Search Filter
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  document.querySelectorAll('#leadsTableBody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
});

// Filter Pills
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.getAttribute('data-filter');

    document.querySelectorAll('#leadsTableBody tr').forEach(row => {
      const source = (row.getAttribute('data-source') || '').toLowerCase();
      if (activeFilter === 'all') {
        row.style.display = '';
      } else if (activeFilter === 'instagram') {
        row.style.display = source.includes('instagram') ? '' : 'none';
      } else if (activeFilter === 'facebook') {
        row.style.display = source.includes('facebook') || source.includes('form') ? '' : 'none';
      }
    });
  });
});

// Copy Text Utility
window.copyText = function(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => {
    showMetaToast('Copied to clipboard', 'info');
  });
};

// Periodic Timestamp Refresher
setInterval(() => {
  document.querySelectorAll('.time-stamp[data-time]').forEach(el => {
    const t = el.getAttribute('data-time');
    el.textContent = timeAgo(t);
  });
}, 10000);

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadInitialData();
});
