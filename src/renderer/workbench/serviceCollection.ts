export type ServiceIdentifier<T> = symbol & { readonly __service?: T };

export const createServiceIdentifier = <T>(name: string): ServiceIdentifier<T> =>
  Symbol(name) as ServiceIdentifier<T>;

export class ServiceCollection {
  private readonly services = new Map<symbol, unknown>();

  set<T>(identifier: ServiceIdentifier<T>, service: T): void {
    this.services.set(identifier, service);
  }

  get<T>(identifier: ServiceIdentifier<T>): T {
    const service = this.services.get(identifier);
    if (!service) throw new Error('Service is not registered: ' + String(identifier.description));
    return service as T;
  }
}
