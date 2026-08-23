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

  it('enumerates variables set through either api', () => {
    const { c } = setup();

    c.set('count', 1);
    c.var.label = 'two';

    expect(Object.keys(c.var)).toEqual(['count', 'label']);
    expect({ ...c.var }).toEqual({ count: 1, label: 'two' });
    expect(JSON.stringify(c.var)).toBe('{"count":1,"label":"two"}');
  });

  it('supports the in operator and delete', () => {
    const { c } = setup();

    c.set('count', 1);
    expect('count' in c.var).toBe(true);

    delete (c.var as { count?: number }).count;

    expect('count' in c.var).toBe(false);
    expect(c.get('count')).toBeUndefined();
  });

  it('keeps symbol keys distinct from their string form', () => {
    const { c } = setup();
    const key = Symbol('token');
    const store = c.var as Record<string | symbol, unknown>;

    const set = c.set as (k: unknown, v: unknown) => void;
    const get = c.get as (k: unknown) => unknown;

    set(key, 'from-symbol');
    set('token', 'from-string');

    expect(get(key)).toBe('from-symbol');
    expect(store[key]).toBe('from-symbol');
    expect(store.token).toBe('from-string');
    expect(Object.keys(store)).toEqual(['token']);
  });

  it('treats a numeric key the same through get/set and c.var', () => {
    const { c } = setup();
    const store = c.var as Record<string, unknown>;

    (c.set as (k: unknown, v: unknown) => void)(1, 'one');

    expect(store[1]).toBe('one');
    expect((c.get as (k: unknown) => unknown)(1)).toBe('one');
  });

  it('reports nothing for an untouched context', () => {
    const { c } = setup();

    expect(Object.keys(c.var)).toEqual([]);
    expect('count' in c.var).toBe(false);
    expect(Object.getOwnPropertyDescriptor(c.var, 'count')).toBeUndefined();
  });

  it('gives each context its own variable store', () => {
    const a = setup().c;
    const b = setup().c;

    a.set('count', 1);

    expect(b.get('count')).toBeUndefined();
  });
});
