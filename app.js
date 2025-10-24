

// app.js - frontend logic
const base = 'localhost:43771'; // si sirves en /, funciona; si no, ajusta la URL base
const $ = id => document.getElementById(id);

let token = localStorage.getItem('token') || null;
let currentUser = localStorage.getItem('username') || null;

function setAuth(tkn, username) {
  token = tkn;
  currentUser = username;
  if (tkn) {
    localStorage.setItem('token', tkn);
    localStorage.setItem('username', username);
    $('btn-logout').style.display = 'inline-block';
    $('btn-show-login').style.display = 'none';
    $('auth-panel').style.display = 'none';
    $('app-section').style.display = 'block';
    loadList();
  } else {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    token = null; currentUser = null;
    $('btn-logout').style.display = 'none';
    $('btn-show-login').style.display = 'inline-block';
    $('auth-panel').style.display = 'block';
    $('app-section').style.display = 'none';
  }
}

async function apiFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers['Content-Type'] = 'application/json';
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  const res = await fetch(base + url, opts);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) { return txt; }
}

// Auth UI
$('btn-show-login').addEventListener('click', () => {
  const panel = $('auth-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'block';
});

$('btn-register').addEventListener('click', async () => {
  const u = $('reg-username').value.trim();
  const p = $('reg-password').value;
  $('reg-msg').textContent = 'Registrando...';
  try {
    const res = await apiFetch('/api/register', { method: 'POST', body: { username: u, password: p } });
    if (res.error) {
      $('reg-msg').textContent = res.error;
    } else {
      $('reg-msg').textContent = 'Registrado. Inicia sesión.';
      $('reg-username').value = '';
      $('reg-password').value = '';
    }
  } catch (e) { $('reg-msg').textContent = 'Error de red'; }
});

$('btn-login').addEventListener('click', async () => {
  const u = $('login-username').value.trim();
  const p = $('login-password').value;
  $('login-msg').textContent = 'Iniciando...';
  try {
    const res = await apiFetch('/api/login', { method: 'POST', body: { username: u, password: p } });
    if (res.error) {
      $('login-msg').textContent = res.error;
    } else {
      setAuth(res.token, res.username);
      $('login-msg').textContent = 'Bienvenido ' + res.username;
      $('login-username').value = '';
      $('login-password').value = '';
    }
  } catch (e) { $('login-msg').textContent = 'Error de red'; }
});

$('btn-logout').addEventListener('click', () => {
  setAuth(null, null);
});

// Add item
$('btn-add').addEventListener('click', async () => {
  const title = $('new-title').value.trim();
  if (!title) return alert('Escribe nombre');
  const seasons = $('new-seasons').value.trim();
  const episodes = $('new-episodes').value.trim();
  const watched = !!$('new-watched').checked;
  try {
    const res = await apiFetch('/api/item', { method: 'POST', body: { title, seasons, episodes, watched } });
    if (res && res.id) {
      $('new-title').value=''; $('new-seasons').value=''; $('new-episodes').value=''; $('new-watched').checked=false;
      addRowToTable(res);
    } else {
      alert(res.error || 'Error al agregar');
    }
  } catch (e) { alert('Error de red'); }
});

$('btn-export').addEventListener('click', async () => {
  try {
    const data = await apiFetch('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentUser || 'lista') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { alert('Error al exportar'); }
});

// Table management
function clearTable() {
  $('list-body').innerHTML = '';
}
function addRowToTable(item) {
  const tr = document.createElement('tr');
  tr.dataset.id = item.id;
  tr.className = item.watched ? 'row-watched' : 'row-unwatched';
  // name cell (editable)
  const tdName = document.createElement('td');
  const nameDiv = document.createElement('div');
  nameDiv.contentEditable = true;
  nameDiv.className = 'cell-editable';
  nameDiv.innerText = item.title || '';
  nameDiv.addEventListener('blur', () => saveCell(item.id, { title: nameDiv.innerText }));
  tdName.appendChild(nameDiv);
  tr.appendChild(tdName);

  // seasons
  const tdSeasons = document.createElement('td');
  const seasonsDiv = document.createElement('div');
  seasonsDiv.contentEditable = true;
  seasonsDiv.className = 'cell-editable';
  seasonsDiv.innerText = item.seasons || '';
  seasonsDiv.addEventListener('blur', () => saveCell(item.id, { seasons: seasonsDiv.innerText }));
  tdSeasons.appendChild(seasonsDiv);
  tr.appendChild(tdSeasons);

  // episodes
  const tdEps = document.createElement('td');
  const epsDiv = document.createElement('div');
  epsDiv.contentEditable = true;
  epsDiv.className = 'cell-editable';
  epsDiv.innerText = item.episodes || '';
  epsDiv.addEventListener('blur', () => saveCell(item.id, { episodes: epsDiv.innerText }));
  tdEps.appendChild(epsDiv);
  tr.appendChild(tdEps);

  // watched toggle
  const tdWatched = document.createElement('td');
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = !!item.watched;
  chk.addEventListener('change', async () => {
    await saveCell(item.id, { watched: chk.checked });
    tr.className = chk.checked ? 'row-watched' : 'row-unwatched';
  });
  tdWatched.appendChild(chk);
  tr.appendChild(tdWatched);

  // actions
  const tdAct = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.className = 'action-btn';
  delBtn.innerText = 'Eliminar';
  delBtn.addEventListener('click', async () => {
    if (!confirm('Eliminar este item?')) return;
    const id = item.id;
    const res = await apiFetch('/api/item/' + id, { method: 'DELETE' });
    if (res && res.ok) {
      tr.remove();
    } else {
      alert('Error al eliminar');
    }
  });
  tdAct.appendChild(delBtn);
  tr.appendChild(tdAct);

  $('list-body').appendChild(tr);
}

async function saveCell(id, data) {
  try {
    const res = await apiFetch('/api/item/' + id, { method: 'PUT', body: data });
    if (res && res.id) {
      // ok
    } else {
      alert(res.error || 'Error al guardar');
    }
  } catch (e) { alert('Error de red'); }
}

async function loadList() {
  clearTable();
  try {
    const list = await apiFetch('/api/list');
    if (Array.isArray(list)) {
      list.forEach(i => addRowToTable(i));
    } else {
      console.error(list);
    }
  } catch (e) {
    alert('Error cargando lista');
  }
}

// Init: show/hide depending auth
document.addEventListener('DOMContentLoaded', () => {
  if (token && currentUser) {
    setAuth(token, currentUser);
  } else {
    setAuth(null, null);
  }
});