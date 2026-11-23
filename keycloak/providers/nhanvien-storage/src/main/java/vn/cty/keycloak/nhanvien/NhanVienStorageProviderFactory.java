package vn.cty.keycloak.nhanvien;

import org.jboss.logging.Logger;
import org.keycloak.component.ComponentModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.storage.UserStorageProviderFactory;

/**
 * Đăng ký plugin với Keycloak (providerId = "sync-nhan-vien").
 * Thông số kết nối đọc từ biến môi trường của container Keycloak (đặt trong file .env của sso-demo):
 *   NV_DB_HOST, NV_DB_PORT, NV_DB_USER, NV_DB_PASSWORD, NV_DB_SCHEMA, NV_DB_TABLE
 */
public class NhanVienStorageProviderFactory implements UserStorageProviderFactory<NhanVienStorageProvider> {

    public static final String PROVIDER_ID = "sync-nhan-vien";
    private static final Logger LOG = Logger.getLogger(NhanVienStorageProviderFactory.class);

    private volatile NhanVienRepository repo;

    @Override
    public String getId() { return PROVIDER_ID; }

    @Override
    public String getHelpText() {
        return "Đăng nhập bằng mã nhân viên và mật khẩu trong bảng sync_nhan_vien (chỉ đọc)";
    }

    @Override
    public NhanVienStorageProvider create(KeycloakSession session, ComponentModel model) {
        return new NhanVienStorageProvider(session, model, repo());
    }

    private NhanVienRepository repo() {
        if (repo == null) {
            synchronized (this) {
                if (repo == null) {
                    String host = env("NV_DB_HOST", null);
                    if (host == null) {
                        throw new IllegalStateException("Chưa cấu hình NV_DB_HOST (xem .env.example của sso-demo)");
                    }
                    int port = Integer.parseInt(env("NV_DB_PORT", "3306"));
                    String schema = env("NV_DB_SCHEMA", "sync_data_hi_time_sheet");
                    String table = env("NV_DB_TABLE", "sync_nhan_vien");
                    repo = new NhanVienRepository(host, port, env("NV_DB_USER", ""), env("NV_DB_PASSWORD", ""),
                            schema, table);
                    LOG.infof("sync-nhan-vien: đọc nhân viên từ %s:%d %s.%s", host, port, schema, table);
                }
            }
        }
        return repo;
    }

    private static String env(String name, String def) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? def : v.trim();
    }
}
