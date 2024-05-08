import Operator, { ResourceEventType, ResourceMeta } from "@dot-i/k8s-operator";
import * as Path from "path";
import { IEndpointObjectApi, StatusGroupResource, StatusResource } from "./CRD.interfaces";
import { CustomObjectsApi } from "@kubernetes/client-node/dist/gen/api/customObjectsApi";
import { CoreV1Api, V1CustomResourceDefinitionVersion } from "@kubernetes/client-node";
import { StorageService } from "../storage/storage.service";
import { StateResource, IStateByTime, IWatchResource } from "../storage/storage.interfaces";
import { CronJob } from "cron";
import { MemoryStorageService } from "../storage/memory.storage.service";
import {
  IAllListServiceStatus,
  ICellStatus,
  ICurrentStatus,
  IGroupServiceStatus, IServiceHistoryStateItem,
  IServiceStatus
} from "./Operator.interfaces";

export class StatusServiceOperator extends Operator {
  protected _CRDInfo: {
    group: string,
    versions: V1CustomResourceDefinitionVersion[],
    plural: string
  } = null;

  protected _CRDInfoGroup: {
    group: string,
    versions: V1CustomResourceDefinitionVersion[],
    plural: string
  } = null;

  protected _storageService: StorageService;
  protected _analyzeHandlerJob: CronJob;
  protected _groupStorage: MemoryStorageService<StatusGroupResource>;

  protected static _instance: StatusServiceOperator = null;

  private constructor(protected readonly isGCInstance: boolean = false) {
    super();

    this._storageService = StorageService.getInstance();

    this.initGroupStorage();
  }

  /**
   *
   * @param isGCInstance - Only created instance
   */
  public static getInstance(isGCInstance: boolean = false): StatusServiceOperator {
    if (StatusServiceOperator._instance === null) {
      StatusServiceOperator._instance = new StatusServiceOperator(isGCInstance);
    }

    return StatusServiceOperator._instance;
  }

  public async getHistoryById(id: string): Promise<IServiceHistoryStateItem[]> {
    const [day, uuid] = id.split('.');

    if (day === "current") {
      return [];
    }

    return (await this._storageService.getHistoryByUUIDAndDay(uuid, new Date(+day)))
      .map((item) => {
        return {
          startTime: item.startTime.getTime(),
          stopTime: item.stopTime.getTime(),
          state: StateResource[item.state].toString()
        }
      });
  }

  public getCurrentStatus(): ICurrentStatus {
    const status = this._storageService.collectCurrentStatus();
    return {
      state: Number.isFinite(status) ? StateResource[status] : status.toString()
    };
  }

  public async getAllStatus(): Promise<IAllListServiceStatus> {
    const stats = await this._storageService.collectStats();

    const mapStateByServiceAndTime: Map<string, StateResource> = new Map();
    const mapServiceByGroup: Map<string, string[]> = new Map();
    const mapServiceByUUID: Map<string, IWatchResource> = new Map();

    /**
     * Определим столбцы
     * */
    const setColumns = new Set<number | "current">();
    for (const item of stats) {
      const services = mapServiceByGroup.get(item.serviceInfo.group ?? "-") ?? [];

      services.push(item.serviceUUID);

      mapServiceByGroup.set(item.serviceInfo.group ?? "-", services);

      mapServiceByUUID.set(item.serviceUUID, item.serviceInfo);

      for (const day of item.times) {
        const column = day.time instanceof Date ? day.time.getTime() : day.time;

        mapStateByServiceAndTime.set(column.toString().concat(item.serviceUUID), day.state);

        if (!setColumns.has(column)) {
          setColumns.add(column)
        }
      }
    }
    const columns = [...setColumns.values()].sort((a, b) => {
      if (a === "current") {
        return 1;
      }
      if (b === "current"){
        return 0;
      }

      return b - a
    });

    const blocks: IGroupServiceStatus[] = [];
    for (const [keyGroup, serviceKeys] of mapServiceByGroup) {
      const groupInfo = this._groupStorage.get(keyGroup);

      const services: IServiceStatus[] = [];
      for (const serviceUUID of serviceKeys) {
        const serviceInfo = mapServiceByUUID.get(serviceUUID);

        const cells: ICellStatus[] = columns.map((item) => {
          let state: any = mapStateByServiceAndTime.get(item.toString().concat(serviceUUID));
          if (Number.isFinite(state)) {
            state = StateResource[state];
          }

          return {
            state: state ?? null,
            id: item.toString().concat(".", serviceUUID)
          }
        })

        services.push({
          name: serviceInfo.displayName,
          description: serviceInfo.displayDescription,
          columns: cells
        });
      }

      blocks.push({
        name: groupInfo?.spec.displayName ?? "Default",
        description: groupInfo?.spec.displayDescription,
        items: services
      })
    }

    return  {
      columnsName: columns,
      blocks
    }
  }

