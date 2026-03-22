import { Global, Module } from "@nestjs/common";
import { DdbService } from "./ddb.service";
import { S3Service } from "./s3.service";

@Global()
@Module({
  providers: [DdbService, S3Service],
  exports: [DdbService, S3Service],
})
export class SharedModule {}
