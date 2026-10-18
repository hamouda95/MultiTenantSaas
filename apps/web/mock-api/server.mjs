/**
 * API simulée (sans dépendances) reproduisant le contrat de apps/api :
 * mêmes routes, mêmes formats de réponse/erreur, mêmes règles RBAC (Owner = tout, autres rôles = rien).
 * Usage : pnpm --filter @saas/web mock-api   →  http://localhost:4000
 * ⚠️ Outil de développement uniquement. Données en mémoire, aucune vraie authentification.
 */
import http from 'node:http';

const PORT = Number(process.env.PORT || 4000);
const ORIGIN = process.env.WEB_URL || 'http://localhost:3000';
const now = () => new Date().toISOString();
const days = (n) => new Date(Date.now() - n * 86400000).toISOString();

const users = [
  { id: 'usr-alice', email: 'alice@acme.com', fullName: 'alice', isPlatformAdmin: false },
  { id: 'usr-bob', email: 'bob@acme.com', fullName: 'bob', isPlatformAdmin: false },
  { id: 'usr-root', email: 'root@platform.io', fullName: 'root', isPlatformAdmin: true },
];
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const tenants = [
  { id: T1, slug: 'acme-corp', name: 'Acme Corp', status: 'ACTIVE', createdAt: days(40), updatedAt: days(2) },
  { id: T2, slug: 'globex', name: 'Globex', status: 'ACTIVE', createdAt: days(10), updatedAt: days(1) },
];
const memberships = [
  { id: 'm1', tenantId: T1, userId: 'usr-alice', status: 'ACTIVE', roles: ['Owner'], createdAt: days(40) },
  { id: 'm2', tenantId: T1, userId: 'usr-bob', status: 'ACTIVE', roles: ['Member'], createdAt: days(12) },
  { id: 'm3', tenantId: T2, userId: 'usr-alice', status: 'ACTIVE', roles: ['Viewer'], createdAt: days(9) },
];
const settings = {
  [T1]: { id: 's1', tenantId: T1, logoUrl: null, primaryColor: '#0F172A', accentColor: '#2563EB', themeMode: 'SYSTEM', customDomain: null, metadata: {}, createdAt: days(40), updatedAt: days(2) },
  [T2]: { id: 's2', tenantId: T2, logoUrl: null, primaryColor: '#7C2D12', accentColor: '#EA580C', themeMode: 'LIGHT', customDomain: null, metadata: {}, createdAt: days(10), updatedAt: days(1) },
};
const KEYS = ['ai_chat', 'rag_documents', 'predictive_analytics', 'agent_tools', 'nl_sql'];
const modules = {};
const quotas = {};
const audit = {};
for (const t of tenants) seedTenant(t.id);

