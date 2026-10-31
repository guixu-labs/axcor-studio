export type WorkbenchCommand = () => void;

export class WorkbenchCommandRegistry {
  private readonly commands = new Map<string, WorkbenchCommand>();

  register(id: string, command: WorkbenchCommand): void {
    this.commands.set(id, command);
  }

  execute(id: string): void {
    this.commands.get(id)?.();
  }
}
