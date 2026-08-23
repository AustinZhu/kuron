/**
 * Mirrors the workerd object layout: scheduledTime/cron are own properties while
 * noRetry lives on the prototype, so tests catch members lost to object spread.
 */
export class FakeScheduledController implements ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetryCalls = 0;

  constructor(cron: string, scheduledTime = 1_700_000_000_000) {
    this.cron = cron;
    this.scheduledTime = scheduledTime;
  }

  noRetry(): void {
    this.noRetryCalls++;
  }
}

export function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
}