function seedTenant(id) {
  modules[id] = KEYS.map((k) => ({ id: `mod-${id}-${k}`, tenantId: id, moduleKey: k, isEnabled: true, configuration: {}, createdAt: days(5), updatedAt: days(5) }));
  quotas[id] = { id: `q-${id}`, tenantId: id, monthlyAiTokenBudget: 1000000, monthlyAiCostBudget: '50.00', maxMembers: 50, maxStorageBytes: '10737418240', currentAiTokensUsed: 842300, currentAiCostUsed: '31.4200', resetCycleDate: new Date(Date.now() + 12 * 86400000).toISOString(), createdAt: days(40), updatedAt: days(1) };
  audit[id] = [];
}
function log(tenantId, actorId, action, resourceType, resourceId, payload = {}) {
  audit[tenantId].unshift({ id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tenantId, actorId, action, resourceType, resourceId, ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 (mock)', payload, createdAt: now() });
}
log(T1, 'usr-alice', 'tenant.create', 'tenant', T1, { slug: 'acme-corp' });
log(T1, 'usr-alice', 'member.add', 'membership', 'm2', { email: 'bob@acme.com', role: 'Member' });
log(T1, 'usr-alice', 'settings.update', 'tenant_settings', 's1', { primaryColor: '#0F172A' });

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
class HttpError extends Error {
  constructor(status, body) { super(typeof body === 'string' ? body : body.message); this.status = status; this.body = typeof body === 'string' ? { statusCode: status, message: body } : { statusCode: status, ...body }; }
}
const workspacesOf = (uid) =>
  memberships.filter((m) => m.userId === uid && m.status === 'ACTIVE').map((m) => {
    const t = tenants.find((x) => x.id === m.tenantId);
    return { tenantId: t.id, slug: t.slug, name: t.name, tenantStatus: t.status, membershipId: m.id, membershipStatus: m.status, roles: m.roles };
  });

function auth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Missing or invalid Authorization header');
  const u = users.find((x) => `mock.${x.id}` === h.slice(7));
  if (!u) throw new HttpError(401, 'Invalid or expired authentication token');
  return u;
}
function tenantAccess(req, user, tenantId, permission) {
  const id = req.headers['x-tenant-id'] || tenantId;
  if (!id) throw new HttpError(400, 'A target tenant must be specified via x-tenant-id header or path');
  if (!uuidRe.test(id)) throw new HttpError(400, 'Invalid tenant ID format');
  if (!tenants.some((t) => t.id === id)) throw new HttpError(404, `Tenant with ID ${id} not found`);
  if (user.isPlatformAdmin) return id;
  const m = memberships.find((x) => x.tenantId === id && x.userId === user.id && x.status === 'ACTIVE');
  if (!m) throw new HttpError(403, 'User does not have an active membership in the requested tenant');
  if (permission && !m.roles.includes('Owner')) throw new HttpError(403, `Insufficient permissions. Required: [${permission}]`);
  return id;
}
function validate(errors) {
  if (errors.length) throw new HttpError(400, { error: 'Bad Request', message: 'Input validation failed', details: errors });
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

async function route(req, url) {
  const { pathname: p, searchParams } = url;
  const m = req.method;
  let r;

  if (m === 'GET' && p === '/health/live') return { status: 'ok', timestamp: now(), uptimeSeconds: Math.floor(process.uptime()) };

  if (m === 'POST' && p === '/api/v1/auth/login') {
    const b = await readBody(req);
    const errs = [];
    if (typeof b.email !== 'string' || !/^\S+@\S+\.\S+$/.test(b.email)) errs.push('email: Valid email address required');
    if (b.password !== undefined && String(b.password).length < 8) errs.push('password: Password must be at least 8 characters');
    validate(errs);
    let u = users.find((x) => x.email === b.email.toLowerCase());
    if (!u) { u = { id: `usr-${Date.now()}`, email: b.email.toLowerCase(), fullName: b.email.split('@')[0], isPlatformAdmin: false }; users.push(u); }
    return { token: `mock.${u.id}`, user: u, workspaces: workspacesOf(u.id) };
  }

  const user = auth(req);
  if (m === 'GET' && p === '/api/v1/auth/workspaces') return { workspaces: workspacesOf(user.id) };
  if (m === 'GET' && p === '/api/v1/auth/me') return { profile: user };

  if (m === 'POST' && p === '/api/v1/tenants') {
    const b = await readBody(req);
    const errs = [];
    if (typeof b.name !== 'string' || b.name.length < 2) errs.push('name: Tenant name must be at least 2 characters');
    if (typeof b.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug) || b.slug.length < 3) errs.push('slug: Slug must be lowercase alphanumeric with optional hyphens');
    if (b.primaryColor && !hexRe.test(b.primaryColor)) errs.push('primaryColor: Primary color must be a valid hex color code (e.g. #0F172A)');
    validate(errs);
    if (b.placementMode === 'DEDICATED' && !user.isPlatformAdmin) throw new HttpError(403, 'Dedicated database placement is an enterprise feature requiring platform administrator provisioning');
    if (tenants.some((t) => t.slug === b.slug)) throw new HttpError(409, `Tenant slug '${b.slug}' is already in use`);
    const id = crypto.randomUUID();
    const tenant = { id, slug: b.slug, name: b.name, status: 'ACTIVE', createdAt: now(), updatedAt: now() };
    tenants.push(tenant);
    settings[id] = { id: `set-${id}`, tenantId: id, logoUrl: null, primaryColor: b.primaryColor || '#0F172A', accentColor: '#2563EB', themeMode: 'SYSTEM', customDomain: null, metadata: {}, createdAt: now(), updatedAt: now() };
    seedTenant(id);
    memberships.push({ id: `mem-${id}`, tenantId: id, userId: user.id, status: 'ACTIVE', roles: ['Owner'], createdAt: now() });
    log(id, user.id, 'tenant.create', 'tenant', id, { slug: b.slug });
    return { tenant, settings: settings[id], placement: { id: `plc-${id}`, tenantId: id, placementMode: b.placementMode || 'SHARED', schemaName: 'public', region: 'eu-central-1' } };
  }

  if ((r = p.match(/^\/api\/v1\/tenants\/([^/]+)(?:\/(.*))?$/))) {
    const [, tid, rest = ''] = r;
    const perm = { members: m === 'GET' ? 'members:read' : 'members:manage', settings: m === 'GET' ? 'settings:read' : 'settings:manage', quotas: 'quotas:read', 'audit-logs': 'audit:read' };
    const seg = rest.split('/')[0];
    const permission = rest.startsWith('modules/') ? 'modules:manage' : perm[seg];
    const id = tenantAccess(req, user, tid, permission);

    if (m === 'GET' && rest === '') return tenants.find((t) => t.id === id);

    if (rest === 'members' && m === 'GET') {
      return memberships.filter((x) => x.tenantId === id).map((x) => {
        const u = users.find((y) => y.id === x.userId);
        return { id: x.id, status: x.status, createdAt: x.createdAt, userId: u.id, email: u.email, fullName: u.fullName, roles: x.roles };
      });
    }
    if (rest === 'members' && m === 'POST') {
      const b = await readBody(req);
      const errs = [];
      if (typeof b.email !== 'string' || !/^\S+@\S+\.\S+$/.test(b.email)) errs.push('email: Valid email address required');
      validate(errs);
      let u = users.find((x) => x.email === b.email.toLowerCase());
      if (!u) { u = { id: `usr-${Date.now()}`, email: b.email.toLowerCase(), fullName: b.email.split('@')[0], isPlatformAdmin: false }; users.push(u); }
      if (memberships.some((x) => x.tenantId === id && x.userId === u.id)) throw new HttpError(500, 'Internal server error');
      const mm = { id: `mem-${id}-${u.id}`, tenantId: id, userId: u.id, status: 'ACTIVE', roles: [b.role || 'Member'], createdAt: now() };
      memberships.push(mm);
      log(id, user.id, 'member.add', 'membership', mm.id, { email: u.email, role: mm.roles[0] });
      return { membershipId: mm.id, userId: u.id, tenantId: id, status: 'ACTIVE', role: mm.roles[0] };
    }

    if (rest === 'settings' && m === 'GET') {
      const s = settings[id];
      return { settings: s, cssVariables: { '--brand-primary': s.primaryColor, '--brand-accent': s.accentColor, '--theme-mode': s.themeMode } };
    }
    if (rest === 'settings' && m === 'PATCH') {
      const b = await readBody(req);
      const errs = [];
      if (b.primaryColor !== undefined && !hexRe.test(b.primaryColor)) errs.push('primaryColor: Primary color must be a valid hex color code');
      if (b.accentColor !== undefined && !hexRe.test(b.accentColor)) errs.push('accentColor: Accent color must be a valid hex color code');
      if (b.themeMode !== undefined && !['LIGHT', 'DARK', 'SYSTEM'].includes(b.themeMode)) errs.push('themeMode: Invalid enum value');
      if (b.logoUrl && !/^https?:\/\//.test(b.logoUrl)) errs.push('logoUrl: Logo must be a valid URL');
      if (b.customDomain && !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(b.customDomain)) errs.push('customDomain: Custom domain must be a valid domain format without protocol or spaces');
      validate(errs);
      Object.assign(settings[id], Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)), { updatedAt: now() });
      log(id, user.id, 'settings.update', 'tenant_settings', settings[id].id, b);
      return settings[id];
    }

    if (rest === 'modules' && m === 'GET') return modules[id];
    if ((r = rest.match(/^modules\/([^/]+)$/)) && m === 'PATCH') {
      const b = await readBody(req);
      if (typeof b.isEnabled !== 'boolean') validate(['isEnabled: Required']);
      let mod = modules[id].find((x) => x.moduleKey === r[1]);
      if (!mod) { mod = { id: `mod-${id}-${r[1]}`, tenantId: id, moduleKey: r[1], isEnabled: false, configuration: {}, createdAt: now(), updatedAt: now() }; modules[id].push(mod); }
      Object.assign(mod, { isEnabled: b.isEnabled, configuration: b.configuration || {}, updatedAt: now() });
      log(id, user.id, 'module.toggle', 'tenant_module', mod.id, { moduleKey: r[1], isEnabled: b.isEnabled });
      return mod;
    }
    if (rest === 'quotas' && m === 'GET') return quotas[id];
    if (rest === 'audit-logs' && m === 'GET') {
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
      return audit[id].slice(0, limit);
    }
  }
  throw new HttpError(404, `Cannot ${m} ${p}`);
}

http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id, x-request-id', 'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE', Vary: 'Origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  try {
    const out = await route(req, new URL(req.url, `http://${req.headers.host}`));
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const body = e instanceof HttpError ? e.body : { statusCode: 500, message: 'Internal server error' };
    if (!(e instanceof HttpError)) console.error(e);
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}).listen(PORT, () => console.log(`[mock-api] http://localhost:${PORT}  (alice@acme.com = Owner, bob@acme.com = Member, root@platform.io = admin plateforme)`));
