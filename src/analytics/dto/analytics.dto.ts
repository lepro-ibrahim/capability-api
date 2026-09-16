import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  AnalyticsCardType,
  AnalyticsComparison,
  AnalyticsMetricKey,
  AnalyticsValueFormat,
  DashboardVisibility,
  Role,
} from "@prisma/client";

export class CreateDashboardDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsEnum(DashboardVisibility)
  visibility?: DashboardVisibility;

  @IsOptional()
  @IsEnum(Role)
  roleScope?: Role;
}

export class UpdateDashboardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsEnum(DashboardVisibility)
  visibility?: DashboardVisibility;

  @IsOptional()
  @IsEnum(Role)
  roleScope?: Role;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CardLayoutDto {
  @IsInt()
  @Min(0)
  x!: number;

  @IsInt()
  @Min(0)
  y!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  w!: number;

  @IsInt()
  @Min(1)
  @Max(8)
  h!: number;
}

export class AnalyticsCardFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeSources?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  setterIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  closerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class CreateCardDto {
  @IsString()
  @MaxLength(90)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitle?: string;

  @IsEnum(AnalyticsCardType)
  type!: AnalyticsCardType;

  @IsEnum(AnalyticsMetricKey)
  metricKey!: AnalyticsMetricKey;

  @IsEnum(AnalyticsValueFormat)
  valueFormat!: AnalyticsValueFormat;

  @IsOptional()
  @IsEnum(AnalyticsComparison)
  comparison?: AnalyticsComparison;

  @ValidateNested()
  @Type(() => CardLayoutDto)
  layout!: CardLayoutDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnalyticsCardFiltersDto)
  filters?: AnalyticsCardFiltersDto;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(90)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitle?: string;

  @IsOptional()
  @IsEnum(AnalyticsCardType)
  type?: AnalyticsCardType;

  @IsOptional()
  @IsEnum(AnalyticsMetricKey)
  metricKey?: AnalyticsMetricKey;

  @IsOptional()
  @IsEnum(AnalyticsValueFormat)
  valueFormat?: AnalyticsValueFormat;

  @IsOptional()
  @IsEnum(AnalyticsComparison)
  comparison?: AnalyticsComparison;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardLayoutDto)
  layout?: CardLayoutDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnalyticsCardFiltersDto)
  filters?: AnalyticsCardFiltersDto;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class AnalyticsQueryCardDto {
  @IsString()
  id!: string;

  @IsEnum(AnalyticsMetricKey)
  metricKey!: AnalyticsMetricKey;

  @IsOptional()
  @IsEnum(AnalyticsComparison)
  comparison?: AnalyticsComparison;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnalyticsCardFiltersDto)
  filters?: AnalyticsCardFiltersDto;
}

export class AnalyticsQueryFiltersDto extends AnalyticsCardFiltersDto {}

export class AnalyticsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsQueryCardDto)
  cards!: AnalyticsQueryCardDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AnalyticsQueryFiltersDto)
  filters?: AnalyticsQueryFiltersDto;
}
