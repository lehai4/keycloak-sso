package vn.cty.keycloak.nhanvien;

import java.sql.Connection;
import java.sql.Driver;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Properties;
import java.util.regex.Pattern;

/**
 * Đọc bảng nhân viên bằng JDBC. Chỉ dùng câu lệnh SELECT (nên dùng tài khoản MySQL chỉ đọc).
 * Mọi giá trị người dùng nhập đều đi qua PreparedStatement (chống SQL injection).
 */
public class NhanVienRepository {

    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9_]+");
    private static final String COLS = "ma_nv, ten_nv, email, id_bo_phan, isActived";

    private final String url;
    private final String user;
    private final String password;
    private final String table; // vd: `sync_data_hi_time_sheet`.`sync_nhan_vien`

    public NhanVienRepository(String host, int port, String user, String password, String schema, String table) {
        if (!IDENTIFIER.matcher(schema).matches() || !IDENTIFIER.matcher(table).matches()) {
            throw new IllegalArgumentException("Tên schema/bảng không hợp lệ: " + schema + "." + table);
        }
        this.url = "jdbc:mysql://" + host + ":" + port + "/"
                + "?useUnicode=true&characterEncoding=utf8&connectTimeout=5000&socketTimeout=10000";
        this.user = user;
        this.password = password;
        this.table = "`" + schema + "`.`" + table + "`";
    }

    // Gọi thẳng driver MySQL đóng gói kèm plugin. Không dùng DriverManager vì trong Keycloak (Quarkus)
    // DriverManager không thấy driver của plugin ("No suitable driver found").
    private static final Driver DRIVER = createDriver();

    private static Driver createDriver() {
        try {
            return new com.mysql.cj.jdbc.Driver();
        } catch (SQLException e) {
            throw new IllegalStateException("Không khởi tạo được driver MySQL", e);
        }
    }

    private Connection open() throws SQLException {
        Properties props = new Properties();
        props.setProperty("user", user);
        props.setProperty("password", password);
        Connection c = DRIVER.connect(url, props);
        if (c == null) throw new SQLException("Driver MySQL không nhận URL: " + url);
        return c;
    }

    public Optional<NhanVien> findByMaNv(String maNv) {
        return findOne("SELECT " + COLS + " FROM " + table + " WHERE ma_nv = ? LIMIT 1", maNv);
    }

    public Optional<NhanVien> findByEmail(String email) {
        return findOne("SELECT " + COLS + " FROM " + table + " WHERE email = ? LIMIT 1", email);
    }

    /** Lấy mã bcrypt mới nhất (không cache) => đổi mật khẩu bên tienich là có hiệu lực ngay. */
    public Optional<String> findPasswordHash(String maNv) {
        String sql = "SELECT mat_khau FROM " + table + " WHERE ma_nv = ? LIMIT 1";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, maNv);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.ofNullable(rs.getString(1)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new NhanVienStorageException("Lỗi đọc mật khẩu nhân viên", e);
        }
    }

    /** Tìm theo mã NV hoặc tên (dùng cho trang quản trị Keycloak). */
    public List<NhanVien> search(String term, int first, int max) {
        String like = "%" + (term == null ? "" : term.replace("*", "")) + "%";
        String sql = "SELECT " + COLS + " FROM " + table
                + " WHERE ma_nv LIKE ? OR ten_nv LIKE ? ORDER BY ma_nv LIMIT ? OFFSET ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, like);
            ps.setString(2, like);
            ps.setInt(3, max);
            ps.setInt(4, first);
            List<NhanVien> list = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) list.add(map(rs));
            }
            return list;
        } catch (SQLException e) {
            throw new NhanVienStorageException("Lỗi tìm nhân viên", e);
        }
    }

    /** Đếm nhân viên khớp từ khóa (mã NV hoặc tên); từ khóa rỗng hoặc "*" = đếm tất cả. */
    public int count(String term) {
        String like = "%" + (term == null ? "" : term.replace("*", "")) + "%";
        String sql = "SELECT COUNT(*) FROM " + table + " WHERE ma_nv LIKE ? OR ten_nv LIKE ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, like);
            ps.setString(2, like);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        } catch (SQLException e) {
            throw new NhanVienStorageException("Lỗi đếm nhân viên", e);
        }
    }

    private Optional<NhanVien> findOne(String sql, String value) {
        if (value == null || value.isBlank()) return Optional.empty();
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, value.trim());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new NhanVienStorageException("Lỗi đọc nhân viên", e);
        }
    }

    private static NhanVien map(ResultSet rs) throws SQLException {
        boolean active = rs.getBoolean("isActived"); // cột bit(1)
        boolean dangLamViec = rs.wasNull() || active; // NULL = chưa rõ => vẫn cho vào
        return new NhanVien(rs.getString("ma_nv"), rs.getString("ten_nv"),
                rs.getString("email"), rs.getString("id_bo_phan"), dangLamViec);
    }

    public static class NhanVienStorageException extends RuntimeException {
        public NhanVienStorageException(String msg, Throwable cause) { super(msg, cause); }
    }
}
