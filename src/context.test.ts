import { describe, expect, it } from 'vitest';
import { createContext } from './context';
import { createExecutionContext, FakeScheduledController } from './test-utils';

interface TestEnv {
  Bindings: { API_KEY: string };
  Variables: { count: number; label: string };
}

function setup(cron = '0 15 * * *', name?: string) {
  const controller = new FakeScheduledController(cron);
  const c = createContext<TestEnv>(controller, { API_KEY: 'secret' }, createExecutionContext(), name);
  return { controller, c };
}

describe('createContext', () => {
  it('exposes the controller fields', () => {
    const { controller, c } = setup();

    expect(c.cron).toBe('0 15 * * *');
    expect(c.scheduledTime).toBe(controller.scheduledTime);
  });

  it('forwards noRetry() to the controller', () => {
    const { controller, c } = setup();

    expect(typeof c.noRetry).toBe('function');
    c.noRetry();

    expect(controller.noRetryCalls).toBe(1);
  });

  it('exposes bindings and the execution context', () => {
    const { c } = setup();

    expect(c.env.API_KEY).toBe('secret');
    expect(typeof c.executionCtx.waitUntil).toBe('function');
  });

  it('defaults name to undefined and keeps the one it is given', () => {
    expect(setup().c.name).toBeUndefined();
    expect(setup('0 15 * * *', 'nightly').c.name).toBe('nightly');
  });

  it('round-trips variables through get/set', () => {
    const { c } = setup();

    expect(c.get('count')).toBeUndefined();
    c.set('count', 42);

    expect(c.get('count')).toBe(42);
  });

  it('reads and writes the same variables through c.var', () => {
    const { c } = setup();

    c.set('label', 'from-set');
    expect(c.var.label).toBe('from-set');

    c.var.count = 7;
    expect(c.get('count')).toBe(7);
  });

  it('gives each context its own variable store', () => {
    const a = setup().c;
    const b = setup().c;

    a.set('count', 1);

    expect(b.get('count')).toBeUndefined();
  });
});
