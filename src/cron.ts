import { createContext } from './context';
import type { BlankEnv, CronContext, CronErrorHandler, CronHandler, CronMiddleware, Env, ScheduledJob } from './types';

export class Cron<E extends Env = BlankEnv, P extends string = never> {
  private jobs: ScheduledJob<E>[] = [];
  private middlewares: CronMiddleware<E>[] = [];
  private errorHandler?: CronErrorHandler<E>;

  /**
   * Register a scheduled job with a cron pattern
   * @param pattern - Cron pattern (e.g., "0 15 * * *")
   * @param handler - Handler function to execute
   */
  schedule<Pattern extends string>(pattern: Pattern, handler: CronHandler<E, Pattern>): Cron<E, P | Pattern> {
    // Type-safe at call site, runtime needs any pattern
    const handlerName = handler.name.length > 0 ? handler.name : undefined;
    this.jobs.push({ pattern, handler: handler as CronHandler<E>, name: handlerName });
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
    const c = createContext<E>(controller, env, ctx);

    try {
      // Find matching job(s) for this cron pattern
      const matchingJobs = this.jobs.filter((job) => job.pattern === controller.cron);

      if (matchingJobs.length === 0) {
        console.warn(`No jobs registered for cron pattern: ${controller.cron}`);
        return;
      }

      // Execute each matching job
      for (const job of matchingJobs) {
        await this.executeJob(c, job);
      }
    } catch (error) {
      if (this.errorHandler) {
        await this.errorHandler(error as Error, c);
      } else {
        console.error('Unhandled error in scheduled job:', error);
        throw error;
      }
    }
  };

  /**
   * Execute a single job with middleware chain
   */
  private async executeJob(c: CronContext<E>, job: ScheduledJob<E>): Promise<void> {
    c.name = job.name;
    const middlewareChain = [...this.middlewares];
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < middlewareChain.length) {
        const middleware = middlewareChain[index++];
        if (middleware) {
          await middleware(c, next);
        }
      } else {
        // All middleware executed, now run the actual job handler
        await job.handler(c);
      }
    };

    await next();
    c.name = undefined;
  }
}
