import type { BlankEnv, CronContext, Env } from './types';

export function createContext<E extends Env = BlankEnv>(
  controller: ScheduledController,
  env: E['Bindings'],
  ctx: ExecutionContext,
): CronContext<E> {
  const variables = new Map<string, unknown>();

  return {
    env,
    executionCtx: ctx,
    ...controller,
    name: undefined,
    get: (key) => variables.get(key as string) as E['Variables'][typeof key],
    set: (key, value) => variables.set(key as string, value),
    var: new Proxy(
      {},
      {
        get: (_target, prop: string) => variables.get(prop),
        set: (_target, prop: string, value) => {
          variables.set(prop, value);
          return true;
        },
      },
    ) as E['Variables'],
  };
}
