import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TeamAutomationsController } from "./team-automations.controller";
import { TeamAutomationsService } from "./team-automations.service";

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [TeamAutomationsController],
  providers: [TeamAutomationsService],
  exports: [TeamAutomationsService],
})
export class TeamAutomationsModule {}
