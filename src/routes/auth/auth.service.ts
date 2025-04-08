import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BulkRegisterDto,
  LoginBodyDTO,
  RegisterExcelDto,
  RegisterUserDto,
} from './dto/create-auth.dto';
import { PrismaService } from 'src/shared/services/prisma.service';

import * as xlsx from 'xlsx';
import { plainToInstance } from 'class-transformer';
import { HashingService } from 'src/shared/hash/hashing.service';
import { TokenService } from 'src/shared/token/token.service';

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
    const sheetName = workbook.SheetNames[0];
    const data: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: null,
    });

    if (!data.length) {
      throw new BadRequestException('File Excel không có dữ liệu');
    }

    const users = plainToInstance(BulkRegisterDto, { users: data }).users;

    const seenEmails = new Set();
    users.forEach((user, index) => {
      if (seenEmails.has(user.email)) {
        throw new BadRequestException(
          `Dòng ${index + 2}: Email ${user.email} bị trùng`,
        );
      }
      seenEmails.add(user.email);
    });

    return users;
  }

  async registerUser(createUserDto: RegisterUserDto) {
    try {
      // Hash password
      const hashedPassword = await this.hashingService.hash(
        createUserDto.password,
      );

      // Tạo user
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
    // Truy vấn tất cả email đã tồn tại trong DB
    const existingEmails = new Set(
      (
        await this.prismaService.user.findMany({
          where: { email: { in: users.map((user) => user.email) } },
          select: { email: true },
        })
      ).map((user) => user.email),
    );

    // Lọc danh sách user chưa tồn tại
    const newUsers = users.filter((user) => !existingEmails.has(user.email));

    if (!newUsers.length) {
      throw new BadRequestException('Tất cả email trong file đã tồn tại');
    }

    // Hash password & lưu vào DB
    const hashedUsers = await Promise.all(
      newUsers.map(async (user) => ({
        ...user,
        password: await this.hashingService.hash(user.password),
      })),
    );

    const createdUsers = await this.prismaService.user.createMany({
      data: hashedUsers,
    });

    return {
      message: `Đã tạo thành công ${createdUsers.count} user`,
      total: createdUsers.count,
    };
  }

  async login(loginUserDto: LoginBodyDTO) {
    const user = await this.prismaService.user.findUnique({
      where: { email: loginUserDto.email },
    });

    console.log(user);

    if (!user) {
      throw new UnauthorizedException('Account does not exist');
    }

    const isPasswordValid = await this.hashingService.compareHash(
      loginUserDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnprocessableEntityException([
        {
          field: 'password',
          error: 'Password is incorrect',
        },
      ]);
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