  protected initGroupStorage(): void {
    this._groupStorage = new MemoryStorageService<StatusGroupResource>();

    this._groupStorage.on("add", (item: StatusGroupResource) => {
      console.log(`Add group "${item.spec.displayName}"`);
    })

    this._groupStorage.on("update", (item: StatusGroupResource) => {
      console.log(`Update group "${item.spec.displayName}"`);
    })

    this._groupStorage.on("remove", (item: StatusGroupResource) => {
      console.log(`Remove group "${item.spec.displayName}"`);
    })
  }

  protected async init() {

    await this.syncCRD();

    if (this.isGCInstance) {
      return;
    }

    await this.watchCRD();

    await this.watchServiceEndpoints();

    this._analyzeHandlerJob = new CronJob(
      '*/1 * * * *',
      this.analyzeHandler.bind(this),
      null,
      true
    )
  }

  protected async syncCRD() {
    let crdFile = Path.resolve(__dirname, "..", "..", "k8sCRD", "CRD.yaml");
    this._CRDInfo = await this.registerCustomResourceDefinition(crdFile);

    crdFile = Path.resolve(__dirname, "..", "..", "k8sCRD", "group-CRD.yaml");
    this._CRDInfoGroup = await this.registerCustomResourceDefinition(crdFile);
  }

  private async watchServiceEndpoints() {
    return this.watchResource("", "v1", "endpoints", async (e) => {
      if (!this._storageService.isWatchResourceByNamespaceAndServiceName(e.meta.namespace, e.meta.name)) {
        return;
      }

      this.checkAndUpdateState(e as unknown as IEndpointObjectApi);
    });
  }

  private async forceCheckEndpoint(namespace: string, serviceName: string) {
    const client = this.kubeConfig.makeApiClient(CoreV1Api);

    const endpointRequest = await client.readNamespacedEndpoints(serviceName, namespace);

    if (endpointRequest.body) {
      return this.checkAndUpdateState(
        {
          object: {
            subsets: endpointRequest.body.subsets
          },
          meta: endpointRequest.body.metadata
        }
      )
    }
    else {
      console.error(`Error requesting to endpoints ${serviceName}.${namespace}`);
    }
  }

  private analyzeHandler() {
    /**
     * Выберем из хранилища по две последних записи статусов, проверим были ли простои больше 10 минут,
     * если были, то переведем дневной статус сервиса в Error
     */

    const tasks: Promise<[IWatchResource ,IStateByTime[]]>[] = [];
    for (const item of this._storageService.getWatchingService()) {
      tasks.push(
        this._storageService.getLastStatuses(item[1].namespace, item[1].serviceName, 2)
          .then((data) => [item[1], data])
      );
    }

    Promise.all(tasks).then(data => {
      for (const [item, state] of data) {
        let setDailyError = false;

        if (state.length === 0) {
          continue;
        }

        /**
         * Если есть два статуса и один из них в статусе Error, то проверим время между ними
         * */
        if (state.length === 2) {
          if (state[0].state === StateResource.warning || state[1].state === StateResource.warning) {
            if ((state[0].time.getTime() - state[1].time.getTime()) / 1000 / 60 >= 10) {
              setDailyError = true;
            }
          }
        }

        if (state[0].state === StateResource.warning && !setDailyError) {
          /**
           * Если есть только одна запись (или предыдущие условия не прошло), то проверим время до текущего времени
           */
          if (((new Date()).getTime() - state[0].time.getTime()) / 1000 / 60 >= 10) {
            setDailyError = true;
          }
        }

        if (setDailyError) {
          this._storageService.setStateResource(item.namespace, item.serviceName, StateResource.error);

          this._storageService.setErrorDailyStatus(item.namespace, item.serviceName)
            .catch(console.error);
        }
      }
    })
  }

