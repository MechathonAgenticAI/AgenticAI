// Agent action types
export const AgentActionType = {
  CREATE_TASK: 'create_task',
  UPDATE_TASK_STATUS: 'update_task_status',
  DELETE_TASK: 'delete_task',
  DELETE_ALL_TASKS: 'delete_all_tasks',
  CREATE_NOTE: 'create_note',
  DELETE_NOTE: 'delete_note',
  DELETE_ALL_NOTES: 'delete_all_notes'
};

// Agent action interface
export class AgentAction {
  constructor(type, params) {
    this.type = type;
    this.params = params || {};
  }
}

// Agent plan interface
export class AgentPlan {
  constructor(actions = [], confirmations = [], meta = {}) {
    this.actions = actions;
    this.confirmations = confirmations;
    this.meta = meta;
  }
}

// Helper to create actions
export const createTask = (title) => new AgentAction(AgentActionType.CREATE_TASK, { title });
export const createNote = (text) => new AgentAction(AgentActionType.CREATE_NOTE, { text });
export const updateTaskStatus = (id, status) => new AgentAction(AgentActionType.UPDATE_TASK_STATUS, { id, status });
export const deleteTask = (id) => new AgentAction(AgentActionType.DELETE_TASK, { id });
export const deleteAllTasks = () => new AgentAction(AgentActionType.DELETE_ALL_TASKS, {});
export const deleteNote = (id) => new AgentAction(AgentActionType.DELETE_NOTE, { id });
export const deleteAllNotes = () => new AgentAction(AgentActionType.DELETE_ALL_NOTES, {});
