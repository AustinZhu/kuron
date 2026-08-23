import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cron } from './cron';
import { createExecutionContext, FakeScheduledController } from './test-utils';

interface TestEnv {
  Bindings: { API_KEY: string };
  Variables: { count: number; trace: string[] };
}

const bindings = { API_KEY: 'secret' };

function run(cron: Cron<TestEnv>, pattern = '0 15 * * *') {
  return cron.scheduled(new FakeScheduledController(pattern), bindings, createExecutionContext());
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('dispatch', () => {
  it('runs the job registered for the pattern', async () => {
    const handler = vi.fn();
    const cron = new Cron<TestEnv>().schedule('0 15 * * *', handler);

    await run(cron);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('runs only the jobs whose pattern matches', async () => {
    const matching = vi.fn();
    const other = vi.fn();
    const cron = new Cron<TestEnv>().schedule('0 15 * * *', matching).schedule('0 0 * * *', other);

    await run(cron);

    expect(matching).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('runs every job sharing a pattern', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const cron = new Cron<TestEnv>().schedule('0 15 * * *', first).schedule('0 15 * * *', second);

    await run(cron);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('warns and does nothing when no job matches', async () => {
    const handler = vi.fn();
    const cron = new Cron<TestEnv>().schedule('0 15 * * *', handler);

    await run(cron, '*/5 * * * *');

    expect(handler).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('*/5 * * * *'));
  });

  it('names the job after a named handler function', async () => {
    let seen: string | undefined;
    const cron = new Cron<TestEnv>().schedule('0 15 * * *', async function nightlyCleanup(c) {
      seen = c.name;
    });

    await run(cron);

    expect(seen).toBe('nightlyCleanup');
  });
});

describe('middleware', () => {
  it('wraps the handler in registration order', async () => {
    const trace: string[] = [];
    const cron = new Cron<TestEnv>()
      .use(async (_c, next) => {
        trace.push('first:before');
        await next();
        trace.push('first:after');
      })
      .use(async (_c, next) => {
        trace.push('second:before');
        await next();
        trace.push('second:after');
      })
      .schedule('0 15 * * *', () => {
        trace.push('handler');
      });

    await run(cron);

    expect(trace).toEqual(['first:before', 'second:before', 'handler', 'second:after', 'first:after']);
  });

  it('passes variables from middleware to the handler', async () => {
    let seen: number | undefined;
    const cron = new Cron<TestEnv>()
      .use(async (c, next) => {
        c.set('count', 99);
        await next();
      })
      .schedule('0 15 * * *', (c) => {
        seen = c.get('count');
      });

    await run(cron);

    expect(seen).toBe(99);
  });

  it('lets middleware short-circuit by not calling next()', async () => {
    const handler = vi.fn();
    const cron = new Cron<TestEnv>()
      .use(async () => {})
      .schedule('0 15 * * *', handler);

    await run(cron);

    expect(handler).not.toHaveBeenCalled();
  });

  it('surfaces errors thrown by middleware', async () => {
    const cron = new Cron<TestEnv>()
      .use(async () => {
        throw new Error('middleware exploded');
      })
      .schedule('0 15 * * *', vi.fn());

    await expect(run(cron)).rejects.toThrow('middleware exploded');
  });

  it('throws instead of re-running the handler when next() is called twice', async () => {
    const handler = vi.fn();
    const cron = new Cron<TestEnv>()
      .use(async (_c, next) => {
        await next();
        await next();
      })
      .schedule('0 15 * * *', handler);

    await expect(run(cron)).rejects.toThrow('next() called multiple times');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('throws when next() is called twice with downstream middleware present', async () => {
    const downstream = vi.fn(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    });
    const handler = vi.fn();
    const cron = new Cron<TestEnv>()
      .use(async (_c, next) => {
        await next();
        await next();
      })
      .use(downstream)
      .schedule('0 15 * * *', handler);

    await expect(run(cron)).rejects.toThrow('next() called multiple times');
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('context isolation', () => {
  it('does not leak variables between jobs sharing a pattern', async () => {
    let seen: number | undefined = 0;
    const cron = new Cron<TestEnv>()
      .schedule('0 15 * * *', (c) => {
        c.set('count', 1);
      })
      .schedule('0 15 * * *', (c) => {
        seen = c.get('count');
      });

    await run(cron);

    expect(seen).toBeUndefined();
  });

  it('re-runs middleware with a fresh context for each job', async () => {
    const seen: (number | undefined)[] = [];
    const cron = new Cron<TestEnv>()
      .use(async (c, next) => {
        seen.push(c.get('count'));
        c.set('count', 1);
        await next();
      })
      .schedule('0 15 * * *', vi.fn())
      .schedule('0 15 * * *', vi.fn());

    await run(cron);

    expect(seen).toEqual([undefined, undefined]);
  });

  it('gives each job its own name', async () => {
    const seen: (string | undefined)[] = [];
    const cron = new Cron<TestEnv>()
      .schedule('0 15 * * *', async function first(c) {
        seen.push(c.name);
      })
      .schedule('0 15 * * *', async function second(c) {
        seen.push(c.name);
      });

    await run(cron);

    expect(seen).toEqual(['first', 'second']);
  });
});

describe('error handling', () => {
  it('runs the remaining jobs after one throws', async () => {
    const survivor = vi.fn();
    const cron = new Cron<TestEnv>()
      .schedule('0 15 * * *', () => {
        throw new Error('boom');
      })
      .schedule('0 15 * * *', survivor);

    await expect(run(cron)).rejects.toThrow('boom');
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it('rethrows a single unhandled error as-is', async () => {
    const failure = new Error('boom');
    const cron = new Cron<TestEnv>().schedule('0 15 * * *', () => {
      throw failure;
    });

    await expect(run(cron)).rejects.toBe(failure);
  });

  it('aggregates multiple unhandled errors', async () => {
    const cron = new Cron<TestEnv>()
      .schedule('0 15 * * *', () => {
        throw new Error('a');
      })
      .schedule('0 15 * * *', () => {
        throw new Error('b');
      });

    const error = await run(cron).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((e: Error) => e.message)).toEqual(['a', 'b']);
  });

  it('routes errors to onError with the failing job context', async () => {
    const onError = vi.fn();
    const cron = new Cron<TestEnv>()
      .schedule('0 15 * * *', async function failingJob() {
        throw new Error('boom');
      })
      .onError(onError);

    await run(cron);

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, c] = onError.mock.calls[0];
    expect((error as Error).message).toBe('boom');
    expect(c.name).toBe('failingJob');
    expect(c.cron).toBe('0 15 * * *');
  });

  it('does not rethrow once onError has handled the error', async () => {
    const cron = new Cron<TestEnv>()
      .schedule('0 15 * * *', () => {
        throw new Error('boom');
      })
      .onError(vi.fn());

    await expect(run(cron)).resolves.toBeUndefined();
  });

  it('calls onError once per failing job', async () => {
    const onError = vi.fn();
    const cron = new Cron<TestEnv>()
      .schedule('0 15 * * *', () => {
        throw new Error('a');
      })
      .schedule('0 15 * * *', () => {
        throw new Error('b');
      })
      .onError(onError);

    await run(cron);

    expect(onError.mock.calls.map(([e]) => (e as Error).message)).toEqual(['a', 'b']);
  });
});
