import {
  TeamAutomationStatus,
  TeamAutomationTrigger,
  TeamTaskPriority,
  TeamTaskStatus,
} from "@prisma/client";
import {
  IsArray,
  IsDateString,
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

export class CreateManualTeamTaskDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @MaxLength(64)
  assigneeId!: string;

  @IsOptional()
  @IsEnum(TeamTaskPriority)
  priority?: TeamTaskPriority;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notificationMessage?: string;
}
