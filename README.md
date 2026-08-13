

# Kuron

[![GitHub](https://img.shields.io/github/license/AustinZhu/kuron)](https://github.com/AustinZhu/kuron/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/kuron)](https://www.npmjs.com/package/kuron)
[![npm](https://img.shields.io/npm/dm/kuron)](https://www.npmjs.com/package/kuron)
[![Bundle Size](https://img.shields.io/bundlephobia/min/kuron)](https://bundlephobia.com/result?p=kuron)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/kuron)](https://bundlephobia.com/result?p=kuron)

A lightweight framework for Cloudflare Workers scheduled jobs with a Hono-inspired API.

## Features

- 🎯 **Hono-like API** - Familiar and intuitive interface
- 🔗 **Middleware Support** - Chain middleware for logging, auth, etc.
- 🎭 **Error Handling** - Global error handler with context
- 🔐 **Type Safety** - Full TypeScript support with type inference
- 🎨 **Context Variables** - Share data across middleware and handlers
- ⚡ **Zero Dependencies** - Built on standard Cloudflare Workers APIs

## Installation

```bash
npm install kuron
```

## Quick Start

```typescript
import { Cron } from 'kuron';

const cron = new Cron()
  .schedule('0 15 * * *', async (c) => {
    console.log('☕️ Good afternoon! Time for your daily 3 PM cleanup routine ✨');
    // Your job logic here
  });

export default cron;
```

Or using a named function for better logging:

```typescript
import { Cron } from 'kuron';

const cron = new Cron()
  .schedule('0 15 * * *', async function afternoonCleanup(c) {
    console.log('Running job:', c.name); // "afternoonCleanup"
    // Your job logic here
  });

export default cron;
```

## API Reference

### `new Cron<Environment>()`

Creates a new Cron instance.

**Type Parameters:**

- `Environment`: Object with `Bindings` and `Variables` properties (similar to Hono)

### `.schedule(pattern, handler)`

Register a scheduled job with a cron pattern.

**Parameters:**

- `pattern`: Cron pattern string (e.g., `'0 15 * * *'`)
- `handler`: Async function to execute when the cron triggers

**Returns:** `this` (chainable)

```typescript
cron.schedule('*/5 * * * *', async (c) => {
  console.log('Runs every 5 minutes');
});
```

### `.use(middleware)`

Register middleware to run before job handlers.

**Parameters:**

- `middleware`: Function with signature `(c, next) => Promise<void>`

**Returns:** `this` (chainable)

```typescript
// Logging middleware
cron.use(async (c, next) => {
  console.log('Job started:', c.cron, c.name ? `(${c.name})` : '');
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(\`Job completed in \${duration}ms\`);
});

// Auth middleware
cron.use(async (c, next) => {
  if (!c.env.API_KEY) {
    throw new Error('API_KEY not configured');
  }
  await next();
});
```

### `.onError(handler)`

Register a global error handler.

**Parameters:**

- `handler`: Function with signature `(error, context) => Promise<void>`

**Returns:** `this` (chainable)

```typescript
cron.onError((err, c) => {
  console.error('Job failed:', {
    cron: c.cron,
    name: c.name,
    error: err.message,
    stack: err.stack,
  });
  
  // Optional: Send to error tracking service
  // await sendToSentry(err);
});
```

### Context Object (`c`)

The context object passed to handlers and middleware:

```typescript
interface CronContext<E, P extends string = string> extends ScheduledController {
  // Environment bindings (secrets, KV namespaces, etc.)
  env: E['Bindings'];
  
  // Custom variables shared between middleware and handlers
  var: E['Variables'];
  
  // Cloudflare Workers execution context
  executionCtx: ExecutionContext;
  
  // Cron pattern for this job (e.g., "0 15 * * *")
  cron: P;
  
  // Name of the handler function (if provided as a named function)
  name?: string;
  
  // ScheduledController properties (inherited)
  // - scheduledTime: number
  // - noRetry(): void
  
  // Get a variable
  get: <K extends keyof E['Variables']>(key: K) => E['Variables'][K];
  
  // Set a variable
  set: <K extends keyof E['Variables']>(key: K, value: E['Variables'][K]) => void;
}
```

**Properties:**

- `env`: Access environment bindings (secrets, KV, D1, etc.)
- `var`: Access/modify custom variables
- `executionCtx`: Cloudflare Workers ExecutionContext for `waitUntil()` and `passThroughOnException()`
- `cron`: The cron pattern string that triggered this job
- `name`: Optional name of the handler function (captured from `function.name`)
- `scheduledTime`: Unix timestamp (ms) when the job was scheduled (inherited from `ScheduledController`)
- `noRetry()`: Call to prevent automatic retries on failure (inherited from `ScheduledController`)
- `get(key)`: Get a custom variable
- `set(key, value)`: Set a custom variable

## Advanced Examples

### Multiple Jobs

```typescript
// Using anonymous functions
const cron = new Cron<Environment>()
  .schedule('0 0 * * *', async (c) => {
    console.log('Daily midnight job');
  })
  .schedule('0 12 * * *', async (c) => {
    console.log('Daily noon job');
  })
  .schedule('0 0 * * 0', async (c) => {
    console.log('Weekly Sunday job');
  });
```

### Middleware Chain

```typescript
const cron = new Cron<Environment>()
  // Timing middleware
  .use(async (c, next) => {
    const start = Date.now();
    await next();
    console.log(\`Duration: \${Date.now() - start}ms\`);
  })
  // Setup middleware
  .use(async (c, next) => {
    c.set('startTime', new Date().toISOString());
    await next();
  })
  // Cleanup middleware
  .use(async (c, next) => {
    await next();
    console.log('Cleanup completed');
  })
  .schedule('0 * * * *', async (c) => {
    const startTime = c.get('startTime');
    console.log('Job started at:', startTime);
  });
```

### Sharing Data via Variables

```typescript
interface MyEnvironment {
  Bindings: Env;
  Variables: {
    db: Database;
    requestId: string;
  };
}

const cron = new Cron<MyEnvironment>()
  .use(async (c, next) => {
    // Initialize DB connection in middleware
    const db = await initDatabase(c.env.DATABASE_URL);
    c.set('db', db);
    c.set('requestId', crypto.randomUUID());
    
    await next();
  })
  .schedule('0 15 * * *', async (c) => {
    // Access DB from middleware
    const db = c.get('db');
    const requestId = c.get('requestId');
    
    console.log('Request ID:', requestId);
    await db.query('...');
  });
```

### Error Recovery

```typescript
const cron = new Cron<Environment>()
  .use(async (c, next) => {
    try {
      await next();
    } catch (err) {
      console.error('Middleware caught error:', err);
      // Optionally rethrow or handle
      throw err;
    }
  })
  .schedule('0 * * * *', async (c) => {
    // Job logic that might fail
    await riskyOperation();
  })
  .onError(async (err, c) => {
    // Global error handling
    await reportToErrorService({
      error: err,
      cron: c.cron,
      name: c.name,
      timestamp: new Date().toISOString(),
    });
  });
```

### Integration with Hono

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { Cron } from 'kuron';

const app = new OpenAPIHono<Environment>()
  .get('/health', (c) => c.text('OK'));

const cron = new Cron<Environment>()
  .schedule('0 15 * * *', async (c) => {
    await syncData(c.env);
  });

export default {
  fetch: app.fetch,
  scheduled: cron.scheduled,
};
```

## Cron Pattern Syntax

Cloudflare Workers supports standard cron syntax:

```plain
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of the month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of the week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

**Examples:**

- `0 15 * * *` - Daily at 3:00 PM UTC
- `*/5 * * * *` - Every 5 minutes
- `0 0 * * 0` - Every Sunday at midnight
- `0 0 1 * *` - First day of every month at midnight
- `30 2 * * 1-5` - 2:30 AM UTC, Monday through Friday

## TypeScript Tips

### Type Inference

The Cron framework automatically infers types from your Environment:

```typescript
interface MyEnvironment {
  Bindings: {
    DATABASE_URL: string;
  };
  Variables: {
    userId: string;
  };
}

const cron = new Cron<MyEnvironment>();

cron.schedule('0 * * * *', async (c) => {
  // TypeScript knows these types!
  c.env.DATABASE_URL; // string
  c.var.userId;       // string
  c.get('userId');    // string
  c.cron;             // "0 * * * *" (exact literal type!)
  c.name;             // string | undefined
  c.scheduledTime;    // number
});
```

### Pattern Type Tracking

Similar to how Hono tracks route paths, the Cron framework tracks cron patterns in the type system:

```typescript
// Single pattern
const dailyCron = new Cron<MyEnvironment>()
  .schedule('0 15 * * *', async (c) => {
    // c.cron has type: "0 15 * * *"
    console.log(c.cron);
  });

// Type: Cron<MyEnvironment, "0 15 * * *">

// Multiple patterns
const multiCron = new Cron<MyEnvironment>()
  .schedule('0 * * * *', async (c) => {
    // c.cron has type: "0 * * * *"
  })
  .schedule('0 0 * * *', async (c) => {
    // c.cron has type: "0 0 * * *"
  });

// Type: Cron<MyEnvironment, "0 * * * *" | "0 0 * * *">

// Extract pattern types
type ExtractPatterns<T> = T extends Cron<any, infer P> ? P : never;
type Patterns = ExtractPatterns<typeof multiCron>;
// Result: "0 * * * *" | "0 0 * * *"
```

**Benefits:**

- 🎯 **Type Safety**: Catch typos in pattern comparisons at compile time
- 💡 **IntelliSense**: Better autocomplete and hover information
- 📚 **Self-Documenting**: See all patterns in type hints
- 🔄 **Safe Refactoring**: Rename patterns with confidence

## Best Practices

1. **Use Named Functions**: Define handlers as named functions instead of anonymous arrow functions for better logging and debugging via `c.name`
2. **Use Middleware for Common Logic**: Extract shared setup, logging, and cleanup into middleware
3. **Handle Errors Gracefully**: Always implement `.onError()` for production workloads
4. **Keep Jobs Idempotent**: Jobs should be safe to retry in case of failures
5. **Use ExecutionContext**: Call `c.executionCtx.waitUntil()` for background tasks
6. **Log Extensively**: Use middleware for consistent logging across all jobs, including `c.name` and `c.cron`
7. **Test Locally**: Use Wrangler to test scheduled triggers locally

## Comparison with Hono

| Feature | Hono | Cron Framework |
|---------|------|----------------|
| Entry point | `app.fetch` | `cron.scheduled` |
| Routing | URL patterns | Cron patterns |
| Context | Request-based | Schedule-based |
| Middleware | ✅ | ✅ |
| Variables | ✅ | ✅ |
| Error handling | ✅ | ✅ |
| Type safety | ✅ | ✅ |

## License

MIT
