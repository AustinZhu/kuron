# Changelog

## 0.1.0

### Breaking changes

- `.schedule()` now validates its pattern and throws on a malformed one. Patterns are
  checked for five space-separated fields and a valid character set; numeric ranges are
  not checked, so Quartz extensions such as `LW`, `6L`, and `mon-fri` are still accepted.
- `.onError()` now also receives the "no jobs registered for cron pattern" misconfiguration,
  not only job failures. Handlers that assumed every error was a job failure should check
  for this case.
- `@cloudflare/workers-types` is now declared as an optional peer dependency. Projects that
  generate `worker-configuration.d.ts` with `wrangler types` are unaffected; others should
  install it as a dev dependency.

### Fixes

- `noRetry()` is no longer lost when the context is built. It was copied with object spread,
  which only picks up own enumerable properties, so the prototype method was silently dropped
  and `c.noRetry()` threw at runtime despite the type promising it.
- Jobs sharing a cron pattern no longer share a context. Variables set by middleware during
  one job leaked into the next, and `c.name` was mutated in place between them.
- A throwing job no longer cancels the jobs registered after it. Each job is isolated; a
  single unhandled failure is rethrown as-is and several are combined into an `AggregateError`,
  so the Workers runtime still sees the failure and can retry.
- Calling `next()` more than once in a middleware now throws instead of silently re-running
  the job handler with part of the middleware chain skipped.
- `c.var` is now enumerable and supports `in`, `delete`, `Object.keys`, spread, and
  `JSON.stringify`. It previously appeared empty to all of them.
- Cron patterns are matched on normalized whitespace, so spacing differences against
  `wrangler.toml` no longer cause a job to silently never fire.

### Documentation

- Corrected the weekday numbering: Cloudflare uses 1 (Sunday) through 7 (Saturday), not the
  0-6 Unix convention. The `0 0 * * 0` and `30 2 * * 1-5` examples were wrong and are now
  `0 0 * * SUN` and `30 2 * * MON-FRI`.
- Fixed template literals in several examples that rendered with literal backslashes.

### Internal

- Added a test suite covering context construction, middleware dispatch, job isolation, and
  error handling.
- Added CI running biome, typecheck, tests with coverage, and build.
- Test files are no longer emitted into `dist` and shipped to npm.
