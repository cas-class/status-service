import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
    protected _services: Map<string, boolean | (() => Promise<boolean>)> = new Map<string, boolean | (() => Promise<boolean>)>();
    protected _latestHealthState: boolean = false;

    public registryService(serviceName: string) {
        if (this._services.has(serviceName)) {
            throw new Error(`Service ${serviceName} already registered`);
        }

        this._services.set(serviceName, false);
    }

    protected checkChangeHealthState(nowState: boolean) {
        if (nowState === this._latestHealthState) {
            return;
        }

        if (!nowState) {
            console.log("App not healthy");
        }
        else {
            console.log("App healthy");
        }

        this._latestHealthState = nowState;
    }

    public async getHealth(): Promise<boolean> {
        let nowState = true;

        for (let [service, health] of this._services) {
            let state = false;
            if (typeof health === "function") {
                state = await health();
            }
            else {
                state = health;
            }

            if (!state) {
                console.log(`Service ${service} not health`);
                nowState = false;
            }
        }

        this.checkChangeHealthState(nowState);
        return nowState;
    }

    public setServiceHealth(serviceName: string, health: boolean | (() => Promise<boolean>)) {
        if (!this._services.has(serviceName)) {
            throw new Error(`Service ${serviceName} not registered`);
        }

        this._services.set(serviceName, health);
    }
}