  private checkAndUpdateState(_object: IEndpointObjectApi) {
    const object = _object.object;

    let state = StateResource.ok;
    if (!(Array.isArray(object.subsets) && object.subsets[0].addresses && object.subsets[0].addresses.length > 0)) {
      state = StateResource.warning;
    }

    this._storageService.setStateResource(_object.meta.namespace, _object.meta.name, state);
  }

  protected async watchCRD() {
    await this.watchResource(this._CRDInfo.group, this._CRDInfo.versions[0].name, this._CRDInfo.plural, async (e) => {
      /**
       * Если приходят ресурсы при загрузке приложения, то статус всегда Added (Даже если они не новые)
       */
      if (e.type === ResourceEventType.Added && (e.object as StatusResource).status && (e.object as StatusResource).status.observedGeneration === (e.object as StatusResource).metadata.generation) {
        e.type = ResourceEventType.Modified;
      }

      switch (e.type) {
        case ResourceEventType.Added:
          await this.handlerAddResource(e.object as StatusResource, e.meta);
          break;
        case ResourceEventType.Modified:
          await this.handlerModifiedResource(e.object as StatusResource, e.meta);
          break;
        case ResourceEventType.Deleted:
          await this.handlerDeleteResource(e.object as StatusResource, e.meta);
          break;
      }
    });

    await this.watchResource(this._CRDInfoGroup.group, this._CRDInfoGroup.versions[0].name, this._CRDInfoGroup.plural, async (e) => {
      /**
       * Если приходят ресурсы при загрузке приложения, то статус всегда Added (Даже если они не новые)
       */
      if (e.type === ResourceEventType.Added && (e.object as StatusGroupResource).status && (e.object as StatusGroupResource).status.observedGeneration === (e.object as StatusGroupResource).metadata.generation) {
        e.type = ResourceEventType.Modified;
      }

      switch (e.type) {
        case ResourceEventType.Added:
        case ResourceEventType.Modified:
          this._groupStorage.addOrUpdate((e.object as StatusGroupResource).metadata.name, e.object as StatusGroupResource);
          break;
        case ResourceEventType.Deleted:
          this._groupStorage.remove((e.object as StatusGroupResource).metadata.name);
          break;
      }
    });
  }

  private async handlerModifiedResource(resource: StatusResource, meta: ResourceMeta) {
    if (!this._storageService.isWatchResourceByNamespaceAndServiceName(resource.metadata.namespace, resource.spec.serviceName)) {
      await this._storageService.addWatchResource({
        namespace: resource.metadata.namespace,
        serviceName: resource.spec.serviceName,
        uuid: resource.metadata.uid,
        displayDescription: resource.spec.displayDescription,
        displayName: resource.spec.displayName,
        group: resource.spec.group
      });

      console.log(`Added service ${resource.spec.serviceName}.${resource.metadata.namespace} to watch`);
    }

    if (resource.status && resource.status.observedGeneration === resource.metadata.generation) {
      /**
       * Цикличное изменение ресурса
       */
      return;
    }

    /**
     * Проверим изменен ли Endpoint
     */
    if (resource.status && resource.status.appliedServiceName !== resource.spec.serviceName) {
      console.log(`Changed service ${resource.status.appliedServiceName}.${resource.metadata.namespace} -> ${resource.spec.serviceName}.${resource.metadata.namespace}`);

      this._storageService.deleteWatchService(resource.metadata.namespace, resource.status.appliedServiceName);

      await this.setResourceStatus(meta, {
        observedGeneration: resource.metadata.generation,
        appliedServiceName: resource.spec.serviceName
      });
    }

    await this._storageService.changeWatchRecord({
      namespace: resource.metadata.namespace,
      serviceName: resource.spec.serviceName,
      uuid: resource.metadata.uid,
      displayDescription: resource.spec.displayDescription,
      displayName: resource.spec.displayName,
      group: resource.spec.group
    });

    await this.forceCheckEndpoint(resource.metadata.namespace, resource.spec.serviceName);

    console.log(`Changed service ${resource.spec.serviceName}.${resource.metadata.namespace} to watch`);
  }

