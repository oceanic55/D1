// ========== STATE ==========
const DEFAULT_SERVER_URL = 'https://m5-live.reinholdmess444.workers.dev';
const DEFAULT_DEVICE_ID = 'm5s3-live';
const STORAGE_KEY_SERVER = 'd1upload_server_url';
const STORAGE_KEY_TOKEN = 'd1upload_token';
const STORAGE_KEY_SELECTED_MODEL = 'd1upload_selected_model';

let serverUrl = localStorage.getItem(STORAGE_KEY_SERVER) || DEFAULT_SERVER_URL;
let token = localStorage.getItem(STORAGE_KEY_TOKEN) || '';
let selectedModel = localStorage.getItem(STORAGE_KEY_SELECTED_MODEL) || '';
let docs = [];
let liveModels = [];
let prompts = [];
let promptDrafts = {};
let activeMenu = null;

// ========== DOM ELEMENTS ==========
const uploadBanner = document.getElementById('uploadBanner');
const uploadContent = document.getElementById('uploadContent');
const libraryBanner = document.getElementById('libraryBanner');
const libraryHeader = document.getElementById('libraryHeader');
const libraryContent = document.getElementById('libraryContent');
const settingsOverlay = document.getElementById('settingsOverlay');
const renameModal = document.getElementById('renameModal');
const deleteModal = document.getElementById('deleteModal');
const llmBanner = document.getElementById('llmBanner');
const llmContent = document.getElementById('llmContent');
const instructionsBanner = document.getElementById('instructionsBanner');
const instructionsContent = document.getElementById('instructionsContent');

// ========== UTILITIES ==========
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ========== BANNER ==========
function showBanner(container, type, title, detail) {
  container.innerHTML = `
    <div class="banner ${type}">
      <div class="banner-icon">
        ${type === 'success' 
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'}
      </div>
      <div class="banner-content">
        <div class="banner-title">${title}</div>
        <div class="banner-detail">${detail}</div>
      </div>
      <button class="banner-close" onclick="this.parentElement.remove()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  `;
}

function clearBanner(container) {
  container.innerHTML = '';
}

// ========== TAB SWITCHING ==========
const STORAGE_KEY_ACTIVE_TAB = 'd1upload_active_tab';

function switchTab(tab) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const target = document.getElementById(tab + 'Tab');
  if (target) target.classList.add('active');
  localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, tab);
  if (tab === 'library') fetchDocs();
  if (tab === 'llm') fetchLiveModels();
  if (tab === 'instructions') fetchPrompts();
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // restore last active tab, fall back to 'upload'
  const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB) || 'upload';
  const validTabs = ['upload', 'library', 'llm', 'instructions'];
  switchTab(validTabs.includes(saved) ? saved : 'upload');
}

// ========== SETTINGS PANEL ==========
function openSettings() {
  settingsOverlay.innerHTML = `
    <div class="settings-panel">
      <div class="settings-title">Settings</div>
      <div class="field">
        <label class="field-label">Server URL</label>
        <input type="text" class="field-input" id="serverUrlInput" value="${serverUrl}" placeholder="https://example.workers.dev">
      </div>
      <div class="field">
        <label class="field-label">Upload Token</label>
        <input type="password" class="field-input" id="tokenInput" value="${token}" placeholder="Enter your token">
      </div>
      <div class="settings-actions">
        <button class="btn btn-secondary" id="settingsCancel">Cancel</button>
        <button class="btn btn-primary" id="settingsSave">Save</button>
      </div>
    </div>
  `;
  settingsOverlay.classList.add('open');
  document.getElementById('settingsCancel').addEventListener('click', closeSettings);
  document.getElementById('settingsSave').addEventListener('click', saveSettings);
}

function closeSettings() {
  settingsOverlay.classList.remove('open');
}

function saveSettings() {
  const serverInput = document.getElementById('serverUrlInput');
  const tokenInput = document.getElementById('tokenInput');
  serverUrl = serverInput.value.trim() || DEFAULT_SERVER_URL;
  token = tokenInput.value.trim();
  localStorage.setItem(STORAGE_KEY_SERVER, serverUrl);
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  closeSettings();
}

function initSettings() {
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });
  if (!token) openSettings();
}

// ========== UPLOAD TAB ==========
function renderUploadTab() {
  uploadContent.innerHTML = `
    <div class="drop-zone" id="dropZone">
      <div class="drop-zone-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </div>
      <div class="drop-zone-text">Drop a text file here</div>
      <div class="drop-zone-hint">or click to browse</div>
    </div>
    <input type="file" class="file-input" id="fileInput">
  `;
  setupDropZone();
}

