import { DataBase } from "./abstract.database";
import * as mongoose from "mongoose";
import {
  StateResource,
  IServiceStateByDay,
  IStateByTime,
  IWatchResource, IHistoryStateItem
} from "./storage.interfaces";

export class MongoDB extends DataBase<string, mongoose.Mongoose> {

  protected watchServicesModel = mongoose.model("watchServices", new mongoose.Schema({
    serviceName: String,
    displayName: String,
    group: String,
    displayDescription: String,
    namespace: String,
    uid: String
  }));

  protected statusServicesModel = mongoose.model("statusServices", new mongoose.Schema({
    time: Date,
    state: String,
    uuidWatchRecord: String
  }));

  protected dayStatusServicesModel = mongoose.model("dayStatusServices", new mongoose.Schema({
    time: Date,
    state: String,
    uuidWatchRecord: String
  }));

  protected async connect(conSettings: string): Promise<mongoose.Mongoose> {
    return await mongoose.connect(conSettings);
  }

  async addWatchRecord(record: IWatchResource): Promise<void> {
    /**
     * Ждем коннект
     */
    await this.getConnection();

    const instance = new this.watchServicesModel();

    instance.uid = record.uuid;
    instance.displayDescription = record.displayDescription;
    instance.displayName = record.displayName;
    instance.namespace = record.namespace;
    instance.serviceName = record.serviceName;
    instance.group = record.group;

    await instance.save();
  }

  async changeWatchRecord(record: IWatchResource) {
    await this.getConnection();

    const data = await this.watchServicesModel.find({
      uid: record.uuid
    }).limit(1);

    if (data.length === 0) {
      throw new Error(`${record.uuid} не находится в отслеживании`);
    }

    const instance = data[0];

    instance.displayDescription = record.displayDescription;
    instance.displayName = record.displayName;
    instance.namespace = record.namespace;
    instance.serviceName = record.serviceName;
    instance.group = record.group;

    await instance.save();
  }

  async getWatchRecordByUUID(uuid: string): Promise<IWatchResource | null> {
    /**
     * Ждем коннект
     */
    await this.getConnection();

    const data = await this.watchServicesModel.find({
      uid: uuid
    }).limit(1);

    if (data.length === 0) {
      return null;
    }

    return {
      namespace: data[0].namespace,
      uuid: data[0].uid,
      displayName: data[0].displayName,
      displayDescription: data[0].displayDescription,
      serviceName: data[0].serviceName,
      group: data[0].group
    };
  }

  async getStateService(uuidWatchRecord: string, count: number): Promise<IStateByTime[] | undefined> {
    await this.getConnection();

    const items = await this.statusServicesModel.find({
      uuidWatchRecord
    }).sort({
      time: "desc"
    }).limit(count);

    return items.map(item => {
      return {
        time: item.time,
        state: StateResource[item.state]
      }
    });
  }

  async getLastStateService(uuidWatchRecord: string): Promise<StateResource | undefined> {
    await this.getConnection();

    const items = await this.statusServicesModel.find({
      uuidWatchRecord
    }).sort({
      time: "desc"
    }).limit(1);

    if (items.length === 0) {
      return undefined;
    }

    return StateResource[items[0].state];
  }

  async setStateService(uuidWatchRecord: string, state: StateResource): Promise<void> {
    await this.getConnection();

    const instance = new this.statusServicesModel();

    instance.uuidWatchRecord = uuidWatchRecord;
    instance.time = new Date();

    if (isFinite(state)) {
      instance.state = StateResource[state];
    } else {
      instance.state = state as unknown as string;
    }

    await instance.save();
  }

  async getDailyStatus(uuidWatchRecord: string, date: Date): Promise<StateResource | undefined> {
    await this.getConnection();

    const items = await this.dayStatusServicesModel.find({
      uuidWatchRecord,
      time: date
    }).limit(1);

    if (items.length === 0) {
      return undefined;
    }

    return StateResource[items[0].state];
  }

