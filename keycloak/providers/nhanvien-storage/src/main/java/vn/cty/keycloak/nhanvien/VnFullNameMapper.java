package vn.cty.keycloak.nhanvien;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.keycloak.models.ClientSessionContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ProtocolMapperModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.protocol.oidc.mappers.AbstractOIDCProtocolMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAccessTokenMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAttributeMapperHelper;
import org.keycloak.protocol.oidc.mappers.OIDCIDTokenMapper;
import org.keycloak.protocol.oidc.mappers.UserInfoTokenMapper;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.representations.IDToken;

/**
 * Claim "name" theo thứ tự tiếng Việt: "Họ đệm Tên" (vd "Nguyễn Văn An").
 * Mapper "full name" có sẵn của Keycloak ghép theo kiểu phương Tây ("An Nguyễn Văn");
 * mapper này chạy SAU nó (priority cao hơn) nên ghi đè lại cho đúng.
 */
public class VnFullNameMapper extends AbstractOIDCProtocolMapper
        implements OIDCAccessTokenMapper, OIDCIDTokenMapper, UserInfoTokenMapper {

    public static final String PROVIDER_ID = "cty-vn-full-name-mapper";
    private static final List<ProviderConfigProperty> CONFIG = new ArrayList<>();

    static {
        OIDCAttributeMapperHelper.addIncludeInTokensConfig(CONFIG, VnFullNameMapper.class);
    }

    @Override public String getId() { return PROVIDER_ID; }
    @Override public String getDisplayType() { return "Họ tên kiểu Việt Nam"; }
    @Override public String getDisplayCategory() { return TOKEN_MAPPER_CATEGORY; }
    @Override public String getHelpText() { return "Claim name = họ đệm + tên (lastName firstName)."; }
    @Override public List<ProviderConfigProperty> getConfigProperties() { return CONFIG; }

    /** Chạy sau mapper "full name" có sẵn (priority mặc định 0). */
    @Override public int getPriority() { return 100; }

    @Override
    protected void setClaim(IDToken token, ProtocolMapperModel mapping, UserSessionModel userSession,
                            KeycloakSession session, ClientSessionContext ctx) {
        UserModel user = userSession.getUser();
        String name = Stream.of(user.getLastName(), user.getFirstName())
                .filter(s -> s != null && !s.isBlank())
                .map(String::trim)
                .collect(Collectors.joining(" "));
        if (name.isEmpty()) return;
        // Mapper "full name" có sẵn ghi vào otherClaims (được xuất ra JSON SAU field name nên thắng).
        // Ghi đè ở otherClaims và bỏ field để JSON chỉ còn một key "name".
        token.setName(null);
        token.getOtherClaims().put("name", name);
    }
}
