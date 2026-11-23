export type RowState = 'done' | 'current' | 'todo' | 'fail';

export type Act = (id: string) => void;
