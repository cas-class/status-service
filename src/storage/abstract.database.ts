import {
  StateResource,
  IWatchResource,
  IStateByTime,
  IServiceStateByDay, IHistoryStateItem
} from "./storage.interfaces";

export abstract class DataBase<DataBaseConnectSettingType, DataBaseConnectionType> {
  protected _connectionPromise: Promise<DataBaseConnectionType> | DataBaseConnectionType;

  public constructor(conSettings: DataBaseConnectSettingType) {
    this._connectionPromise = this.connect(conSettings).then((connection) => this._connectionPromise = connection);
  }

  protected async getConnection(): Promise<DataBaseConnectionType> {
    return this._connectionPromise;
  }

  protected abstract connect(conSettings: DataBaseConnectSettingType): Promise<DataBaseConnectionType>;

  public abstract addWatchRecord(record: IWatchResource): Promise<void>

  public abstract changeWatchRecord(record: IWatchResource): Promise<void>;

  public abstract getWatchRecordByUUID(uuid: string): Promise<IWatchResource | null>

  /**
   * Записывает состояние в БД (Не проверяет текущее состояние). Общий список состояний
   * @param uuidWatchRecord
   * @param state
   */
  public abstract setStateService(uuidWatchRecord: string, state: StateResource): Promise<void>

  /**
   * Возвращает последний статус из общего списка состояний
   *
   * @param uuidWatchRecord
   */
  public abstract getLastStateService(uuidWatchRecord: string): Promise<StateResource | undefined>

  /**
   * Возвращает <count> последних статусов из общего списка состояний
   *
   * @param uuidWatchRecord
   * @param count
   */
  public abstract getStateService(uuidWatchRecord: string, count: number): Promise<IStateByTime[] | undefined>

  /**
   * Устанавливает дневной статус сервиса
   * @param uuidWatchRecord
   * @param state
   * @param date
   */
  public abstract setDailyStatus(uuidWatchRecord: string, state: StateResource, date: Date): Promise<void>;

  /**
   * Возвращает дневной статус сервиса
   * @param uuidWatchRecord
   * @param date
   */
  public abstract getDailyStatus(uuidWatchRecord: string, date: Date): Promise<StateResource | undefined>;

  public abstract getHistoryDailyStates(): Promise<IServiceStateByDay[]>

  public abstract getHistoryStateByDay(uuidWatchRecord: string, date: Date): Promise<IHistoryStateItem[]>

  /**
   * Обновляет дневной статус сервиса
   *
   * @param uuidWatchRecord
   * @param state
   * @param date
   */
  public abstract updateDailyStatus(uuidWatchRecord: string, state: StateResource, date: Date): Promise<void>;

  /**
   * Получает список UUID из БД
   */
  public abstract getAllUuidWatchRecords(): Promise<string[]>;

  /**
   * Удаляет все данные по UUID ресурса
   * @param uuid
   */
  public abstract deleteAllDataByUuid(uuid: string): Promise<void>;

  /**
   * Очищает данные по всем сервисам
   * @param retentionDays
   */
  public abstract clearStates(retentionDays: number): Promise<void>;
}
