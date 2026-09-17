import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  CloserLedgerStatus,
  CloserLedgerType,
  CloserReportOutcome,
} from "@prisma/client";

export class CreateCloserReportDto {
  @IsString()
  leadId!: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsEnum(CloserReportOutcome)
  outcome!: CloserReportOutcome;

  @IsBoolean()
  proposalMade!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objections?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  reportedAt?: string;

  @IsOptional()
  @IsString()
  closerId?: string;
}

export class CreateCloserLedgerEntryDto {
  @IsString()
  closerId!: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsString()
  contractId!: string;

  @IsEnum(CloserLedgerType)
  type!: CloserLedgerType;

  @IsEnum(CloserLedgerStatus)
  status!: CloserLedgerStatus;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class UpdateCloserSettingsDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyTarget?: number;
}
