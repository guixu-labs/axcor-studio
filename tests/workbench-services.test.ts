import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceIdentifier, ServiceCollection } from '../src/renderer/workbench/serviceCollection';

test('service collection resolves registered services by identifier', () => {
  const services = new ServiceCollection();
  const identifier = createServiceIdentifier<{ name: string }>('example');
  const service = { name: 'workbench' };
  services.set(identifier, service);
  assert.equal(services.get(identifier), service);
});

test('service collection reports missing services', () => {
  const services = new ServiceCollection();
  const identifier = createServiceIdentifier('missing');
  assert.throws(() => services.get(identifier), /Service is not registered/);
});