  protected async handlerDeleteResource(resource: StatusResource, meta: ResourceMeta) {
    this._storageService.deleteWatchService(resource.metadata.namespace, resource.spec.serviceName);

    await this._storageService.deleteAllDataByUuid(resource.metadata.uid);

    console.log(`Delete service ${resource.spec.serviceName}.${resource.metadata.namespace} to watch`);
  }

  protected async handlerAddResource(resource: StatusResource, meta: ResourceMeta) {
    await this.setResourceStatus(meta, {
      observedGeneration: resource.metadata.generation,
      appliedServiceName: resource.spec.serviceName
    });

    await this._storageService.addWatchResource({
      namespace: resource.metadata.namespace,
      serviceName: resource.spec.serviceName,
      uuid: resource.metadata.uid,
      displayDescription: resource.spec.displayDescription,
      displayName: resource.spec.displayName,
      group: resource.spec.group
    });

    await this.forceCheckEndpoint(resource.metadata.namespace, resource.spec.serviceName);

    console.log(`Added service ${resource.spec.serviceName}.${resource.metadata.namespace} to watch`);
  }

  public async garbageCollect(retentionDays: number) {
    if (!this.isGCInstance) {
      throw new Error("This instance is not GC! Please create a new instance - new ...(true)")
    }

    const allUuid = await this._storageService.getAllUuidWatchRecords();

    /**
     * Получим ресурсы из k8s
     */
    const createdResource: Map<string, StatusResource> = new Map<string, StatusResource>();

    const client = this.kubeConfig.makeApiClient(CustomObjectsApi);
    let _continue: string | undefined = undefined;
    while (true) {
      const data = await client.listNamespacedCustomObject(this._CRDInfo.group,
        this._CRDInfo.versions[0].name,
        "",
        this._CRDInfo.plural,
        undefined,
        undefined,
        _continue,
        undefined,
        undefined,
        100);

      if ((data.body as { items: [] | undefined }).items === undefined) {
        throw new Error("Kubernetes API returned error");
      }

      const items = (data.body as { items: StatusResource[] }).items;

      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        createdResource.set(item.metadata.uid, item);
      }

      _continue = (data.body as { metadata: { continue: string | undefined } | undefined }).metadata?.continue;
      const remainingItemCount = (data.body as {
        metadata: { remainingItemCount: number | undefined }
      }).metadata.remainingItemCount;
      if (_continue === undefined || _continue.length === 0 || remainingItemCount === undefined || remainingItemCount === 0) {
        break;
      }
    }

    const tasks: Promise<void>[] = [];
    for (const uuid of allUuid) {
      if (createdResource.has(uuid)) {
        continue;
      }

      /**
       * Ресурса в k8s уже нет, удалим из базы остатки
       * */

      tasks.push(
        this._storageService.deleteAllDataByUuid(uuid).then(() => {
          console.log(`GC: Delete service ${uuid} to watch`);
        })
      );
    }

    await Promise.all(tasks);

    /**
     * Очистим устаревшие состояния
     */

    return await this._storageService.clearStates(retentionDays);
  }
}
