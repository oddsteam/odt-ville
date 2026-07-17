require "test_helper"

# ADR-0010 (mirrored domain modules) contract: every domain model lives under
# its domain namespace, but the empty `table_name_prefix` keeps the
# pre-namespacing table names — so this is a pure code-organization move with no
# migration and no table rename. Covers the org / auth / communities slice
# (#218) and the maps / viewer / game-session / character / posture slice (#219).
class NamespacingTest < ActiveSupport::TestCase
  test "domain namespaces expose an empty table_name_prefix" do
    assert_equal "", Org.table_name_prefix
    assert_equal "", Auth.table_name_prefix
    assert_equal "", Communities.table_name_prefix
    assert_equal "", Maps.table_name_prefix
    assert_equal "", Viewer.table_name_prefix
    assert_equal "", GameSession.table_name_prefix
    assert_equal "", Character.table_name_prefix
  end

  test "namespaced models keep their original table names" do
    assert_equal "companies", Org::Company.table_name
    assert_equal "users", Auth::User.table_name
    assert_equal "houses", Communities::House.table_name
    assert_equal "boards", Communities::Board.table_name
    assert_equal "content_items", Communities::ContentItem.table_name
    assert_equal "maps", Maps::Map.table_name
    assert_equal "user_content_states", Viewer::UserContentState.table_name
    assert_equal "user_location_states", GameSession::UserLocationState.table_name
    assert_equal "character_manifests", Character::CharacterManifest.table_name
  end

  test "KeycloakAuthenticator lives under the Auth namespace" do
    assert_kind_of Class, Auth::KeycloakAuthenticator
    assert_respond_to Auth::KeycloakAuthenticator, :instance
  end

  test "the posture-login client lives under the Posture namespace" do
    assert_kind_of Class, Posture::Client
    assert_respond_to Posture::Client, :from_env
  end

  test "cross-module associations resolve to the namespaced classes" do
    assert_equal "Auth::User", Org::Company.reflect_on_association(:users).class_name
    assert_equal "Communities::House", Org::Company.reflect_on_association(:houses).class_name
    assert_equal "Org::Company", Auth::User.reflect_on_association(:company).class_name
    assert_equal "Org::Company", Communities::House.reflect_on_association(:company).class_name
    assert_equal "Character::CharacterManifest", Auth::User.reflect_on_association(:character_manifest).class_name
    assert_equal "Viewer::UserContentState", Auth::User.reflect_on_association(:user_content_states).class_name
    assert_equal "GameSession::UserLocationState", Auth::User.reflect_on_association(:user_location_state).class_name
    assert_equal "Auth::User", Viewer::UserContentState.reflect_on_association(:user).class_name
    assert_equal "Communities::ContentItem", Viewer::UserContentState.reflect_on_association(:content_item).class_name
    assert_equal "Viewer::UserContentState", Communities::ContentItem.reflect_on_association(:user_content_states).class_name
    assert_equal "Auth::User", GameSession::UserLocationState.reflect_on_association(:user).class_name
    assert_equal "Org::Company", GameSession::UserLocationState.reflect_on_association(:company).class_name
  end
end
