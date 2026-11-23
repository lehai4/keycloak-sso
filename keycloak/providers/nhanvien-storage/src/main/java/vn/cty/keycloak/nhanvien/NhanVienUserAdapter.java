package vn.cty.keycloak.nhanvien;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.keycloak.component.ComponentModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.storage.ReadOnlyException;
import org.keycloak.storage.StorageId;
import org.keycloak.storage.adapter.AbstractUserAdapterFederatedStorage;

/**
 * Nhân viên lấy từ bảng sync_nhan_vien, hiển thị dưới dạng user của Keycloak.
 * Họ tên, email, mã NV, bộ phận: CHỈ ĐỌC (sửa ở hệ thống gốc).
 * Role theo từng app thì Keycloak tự lưu riêng (federated storage) => admin vẫn gán role được.
 */
public class NhanVienUserAdapter extends AbstractUserAdapterFederatedStorage {

    public static final String ATTR_MANV = "manv";
    public static final String ATTR_BO_PHAN = "id_bo_phan";

    private final NhanVien nv;
    private final String keycloakId;

    public NhanVienUserAdapter(KeycloakSession session, RealmModel realm, ComponentModel model, NhanVien nv) {
        super(session, realm, model);
        this.nv = nv;
        this.keycloakId = StorageId.keycloakId(model, nv.maNv());
    }

    public NhanVien getNhanVien() { return nv; }

    @Override public String getId() { return keycloakId; }

    // Keycloak luôn dùng username chữ thường; mã NV gốc nằm ở thuộc tính "manv"
    @Override public String getUsername() { return nv.maNv().toLowerCase(); }
    @Override public void setUsername(String username) { throw new ReadOnlyException("Mã nhân viên chỉ đọc"); }

    @Override public String getFirstName() { return nv.ten(); }
    @Override public String getLastName() { return nv.hoDem(); }
    @Override public String getEmail() { return blankToNull(nv.email()); }
    @Override public boolean isEmailVerified() { return true; }
    // Nhân viên đã nghỉ (isActived = 0) => tài khoản bị vô hiệu hóa, Keycloak từ chối đăng nhập
    // và không cấp token mới (kể cả làm mới token của phiên đang mở).
    @Override public boolean isEnabled() { return nv.dangLamViec(); }
    @Override public void setEnabled(boolean enabled) { throw new ReadOnlyException("Trạng thái làm việc lấy từ isActived, chỉ đọc"); }

    @Override public void setFirstName(String v) { throw new ReadOnlyException("Họ tên chỉ đọc"); }
    @Override public void setLastName(String v) { throw new ReadOnlyException("Họ tên chỉ đọc"); }
    @Override public void setEmail(String v) { throw new ReadOnlyException("Email chỉ đọc"); }

    /** Giá trị đọc từ DB cho các thuộc tính chuẩn và thuộc tính riêng (manv, id_bo_phan). */
    private String dbValue(String name) {
        return switch (name) {
            case UserModel.USERNAME -> getUsername();
            case UserModel.FIRST_NAME -> nv.ten();
            case UserModel.LAST_NAME -> nv.hoDem();
            case UserModel.EMAIL -> blankToNull(nv.email());
            case ATTR_MANV -> nv.maNv();
            case ATTR_BO_PHAN -> blankToNull(nv.idBoPhan());
            default -> null;
        };
    }

    private static boolean isDbAttr(String name) {
        return switch (name) {
            case UserModel.USERNAME, UserModel.FIRST_NAME, UserModel.LAST_NAME, UserModel.EMAIL,
                 ATTR_MANV, ATTR_BO_PHAN -> true;
            default -> false;
        };
    }

    @Override
    public String getFirstAttribute(String name) {
        return isDbAttr(name) ? dbValue(name) : super.getFirstAttribute(name);
    }

    @Override
    public Stream<String> getAttributeStream(String name) {
        if (!isDbAttr(name)) return super.getAttributeStream(name);
        String v = dbValue(name);
        return v == null ? Stream.empty() : Stream.of(v);
    }

    @Override
    public Map<String, List<String>> getAttributes() {
        Map<String, List<String>> attrs = super.getAttributes();
        for (String name : List.of(UserModel.USERNAME, UserModel.FIRST_NAME, UserModel.LAST_NAME,
                UserModel.EMAIL, ATTR_MANV, ATTR_BO_PHAN)) {
            String v = dbValue(name);
            if (v != null) attrs.put(name, List.of(v));
            else attrs.remove(name);
        }
        return attrs;
    }

    @Override
    public void setSingleAttribute(String name, String value) {
        if (isDbAttr(name)) throw new ReadOnlyException("Thuộc tính " + name + " chỉ đọc");
        super.setSingleAttribute(name, value);
    }

    @Override
    public void setAttribute(String name, List<String> values) {
        if (isDbAttr(name)) throw new ReadOnlyException("Thuộc tính " + name + " chỉ đọc");
        super.setAttribute(name, values);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