function setUploading(isUploading) {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;
  if (isUploading) {
    dropZone.innerHTML = `
      <div class="uploading-state">
        <div class="spinner"></div>
        <div>Uploading...</div>
      </div>
    `;
    dropZone.style.cursor = 'default';
  } else {
    dropZone.innerHTML = `
      <div class="drop-zone-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </div>
      <div class="drop-zone-text">Drop a text file here</div>
      <div class="drop-zone-hint">or click to browse</div>
    `;
    dropZone.style.cursor = 'pointer';
    setupDropZone();
  }
}

async function uploadFile(file) {
  if (!token) {
    showBanner(uploadBanner, 'error', 'No token configured', 'Open settings and enter your upload token.');
    return;
  }
  setUploading(true);
  clearBanner(uploadBanner);
  try {
    const content = await file.text();
    const title = 'library/' + file.name;
    const res = await fetch(`${serverUrl}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Token': token },
      body: JSON.stringify({ title, content })
    });
    const data = await res.json();
    if (res.ok) {
      const size = formatBytes(data.total_size || 0);
      showBanner(uploadBanner, 'success', 'Uploaded', `${data.path || title}  ·  ${size}  ·  ${data.chunk_count || 0} chunks`);
    } else {
      showBanner(uploadBanner, 'error', 'Upload failed', data.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    showBanner(uploadBanner, 'error', 'Upload failed', err.message);
  } finally {
    setUploading(false);
  }
}

function setupDropZone() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  if (!dropZone) return;
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });
  dropZone.addEventListener('click', () => {
    if (!dropZone.querySelector('.uploading-state')) fileInput.click();
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
    fileInput.value = '';
  });
}

// ========== LIBRARY TAB ==========
function renderLibraryHeader() {
  libraryHeader.innerHTML = `
    <button class="refresh-btn" id="refreshBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
      Refresh
    </button>
  `;
  document.getElementById('refreshBtn').addEventListener('click', fetchDocs);
}

async function fetchDocs() {
  if (!token) {
    libraryContent.innerHTML = '<div class="library-empty">No token configured. Open settings to enter your token.</div>';
    return;
  }
  libraryContent.innerHTML = '<div class="library-loading">Loading...</div>';
  clearBanner(libraryBanner);
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    const res = await fetch(`${serverUrl}/docs`, { headers: { 'X-Upload-Token': token } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    docs = data.docs || [];
    renderDocs();
  } catch (err) {
    showBanner(libraryBanner, 'error', 'Failed to load documents', err.message);
    libraryContent.innerHTML = '<div class="library-empty">Failed to load</div>';
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function renderDocs() {
  if (docs.length === 0) {
    libraryContent.innerHTML = '<div class="library-empty">No documents uploaded yet</div>';
    return;
  }
  libraryContent.innerHTML = `
    <div class="doc-list">
      ${docs.map((doc, idx) => `
        <div class="doc-row" data-idx="${idx}">
          <div class="doc-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div class="doc-info">
            <div class="doc-path">${escapeHtml(doc.path)}</div>
            <div class="doc-meta">
              <span>${formatBytes(doc.total_size)}</span>
              <span>${doc.chunk_count} chunks</span>
              <span>${doc.updated_at}</span>
            </div>
          </div>
          <div class="doc-actions">
            <button class="doc-menu-btn" data-idx="${idx}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
            <div class="doc-menu" id="menu-${idx}">
              <button class="menu-item" data-action="download" data-idx="${idx}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download
              </button>
              <button class="menu-item" data-action="rename" data-idx="${idx}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                Rename
              </button>
              <button class="menu-item danger" data-action="delete" data-idx="${idx}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ========== MENU HANDLING ==========
function initMenuHandler() {
  document.addEventListener('click', (e) => {
    const menuBtn = e.target.closest('.doc-menu-btn');
    const menuItem = e.target.closest('.menu-item');
    if (menuItem) {
      const action = menuItem.dataset.action;
      const idx = parseInt(menuItem.dataset.idx);
      const doc = docs[idx];
      closeAllMenus();
      if (action === 'download') downloadDocument(doc);
      else if (action === 'rename') openRenameModal(doc);
      else if (action === 'delete') openDeleteModal(doc);
      return;
    }
    if (menuBtn) {
      const idx = menuBtn.dataset.idx;
      const menu = document.getElementById('menu-' + idx);
      if (activeMenu && activeMenu !== menu) activeMenu.classList.remove('open');
      menu.classList.toggle('open');
      activeMenu = menu.classList.contains('open') ? menu : null;
      return;
    }
    closeAllMenus();
  });
}

function closeAllMenus() {
  document.querySelectorAll('.doc-menu.open').forEach(m => m.classList.remove('open'));
  activeMenu = null;
}

async function downloadDocument(doc) {
  if (!token) {
    showBanner(libraryBanner, 'error', 'No token configured', 'Open settings and enter your upload token.');
    return;
  }
  try {
    const res = await fetch(`${serverUrl}/docs/${encodeURIComponent(doc.path)}/download`, {
      headers: { 'X-Upload-Token': token }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const content = await res.text();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.path.split('/').pop() || 'document.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showBanner(libraryBanner, 'error', 'Download failed', err.message);
  }
}

// ========== RENAME MODAL ==========
let renameTarget = null;

function openRenameModal(doc) {
  renameTarget = doc;
  renameModal.innerHTML = `
    <div class="modal">
      <div class="modal-title">Rename document</div>
      <div class="modal-text">${escapeHtml(doc.path)}</div>
      <input type="text" class="modal-input" id="renameInput" value="${escapeHtml(doc.path)}" placeholder="New name">
      <div class="modal-actions">
        <button class="btn btn-secondary" id="renameCancel">Cancel</button>
        <button class="btn btn-primary" id="renameConfirm">Rename</button>
      </div>
    </div>
  `;
  renameModal.classList.add('open');
  const input = document.getElementById('renameInput');
  input.focus();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') closeRenameModal(); });
  document.getElementById('renameCancel').addEventListener('click', closeRenameModal);
  document.getElementById('renameConfirm').addEventListener('click', submitRename);
}

function closeRenameModal() {
  renameModal.classList.remove('open');
  renameTarget = null;
}

async function submitRename() {
  if (!renameTarget) return;
  const input = document.getElementById('renameInput');
  const newName = input.value.trim();
  if (!newName || newName === renameTarget.path) { closeRenameModal(); return; }
  try {
    const res = await fetch(`${serverUrl}/docs/${encodeURIComponent(renameTarget.path)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Token': token },
      body: JSON.stringify({ new_path: newName })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const idx = docs.findIndex(d => d.path === renameTarget.path);
    if (idx !== -1) docs[idx].path = newName;
    closeRenameModal();
    renderDocs();
  } catch (err) {
    showBanner(libraryBanner, 'error', 'Rename failed', err.message);
  }
}

// ========== DELETE MODAL ==========
let deleteTarget = null;

function openDeleteModal(doc) {
  deleteTarget = doc;
  deleteModal.innerHTML = `
    <div class="modal">
      <div class="modal-title">Delete document?</div>
      <div class="modal-text">"${escapeHtml(doc.path)}" will be permanently removed.</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="deleteCancel">Cancel</button>
        <button class="btn btn-danger" id="deleteConfirm">Delete</button>
      </div>
    </div>
  `;
  deleteModal.classList.add('open');
  document.getElementById('deleteCancel').addEventListener('click', closeDeleteModal);
  document.getElementById('deleteConfirm').addEventListener('click', submitDelete);
}

function closeDeleteModal() {
  deleteModal.classList.remove('open');
  deleteTarget = null;
}

async function submitDelete() {
  if (!deleteTarget) return;
  try {
    const res = await fetch(`${serverUrl}/docs/${encodeURIComponent(deleteTarget.path)}`, {
      method: 'DELETE',
      headers: { 'X-Upload-Token': token }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    docs = docs.filter(d => d.path !== deleteTarget.path);
    closeDeleteModal();
    renderDocs();
  } catch (err) {
    showBanner(libraryBanner, 'error', 'Delete failed', err.message);
    closeDeleteModal();
  }
}

// ========== LLM TAB ==========
async function fetchLiveModels() {
  if (!token) {
    llmContent.innerHTML = '<div class="library-empty">No token configured. Open settings to enter your token.</div>';
    return;
  }
  clearBanner(llmBanner);
  llmContent.innerHTML = '<div class="library-loading">Loading...</div>';
  try {
    const res = await fetch(`${serverUrl}/models/live`, { headers: { 'X-Upload-Token': token } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    liveModels = data.models || [];
    renderLLMView();
  } catch (err) {
    showBanner(llmBanner, 'error', 'Failed to load models', err.message);
    llmContent.innerHTML = '<div class="library-empty">Failed to load</div>';
  }
}

function renderLLMView() {
  if (liveModels.length === 0) {
    llmContent.innerHTML = '<div class="library-empty">No Gemini Live models returned.</div>';
    return;
  }
  const currentModel = liveModels.find(m => m.name === selectedModel) || liveModels[0];
  llmContent.innerHTML = `
    <div class="llm-section">
      <div class="llm-title">Gemini Live Models</div>
      <div class="llm-description">
        Available models are fetched from the configured Google account when the app opens this tab. 
        The current device runtime model is unchanged until the server is updated to use this selection.
      </div>
      <select class="llm-model-select" id="modelSelect">
        ${liveModels.map(model => `
          <option value="${escapeHtml(model.name)}" ${model.name === selectedModel ? 'selected' : ''}>
            ${escapeHtml(model.displayName || model.name)}
          </option>
        `).join('')}
      </select>
      <div class="llm-model-info">
        <div class="llm-model-name">${escapeHtml(currentModel.name)}</div>
        ${currentModel.source === 'configured' ? '<div class="llm-source">Configured Worker runtime model</div>' : ''}
        ${currentModel.description ? `<div class="llm-model-desc">${escapeHtml(currentModel.description)}</div>` : ''}
      </div>
    </div>
  `;
  document.getElementById('modelSelect').addEventListener('change', (e) => {
    selectedModel = e.target.value;
    localStorage.setItem(STORAGE_KEY_SELECTED_MODEL, selectedModel);
    renderLLMView();
  });
}

// ========== INSTRUCTION TAB ==========
async function fetchPrompts() {
  if (!token) {
    instructionsContent.innerHTML = '<div class="library-empty">No token configured. Open settings to enter your token.</div>';
    return;
  }
  clearBanner(instructionsBanner);
  instructionsContent.innerHTML = '<div class="library-loading">Loading instructions...</div>';
  try {
    const res = await fetch(`${serverUrl}/instructions?device_id=${encodeURIComponent(DEFAULT_DEVICE_ID)}`, {
      headers: { 'X-Upload-Token': token }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    prompts = data.prompts || [];
    promptDrafts = Object.fromEntries(prompts.map(p => [p.path, p.content]));
    renderInstructionsView();
  } catch (err) {
    showBanner(instructionsBanner, 'error', 'Failed to load instructions', err.message);
    instructionsContent.innerHTML = '<div class="library-empty">Failed to load</div>';
  }
}

function renderInstructionsView() {
  if (prompts.length === 0) {
    instructionsContent.innerHTML = '<div class="library-empty">No instructions found</div>';
    return;
  }
  instructionsContent.innerHTML = `
    <div class="instruction-header">
      <p class="instruction-desc">Edits are local until Save is pressed. Closing or reloading without Save discards changes.</p>
      <p class="instruction-device">Device ID: ${escapeHtml(DEFAULT_DEVICE_ID)}</p>
    </div>
    <div class="instruction-editors">
      ${prompts.map(prompt => `
        <div class="instruction-editor-block">
          <label class="instruction-label">${escapeHtml(prompt.path)}</label>
          <textarea class="instruction-textarea" data-path="${escapeHtml(prompt.path)}">${escapeHtml(promptDrafts[prompt.path] || prompt.content)}</textarea>
        </div>
      `).join('')}
    </div>
    <div class="instruction-actions">
      <button class="btn btn-secondary" id="reloadInstructions">Reload</button>
      <button class="btn btn-primary" id="saveInstructions">Save</button>
    </div>
  `;

  // wire up live draft tracking
  instructionsContent.querySelectorAll('.instruction-textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      promptDrafts[ta.dataset.path] = ta.value;
    });
  });

  document.getElementById('reloadInstructions').addEventListener('click', fetchPrompts);
  document.getElementById('saveInstructions').addEventListener('click', savePrompts);
}

async function savePrompts() {
  if (!token || prompts.length === 0) return;
  clearBanner(instructionsBanner);
  const saveBtn = document.getElementById('saveInstructions');
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';
  saveBtn.disabled = true;
  try {
    for (const prompt of prompts) {
      const content = promptDrafts[prompt.path] || prompt.content;
      const res = await fetch(`${serverUrl}/instructions/${encodeURIComponent(prompt.path)}?device_id=${encodeURIComponent(DEFAULT_DEVICE_ID)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Upload-Token': token },
        body: JSON.stringify({ content })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    }
    showBanner(instructionsBanner, 'success', 'Saved', 'Instructions saved successfully');
    fetchPrompts();
  } catch (err) {
    showBanner(instructionsBanner, 'error', 'Save failed', err.message);
  } finally {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
  }
}

// ========== INIT ==========
function init() {
  initTabs();
  initSettings();
  initMenuHandler();
  renderUploadTab();
  renderLibraryHeader();
}

document.addEventListener('DOMContentLoaded', init);
