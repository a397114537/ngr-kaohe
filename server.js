// NGR 考核平台 - 后端服务 (Node 内置模块,无外部依赖)
// 运行: node server.js   (默认端口 3000,可用 PORT 环境变量覆盖)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
// 数据库目录:默认项目内的 data/,可经环境变量 DB_PATH 指向挂载的持久盘(云部署防数据丢失)
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'db.json');
const DATA_DIR = path.dirname(DB_PATH);
const PORT = process.env.PORT || 3000;

/* ---------------- 存储 ---------------- */
function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (e) { console.error('db 解析失败,使用空库', e); }
  }
  const db = {
    users: [],
    config: { errorReasons: ['功能异常', '数据错误', '页面报错', '性能问题', '权限问题', '其他'], deductPoints: ['1', '2', '3', '5', '10'] },
    orders: [], complaint: [], praise: [], wiki: [],
    sessions: {}
  };
  const salt = crypto.randomBytes(16).toString('hex');
  db.users.push({ id: 'u_admin', username: 'admin', name: '管理员', role: 'admin', salt, hash: hashPw('admin123', salt) });
  saveDB(db);
  console.log('\n[初始化] 已创建默认管理员账号');
  console.log('          用户名: admin    密码: admin123');
  console.log('          请登录后在「系统设置」中修改密码、创建成员并指定审核人。\n');
  return db;
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
let db = loadDB();

/* ---------------- 工具 ---------------- */
function hashPw(password, salt) { return crypto.scryptSync(String(password), salt, 64).toString('hex'); }
function newId() { return Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '', size = 0;
    req.on('data', c => { size += c.length; if (size > 2e6) { req.destroy(); reject(new Error('body too big')); } d += c; });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function sendFile(res, file, type) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': type }); res.end(data);
  });
}
// 考核周期:每月21日~次月20日为一个考核月,以结束月份命名。6.21-7.20 => 2026年7月考核
function periodOf(date) {
  const y = date.getFullYear(), m = date.getMonth();
  let ly, lm, start, end;
  if (date.getDate() >= 21) { start = new Date(y, m, 21); end = new Date(y, m + 1, 20); lm = m + 2; ly = y; if (lm > 12) { lm -= 12; ly++; } }
  else { let sy = y, sm = m - 1; if (sm < 0) { sm = 11; sy--; } start = new Date(sy, sm, 21); end = new Date(y, m, 20); lm = m + 1; ly = y; }
  return { y: ly, m: lm, start, end, label: `${ly}年${lm}月考核` };
}
function periodLabel(y, m) { return `${y}年${m}月考核`; }
function canReview(role) { return role === 'admin' || role === 'reviewer'; }

