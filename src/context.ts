import type { BlankEnv, CronContext, CronPattern, Env } from './types';

// Property access coerces numeric keys to strings, so get/set must agree with c.var
const toKey = (key: PropertyKey): string | symbol => (typeof key === 'symbol' ? key : String(key));

export function createContext<E extends Env = BlankEnv>(
  controller: ScheduledController,
  env: E['Bindings'],
  ctx: ExecutionContext,
  name?: string,
): CronContext<E> {
  const variables = new Map<string | symbol, unknown>();

  return {
    env,
    executionCtx: ctx,
    scheduledTime: controller.scheduledTime,
    cron: controller.cron as CronPattern,
    noRetry: () => controller.noRetry(),
    name,
    get: (key) => variables.get(toKey(key)) as E['Variables'][typeof key],
    set: (key, value) => {
      variables.set(toKey(key), value);
    },
    var: new Proxy(
      {},
      {
        get: (_target, prop) => variables.get(prop),
        set: (_target, prop, value) => {
          variables.set(prop, value);
          return true;
        },
        has: (_target, prop) => variables.has(prop),
        deleteProperty: (_target, prop) => variables.delete(prop),
        ownKeys: () => [...variables.keys()],
        getOwnPropertyDescriptor: (_target, prop) =>
          variables.has(prop)
            ? { value: variables.get(prop), writable: true, enumerable: true, configurable: true }
            : undefined,
      },
    ) as E['Variables'],
  };
}
