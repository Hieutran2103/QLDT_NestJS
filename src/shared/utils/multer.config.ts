import * as multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';

const uploadPath = path.join(__dirname, '../../../uploads');

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// lưu tệp trữ trên hệ thống tệp
export const multerConfig = {
  storage: multer.diskStorage({
    destination: uploadPath,
    filename: (_, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
};
// xóa tệp sau khi xử lý xong
export const removeFile = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Lỗi khi xóa file: ${error.message}`);
  }
};
