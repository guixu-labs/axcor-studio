import { WorkbenchCommandRegistry } from './commands';
import { createServiceIdentifier, ServiceCollection } from './serviceCollection';

export const WorkbenchCommandService = createServiceIdentifier<WorkbenchCommandRegistry>('workbenchCommandService');

export const createWorkbenchServices = (): ServiceCollection => {
  const services = new ServiceCollection();
  services.set(WorkbenchCommandService, new WorkbenchCommandRegistry());
  return services;
};
