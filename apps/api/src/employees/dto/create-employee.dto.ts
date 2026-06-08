import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { EmployeeStatus } from '../../common/enums';

export class CreateEmployeeDto {
  @IsString()
  employeeCode: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsDateString()
  hireDate: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsUUID()
  departmentId: string;

  @IsUUID()
  positionId: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
