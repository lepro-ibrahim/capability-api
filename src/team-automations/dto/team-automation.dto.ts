import {
  TeamAutomationStatus,
  TeamAutomationTrigger,
  TeamTaskStatus,
} from "@prisma/client";
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateTeamAutomationRuleDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsEnum(TeamAutomationStatus)
  status?: TeamAutomationStatus;

  @IsEnum(TeamAutomationTrigger)
  trigger!: TeamAutomationTrigger;

  @IsObject()
  triggerConfig!: Record<string, unknown>;

  @IsArray()
  actions!: Array<Record<string, unknown>>;
}

export class UpdateTeamAutomationRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsEnum(TeamAutomationStatus)
  status?: TeamAutomationStatus;

  @IsOptional()
  @IsEnum(TeamAutomationTrigger)
  trigger?: TeamAutomationTrigger;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  actions?: Array<Record<string, unknown>>;
}

export class UpdateTeamTaskDto {
  @IsEnum(TeamTaskStatus)
  status!: TeamTaskStatus;
}
