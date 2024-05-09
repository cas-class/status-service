# Status service

The status service adds resources to track the availability of services and resources for grouping them. This application helps to track the status of services in k8s using only the kube API. The application is designed to make it easier to create a status page for your product

# Documentation

### How do I add a tracking service?

1. You need to create a resource - ```StatusServices```

   An example for the k8s API:
   ```YAML
   apiVersion: "appmirage.io/v1"
   kind: StatusServices
   metadata:
    name: my-crd-test
    namespace: default
   spec:
    serviceName: kubernetes
    displayName: "API k8s"
    displayDescription: "Kubernetes API"
    group: "status-service-test"
   ```
   ```serviceName``` - The name of the service (```Cluster IP```) to be monitored. 
   The service must be in the same Namespace as the resource ```StatusServices```

   ```displayName``` - The name of the service that will be displayed in the public part

   ```displayDescription``` - Description of the service that will be displayed in the public part

   ```group``` - A link to a resource of the type ```StatusServicesGroup```. Used for grouping services.
   If no group is specified, then a group named Default is used.

2. Done. Now the application will track the availability of at least one available endpoint of your service.
   As soon as your service does not have an available Endpoint, the application will record this as a Warning. If it is idle for more than 10 minutes, the state will switch to Error.

### How to group services?

1. You need to create a resource - ```StatusServicesGroup```

   Example:
   ```YAML
   apiVersion: "appmirage.io/v1"
   kind: StatusServicesGroup
   metadata:
    name: status-service-group-main
   spec:
    displayName: "Main group"
    displayDescription: "Main group description"
    ```
   ```displayName``` - The name of the group displayed in the public part

   ```displayDescription``` - The description of the group displayed in the public part
2. Done.

### How do I get the status of the services and the history?
So far, only the http API is available. Unfortunately, there is no UI yet

1. The general status can be obtained by the endpoint - ```GET - {domain}/status/currentState```

   The response will contain the worst state of the services (```error, warning, ok```)
2. To get statistics by day, you need to use the endpoint - ```GET - {domain}/status```

   The answer will be grouped services with daily statuses, including the current status.

   Example:
   ```JSON
   {
      "columnsName": [
         "current",
         1715126400000
      ],
      "blocks": [
         {
            "name": "Default",
            "items": [
               {
                  "name": "API k8s",
                  "description": "Kubernetes API",
                  "columns": [
                     {
                        "state": "ok",
                        "id": "current.d024667a-278b-4b94-a0cc-e7ada417ccd2"
                     },
                     {
                        "state": "ok",
                        "id": "1715126400000.d024667a-278b-4b94-a0cc-e7ada417ccd2"
                     }
                  ]
               }
            ]
         }
      ]
   }
   ```
3. You can use an endpoint to get a story for a day - ```GET - {domain}/status/{id}```

   The response will contain an array of data with incidents for the day.

   Example:
   ```JSON
   [
     {
       "startTime": 1709240340,
       "stopTime": 1709240340,
       "state": "warning"
     },
     {
       "startTime": 1709193750,
       "stopTime": 1709194650,
       "state": "error"
     },
     {
       "startTime": 1709240340,
       "stopTime": 1709240340,
       "state": "warning"
     }
   ]
   ```

### Garbage collection

The garbage collector automatically deletes outdated data, by default the number of days of data storage is 5

### How to install?

1. Add repo
   ```bash
    helm repo add status https://cas-class.github.io/status-service
   ```
3. Install using helm
   ```bash
   helm upgrade --install -f values.yaml status status/status-service -n status --create-namespace
   ```
### Roadmap

- [X] Public availability through Github Pages
- [X] Automatic deployment through Github Actions
- [ ] Automatic docker build through Github Actions
- [ ] Public UI
- [ ] Exporting data to Prometheus
- [ ] Dashboard for Grafana
- [ ] Make a storage driver for Postgresql
