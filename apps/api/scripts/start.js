// Startup wrapper to ensure pg-native is not forced on platforms without the native binding.
delete process.env.NODE_PG_FORCE_NATIVE;
delete process.env.PG_FORCE_NATIVE;
delete process.env.PG_NATIVE;

await import('../dist/index.js');
