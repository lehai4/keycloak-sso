package vn.cty.keycloak.nhanvien;

import java.util.Map;
import java.util.stream.Stream;

import org.jboss.logging.Logger;
import org.keycloak.component.ComponentModel;
import org.keycloak.credential.CredentialInput;
import org.keycloak.credential.CredentialInputValidator;
import org.keycloak.models.GroupModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.credential.PasswordCredentialModel;
import org.keycloak.storage.StorageId;
import org.keycloak.storage.UserStorageProvider;
import org.keycloak.storage.user.UserLookupProvider;
import org.keycloak.storage.user.UserQueryProvider;
import org.mindrot.jbcrypt.BCrypt;

/**
 * Cho Keycloak tìm nhân viên và kiểm tra mật khẩu trực tiếp trong bảng sync_nhan_vien.
 * Không sao chép mật khẩu sang Keycloak: mỗi lần đăng nhập đều so bcrypt với giá trị mới nhất trong DB.
 */
public class NhanVienStorageProvider
        implements UserStorageProvider, UserLookupProvider, CredentialInputValidator, UserQueryProvider {

    private static final Logger LOG = Logger.getLogger(NhanVienStorageProvider.class);

    private final KeycloakSession session;
    private final ComponentModel model;
    private final NhanVienRepository repo;

    public NhanVienStorageProvider(KeycloakSession session, ComponentModel model, NhanVienRepository repo) {
        this.session = session;
        this.model = model;
        this.repo = repo;
    }

    // ---------- Tìm user ----------

    @Override
    public UserModel getUserById(RealmModel realm, String id) {
        return getUserByUsername(realm, StorageId.externalId(id));
    }

    @Override
    public UserModel getUserByUsername(RealmModel realm, String username) {
        try {
            return repo.findByMaNv(username).map(nv -> adapter(realm, nv)).orElse(null);
        } catch (RuntimeException e) {
            // DB lỗi: ghi log rõ ràng, không làm sập trang đăng nhập (tài khoản cục bộ vẫn dùng được)
            LOG.errorf(e, "sync-nhan-vien: không đọc được DB khi tìm %s", username);
            return null;
        }
    }

    @Override
    public UserModel getUserByEmail(RealmModel realm, String email) {
        try {
            return repo.findByEmail(email).map(nv -> adapter(realm, nv)).orElse(null);
        } catch (RuntimeException e) {
            LOG.errorf(e, "sync-nhan-vien: không đọc được DB khi tìm email %s", email);
            return null;
        }
    }

    private UserModel adapter(RealmModel realm, NhanVien nv) {
        return new NhanVienUserAdapter(session, realm, model, nv);
    }

    // ---------- Kiểm tra mật khẩu ----------

    @Override
    public boolean supportsCredentialType(String credentialType) {
        return PasswordCredentialModel.TYPE.equals(credentialType);
    }

    @Override
    public boolean isConfiguredFor(RealmModel realm, UserModel user, String credentialType) {
        return supportsCredentialType(credentialType);
    }

    @Override
    public boolean isValid(RealmModel realm, UserModel user, CredentialInput input) {
        if (!supportsCredentialType(input.getType()) || !(user instanceof NhanVienUserAdapter nvUser)) return false;
        String raw = input.getChallengeResponse();
        if (raw == null || raw.isEmpty()) return false;

        String maNv = nvUser.getNhanVien().maNv();
        try {
            String hash = repo.findPasswordHash(maNv).orElse(null);
            if (hash == null || hash.isBlank()) return false;
            return BCrypt.checkpw(raw, normalizeBcrypt(hash));
        } catch (IllegalArgumentException e) {
            LOG.warnf("sync-nhan-vien: mật khẩu của %s không phải bcrypt hợp lệ", maNv);
            return false;
        } catch (RuntimeException e) {
            LOG.errorf(e, "sync-nhan-vien: không đọc được DB khi kiểm tra mật khẩu %s", maNv);
            return false;
        }
    }

    /**
     * Thư viện bcrypt của Node tạo mã "$2b$...", PHP tạo "$2y$...", jBCrypt chỉ đọc "$2a$...".
     * Ba loại này cùng thuật toán (chỉ khác ở lỗi hiếm với mật khẩu > 255 ký tự), nên đổi tiền tố là đủ.
     */
    static String normalizeBcrypt(String hash) {
        if (hash.startsWith("$2b$") || hash.startsWith("$2y$")) return "$2a$" + hash.substring(4);
        return hash;
    }

    // ---------- Tìm kiếm cho trang quản trị (Users) ----------

    @Override
    public Stream<UserModel> searchForUserStream(RealmModel realm, Map<String, String> params, Integer first, Integer max) {
        String term = params.getOrDefault(UserModel.SEARCH,
                params.getOrDefault(UserModel.USERNAME, params.getOrDefault(UserModel.FIRST_NAME, "")));
        int f = first == null || first < 0 ? 0 : first;
        int m = max == null || max < 0 ? 100 : Math.min(max, 500);
        try {
            return repo.search(term, f, m).stream().map(nv -> adapter(realm, nv));
        } catch (RuntimeException e) {
            LOG.errorf(e, "sync-nhan-vien: không đọc được DB khi tìm kiếm");
            return Stream.empty();
        }
    }

    // Keycloak có nhiều hàm đếm; bản mặc định đếm bằng cách tìm kiếm (bị giới hạn 100) => tự đếm bằng SQL.
    @Override
    public int getUsersCount(RealmModel realm) {
        return countSafe("");
    }

    @Override
    public int getUsersCount(RealmModel realm, boolean includeServiceAccount) {
        return countSafe("");
    }

    @Override
    public int getUsersCount(RealmModel realm, String search) {
        return countSafe(search);
    }

    @Override
    public int getUsersCount(RealmModel realm, Map<String, String> params) {
        return countSafe(params.getOrDefault(UserModel.SEARCH,
                params.getOrDefault(UserModel.USERNAME, params.getOrDefault(UserModel.FIRST_NAME, ""))));
    }

    private int countSafe(String term) {
        try {
            return repo.count(term);
        } catch (RuntimeException e) {
            LOG.errorf(e, "sync-nhan-vien: không đọc được DB khi đếm");
            return 0;
        }
    }

    @Override
    public Stream<UserModel> getGroupMembersStream(RealmModel realm, GroupModel group, Integer first, Integer max) {
        return Stream.empty(); // không dùng nhóm
    }

    @Override
    public Stream<UserModel> searchForUserByUserAttributeStream(RealmModel realm, String attrName, String attrValue) {
        if (NhanVienUserAdapter.ATTR_MANV.equals(attrName)) {
            return repo.findByMaNv(attrValue).stream().map(nv -> adapter(realm, nv));
        }
        return Stream.empty();
    }

    @Override
    public void close() { }
}
