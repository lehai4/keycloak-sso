package vn.cty.keycloak.nhanvien;

/**
 * Một dòng trong bảng sync_nhan_vien (chỉ các cột SSO cần, KHÔNG gồm mật khẩu).
 * dangLamViec = cột isActived: 0 = đã nghỉ việc => không cho đăng nhập.
 * isActived để trống (NULL) vẫn cho đăng nhập, vì chưa chắc người đó đã nghỉ.
 */
public record NhanVien(String maNv, String tenNv, String email, String idBoPhan, boolean dangLamViec) {

    /** "Nguyễn Văn An" -> tên "An" */
    public String ten() {
        String full = tenNv == null ? "" : tenNv.trim();
        int i = full.lastIndexOf(' ');
        return i < 0 ? full : full.substring(i + 1);
    }

    /** "Nguyễn Văn An" -> họ đệm "Nguyễn Văn" */
    public String hoDem() {
        String full = tenNv == null ? "" : tenNv.trim();
        int i = full.lastIndexOf(' ');
        return i < 0 ? "" : full.substring(0, i);
    }
}
