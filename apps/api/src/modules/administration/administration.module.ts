import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AdministrationController } from "./administration.controller";
@Module({ imports: [IdentityModule], controllers: [AdministrationController] })
export class AdministrationModule {}
