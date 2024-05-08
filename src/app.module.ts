import { Module } from "@nestjs/common";
import { StorageService } from "./storage/storage.service";
import { StatusController } from "./status/status.controller";
import { HealthService } from "./health/health.service";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [],
  controllers: [StatusController, HealthController],
  providers: [StorageService, HealthService]
})
export class AppModule {
}
