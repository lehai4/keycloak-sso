SET NAMES utf8mb4;
-- BẢNG NHÂN VIÊN GIẢ để test plugin khi chưa có tài khoản DB thật.
-- Cùng tên schema/bảng/cột với bảng thật. Mật khẩu của mọi người: Test@123
CREATE DATABASE IF NOT EXISTS sync_data_hi_time_sheet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sync_data_hi_time_sheet;

CREATE TABLE sync_nhan_vien (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ma_nv VARCHAR(20) NOT NULL UNIQUE,
  ten_nv VARCHAR(100),
  email VARCHAR(100),
  mat_khau VARCHAR(100),
  id_bo_phan INT,
  isActived BIT(1)
);

INSERT INTO sync_nhan_vien (ma_nv, ten_nv, email, mat_khau, id_bo_phan, isActived) VALUES
  ('TEST001', 'Nguyễn Thị Thử', 'test001@demo.local', '$2b$10$BvrM5cYObhyrGkawPLUVuO42ZDzgDo2qQHtuftnqff.vFU4jqocqe', 10, 1),  -- mã bcrypt $2b$ (như Node bcrypt)
  ('TEST002', 'Trần Văn Nghiệm', NULL,                '$2a$10$BvrM5cYObhyrGkawPLUVuO42ZDzgDo2qQHtuftnqff.vFU4jqocqe', 20, NULL),  -- isActived NULL (vẫn cho vào), mã $2a$, không có email
  ('90001',   'Lê Hoàng Số',     'so90001@demo.local', '$2b$10$BvrM5cYObhyrGkawPLUVuO42ZDzgDo2qQHtuftnqff.vFU4jqocqe', 10, 1),  -- mã NV toàn số
  ('TEST009', 'Phạm Đã Nghỉ',   'test009@demo.local', '$2b$10$BvrM5cYObhyrGkawPLUVuO42ZDzgDo2qQHtuftnqff.vFU4jqocqe', 10, 0); -- đã nghỉ việc => bị chặn

-- Tài khoản chỉ đọc, giống tài khoản nên tạo trên DB thật
CREATE USER 'sso_readonly'@'%' IDENTIFIED BY 'sso_readonly_test';
GRANT SELECT ON sync_data_hi_time_sheet.sync_nhan_vien TO 'sso_readonly'@'%';
FLUSH PRIVILEGES;
