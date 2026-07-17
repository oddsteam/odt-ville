require "test_helper"

# ADR-0010 (mirrored domain modules) contract for the org / auth / communities
# slice (#218): the models live under their domain namespace, but the empty
# `table_name_prefix` keeps the pre-namespacing table names — so this is a pure
# code-organization move with no migration and no table rename.
class NamespacingTest < ActiveSupport::TestCase
  test "domain namespaces expose an empty table_name_prefix" do
    assert_equal "", Org.table_name_prefix
    assert_equal "", Auth.table_name_prefix
    assert_equal "", Communities.table_name_prefix
  end

  test "namespaced models keep their original table names" do
    assert_equal "companies", Org::Company.table_name
    assert_equal "users", Auth::User.table_name
    assert_equal "houses", Communities::House.table_name
    assert_equal "boards", Communities::Board.table_name
    assert_equal "content_items", Communities::ContentItem.table_name
  end

  test "KeycloakAuthenticator lives under the Auth namespace" do
    assert_kind_of Class, Auth::KeycloakAuthenticator
    assert_respond_to Auth::KeycloakAuthenticator, :instance
  end

  test "cross-module associations resolve to the namespaced classes" do
    assert_equal "Auth::User", Org::Company.reflect_on_association(:users).class_name
    assert_equal "Communities::House", Org::Company.reflect_on_association(:houses).class_name
    assert_equal "Org::Company", Auth::User.reflect_on_association(:company).class_name
    assert_equal "Org::Company", Communities::House.reflect_on_association(:company).class_name
    assert_equal "Auth::User", UserContentState.reflect_on_association(:user).class_name
    assert_equal "Communities::ContentItem", UserContentState.reflect_on_association(:content_item).class_name
  end
end
