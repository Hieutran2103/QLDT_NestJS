import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

// Hàm chuẩn hóa tên topic (chữ cái đầu mỗi từ viết hoa, phần còn lại viết thường)
function formatTopicName(str: string): string {
  return str
    .trim()
    .split(' ') // Tách tên thành các từ riêng biệt
    .map((word) =>
      word.length > 0
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : '',
    ) // Chuyển chữ cái đầu thành hoa, phần còn lại thành thường
    .join(' '); // Ghép lại thành chuỗi với khoảng trắng giữa các từ
}

// Custom decorator để chuẩn hóa tên topic
export function NormalizeTopicName(validationOptions?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'normalizeTopicName',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value === 'string') {
            // Chuẩn hóa tên topic
            const normalizedValue = formatTopicName(value);

            // Gán giá trị chuẩn hóa vào DTO thông qua `args.object`
            args.object[propertyName] = normalizedValue; // Gán giá trị chuẩn hóa vào đối tượng DTO

            return true; // Đã chuẩn hóa thành công
          }
          return false; // Không phải chuỗi, không valid
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid topic name`;
        },
      },
    });
  };
}