/* ---------------- 鉴权 ---------------- */
function auth(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = db.sessions[token];
  if (!s) return null;
  if (s.expires < Date.now()) { delete db.sessions[token]; saveDB(db); return null; }
  return db.users.find(x => x.id === s.userId) || null;
}
function publicUser(u) { return { id: u.id, username: u.username, name: u.name, role: u.role }; }

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  try {
    // 静态文件
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return sendFile(res, path.join(ROOT, 'index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && p.startsWith('/static/')) {
      const f = path.join(ROOT, p.replace('/static/', ''));
      if (f.startsWith(ROOT) && fs.existsSync(f)) return sendFile(res, f, 'application/octet-stream');
      return send(res, 404, { error: 'not found' });
    }
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'not found' });

    let body = {};
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      try { body = JSON.parse(await readBody(req) || '{}'); } catch (e) { return send(res, 400, { error: '请求体不是合法 JSON' }); }
    }

    /* 登录 / 会话 */
    if (p === '/api/login' && req.method === 'POST') {
      const user = db.users.find(x => x.username === body.username);
      if (!user || hashPw(body.password, user.salt) !== user.hash) return send(res, 401, { error: '用户名或密码错误' });
      const token = crypto.randomBytes(32).toString('hex');
      db.sessions[token] = { userId: user.id, expires: Date.now() + 1000 * 60 * 60 * 24 * 7 };
      saveDB(db);
      return send(res, 200, { token, user: publicUser(user) });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      const h = req.headers['authorization'] || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      if (db.sessions[token]) { delete db.sessions[token]; saveDB(db); }
      return send(res, 200, { ok: true });
    }
    // 普通成员免登录;me 为 null 表示未登录(普通成员)。仅管理员相关接口做鉴权。
    const me = auth(req);
    if (p === '/api/me' && req.method === 'GET') return send(res, 200, { user: me ? publicUser(me) : null });

    /* 用户管理 (仅 admin) */
    if (p === '/api/users' && req.method === 'GET') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      return send(res, 200, { users: db.users.map(publicUser) });
    }
    if (p === '/api/users' && req.method === 'POST') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      const { username, password, name, role } = body;
      if (!username || !password) return send(res, 400, { error: '用户名和密码必填' });
      if (db.users.find(x => x.username === username)) return send(res, 400, { error: '用户名已存在' });
      const r = ['admin', 'reviewer', 'user'].includes(role) ? role : 'user';
      const salt = crypto.randomBytes(16).toString('hex');
      db.users.push({ id: newId(), username, name: name || username, role: r, salt, hash: hashPw(password, salt) });
      saveDB(db); return send(res, 200, { ok: true });
    }
    let m;
    if ((m = p.match(/^\/api\/users\/([\w-]+)\/role$/)) && req.method === 'PUT') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      const t = db.users.find(x => x.id === m[1]); if (!t) return send(res, 404, { error: '用户不存在' });
      if (!['admin', 'reviewer', 'user'].includes(body.role)) return send(res, 400, { error: '非法角色' });
      if (t.username === 'admin' && body.role !== 'admin') return send(res, 400, { error: '不能取消初始管理员' });
      t.role = body.role; saveDB(db); return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/users\/([\w-]+)\/password$/)) && req.method === 'PUT') {
      if (!me || (me.role !== 'admin' && me.id !== m[1])) return send(res, 403, { error: '无权限' });
      const t = db.users.find(x => x.id === m[1]); if (!t) return send(res, 404, { error: '用户不存在' });
      if (!body.password) return send(res, 400, { error: '密码必填' });
      t.salt = crypto.randomBytes(16).toString('hex'); t.hash = hashPw(body.password, t.salt); saveDB(db);
      return send(res, 200, { ok: true });
    }

    /* 配置 (错误原因 / 扣分数) —— 读取公开,修改仅 admin */
    if (p === '/api/config' && req.method === 'GET') {
      const reviewers = db.users.filter(x => canReview(x.role)).map(publicUser);
      return send(res, 200, { errorReasons: db.config.errorReasons, deductPoints: db.config.deductPoints, reviewers });
    }
    if (p === '/api/config/reasons' && req.method === 'POST') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      const { action, value } = body; const v = String(value || '').trim();
      if (!v) return send(res, 400, { error: '值不能为空' });
      if (action === 'add') { if (db.config.errorReasons.includes(v)) return send(res, 400, { error: '已存在' }); db.config.errorReasons.push(v); }
      else if (action === 'delete') { db.config.errorReasons = db.config.errorReasons.filter(x => x !== v); }
      else return send(res, 400, { error: '非法操作' });
      saveDB(db); return send(res, 200, { errorReasons: db.config.errorReasons });
    }
    if (p === '/api/config/points' && req.method === 'POST') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      const { action, value } = body; const v = String(value || '').trim();
      if (!v) return send(res, 400, { error: '值不能为空' });
      if (action === 'add') { if (db.config.deductPoints.includes(v)) return send(res, 400, { error: '已存在' }); db.config.deductPoints.push(v); }
      else if (action === 'delete') { db.config.deductPoints = db.config.deductPoints.filter(x => x !== v); }
      else return send(res, 400, { error: '非法操作' });
      saveDB(db); return send(res, 200, { deductPoints: db.config.deductPoints });
    }

    /* 工单 —— 创建/查看/申诉 公开;审核与删除 仅 admin */
    if (p === '/api/orders' && req.method === 'GET') {
      const period = u.searchParams.get('period');
      let list = db.orders;
      if (period) list = list.filter(o => periodOf(new Date(o.created)).label === period);
      return send(res, 200, { orders: list });
    }
    if (p === '/api/orders' && req.method === 'POST') {
      const { ticket, reason, detail, owner, deductor, points } = body;
      if (!ticket || !reason || !detail || !owner || !deductor || !points) return send(res, 400, { error: '请填写完整必填项' });
      const now = new Date();
      const d = now, pp = n => String(n).padStart(2, '0');
      const o = { id: newId(), created: now.toISOString(), dateStr: `${d.getFullYear()}-${pp(d.getMonth() + 1)}-${pp(d.getDate())} ${pp(d.getHours())}:${pp(d.getMinutes())}`,
        ticket, reason, detail, owner, deductor, points, appeal: { reason: '', review: '', reviewedBy: '' }, createdBy: me ? me.id : null };
      db.orders.unshift(o); saveDB(db); return send(res, 200, { ok: true, order: o });
    }
    if ((m = p.match(/^\/api\/orders\/([\w-]+)\/appeal$/)) && req.method === 'PUT') {
      const o = db.orders.find(x => x.id === m[1]); if (!o) return send(res, 404, { error: '工单不存在' });
      o.appeal = o.appeal || {}; o.appeal.reason = String(body.reason || ''); saveDB(db);
      return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/orders\/([\w-]+)\/review$/)) && req.method === 'PUT') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '仅管理员可填写审核结果' });
      const o = db.orders.find(x => x.id === m[1]); if (!o) return send(res, 404, { error: '工单不存在' });
      if (!['', 'approved', 'rejected'].includes(body.review)) return send(res, 400, { error: '非法审核值' });
      o.appeal = o.appeal || {}; o.appeal.review = body.review; o.appeal.reviewedBy = me.name; saveDB(db);
      return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/orders\/([\w-]+)$/)) && req.method === 'DELETE') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      db.orders = db.orders.filter(x => x.id !== m[1]); saveDB(db); return send(res, 200, { ok: true });
    }

    /* 汇总 */
    if (p === '/api/summary' && req.method === 'GET') {
      const period = u.searchParams.get('period');
      const list = db.orders.filter(o => periodOf(new Date(o.created)).label === period);
      const persons = {};
      list.forEach(o => {
        const name = o.owner; if (!name) return;
        const pts = Number(o.points) || 0;
        if (!persons[name]) persons[name] = { raw: 0, waived: 0 };
        persons[name].raw += pts;
        if (o.appeal && o.appeal.review === 'approved') persons[name].waived += pts;
      });
      const rows = Object.keys(persons).map(n => ({ name: n, raw: persons[n].raw, waived: persons[n].waived, final: persons[n].raw - persons[n].waived }));
      rows.sort((a, b) => b.final - a.final);
      return send(res, 200, { rows });
    }
    if (p === '/api/periods' && req.method === 'GET') {
      const map = new Map();
      db.orders.forEach(o => { const pp = periodOf(new Date(o.created)); map.set(pp.label, (map.get(pp.label) || 0) + 1); });
      const cur = periodOf(new Date());
      if (!map.has(cur.label)) map.set(cur.label, 0);
      const list = [...map.entries()].map(([label, count]) => {
        const mm = label.match(/(\d+)年(\d+)月考核/); const y = +mm[1], mo = +mm[2];
        const pp = periodOf(new Date(y, mo - 1, 15));
        return { y, m: mo, label, count, range: `${pp.start.getMonth() + 1}.${pp.start.getDate()}-${pp.end.getMonth() + 1}.${pp.end.getDate()}` };
      }).sort((a, b) => b.y * 12 + b.m - (a.y * 12 + a.m));
      return send(res, 200, { periods: list });
    }

    /* 投诉 / 表扬 */
    if (p === '/api/feedback' && req.method === 'GET') return send(res, 200, { complaint: db.complaint, praise: db.praise });
    if (p === '/api/feedback' && req.method === 'POST') {
      const { kind } = body; const o = { id: newId(), created: Date.now(), kind, ...body };
      if (kind === 'complaint') db.complaint.unshift(o); else db.praise.unshift(o);
      saveDB(db); return send(res, 200, { ok: true });
    }

    /* 任务百科 */
    if (p === '/api/wiki' && req.method === 'GET') return send(res, 200, { wiki: db.wiki });
    if (p === '/api/wiki' && req.method === 'POST') {
      const { title, cat, sop } = body; if (!title || !cat || !sop) return send(res, 400, { error: '必填项缺失' });
      db.wiki.unshift({ id: newId(), created: Date.now(), ...body }); saveDB(db); return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/wiki\/([\w-]+)$/)) && req.method === 'DELETE') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      db.wiki = db.wiki.filter(x => x.id !== m[1]); saveDB(db); return send(res, 200, { ok: true });
    }

    /* 投诉 / 表扬 删除 (admin) */
    if ((m = p.match(/^\/api\/feedback\/([\w-]+)$/)) && req.method === 'DELETE') {
      if (!me || me.role !== 'admin') return send(res, 403, { error: '需要管理员权限' });
      const id = m[1];
      const before = db.complaint.length + db.praise.length;
      db.complaint = db.complaint.filter(x => x.id !== id);
      db.praise = db.praise.filter(x => x.id !== id);
      if (db.complaint.length + db.praise.length === before) return send(res, 404, { error: '记录不存在' });
      saveDB(db); return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: '接口不存在' });
  } catch (e) {
    console.error('处理请求出错:', e);
    send(res, 500, { error: '服务器错误' });
  }
});

// 绑定 0.0.0.0,使云平台容器外部可访问(PORT 由平台环境变量注入)
server.listen(PORT, '0.0.0.0', () => console.log(`NGR 考核平台后端已启动: http://0.0.0.0:${PORT}`));
