import { Injectable } from "@nestjs/common";
import { IFullInfoServiceStateByDay, IWatchResource, StateResource } from "./storage.interfaces";
import { DataBase } from "./abstract.database";
import { MongoDB } from "./mongo.database";

@Injectable()
export class StorageService {
  protected _watchingResources: Map<string, IWatchResource> = new Map<string, IWatchResource>();
  protected _currentStateResources: Map<string, StateResource> = new Map<string, StateResource>();

  protected _dataBase: DataBase<any, any> = new MongoDB(process.env.MONGO_DB_DSN);

  private static _instance: StorageService = null;

  public constructor() {
    if (StorageService._instance !== null) {
      throw new Error("StorageService not duplicated!");
    }

    StorageService._instance = this;
  }

  public static getInstance(): StorageService {
    if (StorageService._instance === null) {
      return new StorageService();
    }

    return StorageService._instance;
  }

  public getWatchingService() {
    return Array.from(this._watchingResources);
  }

  public async getAllUuidWatchRecords() {
    return await this._dataBase.getAllUuidWatchRecords();
  }

  public async clearStates(retentionDays: number) {
    await this._dataBase.clearStates(retentionDays);
  }

  protected generateKeyToWatchResource(resource: IWatchResource) {
    return resource.serviceName.concat(".", resource.namespace);
  }

  /**
   * TODO: Переделать хранение ресурсов на UUID
   * @param uuid
   * @protected
   */
  protected getWatchResourceByUUID(uuid: string): IWatchResource | undefined {
    for (const [, value] of this._watchingResources) {
      if (value.uuid === uuid) {
        return value;
      }
    }

    return undefined;
  }

  protected getWatchResource(namespace: string, serviceName: string): IWatchResource | undefined {
    const key = this.generateKeyToWatchResource({
      namespace,
      serviceName,
      uuid: "",
      displayDescription: "",
      displayName: ""
    });

    return this._watchingResources.get(key);
  }

  public isWatchResource(resource: IWatchResource): boolean {
    const key = this.generateKeyToWatchResource(resource);

    return this._watchingResources.has(key);
  }

  public isWatchResourceByNamespaceAndServiceName(namespace: string, serviceName: string): boolean {
    return this.isWatchResource({
      namespace,
      serviceName,
      uuid: "",
      displayDescription: "",
      displayName: ""
    });
  }

  public async addWatchResource(resource: IWatchResource) {
    const key = this.generateKeyToWatchResource(resource);

    this._watchingResources.set(key, resource);

    const resourceInDatabase = await this._dataBase.getWatchRecordByUUID(resource.uuid);
    if (resourceInDatabase === null) {
      await this._dataBase.addWatchRecord(resource);
    }
  }

  public async changeWatchRecord(resource: IWatchResource) {
    const key = this.generateKeyToWatchResource(resource);

    if (!this._watchingResources.has(key)) {
      return;
    }

    this._watchingResources.set(key, resource);

    await this._dataBase.changeWatchRecord(resource);
  }

  protected updateDayStatus(uuidWatchRecord: string, state: StateResource | StateResource) {
    const currentDay = new Date();
    currentDay.setHours(0, 0, 0, 0);

    (async () => {
      try {
        const currentDayStatus = await this._dataBase.getDailyStatus(uuidWatchRecord, currentDay);
        if (currentDayStatus === state) {
          return;
        }

        if (currentDayStatus === StateResource.warning || currentDayStatus === StateResource.error) {
          return;
        }

        let stateToSet = state;

        if (state === StateResource.error) {
          stateToSet = StateResource.warning;
        }

        if (currentDayStatus === undefined) {
          await this._dataBase.setDailyStatus(uuidWatchRecord, stateToSet, currentDay).catch(console.log);
          return;
        }

        await this._dataBase.updateDailyStatus(uuidWatchRecord, stateToSet, currentDay).catch(console.log);
      } catch (e) {
        console.log(e);
      }
    })();
  }

  public async setErrorDailyStatus(namespace: string, serviceName: string) {
    const resource = this.getWatchResource(namespace, serviceName);
    if (resource === undefined) {
      console.error(serviceName.concat(".", namespace, " - Сервис не находится в отслеживании"));
      return;
    }

    const currentDay = new Date();
    currentDay.setHours(0, 0, 0, 0);

    const currentDayStatus = await this._dataBase.getDailyStatus(resource.uuid, currentDay);

    if (currentDayStatus === undefined) {
      await this._dataBase.setDailyStatus(resource.uuid, StateResource.error, currentDay);
      return;
    }

    await this._dataBase.updateDailyStatus(resource.uuid, StateResource.error, currentDay);
  }

  public async getLastStatuses(namespace: string, serviceName: string, countStatuses: number) {
    const resource = this.getWatchResource(namespace, serviceName);
    if (resource === undefined) {
      console.error(serviceName.concat(".", namespace, " - Сервис не находится в отслеживании"));
      return [];
    }

    return await this._dataBase.getStateService(resource.uuid, countStatuses);
  }

  public setStateResource(namespace: string, serviceName: string, state: StateResource) {
    const key = this.generateKeyToWatchResource({
      namespace,
      serviceName,
      uuid: "",
      displayDescription: "",
      displayName: ""
    });

    const resource = this.getWatchResource(namespace, serviceName);
    if (resource === undefined) {
      console.error(serviceName.concat(".", namespace, " - Сервис не находится в отслеживании"));
      return;
    }

    this.updateDayStatus(resource.uuid, state);

    let oldStatus = this._currentStateResources.get(key);

    if (oldStatus !== state) {
      if (oldStatus === undefined) {
        this._dataBase.getLastStateService(resource.uuid).then(async (lastState) => {
          if (state !== lastState) {
            try {
              return await this._dataBase.setStateService(resource.uuid, state);
            } catch (message) {
              return console.log(message);
            }
          }
        }).catch(console.error);
      } else {
        this._dataBase.setStateService(resource.uuid, state).catch(console.log);
      }
    }

    this._currentStateResources.set(key, state);
  }

  public deleteWatchService(namespace: string, serviceName: string) {
    const key = this.generateKeyToWatchResource({
      namespace,
      serviceName,
      uuid: "",
      displayDescription: "",
      displayName: ""
    });

    this._watchingResources.delete(key);
    this._currentStateResources.delete(key);
  }

  public async deleteAllDataByUuid(uuid: string) {
    await this._dataBase.deleteAllDataByUuid(uuid);
  }

  public collectCurrentStatus(): StateResource {
    let maxState: StateResource = StateResource.ok;

    for (const [, state] of this._currentStateResources) {
      if (state === StateResource.error) {
        return StateResource.error;
      }

      if (state === StateResource.warning) {
        maxState = StateResource.warning
      }
    }

    return maxState;
  }

  public async getHistoryByUUIDAndDay(uuid: string, day: Date) {
    return await this._dataBase.getHistoryStateByDay(uuid, day);
  }

  public async collectStats(): Promise<IFullInfoServiceStateByDay[]> {
    const history = await this._dataBase.getHistoryDailyStates();

    return history.map((item): IFullInfoServiceStateByDay => {
      const serviceInfo = this.getWatchResourceByUUID(item.serviceUUID);

      const times: {
        time: Date | "current";
        state: StateResource;
      }[] = [
        {
          time: "current",
          state: this._currentStateResources.get(this.generateKeyToWatchResource(serviceInfo))
        },
        ...item.times
      ];

      return {
        serviceUUID: item.serviceUUID,
        times: times,
        serviceInfo
      }
    })
  }
}
