import { KubernetesObject, V1EndpointSubset, V1ObjectMeta } from "@kubernetes/client-node";

export interface StatusResource extends KubernetesObject {
  spec: StatusResourceSpec;
  status: StatusResourceStatus;
}

export interface StatusResourceSpec {
  serviceName: string;
  displayName: string;
  displayDescription?: string;
  group?: string;
}

export interface StatusResourceStatus {
  observedGeneration?: number;
  appliedServiceName?: string;
}

export interface IEndpointObjectApi extends KubernetesObject {
  object: {
    subsets: V1EndpointSubset[] | undefined
  };
  meta: V1ObjectMeta
}

export interface StatusGroupResource extends KubernetesObject {
  spec: StatusResourceGroupSpec;
  status: StatusResourceGroupStatus;
}

export interface StatusResourceGroupSpec {
  displayName: string;
  displayDescription?: string;
}

export interface StatusResourceGroupStatus {
  observedGeneration?: number;
}
