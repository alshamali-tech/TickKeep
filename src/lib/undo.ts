/* Global undo/redo — command pattern (blueprint S6).
 * Stack capped at 50. Wired to Ctrl/⌘+Z and Ctrl/⌘+Shift+Z in the shell.
 * Store actions record commands here; this module never imports the store
 * (no cycle). */

export interface UndoCommand {
  label: string;
  undo: () => void;
  redo: () => void;
}

const MAX = 50;
const undoStack: UndoCommand[] = [];
const redoStack: UndoCommand[] = [];

export function pushUndo(cmd: UndoCommand): void {
  undoStack.push(cmd);
  if (undoStack.length > MAX) undoStack.shift();
  redoStack.length = 0; // a new action invalidates the redo future
}

export function undoLast(): UndoCommand | null {
  const cmd = undoStack.pop();
  if (!cmd) return null;
  cmd.undo();
  redoStack.push(cmd);
  return cmd;
}

export function redoLast(): UndoCommand | null {
  const cmd = redoStack.pop();
  if (!cmd) return null;
  cmd.redo();
  undoStack.push(cmd);
  return cmd;
}

export const undoDepth = (): number => undoStack.length;
export const redoDepth = (): number => redoStack.length;
export const clearHistory = (): void => {
  undoStack.length = 0;
  redoStack.length = 0;
};
