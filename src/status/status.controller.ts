import { Controller, Get, Param } from "@nestjs/common";
import { StatusServiceOperator } from "../Operator/Operator";
import { IAllListServiceStatus } from "../Operator/Operator.interfaces";

@Controller('status')
export class StatusController {
  protected _operator: StatusServiceOperator;

  public constructor() {
    this._operator = StatusServiceOperator.getInstance();
  }

  @Get()
  public async all(): Promise<IAllListServiceStatus> {
    return await this._operator.getAllStatus();
  }

  @Get("/currentState")
  public currentState() {
    return this._operator.getCurrentStatus();
  }

  @Get(":id")
  public async getHistoryServiceByDay(@Param("id") id: string) {
    return await this._operator.getHistoryById(id);
  }
}
