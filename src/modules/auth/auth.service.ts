import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  BulkRegisterDto,
  LoginBodyDTO,
  RegisterExcelDto,
  RegisterUserDto,
} from './dtos';

import { PrismaService } from 'src/shared/services/prisma.service';

import * as xlsx from 'xlsx';
import { plainToInstance } from 'class-transformer';
import { HashingService } from 'src/shared/hash/hashing.service';
import { TokenService } from 'src/shared/token/token.service';
import { Prisma } from '@prisma/client';
// import { isEmail } from 'class-validator';
@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
  ) {}

  async generateTokens(payload: {
    id: string;
    email: string;
    name: string;
    roleId: string;
  }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken(payload),
      this.tokenService.signRefreshToken(payload),
    ]);

    return { accessToken, refreshToken };
  }

  parseExcel(filePath: string): RegisterExcelDto[] {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[] = xlsx.utils.sheet_to_json(sheet, { defval: null });

    if (!data.length) {
      throw new BadRequestException('File Excel have not data');
    }

    const users = plainToInstance(BulkRegisterDto, { users: data }).users;

    const seenEmails = new Set();
    users.forEach((user, index) => {
      if (seenEmails.has(user.email)) {
        throw new BadRequestException(
          `Row ${index + 2}: Duplicate email in file - ${user.email}`,
        );
      }
      seenEmails.add(user.email);
    });

    return users;
  }

  async registerUser(createUserDto: RegisterUserDto) {
    try {
      // Check if email already exists
      const existingUser = await this.prismaService.user.findUnique({
        where: { email: createUserDto.email },
      });

      if (existingUser) {
        throw new BadRequestException('Email is already in use');
      }

      // Hash password
      const hashedPassword = await this.hashingService.hash(
        createUserDto.password,
      );

      // Create user
      return await this.prismaService.user.create({
        data: {
          name: createUserDto.name,
          email: createUserDto.email,
          password: hashedPassword,
          roleId: createUserDto.roleId,
        },
      });
    } catch (error) {
      throw new ForbiddenException(error.message);
    }
  }

  async registerManyUser(users: RegisterExcelDto[]) {
    try {
      // Use transaction for bulk user registration
      return await this.prismaService.$transaction(
        async (tx) => {
          // Collect errors
          const errors: string[] = [];

          // Get all roles and existing emails
          const [roles, existingUsers] = await Promise.all([
            tx.role.findMany({ select: { id: true } }),
            tx.user.findMany({
              where: { email: { in: users.map((u) => u.email) } },
              select: { email: true },
            }),
          ]);

          const validRoleIds = new Set(roles.map((r) => r.id));
          const existingEmails = new Set(existingUsers.map((u) => u.email));
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

          // Validate users
          const validUsers = users.filter((user, index) => {
            const row = index + 2;

            if (!emailRegex.test(user.email)) {
              errors.push(`Row ${row}: Invalid email format - ${user.email}`);
              return false;
            }

            if (!validRoleIds.has(user.roleId)) {
              errors.push(`Row ${row}: Invalid roleId - ${user.roleId}`);
              return false;
            }

            if (existingEmails.has(user.email)) {
              errors.push(`Row ${row}: Email already exists - ${user.email}`);
              return false;
            }

            return true;
          });

          // Throw error if any validation failed
          if (errors.length > 0) {
            throw new BadRequestException({
              message: 'Validation failed',
              errors,
            });
          }

          // Hash passwords
          const hashedUsers = await Promise.all(
            validUsers.map(async (user) => ({
              ...user,
              password: await this.hashingService.hash(user.password),
            })),
          );

          // Create many users
          const created = await tx.user.createMany({
            data: hashedUsers,
          });

          return {
            message: `${created.count} users created successfully.`,
            total: created.count,
          };
        },
        {
          // Use readCommitted to ensure transaction is not locked by others
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          // Set timeout for transaction, after which it will be cancelled
          timeout: 15000, // 15 seconds
        },
      );
    } catch (error) {
      // Handle transaction errors
      if (error.code === 'P2034') {
        throw new BadRequestException(
          'Transaction timeout - too many users to register at once.',
        );
      }

      // Return original error if already handled above
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        'Failed to register users: ' + error.message,
      );
    }
  }

  async login(loginUserDto: LoginBodyDTO) {
    const user = await this.prismaService.user.findUnique({
      where: { email: loginUserDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials - user not found');
    }

    return this.generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
    });
  }

  async getAllUsers() {
    return this.prismaService.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });
    // .then((users) =>
    //   users.map((user) => ({
    //     ...user,
    //     role: user.role.name,
    //   })),
    // );
  }
}
