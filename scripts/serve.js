// Container lifecycle: migrations, then web and worker sharing one mounted image directory.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const children = new Set();
let stopping = false;
async function shutdown(code) {
 if (stopping) return;
 stopping = true;
 process.exitCode = code;
 const timer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 25000);
 timer.unref();
 await Promise.all([...children].map(async child => { const closed = once(child, 'close'); child.kill('SIGTERM'); await closed; }));
 clearTimeout(timer);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
function launch(script) {
 const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env });
 children.add(child);
 child.on('close', () => children.delete(child));
 child.on('error', error => { console.error(error); shutdown(1); });
 return child;
}
const migration = launch('scripts/migrate.js');
const [code] = await once(migration, 'close');
if (code !== 0) process.exitCode = 1;
else if (!stopping) {
 for (const script of ['scripts/start.js', 'scripts/capture-worker.js']) {
  const child = launch(script);
  child.on('close', () => { if (!stopping) shutdown(1); });
 }
}
