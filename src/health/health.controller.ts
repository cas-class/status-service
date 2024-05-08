import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { HealthService } from "./health.service";
import { ServiceUnavailableException } from "@nestjs/common/exceptions/service-unavailable.exception";

@Controller('health')
export class HealthController {
    public constructor(private readonly healthService: HealthService) {}

    @Get()
    @HttpCode(HttpStatus.OK)
    async getHealth() {
        if (!await this.healthService.getHealth()) {
            throw new ServiceUnavailableException();
        }
    }
}
