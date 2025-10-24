// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mkdirp = require('mkdirp');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambiame_por_una_mas_segura';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LISTS_DIR = path.join(DATA_DIR, 'lists');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data folders/files
async function ensureData() {
  await mkdirp(LISTS_DIR);
  try {
    await fs.access(USERS_FILE);
  } catch (e) {
    await fs.writeFile(USERS_FILE, JSON.stringify({}), 'utf8');
  }
}
ensureData();

// Helpers
async function readUsers() {
  const raw = await fs.readFile(USERS_FILE, 'utf8');
  return JSON.parse(raw || '{}');
}
async function writeUsers(obj) {
  await fs.writeFile(USERS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}
function userListFile(username) {
  // sanitize username for filename
  const safe = username.replace(/[^a-z0-9_\-]/gi, '_');
  return path.join(LISTS_DIR, `${safe}.json`);
}
async function readList(username) {
  const file = userListFile(username);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    await fs.writeFile(file, JSON.stringify([]),'utf8');
    return [];
  }
}
async function writeList(username, arr) {
  const file = userListFile(username);
  await fs.writeFile(file, JSON.stringify(arr, null, 2), 'utf8');
}

// Auth middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Mal token' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Routes
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });
  const users = await readUsers();
  if (users[username]) return res.status(400).json({ error: 'Usuario ya existe' });
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  users[username] = { passwordHash: hash, createdAt: new Date().toISOString() };
  await writeUsers(users);
  // crear lista vacía para el usuario
  await writeList(username, []);
  return res.json({ ok: true, message: 'Usuario creado' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });
  const users = await readUsers();
  const user = users[username];
  if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });
  const match = bcrypt.compareSync(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: 'Contraseña incorrecta' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ ok: true, token, username });
});

// Obtener lista del usuario
app.get('/api/list', authMiddleware, async (req, res) => {
  const list = await readList(req.user);
  res.json(list);
});

// Agregar item
app.post('/api/item', authMiddleware, async (req, res) => {
  const { title, seasons, episodes, watched } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title requerido' });
  const list = await readList(req.user);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const item = {
    id,
    title,
    seasons: seasons || '',
    episodes: episodes || '',
    watched: !!watched
  };
  list.push(item);
  await writeList(req.user, list);
  res.json(item);
});

// Actualizar item
app.put('/api/item/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  const { title, seasons, episodes, watched } = req.body || {};
  const list = await readList(req.user);
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Item no encontrado' });
  if (title !== undefined) list[idx].title = title;
  if (seasons !== undefined) list[idx].seasons = seasons;
  if (episodes !== undefined) list[idx].episodes = episodes;
  if (watched !== undefined) list[idx].watched = !!watched;
  await writeList(req.user, list);
  res.json(list[idx]);
});

// Borrar item
app.delete('/api/item/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  const list = await readList(req.user);
  const newList = list.filter(i => i.id !== id);
  await writeList(req.user, newList);
  res.json({ ok: true });
});

// Exportar lista completa (opcional)
app.get('/api/export', authMiddleware, async (req, res) => {
  const list = await readList(req.user);
  res.json(list);
});

// Catch-all serve index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Servidor iniciado en puerto', PORT);
});