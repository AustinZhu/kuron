export type Bindings = object;
export type Variables = object;

export interface Env {
  Bindings?: Bindings;
  Variables?: Variables;
}

export interface BlankEnv {
  Bindings: Bindings;
  Variables: Variables;
}

export interface CronContext<E extends Env = BlankEnv, P extends string = string> {
  env: E['Bindings'];
  var: E['Variables'];
  ctx: ExecutionContext;
  controller: ScheduledController & { cron: P };
  get: <K extends keyof E['Variables']>(key: K) => E['Variables'][K];
  set: <K extends keyof E['Variables']>(key: K, value: E['Variables'][K]) => void;
}

export type CronHandler<E extends Env = BlankEnv, P extends string = string> = (
  c: CronContext<E, P>,
) => Promise<void> | void;

export type CronMiddleware<E extends Env = BlankEnv> = (
  c: CronContext<E>,
  next: () => Promise<void>,
) => Promise<void> | void;

export type CronErrorHandler<E extends Env = BlankEnv> = (err: Error, c: CronContext<E>) => Promise<void> | void;

export interface ScheduledJob<E extends Env = BlankEnv, P extends string = string> {
  pattern: P;
  handler: CronHandler<E, P>;
}
