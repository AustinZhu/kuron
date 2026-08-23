import { createContext } from './context';
import type { BlankEnv, CronContext, CronErrorHandler, CronHandler, CronMiddleware, CronPattern, Env, ScheduledJob } from './types';

// Deliberately permissive: Cloudflare accepts Quartz extensions such as "LW", "6L" and "mon-fri",
// so only the field count and character set are checked, never the numeric ranges.
const CRON_FIELD = /^[0-9a-zA-Z*,\-/?#]+$/;

function normalizePattern(pattern: string): string {
  const fields = pattern.trim().split(/\s+/);

  if (fields.length !== 5 || !fields.every((field) => CRON_FIELD.test(field))) {
    throw new Error(`Invalid cron pattern: "${pattern}". Expected five space-separated fields, e.g. "0 15 * * *".`);
  }

  return fields.join(' ');
}

export class Cron<E extends Env = BlankEnv, P extends string = never> {
  private jobs: ScheduledJob<E>[] = [];
  private middlewares: CronMiddleware<E>[] = [];
  private errorHandler?: CronErrorHandler<E>;

  /**
   * Register a scheduled job with a cron pattern
   * @param pattern - Cron pattern (e.g., "0 15 * * *")
   * @param handler - Handler function to execute
   */
  schedule<Pattern extends CronPattern>(pattern: Pattern, handler: CronHandler<E, Pattern>): Cron<E, P | Pattern> {
    // Type-safe at call site, runtime needs any pattern
    const handlerName = handler.name.length > 0 ? handler.name : undefined;
    this.jobs.push({ pattern: normalizePattern(pattern) as Pattern, handler: handler as CronHandler<E>, name: handlerName });
    return this as Cron<E, P | Pattern>;
  }

  /**
   * Register middleware to run before job handlers
   * @param middleware - Middleware function
   */
  use(middleware: CronMiddleware<E>): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Register an error handler
   * @param handler - Error handler function
   */
  onError(handler: CronErrorHandler<E>): this {
    this.errorHandler = handler;
    return this;
  }

  /**
   * Main scheduled handler for Cloudflare Workers
   * This is the function that gets exported and called by the Workers runtime
   */
  scheduled = async (controller: ScheduledController, env: E['Bindings'], ctx: ExecutionContext): Promise<void> => {
    // Match on the normalized pattern so spacing differences against wrangler.toml still line up
    const cron = controller.cron.trim().replace(/\s+/g, ' ');
    const matchingJobs = this.jobs.filter((job) => job.pattern === cron);

    if (matchingJobs.length === 0) {
      const error = new Error(`No jobs registered for cron pattern: ${controller.cron}`);

      if (this.errorHandler) {
        await this.errorHandler(error, createContext<E>(controller, env, ctx));
      } else {
        console.warn(error.message);
      }
      return;
    }

    // Execute each matching job, isolating failures so one job cannot cancel the others
    const unhandled: unknown[] = [];

    for (const job of matchingJobs) {
      // Each job gets its own context so variables cannot leak between jobs
      const c = createContext<E>(controller, env, ctx, job.name);

      try {
        await this.executeJob(c, job);
      } catch (error) {
        if (this.errorHandler) {
          await this.errorHandler(error as Error, c);
        } else {
          console.error('Unhandled error in scheduled job:', error);
          unhandled.push(error);
        }
      }
    }

    if (unhandled.length === 1) {
      throw unhandled[0];
    }
    if (unhandled.length > 1) {
      throw new AggregateError(unhandled, `${unhandled.length} jobs failed for cron pattern: ${controller.cron}`);
    }
  };

  /**
   * Execute a single job with middleware chain
   */
  private async executeJob(c: CronContext<E>, job: ScheduledJob<E>): Promise<void> {
    const middlewareChain = [...this.middlewares];
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i < middlewareChain.length) {
        await middlewareChain[i](c, () => dispatch(i + 1));
      } else {
        // All middleware executed, now run the actual job handler
        await job.handler(c);
      }
    };

    await dispatch(0);
  }
}
