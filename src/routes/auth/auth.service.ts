import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  // UnprocessableEntityException,
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
    //  xlsx để đọc tệp Excel từ đường dẫn filePath
    const workbook = xlsx.readFile(filePath);
    // Lấy tên sheet đầu tiên trong workbook
    const sheetName = workbook.SheetNames[0];
    //chuyển dữ liệu từ trang tính đã chọn thành một mảng các đối tượng JSON
    const data: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: null,
    });

    if (!data.length) {
      throw new BadRequestException('File Excel have not data');
    }
    // Dữ liệu data chuyển thành các đối tượng BulkRegisterDto thông qua phương thức plainToInstance.
    const users = plainToInstance(BulkRegisterDto, { users: data }).users;

    //Set dùng để theo dõi các email đã gặp trong mảng users
    const seenEmails = new Set();
    users.forEach((user, index) => {
      if (seenEmails.has(user.email)) {
        throw new BadRequestException(
          `Row ${index + 2}: The email address ${user.email} is already in use`,
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
      throw new BadRequestException('All emails in the file already exist.');
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
      message: `${createdUsers.count} users have been created successfully.`,
      total: createdUsers.count,
    };
  }

  async login(loginUserDto: LoginBodyDTO) {
    const user = await this.prismaService.user.findUnique({
      where: { email: loginUserDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Account does not exist');
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
