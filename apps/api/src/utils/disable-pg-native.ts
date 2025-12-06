/**
 * Remove flags that would force the `pg` driver to load the optional `pg-native` module.
 * Railway sets some Node PG env vars, which fail when the native binding is unavailable.
 */
delete process.env.NODE_PG_FORCE_NATIVE;
delete process.env.PG_FORCE_NATIVE;
delete process.env.PG_NATIVE;
