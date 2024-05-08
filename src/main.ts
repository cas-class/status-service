import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StatusServiceOperator } from "./Operator/Operator";
import * as dotenv from "dotenv";

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);

  const operator = StatusServiceOperator.getInstance();
  operator.start().catch(console.error);

  await app.listen(process.env.PORT ?? -1);
}
bootstrap();
