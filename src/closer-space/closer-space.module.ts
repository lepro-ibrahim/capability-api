import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CloserSpaceController } from "./closer-space.controller";
import { CloserSpaceService } from "./closer-space.service";

@Module({
  imports: [PrismaModule],
  controllers: [CloserSpaceController],
  providers: [CloserSpaceService],
})
export class CloserSpaceModule {}
