// Run inside NPM LXC 100, cwd=/app; pass the app's access.json on stdin.
// NPM's own methods update its DB, audit log, and generated config together.
const fs = require('fs');
const Access = require('/app/lib/access');
const hosts = require('/app/internal/proxy-host');
const lists = require('/app/internal/access-list');
const Host = require('/app/models/proxy_host');
const List = require('/app/models/access_list');
const Certificate = require('/app/models/certificate');
const db = require('/app/db');

(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!credentials.username || !credentials.password) throw new Error('Missing app credentials');
  const domain = 'prom-enter.ajy720.me';
  const name = 'Prom::Enter team';
  const current = await Host.query().where('is_deleted', 0);
  if (current.some(h => h.domain_names.includes(domain))) throw new Error('Host already exists; review before changing it');
  if (await List.query().where('is_deleted', 0).where('name', name).first()) throw new Error('Access list already exists');
  const cert = await Certificate.query().findById(40);
  if (!cert || cert.is_deleted || !cert.domain_names.includes('*.ajy720.me') || new Date(cert.expires_on.replace(' ', 'T') + 'Z') <= new Date()) {
    throw new Error('Expected valid wildcard certificate 40');
  }
  const backup = `/root/npm-before-prom-enter-${Date.now()}.sqlite3`;
  await db.raw('VACUUM INTO ?', [backup]);
  fs.chmodSync(backup, 0o600);
  const access = new Access();
  await access.load(true);
  const acl = await lists.create(access, {
    name, satisfy_any: false, pass_auth: false,
    items: [{username: credentials.username, password: credentials.password}],
    clients: [{address: 'all', directive: 'allow'}],
  });
  const host = await hosts.create(access, {
    domain_names: [domain], forward_scheme: 'http', forward_host: '192.168.1.200', forward_port: 8088,
    certificate_id: 40, access_list_id: acl.id, ssl_forced: true, http2_support: true,
    hsts_enabled: true, hsts_subdomains: false, allow_websocket_upgrade: false,
    block_exploits: true, caching_enabled: false, enabled: true, locations: [],
    advanced_config: 'client_max_body_size 64k;\nproxy_read_timeout 100s;\nproxy_send_timeout 100s;',
    meta: {},
  });
  console.log(JSON.stringify({host_id: host.id, access_list_id: acl.id, domains: host.domain_names, meta: host.meta, backup}));
})().catch(e => {console.error(e.message); process.exitCode = 1;}).finally(() => db.destroy());