  async setDailyStatus(uuidWatchRecord: string, state: StateResource, date: Date): Promise<void> {
    await this.getConnection();

    const instance = new this.dayStatusServicesModel();

    instance.uuidWatchRecord = uuidWatchRecord;
    instance.time = date;

    if (isFinite(state)) {
      instance.state = StateResource[state];
    } else {
      instance.state = state as unknown as string;
    }

    await instance.save();
  }

  async updateDailyStatus(uuidWatchRecord: string, state: StateResource, date: Date): Promise<void> {
    await this.getConnection();

    const items = await this.dayStatusServicesModel.find({
      uuidWatchRecord,
      time: date
    }).limit(1);

    if (items.length === 0) {
      return undefined;
    }

    if (isFinite(state)) {
      items[0].state = StateResource[state];
    } else {
      items[0].state = state as unknown as string;
    }

    await items[0].save();
  }

  public async getHistoryStateByDay(uuidWatchRecord: string, date: Date): Promise<IHistoryStateItem[]> {
    await this.getConnection();

    const data = await this.statusServicesModel.find({
      time: {
        $gte: date,
        $lt: new Date(date.getTime() + 86_400_000)
      },
      uuidWatchRecord
    }).sort({
      time: "asc",
    });

    if (data.length === 0) {
      return [];
    }

    const retObject: IHistoryStateItem[] = [];
    let currentItem: IHistoryStateItem | null = null;

    for (const item of data) {
      if (currentItem === null) {
        if (StateResource[item.state] === StateResource.ok) {
          continue;
        }

        currentItem = {
          state: StateResource[item.state],
          startTime: item.time,
          stopTime: new Date(0)
        }
        continue;
      }

      if (StateResource[item.state] !== StateResource.ok) {
        if (currentItem.stopTime.getTime() === 0) {
          currentItem.stopTime = item.time;
        }
        retObject.push(currentItem);

        currentItem = {
          state: StateResource[item.state],
          startTime: item.time,
          stopTime: new Date(0)
        }
      }
      else {
        currentItem.stopTime = item.time;
      }
    }
    if (currentItem !== null) {
      if (currentItem.stopTime.getTime() === 0) {
        currentItem.stopTime = new Date();
      }
      retObject.push(currentItem);
    }

    return retObject;
  }

  public async getHistoryDailyStates(): Promise<IServiceStateByDay[]> {
    await this.getConnection();

    const data = await this.dayStatusServicesModel.find({});

    const retObject: IServiceStateByDay[] = [];

    const grouped: Map<string, {
      time: Date,
      state: StateResource,
    }[]> = new Map();
    for (const item of data) {
      let arr = [];
      if (grouped.has(item.uuidWatchRecord)) {
        arr = grouped.get(item.uuidWatchRecord);
      }

      arr.push({
        time: item.time,
        state: item.state
      })

      grouped.set(item.uuidWatchRecord, arr);
    }

    for (const [serviceUUID, times] of grouped) {
      retObject.push({
        serviceUUID,
        times: times.sort((a, b) => b.time.getTime() - a.time.getTime())
      })
    }

    return retObject;
  }

  async getAllUuidWatchRecords(): Promise<string[]> {
    await this.getConnection();

    return this.watchServicesModel.find({}).then((items) => {
      return items.map((item) => item.uid);
    })
  }

  public async clearStates(retentionDays: number) {
    await this.getConnection();

    const retentionMillis = 86_400_000 * retentionDays;
    const retentionDate = new Date((new Date()).getTime() - retentionMillis);

    await Promise.all([
      this.dayStatusServicesModel.deleteMany({
        time: {
          $lt: retentionDate
        }
      }),
      this.statusServicesModel.deleteMany({
        time: {
          $lt: retentionDate
        }
      })
    ])
  }

  async deleteAllDataByUuid(uuidWatchRecord: string): Promise<void> {
    await this.getConnection();

    await Promise.all([
      this.watchServicesModel.deleteOne({
        uid: uuidWatchRecord
      }),
      this.dayStatusServicesModel.deleteMany({
        uuidWatchRecord: uuidWatchRecord
      }),
      this.statusServicesModel.deleteMany({
        uuidWatchRecord: uuidWatchRecord
      })
    ]);
  }
}
