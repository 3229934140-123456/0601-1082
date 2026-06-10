import {
  Unit,
  UndoSnapshot,
  BattlePhase,
  BattleEvent,
} from '../types';
import { UnitManager } from '../unit/unit-manager';
import { TurnManager } from '../turn/turn-manager';

export class UndoManager {
  private undoStack: UndoSnapshot[] = [];
  private maxStackSize: number = 50;
  private allowUndo: boolean;

  constructor(allowUndo: boolean = true) {
    this.allowUndo = allowUndo;
  }

  pushSnapshot(
    unitManager: UnitManager,
    turnManager: TurnManager,
    events: BattleEvent[],
    randomState: number,
  ): void {
    if (!this.allowUndo) return;

    const snapshot: UndoSnapshot = {
      units: unitManager.getAllUnits().map(u => ({
        ...u,
        stats: { ...u.stats },
        skills: [...u.skills],
        statusEffects: u.statusEffects.map(e => ({ ...e, template: { ...e.template } })),
        tags: [...u.tags],
        cooldowns: { ...u.cooldowns },
        position: { ...u.position } as import('../types').Position,
      })),
      turn: turnManager.getCurrentTurn(),
      phase: turnManager.getPhase(),
      events: events.map(e => ({ ...e, data: { ...e.data } })),
      randomState,
    };

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
  }

  canUndo(): boolean {
    return this.allowUndo && this.undoStack.length > 0;
  }

  undo(): UndoSnapshot | null {
    if (!this.canUndo()) return null;
    return this.undoStack.pop() || null;
  }

  peek(): UndoSnapshot | null {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1];
  }

  getStackSize(): number {
    return this.undoStack.length;
  }

  clear(): void {
    this.undoStack = [];
  }

  previewUndo(): UndoSnapshot | null {
    return this.peek();
  }

  getStack(): UndoSnapshot[] {
    return [...this.undoStack];
  }
}
