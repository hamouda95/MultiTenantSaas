import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
@Module({
  imports: [IdentityModule],
  controllers: [HrController],
  providers: [HrService],
})
export class HrModule {}
