try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
process.env.HOST ||= '127.0.0.1';
// Twenty 10 MiB images plus multipart fields and headers.
process.env.BODY_SIZE_LIMIT ||= '210M';
await import('./recover-intake.js');
await import('../build/index.js');
