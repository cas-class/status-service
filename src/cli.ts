import {program} from "commander";
import * as dotenv from "dotenv";
import { StatusServiceOperator } from "./Operator/Operator";

dotenv.config();

program.command('gc')
  .description('Очищает данные, ресурсов которых в K8S уже нет')
  .option('-rd, --retentionDays <value>', "Количество дней хранения статистики", "5")
  .action( async (options) => {
    const operator = StatusServiceOperator.getInstance(true);

    await operator.start();

    await operator.garbageCollect(+options.retentionDays);

    process.exit(0);
  });

program.parse();
