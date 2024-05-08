import { StateResource } from "../storage/storage.interfaces";

export interface ICellStatus {
  id: string;
  state: string | null;
}

export interface IServiceStatus {
  name: string;
  description?: string;
  columns: ICellStatus[]
}

export interface IGroupServiceStatus {
  name: string;
  description?: string;
  items: IServiceStatus[]
}

export interface IAllListServiceStatus {
  columnsName: ("current" | number)[],
  blocks: IGroupServiceStatus[]
}

export interface ICurrentStatus {
  state: string;
}

export interface IServiceHistoryStateItem {
  startTime: number,
  stopTime: number,
  state: string
}
