import type { BlankEnv, CronContext, CronPattern, Env } from './types';

export function createContext<E extends Env = BlankEnv>(
  controller: ScheduledController,
  env: E['Bindings'],
  ctx: ExecutionContext,
): CronContext<E> {
  const variables = new Map<string, unknown>();

  return {
    env,
    executionCtx: ctx,
    scheduledTime: controller.scheduledTime,
    cron: controller.cron as CronPattern,
    noRetry: () => controller.noRetry(),
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
