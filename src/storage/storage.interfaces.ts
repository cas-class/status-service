export interface IWatchResource {
  serviceName: string;
  namespace: string;
  uuid: string;
  displayDescription: string;
  displayName: string;
  group?: string;
}

export enum StateResource {
  ok = 0,
  error = 1,
  warning = 1000,
}

export interface IStateByTime {
  time: Date;
  state: StateResource;
}

export interface IServiceStateByDay {
  serviceUUID: string;
  times: {
    time: Date;
    state: StateResource;
  }[]
}

export interface IFullInfoServiceStateByDay {
  serviceUUID: string;
  serviceInfo: IWatchResource;
  times: {
    time: Date | "current";
    state: StateResource;
  }[]
}

export interface IHistoryStateItem {
  startTime: Date,
  stopTime: Date,
  state: StateResource
}
