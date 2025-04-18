/* eslint-disable @typescript-eslint/no-misused-promises */
// import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// async function main() {
//   console.log('Seeding database...');

//   // Tạo các role mặc định
//   const adminRole = await prisma.role.upsert({
//     where: { name: 'admin' },
//     update: {},
//     create: { name: 'admin' },
//   });

//   const teacherRole = await prisma.role.upsert({
//     where: { name: 'teacher' },
//     update: {},
//     create: { name: 'teacher' },
//   });

//   const studentRole = await prisma.role.upsert({
//     where: { name: 'student' },
//     update: {},
//     create: { name: 'student' },
//   });

//   // Kiểm tra nếu đã có admin thì không tạo nữa
//   const adminExists = await prisma.user.findFirst({
//     where: { email: 'admin@example.com' },
//   });

//   if (!adminExists) {
//     const hashedPassword = await bcrypt.hash('admin123', 10);

//     await prisma.user.create({
//       data: {
//         name: 'Admin',
//         email: 'admin@example.com',
//         password: hashedPassword,
//         roleId: adminRole.id, // Gán role admin
//       },
//     });

//     console.log('Admin user created!');
//   } else {
//     console.log('Admin user already exists.');
//   }

//   console.log('Seeding completed.');
// }

// main()
//   .catch((e) => {
//     console.error('Seeding error:', e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });

async function main() {
  // ID các role đã có sẵn
  const adminRoleId = 'f274ad1c-574d-47cd-b8dc-8920652e3cb9';
  const teacherRoleId = '669bef66-9139-4379-b8d7-2e2aea1dc79c';
  const studentRoleId = 'e146df97-84dd-4192-bed6-9e0d13661048';

  // Thêm Permissions
  const permissionsData = [
    { name: 'create_user' },
    { name: 'create_many_user' },
    { name: 'get_all_user' },
    { name: 'get_all_topic' },
    { name: 'get_topic_by_id' },
    { name: 'get_all_topics_enrolled' },
    { name: 'create_topic' },
    { name: 'edit_topic' },
    { name: 'delete_topic' },
    { name: 'get_report_in_topic' },
    { name: 'create_report_in_topic' },
    { name: 'edit_report_in_topic' },
    { name: 'create_comment' },
    { name: 'get_comment' },
    { name: 'delete_report_in_topic' },
    { name: 'edit_comment' },
    { name: 'delete_comment' },
    { name: 'manage_roles' },
    { name: 'manage_permissions' },
  ];

  await prisma.permission.createMany({
    data: permissionsData,
    skipDuplicates: true,
  });

  // Lấy tất cả permissions từ DB để lấy ID chính xác
  const permissions = await prisma.permission.findMany();

  // Hàm tìm ID của permission theo name
  const getPermissionId = (name: string) =>
    permissions.find((perm) => perm.name === name)?.id || '';

  // Gán permissions cho từng role
  const rolePermissionsData = [
    // Admin permissions
    { roleId: adminRoleId, permissionId: getPermissionId('create_user') },
    { roleId: adminRoleId, permissionId: getPermissionId('create_many_user') },
    { roleId: adminRoleId, permissionId: getPermissionId('get_all_user') },
    { roleId: adminRoleId, permissionId: getPermissionId('get_all_topic') },
    { roleId: adminRoleId, permissionId: getPermissionId('manage_roles') },
    {
      roleId: adminRoleId,
      permissionId: getPermissionId('manage_permissions'),
    },
    {
      roleId: adminRoleId,
      permissionId: getPermissionId('get_all_topics_enrolled'),
    },
    { roleId: adminRoleId, permissionId: getPermissionId('create_topic') },
    { roleId: adminRoleId, permissionId: getPermissionId('get_topic_by_id') },
    { roleId: adminRoleId, permissionId: getPermissionId('edit_topic') },
    { roleId: adminRoleId, permissionId: getPermissionId('delete_topic') },
    {
      roleId: adminRoleId,
      permissionId: getPermissionId('get_report_in_topic'),
    },
    { roleId: adminRoleId, permissionId: getPermissionId('get_comment') },

    // Teacher permissions
    { roleId: teacherRoleId, permissionId: getPermissionId('get_all_topic') },
    {
      roleId: teacherRoleId,
      permissionId: getPermissionId('get_all_topics_enrolled'),
    },
    { roleId: teacherRoleId, permissionId: getPermissionId('create_topic') },
    { roleId: teacherRoleId, permissionId: getPermissionId('get_topic_by_id') },
    { roleId: teacherRoleId, permissionId: getPermissionId('edit_topic') },
    { roleId: teacherRoleId, permissionId: getPermissionId('delete_topic') },
    {
      roleId: teacherRoleId,
      permissionId: getPermissionId('get_report_in_topic'),
    },
    {
      roleId: teacherRoleId,
      permissionId: getPermissionId('create_report_in_topic'),
    },
    {
      roleId: teacherRoleId,
      permissionId: getPermissionId('edit_report_in_topic'),
    },
    {
      roleId: teacherRoleId,
      permissionId: getPermissionId('delete_report_in_topic'),
    },
    {
      roleId: studentRoleId,
      permissionId: getPermissionId('edit_report_in_topic'),
    },
    { roleId: teacherRoleId, permissionId: getPermissionId('create_comment') },

    { roleId: teacherRoleId, permissionId: getPermissionId('edit_comment') },
    { roleId: teacherRoleId, permissionId: getPermissionId('delete_comment') },
    { roleId: teacherRoleId, permissionId: getPermissionId('get_comment') },

    // Student permissions
    { roleId: studentRoleId, permissionId: getPermissionId('get_all_topic') },
    { roleId: studentRoleId, permissionId: getPermissionId('get_topic_by_id') },
    {
      roleId: studentRoleId,
      permissionId: getPermissionId('get_all_topics_enrolled'),
    },
    {
      roleId: studentRoleId,
      permissionId: getPermissionId('get_report_in_topic'),
    },
    {
      roleId: studentRoleId,
      permissionId: getPermissionId('delete_report_in_topic'),
    },
    {
      roleId: studentRoleId,
      permissionId: getPermissionId('create_report_in_topic'),
    },
    { roleId: studentRoleId, permissionId: getPermissionId('create_comment') },
    { roleId: studentRoleId, permissionId: getPermissionId('get_comment') },
    { roleId: studentRoleId, permissionId: getPermissionId('edit_comment') },
    { roleId: studentRoleId, permissionId: getPermissionId('delete_comment') },
  ];

  await prisma.rolePermission.createMany({
    data: rolePermissionsData,
    skipDuplicates: true,
  });

  console.log(
    'Seed data for permissions and role_permissions inserted successfully!',
  );
}

// Chạy seed
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
